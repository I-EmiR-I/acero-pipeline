import { useState } from 'react';
import type { DatosEmpresa, OrdenCompra } from '../types';
import { EMPRESA as EMPRESA_DEFAULT } from '../empresa';
import { useStore } from '../store';

const money = (n: number) =>
  n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });

const FILAS_MIN = 12;

interface LineaEdit {
  codigo: string;
  cantidad: string;
  unidad: string;
  producto: string;
  precioUnitario: string;
}

export function OCDoc({ oc, onCerrar }: { oc: OrdenCompra; onCerrar: () => void }) {
  const { estado, empresa, dispatch } = useStore();
  const EMPRESA: DatosEmpresa = empresa ?? EMPRESA_DEFAULT;

  // Usa la versión viva del store (para reflejar ediciones); si no es directa, usa la que llegó.
  const ocViva = estado.ocsDirectas.find((o) => o.id === oc.id) ?? oc;
  const esDirecta = estado.ocsDirectas.some((o) => o.id === oc.id);

  const [editando, setEditando] = useState(false);
  const [lineasEdit, setLineasEdit] = useState<LineaEdit[]>([]);
  const [notaEdit, setNotaEdit] = useState('');
  const [guardando, setGuardando] = useState(false);

  const iniciarEdicion = () => {
    setLineasEdit(
      ocViva.lineas.map((l) => ({
        codigo: l.codigo ?? '',
        cantidad: String(l.cantidad),
        unidad: l.unidad,
        producto: l.producto,
        precioUnitario: String(l.precioUnitario),
      }))
    );
    setNotaEdit(ocViva.nota ?? '');
    setEditando(true);
  };

  const setLinea = (i: number, campo: keyof LineaEdit, valor: string) =>
    setLineasEdit(lineasEdit.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));
  const agregarLinea = () =>
    setLineasEdit([...lineasEdit, { codigo: '', cantidad: '', unidad: 'kg', producto: '', precioUnitario: '' }]);
  const quitarLinea = (i: number) => setLineasEdit(lineasEdit.filter((_, j) => j !== i));

  const guardar = async () => {
    const validas = lineasEdit.filter((l) => l.producto.trim() && Number(l.cantidad) > 0);
    if (validas.length === 0) return;
    setGuardando(true);
    await dispatch({
      tipo: 'editar_oc_directa',
      ocId: ocViva.id,
      nota: notaEdit.trim(),
      lineas: validas.map((l) => ({
        codigo: l.codigo.trim() || undefined,
        producto: l.producto.trim(),
        cantidad: Number(l.cantidad),
        unidad: l.unidad.trim() || 'kg',
        precioUnitario: Number(l.precioUnitario) || 0,
      })),
    });
    setGuardando(false);
    setEditando(false);
  };

  const p = ocViva.proveedorDatos;
  const vacias = Math.max(0, FILAS_MIN - (editando ? lineasEdit.length : ocViva.lineas.length));
  const fecha = new Date(ocViva.fecha).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return (
    <div className="oc-vista">
      <div className="oc-controles no-print">
        {!editando ? (
          <>
            <button onClick={onCerrar}>Cerrar</button>
            {esDirecta && <button onClick={iniciarEdicion}>Editar</button>}
            <button className="primario" onClick={() => window.print()}>Imprimir / guardar PDF</button>
          </>
        ) : (
          <>
            <button onClick={() => setEditando(false)}>Cancelar</button>
            <button className="primario" onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </>
        )}
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
                <div className="oc-caja-valor">{ocViva.noProveedor ?? '—'}</div>
              </div>
              <div className="oc-caja">
                <div className="oc-caja-titulo">Fecha</div>
                <div className="oc-caja-valor">{fecha}</div>
              </div>
              <div className="oc-caja">
                <div className="oc-caja-titulo">No. ORDEN</div>
                <div className="oc-caja-valor">{ocViva.folio}</div>
              </div>
              <div className="oc-caja">
                <div className="oc-caja-titulo">CONDICIONES DE PAGO</div>
                <div className="oc-caja-valor">{ocViva.condicionesPago ?? '—'}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="oc-proveedor">
          <div className="oc-proveedor-etiqueta">Proveedor</div>
          <div className="oc-proveedor-datos">
            <div><span>Nombre:</span> {p?.nombre ?? ocViva.proveedor}</div>
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
              <th style={{ width: '12%' }}>Cantidad</th>
              <th>Descripción</th>
              <th style={{ width: '12%' }}>Unidad</th>
              <th className="num" style={{ width: '16%' }}>$ X KG</th>
              {editando && <th className="no-print" style={{ width: '5%' }}></th>}
            </tr>
          </thead>
          <tbody>
            {editando
              ? lineasEdit.map((l, i) => (
                  <tr key={i}>
                    <td><input value={l.codigo} onChange={(e) => setLinea(i, 'codigo', e.target.value)} style={{ padding: 4 }} /></td>
                    <td><input type="number" value={l.cantidad} onChange={(e) => setLinea(i, 'cantidad', e.target.value)} style={{ padding: 4 }} /></td>
                    <td><input value={l.producto} onChange={(e) => setLinea(i, 'producto', e.target.value)} style={{ padding: 4 }} /></td>
                    <td><input value={l.unidad} onChange={(e) => setLinea(i, 'unidad', e.target.value)} style={{ padding: 4 }} /></td>
                    <td><input type="number" value={l.precioUnitario} onChange={(e) => setLinea(i, 'precioUnitario', e.target.value)} style={{ padding: 4 }} /></td>
                    <td className="no-print"><button className="mini peligro" onClick={() => quitarLinea(i)}>×</button></td>
                  </tr>
                ))
              : ocViva.lineas.map((l) => (
                  <tr key={l.lineaId}>
                    <td>{l.codigo ?? ''}</td>
                    <td className="num">{l.cantidad.toLocaleString('es-MX')}</td>
                    <td>{l.producto.toUpperCase()}</td>
                    <td className="centro">{l.unidad.toUpperCase()}</td>
                    <td className="num">{money(l.precioUnitario)} /kg</td>
                  </tr>
                ))}
            {!editando &&
              Array.from({ length: vacias }).map((_, i) => (
                <tr key={`v${i}`}>
                  <td>&nbsp;</td><td></td><td></td><td></td><td></td>
                </tr>
              ))}
          </tbody>
        </table>

        {editando && (
          <button className="mini no-print" onClick={agregarLinea} style={{ marginTop: 6 }}>
            + Agregar línea
          </button>
        )}

        <div className="oc-pie">
          <div className="oc-nota">
            <span>NOTA:</span>{' '}
            {editando ? (
              <input value={notaEdit} onChange={(e) => setNotaEdit(e.target.value)} style={{ padding: 4, width: '80%' }} />
            ) : (
              ocViva.nota ?? ''
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
