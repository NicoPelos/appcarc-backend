import mongoose from 'mongoose';

/**
 * @openapi
 * components:
 *   schemas:
 *     Socio:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         socioNumber:
 *           type: string
 *         sexo:
 *           type: string
 *           enum: [Masculino, Femenino, Otro]
 *         apellido:
 *           type: string
 *         nombre:
 *           type: string
 *         dni:
 *           type: string
 *         fechaNacimiento:
 *           type: string
 *           format: date-time
 *         direccionActual:
 *           type: string
 *         domicilioCompleto:
 *           type: string
 *         calle:
 *           type: string
 *         altura:
 *           type: string
 *         ciudad:
 *           type: string
 *         nacionalidad:
 *           type: string
 *         fechaDeAsociado:
 *           type: string
 *           format: date-time
 *         estado:
 *           type: string
 *           enum: [Activo, Adherente, Baja]
 *         condicionObs:
 *           type: string
 *         correoElectronico:
 *           type: string
 *           format: email
 *         telefono:
 *           type: string
 *         telefonoEmergencia:
 *           type: string
 *         observaciones:
 *           type: string
 *         clubId:
 *           type: string
 *         active:
 *           type: boolean
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

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
  fotoPerfil: { type: String, default: null }, // URL de la foto de perfil
  redesSociales: {
    instagram: { type: String, default: null },
    facebook: { type: String, default: null },
    twitter: { type: String, default: null },
    linkedin: { type: String, default: null },
    whatsapp: { type: String, default: null },
  },
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
