import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../models/Precios.js', () => ({
  default: { find: vi.fn() },
}));

import { resolverVigenciaPrecio, BusinessError, RequiereConfirmacionError } from '../../services/resolverVigenciaPrecio.service.js';
import Precios from '../../models/Precios.js';

const CLUB_ID = 'CARC';
const ETIQUETA_ID = 'etq1';

const mockOtros = (docs) => {
  Precios.find.mockReturnValue({ session: vi.fn().mockResolvedValue(docs) });
};

const fakePrecio = ({ id, nombre, desde, hasta = null }) => ({
  _id: id,
  nombre,
  vigenteDesde: desde,
  vigenteHasta: hasta,
  save: vi.fn().mockResolvedValue(undefined),
});

beforeEach(() => vi.clearAllMocks());

describe('resolverVigenciaPrecio', () => {
  it('no hace nada si no hay otros precios de la etiqueta', async () => {
    mockOtros([]);
    await expect(resolverVigenciaPrecio({
      clubId: CLUB_ID, etiquetaId: ETIQUETA_ID,
      desde: new Date('2026-08-01'), hasta: null,
    })).resolves.toBeUndefined();
  });

  it('rechaza (BusinessError) si otro precio activo arranca exactamente el mismo día', async () => {
    mockOtros([fakePrecio({ id: 'p1', nombre: 'Cuota Social', desde: new Date('2026-08-01') })]);

    await expect(resolverVigenciaPrecio({
      clubId: CLUB_ID, etiquetaId: ETIQUETA_ID,
      desde: new Date('2026-08-01'), hasta: null,
    })).rejects.toBeInstanceOf(BusinessError);
  });

  it('rechaza si el nuevo se metería encima de uno que ya está programado para después', async () => {
    // nuevo: agosto sin fin. otro ya programado: arranca en septiembre.
    mockOtros([fakePrecio({ id: 'p1', nombre: 'Cuota Social Sep', desde: new Date('2026-09-01') })]);

    await expect(resolverVigenciaPrecio({
      clubId: CLUB_ID, etiquetaId: ETIQUETA_ID,
      desde: new Date('2026-08-01'), hasta: null,
    })).rejects.toBeInstanceOf(BusinessError);
  });

  it('NO rechaza si el nuevo termina antes de que arranque el programado más adelante', async () => {
    mockOtros([fakePrecio({ id: 'p1', nombre: 'Cuota Social Sep', desde: new Date('2026-09-01') })]);

    await expect(resolverVigenciaPrecio({
      clubId: CLUB_ID, etiquetaId: ETIQUETA_ID,
      desde: new Date('2026-08-01'), hasta: new Date('2026-08-31'),
    })).resolves.toBeUndefined();
  });

  it('pide confirmación (RequiereConfirmacionError) si hay un precio anterior abierto que se solaparía', async () => {
    mockOtros([fakePrecio({ id: 'p1', nombre: 'Cuota Social', desde: new Date('2026-06-26'), hasta: null })]);

    const err = await resolverVigenciaPrecio({
      clubId: CLUB_ID, etiquetaId: ETIQUETA_ID,
      desde: new Date('2026-08-01'), hasta: null,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(RequiereConfirmacionError);
    expect(err.precios).toEqual([expect.objectContaining({ id: 'p1', nombre: 'Cuota Social' })]);
  });

  it('con confirmado:true, cierra el precio anterior el día antes de que arranque el nuevo', async () => {
    const anterior = fakePrecio({ id: 'p1', nombre: 'Cuota Social', desde: new Date('2026-06-26'), hasta: null });
    mockOtros([anterior]);

    await resolverVigenciaPrecio({
      clubId: CLUB_ID, etiquetaId: ETIQUETA_ID,
      desde: new Date('2026-08-01T00:00:00.000Z'), hasta: null,
      confirmado: true,
    });

    expect(anterior.vigenteHasta.toISOString()).toBe('2026-07-31T00:00:00.000Z');
    expect(anterior.save).toHaveBeenCalled();
  });

  it('no toca precios cuyo rango ya termina antes de que arranque el nuevo', async () => {
    const yaCerrado = fakePrecio({ id: 'p1', nombre: 'Cuota Vieja', desde: new Date('2026-01-01'), hasta: new Date('2026-06-30') });
    mockOtros([yaCerrado]);

    await resolverVigenciaPrecio({
      clubId: CLUB_ID, etiquetaId: ETIQUETA_ID,
      desde: new Date('2026-08-01'), hasta: null,
      confirmado: true,
    });

    expect(yaCerrado.save).not.toHaveBeenCalled();
  });

  it('excluye el propio precio (excludeId) al buscar conflictos, para poder editar sin chocar consigo mismo', async () => {
    mockOtros([]); // el mock de find ya asume que excludeId lo filtró en la query real
    await resolverVigenciaPrecio({
      clubId: CLUB_ID, etiquetaId: ETIQUETA_ID,
      desde: new Date('2026-08-01'), hasta: null,
      excludeId: 'propio1',
    });
    expect(Precios.find).toHaveBeenCalledWith(expect.objectContaining({ _id: { $ne: 'propio1' } }));
  });
});
