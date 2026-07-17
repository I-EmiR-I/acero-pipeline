import { useState } from 'react';
import type { Accion } from '../store';
import { useStore } from '../store';
import { interpretar } from '../llm';
import type { Propuesta } from '../llm';
import { fmtMoneda } from '../reconcile';

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

const coincide = (a: string, b: string) => {
  const na = norm(a);
  const nb = norm(b);
  return na.includes(nb) || nb.includes(na);
};

interface Resultado {
  accion: Accion | null;
  resumen: string[];
  avisos: string[];
}

export function Asistente({ onAplicada }: { onAplicada: (tipo: string) => void }) {
  const { estado, dispatch } = useStore();
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null);

  const enviar = async () => {
    if (!texto.trim() || cargando) return;
    setCargando(true);
    setError(null);
    setPropuesta(null);
    try {
      setPropuesta(await interpretar(texto.trim(), estado));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  };

  const traducir = (p: Propuesta): Resultado => {
    const avisos: string[] = [];
    const lead = p.leadId ? estado.leads.find((l) => l.id === p.leadId) : undefined;
    if (p.leadId && !lead) return { accion: null, resumen: [], avisos: ['El lead indicado ya no existe.'] };

    switch (p.accion) {
      case 'crear_lead': {
        const lineas = (p.lineas ?? [])
          .filter((l) => l.producto && (l.cantidad ?? 0) > 0)
          .map((l) => ({
            producto: l.producto!,
            cantidad: l.cantidad!,
            unidad: l.unidad || 'ton',
            precioObjetivo: l.precioObjetivo,
          }));
        if (!p.cliente || lineas.length === 0)
          return { accion: null, resumen: [], avisos: ['Faltan cliente o productos para crear el lead.'] };
        return {
          accion: { tipo: 'crear_lead', cliente: p.cliente, vendedor: 'Vendedor', lineas },
          resumen: [
            `Cliente: ${p.cliente}`,
            ...lineas.map((l) => `${l.producto} — ${l.cantidad} ${l.unidad}${l.precioObjetivo ? ` (objetivo ${fmtMoneda(l.precioObjetivo)})` : ''}`),
          ],
          avisos,
        };
      }
      case 'enviar_a_compras':
        if (!lead) return { accion: null, resumen: [], avisos: ['No identifiqué el lead.'] };
        return {
          accion: { tipo: 'enviar_a_compras', leadId: lead.id, actor: 'Vendedor' },
          resumen: [`Lead: ${lead.cliente}`],
          avisos,
        };
      case 'registrar_cotizacion': {
        if (!lead || !p.proveedor?.nombre)
          return { accion: null, resumen: [], avisos: ['Faltan lead o proveedor.'] };
        const precios: Record<string, number> = {};
        const resumen = [`Lead: ${lead.cliente}`, `Proveedor: ${p.proveedor.nombre}`];
        for (const lp of p.lineas ?? []) {
          if (!lp.producto || !lp.precioUnitario) continue;
          const linea = lead.lineas.find((l) => coincide(l.producto, lp.producto!));
          if (linea) {
            precios[linea.id] = lp.precioUnitario;
            resumen.push(`${linea.producto}: ${fmtMoneda(lp.precioUnitario)}/${linea.unidad}`);
          } else {
            avisos.push(`No encontré el producto "${lp.producto}" en el lead; se omitió.`);
          }
        }
        if (Object.keys(precios).length === 0)
          return { accion: null, resumen: [], avisos: ['Ningún producto de la cotización coincide con el lead.'] };
        for (const l of lead.lineas)
          if (!(l.id in precios)) avisos.push(`Sin precio para "${l.producto}" (quedará en $0; edítalo manualmente).`);
        return {
          accion: {
            tipo: 'registrar_cotizacion',
            leadId: lead.id,
            proveedor: p.proveedor.nombre,
            precios: Object.fromEntries(lead.lineas.map((l) => [l.id, precios[l.id] ?? 0])),
            notas: p.nota,
            actor: 'Compras',
          },
          resumen,
          avisos,
        };
      }
      case 'confirmar_precio': {
        if (!lead) return { accion: null, resumen: [], avisos: ['No identifiqué el lead.'] };
        const nombre = p.proveedor?.nombre;
        const cot = nombre
          ? lead.cotizaciones.find((c) => coincide(c.proveedor, nombre))
          : lead.cotizaciones.length === 1
            ? lead.cotizaciones[0]
            : undefined;
        if (!cot)
          return { accion: null, resumen: [], avisos: ['No pude identificar con qué cotización se confirma.'] };
        return {
          accion: { tipo: 'confirmar_precio', leadId: lead.id, cotizacionId: cot.id, actor: 'Vendedor' },
          resumen: [`Lead: ${lead.cliente}`, `Cotización elegida: ${cot.proveedor}`],
          avisos,
        };
      }
      case 'emitir_oc': {
        if (!lead) return { accion: null, resumen: [], avisos: ['No identifiqué el lead.'] };
        if (lead.etapa !== 'confirmado')
          avisos.push('El lead aún no está en etapa "Cliente confirmó"; la OC se emitirá de todos modos si confirmas.');
        return {
          accion: {
            tipo: 'emitir_oc',
            leadId: lead.id,
            folio: p.folio,
            condicionesPago: p.condicionesPago,
            nota: p.nota,
            proveedorDatos: p.proveedor?.nombre ? { nombre: p.proveedor.nombre, ...p.proveedor } : undefined,
            actor: 'Asistente',
          },
          resumen: [
            `Lead: ${lead.cliente}`,
            `Folio: ${p.folio ?? `${estado.folioSiguiente} (automático)`}`,
            ...(p.condicionesPago ? [`Condiciones: ${p.condicionesPago}`] : []),
          ],
          avisos,
        };
      }
      case 'crear_oc_directa': {
        const lineas = (p.lineas ?? [])
          .filter((l) => l.producto && (l.cantidad ?? 0) > 0 && (l.precioUnitario ?? 0) > 0)
          .map((l) => ({
            codigo: l.codigo,
            producto: l.producto!,
            cantidad: l.cantidad!,
            unidad: l.unidad || 'kg',
            precioUnitario: l.precioUnitario!,
          }));
        if (!p.proveedor?.nombre || lineas.length === 0)
          return {
            accion: null,
            resumen: [],
            avisos: ['Para una OC directa necesito proveedor y productos con cantidad y precio.'],
          };
        const subtotal = lineas.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0);
        return {
          accion: {
            tipo: 'crear_oc_directa',
            proveedor: { nombre: p.proveedor.nombre, ...p.proveedor },
            lineas,
            folio: p.folio,
            condicionesPago: p.condicionesPago,
            nota: p.nota,
            actor: 'Asistente',
          },
          resumen: [
            `Proveedor: ${p.proveedor.nombre}`,
            `Folio: ${p.folio ?? `${estado.folioSiguiente} (automático)`}`,
            ...lineas.map((l) => `${l.producto} — ${l.cantidad} ${l.unidad} × ${fmtMoneda(l.precioUnitario)}`),
            `Subtotal: ${fmtMoneda(subtotal)} + IVA`,
            ...(p.condicionesPago ? [`Condiciones: ${p.condicionesPago}`] : []),
          ],
          avisos,
        };
      }
      case 'registrar_factura': {
        if (!lead?.ordenCompra || !p.folio)
          return { accion: null, resumen: [], avisos: ['Necesito un lead con OC emitida y el folio de la factura.'] };
        const lineas: { lineaId: string; cantidad: number }[] = [];
        const resumen = [`Lead: ${lead.cliente}`, `Factura: ${p.folio}`];
        for (const lp of p.lineas ?? []) {
          if (!lp.producto || !(lp.cantidad && lp.cantidad > 0)) continue;
          const linea = lead.ordenCompra.lineas.find((l) => coincide(l.producto, lp.producto!));
          if (linea) {
            lineas.push({ lineaId: linea.lineaId, cantidad: lp.cantidad });
            resumen.push(`${linea.producto}: ${lp.cantidad} ${linea.unidad}`);
          } else {
            avisos.push(`No encontré "${lp.producto}" en la OC; se omitió.`);
          }
        }
        if (lineas.length === 0)
          return { accion: null, resumen: [], avisos: ['Ninguna línea de la factura coincide con la OC.'] };
        return {
          accion: { tipo: 'registrar_factura', leadId: lead.id, folio: p.folio, lineas, actor: 'Asistente' },
          resumen,
          avisos,
        };
      }
      case 'agregar_nota':
        if (!lead || !p.nota) return { accion: null, resumen: [], avisos: ['Faltan lead o texto de la nota.'] };
        return {
          accion: { tipo: 'agregar_nota', leadId: lead.id, texto: p.nota, actor: 'Vendedor' },
          resumen: [`Lead: ${lead.cliente}`, `Nota: ${p.nota}`],
          avisos,
        };
      case 'cerrar_lead':
        if (!lead || !p.resultado) return { accion: null, resumen: [], avisos: ['Faltan lead o resultado.'] };
        return {
          accion: { tipo: 'cerrar_lead', leadId: lead.id, resultado: p.resultado, actor: 'Vendedor' },
          resumen: [`Lead: ${lead.cliente}`, `Resultado: ${p.resultado}`],
          avisos,
        };
      default:
        return { accion: null, resumen: [], avisos: [] };
    }
  };

  const resultado = propuesta ? traducir(propuesta) : null;

  const confirmar = () => {
    if (!resultado?.accion || !propuesta) return;
    dispatch(resultado.accion);
    onAplicada(propuesta.accion);
    setPropuesta(null);
    setTexto('');
  };

  return (
    <div className="asistente no-print">
      {error && <div className="asistente-error">{error}</div>}
      {propuesta && resultado && (
        <div className="asistente-propuesta">
          <div className="asistente-explicacion">
            <strong>{propuesta.accion === 'ninguna' ? 'No hay acción que aplicar' : 'Acción propuesta'}.</strong>{' '}
            {propuesta.explicacion}
          </div>
          {resultado.resumen.length > 0 && (
            <ul className="asistente-resumen">
              {resultado.resumen.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          )}
          {resultado.avisos.map((a, i) => (
            <div className="asistente-aviso" key={i}>{a}</div>
          ))}
          <div className="asistente-botones">
            <button className="mini" onClick={() => setPropuesta(null)}>Descartar</button>
            {resultado.accion && (
              <button className="mini primario" onClick={confirmar}>Confirmar</button>
            )}
          </div>
        </div>
      )}
      <div className="asistente-barra">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && enviar()}
          placeholder='Ej. "Hazme una OC para Aceros Chula Vista: 1500 kg de varilla corrugada 5/8 a $16.80, pago a 30 días"'
          disabled={cargando}
        />
        <button className="primario" onClick={enviar} disabled={cargando || !texto.trim()}>
          {cargando ? 'Interpretando…' : 'Enviar'}
        </button>
      </div>
    </div>
  );
}
