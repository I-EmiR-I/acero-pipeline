import PDFDocument from 'pdfkit';
import type { OrdenCompra } from '../src/types';
import { getEmpresa } from './empresa';

const money = (n: number) =>
  n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });

const AZUL = '#1e3a5f';
const GRIS = '#5c6773';
const LINEA = '#d7dce3';

/** Genera el PDF de una orden de compra y devuelve el Buffer. */
export function generarOCPdf(oc: OrdenCompra): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const EMPRESA = getEmpresa();
    const left = 40;
    const right = 572; // 612 - 40
    const p = oc.proveedorDatos;
    const fecha = new Date(oc.fecha).toLocaleDateString('es-MX', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    // ---- Encabezado: empresa (izq) ----
    doc.fillColor(AZUL).font('Helvetica-Bold').fontSize(13).text(EMPRESA.razonSocial, left, 42, { width: 300 });
    doc.fillColor(GRIS).font('Helvetica').fontSize(8);
    doc.text(`RFC: ${EMPRESA.rfc}`, left, doc.y + 2, { width: 300 });
    doc.text(EMPRESA.direccion, { width: 300 });
    doc.text(EMPRESA.localidad, { width: 300 });
    doc.text(EMPRESA.telefono, { width: 300 });
    doc.text(EMPRESA.celular, { width: 300 });
    doc.text(`eMail: ${EMPRESA.email}`, { width: 300 });

    // ---- Título (der) ----
    doc.fillColor(AZUL).font('Helvetica-Bold').fontSize(16).text('ORDEN DE COMPRA', 360, 46, {
      width: right - 360,
      align: 'right',
    });

    // ---- Cajas de datos ----
    const cajaY = 78;
    const cajaW = (right - 360 - 8) / 2;
    const caja = (x: number, y: number, titulo: string, valor: string) => {
      doc.rect(x, y, cajaW, 30).fill('#f3f5f8');
      doc.fillColor(GRIS).font('Helvetica').fontSize(6.5).text(titulo.toUpperCase(), x + 4, y + 4, { width: cajaW - 8 });
      doc.fillColor('#1c2733').font('Helvetica-Bold').fontSize(10).text(valor, x + 4, y + 14, { width: cajaW - 8 });
    };
    caja(360, cajaY, 'No. de proveedor', oc.noProveedor ?? '—');
    caja(360 + cajaW + 8, cajaY, 'Fecha', fecha);
    caja(360, cajaY + 36, 'No. Orden', oc.folio);
    caja(360 + cajaW + 8, cajaY + 36, 'Condiciones de pago', oc.condicionesPago ?? '—');

    // ---- Bloque proveedor ----
    let y = 160;
    doc.rect(left, y, right - left, 66).fillAndStroke('#ffffff', LINEA);
    doc.fillColor(AZUL).font('Helvetica-Bold').fontSize(8).text('PROVEEDOR', left + 8, y + 6);
    const colA = left + 8;
    const colB = left + 280;
    const dato = (x: number, yy: number, etq: string, val: string) => {
      doc.fillColor(GRIS).font('Helvetica-Bold').fontSize(8).text(etq, x, yy, { continued: true });
      doc.fillColor('#1c2733').font('Helvetica').text(' ' + (val || ''));
    };
    dato(colA, y + 22, 'Nombre:', p?.nombre ?? oc.proveedor);
    dato(colA, y + 34, 'R.F.C.:', p?.rfc ?? '');
    dato(colA, y + 46, 'Domicilio:', p?.domicilio ?? '');
    dato(colB, y + 22, 'Municipio:', p?.municipio ?? '');
    dato(colB, y + 34, 'Estado:', p?.estado ?? '');
    dato(colB, y + 46, 'País:', p?.pais ?? 'México');

    // ---- Tabla ----
    y = 240;
    const cols = [
      { x: left, w: 55, label: 'Código', align: 'left' as const },
      { x: left + 55, w: 60, label: 'Cantidad', align: 'right' as const },
      { x: left + 115, w: 250, label: 'Descripción', align: 'left' as const },
      { x: left + 365, w: 55, label: 'Unidad', align: 'center' as const },
      { x: left + 420, w: right - (left + 420), label: '$ X KG', align: 'right' as const },
    ];
    doc.rect(left, y, right - left, 18).fill(AZUL);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
    cols.forEach((c) => doc.text(c.label.toUpperCase(), c.x + 3, y + 5, { width: c.w - 6, align: c.align }));

    y += 18;
    doc.font('Helvetica').fontSize(9);
    // Filas de material (solicitud): sin importe ni total.
    const FILAS_MIN = 12;
    const filas = Math.max(FILAS_MIN, oc.lineas.length);
    for (let i = 0; i < filas; i++) {
      const l = oc.lineas[i];
      if (i % 2 === 1) doc.rect(left, y, right - left, 18).fill('#fafbfc');
      if (l) {
        doc.fillColor('#1c2733');
        const celdas = [
          l.codigo ?? '',
          l.cantidad.toLocaleString('es-MX'),
          l.producto.toUpperCase(),
          l.unidad.toUpperCase(),
          `${money(l.precioUnitario)} /kg`,
        ];
        cols.forEach((c, j) => doc.text(celdas[j], c.x + 3, y + 5, { width: c.w - 6, align: c.align }));
      }
      doc.moveTo(left, y + 18).lineTo(right, y + 18).strokeColor(LINEA).stroke();
      y += 18;
    }
    // Bordes verticales de la tabla
    doc.strokeColor(LINEA);
    [left, ...cols.slice(1).map((c) => c.x), right].forEach((x) =>
      doc.moveTo(x, 240).lineTo(x, y).stroke()
    );

    // ---- Nota ----
    y += 16;
    doc.rect(left, y, 300, 40).fillAndStroke('#f3f5f8', LINEA);
    doc.fillColor(AZUL).font('Helvetica-Bold').fontSize(8).text('NOTA:', left + 8, y + 6);
    if (oc.nota) {
      doc.fillColor(GRIS).font('Helvetica').fontSize(9).text(oc.nota, left + 8, y + 18, { width: 284 });
    }

    doc.end();
  });
}
