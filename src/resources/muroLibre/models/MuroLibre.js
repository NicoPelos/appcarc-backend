import mongoose from 'mongoose';

const muroLibreSchema = new mongoose.Schema({
  clubId: {
    type: String,
    required: true,
    index: true,
  },
  socioId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Socio',
    default: null,
    index: true,
  },
  nombre: {
    type: String,
    required: true,
  },
  apellido: {
    type: String,
    default: '',
  },
  dni: {
    type: String,
    default: '',
  },
  esSocio: {
    type: Boolean,
    required: true,
    index: true,
  },
  tipoPase: {
    type: String,
    enum: ['diario', 'mensual'],
    required: true,
  },
  estadoPago: {
    type: String,
    enum: ['pagado', 'pendiente', 'exento'],
    default: 'pendiente',
    index: true,
  },
  monto: {
    type: Number,
    default: 0,
    min: 0,
  },
  precioSugeridoSnapshot: {
    type: Number,
    default: null,
  },
  precioCodigo: {
    type: String,
    default: '',
  },
  fecha: {
    type: Date,
    required: true,
    default: Date.now,
    index: true,
  },
  periodo: {
    type: String,
    default: '',
    match: /^$|^\d{4}-(0[1-9]|1[0-2])$/,
    index: true,
  },
  formaPago: {
    type: String,
    enum: ['Efectivo', 'Transferencia', 'Sin pago'],
    default: 'Sin pago',
  },
  scannedBy: {
    type: String,
    default: null,
  },
  checkinMethod: {
    type: String,
    enum: ['QR', 'DNI', 'MANUAL'],
    default: 'MANUAL',
  },
  movimientoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Movimiento',
    default: null,
  },
  observaciones: {
    type: String,
    default: '',
  },
  idMuroLibre: { type: String, unique: true },
  idSocio: String,
  createdBy: {
    type: String,
    required: true,
  },
  updatedBy: {
    type: String,
    required: true,
  },
  enviarComprobanteWp: {
    type: Boolean,
    default: false,
  },
  active: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

const MuroLibre = mongoose.model('MuroLibre', muroLibreSchema);

export default MuroLibre;
