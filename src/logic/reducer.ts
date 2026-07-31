import type {
  Cotizacion,
  DatosProveedor,
  Evento,
  Factura,
  Lead,
  LineaFactura,
  LineaOC,
  LineaProducto,
  OrdenCompra,
  Proveedor,
  Resultado,
  Sugerencia,
  TipoEvento,
} from '../types';
import { conciliar } from '../reconcile';
import { seed } from '../seed';
import { uid } from '../uid';

export interface ConfigApp {
  /** JID del grupo de WhatsApp designado para dictar órdenes de compra por comando. */
  grupoComandosJid?: string;
  grupoComandosNombre?: string;
}

export interface Estado {
  leads: Lead[];
  ocsDirectas: OrdenCompra[];
  folioSiguiente: number;
  sugerencias: Sugerencia[];
  proveedores: Proveedor[];
  config: ConfigApp;
}

function evento(tipo: TipoEvento, descripcion: string, actor: string): Evento {
  return { id: uid(), fecha: new Date().toISOString(), tipo, descripcion, actor };
}

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

export function coincideProducto(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  return na.includes(nb) || nb.includes(na);
}

export interface LineaOCEntrada {
  codigo?: string;
  producto: string;
  cantidad: number;
  unidad: string;
  precioUnitario: number;
}

export type Accion =
  | {
      tipo: 'crear_lead';
      cliente: string;
      vendedor: string;
      lineas: Omit<LineaProducto, 'id'>[];
      notas?: string;
    }
  | { tipo: 'enviar_a_compras'; leadId: string; actor: string }
  | {
      tipo: 'registrar_cotizacion';
      leadId: string;
      proveedor: string;
      precios: Record<string, number>;
      notas?: string;
      actor: string;
    }
  | { tipo: 'confirmar_precio'; leadId: string; cotizacionId: string; actor: string }
  | {
      tipo: 'emitir_oc';
      leadId: string;
      folio?: string;
      condicionesPago?: string;
      nota?: string;
      proveedorDatos?: DatosProveedor;
      actor: string;
    }
  | {
      tipo: 'crear_oc_directa';
      proveedor: DatosProveedor;
      lineas: LineaOCEntrada[];
      folio?: string;
      noProveedor?: string;
      condicionesPago?: string;
      nota?: string;
      actor: string;
    }
  | { tipo: 'registrar_factura'; leadId: string; folio: string; lineas: LineaFactura[]; actor: string }
  | { tipo: 'cerrar_lead'; leadId: string; resultado: Resultado; actor: string }
  | { tipo: 'eliminar_lead'; leadId: string }
  | { tipo: 'agregar_nota'; leadId: string; texto: string; actor: string }
  | { tipo: 'agregar_sugerencia'; sugerencia: Omit<Sugerencia, 'id' | 'fecha'> }
  | { tipo: 'aceptar_sugerencia'; sugerenciaId: string; actor: string }
  | { tipo: 'descartar_sugerencia'; sugerenciaId: string }
  | { tipo: 'guardar_proveedor'; proveedor: Omit<Proveedor, 'id'> & { id?: string } }
  | { tipo: 'eliminar_proveedor'; proveedorId: string }
  | { tipo: 'importar_proveedores'; proveedores: (Omit<Proveedor, 'id'> & { id?: string })[] }
  | { tipo: 'set_grupo_comandos'; grupoComandosJid?: string; grupoComandosNombre?: string }
  | { tipo: 'reiniciar_datos' }
  | { tipo: 'reiniciar_demo' };

function tocar(lead: Lead): Lead {
  return { ...lead, actualizado: new Date().toISOString() };
}

function mapearLead(estado: Estado, leadId: string, fn: (l: Lead) => Lead): Estado {
  return { ...estado, leads: estado.leads.map((l) => (l.id === leadId ? fn(l) : l)) };
}

