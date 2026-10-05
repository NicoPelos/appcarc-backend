import { ESTADOS_ITEM } from '../models/ItemInventario.js';

const CAMPOS = ['nombre', 'categoria', 'cantidad', 'ubicacion', 'estado', 'notas'];

// Devuelve { data } con los campos válidos, o { error } con el primer problema.
// `parcial` (PUT) solo valida los campos que vienen en el body.
export const prepararItem = (body = {}, { parcial = false } = {}) => {
  const data = {};

  for (const campo of CAMPOS) {
    if (body[campo] === undefined) continue;
    data[campo] = body[campo];
  }

  if (!parcial && (typeof data.nombre !== 'string' || !data.nombre.trim())) {
    return { error: 'El nombre es obligatorio' };
  }
  if (data.nombre !== undefined && (typeof data.nombre !== 'string' || !data.nombre.trim())) {
    return { error: 'El nombre no puede estar vacío' };
  }
  for (const campo of ['categoria', 'ubicacion', 'notas']) {
    if (data[campo] !== undefined && typeof data[campo] !== 'string') {
      return { error: `${campo} debe ser texto` };
    }
  }
  if (data.cantidad !== undefined && (typeof data.cantidad !== 'number' || !Number.isInteger(data.cantidad) || data.cantidad < 0)) {
    return { error: 'La cantidad debe ser un entero mayor o igual a cero' };
  }
  if (data.estado !== undefined && !ESTADOS_ITEM.includes(data.estado)) {
    return { error: `El estado debe ser uno de: ${ESTADOS_ITEM.join(', ')}` };
  }

  return { data };
};

export const escaparRegex = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
