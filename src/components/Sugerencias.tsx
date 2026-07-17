import { useStore } from '../store';
import { fmtFecha, fmtMoneda } from '../reconcile';

export function Sugerencias() {
  const { estado, dispatch } = useStore();
  const sugerencias = estado.sugerencias;

  if (sugerencias.length === 0)
    return (
      <div style={{ padding: 24, color: 'var(--text-2)' }}>
        No hay sugerencias pendientes. Cuando el bot detecte una cotización en un grupo de
        WhatsApp, aparecerá aquí para que la conviertas en lead.
      </div>
    );

  return (
    <div style={{ padding: '16px 20px', display: 'grid', gap: 12, maxWidth: 720 }}>
      {sugerencias.map((s) => (
        <div className="sugerencia" key={s.id}>
          <div className="sugerencia-encabezado">
            <span className="insignia parcial">WhatsApp</span>
            <strong>{s.grupo}</strong>
            <span className={`insignia ${s.tipo === 'actualizar' ? 'ganado' : 'neutro'}`}>
              {s.tipo === 'actualizar' ? 'Actualiza lead' : 'Lead nuevo'}
            </span>
            <span style={{ color: 'var(--text-3)', fontSize: 12 }}>{fmtFecha(s.fecha)}</span>
          </div>
          <div style={{ margin: '6px 0' }}>{s.cambio ?? s.resumen}</div>
          {s.cliente && <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Cliente: {s.cliente}</div>}
          <ul style={{ margin: '6px 0', paddingLeft: 18, fontSize: 13 }}>
            {s.lineas.map((l, i) => (
              <li key={i}>
                {l.producto}
                {l.cantidad ? ` — ${l.cantidad} ${l.unidad ?? ''}` : ''}
                {l.precioUnitario ? ` × ${fmtMoneda(l.precioUnitario)}` : ' (sin precio aún)'}
              </li>
            ))}
          </ul>
          <details style={{ fontSize: 12, color: 'var(--text-2)', margin: '6px 0' }}>
            <summary style={{ cursor: 'pointer' }}>Ver mensajes ({s.mensajes.length})</summary>
            <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
              {s.mensajes.map((m, i) => (
                <div key={i}>
                  <strong>{m.de}:</strong> {m.texto}
                </div>
              ))}
            </div>
          </details>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              className="mini"
              onClick={() => dispatch({ tipo: 'descartar_sugerencia', sugerenciaId: s.id })}
            >
              Descartar
            </button>
            <button
              className="mini primario"
              onClick={() => dispatch({ tipo: 'aceptar_sugerencia', sugerenciaId: s.id, actor: 'Compras' })}
            >
              {s.tipo === 'actualizar' ? 'Aplicar al lead' : 'Crear lead'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
