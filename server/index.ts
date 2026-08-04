import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Accion } from '../src/logic/reducer';
import { despachar, obtenerEstado, DATA_DIR } from './estado';
import { estadoWhatsApp, iniciarWhatsApp, vincularConTelefono, usarModoQR } from './whatsapp';
import { listarGrupos, mensajesGrupo, registrarMensaje } from './monitor';
import { procesarComando } from './comandos';
import { extraerLineas } from './extractor';
import { getEmpresa } from './empresa';

config({ path: '.env.local' });

const dir = path.dirname(fileURLToPath(import.meta.url));
const PUERTO = Number(process.env.PORT) || 8787;
const PROD = process.env.NODE_ENV === 'production';
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || 'acero-pipeline-dev-secret';

const app = express();
app.use(express.json());

// ---- Autenticación por contraseña compartida (cookie) ----
function tokenEsperado(): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(APP_PASSWORD).digest('hex');
}
function parseCookies(header?: string): Record<string, string> {
  const out: Record<string, string> = {};
  (header ?? '').split(';').forEach((c) => {
    const i = c.indexOf('=');
    if (i > -1) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}

app.post('/api/login', (req, res) => {
  const { password } = req.body as { password?: string };
  if (!APP_PASSWORD || password === APP_PASSWORD) {
    // Secure solo si la conexión es realmente HTTPS (Railway lo es; local por HTTP no).
    const esHttps = req.headers['x-forwarded-proto'] === 'https' || req.secure;
    const secure = esHttps ? '; Secure' : '';
    res.setHeader(
      'Set-Cookie',
      `sesion=${tokenEsperado()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}`
    );
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Contraseña incorrecta' });
  }
});

// Protege todo /api salvo el login. Si no hay APP_PASSWORD configurada, queda abierto (solo local).
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  if (!APP_PASSWORD || req.path === '/login') return next();
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.sesion === tokenEsperado()) return next();
  res.status(401).json({ error: 'No autorizado' });
});

// ---- API ----
app.get('/api/estado', (_req, res) => {
  res.json(obtenerEstado());
});

app.get('/api/empresa', (_req, res) => {
  res.json(getEmpresa());
});

app.post('/api/accion', (req, res) => {
  const accion = req.body as Accion;
  if (!accion?.tipo) {
    res.status(400).json({ error: 'Acción inválida' });
    return;
  }
  res.json(despachar(accion));
});

app.post('/api/llm/extraer-lineas', async (req, res) => {
  const { texto } = req.body as { texto?: string };
  if (!texto) {
    res.status(400).json({ error: 'Falta texto' });
    return;
  }
  try {
    res.json({ lineas: await extraerLineas(texto) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'error' });
  }
});

app.get('/api/whatsapp/estado', (_req, res) => {
  res.json({ ...estadoWhatsApp(), grupos: listarGrupos() });
});

app.get('/api/whatsapp/grupo/mensajes', (req, res) => {
  const jid = String(req.query.jid ?? '');
  res.json({ mensajes: mensajesGrupo(jid) });
});

app.post('/api/whatsapp/pair', async (req, res) => {
  const { telefono } = req.body as { telefono?: string };
  const limpio = (telefono ?? '').replace(/\D/g, '');
  if (limpio.length < 10) {
    res.status(400).json({ error: 'Número inválido. Usa lada + número, ej. 528112446576.' });
    return;
  }
  await vincularConTelefono(limpio);
  res.json({ ok: true });
});

app.post('/api/whatsapp/qr', async (_req, res) => {
  await usarModoQR();
  res.json({ ok: true });
});

// ---- Endpoints de prueba (solo si ENABLE_DEV=1; nunca en producción) ----
if (process.env.ENABLE_DEV === '1') {
  app.post('/api/dev/mensaje', async (req, res) => {
    const { grupo, de, texto, analizar } = req.body as {
      grupo?: string;
      de?: string;
      texto?: string;
      analizar?: boolean;
    };
    if (!grupo || !de || !texto) {
      res.status(400).json({ error: 'Faltan grupo, de o texto' });
      return;
    }
    await registrarMensaje(`sim:${grupo}`, grupo, de, texto, { inmediato: analizar === true });
    res.json({ ok: true, sugerencias: obtenerEstado().sugerencias.length });
  });

  app.post('/api/dev/comando', async (req, res) => {
    const { texto, guardarPdf } = req.body as { texto?: string; guardarPdf?: boolean };
    if (!texto) {
      res.status(400).json({ error: 'Falta texto' });
      return;
    }
    const r = await procesarComando('sim:comandos', texto);
    let pdfInfo: { fileName: string; bytes: number; ruta?: string } | null = null;
    if (r?.pdf) {
      pdfInfo = { fileName: r.pdf.fileName, bytes: r.pdf.buffer.length };
      if (guardarPdf) {
        const ruta = path.join(DATA_DIR, r.pdf.fileName);
        fs.writeFileSync(ruta, r.pdf.buffer);
        pdfInfo.ruta = ruta;
      }
    }
    res.json({ respuesta: r?.texto ?? null, pdf: pdfInfo });
  });
}

// ---- Frontend compilado (producción) ----
const DIST = path.join(dir, '..', 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  // Catch-all (Express 5): middleware final, sin patrón de ruta, para servir la SPA.
  app.use((req, res) => {
    if (req.path.startsWith('/api')) {
      res.status(404).json({ error: 'No encontrado' });
      return;
    }
    res.sendFile(path.join(DIST, 'index.html'));
  });
}

app.listen(PUERTO, () => {
  console.log(`[api] Servidor en puerto ${PUERTO}${PROD ? ' (producción)' : ''}`);
  if (PROD && !APP_PASSWORD) console.warn('[api] ⚠ APP_PASSWORD no configurada: la app queda SIN login.');
  void iniciarWhatsApp();
});
