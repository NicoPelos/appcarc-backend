import cron from 'node-cron';
import Club from '../resources/clubs/models/Club.js';
import Socio from '../resources/socios/models/Socio.js';
import Advertencia from '../resources/advertencias/models/Advertencia.js';
import { calcularDeuda } from '../resources/cuotas/services/calcularDeuda.service.js';
import { notifyRoles, notifyJobFailure } from '../services/pushNotification.service.js';
import { ADVERTENCIA } from '../constants/advertenciaCodes.js';

const STAFF_ROLES = ['admin', 'secretaria', 'autoridad'];
const MESES_AVISO = 3;
const ESTADOS_A_REVISAR = ['Activo', 'Adherente'];

const buildMensaje = (mesesDeuda) => `Debe ${mesesDeuda} ${mesesDeuda === 1 ? 'mes' : 'meses'} de cuota social`;

const revisarClub = async (club) => {
  const clubId = club.slug;

  const [socios, abiertas] = await Promise.all([
    Socio.find({ clubId, active: true, estado: { $in: ESTADOS_A_REVISAR } }).select('nombre apellido').lean(),
    Advertencia.find({ clubId, codigo: ADVERTENCIA.MOROSIDAD_CUOTA_SOCIAL, estado: 'abierta' }),
  ]);

  const abiertasPorSocio = new Map(abiertas.map((a) => [String(a.socioId), a]));
  const morosos = [];

  for (const socio of socios) {
    const deuda = await calcularDeuda({ socioId: socio._id, clubId });
    const cuotaSocial = deuda.suscripciones.find((s) => s.etiqueta?.uso_sistema === 'cuota_social');
    if (cuotaSocial && cuotaSocial.mesesDeuda >= MESES_AVISO) {
      morosos.push({ socio, mesesDeuda: cuotaSocial.mesesDeuda });
    }
  }

  const now = new Date();
  const morososIds = new Set(morosos.map((m) => String(m.socio._id)));

  for (const { socio, mesesDeuda } of morosos) {
    const existing = abiertasPorSocio.get(String(socio._id));
    const mensaje = buildMensaje(mesesDeuda);
    if (existing) {
      existing.mensaje = mensaje;
      existing.ultimaRevision = now;
      await existing.save();
    } else {
      await Advertencia.create({
        clubId,
        socioId: socio._id,
        codigo: ADVERTENCIA.MOROSIDAD_CUOTA_SOCIAL,
        mensaje,
        nombre: socio.nombre,
        apellido: socio.apellido,
        estado: 'abierta',
        detectadoEn: now,
        ultimaRevision: now,
      });
    }
  }

  for (const [socioId, advertencia] of abiertasPorSocio) {
    if (!morososIds.has(socioId)) {
      advertencia.estado = 'resuelta';
      advertencia.resueltoEn = now;
      await advertencia.save();
    }
  }

  if (morosos.length > 0) {
    await notifyRoles(clubId, STAFF_ROLES, {
      title: '⚠️ Socios con cuota social atrasada',
      body: `${morosos.length} ${morosos.length === 1 ? 'socio lleva' : 'socios llevan'} 3+ meses sin pagar la cuota social. Revisá el detalle en Advertencias.`,
      data: { tipo: 'morosidad_cuota_social', url: 'carc://advertencias?tipo=morosidad' },
    });
  }

  return morosos.length;
};

export const revisarMorosidadCuotaSocial = async () => {
  console.log('⚠️ Aviso de morosidad: revisando cuota social por club...');
  const clubs = await Club.find({ active: true });

  let totalMorosos = 0;
  for (const club of clubs) {
    try {
      totalMorosos += await revisarClub(club);
    } catch (err) {
      console.error(`❌ Aviso de morosidad [${club.slug}]: error revisando:`, err.message);
      await notifyJobFailure(club.slug, 'Aviso de morosidad', err.message);
    }
  }

  console.log(`⚠️ Aviso de morosidad: ${totalMorosos} socios morosos detectados en total`);
};

export const startAvisoMorosidadJob = () => {
  // Corre todos los lunes a las 9am
  cron.schedule('0 9 * * 1', async () => {
    try {
      await revisarMorosidadCuotaSocial();
    } catch (err) {
      console.error('❌ Error en aviso de morosidad:', err.message);
    }
  });

  console.log('⚠️ Aviso de morosidad job iniciado (lunes a las 9am)');
};
