import mongoose from 'mongoose';

const escuelitaSchema = new mongoose.Schema({
  dni: String,
  fechaInscripcion: Date,
  estado: String,
}, { timestamps: true });

const Escuelita = mongoose.model('Escuelita', escuelitaSchema);

export default Escuelita;