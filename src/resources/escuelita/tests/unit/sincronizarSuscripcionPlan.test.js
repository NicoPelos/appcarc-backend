import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Suscripcion from '../../../suscripciones/models/Suscripcion.js';
import Plan from '../../../planes/models/Plan.js';
import { logAudit } from '../../../audit/services/audit.service.js';
import { sincronizarSuscripcionEscuelita } from '../../services/sincronizarSuscripcionPlan.service.js';

vi.mock('../../../audit/services/audit.service.js', () => ({
  logAudit: vi.fn(),
}));

const CLUB_ID = 'club1';
const SOCIO_ID = 'socio1';
const req = { user: { email: 'admin@carc.test', id: 'user1' } };
const session = {};

// findOne(...).session(...)
const chainableFindOne = (result) => ({ session: vi.fn().mockResolvedValue(result) });

describe('sincronizarSuscripcionEscuelita', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  it('sin planId y sin suscripciones activas de escuelita: no hace nada', async () => {
    Plan.findOne = vi.fn();
    Suscripcion.find = vi.fn().mockReturnValue({ populate: vi.fn().mockReturnValue({ session: vi.fn().mockResolvedValue([]) }) });
    Suscripcion.findOne = vi.fn();

    await sincronizarSuscripcionEscuelita({ clubId: CLUB_ID, socioId: SOCIO_ID, planId: null, req, session });

    expect(Plan.findOne).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('sin planId (desasignar): cierra la suscripción de escuelita activa', async () => {
    const vieja = { _id: 's1', etiquetaId: 'etq-avanzados', planId: { _id: 'planA', tipo: 'escuelita' }, fechaHasta: null, toObject: () => ({}), save: vi.fn().mockResolvedValue(undefined) };
    Suscripcion.find = vi.fn().mockReturnValue({ populate: vi.fn().mockReturnValue({ session: vi.fn().mockResolvedValue([vieja]) }) });
    Plan.findOne = vi.fn();

    await sincronizarSuscripcionEscuelita({ clubId: CLUB_ID, socioId: SOCIO_ID, planId: null, req, session });

    expect(vieja.fechaHasta).toMatch(/^\d{4}-\d{2}$/);
    expect(vieja.save).toHaveBeenCalledWith({ session });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ resource: 'Suscripcion', action: 'UPDATE', resourceId: 's1' }));
  });

  it('lanza 400 si el plan no existe / no es de tipo escuelita', async () => {
    Plan.findOne = vi.fn().mockReturnValue(chainableFindOne(null));
    Suscripcion.find = vi.fn().mockReturnValue({ populate: vi.fn().mockReturnValue({ session: vi.fn().mockResolvedValue([]) }) });

    await expect(sincronizarSuscripcionEscuelita({ clubId: CLUB_ID, socioId: SOCIO_ID, planId: 'planX', req, session }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('crea una nueva Suscripcion si no había ninguna activa de escuelita', async () => {
    Plan.findOne = vi.fn().mockReturnValue(chainableFindOne({ _id: 'planA', etiquetaId: 'etq-avanzados', tipo: 'escuelita' }));
    Suscripcion.find = vi.fn().mockReturnValue({ populate: vi.fn().mockReturnValue({ session: vi.fn().mockResolvedValue([]) }) });
    Suscripcion.findOne = vi.fn().mockReturnValue(chainableFindOne(null));

    const saveSpy = vi.spyOn(Suscripcion.prototype, 'save').mockResolvedValue(undefined);

    await sincronizarSuscripcionEscuelita({ clubId: CLUB_ID, socioId: SOCIO_ID, planId: 'planA', req, session });

    expect(saveSpy).toHaveBeenCalledWith({ session });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ resource: 'Suscripcion', action: 'CREATE' }));
  });

  it('ya sincronizada con la etiqueta correcta pero otro planId: solo actualiza planId (no crea ni cierra nada)', async () => {
    const actual = {
      _id: 's1', etiquetaId: 'etq-avanzados', planId: { _id: 'planViejo', tipo: 'escuelita' }, fechaHasta: null,
      toObject: () => ({}), save: vi.fn().mockResolvedValue(undefined),
    };
    Plan.findOne = vi.fn().mockReturnValue(chainableFindOne({ _id: 'planNuevo', etiquetaId: 'etq-avanzados', tipo: 'escuelita' }));
    Suscripcion.find = vi.fn().mockReturnValue({ populate: vi.fn().mockReturnValue({ session: vi.fn().mockResolvedValue([actual]) }) });

    await sincronizarSuscripcionEscuelita({ clubId: CLUB_ID, socioId: SOCIO_ID, planId: 'planNuevo', req, session });

    expect(actual.planId).toBe('planNuevo');
    expect(actual.save).toHaveBeenCalledWith({ session });
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ resource: 'Suscripcion', action: 'UPDATE', resourceId: 's1' }));
  });

  it('cambia de plan con otra etiqueta: cierra la vieja y crea la nueva', async () => {
    const vieja = {
      _id: 's-vieja', etiquetaId: 'etq-juveniles', planId: { _id: 'planJuveniles', tipo: 'escuelita' }, fechaHasta: null,
      toObject: () => ({}), save: vi.fn().mockResolvedValue(undefined),
    };
    Plan.findOne = vi.fn().mockReturnValue(chainableFindOne({ _id: 'planAvanzados', etiquetaId: 'etq-avanzados', tipo: 'escuelita' }));
    Suscripcion.find = vi.fn().mockReturnValue({ populate: vi.fn().mockReturnValue({ session: vi.fn().mockResolvedValue([vieja]) }) });
    Suscripcion.findOne = vi.fn().mockReturnValue(chainableFindOne(null));
    const saveSpy = vi.spyOn(Suscripcion.prototype, 'save').mockResolvedValue(undefined);

    await sincronizarSuscripcionEscuelita({ clubId: CLUB_ID, socioId: SOCIO_ID, planId: 'planAvanzados', req, session });

    expect(vieja.fechaHasta).toMatch(/^\d{4}-\d{2}$/);
    expect(vieja.save).toHaveBeenCalledWith({ session });
    expect(saveSpy).toHaveBeenCalledWith({ session });
    expect(logAudit).toHaveBeenCalledTimes(2);
  });

  it('reasignar el plan dos veces en el mismo período: desactiva la suscripción errónea en vez de dejarle fechaHasta anterior a fechaDesde', async () => {
    const now = new Date();
    const periodoActual = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

    const elegidaPorError = {
      _id: 's-error', etiquetaId: 'etq-x1', planId: { _id: 'planX1', tipo: 'escuelita' },
      fechaDesde: periodoActual, fechaHasta: null, active: true,
      toObject: () => ({}), save: vi.fn().mockResolvedValue(undefined),
    };
    Plan.findOne = vi.fn().mockReturnValue(chainableFindOne({ _id: 'planX2', etiquetaId: 'etq-x2', tipo: 'escuelita' }));
    Suscripcion.find = vi.fn().mockReturnValue({ populate: vi.fn().mockReturnValue({ session: vi.fn().mockResolvedValue([elegidaPorError]) }) });
    Suscripcion.findOne = vi.fn().mockReturnValue(chainableFindOne(null));
    const saveSpy = vi.spyOn(Suscripcion.prototype, 'save').mockResolvedValue(undefined);

    await sincronizarSuscripcionEscuelita({ clubId: CLUB_ID, socioId: SOCIO_ID, planId: 'planX2', req, session });

    expect(elegidaPorError.active).toBe(false);
    expect(elegidaPorError.fechaHasta).toBeNull(); // nunca se toca fechaHasta, evitando el rango invertido
    expect(elegidaPorError.save).toHaveBeenCalledWith({ session });
    expect(saveSpy).toHaveBeenCalledWith({ session }); // la nueva Suscripcion (planX2) se crea normalmente
  });

  it('reactiva una Suscripcion inactiva existente en vez de chocar contra el índice único', async () => {
    const inactiva = {
      _id: 's-inactiva', active: false, planId: 'planViejo', fechaHasta: '2026-05',
      toObject: () => ({}), save: vi.fn().mockResolvedValue(undefined),
    };
    Plan.findOne = vi.fn().mockReturnValue(chainableFindOne({ _id: 'planA', etiquetaId: 'etq-avanzados', tipo: 'escuelita' }));
    Suscripcion.find = vi.fn().mockReturnValue({ populate: vi.fn().mockReturnValue({ session: vi.fn().mockResolvedValue([]) }) });
    Suscripcion.findOne = vi.fn().mockReturnValue(chainableFindOne(inactiva));

    await sincronizarSuscripcionEscuelita({ clubId: CLUB_ID, socioId: SOCIO_ID, planId: 'planA', req, session });

    expect(inactiva.active).toBe(true);
    expect(inactiva.fechaHasta).toBeNull();
    expect(inactiva.planId).toBe('planA');
    expect(inactiva.save).toHaveBeenCalledWith({ session });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ resource: 'Suscripcion', action: 'UPDATE', resourceId: 's-inactiva' }));
  });
});
