import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';

import { BusinessError, registrarCobro } from '../../services/registrarCobro.service.js';
import Socio from '../../../socios/models/Socio.js';
import Cuota from '../../../cuotas/models/Cuota.js';
import Precios from '../../../cuotas/models/Precios.js';
import Cobro from '../../models/Cobro.js';
import Movimiento from '../../../movimientos/models/Movimiento.js';

const CLUB_ID = 'club1';
const SOCIO_ID = '507f1f77bcf86cd799439011';
const USER = {
  id: '507f1f77bcf86cd799439012',
  email: 'secretaria@carc.test',
};

const buildSessionQuery = (result) => ({
  session: vi.fn().mockResolvedValue(result),
});

const mockPrecioVigenteQuery = (result) => {
  const sessionQuery = {
    session: vi.fn().mockResolvedValue(result),
  };

  const sortQuery = {
    sort: vi.fn().mockReturnValue(sessionQuery),
  };

  Precios.findOne.mockReturnValue(sortQuery);
  return { sortQuery, sessionQuery };
};

describe('registrarCobro service (unit)', () => {
  let sessionMock;
  let cobroSaveSpy;
  let movimientoSaveSpy;
  let cuotaSaveSpy;
  let savedCobros;
  let savedMovimientos;
  let savedCuotas;

  beforeEach(() => {
    savedCobros = [];
    savedMovimientos = [];
    savedCuotas = [];

    sessionMock = {
      withTransaction: vi.fn(async (callback) => callback()),
      endSession: vi.fn(),
    };

    vi.spyOn(mongoose, 'startSession').mockResolvedValue(sessionMock);

    Socio.find = vi.fn();
    Cuota.find = vi.fn();
    Precios.findOne = vi.fn();

    cobroSaveSpy = vi.spyOn(Cobro.prototype, 'save').mockImplementation(async function () {
      if (!this._id) this._id = new mongoose.Types.ObjectId();
      savedCobros.push(this);
      return this;
    });

    movimientoSaveSpy = vi.spyOn(Movimiento.prototype, 'save').mockImplementation(async function () {
      if (!this._id) this._id = new mongoose.Types.ObjectId();
      savedMovimientos.push(this);
      return this;
    });

    cuotaSaveSpy = vi.spyOn(Cuota.prototype, 'save').mockImplementation(async function () {
      if (!this._id) this._id = new mongoose.Types.ObjectId();
      savedCuotas.push(this);
      return this;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should fail with 401 when clubId is missing', async () => {
    await expect(registrarCobro({
      clubId: undefined,
      user: USER,
      body: {},
    })).rejects.toMatchObject({
      status: 401,
      message: 'No se pudo determinar el club del usuario',
    });

    expect(mongoose.startSession).not.toHaveBeenCalled();
  });

  it('should fail when no cuotas are sent', async () => {
    await expect(registrarCobro({
      clubId: CLUB_ID,
      user: USER,
      body: {
        responsable: 'Secretaría CARC',
        paymentMethod: 'Efectivo',
        items: [],
      },
    })).rejects.toEqual(expect.objectContaining({
      message: 'El cobro debe incluir al menos una cuota',
    }));

    expect(Socio.find).not.toHaveBeenCalled();
    expect(sessionMock.endSession).toHaveBeenCalledTimes(1);
  });

  it('should fail when there are duplicated expanded cuotas', async () => {
    await expect(registrarCobro({
      clubId: CLUB_ID,
      user: USER,
      body: {
        responsable: 'Secretaría CARC',
        paymentMethod: 'Efectivo',
        items: [
          {
            socioId: SOCIO_ID,
            tipo: 'social',
            periodos: ['2026-06', '2026-06'],
            amount: 12000,
          },
        ],
      },
    })).rejects.toEqual(expect.objectContaining({
      message: `El cobro incluye una cuota duplicada para socio ${SOCIO_ID}, social, 2026-06`,
    }));

    expect(Socio.find).not.toHaveBeenCalled();
    expect(sessionMock.endSession).toHaveBeenCalledTimes(1);
  });

  it('should fail when payment method is invalid', async () => {
    await expect(registrarCobro({
      clubId: CLUB_ID,
      user: USER,
      body: {
        responsable: 'Secretaría CARC',
        paymentMethod: 'Tarjeta',
        items: [
          {
            socioId: SOCIO_ID,
            tipo: 'social',
            periodo: '2026-06',
            amount: 12000,
          },
        ],
      },
    })).rejects.toEqual(expect.objectContaining({
      message: 'La forma de pago debe ser Efectivo o Transferencia',
    }));

    expect(Socio.find).not.toHaveBeenCalled();
    expect(sessionMock.endSession).toHaveBeenCalledTimes(1);
  });

  it('should fail when item has no amount and no vigente price exists', async () => {
    const { sortQuery, sessionQuery } = mockPrecioVigenteQuery(null);

    await expect(registrarCobro({
      clubId: CLUB_ID,
      user: USER,
      body: {
        responsable: 'Secretaría CARC',
        paymentMethod: 'Efectivo',
        items: [
          {
            socioId: SOCIO_ID,
            tipo: 'social',
            periodo: '2026-06',
          },
        ],
      },
    })).rejects.toEqual(expect.objectContaining({
      message: 'El item 1 necesita un importe o un precio vigente configurado',
    }));

    expect(Precios.findOne).toHaveBeenCalledTimes(1);
    expect(sortQuery.sort).toHaveBeenCalledWith({ vigenteDesde: -1 });
    expect(sessionQuery.session).toHaveBeenCalledWith(sessionMock);
    expect(Socio.find).not.toHaveBeenCalled();
    expect(sessionMock.endSession).toHaveBeenCalledTimes(1);
  });

  it('should fail with 404 when any socio is missing or inactive', async () => {
    Socio.find.mockReturnValue(buildSessionQuery([]));

    await expect(registrarCobro({
      clubId: CLUB_ID,
      user: USER,
      body: {
        responsable: 'Secretaría CARC',
        paymentMethod: 'Efectivo',
        items: [
          {
            socioId: SOCIO_ID,
            tipo: 'social',
            periodo: '2026-06',
            amount: 12000,
          },
        ],
      },
    })).rejects.toMatchObject({
      status: 404,
      message: `El socio ${SOCIO_ID} no existe, está inactivo o pertenece a otro club`,
    });

    expect(Cuota.find).not.toHaveBeenCalled();
    expect(cobroSaveSpy).not.toHaveBeenCalled();
    expect(sessionMock.endSession).toHaveBeenCalledTimes(1);
  });

  it('should fail with 409 when cuota already paid', async () => {
    Socio.find.mockReturnValue(buildSessionQuery([{ _id: SOCIO_ID }]));
    Cuota.find.mockReturnValue(buildSessionQuery([
      {
        socioId: SOCIO_ID,
        tipo: 'social',
        periodo: '2026-06',
        estado: 'pagada',
      },
    ]));

    await expect(registrarCobro({
      clubId: CLUB_ID,
      user: USER,
      body: {
        responsable: 'Secretaría CARC',
        paymentMethod: 'Efectivo',
        items: [
          {
            socioId: SOCIO_ID,
            tipo: 'social',
            periodo: '2026-06',
            amount: 12000,
          },
        ],
      },
    })).rejects.toMatchObject({
      status: 409,
      message: `La cuota social 2026-06 del socio ${SOCIO_ID} ya está pagada`,
    });

    expect(cobroSaveSpy).not.toHaveBeenCalled();
    expect(movimientoSaveSpy).not.toHaveBeenCalled();
    expect(sessionMock.endSession).toHaveBeenCalledTimes(1);
  });

  it('should create cobro, movimiento and expanded cuotas in one transaction', async () => {
    Socio.find.mockReturnValue(buildSessionQuery([{ _id: SOCIO_ID }]));
    Cuota.find.mockReturnValue(buildSessionQuery([]));
    mockPrecioVigenteQuery({ monto: 15000 });

    const result = await registrarCobro({
      clubId: CLUB_ID,
      user: USER,
      body: {
        responsable: 'Secretaría CARC',
        paymentMethod: 'Efectivo',
        description: 'Cobro de prueba',
        items: [
          {
            socioId: SOCIO_ID,
            tipo: 'social',
            periodoDesde: '2026-06',
            cantidad: 2,
          },
        ],
      },
    });

    expect(sessionMock.withTransaction).toHaveBeenCalledTimes(1);
    expect(Precios.findOne).toHaveBeenCalledTimes(1);
    expect(cobroSaveSpy).toHaveBeenCalledTimes(2);
    expect(movimientoSaveSpy).toHaveBeenCalledTimes(1);
    expect(cuotaSaveSpy).toHaveBeenCalledTimes(2);
    expect(sessionMock.endSession).toHaveBeenCalledTimes(1);

    expect(savedMovimientos).toHaveLength(1);
    expect(savedMovimientos[0]).toMatchObject({
      type: 'Ingreso',
      concept: 'Cobro de cuotas sociales',
      paymentMethod: 'Efectivo',
      amount: 30000,
      sourceType: 'cobro',
    });

    expect(savedCuotas).toHaveLength(2);
    expect(savedCuotas.map((cuota) => cuota.periodo)).toEqual(['2026-06', '2026-07']);
    expect(savedCuotas.every((cuota) => cuota.paymentMethod === 'Efectivo')).toBe(true);

    expect(result).toEqual({
      cobro: expect.anything(),
      movimiento: expect.anything(),
      cuotas: expect.any(Array),
    });
    expect(result.cuotas).toHaveLength(2);
  });

  it('should update existing pending cuota instead of creating a new one', async () => {
    Socio.find.mockReturnValue(buildSessionQuery([{ _id: SOCIO_ID }]));

    const existingCuota = {
      _id: new mongoose.Types.ObjectId(),
      clubId: CLUB_ID,
      socioId: SOCIO_ID,
      tipo: 'social',
      periodo: '2026-06',
      estado: 'pendiente',
      active: true,
      save: vi.fn(async function () { return this; }),
    };
    Cuota.find.mockReturnValue(buildSessionQuery([existingCuota]));

    const result = await registrarCobro({
      clubId: CLUB_ID,
      user: USER,
      body: {
        responsable: 'Secretaría CARC',
        paymentMethod: 'Transferencia',
        items: [
          {
            socioId: SOCIO_ID,
            tipo: 'social',
            periodo: '2026-06',
            amount: 12000,
          },
        ],
      },
    });

    expect(existingCuota.save).toHaveBeenCalledTimes(1);
    expect(cuotaSaveSpy).not.toHaveBeenCalled();
    expect(existingCuota.estado).toBe('pagada');
    expect(existingCuota.paymentMethod).toBe('Transferencia');
    expect(result.cuotas).toHaveLength(1);
    expect(result.cuotas[0]).toBe(existingCuota);
    expect(sessionMock.endSession).toHaveBeenCalledTimes(1);
  });

  it('should throw BusinessError on invalid cobro date', async () => {
    await expect(registrarCobro({
      clubId: CLUB_ID,
      user: USER,
      body: {
        date: 'no-date',
        responsable: 'Secretaría CARC',
        paymentMethod: 'Efectivo',
        items: [],
      },
    })).rejects.toBeInstanceOf(BusinessError);

    expect(sessionMock.endSession).not.toHaveBeenCalled();
  });
});
