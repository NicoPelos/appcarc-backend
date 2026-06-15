import { describe, expect, it } from 'vitest';
import {
  buildDomicilioCompleto,
  prepareSocioCreateData,
  prepareSocioUpdateData,
} from '../../services/socioData.service.js';

describe('buildDomicilioCompleto', () => {
  it('returns domicilioCompleto when present', () => {
    expect(buildDomicilioCompleto({ domicilioCompleto: 'Av. Siempreviva 742' }))
      .toBe('Av. Siempreviva 742');
  });

  it('returns calle + altura when both present', () => {
    expect(buildDomicilioCompleto({ calle: 'Mitre', altura: '123' })).toBe('Mitre 123');
  });

  it('returns only calle when altura is missing', () => {
    expect(buildDomicilioCompleto({ calle: 'Mitre' })).toBe('Mitre');
  });

  it('returns direccionActual as fallback', () => {
    expect(buildDomicilioCompleto({ direccionActual: 'Belgrano 500' })).toBe('Belgrano 500');
  });

  it('returns undefined when no address fields are present', () => {
    expect(buildDomicilioCompleto({})).toBeUndefined();
  });

  it('returns undefined when called with no argument', () => {
    expect(buildDomicilioCompleto()).toBeUndefined();
  });

  it('prefers domicilioCompleto over calle', () => {
    expect(buildDomicilioCompleto({ domicilioCompleto: 'Principal', calle: 'Otra' }))
      .toBe('Principal');
  });
});

describe('prepareSocioCreateData', () => {
  const USER = { id: 'u1', clubId: 'club1' };

  it('sets clubId from user when not in body', () => {
    const result = prepareSocioCreateData({ nombre: 'Juan' }, USER);
    expect(result.clubId).toBe('club1');
  });

  it('prefers clubId from body over user', () => {
    const result = prepareSocioCreateData({ nombre: 'Juan', clubId: 'club2' }, USER);
    expect(result.clubId).toBe('club2');
  });

  it('sets createdBy and updatedBy from user.id', () => {
    const result = prepareSocioCreateData({}, USER);
    expect(result.createdBy).toBe('u1');
    expect(result.updatedBy).toBe('u1');
  });

  it('merges domicilioCompleto from calle + altura', () => {
    const result = prepareSocioCreateData({ calle: 'San Martín', altura: '200' }, USER);
    expect(result.domicilioCompleto).toBe('San Martín 200');
  });
});

describe('prepareSocioUpdateData', () => {
  const USER = { id: 'u1', clubId: 'club1' };

  it('sets updatedBy from user.id', () => {
    const result = prepareSocioUpdateData({ nombre: 'Ana' }, USER);
    expect(result.updatedBy).toBe('u1');
  });

  it('does not set createdBy', () => {
    const result = prepareSocioUpdateData({}, USER);
    expect(result.createdBy).toBeUndefined();
  });

  it('merges domicilioCompleto from direccionActual', () => {
    const result = prepareSocioUpdateData({ direccionActual: 'Av. Central 1' }, USER);
    expect(result.domicilioCompleto).toBe('Av. Central 1');
  });
});
