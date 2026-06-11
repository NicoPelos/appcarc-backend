import mongoose from 'mongoose';

const muroLibreSchema = new mongoose.Schema({
  nombre: String,
  apellido: String,
  monto: Number,
  fecha: Date,
  formaPago: String,
  idMuroLibre: { type: String, unique: true },
  idSocio: String,
  createdBy: String,
  updatedBy: String,
  enviarComprobanteWp: Boolean,
}, { timestamps: true });

const MuroLibre = mongoose.model('MuroLibre', muroLibreSchema);

export default MuroLibre;