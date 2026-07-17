import type { Estado } from './store';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
const MODELO = 'gemini-2.5-flash';
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`;

/** Acción propuesta por el LLM. El LLM nunca toca los datos: solo propone; el usuario confirma. */
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

const ESQUEMA = {
  type: 'OBJECT',
  properties: {
    accion: {
      type: 'STRING',
      enum: [
        'crear_lead',
        'enviar_a_compras',
        'registrar_cotizacion',
        'confirmar_precio',
        'emitir_oc',
        'crear_oc_directa',
        'registrar_factura',
        'agregar_nota',
        'cerrar_lead',
        'ninguna',
      ],
    },
    explicacion: { type: 'STRING' },
    leadId: { type: 'STRING' },
    cliente: { type: 'STRING' },
    proveedor: {
      type: 'OBJECT',
      properties: {
        nombre: { type: 'STRING' },
        rfc: { type: 'STRING' },
        domicilio: { type: 'STRING' },
        colonia: { type: 'STRING' },
        localidad: { type: 'STRING' },
        municipio: { type: 'STRING' },
        estado: { type: 'STRING' },
        pais: { type: 'STRING' },
      },
    },
    condicionesPago: { type: 'STRING' },
    nota: { type: 'STRING' },
    folio: { type: 'STRING' },
    resultado: { type: 'STRING', enum: ['ganado', 'perdido', 'cancelado'] },
    lineas: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          codigo: { type: 'STRING' },
          producto: { type: 'STRING' },
          cantidad: { type: 'NUMBER' },
          unidad: { type: 'STRING' },
          precioUnitario: { type: 'NUMBER' },
          precioObjetivo: { type: 'NUMBER' },
        },
      },
    },
  },
  required: ['accion', 'explicacion'],
};

function contexto(estado: Estado): string {
  const leads = estado.leads
    .filter((l) => l.etapa !== 'cerrado')
    .map((l) => {
      const cots = l.cotizaciones.map((c) => `${c.proveedor} (id ${c.id})`).join(', ') || 'ninguna';
      const productos = l.lineas.map((p) => `${p.producto} ${p.cantidad} ${p.unidad}`).join('; ');
      return `- leadId ${l.id} | cliente: ${l.cliente} | etapa: ${l.etapa} | productos: ${productos} | cotizaciones: ${cots}${l.ordenCompra ? ` | OC ${l.ordenCompra.folio} a ${l.ordenCompra.proveedor}` : ''}`;
    })
    .join('\n');
  return leads || '(no hay leads abiertos)';
}

const INSTRUCCIONES = `Eres el asistente de un distribuidor de acero en México. Tu trabajo es convertir mensajes en lenguaje natural (del vendedor, compras o la asistente) en UNA acción estructurada del sistema de pipeline de precios especiales.

Acciones disponibles:
- crear_lead: un cliente pide precio. Requiere cliente y lineas (producto, cantidad, unidad; precioObjetivo opcional).
- enviar_a_compras: el vendedor pasa la solicitud a compras. Requiere leadId (etapa solicitud).
- registrar_cotizacion: compras consiguió precio de un proveedor. Requiere leadId, proveedor.nombre y lineas con producto y precioUnitario (empareja los nombres de producto con los del lead).
- confirmar_precio: el cliente aceptó. Requiere leadId y proveedor.nombre (el de la cotización elegida).
- emitir_oc: generar la orden de compra del lead (etapa confirmado). Requiere leadId; opcional condicionesPago (ej. "30 DÍAS"), nota, folio, y datos fiscales del proveedor en proveedor.
- crear_oc_directa: orden de compra SIN lead, cuando piden "hazme una OC" con proveedor y productos explícitos. Requiere proveedor.nombre y lineas completas (producto, cantidad, unidad, precioUnitario; codigo opcional). Opcional: rfc/domicilio/colonia/municipio/estado/pais del proveedor, condicionesPago, nota, folio.
- registrar_factura: llegó factura del proveedor. Requiere leadId, folio y lineas con producto y cantidad facturada.
- agregar_nota: comentario al historial. Requiere leadId y nota.
- cerrar_lead: requiere leadId y resultado.
- ninguna: si el mensaje no corresponde a ninguna acción o falta información esencial; explica qué falta en explicacion.

Reglas:
- Responde SIEMPRE el JSON del esquema, en español.
- Identifica el lead por nombre de cliente mencionado; usa su leadId exacto del contexto. Si hay ambigüedad, usa accion "ninguna" y pide aclaración en explicacion.
- Cantidades: si dicen "toneladas" usa unidad "ton"; kilos = "kg"; piezas = "pza". No conviertas unidades.
- Precios en pesos mexicanos (MXN). "16.80 el kilo" = precioUnitario 16.80 con unidad kg.
- explicacion: una frase corta que resuma lo que vas a hacer, para que el usuario confirme.`;

export async function interpretar(texto: string, estado: Estado): Promise<Propuesta> {
  if (!API_KEY) throw new Error('Falta VITE_GEMINI_API_KEY en .env.local');
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: INSTRUCCIONES }] },
      contents: [
        {
          role: 'user',
          parts: [{ text: `Leads abiertos:\n${contexto(estado)}\n\nMensaje del usuario:\n${texto}` }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: ESQUEMA,
        temperature: 0.1,
      },
    }),
  });
  if (!res.ok) {
    const cuerpo = await res.text();
    throw new Error(`Gemini respondió ${res.status}: ${cuerpo.slice(0, 300)}`);
  }
  const data = await res.json();
  const textoJson = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textoJson) throw new Error('Gemini no devolvió contenido');
  return JSON.parse(textoJson) as Propuesta;
}
