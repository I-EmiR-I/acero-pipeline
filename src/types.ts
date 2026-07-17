export type Etapa =
  | 'solicitud'
  | 'cotizando'
  | 'cotizacion_lista'
  | 'confirmado'
  | 'oc_enviada'
  | 'conciliacion'
  | 'cerrado';

export const ETAPAS: { id: Etapa; nombre: string }[] = [
  { id: 'solicitud', nombre: 'Solicitud nueva' },
  { id: 'cotizando', nombre: 'Cotizando con proveedores' },
  { id: 'cotizacion_lista', nombre: 'Cotización lista' },
  { id: 'confirmado', nombre: 'Cliente confirmó' },
  { id: 'oc_enviada', nombre: 'OC enviada' },
  { id: 'conciliacion', nombre: 'Conciliación de factura' },
  { id: 'cerrado', nombre: 'Cerrado' },
];

export type Resultado = 'ganado' | 'perdido' | 'cancelado';

export interface LineaProducto {
  id: string;
  producto: string;
  cantidad: number;
  unidad: string;
  precioObjetivo?: number;
}

export interface Cotizacion {
  id: string;
  proveedor: string;
  fecha: string;
  precios: Record<string, number>; // lineaId -> precio unitario
  notas?: string;
}

export interface LineaOC {
  lineaId: string;
  codigo?: string;
  producto: string;
  cantidad: number;
  unidad: string;
  precioUnitario: number;
}

export interface DatosProveedor {
  nombre: string;
  rfc?: string;
  domicilio?: string;
  colonia?: string;
  localidad?: string;
  municipio?: string;
  estado?: string;
  pais?: string;
}

export interface OrdenCompra {
  id: string;
  folio: string;
  proveedor: string;
  proveedorDatos?: DatosProveedor;
  noProveedor?: string;
  condicionesPago?: string;
  nota?: string;
  fecha: string;
  lineas: LineaOC[];
  /** Solo para OC directas (sin lead): quién la pidió */
  origen?: 'lead' | 'directa';
}

export interface LineaFactura {
  lineaId: string;
  cantidad: number;
}

export interface Factura {
  id: string;
  folio: string;
  fecha: string;
  lineas: LineaFactura[];
}

export type TipoEvento =
  | 'creacion'
  | 'etapa'
  | 'cotizacion'
  | 'confirmacion'
  | 'oc'
  | 'factura'
  | 'alerta'
  | 'nota'
  | 'cierre';

export interface Evento {
  id: string;
  fecha: string;
  tipo: TipoEvento;
  descripcion: string;
  actor: string;
}

export interface Lead {
  id: string;
  cliente: string;
  vendedor: string;
  etapa: Etapa;
  resultado?: Resultado;
  lineas: LineaProducto[];
  cotizaciones: Cotizacion[];
  cotizacionElegida?: string; // id de la cotización confirmada con el cliente
  ordenCompra?: OrdenCompra;
  facturas: Factura[];
  eventos: Evento[];
  notas?: string;
  /** Si el lead nació de un grupo de WhatsApp, su JID, para ligar mensajes futuros. */
  grupoJid?: string;
  creado: string;
  actualizado: string;
}

export interface MensajeWA {
  de: string;
  texto: string;
  fecha: string;
}

/** Lead sugerido por el bot de WhatsApp; espera confirmación humana. */
export interface Sugerencia {
  id: string;
  fecha: string;
  grupo: string;
  grupoJid: string;
  proveedor: string;
  resumen: string;
  cliente?: string;
  lineas: {
    producto: string;
    cantidad?: number;
    unidad?: string;
    precioUnitario?: number;
  }[];
  mensajes: MensajeWA[];
  /** 'crear' = lead nuevo; 'actualizar' = avanzar un lead existente del mismo grupo. */
  tipo: 'crear' | 'actualizar';
  /** Lead objetivo cuando tipo = 'actualizar'. */
  leadId?: string;
  /** Descripción de qué cambia en el lead existente (para mostrar en la tarjeta). */
  cambio?: string;
}

export interface EstadoConciliacion {
  completo: boolean;
  lineas: {
    lineaId: string;
    producto: string;
    unidad: string;
    pedido: number;
    facturado: number;
    pendiente: number;
  }[];
}
