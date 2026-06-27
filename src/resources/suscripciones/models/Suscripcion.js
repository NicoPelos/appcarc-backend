import mongoose from 'mongoose';

const PERIODO_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const suscripcionSchema = new mongoose.Schema({
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
  fechaDesde: {
    type: String,
    required: true,
    validate: {
      validator: (v) => PERIODO_PATTERN.test(v),
      message: 'fechaDesde debe tener formato YYYY-MM',
    },
  },
  fechaHasta: {
    type: String,
    default: null,
    validate: {
      validator: (v) => v === null || PERIODO_PATTERN.test(v),
      message: 'fechaHasta debe tener formato YYYY-MM o ser null',
    },
  },
  active: {
    type: Boolean,
    default: true,
    index: true,
  },
  createdBy: {
    type: String,
    required: true,
  },
  updatedBy: {
    type: String,
    required: true,
  },
}, { timestamps: true });

suscripcionSchema.index(
  { clubId: 1, socioId: 1, etiquetaId: 1, fechaDesde: 1 },
  { unique: true },
);

suscripcionSchema.index({ clubId: 1, socioId: 1, active: 1 });

const Suscripcion = mongoose.model('Suscripcion', suscripcionSchema);

export default Suscripcion;
