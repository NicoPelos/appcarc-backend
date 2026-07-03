import mongoose from 'mongoose';

const TIPOS = ['social', 'escuelita', 'muro_libre'];
const MODALIDADES = ['mensual', 'por_uso'];

const planSchema = new mongoose.Schema({
  clubId: {
    type: String,
    required: true,
    index: true,
  },
  nombre: {
    type: String,
    required: true,
  },
  descripcion: {
    type: String,
    default: '',
  },
  tipo: {
    type: String,
    enum: TIPOS,
    required: true,
    index: true,
  },
  modalidad: {
    type: String,
    enum: MODALIDADES,
    required: true,
    index: true,
  },
  etiquetaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Etiqueta',
    required: true,
    index: true,
  },
  atributos: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  active: {
    type: Boolean,
    default: true,
    index: true,
  },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: String, default: null },
  createdBy: { type: String, default: '' },
  updatedBy: { type: String, default: '' },
}, { timestamps: true });

planSchema.index({ clubId: 1, nombre: 1 }, { unique: true });
planSchema.index({ clubId: 1, tipo: 1, active: 1 });

const Plan = mongoose.model('Plan', planSchema);

export default Plan;
