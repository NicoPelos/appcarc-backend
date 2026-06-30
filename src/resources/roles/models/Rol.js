import mongoose from 'mongoose';
import { TODOS_LOS_PERMISOS } from '../../../constants/permisos.js';

const rolSchema = new mongoose.Schema({
  clubId:    { type: String, required: true, index: true },
  nombre:    { type: String, required: true },
  permisos:  { type: [String], enum: TODOS_LOS_PERMISOS, default: [] },
  active:    { type: Boolean, default: true },
}, { timestamps: true });

rolSchema.index({ clubId: 1, nombre: 1 }, { unique: true });

const Rol = mongoose.model('Rol', rolSchema);

export default Rol;
