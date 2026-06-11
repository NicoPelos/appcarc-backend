import mongoose from 'mongoose';

const socioSchema = new mongoose.Schema({
  socioNumber: { type: String, unique: true, sparse: true },
  sexo: { type: String, enum: ['Masculino', 'Femenino', 'Otro'] },
  apellido: { type: String, required: true },
  nombre: { type: String, required: true },
  dni: { type: String, required: true, unique: true },
  fechaNacimiento: Date,
  direccionActual: String,
  domicilioCompleto: String,
  calle: String,
  altura: String,
  ciudad: String,
  nacionalidad: String,
  fechaDeAsociado: Date,
  estado: { type: String, enum: ['Activo', 'Adherente', 'Baja'], default: 'Activo' },
  condicionObs: String,
  correoElectronico: { type: String, match: /.+@.+\..+/ },
  telefono: String,
  telefonoEmergencia: String,
  observaciones: String,
  clubId: { type: String, required: true, index: true },
  sheetRowNumber: Number,
  sheetName: String,
  spreadsheetId: String,
  sheetUpdatedAt: Date,
  active: { type: Boolean, default: true },
  deletedAt: Date,
  deletedBy: String,
  createdBy: String,
  updatedBy: String,
}, {
  timestamps: true,
});

const Socio = mongoose.model('Socio', socioSchema);

export default Socio;
