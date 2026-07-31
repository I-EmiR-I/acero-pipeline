import type { MensajeWA } from '../src/types';
import { clasificar } from './clasificador';
import type { LeadContexto } from './clasificador';
import { despachar, obtenerEstado } from './estado';

const MAX_MENSAJES = 25;
const DEBOUNCE_MS = 12_000;

/**
 * Interruptor de la detección automática de cotizaciones (leads sugeridos por IA).
 * Desactivado por ahora: la prioridad es solo el bot de órdenes de compra por WhatsApp.
 * Ponlo en true para reactivar las sugerencias automáticas.
 */
const DETECCION_AUTOMATICA = false;

interface Grupo {
  jid: string;
  nombre: string;
  mensajes: MensajeWA[];
  timer?: NodeJS.Timeout;
  totalRecibidos: number;
}

const grupos = new Map<string, Grupo>();

export function listarGrupos() {
  return [...grupos.values()].map((g) => ({
    jid: g.jid,
    nombre: g.nombre,
    mensajes: g.totalRecibidos,
  }));
}

export function mensajesGrupo(jid: string): MensajeWA[] {
  return grupos.get(jid)?.mensajes ?? [];
}

export function registrarMensaje(
  jid: string,
  nombreGrupo: string,
  de: string,
  texto: string,
  opciones?: { inmediato?: boolean }
): Promise<void> | void {
  let g = grupos.get(jid);
  if (!g) {
    g = { jid, nombre: nombreGrupo, mensajes: [], totalRecibidos: 0 };
    grupos.set(jid, g);
  }
  g.nombre = nombreGrupo || g.nombre;
  g.totalRecibidos += 1;
  g.mensajes.push({ de, texto, fecha: new Date().toISOString() });
  if (g.mensajes.length > MAX_MENSAJES) g.mensajes = g.mensajes.slice(-MAX_MENSAJES);

  // El grupo queda registrado (para el selector del panel), pero sin IA si está desactivada.
  if (!DETECCION_AUTOMATICA) return;

  if (opciones?.inmediato) {
    if (g.timer) clearTimeout(g.timer);
    return analizarGrupo(g);
  }
  if (g.timer) clearTimeout(g.timer);
  g.timer = setTimeout(() => {
    void analizarGrupo(g!);
  }, DEBOUNCE_MS);
}

const ETAPA_CERRADA = 'cerrado';

async function analizarGrupo(g: Grupo): Promise<void> {
  try {
    const estado = obtenerEstado();
    const pendientes = estado.sugerencias.filter((s) => s.grupoJid === g.jid);
    const leadsAbiertos: LeadContexto[] = estado.leads
      .filter((l) => l.grupoJid === g.jid && l.etapa !== ETAPA_CERRADA)
      .map((l) => ({
        leadId: l.id,
        cliente: l.cliente,
        etapa: l.etapa,
        tienePrecio: l.cotizaciones.length > 0,
        lineas: l.lineas.map((x) => ({ producto: x.producto, cantidad: x.cantidad, unidad: x.unidad })),
      }));

    const det = await clasificar(g.nombre, g.mensajes, pendientes, leadsAbiertos);
    if (!det || det.relacion === 'ninguna' || det.lineas.length === 0) return;

    const esActualizar = det.relacion === 'actualizar' && !!det.leadId;

    // Evita duplicar: si ya hay una sugerencia pendiente para el mismo lead, no crees otra.
    if (esActualizar && pendientes.some((s) => s.tipo === 'actualizar' && s.leadId === det.leadId)) {
      console.log(`[monitor] Ya hay sugerencia de actualización pendiente para lead ${det.leadId}; se omite.`);
      return;
    }

    despachar({
      tipo: 'agregar_sugerencia',
      sugerencia: {
        grupo: g.nombre,
        grupoJid: g.jid,
        proveedor: g.nombre,
        resumen: det.resumen,
        cliente: det.cliente || undefined,
        lineas: det.lineas,
        mensajes: [...g.mensajes.slice(-10)],
        tipo: esActualizar ? 'actualizar' : 'crear',
        leadId: esActualizar ? det.leadId : undefined,
        cambio: det.cambio,
      },
    });
    console.log(
      `[monitor] Sugerencia (${esActualizar ? 'actualizar lead ' + det.leadId : 'nuevo'}) del grupo "${g.nombre}": ${det.resumen}`
    );
  } catch (err) {
    console.error('[monitor] Error clasificando:', err);
  }
}
