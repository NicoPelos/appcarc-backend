import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSocioHandler } from '../../handlers/createSocio.handler.js';
import { getSociosHandler } from '../../handlers/getSocios.handler.js';
import { getSocioByIdHandler } from '../../handlers/getSocioById.handler.js';
import { updateSocioHandler } from '../../handlers/updateSocio.handler.js';
import { deleteSocioHandler } from '../../handlers/deleteSocio.handler.js';
import { restoreSocioHandler } from '../../handlers/restoreSocio.handler.js';
import Socio from '../../models/Socio.js';

const mockRes = () => {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};

describe('Socios handlers (unit)', () => {
  beforeEach(() => {
    // stub static and instance methods on Socio
    Socio.find = vi.fn();
    Socio.findOne = vi.fn();
    Socio.findOneAndUpdate = vi.fn();
    if (Socio.prototype && !Socio.prototype.save.isMockFunction) {
      vi.spyOn(Socio.prototype, 'save').mockImplementation(async function () { return this; });
    }
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('createSocioHandler should create a socio and return 201', async () => {
    const req = { body: { apellido: 'Perez', nombre: 'Juan', dni: '123' }, user: { clubId: 'club1', id: 'user1' } };
    const res = mockRes();

    await createSocioHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalled();
    const createdSocio = res.json.mock.calls[0][0];
    expect(createdSocio.createdBy).toBe('user1');
    expect(createdSocio.updatedBy).toBe('user1');
  });

  it('getSociosHandler should return array of socios', async () => {
    const fake = [{ apellido: 'Perez', nombre: 'Juan' }];
    Socio.find.mockResolvedValueOnce(fake);
    const req = { user: { clubId: 'club1' } };
    const res = mockRes();

    await getSociosHandler(req, res);

    expect(Socio.find).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(fake);
  });

  it('getSocioByIdHandler should return socio when found', async () => {
    const fake = { _id: 'id1', apellido: 'Perez' };
    Socio.findOne.mockResolvedValueOnce(fake);
    const req = { params: { id: 'id1' }, user: { clubId: 'club1' } };
    const res = mockRes();

    await getSocioByIdHandler(req, res);

    expect(Socio.findOne).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(fake);
  });

  it('updateSocioHandler should update and return socio', async () => {
    const fake = { _id: 'id1', apellido: 'Perez' };
    Socio.findOneAndUpdate.mockResolvedValueOnce(fake);
    const req = { params: { id: 'id1' }, body: { nombre: 'Updated' }, user: { clubId: 'club1', id: 'user1' } };
    const res = mockRes();

    await updateSocioHandler(req, res);

    expect(Socio.findOneAndUpdate).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(fake);
  });

  it('deleteSocioHandler should soft-delete and return success message', async () => {
    const fake = { _id: 'id1', apellido: 'Perez' };
    Socio.findOneAndUpdate.mockResolvedValueOnce(fake);
    const req = { params: { id: 'id1' }, user: { clubId: 'club1', id: 'user1' } };
    const res = mockRes();

    await deleteSocioHandler(req, res);

    expect(Socio.findOneAndUpdate).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'Socio desactivado con éxito' });
  });

  it('getSociosHandler should return trashed socios when trash=true', async () => {
    const fake = [{ apellido: 'Perez', nombre: 'Juan', active: false }];
    Socio.find.mockResolvedValueOnce(fake);
    const req = { user: { clubId: 'club1' }, query: { trash: 'true' } };
    const res = mockRes();

    await getSociosHandler(req, res);

    expect(Socio.find).toHaveBeenCalledWith({ clubId: 'club1', active: false });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(fake);
  });

  it('restoreSocioHandler should restore a trashed socio', async () => {
    const fake = { _id: 'id1', apellido: 'Perez', active: true };
    Socio.findOneAndUpdate.mockResolvedValueOnce(fake);
    const req = { params: { id: 'id1' }, user: { clubId: 'club1', id: 'user1' } };
    const res = mockRes();

    await restoreSocioHandler(req, res);

    expect(Socio.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'id1', clubId: 'club1', active: false },
      expect.objectContaining({
        active: true,
        deletedAt: undefined,
        deletedBy: undefined,
        updatedBy: 'user1',
      }),
      { returnDocument: 'after' }
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(fake);
  });
});
