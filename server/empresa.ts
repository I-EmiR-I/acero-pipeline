/** Datos de la empresa compradora, leídos de variables de entorno (.env.local) al momento de usarlos. */
export function getEmpresa() {
  return {
    razonSocial: process.env.VITE_EMPRESA_RAZON_SOCIAL ?? 'EMPRESA DEMO S.A. DE C.V.',
    rfc: process.env.VITE_EMPRESA_RFC ?? 'XAXX010101000',
    direccion: process.env.VITE_EMPRESA_DIRECCION ?? 'Calle Ejemplo 100, Col. Centro, C.P. 00000',
    localidad: process.env.VITE_EMPRESA_LOCALIDAD ?? 'Localidad (Fiscal), Ciudad, Estado, MÉXICO',
    telefono: process.env.VITE_EMPRESA_TELEFONO ?? 'Tel: 000-000-0000',
    celular: process.env.VITE_EMPRESA_CELULAR ?? 'Cel: 000-000-0000',
    email: process.env.VITE_EMPRESA_EMAIL ?? 'compras@ejemplo.com',
  };
}

export const IVA_TASA = 0.16;
