import mongoose from 'mongoose';

const etiquetaSchema = new mongoose.Schema({
  clubId: {
    type: String,
    required: true,
    index: true,
  },
  nombre: {
    type: String,
    required: true,
  },
  unidad: {
    type: String,
    enum: ['mes', 'hora', 'dia'],
    required: true,
  },
  uso_sistema: {
    type: String,
    default: null,
  },
  active: {
    type: Boolean,
    default: true,
    index: true,
  },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: String, default: null },
  createdBy: String,
  updatedBy: String,
}, { timestamps: true });

etiquetaSchema.index({ clubId: 1, uso_sistema: 1 }, { sparse: true });

const Etiqueta = mongoose.model('Etiqueta', etiquetaSchema);

export default Etiqueta;
