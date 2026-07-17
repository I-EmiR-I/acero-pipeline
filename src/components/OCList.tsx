import type { OrdenCompra } from '../types';
import { useStore } from '../store';
import { fmtFecha, fmtMoneda } from '../reconcile';
import { IVA_TASA } from '../empresa';

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
  const ocs = todasLasOCs(estado.leads, estado.ocsDirectas);

  if (ocs.length === 0)
    return <div style={{ padding: 24, color: 'var(--text-2)' }}>Aún no hay órdenes de compra.</div>;

  return (
    <div style={{ padding: '16px 20px', maxWidth: 860 }}>
      <table className="tabla" style={{ background: 'var(--surface)', borderRadius: 10, padding: 8 }}>
        <thead>
          <tr>
            <th>No. orden</th>
            <th>Proveedor</th>
            <th>Origen</th>
            <th>Fecha</th>
            <th className="num">Total (c/IVA)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {ocs.map(({ oc, origen }) => {
            const subtotal = oc.lineas.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0);
            return (
              <tr key={oc.id}>
                <td><strong>{oc.folio}</strong></td>
                <td>{oc.proveedor}</td>
                <td>{origen}</td>
                <td>{fmtFecha(oc.fecha)}</td>
                <td className="num">{fmtMoneda(subtotal * (1 + IVA_TASA))}</td>
                <td><button className="mini" onClick={() => onVer(oc)}>Ver / imprimir</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
