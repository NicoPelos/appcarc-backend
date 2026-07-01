import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDeudaStaffHandler } from '../../handlers/getDeudaStaff.handler.js';

vi.mock('../../models/Horarios.js', () => ({
  default: { find: vi.fn() },
}));
vi.mock('../../models/HorarioEtiqueta.js', () => ({
  default: { find: vi.fn() },
}));
vi.mock('../../../cuotas/models/Precios.js', () => ({
  default: { findOne: vi.fn() },
}));

import Horarios from '../../models/Horarios.js';
import HorarioEtiqueta from '../../models/HorarioEtiqueta.js';
import Precios from '../../../cuotas/models/Precios.js';

const mockUser = { clubId: 'CARC' };
const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const ETIQUETA_ID = 'etq1';
const SOCIO_ID = 'socio1';

beforeEach(() => {
  vi.clearAllMocks();

  Horarios.find.mockReturnValue({
    populate: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          socioId: { _id: SOCIO_ID, nombre: 'Vladimir', apellido: 'Kamiensky' },
          tipoTarea: 'Palestrero',
          totalHoras: 3,
        },
      ]),
    }),
  });

  HorarioEtiqueta.find.mockReturnValue({
    populate: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          valor: 'Palestrero',
          etiquetaId: { _id: ETIQUETA_ID, nombre: 'Hora Palestrero' },
        },
      ]),
    }),
  });

  Precios.findOne.mockReturnValue({
    sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ monto: 5000 }) }),
  });
});

describe('getDeudaStaffHandler', () => {
  it('calcula deuda correctamente', async () => {
    const req = { user: mockUser, query: { periodo: '2026-06' } };
    const res = mockRes();

    await getDeudaStaffHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const [resultado] = res.json.mock.calls[0][0];
    expect(resultado.nombre).toBe('Vladimir Kamiensky');
    expect(resultado.totalDeuda).toBe(15000); // 3h × $5000
    expect(resultado.detalles[0]).toMatchObject({ tipoTarea: 'Palestrero', totalHoras: 3, precioPorHora: 5000 });
  });

  it('retorna 400 si falta periodo', async () => {
    const req = { user: mockUser, query: {} };
    const res = mockRes();

    await getDeudaStaffHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('retorna 400 si periodo tiene formato inválido', async () => {
    const req = { user: mockUser, query: { periodo: '06-2026' } };
    const res = mockRes();

    await getDeudaStaffHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('marca sinPrecio cuando no hay etiqueta configurada', async () => {
    HorarioEtiqueta.find.mockReturnValue({
      populate: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
    });
    const req = { user: mockUser, query: { periodo: '2026-06' } };
    const res = mockRes();

    await getDeudaStaffHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const [resultado] = res.json.mock.calls[0][0];
    expect(resultado.detalles[0].sinPrecio).toBe(true);
    expect(resultado.totalDeuda).toBe(0);
  });

  it('retorna 500 si hay error', async () => {
    Horarios.find.mockReturnValue({
      populate: vi.fn().mockReturnValue({ lean: vi.fn().mockRejectedValue(new Error('DB error')) }),
    });
    const req = { user: mockUser, query: { periodo: '2026-06' } };
    const res = mockRes();

    await getDeudaStaffHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
