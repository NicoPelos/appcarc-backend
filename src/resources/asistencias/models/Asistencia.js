import mongoose from 'mongoose';

const asistenciaSchema = new mongoose.Schema({
  clubId: { type: String, required: true, index: true },
  tipo: { type: String, enum: ['muro_libre', 'escuelita'], required: true, index: true },
  socioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Socio', default: null, index: true },
  nombre: { type: String, required: true },
  apellido: { type: String, default: '' },
  dni: { type: String, default: '' },
  esSocio: { type: Boolean, required: true, index: true },
  fecha: { type: Date, required: true, default: Date.now, index: true },

  // muro_libre
  tipoPase: { type: String, default: null },
  estadoPago: { type: String, default: null, index: true },
  monto: { type: Number, default: 0, min: 0 },
  precioSugeridoSnapshot: { type: Number, default: null },
  precioCodigo: { type: String, default: '' },
  periodo: { type: String, default: '', match: /^$|^\d{4}-(0[1-9]|1[0-2])$/, index: true },
  formaPago: { type: String, default: null },
  movimientoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Movimiento', default: null },
  enviarComprobanteWp: { type: Boolean, default: false },

  // escuelita
  categoria: { type: String, default: '' },

  // check-in
  scannedBy: { type: String, default: null },
  checkinMethod: { type: String, enum: ['QR', 'DNI', 'MANUAL'], default: 'MANUAL' },

  observaciones: { type: String, default: '' },
  createdBy: { type: String, required: true },
  updatedBy: { type: String, required: true },
  active: { type: Boolean, default: true, index: true },
}, { timestamps: true });

const Asistencia = mongoose.model('Asistencia', asistenciaSchema);

export default Asistencia;
