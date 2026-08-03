import type { Estado } from './store';

export interface LineaDictada {
  producto: string;
  cantidad: number;
  unidad: string;
  precioUnitario: number;
}

/** Llama al backend (que a su vez usa Gemini). La key vive SOLO en el servidor, nunca en el navegador. */
export async function extraerLineasOC(texto: string): Promise<LineaDictada[]> {
  const res = await fetch('/api/llm/extraer-lineas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texto }),
  });
  if (!res.ok) throw new Error(`El servidor respondió ${res.status}`);
  const data = (await res.json()) as { lineas?: LineaDictada[] };
  return data.lineas ?? [];
}

/** Acción propuesta por el LLM (usada por el asistente general, hoy deshabilitado). */
export interface Propuesta {
  accion:
    | 'crear_lead'
    | 'enviar_a_compras'
    | 'registrar_cotizacion'
    | 'confirmar_precio'
    | 'emitir_oc'
    | 'crear_oc_directa'
    | 'registrar_factura'
    | 'agregar_nota'
    | 'cerrar_lead'
    | 'ninguna';
  explicacion: string;
  leadId?: string;
  cliente?: string;
  proveedor?: {
    nombre?: string;
    rfc?: string;
    domicilio?: string;
    colonia?: string;
    localidad?: string;
    municipio?: string;
    estado?: string;
    pais?: string;
  };
  condicionesPago?: string;
  nota?: string;
  folio?: string;
  resultado?: 'ganado' | 'perdido' | 'cancelado';
  lineas?: {
    codigo?: string;
    producto?: string;
    cantidad?: number;
    unidad?: string;
    precioUnitario?: number;
    precioObjetivo?: number;
  }[];
}

/**
 * El asistente general de texto está deshabilitado (la creación de OC se hace en su panel y por WhatsApp).
 * Se conserva la firma para no romper el componente, pero ya no llama a Gemini desde el navegador.
 */
export async function interpretar(_texto: string, _estado: Estado): Promise<Propuesta> {
  throw new Error('El asistente general está deshabilitado en esta versión.');
}
