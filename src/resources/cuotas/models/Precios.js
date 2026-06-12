import mongoose from 'mongoose';

const preciosSchema = new mongoose.Schema({
  clubId: {
    type: String,
    required: true,
    index: true,
  },
  categoria: {
    type: String,
    enum: ['cuota', 'hora', 'pase'],
    required: true,
    index: true,
  },
  codigo: {
    type: String,
    enum: [
      'cuota_social',
      'cuota_escuelita',
      'hora_palestrero',
      'hora_profesor',
      'hora_secretaria',
      'muro_libre_diario_socio',
      'muro_libre_diario_no_socio',
      'muro_libre_mensual_socio',
      'muro_libre_mensual_no_socio',
    ],
    required: true,
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
  createdBy: String,
  updatedBy: String,
}, { timestamps: true });

preciosSchema.index({ clubId: 1, codigo: 1, vigenteDesde: -1 });

preciosSchema.virtual('tipoCuota').get(function getTipoCuota() {
  if (this.codigo === 'cuota_social') return 'social';
  if (this.codigo === 'cuota_escuelita') return 'escuelita';
  return undefined;
});

const Precios = mongoose.model('Precios', preciosSchema);

export default Precios;
