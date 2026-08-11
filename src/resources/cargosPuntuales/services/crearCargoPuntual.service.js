import Socio from '../../socios/models/Socio.js';
import Etiqueta from '../../etiquetas/models/Etiqueta.js';
import CargoPuntual from '../models/CargoPuntual.js';
import { findPrecioVigente } from '../../cuotas/services/findPrecioVigente.service.js';

class BusinessError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'BusinessError';
    this.status = status;
  }
}

const periodoActual = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export const crearCargoPuntual = async ({ clubId, user, body }) => {
  const socioId = String(body?.socioId || '').trim();
  const etiquetaId = String(body?.etiquetaId || '').trim();
  const description = String(body?.description || '').trim();
  const montoManual = body?.monto == null ? null : Number(body.monto);

  if (!socioId) throw new BusinessError('socioId es requerido');
  if (!etiquetaId) throw new BusinessError('etiquetaId es requerido');
  if (!description) throw new BusinessError('description es requerido');
  if (montoManual !== null && (!Number.isFinite(montoManual) || montoManual < 0)) {
    throw new BusinessError('monto debe ser un número mayor o igual a 0');
  }

  const socio = await Socio.findOne({ _id: socioId, clubId, active: true }).lean();
  if (!socio) throw new BusinessError('Socio no encontrado', 404);

  const etiqueta = await Etiqueta.findOne({ _id: etiquetaId, clubId, active: true }).lean();
  if (!etiqueta) throw new BusinessError('Etiqueta no encontrada', 404);
  if (etiqueta.unidad !== 'unico') {
    throw new BusinessError(`La etiqueta "${etiqueta.nombre}" no es de cargo puntual (unidad: ${etiqueta.unidad})`);
  }

  const now = new Date();
  let montoEsperadoSnapshot = montoManual;
  let precioSugeridoSnapshot = null;

  if (montoEsperadoSnapshot === null) {
    const precio = await findPrecioVigente({ clubId, etiquetaId, date: now });
    precioSugeridoSnapshot = precio?.monto ?? null;
    montoEsperadoSnapshot = precioSugeridoSnapshot;
  }

  if (!Number.isFinite(montoEsperadoSnapshot) || montoEsperadoSnapshot < 0) {
    throw new BusinessError('No hay un precio vigente para esta etiqueta: indicá un monto manualmente');
  }

  const actor = user?.email || user?.id;
  const cargo = new CargoPuntual({
    clubId,
    socioId,
    etiquetaId,
    periodo: periodoActual(),
    description,
    montoEsperadoSnapshot,
    precioSugeridoSnapshot,
    createdBy: actor,
    updatedBy: actor,
  });
  await cargo.save();

  return cargo;
};

export { BusinessError };
