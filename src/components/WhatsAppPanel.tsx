import { useEffect, useState } from 'react';
import { useStore } from '../store';

interface EstadoWA {
  conexion: 'iniciando' | 'esperando_qr' | 'esperando_codigo' | 'conectado' | 'desconectado' | 'error';
  qr: string | null;
  pairing: string | null;
  error: string | null;
  grupos: { jid: string; nombre: string; mensajes: number }[];
}

const ETIQUETAS: Record<EstadoWA['conexion'], string> = {
  iniciando: 'Iniciando conexión…',
  esperando_qr: 'Esperando que escanees el código QR',
  esperando_codigo: 'Esperando que ingreses el código',
  conectado: 'Conectado',
  desconectado: 'Desconectado',
  error: 'Error',
};

export function WhatsAppPanel() {
  const { estado: store, dispatch } = useStore();
  const [estado, setEstado] = useState<EstadoWA | null>(null);
  const [telefono, setTelefono] = useState('');
  const [pidiendo, setPidiendo] = useState(false);
  const grupoComandos = store.config.grupoComandosJid ?? '';

  const pedirCodigo = async () => {
    setPidiendo(true);
    try {
      await fetch('/api/whatsapp/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefono }),
      });
    } finally {
      setPidiendo(false);
    }
  };

  useEffect(() => {
    const cargar = async () => {
      try {
        const r = await fetch('/api/whatsapp/estado');
        if (r.ok) setEstado(await r.json());
      } catch {
        /* servidor apagado; el StoreProvider ya avisa */
      }
    };
    cargar();
    const t = setInterval(cargar, 3000);
    return () => clearInterval(t);
  }, []);

  if (!estado) return <div style={{ padding: 24, color: 'var(--text-2)' }}>Cargando…</div>;

  return (
    <div style={{ padding: '16px 20px', maxWidth: 640 }}>
      <div className="ficha" style={{ background: 'var(--surface)' }}>
        <div className="titulo">
          Estado:{' '}
          <span className={`insignia ${estado.conexion === 'conectado' ? 'ganado' : 'neutro'}`}>
            {ETIQUETAS[estado.conexion]}
          </span>
        </div>
        {estado.error && <div style={{ color: 'var(--danger)', marginTop: 6 }}>{estado.error}</div>}
        {estado.qr && (
          <div style={{ textAlign: 'center', margin: '12px 0' }}>
            <img src={estado.qr} alt="Código QR de WhatsApp" style={{ borderRadius: 8 }} />
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 8 }}>
              En el teléfono del número dedicado: WhatsApp → Ajustes → Dispositivos vinculados →
              Vincular un dispositivo, y escanea este código.
            </div>
          </div>
        )}
        {estado.pairing && (
          <div style={{ textAlign: 'center', margin: '12px 0' }}>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 6 }}>Tu código de vinculación:</div>
            <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: '0.15em', fontFamily: 'monospace' }}>
              {estado.pairing}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 8 }}>
              En el teléfono: WhatsApp → Ajustes → Dispositivos vinculados → Vincular un dispositivo →
              <strong> Vincular con número de teléfono</strong>, e ingresa este código.
            </div>
          </div>
        )}
        {estado.conexion === 'conectado' && (
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 6 }}>
            Agrega este número a un grupo con el proveedor y el bot empezará a escuchar. Las
            cotizaciones detectadas aparecen en la pestaña Sugerencias.
          </div>
        )}
        {estado.conexion !== 'conectado' && !estado.pairing && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <label>¿Problemas con el QR? Vincula con código de teléfono</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="Ej. 528112446576 (lada + número)"
              />
              <button className="primario" onClick={pedirCodigo} disabled={pidiendo || telefono.replace(/\D/g, '').length < 10}>
                {pidiendo ? 'Generando…' : 'Obtener código'}
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
              Es el número del WhatsApp que quieres vincular, con lada del país (México = 52). Sin espacios ni +.
            </div>
          </div>
        )}
      </div>

      <h3 style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--text-3)', margin: '18px 0 8px' }}>
        Grupo de comandos de OC
      </h3>
      <div className="ficha" style={{ background: 'var(--surface)' }}>
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 8 }}>
          Elige el grupo donde dictarás órdenes de compra. En ese grupo, escribe:
          <div style={{ margin: '6px 0', fontFamily: 'monospace', fontSize: 12, color: 'var(--text)' }}>
            OC Aceros del Norte: 200 PTR 1/2 a 23.5 el kg
          </div>
          El bot responde con el resumen y el total; respondes <strong>CONFIRMAR</strong> y se crea la OC.
        </div>
        <label>Grupo designado</label>
        <select
          value={grupoComandos}
          onChange={(e) => {
            const g = estado.grupos.find((x) => x.jid === e.target.value);
            dispatch({
              tipo: 'set_grupo_comandos',
              grupoComandosJid: e.target.value || undefined,
              grupoComandosNombre: g?.nombre,
            });
          }}
        >
          <option value="">— Ninguno (comandos desactivados) —</option>
          {estado.grupos.map((g) => (
            <option key={g.jid} value={g.jid}>
              {g.nombre}
            </option>
          ))}
        </select>
        {store.config.grupoComandosNombre && (
          <div style={{ fontSize: 12, color: 'var(--ok)', marginTop: 6 }}>
            Activo en: {store.config.grupoComandosNombre}
          </div>
        )}
        {estado.grupos.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
            El grupo aparecerá aquí después de que llegue el primer mensaje a un grupo donde esté el bot.
          </div>
        )}
      </div>

      <h3 style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--text-3)', margin: '18px 0 8px' }}>
        Grupos monitoreados
      </h3>
      {estado.grupos.length === 0 ? (
        <div style={{ color: 'var(--text-2)', fontSize: 13 }}>
          Aún no llegan mensajes de ningún grupo.
        </div>
      ) : (
        <table className="tabla" style={{ background: 'var(--surface)', borderRadius: 10 }}>
          <thead>
            <tr>
              <th>Grupo</th>
              <th className="num">Mensajes recibidos</th>
            </tr>
          </thead>
          <tbody>
            {estado.grupos.map((g) => (
              <tr key={g.jid}>
                <td>{g.nombre}</td>
                <td className="num">{g.mensajes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
