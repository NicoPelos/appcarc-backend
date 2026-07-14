import { describe, it, expect } from 'vitest';
import { resetDemoClub, DEMO_CLUB_ID, DEMO_CREDENTIALS } from '../../demoSeed.service.js';
import { calcularDeuda } from '../../../resources/cuotas/services/calcularDeuda.service.js';
import Club from '../../../resources/clubs/models/Club.js';
import Socio from '../../../resources/socios/models/Socio.js';
import User from '../../../resources/usuarios/models/User.js';

describe('resetDemoClub (integración)', () => {
  it('crea el club demo con datos consistentes y deuda calculable', async () => {
    await resetDemoClub();

    const club = await Club.findOne({ slug: DEMO_CLUB_ID }).lean();
    expect(club).toBeTruthy();
    expect(club.active).toBe(true);

    const socios = await Socio.find({ clubId: DEMO_CLUB_ID }).lean();
    expect(socios.length).toBe(12);

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

  it('es idempotente: correrlo dos veces no duplica datos ni rompe', async () => {
    await resetDemoClub();
    await resetDemoClub();

    const socios = await Socio.find({ clubId: DEMO_CLUB_ID }).lean();
    expect(socios.length).toBe(12);

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
