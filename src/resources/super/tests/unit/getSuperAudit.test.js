import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../audit/models/AuditLog.js', () => ({
  default: { find: vi.fn(), countDocuments: vi.fn() },
}));

import { getSuperAuditHandler } from '../../handlers/getSuperAudit.handler.js';
import AuditLog from '../../../audit/models/AuditLog.js';

const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const makeQuery = (result = []) => ({
  sort: vi.fn().mockReturnThis(),
  skip: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue(result),
});

beforeEach(() => {
  vi.clearAllMocks();
  AuditLog.countDocuments.mockResolvedValue(0);
  AuditLog.find.mockReturnValue(makeQuery([]));
});

describe('getSuperAuditHandler', () => {
  it('sin filtros, devuelve lista paginada', async () => {
    const req = { query: {} };
    const res = mockRes();
    await getSuperAuditHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(AuditLog.find.mock.calls[0][0]).toEqual({});
  });

  it('reverted=false filtra revertedAt: null (papelera vigente)', async () => {
    const req = { query: { reverted: 'false' } };
    const res = mockRes();
    await getSuperAuditHandler(req, res);
    expect(AuditLog.find.mock.calls[0][0]).toEqual({ revertedAt: null });
  });

  it('reverted=true filtra revertedAt: { $ne: null } (ya restaurado)', async () => {
    const req = { query: { reverted: 'true' } };
    const res = mockRes();
    await getSuperAuditHandler(req, res);
    expect(AuditLog.find.mock.calls[0][0]).toEqual({ revertedAt: { $ne: null } });
  });

  it('combina reverted con action y clubId', async () => {
    const req = { query: { action: 'DELETE', clubId: 'CARC', reverted: 'false' } };
    const res = mockRes();
    await getSuperAuditHandler(req, res);
    expect(AuditLog.find.mock.calls[0][0]).toEqual({ action: 'DELETE', clubId: 'CARC', revertedAt: null });
  });

  it('ignora reverted con valor inválido', async () => {
    const req = { query: { reverted: 'maybe' } };
    const res = mockRes();
    await getSuperAuditHandler(req, res);
    expect(AuditLog.find.mock.calls[0][0]).toEqual({});
  });

  it('retorna 500 si hay error inesperado', async () => {
    AuditLog.countDocuments.mockRejectedValue(new Error('DB error'));
    const req = { query: {} };
    const res = mockRes();
    await getSuperAuditHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
