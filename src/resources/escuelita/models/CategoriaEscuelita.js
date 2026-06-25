import mongoose from 'mongoose';

const categoriaEscuelitaSchema = new mongoose.Schema({
  clubId: { type: String, required: true, index: true },
  nombre: { type: String, required: true },
  codigo: { type: String, required: true },
  descripcion: { type: String, default: '' },
  frecuenciaSemanal: { type: Number, enum: [1, 2], required: true },
  precioMensual: { type: Number, default: null },
  active: { type: Boolean, default: true, index: true },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: String, default: null },
  createdBy: String,
  updatedBy: String,
}, { timestamps: true });

categoriaEscuelitaSchema.index({ clubId: 1, codigo: 1 }, { unique: true });

const CategoriaEscuelita = mongoose.model('CategoriaEscuelita', categoriaEscuelitaSchema);

export default CategoriaEscuelita;
