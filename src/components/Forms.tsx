import { useState } from 'react';
import type { Lead, LineaFactura } from '../types';
import { useStore } from '../store';
import { conciliar } from '../reconcile';
import { Modal } from './Modal';

interface LineaBorrador {
  producto: string;
  cantidad: string;
  unidad: string;
  precioObjetivo: string;
}

const lineaVacia = (): LineaBorrador => ({ producto: '', cantidad: '', unidad: 'ton', precioObjetivo: '' });

export function FormNuevoLead({ onCerrar }: { onCerrar: () => void }) {
  const { dispatch } = useStore();
  const [cliente, setCliente] = useState('');
  const [lineas, setLineas] = useState<LineaBorrador[]>([lineaVacia()]);
  const [notas, setNotas] = useState('');

  const setLinea = (i: number, campo: keyof LineaBorrador, valor: string) =>
    setLineas(lineas.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));

  const valido = cliente.trim() && lineas.every((l) => l.producto.trim() && Number(l.cantidad) > 0);

  const guardar = () => {
    dispatch({
      tipo: 'crear_lead',
      cliente: cliente.trim(),
      vendedor: 'Vendedor',
      notas: notas.trim() || undefined,
      lineas: lineas.map((l) => ({
        producto: l.producto.trim(),
        cantidad: Number(l.cantidad),
        unidad: l.unidad,
        precioObjetivo: l.precioObjetivo ? Number(l.precioObjetivo) : undefined,
      })),
    });
    onCerrar();
  };

  return (
    <Modal titulo="Nueva solicitud de precio" onCerrar={onCerrar}>
      <div className="campo">
        <label>Cliente</label>
        <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Constructora Vega" autoFocus />
      </div>
      {lineas.map((l, i) => (
        <div className="fila campo" key={i}>
          <div style={{ flex: 2 }}>
            <label>Producto</label>
            <input value={l.producto} onChange={(e) => setLinea(i, 'producto', e.target.value)} placeholder='Varilla 3/8"' />
          </div>
          <div>
            <label>Cantidad</label>
            <input type="number" min="0" step="0.1" value={l.cantidad} onChange={(e) => setLinea(i, 'cantidad', e.target.value)} />
          </div>
          <div>
            <label>Unidad</label>
            <select value={l.unidad} onChange={(e) => setLinea(i, 'unidad', e.target.value)}>
              <option value="ton">ton</option>
              <option value="pza">pza</option>
              <option value="kg">kg</option>
              <option value="m">m</option>
            </select>
          </div>
          <div>
            <label>Precio objetivo</label>
            <input type="number" min="0" value={l.precioObjetivo} onChange={(e) => setLinea(i, 'precioObjetivo', e.target.value)} placeholder="Opcional" />
          </div>
        </div>
      ))}
      <div className="fila campo">
        <button className="mini" onClick={() => setLineas([...lineas, lineaVacia()])}>+ Agregar producto</button>
        {lineas.length > 1 && (
          <button className="mini" onClick={() => setLineas(lineas.slice(0, -1))}>Quitar último</button>
        )}
      </div>
      <div className="campo">
        <label>Notas</label>
        <textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Contexto del cliente, urgencia, etc." />
      </div>
      <div className="botones">
        <button onClick={onCerrar}>Cancelar</button>
        <button className="primario" disabled={!valido} onClick={guardar}>Crear solicitud</button>
      </div>
    </Modal>
  );
}

export function FormCotizacion({ lead, onCerrar }: { lead: Lead; onCerrar: () => void }) {
  const { dispatch } = useStore();
  const [proveedor, setProveedor] = useState('');
  const [precios, setPrecios] = useState<Record<string, string>>({});
  const [notas, setNotas] = useState('');

  const valido = proveedor.trim() && lead.lineas.every((l) => Number(precios[l.id]) > 0);

  const guardar = () => {
    dispatch({
      tipo: 'registrar_cotizacion',
      leadId: lead.id,
      proveedor: proveedor.trim(),
      precios: Object.fromEntries(lead.lineas.map((l) => [l.id, Number(precios[l.id])])),
      notas: notas.trim() || undefined,
      actor: 'Compras',
    });
    onCerrar();
  };

  return (
    <Modal titulo="Registrar cotización de proveedor" onCerrar={onCerrar}>
      <div className="campo">
        <label>Proveedor</label>
        <input value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="Aceros del Norte" autoFocus />
      </div>
      {lead.lineas.map((l) => (
        <div className="campo" key={l.id}>
          <label>
            Precio unitario — {l.producto} ({l.cantidad} {l.unidad})
            {l.precioObjetivo ? ` · objetivo $${l.precioObjetivo.toLocaleString('es-MX')}` : ''}
          </label>
          <input
            type="number"
            min="0"
            value={precios[l.id] ?? ''}
            onChange={(e) => setPrecios({ ...precios, [l.id]: e.target.value })}
            placeholder="$ por unidad"
          />
        </div>
      ))}
      <div className="campo">
        <label>Notas</label>
        <textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Tiempo de entrega, condiciones…" />
      </div>
      <div className="botones">
        <button onClick={onCerrar}>Cancelar</button>
        <button className="primario" disabled={!valido} onClick={guardar}>Guardar cotización</button>
      </div>
    </Modal>
  );
}

