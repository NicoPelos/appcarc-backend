import cron from 'node-cron';
import Precios from '../resources/cuotas/models/Precios.js';
import Suscripcion from '../resources/suscripciones/models/Suscripcion.js';
import Horarios from '../resources/horarios/models/Horarios.js';
import { notifyRoles, notifySocio, notifyJobFailure } from '../services/pushNotification.service.js';
import { diaBoundsUTC } from '../services/fechaArgentina.js';

const STAFF_ROLES = ['admin', 'secretaria', 'autoridad'];
const DEFAULT_CLUB_ID = process.env.DEFAULT_CLUB_ID || 'CARC';
const DIAS_AVISO_VENCIMIENTO = 7;

const formatMonto = (n) => `$${Number(n).toLocaleString('es-AR')}`;
const formatFechaAR = (d) => new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: 'long' });
const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

// Quién se ve afectado por el precio de una etiqueta: si es una tarifa por
// hora (ej. "Hora Profesor"), el staff no tiene una suscripción a su propia
// tarifa — el afectado es quien carga horas contra esa etiqueta. Para el
// resto (cuota social, escuelita, etc.) es quien tiene una suscripción activa.
const buscarSocioIdsAfectados = async ({ clubId, etiquetaId, unidad }) => {
  if (unidad === 'hora') {
    return Horarios.distinct('socioId', { clubId, etiquetaId, active: true, socioId: { $ne: null } });
  }
  return Suscripcion.distinct('socioId', { clubId, etiquetaId, active: true });
};

// ─── 1. Avisar si un precio vence pronto y no hay uno nuevo que lo reemplace ──

export const revisarVencimientosSinReemplazo = async () => {
  console.log('💰 Alerta de precios: revisando vencimientos sin reemplazo...');
  const { start: inicioHoy } = diaBoundsUTC(new Date());
  const limite = addDays(inicioHoy, DIAS_AVISO_VENCIMIENTO);

  const porVencer = await Precios.find({
    active: true,
    vigenteHasta: { $ne: null, $gte: inicioHoy, $lte: limite },
  }).populate('etiquetaId', 'nombre').lean();

  let avisados = 0;
  for (const precio of porVencer) {
    if (!precio.etiquetaId) continue;

    const diaSiguiente = addDays(precio.vigenteHasta, 1);
    const reemplazo = await Precios.findOne({
      clubId: precio.clubId,
      etiquetaId: precio.etiquetaId._id,
      active: true,
      _id: { $ne: precio._id },
      vigenteDesde: { $lte: diaSiguiente },
      $or: [{ vigenteHasta: null }, { vigenteHasta: { $gte: diaSiguiente } }],
    }).lean();
    if (reemplazo) continue;

    try {
      await notifyRoles(precio.clubId, STAFF_ROLES, {
        title: '⚠️ Precio por vencer sin reemplazo',
        body: `"${precio.etiquetaId.nombre}" vence el ${formatFechaAR(precio.vigenteHasta)} y no hay un precio nuevo cargado para después. Creá uno para no dejar a nadie sin precio.`,
        data: { tipo: 'precio_por_vencer', precioId: String(precio._id), url: `carc://precios?precioId=${precio._id}` },
      });
      avisados++;
    } catch (err) {
      console.error(`Error avisando vencimiento del precio ${precio._id}:`, err.message);
    }
  }

  console.log(`💰 Alerta de precios: ${avisados} avisos de vencimiento enviados`);
};

// ─── 2. Avisar el día que un precio nuevo reemplaza a uno anterior ────────────

export const revisarCambiosDePrecio = async () => {
  console.log('💰 Alerta de precios: revisando cambios de precio de hoy...');
  const { start: inicioHoy, end: finHoy } = diaBoundsUTC(new Date());
  const ayer = addDays(inicioHoy, -1);

  const nuevos = await Precios.find({
    active: true,
    vigenteDesde: { $gte: inicioHoy, $lte: finHoy },
  }).populate('etiquetaId', 'nombre unidad').lean();

  let avisados = 0;
  for (const nuevo of nuevos) {
    if (!nuevo.etiquetaId) continue;

    const anterior = await Precios.findOne({
      clubId: nuevo.clubId,
      etiquetaId: nuevo.etiquetaId._id,
      active: true,
      _id: { $ne: nuevo._id },
      vigenteDesde: { $lte: ayer },
      $or: [{ vigenteHasta: null }, { vigenteHasta: { $gte: ayer } }],
    }).sort({ vigenteDesde: -1 }).lean();

    // Sin precio anterior (etiqueta nueva) o mismo monto (edición sin cambio real): no avisar.
    if (!anterior || anterior.monto === nuevo.monto) continue;

    const nombre = nuevo.etiquetaId.nombre;
    const cambio = `de ${formatMonto(anterior.monto)} a ${formatMonto(nuevo.monto)}`;

    try {
      await notifyRoles(nuevo.clubId, STAFF_ROLES, {
        title: '💰 Cambio de precio',
        body: `"${nombre}" cambió ${cambio} a partir de hoy.`,
        data: { tipo: 'precio_cambio', precioId: String(nuevo._id), url: `carc://precios?precioId=${nuevo._id}` },
      });

      const socioIds = await buscarSocioIdsAfectados({
        clubId: nuevo.clubId,
        etiquetaId: nuevo.etiquetaId._id,
        unidad: nuevo.etiquetaId.unidad,
      });
      for (const socioId of socioIds) {
        await notifySocio(socioId, {
          title: '💰 Cambio de precio',
          body: `La cuota de "${nombre}" cambió ${cambio} a partir de hoy.`,
          data: { tipo: 'precio_cambio', precioId: String(nuevo._id), url: `carc://precios?precioId=${nuevo._id}` },
        }).catch((err) => console.error(`Error notificando cambio de precio a socio ${socioId}:`, err.message));
      }

      avisados++;
    } catch (err) {
      console.error(`Error avisando cambio del precio ${nuevo._id}:`, err.message);
    }
  }

  console.log(`💰 Alerta de precios: ${avisados} cambios de precio notificados`);
};

export const startAlertaPreciosJob = () => {
  // Corre todos los días a las 8am
  cron.schedule('0 8 * * *', async () => {
    try {
      await revisarVencimientosSinReemplazo();
      await revisarCambiosDePrecio();
    } catch (err) {
      console.error('❌ Error en alerta de precios:', err.message);
      await notifyJobFailure(DEFAULT_CLUB_ID, 'Alerta de precios', err.message);
    }
  });

  console.log('💰 Alerta de precios job iniciado (todos los días a las 8am)');
};
