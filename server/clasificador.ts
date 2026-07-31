import type { MensajeWA, Sugerencia } from '../src/types';

const MODELO = 'gemini-flash-lite-latest';
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`;

/** Contexto de un lead abierto de este grupo, para que el modelo decida si actualizar. */
export interface LeadContexto {
  leadId: string;
  cliente: string;
  etapa: string;
  tienePrecio: boolean;
  lineas: { producto: string; cantidad: number; unidad: string }[];
}

export interface Deteccion {
  /** 'nuevo' = cotización nueva; 'actualizar' = avance de un lead existente; 'ninguna' = ignorar. */
  relacion: 'nuevo' | 'actualizar' | 'ninguna';
  leadId?: string;
  resumen: string;
  cambio?: string;
  cliente?: string;
  lineas: { producto: string; cantidad?: number; unidad?: string; precioUnitario?: number }[];
}

const ESQUEMA = {
  type: 'OBJECT',
  properties: {
    relacion: { type: 'STRING', enum: ['nuevo', 'actualizar', 'ninguna'] },
    leadId: { type: 'STRING' },
    resumen: { type: 'STRING' },
    cambio: { type: 'STRING' },
    cliente: { type: 'STRING' },
    lineas: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          producto: { type: 'STRING' },
          cantidad: { type: 'NUMBER' },
          unidad: { type: 'STRING' },
          precioUnitario: { type: 'NUMBER' },
        },
        required: ['producto'],
      },
    },
  },
  required: ['relacion', 'resumen', 'lineas'],
};

const INSTRUCCIONES = `Eres un analista de un distribuidor de acero en México. Lees fragmentos de conversación de un grupo de WhatsApp donde participan el ÁREA DE COMPRAS de la empresa y un PROVEEDOR de acero. En los mensajes, "Compras" somos nosotros (el comprador) y el resto es el proveedor.

Tu tarea: mantener sincronizado el pipeline. Decide UNA de tres cosas (campo relacion):

1) "actualizar" — La conversación AVANZA un lead que YA EXISTE en la lista que te paso (mismo producto/proveedor). Ejemplo típico: ya había una solicitud de un material y ahora el proveedor da el precio. En ese caso:
   - Devuelve el leadId EXACTO de ese lead.
   - En lineas incluye el/los producto(s) con su precioUnitario (y cantidad/unidad si se mencionan).
   - En cambio describe qué avanzó, ej. "El proveedor puso precio: $23.50/kg".
   NO crees un lead nuevo si el material ya está en la lista de leads abiertos.

2) "nuevo" — Hay una cotización de un material que NO corresponde a ningún lead abierto de la lista. Devuelve lineas (producto, cantidad, unidad, precioUnitario si lo hay), cliente si se menciona, y un resumen.

3) "ninguna" — No hay cotización nueva ni avance: charla operativa, saludos, logística, pagos viejos, o algo que ya está cubierto por una sugerencia pendiente. No dupliques.

Reglas de datos:
- Considera TODA la conversación, tanto lo que dice Compras como lo que dice el proveedor.
- Unidades: "toneladas"→ton, "kilos"/"kg"→kg, "piezas"→pza, "metros"→m. No conviertas unidades.
- Precios en pesos mexicanos. "23.5 el kg" = precioUnitario 23.5, unidad kg. No calcules totales ni inventes números que no estén en los mensajes.
- resumen y cambio: una frase en español, natural y concreta.`;

export async function clasificar(
  grupo: string,
  mensajes: MensajeWA[],
  pendientes: Sugerencia[],
  leadsAbiertos: LeadContexto[]
): Promise<Deteccion | null> {
  const apiKey = process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    console.error('Falta VITE_GEMINI_API_KEY; no se clasifica.');
    return null;
  }
  const convo = mensajes.map((m) => `[${m.fecha}] ${m.de}: ${m.texto}`).join('\n');
  const prev = pendientes.length > 0 ? pendientes.map((s) => `- ${s.resumen}`).join('\n') : '(ninguna)';
  const leads =
    leadsAbiertos.length > 0
      ? leadsAbiertos
          .map(
            (l) =>
              `- leadId ${l.leadId} | cliente: ${l.cliente} | etapa: ${l.etapa} | ${
                l.tienePrecio ? 'YA tiene precio' : 'SIN precio aún'
              } | ${l.lineas.map((x) => `${x.producto} ${x.cantidad} ${x.unidad}`).join('; ')}`
          )
          .join('\n')
      : '(ninguno)';

  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: INSTRUCCIONES }] },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Grupo (proveedor): ${grupo}\n\nLeads abiertos de este grupo:\n${leads}\n\nSugerencias pendientes de este grupo:\n${prev}\n\nConversación reciente:\n${convo}`,
            },
          ],
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
    console.error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return null;
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const texto = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!texto) return null;
  try {
    return JSON.parse(texto) as Deteccion;
  } catch {
    console.error('Respuesta de Gemini no es JSON válido:', texto.slice(0, 200));
    return null;
  }
}
