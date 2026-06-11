import mongoose from 'mongoose';

const preciosSchema = new mongoose.Schema({
  tipoCuota: String,
  monto: Number,
}, { timestamps: true });

const Precios = mongoose.model('Precios', preciosSchema);

export default Precios;