export function FormConfirmar({ lead, onCerrar }: { lead: Lead; onCerrar: () => void }) {
  const { dispatch } = useStore();
  const [cotizacionId, setCotizacionId] = useState(lead.cotizaciones[0]?.id ?? '');

  return (
    <Modal titulo="El cliente confirmó el precio" onCerrar={onCerrar}>
      <div className="campo">
        <label>¿Con qué cotización se cierra?</label>
        <select value={cotizacionId} onChange={(e) => setCotizacionId(e.target.value)}>
          {lead.cotizaciones.map((c) => (
            <option key={c.id} value={c.id}>
              {c.proveedor} — {lead.lineas.map((l) => `$${(c.precios[l.id] ?? 0).toLocaleString('es-MX')}/${l.unidad} ${l.producto}`).join(' · ')}
            </option>
          ))}
        </select>
      </div>
      <div className="botones">
        <button onClick={onCerrar}>Cancelar</button>
        <button
          className="primario"
          disabled={!cotizacionId}
          onClick={() => {
            dispatch({ tipo: 'confirmar_precio', leadId: lead.id, cotizacionId, actor: 'Vendedor' });
            onCerrar();
          }}
        >
          Confirmar
        </button>
      </div>
    </Modal>
  );
}

export function FormOC({ lead, onCerrar }: { lead: Lead; onCerrar: () => void }) {
  const { dispatch } = useStore();
  const [folio, setFolio] = useState('');
  const cot = lead.cotizaciones.find((c) => c.id === lead.cotizacionElegida);

  return (
    <Modal titulo="Emitir orden de compra" onCerrar={onCerrar}>
      <p style={{ marginTop: 0, color: 'var(--text-2)' }}>
        Se enviará a <strong>{cot?.proveedor}</strong> con las cantidades y precios confirmados.
      </p>
      <div className="campo">
        <label>Folio de la OC</label>
        <input value={folio} onChange={(e) => setFolio(e.target.value)} placeholder="OC-0042" autoFocus />
      </div>
      <div className="botones">
        <button onClick={onCerrar}>Cancelar</button>
        <button
          className="primario"
          disabled={!folio.trim()}
          onClick={() => {
            dispatch({ tipo: 'emitir_oc', leadId: lead.id, folio: folio.trim(), actor: 'Asistente' });
            onCerrar();
          }}
        >
          Emitir y enviar
        </button>
      </div>
    </Modal>
  );
}

export function FormFactura({ lead, onCerrar }: { lead: Lead; onCerrar: () => void }) {
  const { dispatch } = useStore();
  const [folio, setFolio] = useState('');
  const estado = conciliar(lead);
  const [cantidades, setCantidades] = useState<Record<string, string>>(() =>
    Object.fromEntries((estado?.lineas ?? []).map((l) => [l.lineaId, String(l.pendiente)]))
  );

  if (!estado) return null;

  const lineas: LineaFactura[] = estado.lineas
    .map((l) => ({ lineaId: l.lineaId, cantidad: Number(cantidades[l.lineaId] ?? 0) }))
    .filter((l) => l.cantidad > 0);

  const valido = folio.trim() && lineas.length > 0;

  return (
    <Modal titulo="Registrar factura del proveedor" onCerrar={onCerrar}>
      <div className="campo">
        <label>Folio de factura</label>
        <input value={folio} onChange={(e) => setFolio(e.target.value)} placeholder="F-8813" autoFocus />
      </div>
      {estado.lineas.map((l) => (
        <div className="campo" key={l.lineaId}>
          <label>
            {l.producto} — pedido {l.pedido} {l.unidad}, facturado {l.facturado} {l.unidad}
          </label>
          <input
            type="number"
            min="0"
            step="0.1"
            value={cantidades[l.lineaId] ?? ''}
            onChange={(e) => setCantidades({ ...cantidades, [l.lineaId]: e.target.value })}
            placeholder={`Cantidad facturada (${l.unidad})`}
          />
        </div>
      ))}
      <p style={{ color: 'var(--text-2)', fontSize: 13 }}>
        Si la factura no cubre todo lo pedido, el sistema marcará el lead con entrega parcial y avisará al vendedor y a compras.
      </p>
      <div className="botones">
        <button onClick={onCerrar}>Cancelar</button>
        <button
          className="primario"
          disabled={!valido}
          onClick={() => {
            dispatch({ tipo: 'registrar_factura', leadId: lead.id, folio: folio.trim(), lineas, actor: 'Asistente' });
            onCerrar();
          }}
        >
          Registrar factura
        </button>
      </div>
    </Modal>
  );
}

export function FormNota({ lead, onCerrar }: { lead: Lead; onCerrar: () => void }) {
  const { dispatch } = useStore();
  const [texto, setTexto] = useState('');
  return (
    <Modal titulo="Agregar nota" onCerrar={onCerrar}>
      <div className="campo">
        <textarea rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus placeholder="Nota para el historial del lead" />
      </div>
      <div className="botones">
        <button onClick={onCerrar}>Cancelar</button>
        <button
          className="primario"
          disabled={!texto.trim()}
          onClick={() => {
            dispatch({ tipo: 'agregar_nota', leadId: lead.id, texto: texto.trim(), actor: 'Vendedor' });
            onCerrar();
          }}
        >
          Guardar
        </button>
      </div>
    </Modal>
  );
}
