import type { Lead } from './types';
import type { Estado } from './logic/reducer';
import { uid } from './uid';

const hace = (dias: number, horas = 0) =>
  new Date(Date.now() - dias * 86400000 - horas * 3600000).toISOString();

export function seed(): Estado {
  return { leads: seedLeads(), ocsDirectas: [], folioSiguiente: 115, sugerencias: [] };
}

function seedLeads(): Lead[] {
  const l1p1 = uid();
  const l2p1 = uid();
  const l3p1 = uid();
  const l3p2 = uid();
  const l4p1 = uid();
  const cot3 = uid();
  const cot4 = uid();

  return [
    {
      id: uid(),
      cliente: 'Constructora Vega',
      vendedor: 'Vendedor',
      etapa: 'solicitud',
      lineas: [{ id: l1p1, producto: 'Varilla 3/8"', cantidad: 10, unidad: 'ton', precioObjetivo: 15500 }],
      cotizaciones: [],
      facturas: [],
      eventos: [
        { id: uid(), fecha: hace(0, 3), tipo: 'creacion', descripcion: 'Solicitud creada para Constructora Vega', actor: 'Vendedor' },
      ],
      creado: hace(0, 3),
      actualizado: hace(0, 3),
    },
    {
      id: uid(),
      cliente: 'Herrería Sánchez',
      vendedor: 'Vendedor',
      etapa: 'cotizando',
      lineas: [{ id: l2p1, producto: 'Viga IPR 6"', cantidad: 4, unidad: 'ton' }],
      cotizaciones: [],
      facturas: [],
      eventos: [
        { id: uid(), fecha: hace(3), tipo: 'creacion', descripcion: 'Solicitud creada para Herrería Sánchez', actor: 'Vendedor' },
        { id: uid(), fecha: hace(2, 5), tipo: 'etapa', descripcion: 'Enviado a compras para cotizar con proveedores', actor: 'Vendedor' },
      ],
      creado: hace(3),
      actualizado: hace(2, 5),
    },
    {
      id: uid(),
      cliente: 'Grupo Ferro',
      vendedor: 'Vendedor',
      etapa: 'cotizacion_lista',
      lineas: [
        { id: l3p1, producto: 'Lámina galvanizada cal. 22', cantidad: 2, unidad: 'ton' },
        { id: l3p2, producto: 'PTR 2x2', cantidad: 1.5, unidad: 'ton' },
      ],
      cotizaciones: [
        {
          id: cot3,
          proveedor: 'Aceros del Norte',
          fecha: hace(1, 2),
          precios: { [l3p1]: 19800, [l3p2]: 17200 },
          notas: 'Entrega en 5 días hábiles',
        },
      ],
      facturas: [],
      eventos: [
        { id: uid(), fecha: hace(2), tipo: 'creacion', descripcion: 'Solicitud creada para Grupo Ferro', actor: 'Vendedor' },
        { id: uid(), fecha: hace(1, 8), tipo: 'etapa', descripcion: 'Enviado a compras para cotizar con proveedores', actor: 'Vendedor' },
        { id: uid(), fecha: hace(1, 2), tipo: 'cotizacion', descripcion: 'Cotización registrada de Aceros del Norte', actor: 'Compras' },
      ],
      creado: hace(2),
      actualizado: hace(1, 2),
    },
    {
      id: uid(),
      cliente: 'Aceros Lead SA',
      vendedor: 'Vendedor',
      etapa: 'conciliacion',
      lineas: [{ id: l4p1, producto: 'Varilla 1/2"', cantidad: 10, unidad: 'ton' }],
      cotizaciones: [
        { id: cot4, proveedor: 'Siderúrgica MTY', fecha: hace(6), precios: { [l4p1]: 15900 } },
      ],
      cotizacionElegida: cot4,
      ordenCompra: {
        id: uid(),
        folio: 'OC-0041',
        proveedor: 'Siderúrgica MTY',
        fecha: hace(5),
        lineas: [{ lineaId: l4p1, producto: 'Varilla 1/2"', cantidad: 10, unidad: 'ton', precioUnitario: 15900 }],
      },
      facturas: [
        { id: uid(), folio: 'F-8812', fecha: hace(1), lineas: [{ lineaId: l4p1, cantidad: 6 }] },
      ],
      eventos: [
        { id: uid(), fecha: hace(8), tipo: 'creacion', descripcion: 'Solicitud creada para Aceros Lead SA', actor: 'Vendedor' },
        { id: uid(), fecha: hace(7), tipo: 'etapa', descripcion: 'Enviado a compras para cotizar con proveedores', actor: 'Vendedor' },
        { id: uid(), fecha: hace(6), tipo: 'cotizacion', descripcion: 'Cotización registrada de Siderúrgica MTY', actor: 'Compras' },
        { id: uid(), fecha: hace(5, 6), tipo: 'confirmacion', descripcion: 'Cliente confirmó precio (proveedor: Siderúrgica MTY)', actor: 'Vendedor' },
        { id: uid(), fecha: hace(5), tipo: 'oc', descripcion: 'OC OC-0041 enviada a Siderúrgica MTY', actor: 'Asistente' },
        { id: uid(), fecha: hace(1), tipo: 'factura', descripcion: 'Factura F-8812 registrada', actor: 'Asistente' },
        { id: uid(), fecha: hace(1), tipo: 'alerta', descripcion: 'Entrega parcial detectada. Pendiente: 4 ton de Varilla 1/2"', actor: 'sistema' },
      ],
      creado: hace(8),
      actualizado: hace(1),
    },
  ];
}
