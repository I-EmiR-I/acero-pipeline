import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Accion, Estado } from '../src/logic/reducer';
import { reducer } from '../src/logic/reducer';
import { seed } from '../src/seed';

const dir = path.dirname(fileURLToPath(import.meta.url));
const ARCHIVO = path.join(dir, 'estado.json');

let estado: Estado = cargar();

function cargar(): Estado {
  try {
    if (fs.existsSync(ARCHIVO)) {
      const e = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8')) as Estado;
      return { ...e, sugerencias: e.sugerencias ?? [] };
    }
  } catch (err) {
    console.error('estado.json corrupto, se regenera el demo:', err);
  }
  return seed();
}

function guardar() {
  fs.writeFileSync(ARCHIVO, JSON.stringify(estado, null, 2), 'utf8');
}

export function obtenerEstado(): Estado {
  return estado;
}

export function despachar(a: Accion): Estado {
  estado = reducer(estado, a);
  guardar();
  return estado;
}