export function reducer(estado: Estado, a: Accion): Estado {
  switch (a.tipo) {
    case 'crear_lead': {
      const ahora = new Date().toISOString();
      const lead: Lead = {
        id: uid(),
        cliente: a.cliente,
        vendedor: a.vendedor,
        etapa: 'solicitud',
        lineas: a.lineas.map((l) => ({ ...l, id: uid() })),
        cotizaciones: [],
        facturas: [],
        notas: a.notas,
        eventos: [evento('creacion', `Solicitud creada para ${a.cliente}`, a.vendedor)],
        creado: ahora,
        actualizado: ahora,
      };
      return { ...estado, leads: [lead, ...estado.leads] };
    }
    case 'reiniciar_datos':
      // Limpia la operación (leads, OCs, sugerencias) pero conserva el catálogo de proveedores y la config.
      return { ...estado, leads: [], ocsDirectas: [], sugerencias: [], folioSiguiente: 115 };
    case 'reiniciar_demo':
      return seed();
    case 'eliminar_lead':
      return { ...estado, leads: estado.leads.filter((l) => l.id !== a.leadId) };
    case 'guardar_proveedor': {
      const id = a.proveedor.id ?? uid();
      const prov: Proveedor = { ...a.proveedor, id };
      const existe = estado.proveedores.some((p) => p.id === id);
      return {
        ...estado,
        proveedores: existe
          ? estado.proveedores.map((p) => (p.id === id ? prov : p))
          : [...estado.proveedores, prov],
      };
    }
    case 'eliminar_proveedor':
      return { ...estado, proveedores: estado.proveedores.filter((p) => p.id !== a.proveedorId) };
    case 'importar_proveedores':
      return {
        ...estado,
        proveedores: a.proveedores.map((p) => ({ ...p, id: p.id ?? uid() })),
      };
    case 'set_grupo_comandos':
      return {
        ...estado,
        config: {
          ...estado.config,
          grupoComandosJid: a.grupoComandosJid,
          grupoComandosNombre: a.grupoComandosNombre,
        },
      };
    case 'agregar_sugerencia': {
      const s: Sugerencia = { ...a.sugerencia, id: uid(), fecha: new Date().toISOString() };
      return { ...estado, sugerencias: [s, ...estado.sugerencias] };
    }
    case 'descartar_sugerencia':
      return { ...estado, sugerencias: estado.sugerencias.filter((s) => s.id !== a.sugerenciaId) };
    case 'aceptar_sugerencia': {
      const s = estado.sugerencias.find((x) => x.id === a.sugerenciaId);
      if (!s) return estado;
      const ahora = new Date().toISOString();
      const conPrecio = s.lineas.some((l) => (l.precioUnitario ?? 0) > 0);
      const sinSugerencia = estado.sugerencias.filter((x) => x.id !== a.sugerenciaId);

      // Actualizar un lead existente del mismo grupo, en vez de crear otro.
      const objetivo =
        s.tipo === 'actualizar' && s.leadId
          ? estado.leads.find((l) => l.id === s.leadId)
          : undefined;
      if (objetivo) {
        // Empareja las líneas de la sugerencia con las del lead por nombre; registra el precio.
        const precios: Record<string, number> = {};
        for (const sl of s.lineas) {
          if (!(sl.precioUnitario && sl.precioUnitario > 0)) continue;
          const linea =
            objetivo.lineas.find((l) => coincideProducto(l.producto, sl.producto)) ?? objetivo.lineas[0];
          if (linea) precios[linea.id] = sl.precioUnitario;
        }
        const cot: Cotizacion = {
          id: uid(),
          proveedor: s.proveedor,
          fecha: ahora,
          precios: Object.fromEntries(objetivo.lineas.map((l) => [l.id, precios[l.id] ?? 0])),
          notas: `Precio detectado en WhatsApp: ${s.resumen}`,
        };
        return {
          ...estado,
          leads: estado.leads.map((l) =>
            l.id === objetivo.id
              ? tocar({
                  ...l,
                  etapa: conPrecio ? 'cotizacion_lista' : l.etapa,
                  cotizaciones: [...l.cotizaciones, cot],
                  eventos: [
                    ...l.eventos,
                    evento('cotizacion', `Cotización de ${s.proveedor} vía WhatsApp: ${s.cambio ?? s.resumen}`, a.actor),
                  ],
                })
              : l
          ),
          sugerencias: sinSugerencia,
        };
      }

      // Lead nuevo.
      const lineas = s.lineas
        .filter((l) => l.producto)
        .map((l) => ({
          id: uid(),
          producto: l.producto,
          cantidad: l.cantidad && l.cantidad > 0 ? l.cantidad : 1,
          unidad: l.unidad || 'ton',
        }));
      const eventos: Evento[] = [
        evento('creacion', `Lead creado desde WhatsApp (grupo "${s.grupo}")`, a.actor),
        evento('etapa', 'Detectado en cotización con proveedor vía WhatsApp', 'WhatsApp'),
      ];
      let cotizaciones: Cotizacion[] = [];
      if (conPrecio) {
        const precios: Record<string, number> = {};
        lineas.forEach((linea, i) => {
          precios[linea.id] = s.lineas[i]?.precioUnitario ?? 0;
        });
        cotizaciones = [
          {
            id: uid(),
            proveedor: s.proveedor,
            fecha: ahora,
            precios,
            notas: `Detectada en WhatsApp: ${s.resumen}`,
          },
        ];
        eventos.push(evento('cotizacion', `Cotización registrada de ${s.proveedor} (WhatsApp)`, 'WhatsApp'));
      }
      const lead: Lead = {
        id: uid(),
        cliente: s.cliente || `Por definir (${s.grupo})`,
        vendedor: 'Compras',
        etapa: conPrecio ? 'cotizacion_lista' : 'cotizando',
        lineas,
        cotizaciones,
        facturas: [],
        eventos,
        grupoJid: s.grupoJid,
        creado: ahora,
        actualizado: ahora,
      };
      return {
        ...estado,
        leads: [lead, ...estado.leads],
        sugerencias: sinSugerencia,
      };
    }
    case 'crear_oc_directa': {
      const folio = a.folio?.trim() || String(estado.folioSiguiente);
      const oc: OrdenCompra = {
        id: uid(),
        folio,
        proveedor: a.proveedor.nombre,
        proveedorDatos: a.proveedor,
        noProveedor: a.noProveedor,
        condicionesPago: a.condicionesPago,
        nota: a.nota,
        fecha: new Date().toISOString(),
        origen: 'directa',
        lineas: a.lineas.map((l) => ({ ...l, lineaId: uid() })),
      };
      return {
        ...estado,
        ocsDirectas: [oc, ...estado.ocsDirectas],
        folioSiguiente: a.folio?.trim() ? estado.folioSiguiente : estado.folioSiguiente + 1,
      };
    }
    case 'enviar_a_compras':
      return mapearLead(estado, a.leadId, (lead) =>
        tocar({
          ...lead,
          etapa: 'cotizando',
          eventos: [...lead.eventos, evento('etapa', 'Enviado a compras para cotizar con proveedores', a.actor)],
        })
      );
    case 'registrar_cotizacion':
      return mapearLead(estado, a.leadId, (lead) => {
        const cot: Cotizacion = {
          id: uid(),
          proveedor: a.proveedor,
          fecha: new Date().toISOString(),
          precios: a.precios,
          notas: a.notas,
        };
        return tocar({
          ...lead,
          etapa: 'cotizacion_lista',
          cotizaciones: [...lead.cotizaciones, cot],
          eventos: [...lead.eventos, evento('cotizacion', `Cotización registrada de ${a.proveedor}`, a.actor)],
        });
      });
    case 'confirmar_precio':
      return mapearLead(estado, a.leadId, (lead) => {
        const cot = lead.cotizaciones.find((c) => c.id === a.cotizacionId);
        return tocar({
          ...lead,
          etapa: 'confirmado',
          cotizacionElegida: a.cotizacionId,
          eventos: [
            ...lead.eventos,
            evento('confirmacion', `Cliente confirmó precio (proveedor: ${cot?.proveedor ?? '—'})`, a.actor),
          ],
        });
      });
    case 'emitir_oc': {
      const lead = estado.leads.find((l) => l.id === a.leadId);
      const cot = lead?.cotizaciones.find((c) => c.id === lead.cotizacionElegida);
      if (!lead || !cot) return estado;
      const folio = a.folio?.trim() || String(estado.folioSiguiente);
      const lineasOC: LineaOC[] = lead.lineas.map((l) => ({
        lineaId: l.id,
        producto: l.producto,
        cantidad: l.cantidad,
        unidad: l.unidad,
        precioUnitario: cot.precios[l.id] ?? 0,
      }));
      const nuevo = mapearLead(estado, a.leadId, (le) =>
        tocar({
          ...le,
          etapa: 'oc_enviada',
          ordenCompra: {
            id: uid(),
            folio,
            proveedor: cot.proveedor,
            proveedorDatos: a.proveedorDatos ?? { nombre: cot.proveedor },
            condicionesPago: a.condicionesPago,
            nota: a.nota,
            fecha: new Date().toISOString(),
            origen: 'lead',
            lineas: lineasOC,
          },
          eventos: [...le.eventos, evento('oc', `OC ${folio} enviada a ${cot.proveedor}`, a.actor)],
        })
      );
      return {
        ...nuevo,
        folioSiguiente: a.folio?.trim() ? estado.folioSiguiente : estado.folioSiguiente + 1,
      };
    }
    case 'registrar_factura':
      return mapearLead(estado, a.leadId, (lead) => {
        const factura: Factura = {
          id: uid(),
          folio: a.folio,
          fecha: new Date().toISOString(),
          lineas: a.lineas,
        };
        let nuevo: Lead = {
          ...lead,
          facturas: [...lead.facturas, factura],
          eventos: [...lead.eventos, evento('factura', `Factura ${a.folio} registrada`, a.actor)],
        };
        const est = conciliar(nuevo);
        if (est && est.completo) {
          nuevo = {
            ...nuevo,
            etapa: 'cerrado',
            resultado: 'ganado',
            eventos: [
              ...nuevo.eventos,
              evento('cierre', 'Factura completa: la OC quedó cubierta al 100 %. Lead cerrado como ganado.', 'sistema'),
            ],
          };
        } else if (est) {
          const faltan = est.lineas
            .filter((l) => l.pendiente > 0)
            .map((l) => `${l.pendiente} ${l.unidad} de ${l.producto}`)
            .join(', ');
          nuevo = {
            ...nuevo,
            etapa: 'conciliacion',
            eventos: [...nuevo.eventos, evento('alerta', `Entrega parcial detectada. Pendiente: ${faltan}`, 'sistema')],
          };
        }
        return tocar(nuevo);
      });
    case 'cerrar_lead':
      return mapearLead(estado, a.leadId, (lead) =>
        tocar({
          ...lead,
          etapa: 'cerrado',
          resultado: a.resultado,
          eventos: [
            ...lead.eventos,
            evento(
              'cierre',
              a.resultado === 'perdido'
                ? 'Lead marcado como perdido'
                : a.resultado === 'cancelado'
                  ? 'Lead cancelado'
                  : 'Lead cerrado como ganado',
              a.actor
            ),
          ],
        })
      );
    case 'agregar_nota':
      return mapearLead(estado, a.leadId, (lead) =>
        tocar({ ...lead, eventos: [...lead.eventos, evento('nota', a.texto, a.actor)] })
      );
    default:
      return estado;
  }
}
