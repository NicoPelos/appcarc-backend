import CargoPuntual from '../models/CargoPuntual.js';

class BusinessError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'BusinessError';
    this.status = status;
  }
}

export const anularCargoPuntual = async ({ clubId, user, id, motivo }) => {
  const cargo = await CargoPuntual.findOne({ _id: id, clubId, active: true });
  if (!cargo) throw new BusinessError('Cargo puntual no encontrado', 404);

  if (cargo.estado !== 'pendiente') {
    throw new BusinessError(`El cargo ya está ${cargo.estado}, no se puede anular directamente`, 409);
  }

  const actor = user?.email || user?.id;
  cargo.estado = 'anulada';
  cargo.active = false;
  cargo.description = motivo ? `${cargo.description} (anulado: ${motivo})` : cargo.description;
  cargo.updatedBy = actor;
  await cargo.save();

  return cargo;
};

export { BusinessError };
