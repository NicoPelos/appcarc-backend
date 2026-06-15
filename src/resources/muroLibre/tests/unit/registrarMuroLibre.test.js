import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';

import { BusinessError, registrarMuroLibre } from '../../services/registrarMuroLibre.service.js';
import Socio from '../../../socios/models/Socio.js';
import Precios from '../../../cuotas/models/Precios.js';
import MuroLibre from '../../models/MuroLibre.js';
import Movimiento from '../../../movimientos/models/Movimiento.js';

const CLUB_ID = 'club1';
const SOCIO_ID = '507f1f77bcf86cd799439011';
const USER = {
  id: '507f1f77bcf86cd799439012',
  email: 'secretaria@carc.test',
};

const mockSocioQuery = (result) => {
  const sessionQuery = { session: vi.fn().mockResolvedValue(result) };
  Socio.findOne.mockReturnValue(sessionQuery);
  return sessionQuery;
};

const mockPrecioVigenteQuery = (result) => {
  const sessionQuery = { session: vi.fn().mockResolvedValue(result) };
  const sortQuery = { sort: vi.fn().mockReturnValue(sessionQuery) };
  Precios.findOne.mockReturnValue(sortQuery);
  return { sortQuery, sessionQuery };
};

describe('registrarMuroLibre service (unit)', () => {
  let sessionMock;
  let registroSaveSpy;
  let movimientoSaveSpy;
  let savedRegistros;
  let savedMovimientos;

  beforeEach(() => {
    savedRegistros = [];
    savedMovimientos = [];

    sessionMock = {
      withTransaction: vi.fn(async (callback) => callback()),
      endSession: vi.fn(),
    };

    vi.spyOn(mongoose, 'startSession').mockResolvedValue(sessionMock);

    Socio.findOne = vi.fn();
    Precios.findOne = vi.fn();

    registroSaveSpy = vi.spyOn(MuroLibre.prototype, 'save').mockImplementation(async function () {
      if (!this._id) this._id = new mongoose.Types.ObjectId();
      savedRegistros.push(this);
      return this;
    });

    movimientoSaveSpy = vi.spyOn(Movimiento.prototype, 'save').mockImplementation(async function () {
      if (!this._id) this._id = new mongoose.Types.ObjectId();
      savedMovimientos.push(this);
      return this;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should fail with 401 when clubId is missing', async () => {
    await expect(registrarMuroLibre({
      clubId: undefined,
      user: USER,
      body: { tipoPase: 'diario' },
    })).rejects.toMatchObject({ status: 401, message: 'No se pudo determinar el club del usuario' });

    expect(mongoose.startSession).not.toHaveBeenCalled();
  });

  it('should fail when tipoPase is invalid', async () => {
    await expect(registrarMuroLibre({
      clubId: CLUB_ID,
      user: USER,
      body: { tipoPase: 'anual' },
    })).rejects.toMatchObject({ message: 'El tipo de pase debe ser diario o mensual' });

    expect(mongoose.startSession).not.toHaveBeenCalled();
  });

  it('should fail with BusinessError when fecha is invalid', async () => {
    await expect(registrarMuroLibre({
      clubId: CLUB_ID,
      user: USER,
      body: { tipoPase: 'diario', fecha: 'no-es-fecha' },
    })).rejects.toBeInstanceOf(BusinessError);

    expect(mongoose.startSession).not.toHaveBeenCalled();
  });

  it('should fail with 404 when socioId is provided but socio does not exist', async () => {
    mockSocioQuery(null);

    await expect(registrarMuroLibre({
      clubId: CLUB_ID,
      user: USER,
      body: { tipoPase: 'diario', socioId: SOCIO_ID },
    })).rejects.toMatchObject({
      status: 404,
      message: 'El socio no existe, está inactivo o pertenece a otro club',
    });

    expect(Precios.findOne).not.toHaveBeenCalled();
    expect(sessionMock.endSession).toHaveBeenCalledTimes(1);
  });

  it('should fail when nombre is missing and no socio is linked', async () => {
    await expect(registrarMuroLibre({
      clubId: CLUB_ID,
      user: USER,
      body: { tipoPase: 'diario', nombre: '' },
    })).rejects.toMatchObject({ message: 'El nombre es obligatorio' });

    expect(Precios.findOne).not.toHaveBeenCalled();
    expect(sessionMock.endSession).toHaveBeenCalledTimes(1);
  });

  it('should fail when estadoPago is invalid', async () => {
    await expect(registrarMuroLibre({
      clubId: CLUB_ID,
      user: USER,
      body: { tipoPase: 'diario', nombre: 'Juan', estadoPago: 'gratis' },
    })).rejects.toMatchObject({ message: 'El estado de pago debe ser pagado, pendiente o exento' });

    expect(Precios.findOne).not.toHaveBeenCalled();
    expect(sessionMock.endSession).toHaveBeenCalledTimes(1);
  });

  it('should fail when estadoPago is pagado but paymentMethod is invalid', async () => {
    await expect(registrarMuroLibre({
      clubId: CLUB_ID,
      user: USER,
      body: { tipoPase: 'diario', nombre: 'Juan', estadoPago: 'pagado', paymentMethod: 'Tarjeta' },
    })).rejects.toMatchObject({ message: 'La forma de pago debe ser Efectivo o Transferencia' });

    expect(Precios.findOne).not.toHaveBeenCalled();
    expect(sessionMock.endSession).toHaveBeenCalledTimes(1);
  });

  it('should fail when estadoPago is pagado but no amount and no precio vigente', async () => {
    mockPrecioVigenteQuery(null);

    await expect(registrarMuroLibre({
      clubId: CLUB_ID,
      user: USER,
      body: { tipoPase: 'diario', nombre: 'Juan', estadoPago: 'pagado', paymentMethod: 'Efectivo' },
    })).rejects.toMatchObject({ message: 'El pago necesita un monto o un precio vigente configurado' });

    expect(Precios.findOne).toHaveBeenCalledTimes(1);
    expect(registroSaveSpy).not.toHaveBeenCalled();
    expect(sessionMock.endSession).toHaveBeenCalledTimes(1);
  });

  it('should register a non-socio, diario, pagado using precio vigente and create movimiento', async () => {
    mockPrecioVigenteQuery({ monto: 3000 });

    const result = await registrarMuroLibre({
      clubId: CLUB_ID,
      user: USER,
      body: {
        tipoPase: 'diario',
        nombre: 'Juan',
        apellido: 'Pérez',
        estadoPago: 'pagado',
        paymentMethod: 'Efectivo',
      },
    });

    expect(registroSaveSpy).toHaveBeenCalledTimes(2);
    expect(movimientoSaveSpy).toHaveBeenCalledTimes(1);
    expect(sessionMock.endSession).toHaveBeenCalledTimes(1);

    expect(savedRegistros[0]).toMatchObject({
      nombre: 'Juan',
      apellido: 'Pérez',
      esSocio: false,
      tipoPase: 'diario',
      estadoPago: 'pagado',
      monto: 3000,
      precioSugeridoSnapshot: 3000,
      formaPago: 'Efectivo',
      periodo: '',
    });

    expect(savedMovimientos[0]).toMatchObject({
      type: 'Ingreso',
      concept: 'Muro libre diario',
      paymentMethod: 'Efectivo',
      amount: 3000,
      sourceType: 'muro_libre',
    });

    expect(result).toEqual({ registro: expect.anything(), movimiento: expect.anything() });
  });

  it('should register a socio, mensual, pagado with explicit amount and set periodo', async () => {
    mockSocioQuery({ _id: SOCIO_ID, nombre: 'Ana', apellido: 'García', dni: '12345678' });
    mockPrecioVigenteQuery({ monto: 8000 });

    const result = await registrarMuroLibre({
      clubId: CLUB_ID,
      user: USER,
      body: {
        socioId: SOCIO_ID,
        tipoPase: 'mensual',
        estadoPago: 'pagado',
        paymentMethod: 'Transferencia',
        amount: 7500,
        fecha: '2026-06-15T00:00:00.000Z',
      },
    });

    expect(savedRegistros[0]).toMatchObject({
      nombre: 'Ana',
      apellido: 'García',
      esSocio: true,
      tipoPase: 'mensual',
      estadoPago: 'pagado',
      monto: 7500,
      precioSugeridoSnapshot: 8000,
      periodo: '2026-06',
      formaPago: 'Transferencia',
    });

    expect(savedMovimientos[0]).toMatchObject({
      concept: 'Muro libre mensual',
      amount: 7500,
      paymentMethod: 'Transferencia',
    });

    expect(result.movimiento).not.toBeNull();
  });

  it('should register pendiente without movimiento and monto zero', async () => {
    mockPrecioVigenteQuery({ monto: 3000 });

    const result = await registrarMuroLibre({
      clubId: CLUB_ID,
      user: USER,
      body: { tipoPase: 'diario', nombre: 'Luis', estadoPago: 'pendiente' },
    });

    expect(registroSaveSpy).toHaveBeenCalledTimes(1);
    expect(movimientoSaveSpy).not.toHaveBeenCalled();
    expect(savedRegistros[0]).toMatchObject({ estadoPago: 'pendiente', monto: 0, formaPago: 'Sin pago' });
    expect(result.movimiento).toBeNull();
  });

  it('should register exento without movimiento', async () => {
    mockPrecioVigenteQuery(null);

    const result = await registrarMuroLibre({
      clubId: CLUB_ID,
      user: USER,
      body: { tipoPase: 'diario', nombre: 'Martina', estadoPago: 'exento' },
    });

    expect(registroSaveSpy).toHaveBeenCalledTimes(1);
    expect(movimientoSaveSpy).not.toHaveBeenCalled();
    expect(savedRegistros[0]).toMatchObject({ estadoPago: 'exento', monto: 0 });
    expect(result.movimiento).toBeNull();
  });

  it('should use noSocio price code when no socio is linked', async () => {
    mockPrecioVigenteQuery(null);

    await registrarMuroLibre({
      clubId: CLUB_ID,
      user: USER,
      body: { tipoPase: 'diario', nombre: 'Visitante', estadoPago: 'pendiente' },
    });

    expect(Precios.findOne).toHaveBeenCalledWith(expect.objectContaining({
      codigo: 'muro_libre_diario_no_socio',
    }));
  });

  it('should use socio price code when esSocio flag is true without linked socio record', async () => {
    mockPrecioVigenteQuery(null);

    await registrarMuroLibre({
      clubId: CLUB_ID,
      user: USER,
      body: { tipoPase: 'mensual', nombre: 'Visitante', esSocio: true, estadoPago: 'pendiente' },
    });

    expect(Precios.findOne).toHaveBeenCalledWith(expect.objectContaining({
      codigo: 'muro_libre_mensual_socio',
    }));
    expect(savedRegistros[0].esSocio).toBe(true);
  });
});
