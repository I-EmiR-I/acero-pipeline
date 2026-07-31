const MODELO = 'gemini-flash-lite-latest';
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`;

export interface LineaDictada {
  producto: string;
  cantidad: number;
  unidad: string;
  precioUnitario: number;
}

export interface OrdenInterpretada {
  esOrden: boolean;
  proveedor: string;
  lineas: LineaDictada[];
}

const ESQUEMA = {
  type: 'OBJECT',
  properties: {
    esOrden: { type: 'BOOLEAN' },
    proveedor: { type: 'STRING' },
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
        required: ['producto', 'cantidad', 'unidad', 'precioUnitario'],
      },
    },
  },
  required: ['esOrden', 'proveedor', 'lineas'],
};

const INSTRUCCIONES = `Recibes un mensaje de un grupo de WhatsApp del área de compras de un distribuidor de acero. Decide si el mensaje es una instrucción para CREAR UNA ORDEN DE COMPRA a un proveedor, y si lo es, extráela.

- esOrden = true solo si el mensaje pide o dicta comprar material de acero (menciona productos con cantidad y/o precio, normalmente con un proveedor).
- esOrden = false si es saludo, charla, agradecimiento, pregunta suelta, o cualquier cosa que no sea dictar una orden. En ese caso deja proveedor vacío y lineas vacío.

Es una orden para SOLICITAR MATERIAL. El usuario pide una cantidad de material y manda el precio POR KILO del material.

Si esOrden = true:
- proveedor: el nombre del proveedor tal como se menciona (ej. "Aceros del Norte"). Si no se menciona ninguno, déjalo vacío "".
- lineas: cada material con producto (descripción), cantidad, unidad y precioUnitario.

Reglas de datos (estrictas):
- Usa SOLO los números que aparecen en el texto. NUNCA calcules importes ni totales.
- cantidad + unidad = lo que se SOLICITA. La unidad es la que acompaña a la cantidad:
  "100 paquetes"→paquete, "100 toneladas"/"100 ton"→ton, "1500 kg"/"kilos"→kg, "200 piezas"/"200 PTR"/"200 tramos"→pza, "rollos"→rollo, "metros"→m.
  Si es un conteo sin unidad explícita (ej. "200 PTR"), usa "pza".
- precioUnitario = el PRECIO POR KILO del material que manda el usuario. SIEMPRE es precio por kg, sin importar la unidad de la cantidad. "varilla a 16.80" → 16.80. "a 23.5 el kg" → 23.5. "PTR a 24" → 24 (por kg).
- Interpreta "16,200" como 16200 y "1,500" como 1500 (separador de miles).

El mensaje puede venir en CUALQUIER formato natural; todos válidos:
- "OC Aceros del Norte: 1500 kg de varilla corrugada 5/8 a 16.80"
- "OC Aceros del Norte 100 toneladas de varilla 3/8 a 16.50"   (sin dos puntos)
- "hazle una orden a aceros del norte de 100 paquetes de malla a 12"
- "orden para aceros del norte, 200 PTR 1/2 a 23.5"`;

const ESQUEMA_LINEAS = {
  type: 'OBJECT',
  properties: {
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
        required: ['producto', 'cantidad', 'unidad', 'precioUnitario'],
      },
    },
  },
  required: ['lineas'],
};

const INSTRUCCIONES_MOD = `Estás ayudando a construir una orden de compra de acero. Te doy las LÍNEAS ACTUALES y una INSTRUCCIÓN del usuario para modificarla. Devuelve la lista COMPLETA de líneas resultante tras aplicar la instrucción.

Reglas:
- Mantén EXACTAMENTE igual las líneas que el usuario no menciona.
- Agregar ("agrega 50 soleras a 40", "y 20 ton de placa a 18000"): añade esas líneas nuevas a las actuales.
- Quitar ("quita el PTR", "elimina la varilla", "sin la solera"): elimina la línea que coincida por producto.
- Cambiar ("cambia el PTR a 24", "la varilla ahora son 2000 kg", "el precio de la placa es 19000"): ajusta cantidad o precio de esa línea.
- Usa SOLO números que aparezcan en la instrucción o que ya estén en las líneas actuales. NUNCA inventes ni calcules importes.
- cantidad + unidad = lo que se solicita: "100 paquetes"→paquete, "100 ton"→ton, "1500 kg"→kg, "200 PTR"/"200 piezas"→pza. Conteo sin unidad → "pza".
- precioUnitario = precio POR KILO, siempre, sin importar la unidad de la cantidad.`;

export async function modificarOrden(
  lineasActuales: LineaDictada[],
  instruccion: string
): Promise<LineaDictada[]> {
  const apiKey = process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error('Falta VITE_GEMINI_API_KEY');
  const contexto = `LÍNEAS ACTUALES:\n${JSON.stringify(lineasActuales)}\n\nINSTRUCCIÓN:\n${instruccion}`;
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: INSTRUCCIONES_MOD }] },
      contents: [{ role: 'user', parts: [{ text: contexto }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: ESQUEMA_LINEAS, temperature: 0 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const txt = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!txt) throw new Error('Gemini no devolvió contenido');
  const parsed = JSON.parse(txt) as { lineas?: LineaDictada[] };
  return parsed.lineas ?? [];
}

export async function interpretarOrden(
  texto: string,
  proveedoresCatalogo: string[] = []
): Promise<OrdenInterpretada> {
  const apiKey = process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error('Falta VITE_GEMINI_API_KEY');
  const catalogoTxt =
    proveedoresCatalogo.length > 0
      ? `\n\nProveedores del catálogo (elige de aquí):\n${proveedoresCatalogo.map((n) => `- ${n}`).join('\n')}\n\n` +
        `En el campo "proveedor": identifica a cuál de estos proveedores se refiere el usuario, aunque lo escriba abreviado, con marca comercial, incompleto o con errores (ej. "Prolamsa"→"PRODUCTOS LAMINADOS DE MONTERREY, S.A. DE C.V.", "Chula Vista"→"ACEROS CHULA VISTA"). Devuelve su nombre EXACTO tal como aparece en la lista. Si NO puedes identificarlo con confianza, o si el usuario es ambiguo entre varios, devuelve el nombre TAL COMO lo dijo el usuario (sin adivinar).`
      : '';
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: INSTRUCCIONES }] },
      contents: [{ role: 'user', parts: [{ text: texto + catalogoTxt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: ESQUEMA, temperature: 0 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const txt = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!txt) throw new Error('Gemini no devolvió contenido');
  const parsed = JSON.parse(txt) as OrdenInterpretada;
  return { esOrden: !!parsed.esOrden, proveedor: parsed.proveedor ?? '', lineas: parsed.lineas ?? [] };
}
