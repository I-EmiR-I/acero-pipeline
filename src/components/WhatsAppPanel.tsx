import { useEffect, useState } from 'react';

interface EstadoWA {
  conexion: 'iniciando' | 'esperando_qr' | 'conectado' | 'desconectado' | 'error';
  qr: string | null;
  error: string | null;
  grupos: { jid: string; nombre: string; mensajes: number }[];
}

const ETIQUETAS: Record<EstadoWA['conexion'], string> = {
  iniciando: 'Iniciando conexión…',
  esperando_qr: 'Esperando que escanees el código QR',
  conectado: 'Conectado',
  desconectado: 'Desconectado',
  error: 'Error',
};

export function WhatsAppPanel() {
  const [estado, setEstado] = useState<EstadoWA | null>(null);

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
        {estado.conexion === 'conectado' && (
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 6 }}>
            Agrega este número a un grupo con el proveedor y el bot empezará a escuchar. Las
            cotizaciones detectadas aparecen en la pestaña Sugerencias.
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
