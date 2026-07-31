import type { Estado } from './logic/reducer';
import { uid } from './uid';

/** Estado inicial: catálogo de ejemplo y todo lo demás vacío (sin leads de prueba). */
export function seed(): Estado {
  return {
    leads: [],
    ocsDirectas: [],
    folioSiguiente: 115,
    sugerencias: [],
    config: {},
    proveedores: [
      {
        id: uid(),
        nombre: 'Aceros del Norte',
        rfc: 'AAN050607AB1',
        domicilio: 'Av. Industrias 1200',
        colonia: 'Parque Industrial',
        municipio: 'Apodaca',
        estado: 'Nuevo León',
        pais: 'México',
        condicionesPago: '30 DÍAS',
      },
    ],
  };
}
