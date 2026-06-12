import mongoose from 'mongoose';

const cobroItemSchema = new mongoose.Schema({
  socioId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Socio',
    required: true,
  },
  tipo: {
    type: String,
    enum: ['social', 'escuelita'],
    required: true,
  },
  periodo: {
    type: String,
    required: true,
    match: /^\d{4}-(0[1-9]|1[0-2])$/,
  },
  amount: {
    type: Number,
    required: true,
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
  description: {
    type: String,
    default: '',
  },
}, { _id: false });

const cobroSchema = new mongoose.Schema({
  clubId: {
    type: String,
    required: true,
    index: true,
  },
  responsable: {
    type: String,
    required: true,
  },
  paymentMethod: {
    type: String,
    enum: ['Efectivo', 'Transferencia'],
    required: true,
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0,
  },
  description: {
    type: String,
    default: '',
  },
  date: {
    type: Date,
    default: Date.now,
  },
  items: {
    type: [cobroItemSchema],
    validate: {
      validator: (items) => Array.isArray(items) && items.length > 0,
      message: 'El cobro debe tener al menos un item',
    },
  },
  movimientoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Movimiento',
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

export default mongoose.model('Cobro', cobroSchema);
