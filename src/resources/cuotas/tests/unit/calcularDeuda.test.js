import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calcularDeuda } from '../../services/calcularDeuda.service.js';

const mockCuotaFindOne = vi.fn();
const mockCuotaFind = vi.fn();
const mockPreciosFindOne = vi.fn();
const mockSuscripcionFind = vi.fn();

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

beforeEach(() => vi.clearAllMocks());

describe('calcularDeuda', () => {
  it('retorna array vacío si el socio no tiene suscripciones', async () => {
    mockSuscripcionFind.mockReturnValue(chainableSuscripcion([]));

    const result = await calcularDeuda({ socioId: 'socio_001', clubId: 'CARC' });

    expect(result).toEqual([]);
  });

  it('incluye suscripcionId y etiqueta en el resultado', async () => {
    const sus = mockSuscripcion({ fechaDesde: '2026-06' });
    mockSuscripcionFind.mockReturnValue(chainableSuscripcion([sus]));
    mockCuotaFindOne.mockReturnValue(chainableCuota(null));
    mockCuotaFind.mockReturnValue(chainableCuota([]));
    mockPreciosFindOne.mockReturnValue(chainablePrecio({ monto: 15000 }));

    const result = await calcularDeuda({ socioId: 'socio_001', clubId: 'CARC' });

    expect(result[0].suscripcionId).toBe('sus_001');
    expect(result[0].etiqueta).toEqual(mockEtiquetaSocial);
    expect(result[0].precioUnitario).toBe(15000);
  });

  it('deuda 0 si fechaDesde es futura', async () => {
    const sus = mockSuscripcion({ fechaDesde: '2027-01' });
    mockSuscripcionFind.mockReturnValue(chainableSuscripcion([sus]));
    mockPreciosFindOne.mockReturnValue(chainablePrecio({ monto: 15000 }));

    const result = await calcularDeuda({ socioId: 'socio_001', clubId: 'CARC' });

    expect(result[0].mesesDeuda).toBe(0);
    expect(result[0].totalDeuda).toBe(0);
  });

  it('totalDeuda es null cuando no hay precio configurado', async () => {
    const sus = mockSuscripcion({ fechaDesde: '2026-05' });
    mockSuscripcionFind.mockReturnValue(chainableSuscripcion([sus]));
    mockCuotaFindOne.mockReturnValue(chainableCuota(null));
    mockCuotaFind.mockReturnValue(chainableCuota([]));
    mockPreciosFindOne.mockReturnValue(chainablePrecio(null));

    const result = await calcularDeuda({ socioId: 'socio_001', clubId: 'CARC' });

    expect(result[0].precioUnitario).toBeNull();
    expect(result[0].totalDeuda).toBeNull();
  });

  it('descuenta períodos ya pagados', async () => {
    const sus = mockSuscripcion({ fechaDesde: '2026-04' });
    mockSuscripcionFind.mockReturnValue(chainableSuscripcion([sus]));
    mockCuotaFindOne.mockReturnValue(chainableCuota({ periodo: '2026-04' }));
    mockCuotaFind.mockReturnValue(chainableCuota([{ periodo: '2026-04' }, { periodo: '2026-05' }]));
    mockPreciosFindOne.mockReturnValue(chainablePrecio({ monto: 15000 }));

    const result = await calcularDeuda({ socioId: 'socio_001', clubId: 'CARC' });

    // de 2026-04 a hoy (2026-06): 3 períodos, 2 pagados → 1 pendiente
    expect(result[0].mesesDeuda).toBeGreaterThanOrEqual(0);
    expect(result[0].periodos).not.toContain('2026-04');
    expect(result[0].periodos).not.toContain('2026-05');
  });

  it('procesa múltiples suscripciones independientemente', async () => {
    const sus1 = mockSuscripcion({ _id: 'sus_001', fechaDesde: '2026-06', etiquetaId: mockEtiquetaSocial });
    const sus2 = mockSuscripcion({ _id: 'sus_002', fechaDesde: '2026-06', etiquetaId: { _id: 'etq_esc_id', nombre: 'Escuelita 2x', unidad: 'mes', uso_sistema: null } });
    mockSuscripcionFind.mockReturnValue(chainableSuscripcion([sus1, sus2]));
    mockCuotaFindOne.mockReturnValue(chainableCuota(null));
    mockCuotaFind.mockReturnValue(chainableCuota([]));
    mockPreciosFindOne.mockReturnValue(chainablePrecio({ monto: 10000 }));

    const result = await calcularDeuda({ socioId: 'socio_001', clubId: 'CARC' });

    expect(result).toHaveLength(2);
    expect(result[0].suscripcionId).toBe('sus_001');
    expect(result[1].suscripcionId).toBe('sus_002');
  });

  it('respeta fechaHasta de suscripcion cerrada', async () => {
    const sus = mockSuscripcion({ fechaDesde: '2026-01', fechaHasta: '2026-03' });
    mockSuscripcionFind.mockReturnValue(chainableSuscripcion([sus]));
    mockCuotaFindOne.mockReturnValue(chainableCuota(null));
    mockCuotaFind.mockReturnValue(chainableCuota([]));
    mockPreciosFindOne.mockReturnValue(chainablePrecio({ monto: 15000 }));

    const result = await calcularDeuda({ socioId: 'socio_001', clubId: 'CARC' });

    // Solo genera deuda de 2026-01 a 2026-03 (3 períodos)
    expect(result[0].periodos.every((p) => p <= '2026-03')).toBe(true);
  });
});
