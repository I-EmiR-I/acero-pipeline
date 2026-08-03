import fs from 'node:fs/promises';
import path from 'node:path';
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers,
} from '@whiskeysockets/baileys';
import type { WASocket } from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { registrarMensaje } from './monitor';
import { procesarComando } from './comandos';
import { obtenerEstado, DATA_DIR } from './estado';

// La sesión de WhatsApp vive en el volumen persistente (junto a estado.json) para sobrevivir redeploys.
const AUTH_DIR = path.join(DATA_DIR, 'auth');

type Conexion = 'iniciando' | 'esperando_qr' | 'esperando_codigo' | 'conectado' | 'desconectado' | 'error';

let conexion: Conexion = 'iniciando';
let qrDataUrl: string | null = null;
let pairingCode: string | null = null;
let telefonoPairing: string | null = null; // si está puesto, se vincula por código en vez de QR
let ultimoError: string | null = null;
let sock: WASocket | null = null;
let generacion = 0; // identifica el socket vigente; eventos de sockets viejos se ignoran
let reconexionProgramada = false;
let pairingSolicitado = false;
const nombresGrupos = new Map<string, string>();
/** IDs de mensajes que el propio bot envió, para no reaccionar a sus propias respuestas. */
const enviadosPorBot = new Set<string>();

export function estadoWhatsApp() {
  return { conexion, qr: qrDataUrl, pairing: pairingCode, error: ultimoError };
}

/** Vincula con código de teléfono (más confiable que el QR). El número va con lada, ej. 5218112446576. */
export async function vincularConTelefono(telefono: string): Promise<void> {
  telefonoPairing = telefono.replace(/\D/g, '');
  pairingCode = null;
  qrDataUrl = null;
  ultimoError = null;
  try {
    await fs.rm(AUTH_DIR, { recursive: true, force: true }); // sesión nueva
  } catch {
    /* no existía */
  }
  await iniciarWhatsApp();
}

/** Envía un mensaje de texto a un grupo/chat y recuerda su id para no procesarlo de vuelta. */
export async function enviarMensaje(jid: string, texto: string): Promise<void> {
  if (!sock || conexion !== 'conectado') {
    console.log(`[whatsapp] (sin conexión, no se envió) → ${jid}: ${texto.slice(0, 60)}`);
    return;
  }
  try {
    const enviado = await sock.sendMessage(jid, { text: texto });
    if (enviado?.key?.id) enviadosPorBot.add(enviado.key.id);
  } catch (err) {
    console.error('[whatsapp] Error al enviar:', err);
  }
}

/** Envía un documento (PDF) a un grupo/chat. */
export async function enviarDocumento(
  jid: string,
  buffer: Buffer,
  fileName: string,
  caption?: string
): Promise<void> {
  if (!sock || conexion !== 'conectado') {
    console.log(`[whatsapp] (sin conexión, no se envió documento) → ${jid}: ${fileName}`);
    return;
  }
  try {
    const enviado = await sock.sendMessage(jid, {
      document: buffer,
      mimetype: 'application/pdf',
      fileName,
      caption,
    });
    if (enviado?.key?.id) enviadosPorBot.add(enviado.key.id);
  } catch (err) {
    console.error('[whatsapp] Error al enviar documento:', err);
  }
}

function extraerTexto(msg: unknown): string | null {
  const m = msg as {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    imageMessage?: { caption?: string };
    documentMessage?: { caption?: string };
  } | null;
  return (
    m?.conversation ??
    m?.extendedTextMessage?.text ??
    m?.imageMessage?.caption ??
    m?.documentMessage?.caption ??
    null
  );
}

async function nombreGrupo(jid: string): Promise<string> {
  const cacheado = nombresGrupos.get(jid);
  if (cacheado) return cacheado;
  try {
    const meta = await sock!.groupMetadata(jid);
    nombresGrupos.set(jid, meta.subject);
    return meta.subject;
  } catch {
    return jid;
  }
}

function programarReconexion(ms: number) {
  if (reconexionProgramada) return;
  reconexionProgramada = true;
  setTimeout(() => {
    reconexionProgramada = false;
    void iniciarWhatsApp();
  }, ms);
}

