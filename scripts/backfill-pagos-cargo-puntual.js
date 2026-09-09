// Backfill único (appcarc-backend#168): antes de este cambio, CargoPuntual
// guardaba un solo pago en cobroId/movimientoId/fechaPago/paymentMethod —
// ahora esos campos son solo el espejo del ÚLTIMO pago, y `pagos[]` es la
// fuente real (necesaria para poder revertir el pago correcto si un cargo
// llega a tener más de uno, ej. seña + saldo). Los cargos ya 'pagada' de
// antes de este cambio tienen esos campos pero `pagos` vacío — este script
// les arma la entrada única correspondiente, para que no queden "pagados
// sin ningún pago registrado" si alguna vez hay que revertirlos.
//
// Corre en dry-run por default (--apply para escribir).
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import CargoPuntual from '../src/resources/cargosPuntuales/models/CargoPuntual.js';

const APLICAR = process.argv.includes('--apply');

await mongoose.connect(process.env.MONGO_URI);
console.log(`✅ MongoDB conectado (modo: ${APLICAR ? 'APLICAR CAMBIOS' : 'dry-run, pasá --apply para escribir'})`);

const cargos = await CargoPuntual.find({
  estado: 'pagada',
  cobroId: { $ne: null },
  $or: [{ pagos: { $exists: false } }, { pagos: { $size: 0 } }],
});
console.log(`Cargos 'pagada' con cobroId y sin pagos[]: ${cargos.length}`);

let migrados = 0;
let saltados = 0;

for (const cargo of cargos) {
  if (!cargo.movimientoId || !cargo.fechaPago || !cargo.paymentMethod) {
    saltados++;
    console.warn(`⚠️  ${cargo._id} (${cargo.description}): falta movimientoId/fechaPago/paymentMethod, no se puede armar el pago — se deja sin migrar`);
    continue;
  }

  const monto = cargo.montoPagadoSnapshot || cargo.montoEsperadoSnapshot;
  console.log(`${cargo._id} (${cargo.description}): pagos = [{ monto: ${monto}, fecha: ${cargo.fechaPago.toISOString().slice(0, 10)}, paymentMethod: ${cargo.paymentMethod}, cobroId: ${cargo.cobroId} }]`);

  if (APLICAR) {
    cargo.pagos = [{
      monto,
      fecha: cargo.fechaPago,
      paymentMethod: cargo.paymentMethod,
      cobroId: cargo.cobroId,
      movimientoId: cargo.movimientoId,
    }];
    await cargo.save();
  }
  migrados++;
}

console.log(`\nResumen: ${APLICAR ? 'migrados' : 'a_migrar'}=${migrados} saltados_sin_datos_suficientes=${saltados}`);

await mongoose.disconnect();
