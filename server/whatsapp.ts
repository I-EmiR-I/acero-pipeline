import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

const dir = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(dir, 'auth');

type Conexion = 'iniciando' | 'esperando_qr' | 'conectado' | 'desconectado' | 'error';

let conexion: Conexion = 'iniciando';
let qrDataUrl: string | null = null;
let ultimoError: string | null = null;
let sock: WASocket | null = null;
let generacion = 0; // identifica el socket vigente; eventos de sockets viejos se ignoran
let reconexionProgramada = false;
const nombresGrupos = new Map<string, string>();

export function estadoWhatsApp() {
  return { conexion, qr: qrDataUrl, error: ultimoError };
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
    console.log(`[whatsapp] Iniciando (protocolo WA Web v${version.join('.')})`);
    const s = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      browser: Browsers.windows('Chrome'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });
    sock = s;

    s.ev.on('creds.update', saveCreds);

    s.ev.on('connection.update', async (u) => {
      if (miGeneracion !== generacion) return; // evento de un socket viejo
      if (u.qr) {
        conexion = 'esperando_qr';
        qrDataUrl = await QRCode.toDataURL(u.qr, { margin: 1, width: 300 });
        console.log('[whatsapp] QR nuevo generado (caduca en ~60 s, escanéalo pronto)');
      }
      if (u.connection === 'open') {
        conexion = 'conectado';
        qrDataUrl = null;
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
      if (type !== 'notify') return;
      for (const m of messages) {
        const jid = m.key.remoteJid;
        if (!jid || !jid.endsWith('@g.us')) continue; // solo grupos
        const texto = extraerTexto(m.message);
        if (!texto) continue;
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
