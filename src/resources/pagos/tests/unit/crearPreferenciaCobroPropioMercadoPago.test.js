import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockIntentSave } = vi.hoisted(() => ({ mockIntentSave: vi.fn() }));

vi.mock('../../../socios/models/Socio.js', () => ({
  default: { find: vi.fn() },
}));
vi.mock('../../models/MercadoPagoConfig.js', () => ({
  default: { findOne: vi.fn() },
}));
vi.mock('../../models/PagoOnlineIntent.js', () => {
  const PagoOnlineIntentMock = vi.fn().mockImplementation((data) => ({ ...data, save: mockIntentSave }));
  return { default: PagoOnlineIntentMock };
});
vi.mock('../../../suscripciones/models/Suscripcion.js', () => ({
  default: { findOne: vi.fn() },
}));
vi.mock('../../../cuotas/models/Cuota.js', () => ({
  default: { findOne: vi.fn() },
}));
vi.mock('../../../cargosPuntuales/models/CargoPuntual.js', () => ({
  default: { findOne: vi.fn() },
}));
vi.mock('../../../asistencias/models/Asistencia.js', () => ({
  default: { find: vi.fn() },
}));
vi.mock('../../../etiquetas/models/Etiqueta.js', () => ({
  default: { findById: vi.fn() },
}));
vi.mock('../../../cuotas/services/findPrecioVigente.service.js', () => ({
  findPrecioVigente: vi.fn(),
}));
vi.mock('../../../usuarios/models/User.js', () => ({
  default: { findById: vi.fn() },
}));
vi.mock('../../../vinculos/models/VinculoFamiliar.js', () => ({
  default: { find: vi.fn() },
}));

import Socio from '../../../socios/models/Socio.js';
import MercadoPagoConfig from '../../models/MercadoPagoConfig.js';
import PagoOnlineIntent from '../../models/PagoOnlineIntent.js';
import Suscripcion from '../../../suscripciones/models/Suscripcion.js';
import Cuota from '../../../cuotas/models/Cuota.js';
import CargoPuntual from '../../../cargosPuntuales/models/CargoPuntual.js';
import Asistencia from '../../../asistencias/models/Asistencia.js';
import Etiqueta from '../../../etiquetas/models/Etiqueta.js';
import User from '../../../usuarios/models/User.js';
import VinculoFamiliar from '../../../vinculos/models/VinculoFamiliar.js';
import { findPrecioVigente } from '../../../cuotas/services/findPrecioVigente.service.js';
import { crearPreferenciaCobroPropioMercadoPago, BusinessError } from '../../services/crearPreferenciaCobroPropioMercadoPago.service.js';

const CLUB_ID = 'CARC';
const USER_ID = 'user-1';
const SOCIO_ID = 'socio-1'; // propio del usuario
const HIJO_ID = 'socio-hijo'; // vinculado
const SUSCRIPCION_ID = 'sus-1';

const baseArgs = () => ({
  clubId: CLUB_ID,
  requestedByUserId: USER_ID,
  requestedByEmail: 'tutor@carc.test',
  items: [{ socioId: SOCIO_ID, suscripcionId: SUSCRIPCION_ID, periodos: ['2026-07', '2026-08'] }],
});

const stubMpFetch = (body, ok = true, status = 200) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  }));
};

