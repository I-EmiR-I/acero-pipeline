import type { Proveedor } from '../src/types';
import { despachar, obtenerEstado } from './estado';
import { interpretarOrden, modificarOrden } from './extractor';
import type { LineaDictada } from './extractor';
import { generarOCPdf } from './ocpdf';
import { emparejarProveedor } from './matchProveedor';

export interface RespuestaComando {
  texto?: string;
  pdf?: { buffer: Buffer; fileName: string; caption: string };
}

const money = (n: number) =>
  n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });

interface Pendiente {
  proveedor: Proveedor;
  lineas: LineaDictada[];
  creado: number;
}

const pendientes = new Map<string, Pendiente>();
const VENCE_MS = 10 * 60 * 1000; // una confirmación pendiente expira en 10 min

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Palabras que indican intención de modificar (para no llamar a la IA con charla suelta). */
const REGEX_MODIFICA = /\d|quita|elimina|borra|sin |cambia|ajusta|agrega|añade|pon |mejor/i;

function resumenOrden(proveedor: Proveedor, lineas: LineaDictada[]): string {
  const detalle = lineas
    .map((l) => `• ${l.cantidad} ${l.unidad} — ${l.producto}  (${money(l.precioUnitario)}/kg)`)
    .join('\n');
  return (
    `📝 Revisa esta solicitud para *${proveedor.nombre}*:\n${detalle}\n\n` +
    `Responde *CONFIRMAR* para generar la orden o *CANCELAR* para descartarla.\n` +
    `_Tip: también puedes agregar o cambiar materiales con solo dictarlos aquí — ej. "agrega 100 kg de solera a 40" o "cambia la varilla a 17"._`
  );
}

/**
 * Procesa un mensaje del grupo de comandos.
 * Devuelve texto (y a veces un PDF) que el bot debe enviar, o null si el mensaje no es un comando.
 */
export async function procesarComando(jid: string, texto: string): Promise<RespuestaComando | null> {
  const t = norm(texto);

  // Confirmar / cancelar una orden pendiente.
  if (t === 'confirmar' || t === 'si' || t === 'ok') {
    const pend = pendientes.get(jid);
    if (!pend) return { texto: 'No hay ninguna orden pendiente de confirmar. Dicta una: OC Aceros del Norte: 200 PTR a 23.5' };
    if (Date.now() - pend.creado > VENCE_MS) {
      pendientes.delete(jid);
      return { texto: 'La orden pendiente expiró. Vuelve a dictarla.' };
    }
    pendientes.delete(jid);
    const estado = despachar({
      tipo: 'crear_oc_directa',
      proveedor: {
        nombre: pend.proveedor.nombre,
        rfc: pend.proveedor.rfc,
        domicilio: pend.proveedor.domicilio,
        colonia: pend.proveedor.colonia,
        localidad: pend.proveedor.localidad,
        municipio: pend.proveedor.municipio,
        estado: pend.proveedor.estado,
        pais: pend.proveedor.pais,
      },
      noProveedor: pend.proveedor.noProveedor,
      condicionesPago: pend.proveedor.condicionesPago,
      lineas: pend.lineas.map((l) => ({
        producto: l.producto,
        cantidad: l.cantidad,
        unidad: l.unidad,
        precioUnitario: l.precioUnitario,
      })),
      actor: 'Compras (WhatsApp)',
    });
    const oc = estado.ocsDirectas[0];
    try {
      const buffer = await generarOCPdf(oc);
      return {
        pdf: {
          buffer,
          fileName: `OC-${oc.folio}-${pend.proveedor.nombre.replace(/[^\w]+/g, '_')}.pdf`,
          caption: `✅ Orden de compra ${oc.folio} para ${pend.proveedor.nombre}.`,
        },
      };
    } catch (err) {
      console.error('[comandos] Error generando PDF:', err);
      return { texto: `✅ Orden ${oc.folio} creada. (No pude generar el PDF; ábrela en la app.)` };
    }
  }

  if (t === 'cancelar' || t === 'no') {
    if (pendientes.delete(jid)) return { texto: 'Orden cancelada. No se creó nada.' };
    return null;
  }

  // Si ya hay una orden pendiente, un mensaje con intención de modificar la ajusta (agregar/quitar/cambiar).
  const pendActual = pendientes.get(jid);
  if (pendActual && REGEX_MODIFICA.test(texto)) {
    let nuevas: LineaDictada[];
    try {
      nuevas = await modificarOrden(pendActual.lineas, texto);
    } catch (err) {
      return { texto: `No pude aplicar el cambio (${err instanceof Error ? err.message : 'error'}). Intenta de nuevo.` };
    }
    if (nuevas.length === 0) {
      pendientes.delete(jid);
      return { texto: 'La orden quedó vacía, así que la cancelé. Vuelve a dictarla cuando quieras.' };
    }
    pendActual.lineas = nuevas;
    pendActual.creado = Date.now();
    return { texto: resumenOrden(pendActual.proveedor, nuevas) };
  }

  // Guardia barata: una orden siempre trae números (cantidades/precios). Sin dígitos → no es orden.
  if (!/\d/.test(texto)) return null;

  const estado = obtenerEstado();

  // La IA interpreta el mensaje libre: decide si es una orden y saca proveedor + productos.
  // Le pasamos el catálogo para que mapee marcas/abreviaturas al nombre exacto.
  let interp;
  try {
    interp = await interpretarOrden(texto, estado.proveedores.map((p) => p.nombre));
  } catch (err) {
    return { texto: `No pude leer el mensaje (${err instanceof Error ? err.message : 'error'}). Intenta de nuevo.` };
  }
  if (!interp.esOrden || interp.lineas.length === 0) return null; // no es una orden: se ignora

  const lineas: LineaDictada[] = interp.lineas;

  if (!interp.proveedor.trim()) {
    return { texto: `¿Para qué proveedor es la orden? Vuelve a dictarla incluyendo el proveedor.` };
  }

  const { match, candidatos } = emparejarProveedor(interp.proveedor, estado.proveedores);
  if (!match && candidatos.length === 0) {
    return {
      texto:
        `No identifiqué al proveedor "${interp.proveedor}" en el catálogo. ` +
        `Escríbelo más completo o revisa el catálogo en la app.`,
    };
  }
  if (!match && candidatos.length > 0) {
    const opciones = candidatos
      .map((p) => `• ${p.nombre}${p.rfc ? ` (RFC ${p.rfc})` : ''}${p.localidad ? ` — ${p.localidad}` : ''}`)
      .join('\n');
    return {
      texto: `Hay varios proveedores que coinciden con "${interp.proveedor}". ¿Cuál es?\n${opciones}\n\nVuelve a dictar la orden usando el nombre más específico.`,
    };
  }

  pendientes.set(jid, { proveedor: match!, lineas, creado: Date.now() });
  return { texto: resumenOrden(match!, lineas) };
}
