import type { EstadoConciliacion, Lead } from './types';

export function conciliar(lead: Lead): EstadoConciliacion | null {
  const oc = lead.ordenCompra;
  if (!oc) return null;
  const lineas = oc.lineas.map((l) => {
    const facturado = lead.facturas.reduce(
      (sum, f) =>
        sum +
        f.lineas
          .filter((fl) => fl.lineaId === l.lineaId)
          .reduce((s, fl) => s + fl.cantidad, 0),
      0
    );
    return {
      lineaId: l.lineaId,
      producto: l.producto,
      unidad: l.unidad,
      pedido: l.cantidad,
      facturado,
      pendiente: Math.max(0, l.cantidad - facturado),
    };
  });
  return { completo: lineas.every((l) => l.pendiente === 0), lineas };
}

export function montoOC(lead: Lead): number | null {
  const oc = lead.ordenCompra;
  if (!oc) return null;
  return oc.lineas.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0);
}

export function diasDesde(fecha: string): number {
  return Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000);
}

export const fmtMoneda = (n: number) =>
  n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 });

export const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