beforeEach(() => {
  vi.clearAllMocks();
  MercadoPagoConfig.findOne = vi.fn().mockResolvedValue({ clubId: CLUB_ID, accessToken: 'TEST-token', active: true });
  Socio.find = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([{ _id: SOCIO_ID, nombre: 'Ana', apellido: 'García', correoElectronico: 'ana@test.com' }]) });
  User.findById = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ socioId: SOCIO_ID }) }) });
  VinculoFamiliar.find = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([{ hijoSocioId: HIJO_ID }]) }) });
  Suscripcion.findOne = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: SUSCRIPCION_ID, socioId: SOCIO_ID, clubId: CLUB_ID, etiquetaId: 'etq-1', active: true }) });
  Cuota.findOne = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
  CargoPuntual.findOne = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
  Asistencia.find = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
  Etiqueta.findById = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: 'etq-1', nombre: 'Cuota Social' }) });
  findPrecioVigente.mockResolvedValue({ monto: 7500 });
  mockIntentSave.mockResolvedValue(undefined);
  stubMpFetch({ id: 'pref-1', init_point: 'https://mp.test/checkout/pref-1' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('crearPreferenciaCobroPropioMercadoPago', () => {
  it('genera la preferencia resolviendo el precio vigente en el servidor', async () => {
    const result = await crearPreferenciaCobroPropioMercadoPago(baseArgs());

    expect(result).toEqual({ initPoint: 'https://mp.test/checkout/pref-1', preferenceId: 'pref-1', intentId: expect.any(String) });
    expect(PagoOnlineIntent).toHaveBeenCalledWith(expect.objectContaining({
      clubId: CLUB_ID,
      socioId: SOCIO_ID,
      totalAmount: 15000, // 2 períodos × 7500
      preferenceId: 'pref-1',
    }));
    expect(mockIntentSave).toHaveBeenCalled();
  });

  it('ignora cualquier "amount" que venga en el body y usa el precio vigente igual', async () => {
    const args = baseArgs();
    args.items = [{ socioId: SOCIO_ID, suscripcionId: SUSCRIPCION_ID, periodos: ['2026-07'], amount: 1 }];

    await crearPreferenciaCobroPropioMercadoPago(args);

    expect(PagoOnlineIntent).toHaveBeenCalledWith(expect.objectContaining({ totalAmount: 7500 }));
  });

  it('permite pagar en un mismo link ítems del propio usuario y de un hijo vinculado', async () => {
    CargoPuntual.findOne = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: 'cargo-1', estado: 'pendiente', montoEsperadoSnapshot: 3000, description: 'Salida' }) });
    Socio.find = vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        { _id: SOCIO_ID, nombre: 'Ana', apellido: 'García', correoElectronico: 'ana@test.com' },
        { _id: HIJO_ID, nombre: 'Tomás', apellido: 'García', correoElectronico: null },
      ]),
    });
    const args = {
      ...baseArgs(),
      items: [
        { socioId: SOCIO_ID, suscripcionId: SUSCRIPCION_ID, periodos: ['2026-07'] }, // 7500
        { socioId: HIJO_ID, cargoPuntualId: 'cargo-1' }, // 3000
      ],
    };

    await crearPreferenciaCobroPropioMercadoPago(args);

    expect(PagoOnlineIntent).toHaveBeenCalledWith(expect.objectContaining({
      socioId: SOCIO_ID, // primario: el propio del usuario
      totalAmount: 10500,
      items: expect.arrayContaining([
        expect.objectContaining({ socioId: SOCIO_ID }),
        expect.objectContaining({ socioId: HIJO_ID }),
      ]),
    }));
  });

  it('rechaza un item cuyo socioId no es un perfil accesible del usuario (ni propio ni vinculado)', async () => {
    const args = { ...baseArgs(), items: [{ socioId: 'socio-ajeno', suscripcionId: SUSCRIPCION_ID, periodos: ['2026-07'] }] };

    await expect(crearPreferenciaCobroPropioMercadoPago(args)).rejects.toMatchObject({ status: 403 });
  });

  it('resuelve el monto de un cargo puntual desde su snapshot', async () => {
    CargoPuntual.findOne = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: 'cargo-1', estado: 'pendiente', montoEsperadoSnapshot: 3000, description: 'Salida' }) });
    const args = { ...baseArgs(), items: [{ socioId: SOCIO_ID, cargoPuntualId: 'cargo-1' }] };

    await crearPreferenciaCobroPropioMercadoPago(args);

    expect(PagoOnlineIntent).toHaveBeenCalledWith(expect.objectContaining({ totalAmount: 3000 }));
  });

  it('rechaza un cargo puntual que ya está pagado', async () => {
    CargoPuntual.findOne = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: 'cargo-1', estado: 'pagada', montoEsperadoSnapshot: 3000, description: 'Salida' }) });
    const args = { ...baseArgs(), items: [{ socioId: SOCIO_ID, cargoPuntualId: 'cargo-1' }] };

    await expect(crearPreferenciaCobroPropioMercadoPago(args)).rejects.toMatchObject({ status: 409 });
  });

  it('suma las visitas pendientes de Muro Libre desde su precioSugeridoSnapshot', async () => {
    Asistencia.find = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([{ precioSugeridoSnapshot: 2000 }, { precioSugeridoSnapshot: 2500 }]) });
    const args = { ...baseArgs(), items: [{ socioId: SOCIO_ID, muroLibrePendiente: true }] };

    await crearPreferenciaCobroPropioMercadoPago(args);

    expect(PagoOnlineIntent).toHaveBeenCalledWith(expect.objectContaining({ totalAmount: 4500 }));
  });

  it('rechaza si un período ya está pagado', async () => {
    Cuota.findOne = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ periodo: '2026-07', estado: 'pagada' }) });

    await expect(crearPreferenciaCobroPropioMercadoPago(baseArgs())).rejects.toMatchObject({ status: 409 });
  });

  it('rechaza si la suscripción no le pertenece al socio indicado', async () => {
    Suscripcion.findOne = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    await expect(crearPreferenciaCobroPropioMercadoPago(baseArgs())).rejects.toMatchObject({ status: 404 });
  });

  it('rechaza si no hay precio vigente configurado', async () => {
    findPrecioVigente.mockResolvedValue(null);

    await expect(crearPreferenciaCobroPropioMercadoPago(baseArgs())).rejects.toMatchObject({ message: expect.stringContaining('precio vigente') });
  });

  it('rechaza si el usuario no tiene ningún perfil accesible', async () => {
    User.findById = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }) });
    VinculoFamiliar.find = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) });

    await expect(crearPreferenciaCobroPropioMercadoPago(baseArgs())).rejects.toMatchObject({ status: 401 });
  });

  it('rechaza si items está vacío', async () => {
    const args = { ...baseArgs(), items: [] };
    await expect(crearPreferenciaCobroPropioMercadoPago(args)).rejects.toMatchObject({ message: expect.stringContaining('ítem') });
  });

  it('rechaza si un item no indica ni suscripcionId, ni cargoPuntualId, ni muroLibrePendiente', async () => {
    const args = { ...baseArgs(), items: [{ socioId: SOCIO_ID }] };
    await expect(crearPreferenciaCobroPropioMercadoPago(args)).rejects.toMatchObject({ message: expect.stringContaining('suscripcionId, cargoPuntualId o muroLibrePendiente') });
  });

  it('rechaza items duplicados', async () => {
    const args = {
      ...baseArgs(),
      items: [
        { socioId: SOCIO_ID, suscripcionId: SUSCRIPCION_ID, periodos: ['2026-07'] },
        { socioId: SOCIO_ID, suscripcionId: SUSCRIPCION_ID, periodos: ['2026-08'] },
      ],
    };

    await expect(crearPreferenciaCobroPropioMercadoPago(args)).rejects.toMatchObject({ message: expect.stringContaining('duplicado') });
  });

  it('rechaza si el club no tiene Mercado Pago configurado', async () => {
    MercadoPagoConfig.findOne.mockResolvedValue(null);

    await expect(crearPreferenciaCobroPropioMercadoPago(baseArgs())).rejects.toBeInstanceOf(BusinessError);
  });
});
