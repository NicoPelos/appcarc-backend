import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

import Club from '../resources/clubs/models/Club.js';
import Rol from '../resources/roles/models/Rol.js';
import User from '../resources/usuarios/models/User.js';
import Socio from '../resources/socios/models/Socio.js';
import Etiqueta from '../resources/etiquetas/models/Etiqueta.js';
import Precios from '../resources/cuotas/models/Precios.js';
import Plan from '../resources/planes/models/Plan.js';
import Suscripcion from '../resources/suscripciones/models/Suscripcion.js';
import Cuota from '../resources/cuotas/models/Cuota.js';
import Cobro from '../resources/cobros/models/Cobro.js';
import Movimiento from '../resources/movimientos/models/Movimiento.js';
import Escuelita from '../resources/escuelita/models/Escuelita.js';
import Asistencia from '../resources/asistencias/models/Asistencia.js';
import Novedad from '../resources/novedades/models/Novedad.js';
import { PERMISOS, TODOS_LOS_PERMISOS } from '../constants/permisos.js';

// Club exclusivo para el entorno demo (autoservicio público, ver
// appcarc-backend#9). TODO lo que este archivo borra/crea está scopeado a
// este clubId — nunca debe tocar datos reales.
export const DEMO_CLUB_ID = 'demo';
const BY = 'seed:demo';

export const DEMO_CREDENTIALS = {
  socio: { email: 'socio@demo.appclub.ar', password: 'DemoSocio2026!' },
  admin: { email: 'admin@demo.appclub.ar', password: 'DemoAdmin2026!' },
};

const P = PERMISOS;

const currentPeriodo = (offsetMonths = 0) => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + offsetMonths);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

// Crea un Cobro + Movimiento + Cuota consistentes entre sí, igual que
// registrarCobro.service.js pero simplificado a un solo ítem — para no
// depender de la forma exacta (req/user) que espera ese servicio.
async function registrarPagoDemo({ socio, suscripcion, etiquetaId, periodo, monto, session }) {
  const movimiento = await Movimiento.create([{
    clubId: DEMO_CLUB_ID,
    userId: new mongoose.Types.ObjectId(),
    responsable: 'Demo Admin',
    socioId: socio._id,
    socioNombre: `${socio.nombre} ${socio.apellido}`,
    type: 'Ingreso',
    amount: monto,
    concept: 'Cobro de cuotas',
    paymentMethod: 'Efectivo',
    description: `Cobro con 1 cuota`,
    date: new Date(),
    sourceType: 'cobro',
    sourceModel: 'Cobro',
    createdBy: BY,
    updatedBy: BY,
  }], { session });

  const cobro = await Cobro.create([{
    clubId: DEMO_CLUB_ID,
    responsable: 'Demo Admin',
    paymentMethod: 'Efectivo',
    totalAmount: monto,
    date: new Date(),
    items: [{
      socioId: socio._id,
      suscripcionId: suscripcion._id,
      etiquetaId,
      periodo,
      amount: monto,
    }],
    movimientoId: movimiento[0]._id,
    createdBy: BY,
    updatedBy: BY,
  }], { session });

  movimiento[0].sourceId = cobro[0]._id;
  await movimiento[0].save({ session });

  await Cuota.create([{
    clubId: DEMO_CLUB_ID,
    socioId: socio._id,
    suscripcionId: suscripcion._id,
    etiquetaId,
    periodo,
    estado: 'pagada',
    montoEsperadoSnapshot: monto,
    montoPagadoSnapshot: monto,
    cobroId: cobro[0]._id,
    movimientoId: movimiento[0]._id,
    fechaPago: new Date(),
    paymentMethod: 'Efectivo',
    createdBy: BY,
    updatedBy: BY,
  }], { session });
}

