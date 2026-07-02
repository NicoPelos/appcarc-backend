import mongoose from 'mongoose';

const clubSchema = new mongoose.Schema({
  nombre:   { type: String, required: true },
  slug:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  logoUrl:  { type: String, default: null },
  contacto: {
    email:     { type: String, default: null },
    telefono:  { type: String, default: null },
    direccion: { type: String, default: null },
  },
  plan: { type: String, enum: ['free', 'basico', 'premium'], default: 'basico' },
  modulos: {
    escuelita:    { type: Boolean, default: true },
    muroLibre:    { type: Boolean, default: true },
    exportSheets: { type: Boolean, default: false },
    novedades:    { type: Boolean, default: true },
  },
  active:       { type: Boolean, default: true },
  suspendidoAt: { type: Date, default: null },
}, { timestamps: true });

const Club = mongoose.model('Club', clubSchema);
export default Club;
