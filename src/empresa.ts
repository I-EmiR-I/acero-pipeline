/**
 * Datos de la empresa compradora que aparecen en las órdenes de compra.
 *
 * Los valores reales NO viven aquí (para no exponerlos en el repositorio público):
 * se leen de variables de entorno definidas en `.env.local` (git-ignored).
 * Si una variable no está definida, se usa el dato de ejemplo de abajo.
 *
 * En `.env.local` define:
 *   VITE_EMPRESA_RAZON_SOCIAL=...
 *   VITE_EMPRESA_RFC=...
 *   VITE_EMPRESA_DIRECCION=...
 *   VITE_EMPRESA_LOCALIDAD=...
 *   VITE_EMPRESA_TELEFONO=...
 *   VITE_EMPRESA_CELULAR=...
 *   VITE_EMPRESA_EMAIL=...
 */
const env = import.meta.env;

export const EMPRESA = {
  razonSocial: env.VITE_EMPRESA_RAZON_SOCIAL ?? 'EMPRESA DEMO S.A. DE C.V.',
  rfc: env.VITE_EMPRESA_RFC ?? 'XAXX010101000',
  direccion: env.VITE_EMPRESA_DIRECCION ?? 'Calle Ejemplo 100, Col. Centro, C.P. 00000',
  localidad: env.VITE_EMPRESA_LOCALIDAD ?? 'Localidad (Fiscal), Ciudad, Estado, MÉXICO',
  telefono: env.VITE_EMPRESA_TELEFONO ?? 'Tel: 000-000-0000',
  celular: env.VITE_EMPRESA_CELULAR ?? 'Cel: 000-000-0000',
  email: env.VITE_EMPRESA_EMAIL ?? 'compras@ejemplo.com',
};

export const IVA_TASA = 0.16;
