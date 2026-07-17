import 'dotenv/config';
import { config } from 'dotenv';
import express from 'express';
import type { Accion } from '../src/logic/reducer';
import { despachar, obtenerEstado } from './estado';
import { estadoWhatsApp, iniciarWhatsApp } from './whatsapp';
import { listarGrupos, registrarMensaje } from './monitor';

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

app.listen(PUERTO, () => {
  console.log(`[api] Servidor en http://localhost:${PUERTO}`);
  void iniciarWhatsApp();
});