async function borrarDatosDemo() {
  await Promise.all([
    Cuota.deleteMany({ clubId: DEMO_CLUB_ID }),
    Cobro.deleteMany({ clubId: DEMO_CLUB_ID }),
    Movimiento.deleteMany({ clubId: DEMO_CLUB_ID }),
    Suscripcion.deleteMany({ clubId: DEMO_CLUB_ID }),
    Escuelita.deleteMany({ clubId: DEMO_CLUB_ID }),
    Asistencia.deleteMany({ clubId: DEMO_CLUB_ID }),
    Novedad.deleteMany({ clubId: DEMO_CLUB_ID }),
    Plan.deleteMany({ clubId: DEMO_CLUB_ID }),
    Precios.deleteMany({ clubId: DEMO_CLUB_ID }),
    Etiqueta.deleteMany({ clubId: DEMO_CLUB_ID }),
    User.deleteMany({ clubId: DEMO_CLUB_ID }),
    Socio.deleteMany({ clubId: DEMO_CLUB_ID }),
    Rol.deleteMany({ clubId: DEMO_CLUB_ID }),
  ]);
}

const SOCIOS_DEMO = [
  { dni: '99000001', socioNumber: 'DEMO-001', nombre: 'Ana', apellido: 'Al Día', estado: 'Activo', deudaMeses: 0 },
  { dni: '99000002', socioNumber: 'DEMO-002', nombre: 'Bruno', apellido: 'Con Deuda Corta', estado: 'Activo', deudaMeses: 2 },
  { dni: '99000003', socioNumber: 'DEMO-003', nombre: 'Carla', apellido: 'Con Deuda Larga', estado: 'Activo', deudaMeses: 4 },
  { dni: '99000004', socioNumber: 'DEMO-004', nombre: 'Diego', apellido: 'Adherente', estado: 'Adherente', deudaMeses: 0 },
  { dni: '99000005', socioNumber: 'DEMO-005', nombre: 'Elena', apellido: 'De Baja', estado: 'Baja', deudaMeses: 0 },
  { dni: '99000006', socioNumber: 'DEMO-006', nombre: 'Facundo', apellido: 'Escuelita Al Día', estado: 'Activo', deudaMeses: 0, escuelita: true },
  { dni: '99000007', socioNumber: 'DEMO-007', nombre: 'Gimena', apellido: 'Escuelita Con Deuda', estado: 'Activo', deudaMeses: 0, escuelita: true, escuelitaDeuda: true },
  { dni: '99000008', socioNumber: 'DEMO-008', nombre: 'Hugo', apellido: 'Muro Libre', estado: 'Activo', deudaMeses: 0, muroLibre: true },
  { dni: '99000009', socioNumber: 'DEMO-009', nombre: 'Irene', apellido: 'Común', estado: 'Activo', deudaMeses: 1 },
  { dni: '99000010', socioNumber: 'DEMO-010', nombre: 'Demo', apellido: 'Socio', estado: 'Activo', deudaMeses: 1, esLoginSocio: true },
  { dni: '99000011', socioNumber: 'DEMO-011', nombre: 'Demo', apellido: 'Admin', estado: 'Activo', deudaMeses: 0, esLoginAdmin: true },
  { dni: '99000012', socioNumber: 'DEMO-012', nombre: 'Julia', apellido: 'Adherente Con Deuda', estado: 'Adherente', deudaMeses: 3 },
];

const ROLES_DEMO = [
  { nombre: 'admin', permisos: TODOS_LOS_PERMISOS },
  {
    nombre: 'secretaria',
    permisos: [
      P.SOCIOS_READ, P.SOCIOS_WRITE, P.SOCIOS_RESTORE,
      P.COBROS_READ, P.COBROS_WRITE, P.COBROS_DELETE,
      P.MOVIMIENTOS_READ, P.MOVIMIENTOS_WRITE, P.MOVIMIENTOS_DELETE,
      P.ESCUELITA_READ, P.ESCUELITA_WRITE, P.ESCUELITA_DELETE, P.ESCUELITA_CHECKIN,
      P.MURO_LIBRE_READ, P.MURO_LIBRE_WRITE, P.MURO_LIBRE_DELETE, P.MURO_LIBRE_CHECKIN,
      P.HORARIOS_READ, P.HORARIOS_WRITE, P.HORARIOS_DELETE, P.HORARIOS_DEUDA,
      P.ETIQUETAS_READ, P.ETIQUETAS_WRITE, P.ETIQUETAS_DELETE,
      P.PRECIOS_READ,
      P.PLANES_READ, P.PLANES_WRITE, P.PLANES_DELETE,
      P.SUSCRIPCIONES_READ, P.SUSCRIPCIONES_WRITE, P.SUSCRIPCIONES_CLOSE, P.SUSCRIPCIONES_DELETE,
      P.ASISTENCIAS_READ, P.ASISTENCIAS_WRITE,
      P.NOVEDADES_WRITE,
      P.AUDIT_READ,
    ],
  },
  { nombre: 'socio', permisos: [P.MURO_LIBRE_READ, P.MURO_LIBRE_CHECKIN, P.ASISTENCIAS_READ] },
];

