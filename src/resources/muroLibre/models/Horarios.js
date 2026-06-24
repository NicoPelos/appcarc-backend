import mongoose from 'mongoose';

const horariosSchema = new mongoose.Schema({
  fecha: Date,
  observaciones: String,
  horaEntrada: Date,
  horaSalida: Date,
  nombre: String,
  totalHoras: Number,
  idHorarios: { type: String, unique: true },
  createdBy: String,
  updatedBy: String,
  tipoTarea: String,
  active: { type: Boolean, default: true, index: true },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: String, default: null },
}, { timestamps: true });

const Horarios = mongoose.model('Horarios', horariosSchema);

export default Horarios;