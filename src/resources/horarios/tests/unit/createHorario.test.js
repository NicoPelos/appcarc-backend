import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHorarioHandler } from '../../handlers/createHorario.handler.js';
import Horarios from '../../models/Horarios.js';

const mockRes = () => {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};

const USER = { id: 'user1', email: 'admin@carc.test', clubId: 'club1' };

const BASE_BODY = {
  fecha: '2026-06-01',
  nombre: 'Vladimir',
  horaEntrada: '2026-06-01T19:30:00',
  horaSalida: '2026-06-01T22:00:00',
  totalHoras: 2.5,
  tipoTarea: 'Palestrero',
};

describe('createHorarioHandler', () => {
  beforeEach(() => {
    vi.spyOn(Horarios.prototype, 'save').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return 400 when fecha is missing', async () => {
    const res = mockRes();
    await createHorarioHandler({ body: { ...BASE_BODY, fecha: undefined }, user: USER }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'La fecha es obligatoria' });
  });

  it('should return 400 when fecha is invalid', async () => {
    const res = mockRes();
    await createHorarioHandler({ body: { ...BASE_BODY, fecha: 'no-es-fecha' }, user: USER }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'La fecha es inválida' });
  });

  it('should return 400 when nombre is missing', async () => {
    const res = mockRes();
    await createHorarioHandler({ body: { ...BASE_BODY, nombre: '' }, user: USER }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'El nombre es obligatorio' });
  });

  it('should return 400 when horaEntrada is invalid', async () => {
    const res = mockRes();
    await createHorarioHandler({ body: { ...BASE_BODY, horaEntrada: 'no-es-fecha' }, user: USER }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'La hora de entrada es inválida' });
  });

  it('should return 400 when horaSalida is invalid', async () => {
    const res = mockRes();
    await createHorarioHandler({ body: { ...BASE_BODY, horaSalida: 'no-es-fecha' }, user: USER }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'La hora de salida es inválida' });
  });

  it('should create horario and return 201', async () => {
    const res = mockRes();
    await createHorarioHandler({ body: BASE_BODY, user: USER }, res);

    expect(Horarios.prototype.save).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(201);
    const created = res.json.mock.calls[0][0];
    expect(created).toMatchObject({ nombre: 'Vladimir', tipoTarea: 'Palestrero', totalHoras: 2.5 });
  });

  it('should return 500 on unexpected error', async () => {
    Horarios.prototype.save.mockRejectedValueOnce(new Error('DB down'));
    const res = mockRes();
    await createHorarioHandler({ body: BASE_BODY, user: USER }, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
