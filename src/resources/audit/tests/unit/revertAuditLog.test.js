import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';

vi.mock('../../models/AuditLog.js', () => ({
  default: { findOne: vi.fn() },
}));

vi.mock('../../services/audit.service.js', () => ({
  logAudit: vi.fn(),
}));

vi.mock('../../services/reversers/index.js', () => ({
  REVERSERS: {},
}));

import { revertAuditLogHandler } from '../../handlers/revertAuditLog.handler.js';
import AuditLog from '../../models/AuditLog.js';
import { REVERSERS } from '../../services/reversers/index.js';

const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const VALID_ID = '507f1f77bcf86cd799439011';
const USER = { id: VALID_ID, email: 'admin@test.com', clubId: 'club1' };

const buildLog = (overrides = {}) => ({
  _id: VALID_ID,
  clubId: 'club1',
  action: 'UPDATE',
  resource: 'Socio',
  resourceId: VALID_ID,
  before: { nombre: 'Antes' },
  after: { nombre: 'Despues' },
  revertedAt: null,
  revertedBy: null,
  save: vi.fn().mockResolvedValue({}),
  ...overrides,
});

describe('revertAuditLogHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(REVERSERS).forEach((key) => delete REVERSERS[key]);
    vi.spyOn(mongoose, 'startSession').mockResolvedValue({
      withTransaction: vi.fn(async (cb) => cb()),
      endSession: vi.fn(),
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('devuelve 400 si el id es inválido', async () => {
    const req = { params: { id: 'no-es-valid' }, user: USER };
    const res = mockRes();
    await revertAuditLogHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('devuelve 404 si el log no existe', async () => {
    AuditLog.findOne.mockResolvedValue(null);
    const req = { params: { id: VALID_ID }, user: USER };
    const res = mockRes();
    await revertAuditLogHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('devuelve 409 si ya fue revertido', async () => {
    AuditLog.findOne.mockResolvedValue(buildLog({ revertedAt: new Date() }));
    const req = { params: { id: VALID_ID }, user: USER };
    const res = mockRes();
    await revertAuditLogHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('revierte un UPDATE restaurando before', async () => {
    const log = buildLog({ action: 'UPDATE', before: { nombre: 'Antes', active: true } });
    AuditLog.findOne.mockResolvedValue(log);

    const mockUpdate = vi.fn().mockResolvedValue({});
    vi.spyOn(mongoose, 'model').mockReturnValue({ findByIdAndUpdate: mockUpdate });

    const req = { params: { id: VALID_ID }, user: USER };
    const res = mockRes();
    await revertAuditLogHandler(req, res);

    expect(mockUpdate).toHaveBeenCalledWith(VALID_ID, { $set: expect.objectContaining({ nombre: 'Antes', active: true }) }, { upsert: false });
    expect(log.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('revierte un DELETE restaurando before', async () => {
    const log = buildLog({ action: 'DELETE', before: { nombre: 'Antes', active: true, deletedAt: null }, after: null });
    AuditLog.findOne.mockResolvedValue(log);

    const mockUpdate = vi.fn().mockResolvedValue({});
    vi.spyOn(mongoose, 'model').mockReturnValue({ findByIdAndUpdate: mockUpdate });

    const req = { params: { id: VALID_ID }, user: USER };
    const res = mockRes();
    await revertAuditLogHandler(req, res);

    expect(mockUpdate).toHaveBeenCalledWith(VALID_ID, { $set: expect.objectContaining({ active: true, deletedAt: null }) }, { upsert: false });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('revierte un CREATE haciendo soft-delete', async () => {
    const log = buildLog({ action: 'CREATE', before: null });
    AuditLog.findOne.mockResolvedValue(log);

    const mockUpdate = vi.fn().mockResolvedValue({});
    vi.spyOn(mongoose, 'model').mockReturnValue({ findByIdAndUpdate: mockUpdate });

    const req = { params: { id: VALID_ID }, user: USER };
    const res = mockRes();
    await revertAuditLogHandler(req, res);

    expect(mockUpdate).toHaveBeenCalledWith(VALID_ID, { $set: expect.objectContaining({ active: false }) }, { upsert: false });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('devuelve 422 si no hay snapshot before para UPDATE', async () => {
    const log = buildLog({ action: 'UPDATE', before: null });
    AuditLog.findOne.mockResolvedValue(log);

    vi.spyOn(mongoose, 'model').mockReturnValue({});

    const req = { params: { id: VALID_ID }, user: USER };
    const res = mockRes();
    await revertAuditLogHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('delega en el reverser registrado en vez del genérico, para recursos con cascada', async () => {
    const log = buildLog({ resource: 'Cobro', action: 'DELETE', before: { movimientoId: 'mov1' } });
    AuditLog.findOne.mockResolvedValue(log);

    const reverser = vi.fn().mockResolvedValue(undefined);
    REVERSERS.Cobro = reverser;
    const modelSpy = vi.spyOn(mongoose, 'model');

    const req = { params: { id: VALID_ID }, user: USER };
    const res = mockRes();
    await revertAuditLogHandler(req, res);

    expect(reverser).toHaveBeenCalledWith(log, expect.objectContaining({ actor: USER.email }));
    expect(modelSpy).not.toHaveBeenCalled();
    expect(log.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('propaga el status de error de un reverser (ej. 422 sin snapshot)', async () => {
    const log = buildLog({ resource: 'Cobro', action: 'DELETE', before: null });
    AuditLog.findOne.mockResolvedValue(log);

    const error = new Error('No hay snapshot anterior para revertir');
    error.status = 422;
    REVERSERS.Cobro = vi.fn().mockRejectedValue(error);

    const req = { params: { id: VALID_ID }, user: USER };
    const res = mockRes();
    await revertAuditLogHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
  });
});
