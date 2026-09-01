import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import RecursoExterno from '../src/resources/recursos/models/RecursoExterno.js';
import User from '../src/resources/usuarios/models/User.js';

// Migración única: hasta appCARC-mobile#16, Topos y Senderos eran una lista
// hardcodeada en el código de la app — la misma para todos los clubes. Al
// pasar a un CRUD editable por club, hay que precargar ese mismo contenido
// en cada club existente para que la pantalla no aparezca vacía el día del
// deploy; de ahí en más cada club edita/agrega la suya desde el panel de staff.
await mongoose.connect(process.env.MONGO_URI);
console.log('✅ MongoDB conectado');

const LEGACY_TOPOS = [
  {
    provincia: 'Córdoba',
    urlProvincia: 'https://www.thecrag.com/en/climbing/argentina/area/226616763',
    items: [
      { nombre: 'Los Gigantes', descripcion: 'La zona más grande de Córdoba — más de 200 vías deportivas y de aventura, cerca de Tanti.', url: 'https://www.thecrag.com/en/climbing/argentina/los-gigantes' },
      { nombre: 'La Ola', descripcion: 'Sobre el camino de Altas Cumbres (ruta 34), a 20 km del Parador El Cóndor.', url: 'https://www.thecrag.com/en/climbing/argentina/la-ola' },
      { nombre: 'Capilla del Monte', descripcion: 'Varios sectores agrupados cerca de Capilla del Monte, al norte de las sierras.', url: 'https://www.thecrag.com/en/climbing/argentina/area/1277866581' },
      { nombre: 'Tanti', descripcion: 'Sobre el camino a Salsacate, cerca de Los Gigantes.', url: 'https://www.thecrag.com/en/climbing/argentina/area/7794631494' },
      { nombre: 'La Calera', descripcion: 'A las afueras de la ciudad de Córdoba — la zona más accesible del área metropolitana.', url: 'https://www.thecrag.com/en/climbing/argentina/area/7794633996' },
    ],
  },
  {
    provincia: 'San Luis',
    urlProvincia: 'https://www.thecrag.com/en/climbing/argentina/area/226617387',
    items: [
      { nombre: 'Merlo', descripcion: 'Sierras de los Comechingones del lado puntano, cerca de Villa de Merlo.', url: 'https://www.thecrag.com/en/climbing/argentina/area/7864312641' },
    ],
  },
];

const LEGACY_SENDEROS = [
  {
    provincia: 'Córdoba',
    urlProvincia: 'https://www.wikiloc.com/trails/hiking/argentina/cordoba',
    items: [
      { nombre: 'Quebrada del Condorito', descripcion: 'Trekking de dificultad baja/media en el Parque Nacional, con vista al Cóndor Andino.', url: 'https://www.wikiloc.com/hiking-trails/parque-nacional-quebrada-del-condorito-8338241' },
      { nombre: 'Cerro Champaquí', descripcion: 'El punto más alto de Córdoba (2.884 m) — ascenso exigente desde Villa Alpina.', url: 'https://www.wikiloc.com/hiking-trails/villa-alpina-cerro-champaqui-12732959' },
      { nombre: 'Cerro Uritorco', descripcion: 'Desde Capilla del Monte — sendero marcado con paradas, hay que registrarse en la base.', url: 'https://www.wikiloc.com/hiking-trails/cerro-uritorco-desde-capilla-del-monte-cordoba-173436619' },
    ],
  },
  {
    provincia: 'San Luis',
    urlProvincia: 'https://www.wikiloc.com/trails/hiking/argentina/san-luis',
    items: [
      { nombre: 'Salto de la Moneda', descripcion: 'Cascada de baja dificultad en Potrero de los Funes, apta para toda la familia.', url: 'https://www.wikiloc.com/hiking-trails/salto-de-la-moneda-potrero-de-los-funes-121952831' },
      { nombre: 'Salto del Tigre', descripcion: 'Trekking a una cascada cerca de Villa de Merlo, sierras de los Comechingones.', url: 'https://www.wikiloc.com/hiking-trails/trekking-a-salto-del-tigre-merlo-san-luis-45886936' },
    ],
  },
];

const clubIds = await User.distinct('clubId');
if (!clubIds.length) {
  console.error('❌ No se encontró ningún club (User.distinct clubId vacío).');
  process.exit(1);
}
console.log(`📋 Clubes encontrados: ${clubIds.join(', ')}`);

let creados = 0;
let saltados = 0;

for (const clubId of clubIds) {
  const yaHayRecursos = await RecursoExterno.exists({ clubId });
  if (yaHayRecursos) {
    console.log(`⏭️  ${clubId}: ya tiene recursos cargados, se omite (no se pisa lo que haya).`);
    saltados++;
    continue;
  }

  for (const [tipo, grupos] of [['topo', LEGACY_TOPOS], ['sendero', LEGACY_SENDEROS]]) {
    let orden = 0;
    for (const grupo of grupos) {
      for (const item of grupo.items) {
        await RecursoExterno.create({
          clubId,
          tipo,
          provincia: grupo.provincia,
          nombre: item.nombre,
          descripcion: item.descripcion,
          url: item.url,
          urlProvincia: grupo.urlProvincia,
          orden: orden++,
          createdBy: 'seed-recursos-legacy',
          updatedBy: 'seed-recursos-legacy',
        });
        creados++;
      }
    }
  }
  console.log(`✅ ${clubId}: recursos legacy cargados.`);
}

console.log(`\n🎉 Listo — ${creados} recursos creados, ${saltados} club(es) omitidos (ya tenían datos).`);
await mongoose.disconnect();
process.exit(0);
