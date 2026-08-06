import Club from '../../clubs/models/Club.js';
import { syncSocioUserFromSocio } from '../../usuarios/services/userSync.js';

// Asigna el próximo socioNumber del club de forma atómica ($inc no pisa
// incrementos concurrentes de dos altas simultáneas) — ver issue #47.
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