export async function resetDemoClub() {
  await Club.findOneAndUpdate(
    { slug: DEMO_CLUB_ID },
    {
      $set: {
        nombre: 'Club Demo (appClub)',
        slug: DEMO_CLUB_ID,
        plan: 'premium',
        modulos: { escuelita: true, muroLibre: true, exportSheets: false, novedades: false },
        active: true,
      },
    },
    { upsert: true },
  );

  await borrarDatosDemo();

  await Rol.insertMany(ROLES_DEMO.map((r) => ({ clubId: DEMO_CLUB_ID, nombre: r.nombre, permisos: r.permisos, active: true })));

  const [etiquetaSocial, etiquetaEscuelita, etiquetaMuroDiario] = await Etiqueta.insertMany([
    { clubId: DEMO_CLUB_ID, nombre: 'Cuota Social', unidad: 'mes', uso_sistema: 'cuota_social', active: true, createdBy: BY, updatedBy: BY },
    { clubId: DEMO_CLUB_ID, nombre: 'Cuota Escuelita', unidad: 'mes', uso_sistema: null, active: true, createdBy: BY, updatedBy: BY },
    { clubId: DEMO_CLUB_ID, nombre: 'Muro Libre Diario', unidad: 'dia', uso_sistema: 'muro_libre_diario_socio', active: true, createdBy: BY, updatedBy: BY },
  ]);

  const vigenteDesde = new Date();
  vigenteDesde.setUTCMonth(vigenteDesde.getUTCMonth() - 6);
  await Precios.insertMany([
    { clubId: DEMO_CLUB_ID, etiquetaId: etiquetaSocial._id, nombre: 'Cuota Social', unidad: 'mes', monto: 15000, vigenteDesde, active: true, createdBy: BY, updatedBy: BY },
    { clubId: DEMO_CLUB_ID, etiquetaId: etiquetaEscuelita._id, nombre: 'Cuota Escuelita', unidad: 'mes', monto: 20000, vigenteDesde, active: true, createdBy: BY, updatedBy: BY },
    { clubId: DEMO_CLUB_ID, etiquetaId: etiquetaMuroDiario._id, nombre: 'Muro Libre Diario', unidad: 'dia', monto: 5000, vigenteDesde, active: true, createdBy: BY, updatedBy: BY },
  ]);

  const [planSocial, planEscuelita] = await Plan.insertMany([
    { clubId: DEMO_CLUB_ID, nombre: 'Socio Activo', tipo: 'social', modalidad: 'mensual', etiquetaId: etiquetaSocial._id, atributos: {}, active: true, createdBy: BY, updatedBy: BY },
    { clubId: DEMO_CLUB_ID, nombre: 'Escuelita X2', tipo: 'escuelita', modalidad: 'mensual', etiquetaId: etiquetaEscuelita._id, atributos: { frecuenciaSemanal: 2 }, active: true, createdBy: BY, updatedBy: BY },
  ]);

  const fechaDesde = currentPeriodo(-6);
  // El período actual también cuenta como "adeudable" — desde fechaDesde
  // (hace 6 meses) hasta hoy inclusive son 7 períodos en total.
  const TOTAL_PERIODOS = 7;
  const socioIdByLogin = {};

  for (const def of SOCIOS_DEMO) {
    const socio = await Socio.create({
      socioNumber: def.socioNumber,
      apellido: def.apellido,
      nombre: def.nombre,
      dni: def.dni,
      estado: def.estado,
      correoElectronico: def.esLoginSocio ? DEMO_CREDENTIALS.socio.email : def.esLoginAdmin ? DEMO_CREDENTIALS.admin.email : null,
      clubId: DEMO_CLUB_ID,
      active: true,
      createdBy: BY,
      updatedBy: BY,
    });

    if (def.esLoginSocio) socioIdByLogin.socio = socio._id;
    if (def.esLoginAdmin) socioIdByLogin.admin = socio._id;

    if (def.estado === 'Baja') continue; // sin suscripción ni cuotas — coherente con estar de baja

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const suscripcionSocial = (await Suscripcion.create([{
          clubId: DEMO_CLUB_ID,
          socioId: socio._id,
          planId: planSocial._id,
          etiquetaId: etiquetaSocial._id,
          fechaDesde,
          active: true,
          createdBy: BY,
          updatedBy: BY,
        }], { session }))[0];

        const mesesAPagar = TOTAL_PERIODOS - def.deudaMeses;
        for (let i = 0; i < mesesAPagar; i++) {
          await registrarPagoDemo({
            socio,
            suscripcion: suscripcionSocial,
            etiquetaId: etiquetaSocial._id,
            periodo: currentPeriodo(-6 + i),
            monto: 15000,
            session,
          });
        }

        if (def.escuelita) {
          const suscripcionEscuelita = (await Suscripcion.create([{
            clubId: DEMO_CLUB_ID,
            socioId: socio._id,
            planId: planEscuelita._id,
            etiquetaId: etiquetaEscuelita._id,
            fechaDesde,
            active: true,
            createdBy: BY,
            updatedBy: BY,
          }], { session }))[0];

          await Escuelita.create([{
            clubId: DEMO_CLUB_ID,
            socioId: socio._id,
            dni: socio.dni,
            fechaInscripcion: vigenteDesde,
            estado: 'activo',
            planId: planEscuelita._id,
            active: true,
            createdBy: BY,
            updatedBy: BY,
          }], { session });

          const mesesEscuelitaAPagar = def.escuelitaDeuda ? TOTAL_PERIODOS - 3 : TOTAL_PERIODOS;
          for (let i = 0; i < mesesEscuelitaAPagar; i++) {
            await registrarPagoDemo({
              socio,
              suscripcion: suscripcionEscuelita,
              etiquetaId: etiquetaEscuelita._id,
              periodo: currentPeriodo(-6 + i),
              monto: 20000,
              session,
            });
          }
        }

        if (def.muroLibre) {
          await Asistencia.create([{
            clubId: DEMO_CLUB_ID,
            tipo: 'muro_libre',
            socioId: socio._id,
            nombre: socio.nombre,
            apellido: socio.apellido,
            dni: socio.dni,
            esSocio: true,
            fecha: new Date(),
            tipoPase: 'diario',
            estadoPago: 'pagado',
            monto: 5000,
            formaPago: 'Efectivo',
            createdBy: BY,
            updatedBy: BY,
          }], { session });
        }
      });
    } finally {
      session.endSession();
    }
  }

  const passwordHashSocio = await bcrypt.hash(DEMO_CREDENTIALS.socio.password, 10);
  const passwordHashAdmin = await bcrypt.hash(DEMO_CREDENTIALS.admin.password, 10);

  await User.insertMany([
    {
      email: DEMO_CREDENTIALS.socio.email,
      password: passwordHashSocio,
      nombre: 'Demo Socio',
      roles: ['socio'],
      clubId: DEMO_CLUB_ID,
      socioId: String(socioIdByLogin.socio),
      active: true,
    },
    {
      email: DEMO_CREDENTIALS.admin.email,
      password: passwordHashAdmin,
      nombre: 'Demo Admin',
      roles: ['admin', 'socio'],
      clubId: DEMO_CLUB_ID,
      socioId: String(socioIdByLogin.admin),
      active: true,
    },
  ]);

  await Novedad.insertMany([
    {
      clubId: DEMO_CLUB_ID,
      fuente: 'manual',
      titulo: 'Bienvenidos al club demo de appClub',
      cuerpo: 'Este es un entorno de prueba con datos ficticios, pensado para mostrar el sistema. Se resetea todos los días.',
      fechaPublicacion: new Date(),
      createdBy: BY,
      active: true,
    },
    {
      clubId: DEMO_CLUB_ID,
      fuente: 'manual',
      titulo: 'Salida de trekking este fin de semana',
      cuerpo: 'Ejemplo de novedad cargada manualmente por secretaría.',
      fechaPublicacion: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      createdBy: BY,
      active: true,
    },
  ]);

  return {
    clubId: DEMO_CLUB_ID,
    socios: SOCIOS_DEMO.length,
    credenciales: DEMO_CREDENTIALS,
  };
}

export default resetDemoClub;
