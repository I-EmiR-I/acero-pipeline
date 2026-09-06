// Cerebro de PuenteAcero-Precios: consulta la API cloud de precios (Flask + Gemini)
// desde el MISMO canal de WhatsApp que usa el bot de OC. Cada grupo tiene su cerebro:
//  - grupos de OC (comandos / proveedores) -> lógica local de acero-pipeline
//  - grupo "precios"                        -> esta API externa
// Configuración por variables de entorno (Railway -> servicio acero-pipeline):
//   PRECIOS_API_URL      (default: https://web-production-53554c.up.railway.app/api/chat)
//   PRECIOS_API_TOKEN    token X-API-Key de esa API (obligatoria: la API la exige)
//   PRECIOS_GRUPO_NOMBRE (default: "precios")
//   PRECIOS_TIMEOUT_MS   (default: 45000 — Gemini + tools es lento)

const API_URL =
  process.env.PRECIOS_API_URL || 'https://web-production-53554c.up.railway.app/api/chat';
const API_TOKEN = process.env.PRECIOS_API_TOKEN || '';
const GRUPO_PRECIOS = (process.env.PRECIOS_GRUPO_NOMBRE || 'precios').trim().toLowerCase();
const TIMEOUT_MS = Number(process.env.PRECIOS_TIMEOUT_MS || 45000);

export function esGrupoPrecios(nombreGrupo: string): boolean {
  return nombreGrupo.trim().toLowerCase() === GRUPO_PRECIOS;
}

const TEXTO_ERROR =
  'Ocurrió un detalle técnico al consultar el catálogo. Por favor reintenta en un momento.';

/** Consulta el cerebro de precios y devuelve el texto listo para enviar a WhatsApp. */
export async function consultarPrecios(message: string): Promise<string> {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (API_TOKEN) headers['X-API-Key'] = API_TOKEN;
    const res = await fetch(API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, group: GRUPO_PRECIOS }),
      signal: control.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.error(`[precios] API respondió ${res.status}`);
      return TEXTO_ERROR;
    }
    const data = (await res.json()) as { reply?: string };
    const reply = (data.reply || 'NO ENCONTRADO').trim();
    // WhatsApp corta mensajes muy largos; la lista de precios suele ser corta, pero por seguridad:
    return reply.length > 3900 ? `${reply.slice(0, 3900)}…` : reply;
  } catch (err) {
    clearTimeout(timer);
    console.error('[precios] Error consultando la API:', err instanceof Error ? err.message : err);
    return TEXTO_ERROR;
  }
}
