import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import express from 'express';
import type { Accion } from '../src/logic/reducer';
import { despachar, obtenerEstado } from './estado';
import { estadoWhatsApp, iniciarWhatsApp, vincularConTelefono } from './whatsapp';
import { listarGrupos, mensajesGrupo, registrarMensaje } from './monitor';
import { procesarComando } from './comandos';

config({ path: '.env.local' });

const PUERTO = 8787;
const app = express();
app.use(express.json());

app.get('/api/estado', (_req, res) => {
  res.json(obtenerEstado());
});

app.post('/api/accion', (req, res) => {
  const accion = req.body as Accion;
  if (!accion?.tipo) {
    res.status(400).json({ error: 'Acción inválida' });
    return;
  }
  res.json(despachar(accion));
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

/** Simulador para pruebas sin WhatsApp: inyecta un mensaje como si viniera de un grupo. */
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

/** Simulador del grupo de comandos: procesa un texto como si llegara por WhatsApp y devuelve la respuesta del bot. */
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
      const dir = path.dirname(fileURLToPath(import.meta.url));
      const ruta = path.join(dir, r.pdf.fileName);
      fs.writeFileSync(ruta, r.pdf.buffer);
      pdfInfo.ruta = ruta;
    }
  }
  res.json({ respuesta: r?.texto ?? null, pdf: pdfInfo });
});

app.listen(PUERTO, () => {
  console.log(`[api] Servidor en http://localhost:${PUERTO}`);
  void iniciarWhatsApp();
});
