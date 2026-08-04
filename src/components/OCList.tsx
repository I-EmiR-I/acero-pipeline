import { useState } from 'react';
import type { OrdenCompra } from '../types';
import { useStore } from '../store';
import { fmtFecha } from '../reconcile';

export interface OCConOrigen {
  oc: OrdenCompra;
  origen: string;
}

export function todasLasOCs(leads: { cliente: string; ordenCompra?: OrdenCompra }[], directas: OrdenCompra[]): OCConOrigen[] {
  const deLeads = leads
    .filter((l) => l.ordenCompra)
    .map((l) => ({ oc: l.ordenCompra!, origen: `Lead: ${l.cliente}` }));
  const dir = directas.map((oc) => ({ oc, origen: 'OC directa' }));
  return [...deLeads, ...dir].sort((a, b) => b.oc.fecha.localeCompare(a.oc.fecha));
}

export function ListaOC({ onVer }: { onVer: (oc: OrdenCompra) => void }) {
  const { estado } = useStore();
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const ocs = todasLasOCs(estado.leads, estado.ocsDirectas);

  if (ocs.length === 0)
    return <div style={{ padding: 24, color: 'var(--text-2)' }}>Aún no hay órdenes de compra.</div>;

  // Agrupa por proveedor (carpetas).
  const grupos = new Map<string, OCConOrigen[]>();
  for (const item of ocs) {
    const key = item.oc.proveedor || '(sin proveedor)';
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key)!.push(item);
  }
  const carpetas = [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const toggle = (nombre: string) => setAbiertos((a) => ({ ...a, [nombre]: !a[nombre] }));

  return (
    <div style={{ padding: '16px 20px', maxWidth: 860, display: 'grid', gap: 10 }}>
      {carpetas.map(([proveedor, items]) => {
        const abierto = abiertos[proveedor] ?? false;
        return (
          <div key={proveedor} className="ficha" style={{ background: 'var(--surface)', padding: 0, overflow: 'hidden' }}>
            <button
              onClick={() => toggle(proveedor)}
              style={{
                width: '100%',
                border: 'none',
                background: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 14px',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span style={{ color: 'var(--text-3)', width: 12 }}>{abierto ? '▾' : '▸'}</span>
              <strong style={{ flex: 1 }}>{proveedor}</strong>
              <span className="insignia neutro">{items.length} {items.length === 1 ? 'orden' : 'órdenes'}</span>
            </button>
            {abierto && (
              <table className="tabla" style={{ borderTop: '1px solid var(--border)' }}>
                <thead>
                  <tr>
                    <th style={{ paddingLeft: 14 }}>No. orden</th>
                    <th>Origen</th>
                    <th>Fecha</th>
                    <th className="num">Materiales</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(({ oc, origen }) => (
                    <tr key={oc.id}>
                      <td style={{ paddingLeft: 14 }}><strong>{oc.folio}</strong></td>
                      <td>{origen}</td>
                      <td>{fmtFecha(oc.fecha)}</td>
                      <td className="num">{oc.lineas.length}</td>
                      <td><button className="mini" onClick={() => onVer(oc)}>Ver / imprimir</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}
