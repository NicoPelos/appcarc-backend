import { describe, it, expect } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../../../../index.js';
import User from '../../models/User.js';
import { CLUB_ID } from '../../../../testUtils/integrationHelpers.js';

const createUserConPassword = async (password, overrides = {}) => {
  const hashed = await bcrypt.hash(password, 10);
  return User.create({
    email: overrides.email || 'secretaria@carc.local',
    password: hashed,
    roles: overrides.roles || ['secretaria'],
    clubId: overrides.clubId || CLUB_ID,
    active: overrides.active ?? true,
    ...overrides,
  });
};

describe('POST /api/auth/login (integración)', () => {
  it('devuelve token y datos de usuario con credenciales correctas', async () => {
    await createUserConPassword('unaClaveSegura123');

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'secretaria@carc.local', password: 'unaClaveSegura123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe('secretaria@carc.local');
  });

  it('rechaza contraseña incorrecta (400)', async () => {
    await createUserConPassword('unaClaveSegura123');

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'secretaria@carc.local', password: 'incorrecta' });

    expect(res.status).toBe(400);
  });

  it('rechaza un email inexistente (400)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'noexiste@carc.local', password: 'cualquiera' });

    expect(res.status).toBe(400);
  });

  it('rechaza un usuario desactivado (403)', async () => {
    await createUserConPassword('unaClaveSegura123', { active: false });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'secretaria@carc.local', password: 'unaClaveSegura123' });

    expect(res.status).toBe(403);
  });
});

describe('Invalidación de sesión por cambio de contraseña (integración)', () => {
  it('rechaza un token emitido antes de un cambio de contraseña posterior', async () => {
    const user = await createUserConPassword('claveOriginal123', { roles: ['superadmin'] });

    const tokenViejo = jwt.sign(
      { id: user._id, roles: user.roles, clubId: user.clubId },
      process.env.JWT_SECRET,
      { expiresIn: '1h' },
    );

    // Simula un cambio de contraseña posterior a la emisión del token
    await new Promise((resolve) => setTimeout(resolve, 1100));
    user.passwordChangedAt = new Date();
    await user.save();

    const res = await request(app)
      .get('/api/socios')
      .set('Authorization', `Bearer ${tokenViejo}`);

    expect(res.status).toBe(401);
  });

  it('acepta un token emitido después del cambio de contraseña', async () => {
    const user = await createUserConPassword('claveOriginal123', { roles: ['superadmin'] });
    user.passwordChangedAt = new Date();
    await user.save();

    await new Promise((resolve) => setTimeout(resolve, 1100));
    const tokenNuevo = jwt.sign(
      { id: user._id, roles: user.roles, clubId: user.clubId },
      process.env.JWT_SECRET,
      { expiresIn: '1h' },
    );

    const res = await request(app)
      .get('/api/socios')
      .set('Authorization', `Bearer ${tokenNuevo}`);

    expect(res.status).toBe(200);
  });
});

describe('POST /api/auth/logout (integración)', () => {
  it('invalida el token: no se puede usar después de hacer logout', async () => {
    const user = await createUserConPassword('claveOriginal123', { roles: ['superadmin'] });
    const token = jwt.sign(
      { id: user._id, roles: user.roles, clubId: user.clubId },
      process.env.JWT_SECRET,
      { expiresIn: '1h' },
    );

    const logoutRes = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
    expect(logoutRes.status).toBe(200);

    const res = await request(app).get('/api/socios').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});
