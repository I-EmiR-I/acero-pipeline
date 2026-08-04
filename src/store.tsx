import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Accion, Estado } from './logic/reducer';
import type { DatosEmpresa } from './types';

export type { Accion, Estado, LineaOCEntrada } from './logic/reducer';

interface Store {
  estado: Estado;
  empresa: DatosEmpresa | null;
  dispatch: (a: Accion) => Promise<Estado | null>;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [empresa, setEmpresa] = useState<DatosEmpresa | null>(null);
  const [errorApi, setErrorApi] = useState(false);
  const [necesitaLogin, setNecesitaLogin] = useState(false);
  const ocupado = useRef(false);

  const cargar = useCallback(async () => {
    if (ocupado.current) return;
    try {
      const r = await fetch('/api/estado');
      if (r.status === 401) {
        setNecesitaLogin(true);
        return;
      }
      if (!r.ok) throw new Error(String(r.status));
      setEstado(await r.json());
      setNecesitaLogin(false);
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

  // Datos de empresa: se cargan una vez desde el backend (siempre correctos, no dependen del build).
  useEffect(() => {
    if (!estado || empresa) return;
    fetch('/api/empresa')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setEmpresa(d))
      .catch(() => {});
  }, [estado, empresa]);

  if (necesitaLogin) return <Login onEntrar={cargar} />;

  const dispatch = useCallback(async (a: Accion): Promise<Estado | null> => {
    ocupado.current = true;
    try {
      const r = await fetch('/api/accion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(a),
      });
      if (r.ok) {
        const nuevo = (await r.json()) as Estado;
        setEstado(nuevo);
        return nuevo;
      }
      return null;
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

  return <Ctx.Provider value={{ estado, empresa, dispatch }}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore fuera de StoreProvider');
  return s;
}

function Login({ onEntrar }: { onEntrar: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [cargando, setCargando] = useState(false);

  const entrar = async () => {
    if (!password || cargando) return;
    setCargando(true);
    setError(false);
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (r.ok) onEntrar();
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 320, textAlign: 'center' }}>
        <h1 style={{ fontSize: 20, marginBottom: 4 }}>Sistema de compras</h1>
        <p style={{ color: 'var(--text-2)', fontSize: 14, marginBottom: 16 }}>Ingresa la contraseña para continuar.</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && entrar()}
          placeholder="Contraseña"
          autoFocus
        />
        {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>Contraseña incorrecta.</div>}
        <button className="primario" style={{ width: '100%', marginTop: 12 }} onClick={entrar} disabled={cargando}>
          {cargando ? 'Entrando…' : 'Entrar'}
        </button>
      </div>
    </div>
  );
}
