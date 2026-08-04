import { useEffect, useState } from 'react';
import type { DatosProveedor, MensajeWA, OrdenCompra, Proveedor } from '../types';
import { useStore } from '../store';
import { extraerLineasOC } from '../llm';

interface LineaEditable {
  producto: string;
  cantidad: string;
  unidad: string;
  precioUnitario: string;
}

const provVacio = (): Omit<Proveedor, 'id'> => ({
  nombre: '',
  rfc: '',
  domicilio: '',
  colonia: '',
  municipio: '',
  estado: '',
  pais: 'México',
  condicionesPago: '30 DÍAS',
});

export function CrearOC({ onCreada }: { onCreada: (oc: OrdenCompra) => void }) {
  const { estado, dispatch } = useStore();
  const [grupos, setGrupos] = useState<{ jid: string; nombre: string }[]>([]);
  const [grupoJid, setGrupoJid] = useState('');
  const [mensajes, setMensajes] = useState<MensajeWA[]>([]);

  const [proveedorId, setProveedorId] = useState<string>('');
  const [editandoProv, setEditandoProv] = useState(false);
  const [provDraft, setProvDraft] = useState<Omit<Proveedor, 'id'> & { id?: string }>(provVacio());

  const [dictado, setDictado] = useState('');
  const [lineas, setLineas] = useState<LineaEditable[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [folio, setFolio] = useState('');
  const [nota, setNota] = useState('');
  const [creando, setCreando] = useState(false);

  useEffect(() => {
    fetch('/api/whatsapp/estado')
      .then((r) => r.json())
      .then((d) => setGrupos(d.grupos ?? []))
      .catch(() => setGrupos([]));
  }, []);

  useEffect(() => {
    if (!grupoJid) {
      setMensajes([]);
      return;
    }
    // Si un proveedor está ligado a este grupo, selecciónalo.
    const ligado = estado.proveedores.find((p) => p.grupoJid === grupoJid);
    if (ligado) setProveedorId(ligado.id);
    fetch(`/api/whatsapp/grupo/mensajes?jid=${encodeURIComponent(grupoJid)}`)
      .then((r) => r.json())
      .then((d) => setMensajes(d.mensajes ?? []))
      .catch(() => setMensajes([]));
  }, [grupoJid, estado.proveedores]);

  const proveedorSel = estado.proveedores.find((p) => p.id === proveedorId);

  const iniciarNuevoProveedor = () => {
    setProveedorId('');
    setProvDraft({ ...provVacio(), grupoJid: grupoJid || undefined });
    setEditandoProv(true);
  };

  const editarProveedor = () => {
    if (!proveedorSel) return;
    setProvDraft({ ...proveedorSel });
    setEditandoProv(true);
  };

  const guardarProveedor = async () => {
    if (!provDraft.nombre.trim()) return;
    const nuevo = await dispatch({ tipo: 'guardar_proveedor', proveedor: provDraft });
    if (nuevo) {
      // Selecciona el proveedor recién guardado (por nombre + rfc).
      const guardado =
        nuevo.proveedores.find((p) => p.id === provDraft.id) ??
        nuevo.proveedores.find((p) => p.nombre === provDraft.nombre);
      if (guardado) setProveedorId(guardado.id);
    }
    setEditandoProv(false);
  };

  const extraer = async () => {
    if (!dictado.trim() || cargando) return;
    setCargando(true);
    setError(null);
    try {
      const res = await extraerLineasOC(dictado.trim());
      if (res.length === 0) {
        setError('No detecté productos con precio en el dictado. Sé explícito: "200 PTR 1/2 a 23.5 el kg".');
      }
      setLineas(
        res.map((l) => ({
          producto: l.producto,
          cantidad: String(l.cantidad),
          unidad: l.unidad,
          precioUnitario: String(l.precioUnitario),
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  };

  const setLinea = (i: number, campo: keyof LineaEditable, valor: string) =>
    setLineas(lineas.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));

  const agregarLinea = () =>
    setLineas([...lineas, { producto: '', cantidad: '', unidad: 'ton', precioUnitario: '' }]);

  const lineasValidas = lineas.filter(
    (l) => l.producto.trim() && Number(l.cantidad) > 0 && Number(l.precioUnitario) > 0
  );
  const puedeCrear = proveedorSel && lineasValidas.length > 0 && !creando;

  const crear = async () => {
    if (!proveedorSel) return;
    setCreando(true);
    const datos: DatosProveedor = {
      nombre: proveedorSel.nombre,
      rfc: proveedorSel.rfc,
      domicilio: proveedorSel.domicilio,
      colonia: proveedorSel.colonia,
      localidad: proveedorSel.localidad,
      municipio: proveedorSel.municipio,
      estado: proveedorSel.estado,
      pais: proveedorSel.pais,
    };
    const nuevo = await dispatch({
      tipo: 'crear_oc_directa',
      proveedor: datos,
      proveedorId: proveedorSel.id,
      noProveedor: proveedorSel.noProveedor,
      condicionesPago: proveedorSel.condicionesPago,
      nota: nota.trim() || undefined,
      folio: folio.trim() || undefined,
      lineas: lineasValidas.map((l) => ({
        producto: l.producto.trim(),
        cantidad: Number(l.cantidad),
        unidad: l.unidad,
        precioUnitario: Number(l.precioUnitario),
      })),
      actor: 'Compras',
    });
    setCreando(false);
    if (nuevo && nuevo.ocsDirectas[0]) {
      setDictado('');
      setLineas([]);
      setNota('');
      setFolio('');
      onCreada(nuevo.ocsDirectas[0]);
    }
  };

  return (
    <div className="crear-oc">
      <div className="crear-oc-col">
        <h3>1. Proveedor</h3>
        <div className="campo">
          <label>Grupo de WhatsApp (referencia, opcional)</label>
          <select value={grupoJid} onChange={(e) => setGrupoJid(e.target.value)}>
            <option value="">— Sin grupo —</option>
            {grupos.map((g) => (
              <option key={g.jid} value={g.jid}>
                {g.nombre}
              </option>
            ))}
          </select>
        </div>

        {mensajes.length > 0 && (
          <details className="crear-oc-ref">
            <summary>Ver conversación del grupo ({mensajes.length} mensajes)</summary>
            <div className="crear-oc-mensajes">
              {mensajes.map((m, i) => (
                <div key={i}>
                  <strong>{m.de}:</strong> {m.texto}
                </div>
              ))}
            </div>
          </details>
        )}

        {!editandoProv ? (
          <>
            <div className="campo">
              <label>Proveedor</label>
              <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
                <option value="">— Selecciona —</option>
                {estado.proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="mini" onClick={iniciarNuevoProveedor}>
                + Nuevo proveedor
              </button>
              {proveedorSel && (
                <button className="mini" onClick={editarProveedor}>
                  Editar
                </button>
              )}
            </div>
            {proveedorSel && (
              <div className="ficha" style={{ marginTop: 10 }}>
                <div className="muted">RFC: {proveedorSel.rfc || '—'}</div>
                <div className="muted">
                  {[proveedorSel.domicilio, proveedorSel.colonia, proveedorSel.municipio, proveedorSel.estado]
                    .filter(Boolean)
                    .join(', ') || 'Sin domicilio'}
                </div>
                <div className="muted">Condiciones: {proveedorSel.condicionesPago || '—'}</div>
              </div>
            )}
          </>
        ) : (
          <div className="ficha">
            <div className="campo">
              <label>Nombre *</label>
              <input
                value={provDraft.nombre}
                onChange={(e) => setProvDraft({ ...provDraft, nombre: e.target.value })}
                autoFocus
              />
            </div>
            <div className="fila campo">
              <div>
                <label>RFC</label>
                <input value={provDraft.rfc ?? ''} onChange={(e) => setProvDraft({ ...provDraft, rfc: e.target.value })} />
              </div>
              <div>
                <label>Condiciones de pago</label>
                <input
                  value={provDraft.condicionesPago ?? ''}
                  onChange={(e) => setProvDraft({ ...provDraft, condicionesPago: e.target.value })}
                />
              </div>
            </div>
            <div className="campo">
              <label>Domicilio</label>
              <input value={provDraft.domicilio ?? ''} onChange={(e) => setProvDraft({ ...provDraft, domicilio: e.target.value })} />
            </div>
            <div className="fila campo">
              <div>
                <label>Colonia</label>
                <input value={provDraft.colonia ?? ''} onChange={(e) => setProvDraft({ ...provDraft, colonia: e.target.value })} />
              </div>
              <div>
                <label>Municipio</label>
                <input value={provDraft.municipio ?? ''} onChange={(e) => setProvDraft({ ...provDraft, municipio: e.target.value })} />
              </div>
              <div>
                <label>Estado</label>
                <input value={provDraft.estado ?? ''} onChange={(e) => setProvDraft({ ...provDraft, estado: e.target.value })} />
              </div>
            </div>
            <div className="campo">
              <label>Último número de orden usado (la próxima OC será este + 1)</label>
              <input
                type="number"
                min="0"
                value={provDraft.ultimoFolio ?? ''}
                onChange={(e) =>
                  setProvDraft({
                    ...provDraft,
                    ultimoFolio: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
                placeholder="Ej. 100 → la próxima orden será 101"
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="mini" onClick={() => setEditandoProv(false)}>
                Cancelar
              </button>
              <button className="mini primario" disabled={!provDraft.nombre.trim()} onClick={guardarProveedor}>
                Guardar proveedor
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="crear-oc-col">
        <h3>2. Dicta los materiales y el precio por kg</h3>
        <textarea
          rows={3}
          value={dictado}
          onChange={(e) => setDictado(e.target.value)}
          placeholder='Ej. "100 toneladas de varilla 3/8 a 16.50 y 100 paquetes de malla a 12"'
        />
        <div style={{ marginTop: 8 }}>
          <button className="primario" onClick={extraer} disabled={cargando || !dictado.trim()}>
            {cargando ? 'Leyendo…' : 'Extraer líneas'}
          </button>
        </div>
        {error && <div className="asistente-error" style={{ marginTop: 10 }}>{error}</div>}

        {lineas.length > 0 && (
          <>
            <h3>3. Revisa y confirma</h3>
            <table className="tabla crear-oc-tabla">
              <thead>
                <tr>
                  <th className="num">Cantidad</th>
                  <th>Unidad</th>
                  <th>Material</th>
                  <th className="num">$ x kg</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={l.cantidad}
                        onChange={(e) => setLinea(i, 'cantidad', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        value={l.unidad}
                        onChange={(e) => setLinea(i, 'unidad', e.target.value)}
                        placeholder="ton, kg, pza, paquete…"
                      />
                    </td>
                    <td>
                      <input value={l.producto} onChange={(e) => setLinea(i, 'producto', e.target.value)} />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={l.precioUnitario}
                        onChange={(e) => setLinea(i, 'precioUnitario', e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="mini" onClick={agregarLinea} style={{ marginTop: 6 }}>
              + Agregar línea
            </button>

            <div className="fila campo" style={{ marginTop: 14 }}>
              <div>
                <label>Folio (opcional)</label>
                <input
                  value={folio}
                  onChange={(e) => setFolio(e.target.value)}
                  placeholder={
                    proveedorSel && proveedorSel.ultimoFolio !== undefined
                      ? `${proveedorSel.ultimoFolio + 1} (automático de ${proveedorSel.nombre})`
                      : `${estado.folioSiguiente} (automático)`
                  }
                />
              </div>
              <div style={{ flex: 2 }}>
                <label>Nota (opcional)</label>
                <input value={nota} onChange={(e) => setNota(e.target.value)} />
              </div>
            </div>

            {!proveedorSel && (
              <div className="asistente-aviso">Selecciona o crea un proveedor para poder generar la OC.</div>
            )}
            <div style={{ marginTop: 10 }}>
              <button className="primario" disabled={!puedeCrear} onClick={crear}>
                {creando ? 'Generando…' : 'Generar orden de compra'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
