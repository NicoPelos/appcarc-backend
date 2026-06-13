import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkinMuroLibreHandler } from '../../handlers/checkinMuroLibre.handler.js';
import * as socioQrService from '../../../socios/services/socioQr.service.js';
import * as muroLibreService from '../../services/registrarMuroLibre.service.js';

const mockRes = () => {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};

describe('checkinMuroLibreHandler', () => {
  beforeEach(() => {
    vi.spyOn(muroLibreService, 'registrarMuroLibre').mockResolvedValue({ registro: { _id: 'ml1' }, movimiento: null });
    vi.spyOn(socioQrService, 'resolveSocioFromQrTokenOrDni').mockResolvedValue({ socio: { _id: 'socio1' }, method: 'QR' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should checkin via QR token and return 201', async () => {
    const req = {
      body: { token: 'qr-token', tipoPase: 'diario', estadoPago: 'pendiente' },
      user: { clubId: 'club1', id: 'staff1' },
    };
    const res = mockRes();

    await checkinMuroLibreHandler(req, res);

    expect(socioQrService.resolveSocioFromQrTokenOrDni).toHaveBeenCalledWith({
      token: 'qr-token',
      dni: undefined,
      clubId: 'club1',
      missingMessage: 'Se requiere token QR o DNI para identificar el socio',
    });
    expect(muroLibreService.registrarMuroLibre).toHaveBeenCalledWith(expect.objectContaining({
      clubId: 'club1',
      user: req.user,
      body: expect.objectContaining({ socioId: 'socio1', tipoPase: 'diario' }),
      scannedBy: 'staff1',
      checkinMethod: 'QR',
    }));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('should checkin via DNI when no token is provided', async () => {
    const req = {
      body: { dni: '123', tipoPase: 'mensual', estadoPago: 'pendiente' },
      user: { clubId: 'club1', id: 'staff1' },
    };
    const res = mockRes();

    socioQrService.resolveSocioFromQrTokenOrDni.mockResolvedValueOnce({ socio: { _id: 'socio1' }, method: 'DNI' });
    await checkinMuroLibreHandler(req, res);

    expect(socioQrService.resolveSocioFromQrTokenOrDni).toHaveBeenCalledWith({
      token: undefined,
      dni: '123',
      clubId: 'club1',
      missingMessage: 'Se requiere token QR o DNI para identificar el socio',
    });
    expect(muroLibreService.registrarMuroLibre).toHaveBeenCalledWith(expect.objectContaining({
      checkinMethod: 'DNI',
    }));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('should return 400 when neither token nor DNI is provided', async () => {
    const req = { body: { tipoPase: 'diario' }, user: { clubId: 'club1', id: 'staff1' } };
    const res = mockRes();

    socioQrService.resolveSocioFromQrTokenOrDni.mockRejectedValueOnce(
      Object.assign(new Error('Se requiere token QR o DNI para identificar el socio'), { status: 400 })
    );
    await checkinMuroLibreHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Se requiere token QR o DNI para identificar el socio' });
  });
});
