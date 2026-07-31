import { useState } from 'react';
import type { OrdenCompra } from './types';
import { StoreProvider, useStore } from './store';
import { Tablero } from './components/Board';
import { PanelLead } from './components/Drawer';
import { FormNuevoLead } from './components/Forms';
import { Asistente } from './components/Asistente';
import { ListaOC } from './components/OCList';
import { OCDoc } from './components/OCDoc';
import { Sugerencias } from './components/Sugerencias';
import { WhatsAppPanel } from './components/WhatsAppPanel';
import { CrearOC } from './components/CrearOC';

type Vista = 'tablero' | 'ordenes' | 'crear_oc' | 'sugerencias' | 'whatsapp';

function Contenido() {
  const { estado, dispatch } = useStore();
  const [vista, setVista] = useState<Vista>('tablero');
  const [leadAbierto, setLeadAbierto] = useState<string | null>(null);
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [ocAbierta, setOcAbierta] = useState<OrdenCompra | null>(null);
  const lead = estado.leads.find((l) => l.id === leadAbierto) ?? null;

  return (
    <div className="app">
      <header className="encabezado no-print">
        <h1>Pipeline de precios especiales</h1>
        <nav className="pestanas">
          <button className={vista === 'tablero' ? 'activa' : ''} onClick={() => setVista('tablero')}>
            Tablero
          </button>
          <button className={vista === 'crear_oc' ? 'activa' : ''} onClick={() => setVista('crear_oc')}>
            Crear OC
          </button>
          <button className={vista === 'ordenes' ? 'activa' : ''} onClick={() => setVista('ordenes')}>
            Órdenes de compra
          </button>
          <button className={vista === 'sugerencias' ? 'activa' : ''} onClick={() => setVista('sugerencias')}>
            Sugerencias
            {estado.sugerencias.length > 0 && (
              <span className="badge-conteo">{estado.sugerencias.length}</span>
            )}
          </button>
          <button className={vista === 'whatsapp' ? 'activa' : ''} onClick={() => setVista('whatsapp')}>
            WhatsApp
          </button>
        </nav>
        <div className="acciones">
          <button
            onClick={() => {
              if (confirm('¿Limpiar leads, órdenes y sugerencias? El catálogo de proveedores se conserva.'))
                dispatch({ tipo: 'reiniciar_datos' });
            }}
          >
            Limpiar datos
          </button>
          <button className="primario" onClick={() => setNuevoAbierto(true)}>Nueva solicitud</button>
        </div>
      </header>

      {vista === 'tablero' && <Tablero onAbrir={setLeadAbierto} />}
      {vista === 'crear_oc' && <CrearOC onCreada={setOcAbierta} />}
      {vista === 'ordenes' && <ListaOC onVer={setOcAbierta} />}
      {vista === 'sugerencias' && <Sugerencias />}
      {vista === 'whatsapp' && <WhatsAppPanel />}

      {vista !== 'crear_oc' && (
        <Asistente
          onAplicada={(tipo) => {
            if (tipo === 'crear_oc_directa' || tipo === 'emitir_oc') setVista('ordenes');
          }}
        />
      )}

      {lead && (
        <PanelLead lead={lead} onCerrar={() => setLeadAbierto(null)} onVerOC={setOcAbierta} />
      )}
      {nuevoAbierto && <FormNuevoLead onCerrar={() => setNuevoAbierto(false)} />}
      {ocAbierta && <OCDoc oc={ocAbierta} onCerrar={() => setOcAbierta(null)} />}
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Contenido />
    </StoreProvider>
  );
}
