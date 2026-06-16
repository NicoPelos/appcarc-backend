import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calcularDeuda } from '../../services/calcularDeuda.service.js';
import Cuota from '../../models/Cuota.js';
import Precios from '../../models/Precios.js';
import Socio from '../../../socios/models/Socio.js';
import Escuelita from '../../../escuelita/models/Escuelita.js';

const CLUB_ID = 'club1';
const SOCIO_ID = '507f1f77bcf86cd799439011';
const FECHA_HOY = new Date('2026-06-15T12:00:00Z');

const mockPrecio = (monto = 15000) => {
  Precios.findOne = vi.fn().mockReturnValue({
    sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ monto }) }),
  });
};

const mockUltimaCuota = (periodo) => {
  Cuota.findOne = vi.fn().mockReturnValue({
    sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(periodo ? { periodo } : null) }),
  });
};

const mockCuotasPagadas = (periodos = []) => {
  Cuota.find = vi.fn().mockReturnValue({
    lean: vi.fn().mockResolvedValue(periodos.map((periodo) => ({ periodo }))),
  });
};

const mockSocio = (fechaDeAsociado) => {
  Socio.findOne = vi.fn().mockReturnValue({
    lean: vi.fn().mockResolvedValue(fechaDeAsociado ? { fechaDeAsociado: new Date(fechaDeAsociado) } : { fechaDeAsociado: null }),
  });
};

const mockAlumno = (fechaInscripcion) => {
  Escuelita.findOne = vi.fn().mockReturnValue({
    lean: vi.fn().mockResolvedValue(fechaInscripcion !== undefined
      ? { fechaInscripcion: fechaInscripcion ? new Date(fechaInscripcion) : null }
      : null),
  });
};

describe('calcularDeuda (unit)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FECHA_HOY);
    mockPrecio();
    mockCuotasPagadas();
    Socio.findOne = vi.fn();
    Escuelita.findOne = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('cuota social', () => {
    it('socio al día: último pago es el período actual → deuda 0', async () => {
      mockUltimaCuota('2026-06');

      const result = await calcularDeuda({ socioId: SOCIO_ID, clubId: CLUB_ID, tipo: 'social' });

      expect(result.mesesDeuda).toBe(0);
      expect(result.periodos).toEqual([]);
      expect(result.totalDeuda).toBe(0);
      expect(result.ultimoPeriodoPagado).toBe('2026-06');
    });

    it('debe 4 meses (2026-02 último pago)', async () => {
      mockUltimaCuota('2026-02');

      const result = await calcularDeuda({ socioId: SOCIO_ID, clubId: CLUB_ID, tipo: 'social' });

      expect(result.mesesDeuda).toBe(4);
      expect(result.periodos).toEqual(['2026-03', '2026-04', '2026-05', '2026-06']);
      expect(result.totalDeuda).toBe(60000);
    });

    it('descuenta pagos puntuales dentro del rango de deuda', async () => {
      mockUltimaCuota('2025-12');
      mockCuotasPagadas(['2026-02', '2026-04']);

      const result = await calcularDeuda({ socioId: SOCIO_ID, clubId: CLUB_ID, tipo: 'social' });

      expect(result.periodos).toEqual(['2026-01', '2026-03', '2026-05', '2026-06']);
      expect(result.mesesDeuda).toBe(4);
      expect(result.totalDeuda).toBe(60000);
    });

    it('sin cuotas → fallback a fechaDeAsociado', async () => {
      mockUltimaCuota(null);
      mockSocio('2026-04-01');

      const result = await calcularDeuda({ socioId: SOCIO_ID, clubId: CLUB_ID, tipo: 'social' });

      expect(result.periodos).toEqual(['2026-04', '2026-05', '2026-06']);
      expect(result.mesesDeuda).toBe(3);
      expect(result.totalDeuda).toBe(45000);
    });

    it('sin cuotas ni fechaDeAsociado → advertencia, deuda 0', async () => {
      mockUltimaCuota(null);
      mockSocio(null);

      const result = await calcularDeuda({ socioId: SOCIO_ID, clubId: CLUB_ID, tipo: 'social' });

      expect(result.mesesDeuda).toBe(0);
      expect(result.totalDeuda).toBeNull();
      expect(result.advertencia).toBeDefined();
    });

    it('totalDeuda es null cuando no hay precio configurado', async () => {
      mockUltimaCuota('2026-02');
      Precios.findOne = vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
      });

      const result = await calcularDeuda({ socioId: SOCIO_ID, clubId: CLUB_ID, tipo: 'social' });

      expect(result.mesesDeuda).toBe(4);
      expect(result.precioUnitario).toBeNull();
      expect(result.totalDeuda).toBeNull();
    });
  });

  describe('cuota escuelita', () => {
    it('socio no es alumno → retorna null', async () => {
      mockUltimaCuota(null);
      mockAlumno(undefined); // undefined = no existe registro Escuelita

      const result = await calcularDeuda({ socioId: SOCIO_ID, clubId: CLUB_ID, tipo: 'escuelita' });

      expect(result).toBeNull();
    });

    it('alumno sin cuotas → fallback a fechaInscripcion', async () => {
      mockUltimaCuota(null);
      mockAlumno('2026-04-01');

      const result = await calcularDeuda({ socioId: SOCIO_ID, clubId: CLUB_ID, tipo: 'escuelita' });

      expect(result.periodos).toEqual(['2026-04', '2026-05', '2026-06']);
      expect(result.mesesDeuda).toBe(3);
    });

    it('alumno al día → deuda 0', async () => {
      mockUltimaCuota('2026-06');

      const result = await calcularDeuda({ socioId: SOCIO_ID, clubId: CLUB_ID, tipo: 'escuelita' });

      expect(result.mesesDeuda).toBe(0);
      expect(result.totalDeuda).toBe(0);
    });

    it('alumno sin fecha de inscripción ni cuotas → advertencia', async () => {
      mockUltimaCuota(null);
      mockAlumno(null); // existe registro pero sin fecha

      const result = await calcularDeuda({ socioId: SOCIO_ID, clubId: CLUB_ID, tipo: 'escuelita' });

      expect(result.mesesDeuda).toBe(0);
      expect(result.advertencia).toBeDefined();
    });
  });
});
