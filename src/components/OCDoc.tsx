import type { OrdenCompra } from '../types';
import { EMPRESA, IVA_TASA } from '../empresa';

const money = (n: number) =>
  n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });

const FILAS_MIN = 12;

export function OCDoc({ oc, onCerrar }: { oc: OrdenCompra; onCerrar: () => void }) {
  const subtotal = oc.lineas.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0);
  const iva = subtotal * IVA_TASA;
  const p = oc.proveedorDatos;
  const vacias = Math.max(0, FILAS_MIN - oc.lineas.length);
  const fecha = new Date(oc.fecha).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return (
    <div className="oc-vista">
      <div className="oc-controles no-print">
        <button onClick={onCerrar}>Cerrar</button>
        <button className="primario" onClick={() => window.print()}>Imprimir / guardar PDF</button>
      </div>
      <div className="oc-hoja">
        <div className="oc-encabezado">
          <div className="oc-empresa">
            <div className="oc-razon">{EMPRESA.razonSocial}</div>
            <div>RFC: {EMPRESA.rfc}</div>
            <div>{EMPRESA.direccion}</div>
            <div>{EMPRESA.localidad}</div>
            <div>{EMPRESA.telefono}</div>
            <div>{EMPRESA.celular}</div>
            <div>eMail: {EMPRESA.email}</div>
          </div>
          <div className="oc-titulo-bloque">
            <div className="oc-titulo">ORDEN DE COMPRA</div>
            <div className="oc-cajas">
              <div className="oc-caja">
                <div className="oc-caja-titulo">No. De Proveedor</div>
                <div className="oc-caja-valor">{oc.noProveedor ?? '—'}</div>
              </div>
              <div className="oc-caja">
                <div className="oc-caja-titulo">Fecha</div>
                <div className="oc-caja-valor">{fecha}</div>
              </div>
              <div className="oc-caja">
                <div className="oc-caja-titulo">No. ORDEN</div>
                <div className="oc-caja-valor">{oc.folio}</div>
              </div>
              <div className="oc-caja">
                <div className="oc-caja-titulo">CONDICIONES DE PAGO</div>
                <div className="oc-caja-valor">{oc.condicionesPago ?? '—'}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="oc-proveedor">
          <div className="oc-proveedor-etiqueta">Proveedor</div>
          <div className="oc-proveedor-datos">
            <div><span>Nombre:</span> {p?.nombre ?? oc.proveedor}</div>
            <div><span>Localidad:</span> {p?.localidad ?? ''}</div>
            <div><span>R.F.C.:</span> {p?.rfc ?? ''}</div>
            <div><span>Estado:</span> {p?.estado ?? ''}</div>
            <div><span>Domicilio:</span> {p?.domicilio ?? ''}</div>
            <div><span>Municipio:</span> {p?.municipio ?? ''}</div>
            <div><span>Colonia:</span> {p?.colonia ?? ''}</div>
            <div><span>País:</span> {p?.pais ?? 'México'}</div>
          </div>
        </div>

        <table className="oc-tabla">
          <thead>
            <tr>
              <th style={{ width: '10%' }}>Codigo</th>
              <th style={{ width: '11%' }}>Cantidad</th>
              <th>Descripción</th>
              <th style={{ width: '9%' }}>Unidad</th>
              <th className="num" style={{ width: '12%' }}>$ X {oc.lineas[0]?.unidad?.toUpperCase() || 'UNIDAD'}</th>
              <th style={{ width: '14%' }}>Importe</th>
            </tr>
          </thead>
          <tbody>
            {oc.lineas.map((l) => (
              <tr key={l.lineaId}>
                <td>{l.codigo ?? ''}</td>
                <td className="num">{l.cantidad.toLocaleString('es-MX')}</td>
                <td>{l.producto.toUpperCase()}</td>
                <td className="centro">{l.unidad.toUpperCase()}</td>
                <td className="num">{money(l.precioUnitario)}</td>
                <td className="num">{money(l.cantidad * l.precioUnitario)}</td>
              </tr>
            ))}
            {Array.from({ length: vacias }).map((_, i) => (
              <tr key={`v${i}`}>
                <td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="oc-pie">
          <div className="oc-nota">
            <span>NOTA:</span> {oc.nota ?? ''}
          </div>
          <table className="oc-totales">
            <tbody>
              <tr><td>SUBTOTAL:</td><td className="num">{money(subtotal)}</td></tr>
              <tr><td>IVA:</td><td className="num">{money(iva)}</td></tr>
              <tr><td>TOTAL:</td><td className="num">{money(subtotal + iva)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
