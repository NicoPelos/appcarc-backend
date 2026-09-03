import Club from '../../clubs/models/Club.js';
import { syncSocioUserFromSocio } from '../../usuarios/services/userSync.js';

// Asigna el próximo socioNumber del club de forma atómica ($inc no pisa
// incrementos concurrentes de dos altas simultáneas) — ver issue #47.
// Lanza si no encuentra el Club en vez de devolver undefined en silencio:
// un socioNumber ausente por esto colisiona con el segundo alta en el mismo
// clubId (índice único compuesto, appcarc-backend#141) con un E11000
// críptico en vez de este mensaje de negocio claro.
export const asignarSocioNumber = async (clubId) => {
  const club = await Club.findOneAndUpdate(
    { slug: clubId },
    { $inc: { ultimoSocioNumber: 1 } },
    { new: true }
  );
  if (!club) throw new Error(`No se encontró el club '${clubId}' para asignar el número de socio`);
  return String(club.ultimoSocioNumber);
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
