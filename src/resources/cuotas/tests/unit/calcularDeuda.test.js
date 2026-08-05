import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calcularDeuda } from '../../services/calcularDeuda.service.js';

const mockCuotaFindOne = vi.fn();
const mockCuotaFind = vi.fn();
const mockPreciosFindOne = vi.fn();
const mockSuscripcionFind = vi.fn();
const mockAsistenciaFind = vi.fn();
const mockCargoPuntualFind = vi.fn();

vi.mock('../../models/Cuota.js', () => ({
  default: {
    findOne: (...args) => mockCuotaFindOne(...args),
    find: (...args) => mockCuotaFind(...args),
  },
}));

vi.mock('../../models/Precios.js', () => ({
  default: {
    findOne: (...args) => mockPreciosFindOne(...args),
  },
}));

vi.mock('../../../suscripciones/models/Suscripcion.js', () => ({
  default: {
    find: (...args) => mockSuscripcionFind(...args),
  },
}));

vi.mock('../../../asistencias/models/Asistencia.js', () => ({
  default: {
    find: (...args) => mockAsistenciaFind(...args),
  },
}));

vi.mock('../../../cargosPuntuales/models/CargoPuntual.js', () => ({
  default: {
    find: (...args) => mockCargoPuntualFind(...args),
  },
}));

const chainableAsistencia = (result = []) => ({
  select: vi.fn().mockReturnThis(),
  sort: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue(result),
});

const chainableCargoPuntual = (result = []) => ({
  populate: vi.fn().mockReturnThis(),
  sort: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue(result),
});

const mockEtiquetaSocial = { _id: 'etq_social_id', nombre: 'Cuota Social', unidad: 'mes', uso_sistema: 'cuota_social' };

const mockSuscripcion = (overrides = {}) => ({
  _id: 'sus_001',
  socioId: 'socio_001',
  etiquetaId: mockEtiquetaSocial,
  fechaDesde: '2026-03',
  fechaHasta: null,
  active: true,
  ...overrides,
});

const chainableCuota = (result = null) => ({
  sort: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue(result),
});

const chainablePrecio = (result = null) => ({
  sort: vi.fn().mockReturnThis(),
  populate: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue(result),
});

const chainableSuscripcion = (result = []) => ({
  populate: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue(result),
});

beforeEach(() => {
  vi.clearAllMocks();
  mockAsistenciaFind.mockReturnValue(chainableAsistencia([]));
  mockCargoPuntualFind.mockReturnValue(chainableCargoPuntual([]));
});

