import mongoose from 'mongoose';

const horarioEtiquetaSchema = new mongoose.Schema({
  clubId:     { type: String, required: true, index: true },
  tipo:       { type: String, enum: ['nombre', 'tipo_tarea'], required: true },
  valor:      { type: String, required: true },
  // tipo_tarea: etiqueta de precio asociada (Hora Palestrero, Hora Limpieza, etc.)
  etiquetaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Etiqueta', default: null },
  // nombre: socio del staff vinculado
  socioId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Socio', default: null },
  createdBy: String,
  updatedBy: String,
}, { timestamps: true });

horarioEtiquetaSchema.index({ clubId: 1, tipo: 1, valor: 1 }, { unique: true });

const HorarioEtiqueta = mongoose.model('HorarioEtiqueta', horarioEtiquetaSchema);

export default HorarioEtiqueta;
