import mongoose from 'mongoose';

const cargoPuntualSchema = new mongoose.Schema({
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
  etiquetaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Etiqueta',
    required: true,
    index: true,
  },
  periodo: {
    type: String,
    required: true,
    match: /^\d{4}-(0[1-9]|1[0-2])$/,
  },
  description: {
    type: String,
    required: true,
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
    default: null,
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

cargoPuntualSchema.index({ clubId: 1, socioId: 1, estado: 1, active: 1 });

export default mongoose.model('CargoPuntual', cargoPuntualSchema);
