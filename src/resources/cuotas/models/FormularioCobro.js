import mongoose from 'mongoose';

const formularioCobroSchema = new mongoose.Schema({
  idFormularioCobro: { type: String, unique: true },
  idSocio: String,
  cantSocial: Number,
  pagaSocial: Boolean,
  formaPago: String,
  enviarComprobante: Boolean,
  pagaEscuelita: Boolean,
  cantEscuelita: Number,
  montoTotal: Number,
}, { timestamps: true });

const FormularioCobro = mongoose.model('FormularioCobro', formularioCobroSchema);

export default FormularioCobro;