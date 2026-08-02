import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../resources/cuotas/models/Precios.js', () => ({
  default: { find: vi.fn(), findOne: vi.fn() },
}));
vi.mock('../../../resources/suscripciones/models/Suscripcion.js', () => ({
  default: { distinct: vi.fn() },
}));
vi.mock('../../../resources/horarios/models/Horarios.js', () => ({
  default: { distinct: vi.fn() },
}));
vi.mock('../../../services/pushNotification.service.js', () => ({
  notifyRoles: vi.fn().mockResolvedValue({ sent: 1 }),
  notifySocio: vi.fn().mockResolvedValue({ sent: 1 }),
  notifyJobFailure: vi.fn().mockResolvedValue(undefined),
}));

let cronCallback;
vi.mock('node-cron', () => ({
  default: { schedule: vi.fn((_expr, cb) => { cronCallback = cb; }) },
}));

import { revisarVencimientosSinReemplazo, revisarCambiosDePrecio, startAlertaPreciosJob } from '../../alertaPrecios.job.js';
import Precios from '../../../resources/cuotas/models/Precios.js';
import Suscripcion from '../../../resources/suscripciones/models/Suscripcion.js';
import Horarios from '../../../resources/horarios/models/Horarios.js';
import { notifyRoles, notifySocio, notifyJobFailure } from '../../../services/pushNotification.service.js';

const mockPopulateLean = (result) => ({ populate: () => ({ lean: () => Promise.resolve(result) }) });
const mockFindOneChain = (result) => ({
  populate: () => mockFindOneChain(result),
  sort: () => ({ lean: () => Promise.resolve(result) }),
  lean: () => Promise.resolve(result),
});

beforeEach(() => vi.clearAllMocks());

describe('revisarVencimientosSinReemplazo', () => {
  it('avisa a staff cuando un precio vence pronto sin reemplazo', async () => {
    const precio = {
      _id: 'p1', clubId: 'CARC',
      vigenteHasta: new Date('2026-08-05T00:00:00.000Z'),
      etiquetaId: { _id: 'etq1', nombre: 'Cuota Social' },
    };
    Precios.find.mockReturnValue(mockPopulateLean([precio]));
    Precios.findOne.mockReturnValue({ lean: () => Promise.resolve(null) }); // sin reemplazo

    await revisarVencimientosSinReemplazo();

    expect(notifyRoles).toHaveBeenCalledWith('CARC', ['admin', 'secretaria', 'autoridad'], expect.objectContaining({
      title: expect.stringContaining('vencer'),
      body: expect.stringContaining('Cuota Social'),
    }));
  });

  it('no avisa si ya hay un precio que lo reemplaza', async () => {
    const precio = {
      _id: 'p1', clubId: 'CARC',
      vigenteHasta: new Date('2026-08-05T00:00:00.000Z'),
      etiquetaId: { _id: 'etq1', nombre: 'Cuota Social' },
    };
    Precios.find.mockReturnValue(mockPopulateLean([precio]));
    Precios.findOne.mockReturnValue({ lean: () => Promise.resolve({ _id: 'p2' }) }); // hay reemplazo

    await revisarVencimientosSinReemplazo();

    expect(notifyRoles).not.toHaveBeenCalled();
  });

  it('no revienta si no hay precios por vencer', async () => {
    Precios.find.mockReturnValue(mockPopulateLean([]));
    await expect(revisarVencimientosSinReemplazo()).resolves.not.toThrow();
    expect(notifyRoles).not.toHaveBeenCalled();
  });
});

describe('revisarCambiosDePrecio', () => {
  it('avisa a staff y a los socios con suscripción activa cuando cambia una cuota mensual', async () => {
    const nuevo = {
      _id: 'nuevo1', clubId: 'CARC', monto: 6000,
      etiquetaId: { _id: 'etq1', nombre: 'Cuota Social', unidad: 'mes' },
    };
    Precios.find.mockReturnValue(mockPopulateLean([nuevo]));
    Precios.findOne.mockReturnValue(mockFindOneChain({ _id: 'viejo1', monto: 5000 }));
    Suscripcion.distinct.mockResolvedValue(['socioA', 'socioB']);

    await revisarCambiosDePrecio();

    expect(notifyRoles).toHaveBeenCalledWith('CARC', ['admin', 'secretaria', 'autoridad'], expect.objectContaining({
      body: expect.stringContaining('$5.000'),
    }));
    expect(notifySocio).toHaveBeenCalledTimes(2);
    expect(notifySocio).toHaveBeenCalledWith('socioA', expect.objectContaining({ body: expect.stringContaining('$6.000') }));
    expect(Horarios.distinct).not.toHaveBeenCalled();
  });

  it('para una tarifa por hora, busca afectados en Horarios en vez de Suscripcion', async () => {
    const nuevo = {
      _id: 'nuevo1', clubId: 'CARC', monto: 3000,
      etiquetaId: { _id: 'etq2', nombre: 'Hora Profesor', unidad: 'hora' },
    };
    Precios.find.mockReturnValue(mockPopulateLean([nuevo]));
    Precios.findOne.mockReturnValue(mockFindOneChain({ _id: 'viejo1', monto: 2500 }));
    Horarios.distinct.mockResolvedValue(['profesorA']);

    await revisarCambiosDePrecio();

    expect(Horarios.distinct).toHaveBeenCalledWith('socioId', expect.objectContaining({ etiquetaId: 'etq2' }));
    expect(Suscripcion.distinct).not.toHaveBeenCalled();
    expect(notifySocio).toHaveBeenCalledWith('profesorA', expect.anything());
  });

  it('no avisa si no había un precio anterior (etiqueta nueva)', async () => {
    const nuevo = { _id: 'nuevo1', clubId: 'CARC', monto: 6000, etiquetaId: { _id: 'etq1', nombre: 'Cuota Social', unidad: 'mes' } };
    Precios.find.mockReturnValue(mockPopulateLean([nuevo]));
    Precios.findOne.mockReturnValue(mockFindOneChain(null));

    await revisarCambiosDePrecio();

    expect(notifyRoles).not.toHaveBeenCalled();
    expect(notifySocio).not.toHaveBeenCalled();
  });

  it('no avisa si el monto no cambió realmente', async () => {
    const nuevo = { _id: 'nuevo1', clubId: 'CARC', monto: 5000, etiquetaId: { _id: 'etq1', nombre: 'Cuota Social', unidad: 'mes' } };
    Precios.find.mockReturnValue(mockPopulateLean([nuevo]));
    Precios.findOne.mockReturnValue(mockFindOneChain({ _id: 'viejo1', monto: 5000 }));

    await revisarCambiosDePrecio();

    expect(notifyRoles).not.toHaveBeenCalled();
    expect(notifySocio).not.toHaveBeenCalled();
  });
});

describe('startAlertaPreciosJob', () => {
  it('avisa al admin si el job entero falla inesperadamente', async () => {
    Precios.find.mockImplementation(() => { throw new Error('Mongo caído'); });
    startAlertaPreciosJob();

    await cronCallback();

    expect(notifyJobFailure).toHaveBeenCalledWith('CARC', 'Alerta de precios', 'Mongo caído');
  });
});
