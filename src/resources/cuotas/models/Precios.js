import mongoose from 'mongoose';

const preciosSchema = new mongoose.Schema({
  clubId: {
    type: String,
    required: true,
    index: true,
  },
  // Nueva arquitectura: precio pertenece a una Etiqueta (concepto de precio)
  etiquetaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Etiqueta',
    default: null,
    index: true,
  },
  nombre: {
    type: String,
    required: true,
  },
  unidad: {
    type: String,
    enum: ['mes', 'hora', 'dia', 'pase'],
    required: true,
  },
  monto: {
    type: Number,
    required: true,
    min: 0,
  },
  moneda: {
    type: String,
    default: 'ARS',
  },
  vigenteDesde: {
    type: Date,
    required: true,
    default: Date.now,
    index: true,
  },
  vigenteHasta: {
    type: Date,
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

preciosSchema.index({ clubId: 1, etiquetaId: 1, vigenteDesde: -1 });

const Precios = mongoose.model('Precios', preciosSchema);

export default Precios;
