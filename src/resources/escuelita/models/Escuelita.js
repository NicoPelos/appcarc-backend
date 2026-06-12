import mongoose from 'mongoose';

const escuelitaSchema = new mongoose.Schema({
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
  dni: {
    type: String,
    default: '',
  },
  fechaInscripcion: {
    type: Date,
    default: Date.now,
  },
  estado: {
    type: String,
    enum: ['activo', 'pausado', 'baja'],
    default: 'activo',
    index: true,
  },
  observaciones: {
    type: String,
    default: '',
  },
  active: {
    type: Boolean,
    default: true,
    index: true,
  },
  createdBy: String,
  updatedBy: String,
}, { timestamps: true });

escuelitaSchema.index({ clubId: 1, socioId: 1, active: 1 }, { unique: true });

const Escuelita = mongoose.model('Escuelita', escuelitaSchema);

export default Escuelita;
