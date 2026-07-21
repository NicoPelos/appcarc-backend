import { describe, it, expect } from 'vitest';
import { resetDemoClub, DEMO_CLUB_ID, DEMO_CREDENTIALS } from '../../demoSeed.service.js';
import { calcularDeuda } from '../../../resources/cuotas/services/calcularDeuda.service.js';
import { getDeudaStaffHandler } from '../../../resources/horarios/handlers/getDeudaStaff.handler.js';
import Club from '../../../resources/clubs/models/Club.js';
import Socio from '../../../resources/socios/models/Socio.js';
import User from '../../../resources/usuarios/models/User.js';
import Escuelita from '../../../resources/escuelita/models/Escuelita.js';
import Asistencia from '../../../resources/asistencias/models/Asistencia.js';
import Plan from '../../../resources/planes/models/Plan.js';

const mockRes = () => {
  const res = {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};

describe('resetDemoClub (integración)', () => {
  it('crea el club demo con datos consistentes y deuda calculable', async () => {
    await resetDemoClub();

    const club = await Club.findOne({ slug: DEMO_CLUB_ID }).lean();
    expect(club).toBeTruthy();
    expect(club.active).toBe(true);

    const socios = await Socio.find({ clubId: DEMO_CLUB_ID }).lean();
    expect(socios.length).toBe(14);

    const users = await User.find({ clubId: DEMO_CLUB_ID }).lean();
    expect(users.map((u) => u.email).sort()).toEqual(
      [DEMO_CREDENTIALS.socio.email, DEMO_CREDENTIALS.admin.email].sort(),
    );

    const alDia = socios.find((s) => s.apellido === 'Al Día');
    const deudaAlDia = await calcularDeuda({ socioId: alDia._id, clubId: DEMO_CLUB_ID });
    expect(deudaAlDia.reduce((acc, d) => acc + d.mesesDeuda, 0)).toBe(0);

    const deudaLarga = socios.find((s) => s.apellido === 'Con Deuda Larga');
    const deudaDeudaLarga = await calcularDeuda({ socioId: deudaLarga._id, clubId: DEMO_CLUB_ID });
    expect(deudaDeudaLarga.reduce((acc, d) => acc + d.mesesDeuda, 0)).toBe(4);

    const baja = socios.find((s) => s.apellido === 'De Baja');
    expect(baja.estado).toBe('Baja');
    const deudaBaja = await calcularDeuda({ socioId: baja._id, clubId: DEMO_CLUB_ID });
    expect(deudaBaja).toEqual([]);
  });

  it('arma alumnos de escuelita con clases asistidas, un plan pausado y horas de staff', async () => {
    await resetDemoClub();

    const facundo = await Socio.findOne({ clubId: DEMO_CLUB_ID, apellido: 'Escuelita Principiantes' }).lean();
    const clasesFacundo = await Asistencia.find({ clubId: DEMO_CLUB_ID, socioId: facundo._id, tipo: 'escuelita' }).lean();
    // Principiantes X1 → 1 clase/semana × 4 semanas de historial
    expect(clasesFacundo.length).toBe(4);

    const gimena = await Socio.findOne({ clubId: DEMO_CLUB_ID, apellido: 'Escuelita Avanzados' }).lean();
    const clasesGimena = await Asistencia.find({ clubId: DEMO_CLUB_ID, socioId: gimena._id, tipo: 'escuelita' }).lean();
    // Avanzados X2 → 2 clases/semana × 4 semanas de historial
    expect(clasesGimena.length).toBe(8);

    const karina = await Socio.findOne({ clubId: DEMO_CLUB_ID, apellido: 'Escuelita Pausada' }).lean();
    const alumnoKarina = await Escuelita.findOne({ clubId: DEMO_CLUB_ID, socioId: karina._id }).lean();
    expect(alumnoKarina.estado).toBe('pausado');
    const clasesKarina = await Asistencia.find({ clubId: DEMO_CLUB_ID, socioId: karina._id, tipo: 'escuelita' }).lean();
    expect(clasesKarina.length).toBe(0);

    const planes = await Plan.find({ clubId: DEMO_CLUB_ID, tipo: 'escuelita' }).lean();
    expect(planes.every((p) => p.descripcion?.length > 0)).toBe(true);

    const req = { user: { clubId: DEMO_CLUB_ID }, query: { periodo: new Date().toISOString().slice(0, 7) } };
    const res = mockRes();
    await getDeudaStaffHandler(req, res);
    expect(res.statusCode).toBe(200);
    const pedro = res.body.find((d) => d.nombre === 'Pedro Profesor');
    expect(pedro).toBeTruthy();
    expect(pedro.totalDeuda).toBeGreaterThan(0);
  });

  it('es idempotente: correrlo dos veces no duplica datos ni rompe', async () => {
    await resetDemoClub();
    await resetDemoClub();

    const socios = await Socio.find({ clubId: DEMO_CLUB_ID }).lean();
    expect(socios.length).toBe(14);

    const users = await User.find({ clubId: DEMO_CLUB_ID }).lean();
    expect(users.length).toBe(2);
  });

  it('no toca datos de otros clubes', async () => {
    await Socio.create({
      nombre: 'Real', apellido: 'CARC', dni: '11111111', clubId: 'CARC', active: true,
    });

    await resetDemoClub();

    const socioReal = await Socio.findOne({ clubId: 'CARC', dni: '11111111' });
    expect(socioReal).toBeTruthy();
  });
});
