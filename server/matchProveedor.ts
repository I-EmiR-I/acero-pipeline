import type { Proveedor } from '../src/types';

/** Normaliza un nombre de proveedor: minúsculas, sin acentos, sin sufijos legales ni puntuación. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(s\.?\s*a\.?\s*de\s*c\.?\s*v\.?|s\.?\s*de\s*r\.?\s*l\.?|sa\s*de\s*cv|s\s*de\s*rl|de\s*c\.?v\.?)\b/g, ' ')
    .replace(/[.,#/\\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Palabras genéricas que no deben, por sí solas, contar como coincidencia fuerte. */
const GENERICAS = new Set(['aceros', 'acero', 'grupo', 'de', 'y', 'del', 'la', 'el', 'sa', 'cv', 'industrial', 'productos']);

/** Similitud 0..1 entre dos nombres: solapamiento de palabras (con peso a las no genéricas) + bono por substring. */
function score(a: string, b: string): number {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = na.split(' ').filter(Boolean);
  const tb = nb.split(' ').filter(Boolean);
  const setB = new Set(tb);
  let interPeso = 0;
  let totalPeso = 0;
  const vistos = new Set<string>();
  for (const w of [...ta, ...tb]) {
    if (vistos.has(w)) continue;
    vistos.add(w);
    const peso = GENERICAS.has(w) ? 0.3 : 1;
    totalPeso += peso;
    if (ta.includes(w) && setB.has(w)) interPeso += peso;
  }
  const jaccard = totalPeso ? interPeso / totalPeso : 0;
  const sub = na.includes(nb) || nb.includes(na) ? 0.3 : 0;
  return Math.min(1, jaccard + sub);
}

export interface ResultadoMatch {
  match?: Proveedor;
  candidatos: Proveedor[];
}

/**
 * Empareja un nombre dictado contra el catálogo.
 * - Devuelve `match` cuando la coincidencia es clara y única.
 * - Devuelve `candidatos` (2+) cuando hay ambigüedad, para que el bot pregunte.
 * - Devuelve ambos vacíos cuando no hay nada razonable.
 */
export function emparejarProveedor(nombre: string, proveedores: Proveedor[]): ResultadoMatch {
  if (!nombre.trim() || proveedores.length === 0) return { candidatos: [] };

  // Coincidencia exacta normalizada (puede haber duplicados de nombre, ej. dos "Aceros Chula Vista").
  const objetivo = norm(nombre);
  const exactos = proveedores.filter((p) => norm(p.nombre) === objetivo);
  if (exactos.length === 1) return { match: exactos[0], candidatos: [] };
  if (exactos.length > 1) return { candidatos: exactos };

  const puntuados = proveedores
    .map((p) => ({ p, s: score(nombre, p.nombre) }))
    .sort((x, y) => y.s - x.s);

  const mejor = puntuados[0];
  if (!mejor || mejor.s < 0.5) return { candidatos: [] }; // nada suficientemente claro

  const segundo = puntuados[1]?.s ?? 0;
  // Único claro: buen puntaje y despega del siguiente.
  if (mejor.s >= 0.5 && mejor.s - segundo >= 0.2) return { match: mejor.p, candidatos: [] };

  // Ambiguo: varios cerca del mejor.
  const cerca = puntuados.filter((x) => x.s >= 0.5 && mejor.s - x.s <= 0.15).map((x) => x.p);
  if (cerca.length === 1) return { match: cerca[0], candidatos: [] };
  return { candidatos: cerca };
}