export async function iniciarWhatsApp(): Promise<void> {
  const miGeneracion = ++generacion;
  pairingSolicitado = false;
  try {
    if (sock) {
      try {
        sock.end(undefined);
      } catch {
        /* socket viejo ya muerto */
      }
      sock = null;
    }
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();
    const usarPairing = !!telefonoPairing && !state.creds.registered;
    console.log(`[whatsapp] Iniciando (protocolo WA Web v${version.join('.')})${usarPairing ? ' — vinculación por código' : ''}`);
    const s = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      browser: usarPairing ? Browsers.ubuntu('Chrome') : Browsers.windows('Chrome'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });
    sock = s;

    s.ev.on('creds.update', saveCreds);

    // Vinculación por código de teléfono: se pide una vez, poco después de crear el socket.
    if (usarPairing) {
      setTimeout(async () => {
        if (miGeneracion !== generacion || pairingSolicitado) return;
        pairingSolicitado = true;
        try {
          const code = await s.requestPairingCode(telefonoPairing!);
          pairingCode = code.match(/.{1,4}/g)?.join('-') ?? code;
          conexion = 'esperando_codigo';
          console.log(`[whatsapp] Código de vinculación: ${pairingCode}`);
        } catch (e) {
          ultimoError = 'No se pudo generar el código: ' + (e instanceof Error ? e.message : String(e));
          console.error('[whatsapp] Error al pedir código:', e);
        }
      }, 3000);
    }

    s.ev.on('connection.update', async (u) => {
      if (miGeneracion !== generacion) return; // evento de un socket viejo
      if (u.qr && !telefonoPairing) {
        conexion = 'esperando_qr';
        qrDataUrl = await QRCode.toDataURL(u.qr, { margin: 1, width: 300 });
        console.log('[whatsapp] QR nuevo generado (caduca en ~60 s, escanéalo pronto)');
      }
      if (u.connection === 'open') {
        conexion = 'conectado';
        qrDataUrl = null;
        pairingCode = null;
        ultimoError = null;
        console.log('[whatsapp] Conectado.');
      }
      if (u.connection === 'close') {
        const code = (u.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
          ?.output?.statusCode;
        console.log(`[whatsapp] Conexión cerrada (código ${code ?? 'desconocido'})`);
        if (code === DisconnectReason.loggedOut) {
          conexion = 'desconectado';
          qrDataUrl = null;
          ultimoError = 'Sesión cerrada desde el teléfono. Borra la carpeta server/auth y reinicia el servidor para volver a escanear.';
        } else if (code === DisconnectReason.restartRequired) {
          // Normal justo después de escanear el QR: WhatsApp pide reiniciar el socket.
          console.log('[whatsapp] Reinicio requerido tras vincular; reconectando…');
          programarReconexion(500);
        } else {
          conexion = 'iniciando';
          qrDataUrl = null;
          programarReconexion(4000);
        }
      }
    });

    s.ev.on('messages.upsert', async ({ messages, type }) => {
      if (miGeneracion !== generacion) return;
      // 'notify' = mensajes nuevos de otros; 'append' = suele ser tus propios envíos desde el teléfono.
      // Aceptamos ambos para que funcione un grupo donde solo estás tú (la cuenta vinculada).
      if (type !== 'notify' && type !== 'append') return;
      const grupoComandos = obtenerEstado().config.grupoComandosJid;
      const ahoraSeg = Math.floor(Date.now() / 1000);
      for (const m of messages) {
        const jid = m.key.remoteJid;
        if (!jid || !jid.endsWith('@g.us')) continue; // solo grupos
        if (m.key.id && enviadosPorBot.has(m.key.id)) continue; // no reaccionar a lo que envió el bot
        // Ignora historial viejo que llega al reconectar (evita reprocesar mensajes de hace rato).
        const ts = typeof m.messageTimestamp === 'number' ? m.messageTimestamp : Number(m.messageTimestamp ?? 0);
        if (ts && ahoraSeg - ts > 120) continue;
        const texto = extraerTexto(m.message);
        if (!texto) continue;

        // Grupo dedicado de comandos: dictado de órdenes de compra.
        if (grupoComandos && jid === grupoComandos) {
          const r = await procesarComando(jid, texto);
          if (r?.texto) await enviarMensaje(jid, r.texto);
          if (r?.pdf) {
            console.log(`[whatsapp] enviando OC en PDF → ${r.pdf.fileName}`);
            await enviarDocumento(jid, r.pdf.buffer, r.pdf.fileName, r.pdf.caption);
          }
          continue; // el grupo de comandos no alimenta al monitor de cotizaciones
        }

        // fromMe = lo escribió el número vinculado (el área de compras). Lo incluimos:
        // sin sus mensajes el bot solo vería la mitad de la negociación.
        const de = m.key.fromMe ? 'Compras' : m.pushName || m.key.participant || 'proveedor';
        const nombre = await nombreGrupo(jid);
        console.log(`[whatsapp] ${nombre} | ${de}: ${texto.slice(0, 80)}`);
        registrarMensaje(jid, nombre, de, texto);
      }
    });
  } catch (err) {
    conexion = 'error';
    ultimoError = err instanceof Error ? err.message : String(err);
    console.error('[whatsapp] Error al iniciar:', err);
    programarReconexion(8000);
  }
}
