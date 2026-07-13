import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { revertirCobro } from '../../services/reversers/revertirCobro.js';

const CLUB_ID = 'club1';
const ACTOR = 'admin@carc.test';
const session = {};

describe('revertirCobro', () => {
  let CobroModel;
  let MovimientoModel;
  let CuotaModel;

  beforeEach(() => {
    CobroModel = { findOne: vi.fn(), findByIdAndUpdate: vi.fn() };
    MovimientoModel = { findByIdAndUpdate: vi.fn().mockResolvedValue(undefined) };
    CuotaModel = { updateMany: vi.fn().mockResolvedValue(undefined) };

    vi.spyOn(mongoose, 'model').mockImplementation((name) => {
      if (name === 'Cobro') return CobroModel;
      if (name === 'Movimiento') return MovimientoModel;
      if (name === 'Cuota') return CuotaModel;
      throw new Error(`modelo no mockeado: ${name}`);
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('CREATE: anula el cobro, el movimiento y marca las cuotas como anuladas', async () => {
    const cobro = {
      _id: 'cobro1',
      movimientoId: 'mov1',
      active: true,
      save: vi.fn().mockResolvedValue(undefined),
    };
    CobroModel.findOne.mockReturnValue({ session: vi.fn().mockResolvedValue(cobro) });

    const log = { clubId: CLUB_ID, resourceId: 'cobro1', action: 'CREATE' };
    await revertirCobro(log, { actor: ACTOR, session });

    expect(cobro.active).toBe(false);
    expect(cobro.anuladoPor).toBe(ACTOR);
    expect(cobro.save).toHaveBeenCalledWith({ session });
    expect(MovimientoModel.findByIdAndUpdate).toHaveBeenCalledWith('mov1', { active: false, updatedBy: ACTOR }, { session });
    expect(CuotaModel.updateMany).toHaveBeenCalledWith(
      { cobroId: 'cobro1', clubId: CLUB_ID },
      { estado: 'anulada', updatedBy: ACTOR },
      { session },
    );
  });

  it('CREATE: no hace nada si el cobro ya está anulado', async () => {
    const cobro = { _id: 'cobro1', active: false, save: vi.fn() };
    CobroModel.findOne.mockReturnValue({ session: vi.fn().mockResolvedValue(cobro) });

    const log = { clubId: CLUB_ID, resourceId: 'cobro1', action: 'CREATE' };
    await revertirCobro(log, { actor: ACTOR, session });

    expect(cobro.save).not.toHaveBeenCalled();
    expect(MovimientoModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('DELETE: restaura el cobro, reactiva el movimiento y las cuotas anuladas', async () => {
    const log = {
      clubId: CLUB_ID,
      resourceId: 'cobro1',
      action: 'DELETE',
      before: { movimientoId: 'mov1', active: true, anuladoAt: null, _id: 'cobro1', updatedAt: new Date() },
    };

    await revertirCobro(log, { actor: ACTOR, session });

    expect(CobroModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'cobro1',
      { $set: expect.objectContaining({ active: true, anuladoAt: null, updatedBy: ACTOR }) },
      { session },
    );
    expect(CobroModel.findByIdAndUpdate.mock.calls[0][1].$set).not.toHaveProperty('_id');
    expect(MovimientoModel.findByIdAndUpdate).toHaveBeenCalledWith('mov1', { active: true, updatedBy: ACTOR }, { session });
    expect(CuotaModel.updateMany).toHaveBeenCalledWith(
      { cobroId: 'cobro1', clubId: CLUB_ID, estado: 'anulada' },
      { estado: 'pagada', updatedBy: ACTOR },
      { session },
    );
  });

  it('DELETE: lanza error con status 422 si no hay snapshot before', async () => {
    const log = { clubId: CLUB_ID, resourceId: 'cobro1', action: 'DELETE', before: null };

    await expect(revertirCobro(log, { actor: ACTOR, session })).rejects.toMatchObject({ status: 422 });
  });
});
