import { useState } from 'react';
import type { Lead, OrdenCompra } from '../types';
import { ETAPAS } from '../types';
import { useStore } from '../store';
import { conciliar, fmtFecha, fmtMoneda, montoOC } from '../reconcile';
import { FormCotizacion, FormConfirmar, FormFactura, FormNota, FormOC } from './Forms';

type Formulario = 'cotizacion' | 'confirmar' | 'oc' | 'factura' | 'nota' | null;

export function PanelLead({
  lead,
  onCerrar,
  onVerOC,
}: {
  lead: Lead;
  onCerrar: () => void;
  onVerOC?: (oc: OrdenCompra) => void;
}) {
  const { dispatch } = useStore();
  const [form, setForm] = useState<Formulario>(null);
  const estado = conciliar(lead);
  const parcial = estado !== null && !estado.completo && lead.facturas.length > 0 && lead.etapa !== 'cerrado';
  const etapaNombre = ETAPAS.find((e) => e.id === lead.etapa)?.nombre ?? lead.etapa;
  const total = montoOC(lead);

  return (
    <div className="panel-fondo" onClick={onCerrar}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <button className="cerrar mini" onClick={onCerrar}>Cerrar</button>
        <h2>{lead.cliente}</h2>
        <div style={{ color: 'var(--text-2)', marginTop: 4 }}>
          {etapaNombre}
          {lead.resultado && ` · ${lead.resultado}`} · vendedor: {lead.vendedor}
        </div>

        {parcial && estado && (
          <div className="aviso">
            <strong>Entrega parcial.</strong>{' '}
            El proveedor no ha facturado todo lo pedido:{' '}
            {estado.lineas
              .filter((l) => l.pendiente > 0)
              .map((l) => `faltan ${l.pendiente} ${l.unidad} de ${l.producto}`)
              .join(', ')}
            .
          </div>
        )}

        <div className="acciones-etapa">
          {lead.etapa === 'solicitud' && (
            <button className="primario" onClick={() => dispatch({ tipo: 'enviar_a_compras', leadId: lead.id, actor: 'Vendedor' })}>
              Enviar a compras
            </button>
          )}
          {(lead.etapa === 'cotizando' || lead.etapa === 'cotizacion_lista') && (
            <button className={lead.etapa === 'cotizando' ? 'primario' : ''} onClick={() => setForm('cotizacion')}>
              Registrar cotización
            </button>
          )}
          {lead.etapa === 'cotizacion_lista' && (
            <button className="primario" onClick={() => setForm('confirmar')}>
              Cliente confirmó precio
            </button>
          )}
          {lead.etapa === 'confirmado' && (
            <button className="primario" onClick={() => setForm('oc')}>
              Emitir orden de compra
            </button>
          )}
          {(lead.etapa === 'oc_enviada' || lead.etapa === 'conciliacion') && (
            <button className="primario" onClick={() => setForm('factura')}>
              Registrar factura
            </button>
          )}
          {lead.etapa !== 'cerrado' && (
            <>
              <button onClick={() => setForm('nota')}>Agregar nota</button>
              <button
                className="peligro"
                onClick={() => dispatch({ tipo: 'cerrar_lead', leadId: lead.id, resultado: 'perdido', actor: 'Vendedor' })}
              >
                Marcar perdido
              </button>
            </>
          )}
        </div>

        <h3>Productos solicitados</h3>
        <table className="tabla">
          <thead>
            <tr>
              <th>Producto</th>
              <th className="num">Cantidad</th>
              <th className="num">Precio objetivo</th>
            </tr>
          </thead>
          <tbody>
            {lead.lineas.map((l) => (
              <tr key={l.id}>
                <td>{l.producto}</td>
                <td className="num">{l.cantidad} {l.unidad}</td>
                <td className="num">{l.precioObjetivo ? fmtMoneda(l.precioObjetivo) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {lead.cotizaciones.length > 0 && (
          <>
            <h3>Cotizaciones de proveedores</h3>
            {lead.cotizaciones.map((c) => (
              <div className="ficha" key={c.id}>
                <div className="titulo">
                  {c.proveedor}
                  {lead.cotizacionElegida === c.id && <span className="insignia ganado">Elegida</span>}
                </div>
                <div className="muted">
                  {lead.lineas.map((l) => `${l.producto}: ${fmtMoneda(c.precios[l.id] ?? 0)}/${l.unidad}`).join(' · ')}
                </div>
                {c.notas && <div className="muted">{c.notas}</div>}
                <div className="muted">{fmtFecha(c.fecha)}</div>
              </div>
            ))}
          </>
        )}

        {lead.ordenCompra && (
          <>
            <h3>Orden de compra</h3>
            <div className="ficha">
              <div className="titulo">
                {lead.ordenCompra.folio} → {lead.ordenCompra.proveedor}
                {onVerOC && (
                  <button className="mini" onClick={() => onVerOC(lead.ordenCompra!)}>Ver / imprimir</button>
                )}
              </div>
              <div className="muted">
                {lead.ordenCompra.lineas
                  .map((l) => `${l.producto}: ${l.cantidad} ${l.unidad} × ${fmtMoneda(l.precioUnitario)}`)
                  .join(' · ')}
              </div>
              {total !== null && <div>Total: <strong>{fmtMoneda(total)}</strong></div>}
              <div className="muted">{fmtFecha(lead.ordenCompra.fecha)}</div>
            </div>
          </>
        )}

        {estado && lead.facturas.length > 0 && (
          <>
            <h3>Conciliación OC vs facturas</h3>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="num">Pedido</th>
                  <th className="num">Facturado</th>
                  <th className="num">Pendiente</th>
                </tr>
              </thead>
              <tbody>
                {estado.lineas.map((l) => (
                  <tr key={l.lineaId}>
                    <td>{l.producto}</td>
                    <td className="num">{l.pedido} {l.unidad}</td>
                    <td className="num">{l.facturado} {l.unidad}</td>
                    <td className={`num ${l.pendiente > 0 ? 'pendiente-si' : 'pendiente-no'}`}>
                      {l.pendiente > 0 ? `${l.pendiente} ${l.unidad}` : 'Completo'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lead.facturas.map((f) => (
              <div className="ficha" key={f.id} style={{ marginTop: 8 }}>
                <div className="titulo">Factura {f.folio}</div>
                <div className="muted">{fmtFecha(f.fecha)}</div>
              </div>
            ))}
          </>
        )}

        <h3>Historial</h3>
        <ul className="linea-tiempo">
          {[...lead.eventos].reverse().map((e) => (
            <li key={e.id} className={e.tipo === 'alerta' ? 'alerta' : e.tipo === 'cierre' ? 'cierre' : ''}>
              <div>{e.descripcion}</div>
              <div className="cuando">{fmtFecha(e.fecha)} · {e.actor}</div>
            </li>
          ))}
        </ul>

        {form === 'cotizacion' && <FormCotizacion lead={lead} onCerrar={() => setForm(null)} />}
        {form === 'confirmar' && <FormConfirmar lead={lead} onCerrar={() => setForm(null)} />}
        {form === 'oc' && <FormOC lead={lead} onCerrar={() => setForm(null)} />}
        {form === 'factura' && <FormFactura lead={lead} onCerrar={() => setForm(null)} />}
        {form === 'nota' && <FormNota lead={lead} onCerrar={() => setForm(null)} />}
      </div>
    </div>
  );
}
