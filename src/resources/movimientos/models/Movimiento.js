import mongoose from 'mongoose';

const MovimientoSchema = new mongoose.Schema({
  clubId: {
    type: String,
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  responsable: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['Ingreso', 'Egreso'],
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  concept: {
    type: String,
    required: true,
  },
  paymentMethod: {
    type: String,
    enum: ['Efectivo', 'Transferencia'],
    required: true,
  },
  formId: {
    type: String,
    default: '',
  },
  sourceType: {
    type: String,
    enum: ['manual', 'cobro', 'muro_libre'],
    default: 'manual',
  },
  sourceId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'sourceModel',
    default: null,
  },
  sourceModel: {
    type: String,
    enum: ['Cobro', 'Asistencia'],
    default: null,
  },
  description: {
    type: String,
    default: '',
  },
  date: {
    type: Date,
    default: Date.now,
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

export default mongoose.model('Movimiento', MovimientoSchema);
