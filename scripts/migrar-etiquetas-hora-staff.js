/**
 * migrar-etiquetas-hora-staff.js
 *
 * Taggea con uso_sistema las etiquetas de precio por hora del staff
 * ("Hora Profesor", "Hora Palestrero") que hoy no tienen ningún
 * identificador estable (uso_sistema: null, solo un nombre libre) —
 * necesario para poder filtrar PlanesScreen/PreciosScreen por rol sin
 * depender de que el nombre coincida letra por letra.
 *
 * Recorre TODOS los clubes (multi-tenant), busca por nombre exacto
 * (case-insensitive) una etiqueta activa sin uso_sistema y le asigna
 * 'hora_profesor' / 'hora_palestrero'. Idempotente: si ya está tagueada,
 * o si ya existe otra etiqueta con ese uso_sistema en el club, la omite.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import Etiqueta from '../src/resources/etiquetas/models/Etiqueta.js';

await mongoose.connect(process.env.MONGO_URI);
console.log('✅ MongoDB conectado');

const OBJETIVOS = [
  { nombre: 'Hora Profesor', uso_sistema: 'hora_profesor' },
  { nombre: 'Hora Palestrero', uso_sistema: 'hora_palestrero' },
];

const clubIds = await Etiqueta.distinct('clubId');
console.log(`📋 Clubes encontrados: ${clubIds.length}`);

let tagueadas = 0;
let omitidas = 0;

for (const clubId of clubIds) {
  for (const { nombre, uso_sistema } of OBJETIVOS) {
    const yaExiste = await Etiqueta.findOne({ clubId, uso_sistema, active: true }).lean();
    if (yaExiste) {
      omitidas++;
      continue;
    }

    const candidata = await Etiqueta.findOne({
      clubId,
      active: true,
      uso_sistema: null,
      nombre: { $regex: `^${nombre}$`, $options: 'i' },
    });

    if (!candidata) {
      omitidas++;
      continue;
    }

    candidata.uso_sistema = uso_sistema;
    await candidata.save();
    console.log(`  ✅ ${clubId} — "${candidata.nombre}" → uso_sistema: ${uso_sistema}`);
    tagueadas++;
  }
}

console.log(`\n🎉 Listo. Tagueadas: ${tagueadas} | Omitidas (ya tagueadas o no encontradas): ${omitidas}`);
await mongoose.disconnect();
