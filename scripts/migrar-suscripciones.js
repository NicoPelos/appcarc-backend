import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Socio from '../src/resources/socios/models/Socio.js';
import Cuota from '../src/resources/cuotas/models/Cuota.js';
import Etiqueta from '../src/resources/etiquetas/models/Etiqueta.js';
import Precios from '../src/resources/cuotas/models/Precios.js';
import Suscripcion from '../src/resources/suscripciones/models/Suscripcion.js';
import Escuelita from '../src/resources/escuelita/models/Escuelita.js';

dotenv.config();

const CLUB_ID = process.env.DEFAULT_CLUB_ID || 'CARC';
const DEFAULT_DESDE = '2026-01';
const SYSTEM_USER = 'migration-script';

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Conectado a MongoDB\n');

  // ── 1. Etiquetas ──────────────────────────────────────────────────────────
  console.log('── Paso 1: Etiquetas ──');

  let etiquetaSocial = await Etiqueta.findOne({ clubId: CLUB_ID, uso_sistema: 'cuota_social' });
  if (!etiquetaSocial) {
    etiquetaSocial = await Etiqueta.create({
      clubId: CLUB_ID,
      nombre: 'Cuota Social',
      unidad: 'mes',
      uso_sistema: 'cuota_social',
      createdBy: SYSTEM_USER,
      updatedBy: SYSTEM_USER,
    });
    console.log('  Creada: Cuota Social ->', etiquetaSocial._id);
  } else {
    console.log('  Ya existe: Cuota Social ->', etiquetaSocial._id);
  }

  let etiquetaEscuelita = await Etiqueta.findOne({ clubId: CLUB_ID, uso_sistema: 'cuota_escuelita' });
  if (!etiquetaEscuelita) {
    etiquetaEscuelita = await Etiqueta.create({
      clubId: CLUB_ID,
      nombre: 'Cuota Escuelita',
      unidad: 'mes',
      uso_sistema: 'cuota_escuelita',
      createdBy: SYSTEM_USER,
      updatedBy: SYSTEM_USER,
    });
    console.log('  Creada: Cuota Escuelita ->', etiquetaEscuelita._id);
  } else {
    console.log('  Ya existe: Cuota Escuelita ->', etiquetaEscuelita._id);
  }

  // ── 2. Vincular Precios existentes ────────────────────────────────────────
  console.log('\n── Paso 2: Vincular Precios ──');

  const preciosSocial = await Precios.find({ clubId: CLUB_ID, nombre: 'Cuota Social' });
  for (const p of preciosSocial) {
    if (!p.etiquetaId) {
      p.etiquetaId = etiquetaSocial._id;
      await p.save();
      console.log(`  Vinculado: Cuota Social $${p.monto} (vigenteDesde ${p.vigenteDesde?.toISOString().slice(0, 10)})`);
    }
  }

  const preciosEscuelita = await Precios.find({ clubId: CLUB_ID, nombre: 'Cuota Escuelita' });
  for (const p of preciosEscuelita) {
    if (!p.etiquetaId) {
      p.etiquetaId = etiquetaEscuelita._id;
      await p.save();
      console.log(`  Vinculado: Cuota Escuelita $${p.monto} (vigenteDesde ${p.vigenteDesde?.toISOString().slice(0, 10)})`);
    }
  }

  if (!preciosSocial.length) console.log('  Advertencia: no se encontró precio "Cuota Social"');
  if (!preciosEscuelita.length) console.log('  Advertencia: no se encontró precio "Cuota Escuelita"');

  // ── 3. Suscripciones de Cuota Social ─────────────────────────────────────
  console.log('\n── Paso 3: Suscripciones sociales ──');

  const socios = await Socio.find({ clubId: CLUB_ID, active: true }).lean();
  console.log(`  Socios a procesar: ${socios.length}`);

  let creadas = 0, omitidas = 0, sinCuotas = 0, errores = 0;

  for (const socio of socios) {
    try {
      const yaExiste = await Suscripcion.findOne({
        clubId: CLUB_ID,
        socioId: socio._id,
        etiquetaId: etiquetaSocial._id,
      });
      if (yaExiste) { omitidas++; continue; }

      const primeraC = await Cuota.findOne({
        clubId: CLUB_ID, socioId: socio._id, tipo: 'social', estado: 'pagada',
      }).sort({ periodo: 1 }).lean();

      const esBaja = socio.estado === 'Baja';

      // Baja sin historial de pagos: no tiene sentido crear suscripción
      if (esBaja && !primeraC) { sinCuotas++; continue; }

      const fechaDesde = primeraC?.periodo || DEFAULT_DESDE;

      let fechaHasta = null;
      if (esBaja) {
        const ultimaC = await Cuota.findOne({
          clubId: CLUB_ID, socioId: socio._id, tipo: 'social', estado: 'pagada',
        }).sort({ periodo: -1 }).lean();
        fechaHasta = ultimaC?.periodo || fechaDesde;
      }

      const sus = await Suscripcion.create({
        clubId: CLUB_ID,
        socioId: socio._id,
        etiquetaId: etiquetaSocial._id,
        fechaDesde,
        fechaHasta,
        createdBy: SYSTEM_USER,
        updatedBy: SYSTEM_USER,
      });

      // Vincular cuotas históricas a la nueva suscripción
      await Cuota.updateMany(
        { clubId: CLUB_ID, socioId: socio._id, tipo: 'social', suscripcionId: null },
        { $set: { suscripcionId: sus._id, etiquetaId: etiquetaSocial._id } },
      );

      creadas++;
    } catch (err) {
      console.error(`  Error socio ${socio._id} (${socio.apellido}):`, err.message);
      errores++;
    }
  }

  console.log(`  Creadas: ${creadas} | Omitidas (ya existían): ${omitidas} | Sin historial (baja sin pagos): ${sinCuotas} | Errores: ${errores}`);

  // ── 4. Suscripciones de Escuelita ─────────────────────────────────────────
  console.log('\n── Paso 4: Suscripciones de escuelita ──');

  const alumnos = await Escuelita.find({ clubId: CLUB_ID, active: true }).lean();
  console.log(`  Alumnos activos: ${alumnos.length}`);

  let escCreadas = 0, escOmitidas = 0, escErrores = 0;

  for (const alumno of alumnos) {
    try {
      const yaExiste = await Suscripcion.findOne({
        clubId: CLUB_ID,
        socioId: alumno.socioId,
        etiquetaId: etiquetaEscuelita._id,
      });
      if (yaExiste) { escOmitidas++; continue; }

      const primeraC = await Cuota.findOne({
        clubId: CLUB_ID, socioId: alumno.socioId, tipo: 'escuelita', estado: 'pagada',
      }).sort({ periodo: 1 }).lean();

      const fechaDesde = primeraC?.periodo || DEFAULT_DESDE;

      const sus = await Suscripcion.create({
        clubId: CLUB_ID,
        socioId: alumno.socioId,
        etiquetaId: etiquetaEscuelita._id,
        fechaDesde,
        fechaHasta: null,
        createdBy: SYSTEM_USER,
        updatedBy: SYSTEM_USER,
      });

      await Cuota.updateMany(
        { clubId: CLUB_ID, socioId: alumno.socioId, tipo: 'escuelita', suscripcionId: null },
        { $set: { suscripcionId: sus._id, etiquetaId: etiquetaEscuelita._id } },
      );

      escCreadas++;
    } catch (err) {
      console.error(`  Error alumno ${alumno.socioId}:`, err.message);
      escErrores++;
    }
  }

  console.log(`  Creadas: ${escCreadas} | Omitidas: ${escOmitidas} | Errores: ${escErrores}`);

  // ── 5. Etiquetas de hora y muro libre ──────────────────────────────────────
  console.log('\n── Paso 5: Etiquetas de hora y muro libre ──');

  // Precios de hora existentes: solo crear etiqueta y vincular
  const horaExistentes = [
    { nombre: 'Hora Palestrero', unidad: 'hora', uso_sistema: null },
    { nombre: 'Hora Profesor',   unidad: 'hora', uso_sistema: null },
    { nombre: 'Hora Secretaría', unidad: 'hora', uso_sistema: null },
  ];

  for (const def of horaExistentes) {
    let etiqueta = await Etiqueta.findOne({ clubId: CLUB_ID, nombre: def.nombre });
    if (!etiqueta) {
      etiqueta = await Etiqueta.create({
        clubId: CLUB_ID, nombre: def.nombre, unidad: def.unidad,
        uso_sistema: def.uso_sistema, createdBy: SYSTEM_USER, updatedBy: SYSTEM_USER,
      });
      console.log(`  Creada etiqueta: ${def.nombre}`);
    } else {
      console.log(`  Ya existe: ${def.nombre}`);
    }

    const precio = await Precios.findOne({ clubId: CLUB_ID, nombre: def.nombre });
    if (precio && !precio.etiquetaId) {
      precio.etiquetaId = etiqueta._id;
      await precio.save();
      console.log(`    Vinculado precio $${precio.monto}`);
    }
  }

  // Etiquetas de muro libre: crear etiqueta + precio nuevo
  const muroLibre = [
    { nombre: 'Muro Libre Mensual Socio',    unidad: 'mes', uso_sistema: 'muro_libre_mensual_socio',    monto: 40000 },
    { nombre: 'Muro Libre Mensual No Socio', unidad: 'mes', uso_sistema: 'muro_libre_mensual_no_socio', monto: 50000 },
    { nombre: 'Muro Libre Diario Socio',     unidad: 'dia', uso_sistema: 'muro_libre_diario_socio',     monto: 6000  },
    { nombre: 'Muro Libre Diario No Socio',  unidad: 'dia', uso_sistema: 'muro_libre_diario_no_socio',  monto: 10000 },
  ];

  for (const def of muroLibre) {
    let etiqueta = await Etiqueta.findOne({ clubId: CLUB_ID, uso_sistema: def.uso_sistema });
    if (!etiqueta) {
      etiqueta = await Etiqueta.create({
        clubId: CLUB_ID, nombre: def.nombre, unidad: def.unidad,
        uso_sistema: def.uso_sistema, createdBy: SYSTEM_USER, updatedBy: SYSTEM_USER,
      });
      console.log(`  Creada etiqueta: ${def.nombre}`);
    } else {
      console.log(`  Ya existe: ${def.nombre}`);
    }

    const precioExiste = await Precios.findOne({ clubId: CLUB_ID, etiquetaId: etiqueta._id, active: true });
    if (!precioExiste) {
      await Precios.create({
        clubId: CLUB_ID,
        etiquetaId: etiqueta._id,
        nombre: def.nombre,
        unidad: def.unidad,
        monto: def.monto,
        vigenteDesde: new Date(),
        createdBy: SYSTEM_USER,
        updatedBy: SYSTEM_USER,
      });
      console.log(`    Creado precio $${def.monto}`);
    } else {
      console.log(`    Ya tiene precio $${precioExiste.monto}`);
    }
  }

  console.log('\n✓ Migración completa');
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
