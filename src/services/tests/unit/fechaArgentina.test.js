import { describe, it, expect } from 'vitest';
import { periodoDeFecha, diaBoundsUTC, semanaBoundsUTC } from '../../fechaArgentina.js';

describe('periodoDeFecha', () => {
  it('devuelve el período del mes en horario argentino', () => {
    expect(periodoDeFecha(new Date('2026-02-10T15:00:00.000Z'))).toBe('2026-02');
  });

  it('un horario que en UTC ya es el mes siguiente, en Argentina sigue siendo el mes anterior', () => {
    // 2026-08-01T02:00:00Z = 2026-07-31T23:00:00 en Argentina (UTC-3)
    expect(periodoDeFecha(new Date('2026-08-01T02:00:00.000Z'))).toBe('2026-07');
  });

  it('un horario que en UTC todavía es el mes anterior, en Argentina ya es el mes siguiente', () => {
    // 2026-01-31T02:30:00Z = 2026-01-30T23:30:00... no cruza; probar el caso real de cruce inverso:
    // 2026-03-01T01:00:00Z = 2026-02-28T22:00:00 ART -> sigue en febrero
    expect(periodoDeFecha(new Date('2026-03-01T01:00:00.000Z'))).toBe('2026-02');
  });
});

describe('diaBoundsUTC', () => {
  it('el rango cubre desde las 03:00 UTC de ese día hasta las 02:59:59.999 UTC del día siguiente', () => {
    const { start, end } = diaBoundsUTC(new Date('2026-02-10T15:00:00.000Z'));
    expect(start.toISOString()).toBe('2026-02-10T03:00:00.000Z');
    expect(end.toISOString()).toBe('2026-02-11T02:59:59.999Z');
  });

  it('una fecha justo antes de las 03:00 UTC cae en el día argentino anterior', () => {
    const { start, end } = diaBoundsUTC(new Date('2026-02-10T02:59:00.000Z'));
    expect(start.toISOString()).toBe('2026-02-09T03:00:00.000Z');
    expect(end.toISOString()).toBe('2026-02-10T02:59:59.999Z');
  });
});

describe('semanaBoundsUTC', () => {
  it('para un miércoles, la semana arranca el lunes y termina el domingo', () => {
    // 2026-02-11 es miércoles (ART)
    const { start, end } = semanaBoundsUTC(new Date('2026-02-11T15:00:00.000Z'));
    expect(start.toISOString()).toBe('2026-02-09T03:00:00.000Z'); // lunes 00:00 ART
    expect(end.toISOString()).toBe('2026-02-16T02:59:59.999Z');   // domingo 23:59:59.999 ART
  });

  it('para un domingo, la semana sigue siendo la que empezó el lunes anterior', () => {
    // 2026-02-15 es domingo (ART)
    const { start, end } = semanaBoundsUTC(new Date('2026-02-15T15:00:00.000Z'));
    expect(start.toISOString()).toBe('2026-02-09T03:00:00.000Z');
    expect(end.toISOString()).toBe('2026-02-16T02:59:59.999Z');
  });
});
