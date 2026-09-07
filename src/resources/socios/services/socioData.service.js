import Club from '../../clubs/models/Club.js';
import { syncSocioUserFromSocio } from '../../usuarios/services/userSync.js';

// Asigna el próximo socioNumber del club de forma atómica ($inc no pisa
// incrementos concurrentes de dos altas simultáneas) — ver issue #47.
// Si no encuentra el Club (clubId sin documento Club todavía) devuelve
// undefined a propósito: varios flujos (incluida buena parte de la suite de
// integración) crean Socio sin sembrar un Club primero, y eso es válido —
// el fix real de appcarc-backend#141 es el índice de Socio.js, que ahora
// excluye socioNumber ausente de la restricción de unicidad en vez de
// depender de que este valor nunca falte.
export const asignarSocioNumber = async (clubId) => {
  const club = await Club.findOneAndUpdate(
    { slug: clubId },
    { $inc: { ultimoSocioNumber: 1 } },
    { new: true }
  );
  return club ? String(club.ultimoSocioNumber) : undefined;
};

export const buildDomicilioCompleto = ({ domicilioCompleto, calle, altura, direccionActual } = {}) => {
  if (domicilioCompleto) return domicilioCompleto;
  if (calle) return `${calle}${altura ? ` ${altura}` : ''}`;
  if (direccionActual) return direccionActual;
  return domicilioCompleto;
};

export const prepareSocioCreateData = (body, user) => {
  const data = {
    ...body,
    clubId: body?.clubId || user?.clubId,
    createdBy: user?.id,
    updatedBy: user?.id,
  };

  const domicilioCompleto = buildDomicilioCompleto(data);
  if (domicilioCompleto !== undefined) {
    data.domicilioCompleto = domicilioCompleto;
  }

  // Si no viene explícita (ej. una importación con la fecha real del Excel
  // viejo), se asume que el alta ocurre hoy — sin esto quedaba en null y
  // había que completarla a mano después.
  if (!data.fechaDeAsociado) {
    data.fechaDeAsociado = new Date();
  }

  return data;
};

export const prepareSocioUpdateData = (body, user) => {
  // socioNumber es 100% automático e inmutable una vez asignado (issue #47) —
  // se ignora cualquier intento de tocarlo por esta vía.
  const { socioNumber, ...rest } = body ?? {};
  const data = {
    ...rest,
    updatedBy: user?.id,
  };

  const domicilioCompleto = buildDomicilioCompleto(data);
  if (domicilioCompleto !== undefined) {
    data.domicilioCompleto = domicilioCompleto;
  }

  return data;
};

export const syncSocioUserIfPossible = async (socio) => {
  if (!socio?.correoElectronico || !socio?.dni) return null;
  return syncSocioUserFromSocio(socio);
};
