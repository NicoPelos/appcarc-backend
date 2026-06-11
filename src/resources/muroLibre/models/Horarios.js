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
}, { timestamps: true });

const Horarios = mongoose.model('Horarios', horariosSchema);

export default Horarios;