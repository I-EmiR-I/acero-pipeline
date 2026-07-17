import type { Lead } from '../types';
import { ETAPAS } from '../types';
import { useStore } from '../store';
import { conciliar, diasDesde } from '../reconcile';

function TarjetaLead({ lead, onAbrir }: { lead: Lead; onAbrir: () => void }) {
  const estado = conciliar(lead);
  const parcial = estado !== null && !estado.completo && lead.facturas.length > 0 && lead.etapa !== 'cerrado';
  const dias = diasDesde(lead.actualizado);

  return (
    <button className={`tarjeta${parcial ? ' alerta' : ''}`} onClick={onAbrir}>
      <div className="cliente">{lead.cliente}</div>
      <div className="detalle">
        {lead.lineas.map((l) => `${l.producto} · ${l.cantidad} ${l.unidad}`).join(' — ')}
      </div>
      <div className="pie">
        <span>{dias === 0 ? 'hoy' : `hace ${dias} d`}</span>
        {parcial && <span className="insignia parcial">Entrega parcial</span>}
        {lead.etapa === 'cerrado' && lead.resultado === 'ganado' && <span className="insignia ganado">Ganado</span>}
        {lead.etapa === 'cerrado' && lead.resultado === 'perdido' && <span className="insignia perdido">Perdido</span>}
        {lead.etapa === 'cerrado' && lead.resultado === 'cancelado' && <span className="insignia neutro">Cancelado</span>}
      </div>
    </button>
  );
}

export function Tablero({ onAbrir }: { onAbrir: (leadId: string) => void }) {
  const { estado } = useStore();
  const leads = estado.leads;
  return (
    <div className="tablero">
      {ETAPAS.map((etapa) => {
        const propios = leads.filter((l) => l.etapa === etapa.id);
        return (
          <div className="columna" key={etapa.id}>
            <div className="columna-titulo">
              {etapa.nombre} <span className="conteo">{propios.length}</span>
            </div>
            <div className="columna-cuerpo">
              {propios.map((l) => (
                <TarjetaLead key={l.id} lead={l} onAbrir={() => onAbrir(l.id)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
