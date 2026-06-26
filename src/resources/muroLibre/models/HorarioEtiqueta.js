import mongoose from 'mongoose';

const horarioEtiquetaSchema = new mongoose.Schema({
  clubId: { type: String, required: true, index: true },
  tipo:   { type: String, enum: ['nombre', 'tipo_tarea'], required: true },
  valor:  { type: String, required: true },
  createdBy: String,
}, { timestamps: true });

horarioEtiquetaSchema.index({ clubId: 1, tipo: 1, valor: 1 }, { unique: true });

const HorarioEtiqueta = mongoose.model('HorarioEtiqueta', horarioEtiquetaSchema);

export default HorarioEtiqueta;
