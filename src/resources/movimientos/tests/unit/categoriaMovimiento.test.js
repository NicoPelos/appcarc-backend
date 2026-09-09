import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getEtiquetaMap, categoriaIngresoPorEtiqueta, categoriaIngresoManual, categoriaEgresoManual,
  buildIngresosEgresosPorCategoria,
} from '../../services/categoriaMovimiento.service.js';
import Etiqueta from '../../../etiquetas/models/Etiqueta.js';
import Cobro from '../../../cobros/models/Cobro.js';
import Movimiento from '../../models/Movimiento.js';

const CLUB_ID = 'club1';

afterEach(() => vi.restoreAllMocks());

describe('getEtiquetaMap', () => {
  it('arma un mapa {etiquetaId: {nombre, uso_sistema}}', async () => {
    vi.spyOn(Etiqueta, 'find').mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        { _id: 'etq1', nombre: 'Cuota Social', uso_sistema: 'cuota_social' },
        { _id: 'etq2', nombre: 'Cuota Escuelita x 1', uso_sistema: null },
      ]),
    });

    const map = await getEtiquetaMap(CLUB_ID);

    expect(map).toEqual({
      etq1: { nombre: 'Cuota Social', uso_sistema: 'cuota_social' },
      etq2: { nombre: 'Cuota Escuelita x 1', uso_sistema: null },
    });
  });
});

describe('categoriaIngresoPorEtiqueta', () => {
  it('categoriza como Escuela Niños una etiqueta de escuelita sin uso_sistema seteado (ej. X1), por el nombre', () => {
    expect(categoriaIngresoPorEtiqueta({ nombre: 'Cuota Escuelita x 1', uso_sistema: null })).toBe('Escuela Niños');
  });

  it('categoriza por uso_sistema cuando está presente', () => {
    expect(categoriaIngresoPorEtiqueta({ nombre: 'Cuota Escuelita', uso_sistema: 'cuota_escuelita' })).toBe('Escuela Niños');
    expect(categoriaIngresoPorEtiqueta({ nombre: 'Cuota Social', uso_sistema: 'cuota_social' })).toBe('Cuota Social');
    expect(categoriaIngresoPorEtiqueta({ nombre: 'Muro Libre Diario', uso_sistema: 'muro_libre_diario_socio' })).toBe('Muro Libre');
  });

  it('BUG histórico: la etiqueta viene con uso_sistema (snake_case, igual que el modelo), no usoSistema — antes quedaba siempre en Otros', () => {
    expect(categoriaIngresoPorEtiqueta({ nombre: 'Cuota Social', uso_sistema: 'cuota_social' })).not.toBe('Otros');
    expect(categoriaIngresoPorEtiqueta({ nombre: 'Muro Libre Diario', uso_sistema: 'muro_libre_diario_socio' })).not.toBe('Otros');
  });

  it('cae en Otros si no matchea nada', () => {
    expect(categoriaIngresoPorEtiqueta({ nombre: 'Algo raro', uso_sistema: null })).toBe('Otros');
  });
});

describe('categoriaIngresoManual / categoriaEgresoManual', () => {
  it('usa categoria directo si está seteada', () => {
    expect(categoriaIngresoManual({ categoria: 'Viajes', concept: 'lo que sea' })).toBe('Viajes');
    expect(categoriaEgresoManual({ categoria: 'Costos Fijos', concept: 'lo que sea' })).toBe('Costos Fijos');
  });

  it('sin categoria, cae al fallback por palabras clave del concept', () => {
    expect(categoriaIngresoManual({ categoria: null, concept: 'Viaje a la sierra' })).toBe('Viajes');
    expect(categoriaEgresoManual({ categoria: null, concept: 'Alquiler del local' })).toBe('Costos Fijos');
  });
});

describe('buildIngresosEgresosPorCategoria', () => {
  it('suma ingresos de cobro por etiqueta, muro libre y manuales; egresos por categoría manual', async () => {
    vi.spyOn(Movimiento, 'find').mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([
        { type: 'Ingreso', sourceType: 'cobro', sourceId: 'cobro1', amount: 6000 },
        { type: 'Ingreso', sourceType: 'muro_libre', amount: 4000 },
        { type: 'Ingreso', sourceType: 'manual', categoria: 'Viajes', concept: '', amount: 20000 },
        { type: 'Egreso', sourceType: 'manual', categoria: 'Costos Fijos', concept: '', amount: 15000 },
      ]),
    });
    vi.spyOn(Cobro, 'find').mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([
        { _id: 'cobro1', items: [{ etiquetaId: 'etqSocial', amount: 6000 }] },
      ]),
    });

    const etiquetaMap = { etqSocial: { nombre: 'Cuota Social', uso_sistema: 'cuota_social' } };
    const { ingresos, egresos } = await buildIngresosEgresosPorCategoria({
      clubId: CLUB_ID, desde: new Date('2026-01-01'), etiquetaMap,
    });

    expect(Object.fromEntries(ingresos)).toMatchObject({ 'Cuota Social': 6000, 'Muro Libre': 4000, Viajes: 20000 });
    expect(Object.fromEntries(egresos)).toMatchObject({ 'Costos Fijos': 15000 });
  });

  it('acepta hasta como cota superior del rango, además de desde', async () => {
    const findMock = vi.spyOn(Movimiento, 'find').mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    vi.spyOn(Cobro, 'find').mockReturnValue({ select: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue([]) });

    const desde = new Date('2026-01-01');
    const hasta = new Date('2026-01-31');
    await buildIngresosEgresosPorCategoria({ clubId: CLUB_ID, desde, hasta, etiquetaMap: {} });

    expect(findMock).toHaveBeenCalledWith(expect.objectContaining({
      date: { $gte: desde, $lte: hasta },
    }));
  });
});
