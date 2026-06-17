import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { getAsistenciasHandler } from '../../handlers/getAsistencias.handler.js';
import { createAsistenciaEscuelitaHandler } from '../../handlers/createAsistenciaEscuelita.handler.js';
import Asistencia from '../../models/Asistencia.js';
import * as socioQrService from '../../../socios/services/socioQr.service.js';
import * as registrarService from '../../services/registrarAsistenciaEscuelita.service.js';

const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const USER = { id: 'staff1', email: 'secretaria@carc.test', clubId: 'club1' };

describe('getAsistenciasHandler', () => {
  beforeEach(() => {
    Asistencia.countDocuments = vi.fn().mockResolvedValue(3);
    Asistencia.find = vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        { _id: 'a1', tipo: 'escuelita' },
        { _id: 'a2', tipo: 'muro_libre' },
      ]),
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('should return paginated asistencias', async () => {
    const req = { query: {}, user: USER };
    const res = mockRes();

    await getAsistenciasHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ total: 3 }));
  });

  it('should filter by tipo=escuelita', async () => {
    const req = { query: { tipo: 'escuelita' }, user: USER };
    const res = mockRes();

    await getAsistenciasHandler(req, res);

    expect(Asistencia.find).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'escuelita' }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('should return 400 for invalid tipo', async () => {
    const req = { query: { tipo: 'invalido' }, user: USER };
    const res = mockRes();

    await getAsistenciasHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 400 for invalid socioId', async () => {
    const req = { query: { socioId: 'no-es-un-id' }, user: USER };
    const res = mockRes();

    await getAsistenciasHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should apply date range filter', async () => {
    const req = { query: { from: '2026-06-01', to: '2026-06-30' }, user: USER };
    const res = mockRes();

    await getAsistenciasHandler(req, res);

    expect(Asistencia.find).toHaveBeenCalledWith(expect.objectContaining({
      fecha: { $gte: new Date('2026-06-01'), $lte: new Date('2026-06-30') },
    }));
  });

  it('should return 500 on unexpected error', async () => {
    Asistencia.countDocuments.mockRejectedValue(new Error('DB down'));
    const req = { query: {}, user: USER };
    const res = mockRes();

    await getAsistenciasHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('createAsistenciaEscuelitaHandler', () => {
  const SOCIO_ID = '507f1f77bcf86cd799439011';

  beforeEach(() => {
    vi.spyOn(registrarService, 'registrarAsistenciaEscuelita').mockResolvedValue({
      _id: new mongoose.Types.ObjectId(),
      tipo: 'escuelita',
    });
    vi.spyOn(socioQrService, 'resolveSocioFromQrTokenOrDni').mockResolvedValue({
      socio: { _id: SOCIO_ID },
      method: 'QR',
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('should register attendance using socioId directly', async () => {
    const req = { body: { socioId: SOCIO_ID, categoria: 'niños' }, user: USER };
    const res = mockRes();

    await createAsistenciaEscuelitaHandler(req, res);

    expect(registrarService.registrarAsistenciaEscuelita).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({ socioId: SOCIO_ID }),
    }));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('should register attendance resolving socioId from QR token', async () => {
    const req = { body: { token: 'qr-token', categoria: 'adultos' }, user: USER };
    const res = mockRes();

    await createAsistenciaEscuelitaHandler(req, res);

    expect(socioQrService.resolveSocioFromQrTokenOrDni).toHaveBeenCalledWith(expect.objectContaining({
      token: 'qr-token',
      clubId: 'club1',
    }));
    expect(registrarService.registrarAsistenciaEscuelita).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({ socioId: SOCIO_ID }),
    }));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('should return 400 when neither token, dni nor socioId provided', async () => {
    const req = { body: { categoria: 'niños' }, user: USER };
    const res = mockRes();

    await createAsistenciaEscuelitaHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Se requiere token QR, DNI o socioId' });
  });

  it('should return error status from BusinessError', async () => {
    vi.spyOn(registrarService, 'registrarAsistenciaEscuelita').mockRejectedValue(
      Object.assign(new Error('El socio no está inscripto activamente en la escuelita'), { status: 400 }),
    );
    const req = { body: { socioId: SOCIO_ID }, user: USER };
    const res = mockRes();

    await createAsistenciaEscuelitaHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'El socio no está inscripto activamente en la escuelita' });
  });
});
