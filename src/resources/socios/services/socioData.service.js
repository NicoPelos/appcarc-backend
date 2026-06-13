import { syncSocioUserFromSocio } from '../../usuarios/services/userSync.js';

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
  const data = {
    ...body,
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
