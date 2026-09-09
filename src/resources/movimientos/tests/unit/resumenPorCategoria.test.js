import { afterEach, describe, expect, it, vi } from 'vitest';
import { resumenPorCategoriaHandler } from '../../handlers/resumenPorCategoria.handler.js';
import * as categoriaMovimientoService from '../../services/categoriaMovimiento.service.js';

const mockRes = () => {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};

const USER = { clubId: 'club1' };

afterEach(() => vi.restoreAllMocks());

describe('resumenPorCategoriaHandler', () => {
  it('devuelve ingresos y egresos como listas {categoria, monto}', async () => {
    vi.spyOn(categoriaMovimientoService, 'getEtiquetaMap').mockResolvedValue({});
    vi.spyOn(categoriaMovimientoService, 'buildIngresosEgresosPorCategoria').mockResolvedValue({
      ingresos: [['Cuota Social', 50000], ['Muro Libre', 20000]],
      egresos: [['Costos Fijos', 15000]],
    });

    const res = mockRes();
    await resumenPorCategoriaHandler({ query: {}, user: USER }, res);

    const body = res.json.mock.calls[0][0];
    expect(body.ingresosPorCategoria).toEqual([
      { categoria: 'Cuota Social', monto: 50000 },
      { categoria: 'Muro Libre', monto: 20000 },
    ]);
    expect(body.egresosPorCategoria).toEqual([{ categoria: 'Costos Fijos', monto: 15000 }]);
  });

  it('usa desde/hasta explícitos cuando vienen en la query', async () => {
    const buildSpy = vi.spyOn(categoriaMovimientoService, 'buildIngresosEgresosPorCategoria').mockResolvedValue({ ingresos: [], egresos: [] });
    vi.spyOn(categoriaMovimientoService, 'getEtiquetaMap').mockResolvedValue({});

    const res = mockRes();
    await resumenPorCategoriaHandler({ query: { desde: '2026-01-01', hasta: '2026-01-31' }, user: USER }, res);

    expect(buildSpy).toHaveBeenCalledWith(expect.objectContaining({
      desde: new Date('2026-01-01T00:00:00.000Z'),
      hasta: new Date('2026-01-31T23:59:59.999Z'),
    }));
  });

  it('default: usa un rango de 365 días hasta ahora si no vienen desde/hasta', async () => {
    const buildSpy = vi.spyOn(categoriaMovimientoService, 'buildIngresosEgresosPorCategoria').mockResolvedValue({ ingresos: [], egresos: [] });
    vi.spyOn(categoriaMovimientoService, 'getEtiquetaMap').mockResolvedValue({});

    const res = mockRes();
    await resumenPorCategoriaHandler({ query: {}, user: USER }, res);

    const { desde, hasta } = buildSpy.mock.calls[0][0];
    const dias = (hasta.getTime() - desde.getTime()) / (24 * 60 * 60 * 1000);
    expect(dias).toBeCloseTo(365, 0);
  });

  it('devuelve 500 ante un error inesperado', async () => {
    vi.spyOn(categoriaMovimientoService, 'getEtiquetaMap').mockRejectedValue(new Error('DB down'));

    const res = mockRes();
    await resumenPorCategoriaHandler({ query: {}, user: USER }, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
