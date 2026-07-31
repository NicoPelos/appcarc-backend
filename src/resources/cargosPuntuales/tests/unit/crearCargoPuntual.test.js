import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';

import { BusinessError, crearCargoPuntual } from '../../services/crearCargoPuntual.service.js';
import Socio from '../../../socios/models/Socio.js';
import Etiqueta from '../../../etiquetas/models/Etiqueta.js';
import Precios from '../../../cuotas/models/Precios.js';
import CargoPuntual from '../../models/CargoPuntual.js';

const CLUB_ID = 'club1';
const SOCIO_ID = '507f1f77bcf86cd799439011';
const ETIQUETA_ID = '507f1f77bcf86cd799439088';
const USER = { id: '507f1f77bcf86cd799439012', email: 'secretaria@carc.test' };

const chainableFindOne = (result) => ({ lean: vi.fn().mockResolvedValue(result) });

const validBody = { socioId: SOCIO_ID, etiquetaId: ETIQUETA_ID, description: 'Trekking a Cerro Negro' };

describe('crearCargoPuntual service (unit)', () => {
  let saveSpy;

  beforeEach(() => {
    Socio.findOne = vi.fn().mockReturnValue(chainableFindOne({ _id: SOCIO_ID }));
    Etiqueta.findOne = vi.fn().mockReturnValue(chainableFindOne({ _id: ETIQUETA_ID, nombre: 'Trekking', unidad: 'unico' }));
    Precios.findOne = vi.fn().mockReturnValue({ sort: vi.fn().mockReturnValue(chainableFindOne(null)) });

    saveSpy = vi.spyOn(CargoPuntual.prototype, 'save').mockImplementation(async function () {
      if (!this._id) this._id = new mongoose.Types.ObjectId();
      return this;
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('should fail without socioId', async () => {
    await expect(crearCargoPuntual({ clubId: CLUB_ID, user: USER, body: { ...validBody, socioId: '' } }))
      .rejects.toBeInstanceOf(BusinessError);
  });

  it('should fail with 404 when socio not found', async () => {
    Socio.findOne.mockReturnValue(chainableFindOne(null));

    await expect(crearCargoPuntual({ clubId: CLUB_ID, user: USER, body: validBody }))
      .rejects.toMatchObject({ status: 404, message: 'Socio no encontrado' });
  });

  it('should fail with 404 when etiqueta not found', async () => {
    Etiqueta.findOne.mockReturnValue(chainableFindOne(null));

    await expect(crearCargoPuntual({ clubId: CLUB_ID, user: USER, body: validBody }))
      .rejects.toMatchObject({ status: 404, message: 'Etiqueta no encontrada' });
  });

  it('should fail when etiqueta unidad is not unico', async () => {
    Etiqueta.findOne.mockReturnValue(chainableFindOne({ _id: ETIQUETA_ID, nombre: 'Cuota Social', unidad: 'mes' }));

    await expect(crearCargoPuntual({ clubId: CLUB_ID, user: USER, body: validBody }))
      .rejects.toEqual(expect.objectContaining({
        message: 'La etiqueta "Cuota Social" no es de cargo puntual (unidad: mes)',
      }));
  });

  it('should fail when there is no precio vigente and no manual monto', async () => {
    await expect(crearCargoPuntual({ clubId: CLUB_ID, user: USER, body: validBody }))
      .rejects.toMatchObject({
        message: 'No hay un precio vigente para esta etiqueta: indicá un monto manualmente',
      });
  });

  it('should use the precio vigente when no manual monto is given', async () => {
    Precios.findOne.mockReturnValue({ sort: vi.fn().mockReturnValue(chainableFindOne({ monto: 200000 })) });

    const cargo = await crearCargoPuntual({ clubId: CLUB_ID, user: USER, body: validBody });

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(cargo.montoEsperadoSnapshot).toBe(200000);
    expect(cargo.precioSugeridoSnapshot).toBe(200000);
    expect(cargo.estado).toBe('pendiente');
    expect(cargo.createdBy).toBe(USER.email);
  });

  it('should use the manual monto and skip Precios lookup', async () => {
    const cargo = await crearCargoPuntual({
      clubId: CLUB_ID, user: USER, body: { ...validBody, monto: 150000 },
    });

    expect(Precios.findOne).not.toHaveBeenCalled();
    expect(cargo.montoEsperadoSnapshot).toBe(150000);
    expect(cargo.precioSugeridoSnapshot).toBeNull();
  });

  it('should fail with a negative manual monto', async () => {
    await expect(crearCargoPuntual({ clubId: CLUB_ID, user: USER, body: { ...validBody, monto: -1 } }))
      .rejects.toBeInstanceOf(BusinessError);
  });
});
