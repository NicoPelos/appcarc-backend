import mongoose from 'mongoose';

const cuotaSchema = new mongoose.Schema({
  clubId: {
    type: String,
    required: true,
    index: true,
  },
  socioId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Socio',
    required: true,
    index: true,
  },
  suscripcionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Suscripcion',
    default: null,
    index: true,
  },
  etiquetaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Etiqueta',
    default: null,
    index: true,
  },
  tipo: {
    type: String,
    enum: ['social', 'escuelita', 'muro_libre'],
    default: null,
    index: true,
  },
  periodo: {
    type: String,
    required: true,
    match: /^\d{4}-(0[1-9]|1[0-2])$/,
    index: true,
  },
  estado: {
    type: String,
    enum: ['pendiente', 'pagada', 'anulada'],
    default: 'pendiente',
    index: true,
  },
  montoEsperadoSnapshot: {
    type: Number,
    required: true,
    min: 0,
  },
  montoPagadoSnapshot: {
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
  cobroId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cobro',
    default: null,
  },
  movimientoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Movimiento',
    default: null,
  },
  fechaPago: {
    type: Date,
    default: null,
  },
  paymentMethod: {
    type: String,
    enum: ['Efectivo', 'Transferencia'],
    required: true,
  },
  description: {
    type: String,
    default: '',
  },
  createdBy: {
    type: String,
    required: true,
  },
  updatedBy: {
    type: String,
    required: true,
  },
  active: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

cuotaSchema.index(
  { clubId: 1, socioId: 1, suscripcionId: 1, periodo: 1, active: 1 },
  { unique: true, sparse: true }
);

export default mongoose.model('Cuota', cuotaSchema);
