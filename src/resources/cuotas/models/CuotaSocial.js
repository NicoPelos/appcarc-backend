import mongoose from 'mongoose';

const cuotaSocialSchema = new mongoose.Schema({
  idSocio: String,
  desde: Date,
  hasta: Date,
  periodos: Number,
  estado: String,
  idCuota: { type: String, unique: true },
  updatedBy: String,
  idMovimiento: String,
  idFormularioCobro: String,
  tipoDeCuota: String,
  createdBy: String,
}, { timestamps: true });

const CuotaSocial = mongoose.model('CuotaSocial', cuotaSocialSchema);

export default CuotaSocial;