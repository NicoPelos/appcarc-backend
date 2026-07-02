import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getClubsHandler }    from '../../handlers/getClubs.handler.js';
import { createClubHandler }  from '../../handlers/createClub.handler.js';
import { suspendClubHandler } from '../../handlers/suspendClub.handler.js';
import Club from '../../../clubs/models/Club.js';
import User from '../../../usuarios/models/User.js';
import Socio from '../../../socios/models/Socio.js';

const mockRes = () => {
  const res = {};
  res.status = vi.fn(() => res);
  res.json   = vi.fn(() => res);
  return res;
};

describe('Super — clubs handlers (unit)', () => {
  beforeEach(() => {
    Club.find             = vi.fn();
    Club.findOne          = vi.fn();
    Club.findByIdAndUpdate = vi.fn();
    Club.findById         = vi.fn();
    Club.create           = vi.fn();
    User.countDocuments   = vi.fn().mockResolvedValue(3);
    Socio.countDocuments  = vi.fn().mockResolvedValue(10);
  });

  afterEach(() => vi.clearAllMocks());

  it('getClubsHandler devuelve clubs con métricas', async () => {
    const fakeClub = { _id: 'c1', slug: 'carc', nombre: 'CARC' };
    const chainMock = { sort: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue([fakeClub]) };
    Club.find.mockReturnValue(chainMock);

    const req = {};
    const res = mockRes();
    await getClubsHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ slug: 'carc', userCount: 3, socioCount: 10 }),
    ]));
  });

  it('createClubHandler devuelve 400 si falta nombre o slug', async () => {
    const req = { body: { nombre: 'Test' } };
    const res = mockRes();
    await createClubHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('createClubHandler devuelve 409 si ya existe el slug', async () => {
    Club.findOne.mockResolvedValue({ slug: 'carc' });
    const req = { body: { nombre: 'CARC', slug: 'carc' } };
    const res = mockRes();
    await createClubHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('createClubHandler crea el club', async () => {
    Club.findOne.mockResolvedValue(null);
    Club.create.mockResolvedValue({ _id: 'c1', nombre: 'CARC', slug: 'carc' });
    const req = { body: { nombre: 'CARC', slug: 'carc' } };
    const res = mockRes();
    await createClubHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('suspendClubHandler togglea active', async () => {
    const fakeClub = { _id: 'c1', active: true, suspendidoAt: null, save: vi.fn() };
    Club.findById.mockResolvedValue(fakeClub);
    const req = { params: { id: 'c1' } };
    const res = mockRes();
    await suspendClubHandler(req, res);
    expect(fakeClub.active).toBe(false);
    expect(fakeClub.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
