import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';

vi.mock('../../../audit/models/AuditLog.js', () => ({
  default: { findById: vi.fn() },
}));

vi.mock('../../../audit/services/audit.service.js', () => ({
  logAudit: vi.fn(),
}));

import { revertSuperAuditHandler } from '../../handlers/revertSuperAudit.handler.js';
import AuditLog from '../../../audit/models/AuditLog.js';
import { logAudit } from '../../../audit/services/audit.service.js';

const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const VALID_ID = '507f1f77bcf86cd799439011';
const SUPERADMIN = { id: VALID_ID, email: 'super@test.com', clubId: 'SUPER' };

const buildLog = (overrides = {}) => ({
  _id: VALID_ID,
  clubId: 'otroClub',
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

describe('revertSuperAuditHandler', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('devuelve 400 si el id es inválido', async () => {
    const req = { params: { id: 'no-es-valido' }, user: SUPERADMIN };
    const res = mockRes();
    await revertSuperAuditHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('devuelve 404 si el log no existe', async () => {
    AuditLog.findById.mockResolvedValue(null);
    const req = { params: { id: VALID_ID }, user: SUPERADMIN };
    const res = mockRes();
    await revertSuperAuditHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('devuelve 409 si ya fue revertido', async () => {
    AuditLog.findById.mockResolvedValue(buildLog({ revertedAt: new Date() }));
    const req = { params: { id: VALID_ID }, user: SUPERADMIN };
    const res = mockRes();
    await revertSuperAuditHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('revierte un log de un club distinto al del actor (cross-club)', async () => {
    const log = buildLog({ action: 'UPDATE', clubId: 'otroClub', before: { nombre: 'Antes', active: true } });
    AuditLog.findById.mockResolvedValue(log);

    const mockUpdate = vi.fn().mockResolvedValue({});
    vi.spyOn(mongoose, 'model').mockReturnValue({ findByIdAndUpdate: mockUpdate });

    const req = { params: { id: VALID_ID }, user: SUPERADMIN };
    const res = mockRes();
    await revertSuperAuditHandler(req, res);

    expect(mockUpdate).toHaveBeenCalledWith(VALID_ID, { $set: expect.objectContaining({ nombre: 'Antes', active: true }) }, { upsert: false });
    expect(log.save).toHaveBeenCalled();
    // el log del revert se registra contra el club dueño del dato, no contra el clubId del superadmin
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ clubId: 'otroClub' }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('revierte un CREATE haciendo soft-delete', async () => {
    const log = buildLog({ action: 'CREATE', before: null });
    AuditLog.findById.mockResolvedValue(log);

    const mockUpdate = vi.fn().mockResolvedValue({});
    vi.spyOn(mongoose, 'model').mockReturnValue({ findByIdAndUpdate: mockUpdate });

    const req = { params: { id: VALID_ID }, user: SUPERADMIN };
    const res = mockRes();
    await revertSuperAuditHandler(req, res);

    expect(mockUpdate).toHaveBeenCalledWith(VALID_ID, { $set: expect.objectContaining({ active: false }) }, { upsert: false });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('devuelve 422 si no hay snapshot before para UPDATE', async () => {
    const log = buildLog({ action: 'UPDATE', before: null });
    AuditLog.findById.mockResolvedValue(log);

    vi.spyOn(mongoose, 'model').mockReturnValue({});

    const req = { params: { id: VALID_ID }, user: SUPERADMIN };
    const res = mockRes();
    await revertSuperAuditHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(422);
  });
});
