import { useState } from 'react';
import * as XLSX from 'xlsx';
import type { Proveedor } from '../types';
import { useStore } from '../store';

type ProvImport = Omit<Proveedor, 'id'>;

const clean = (v: unknown): string | undefined => {
  const s = v == null ? '' : String(v).trim();
  return s ? s : undefined;
};

/** Lee el Excel (columnas: PROVEEDOR, RFC, DOMICILIO, COLONIA, LOCALIDAD, CORREO DE VENDEDOR). */
function parsearExcel(buf: ArrayBuffer): ProvImport[] {
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
  // Encuentra la fila de encabezado (la que tiene "PROVEEDOR").
  const iHead = filas.findIndex((f) => String(f?.[0] ?? '').trim().toUpperCase() === 'PROVEEDOR');
  const inicio = iHead >= 0 ? iHead + 1 : 0;
  const provs: ProvImport[] = [];
  for (let i = inicio; i < filas.length; i++) {
    const f = filas[i];
    const nombre = clean(f?.[0]);
    if (!nombre) continue;
    const localidad = clean(f?.[4]);
    provs.push({
      nombre,
      rfc: clean(f?.[1]),
      domicilio: clean(f?.[2]),
      colonia: clean(f?.[3]),
      localidad,
      municipio: localidad,
      pais: 'México',
      condicionesPago: '30 DÍAS',
      emailVendedor: clean(f?.[5]),
    });
  }
  return provs;
}

export function ImportarProveedores() {
  const { dispatch } = useStore();
  const [preview, setPreview] = useState<ProvImport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);

  const onArchivo = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setResultado(null);
    try {
      const buf = await file.arrayBuffer();
      const provs = parsearExcel(buf);
      if (provs.length === 0) setError('No encontré proveedores en el archivo. Revisa que tenga la columna PROVEEDOR.');
      setPreview(provs);
    } catch (e) {
      setError('No pude leer el archivo: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const importar = async () => {
    if (!preview || preview.length === 0) return;
    setImportando(true);
    const nuevo = await dispatch({ tipo: 'importar_proveedores', proveedores: preview });
    setImportando(false);
    if (nuevo) {
      setResultado(`Se importaron ${nuevo.proveedores.length} proveedores.`);
      setPreview(null);
    }
  };

  return (
    <div className="ficha" style={{ background: 'var(--surface)' }}>
      <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 8 }}>
        Sube el Excel de proveedores (columnas: Proveedor, RFC, Domicilio, Colonia, Localidad, Correo).
        Se conservan los números de orden de proveedores que ya existan.
      </div>
      <input type="file" accept=".xlsx,.xls" onChange={(e) => onArchivo(e.target.files?.[0])} />
      {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{error}</div>}
      {preview && preview.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 13 }}>Detecté <strong>{preview.length}</strong> proveedores (ej. {preview[0].nombre}, {preview[1]?.nombre}…).</div>
          <button className="primario mini" style={{ marginTop: 8 }} onClick={importar} disabled={importando}>
            {importando ? 'Importando…' : `Importar ${preview.length} proveedores`}
          </button>
        </div>
      )}
      {resultado && <div style={{ color: 'var(--ok)', fontSize: 13, marginTop: 8 }}>{resultado}</div>}
    </div>
  );
}