describe('calcularDeuda', () => {
  it('retorna array vacío si el socio no tiene suscripciones', async () => {
    mockSuscripcionFind.mockReturnValue(chainableSuscripcion([]));

    const result = await calcularDeuda({ socioId: 'socio_001', clubId: 'CARC' });

    expect(result.suscripciones).toEqual([]);
    expect(result.otrosCargos).toEqual([]);
  });

  it('trae todas las suscripciones activas, sin filtrar por fechaHasta', async () => {
    mockSuscripcionFind.mockReturnValue(chainableSuscripcion([]));

    await calcularDeuda({ socioId: 'socio_001', clubId: 'CARC' });

    expect(mockSuscripcionFind).toHaveBeenCalledWith({
      socioId: 'socio_001',
      clubId: 'CARC',
      active: true,
    });
  });

  it('incluye una suscripción cerrada con fechaHasta pasado si le queda un período sin pagar (appcarc-backend#46)', async () => {
    // Reproduce el bug real encontrado al probar /excluir-periodo: un tramo
    // cerrado con fechaHasta anterior a hoy no debe desaparecer de la deuda
    // si todavía tiene periodos sin pagar dentro de su propio rango.
    const sus = mockSuscripcion({ fechaDesde: '2026-02', fechaHasta: '2026-05' });
    mockSuscripcionFind.mockReturnValue(chainableSuscripcion([sus]));
    mockCuotaFindOne.mockReturnValue(chainableCuota({ periodo: '2026-04' }));
    mockCuotaFind.mockReturnValue(chainableCuota([
      { periodo: '2026-02' }, { periodo: '2026-03' }, { periodo: '2026-04' },
    ]));
    mockPreciosFindOne.mockReturnValue(chainablePrecio({ monto: 15000 }));

    const result = await calcularDeuda({ socioId: 'socio_001', clubId: 'CARC' });

    expect(result.suscripciones).toHaveLength(1);
    expect(result.suscripciones[0].periodos).toEqual(['2026-05']);
    expect(result.suscripciones[0].totalDeuda).toBe(15000);
  });

  it('incluye periodosPagados con todo el historial de cuotas pagadas de la etiqueta', async () => {
    const sus = mockSuscripcion({ fechaDesde: '2026-06' });
    mockSuscripcionFind.mockReturnValue(chainableSuscripcion([sus]));
    mockCuotaFindOne.mockReturnValue(chainableCuota(null));
    mockCuotaFind.mockReturnValue(chainableCuota([{ periodo: '2026-01' }, { periodo: '2026-02' }]));
    mockPreciosFindOne.mockReturnValue(chainablePrecio({ monto: 15000 }));

    const result = await calcularDeuda({ socioId: 'socio_001', clubId: 'CARC' });

    expect(result.suscripciones[0].periodosPagados).toEqual(['2026-01', '2026-02']);
  });

  it('periodosPagados es un array vacío para una suscripción exenta, sin consultar Cuota', async () => {
    const sus = mockSuscripcion({ fechaDesde: '2026-06', exento: true });
    mockSuscripcionFind.mockReturnValue(chainableSuscripcion([sus]));

    const result = await calcularDeuda({ socioId: 'socio_001', clubId: 'CARC' });

    expect(result.suscripciones[0].periodosPagados).toEqual([]);
    expect(mockCuotaFind).not.toHaveBeenCalled();
  });

  it('incluye suscripcionId y etiqueta en el resultado', async () => {
    const sus = mockSuscripcion({ fechaDesde: '2026-06' });
    mockSuscripcionFind.mockReturnValue(chainableSuscripcion([sus]));
    mockCuotaFindOne.mockReturnValue(chainableCuota(null));
    mockCuotaFind.mockReturnValue(chainableCuota([]));
    mockPreciosFindOne.mockReturnValue(chainablePrecio({ monto: 15000 }));

    const result = await calcularDeuda({ socioId: 'socio_001', clubId: 'CARC' });

    expect(result.suscripciones[0].suscripcionId).toBe('sus_001');
    expect(result.suscripciones[0].etiqueta).toEqual(mockEtiquetaSocial);
    expect(result.suscripciones[0].precioUnitario).toBe(15000);
  });

  it('deuda 0 si fechaDesde es futura', async () => {
    const sus = mockSuscripcion({ fechaDesde: '2027-01' });
    mockSuscripcionFind.mockReturnValue(chainableSuscripcion([sus]));
    mockPreciosFindOne.mockReturnValue(chainablePrecio({ monto: 15000 }));

    const result = await calcularDeuda({ socioId: 'socio_001', clubId: 'CARC' });

    expect(result.suscripciones[0].mesesDeuda).toBe(0);
    expect(result.suscripciones[0].totalDeuda).toBe(0);
  });

  it('totalDeuda es null cuando no hay precio configurado', async () => {
    const sus = mockSuscripcion({ fechaDesde: '2026-05' });
    mockSuscripcionFind.mockReturnValue(chainableSuscripcion([sus]));
    mockCuotaFindOne.mockReturnValue(chainableCuota(null));
    mockCuotaFind.mockReturnValue(chainableCuota([]));
    mockPreciosFindOne.mockReturnValue(chainablePrecio(null));

    const result = await calcularDeuda({ socioId: 'socio_001', clubId: 'CARC' });

    expect(result.suscripciones[0].precioUnitario).toBeNull();
    expect(result.suscripciones[0].totalDeuda).toBeNull();
  });

  it('descuenta períodos ya pagados', async () => {
    const sus = mockSuscripcion({ fechaDesde: '2026-04' });
    mockSuscripcionFind.mockReturnValue(chainableSuscripcion([sus]));
    mockCuotaFindOne.mockReturnValue(chainableCuota({ periodo: '2026-04' }));
    mockCuotaFind.mockReturnValue(chainableCuota([{ periodo: '2026-04' }, { periodo: '2026-05' }]));
    mockPreciosFindOne.mockReturnValue(chainablePrecio({ monto: 15000 }));

    const result = await calcularDeuda({ socioId: 'socio_001', clubId: 'CARC' });

    // de 2026-04 a hoy (2026-06): 3 períodos, 2 pagados → 1 pendiente
    expect(result.suscripciones[0].mesesDeuda).toBeGreaterThanOrEqual(0);
    expect(result.suscripciones[0].periodos).not.toContain('2026-04');
    expect(result.suscripciones[0].periodos).not.toContain('2026-05');
  });

  it('procesa múltiples suscripciones independientemente', async () => {
    const sus1 = mockSuscripcion({ _id: 'sus_001', fechaDesde: '2026-06', etiquetaId: mockEtiquetaSocial });
    const sus2 = mockSuscripcion({ _id: 'sus_002', fechaDesde: '2026-06', etiquetaId: { _id: 'etq_esc_id', nombre: 'Escuelita 2x', unidad: 'mes', uso_sistema: null } });
    mockSuscripcionFind.mockReturnValue(chainableSuscripcion([sus1, sus2]));
    mockCuotaFindOne.mockReturnValue(chainableCuota(null));
    mockCuotaFind.mockReturnValue(chainableCuota([]));
    mockPreciosFindOne.mockReturnValue(chainablePrecio({ monto: 10000 }));

    const result = await calcularDeuda({ socioId: 'socio_001', clubId: 'CARC' });

    expect(result.suscripciones).toHaveLength(2);
    expect(result.suscripciones[0].suscripcionId).toBe('sus_001');
    expect(result.suscripciones[1].suscripcionId).toBe('sus_002');
  });

  it('exento: mesesDeuda y totalDeuda en 0 sin consultar Cuota', async () => {
    const sus = mockSuscripcion({ fechaDesde: '2020-01', exento: true });
    mockSuscripcionFind.mockReturnValue(chainableSuscripcion([sus]));
    mockPreciosFindOne.mockReturnValue(chainablePrecio({ monto: 15000 }));

    const result = await calcularDeuda({ socioId: 'socio_001', clubId: 'CARC' });

    expect(result.suscripciones[0].mesesDeuda).toBe(0);
    expect(result.suscripciones[0].totalDeuda).toBe(0);
    expect(result.suscripciones[0].periodos).toEqual([]);
    expect(result.suscripciones[0].exento).toBe(true);
    expect(mockCuotaFind).not.toHaveBeenCalled();
    expect(mockCuotaFindOne).not.toHaveBeenCalled();
  });

  it('respeta fechaHasta de suscripcion cerrada', async () => {
    const sus = mockSuscripcion({ fechaDesde: '2026-01', fechaHasta: '2026-03' });
    mockSuscripcionFind.mockReturnValue(chainableSuscripcion([sus]));
    mockCuotaFindOne.mockReturnValue(chainableCuota(null));
    mockCuotaFind.mockReturnValue(chainableCuota([]));
    mockPreciosFindOne.mockReturnValue(chainablePrecio({ monto: 15000 }));

    const result = await calcularDeuda({ socioId: 'socio_001', clubId: 'CARC' });

    // Solo genera deuda de 2026-01 a 2026-03 (3 períodos)
    expect(result.suscripciones[0].periodos.every((p) => p <= '2026-03')).toBe(true);
  });

  it('otrosCargos es un array vacío si no hay visitas pendientes', async () => {
    mockSuscripcionFind.mockReturnValue(chainableSuscripcion([]));
    mockAsistenciaFind.mockReturnValue(chainableAsistencia([]));

    const result = await calcularDeuda({ socioId: 'socio_001', clubId: 'CARC' });

    expect(result.otrosCargos).toEqual([]);
  });

  it('otrosCargos suma las visitas pendientes de check-in de muro libre', async () => {
    mockSuscripcionFind.mockReturnValue(chainableSuscripcion([]));
    mockAsistenciaFind.mockReturnValue(chainableAsistencia([
      { fecha: '2026-06-01T12:00:00Z', precioSugeridoSnapshot: 2000 },
      { fecha: '2026-06-08T12:00:00Z', precioSugeridoSnapshot: 2500 },
    ]));

    const result = await calcularDeuda({ socioId: 'socio_001', clubId: 'CARC' });

    expect(result.otrosCargos).toEqual([{
      tipo: 'muro_libre',
      nombre: 'Muro Libre',
      cantidadPendiente: 2,
      unidadPendiente: 'visita',
      fechas: ['2026-06-01T12:00:00Z', '2026-06-08T12:00:00Z'],
      totalDeuda: 4500,
    }]);
    expect(mockAsistenciaFind).toHaveBeenCalledWith(expect.objectContaining({
      clubId: 'CARC',
      socioId: 'socio_001',
      tipo: 'muro_libre',
      tipoPase: 'diario',
      active: true,
      estadoPago: 'pendiente',
    }));
  });

  it('el cargo de muro libre trata precioSugeridoSnapshot null como 0', async () => {
    mockSuscripcionFind.mockReturnValue(chainableSuscripcion([]));
    mockAsistenciaFind.mockReturnValue(chainableAsistencia([
      { fecha: '2026-06-01T12:00:00Z', precioSugeridoSnapshot: null },
    ]));

    const result = await calcularDeuda({ socioId: 'socio_001', clubId: 'CARC' });

    expect(result.otrosCargos[0]).toEqual(expect.objectContaining({
      cantidadPendiente: 1,
      totalDeuda: 0,
    }));
  });

  it('otrosCargos incluye un cargo puntual pendiente por socio', async () => {
    mockSuscripcionFind.mockReturnValue(chainableSuscripcion([]));
    mockCargoPuntualFind.mockReturnValue(chainableCargoPuntual([{
      _id: 'cargo_001',
      etiquetaId: { nombre: 'Trekking a Cerro Negro' },
      description: 'Viaje del 15/8',
      montoEsperadoSnapshot: 200000,
    }]));

    const result = await calcularDeuda({ socioId: 'socio_001', clubId: 'CARC' });

    expect(result.otrosCargos).toEqual([{
      tipo: 'cargo_puntual',
      cargoPuntualId: 'cargo_001',
      nombre: 'Trekking a Cerro Negro',
      descripcion: 'Viaje del 15/8',
      totalDeuda: 200000,
    }]);
    expect(mockCargoPuntualFind).toHaveBeenCalledWith(expect.objectContaining({
      clubId: 'CARC', socioId: 'socio_001', estado: 'pendiente', active: true,
    }));
  });

  it('otrosCargos combina muro libre pendiente y varios cargos puntuales', async () => {
    mockSuscripcionFind.mockReturnValue(chainableSuscripcion([]));
    mockAsistenciaFind.mockReturnValue(chainableAsistencia([
      { fecha: '2026-06-01T12:00:00Z', precioSugeridoSnapshot: 2000 },
    ]));
    mockCargoPuntualFind.mockReturnValue(chainableCargoPuntual([
      { _id: 'cargo_001', etiquetaId: { nombre: 'Inscripción' }, description: 'Inscripción 2026', montoEsperadoSnapshot: 5000 },
      { _id: 'cargo_002', etiquetaId: null, description: 'Cargo sin etiqueta', montoEsperadoSnapshot: 1000 },
    ]));

    const result = await calcularDeuda({ socioId: 'socio_001', clubId: 'CARC' });

    expect(result.otrosCargos).toHaveLength(3);
    expect(result.otrosCargos[0].tipo).toBe('muro_libre');
    expect(result.otrosCargos[1]).toMatchObject({ tipo: 'cargo_puntual', cargoPuntualId: 'cargo_001', nombre: 'Inscripción' });
    expect(result.otrosCargos[2]).toMatchObject({ tipo: 'cargo_puntual', cargoPuntualId: 'cargo_002', nombre: 'Cargo puntual' });
  });
});
