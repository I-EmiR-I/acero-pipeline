import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Accion, Estado } from './logic/reducer';

export type { Accion, Estado, LineaOCEntrada } from './logic/reducer';

interface Store {
  estado: Estado;
  dispatch: (a: Accion) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [errorApi, setErrorApi] = useState(false);
  const ocupado = useRef(false);

  const cargar = useCallback(async () => {
    if (ocupado.current) return;
    try {
      const r = await fetch('/api/estado');
      if (!r.ok) throw new Error(String(r.status));
      setEstado(await r.json());
      setErrorApi(false);
    } catch {
      setErrorApi(true);
    }
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 3000);
    return () => clearInterval(t);
  }, [cargar]);

  const dispatch = useCallback(async (a: Accion) => {
    ocupado.current = true;
    try {
      const r = await fetch('/api/accion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(a),
      });
      if (r.ok) setEstado(await r.json());
    } finally {
      ocupado.current = false;
    }
  }, []);

  if (!estado) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-2)' }}>
        {errorApi ? (
          <>
            No se pudo conectar con el servidor.
            <br />
            Arranca el backend con <code>pnpm server</code> en la carpeta del proyecto.
          </>
        ) : (
          'Conectando con el servidor…'
        )}
      </div>
    );
  }

  return <Ctx.Provider value={{ estado, dispatch }}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore fuera de StoreProvider');
  return s;
}
