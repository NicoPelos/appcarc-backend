import mongoose from 'mongoose';
import { CATEGORIAS_MOVIMIENTO } from '../../movimientos/models/Movimiento.js';

// Mismas categorías de ingreso que ya usa Movimiento — así el dinero que
// entra por un Evento categoriza automáticamente en el Dashboard / vista
// "Ingresos por categoría" (appcarc-backend#171/#172) sin tocar esa lógica:
// basta con que registrarPagoEventoParticipante.service.js (appcarc-backend#175)
// copie `evento.categoria` al `Movimiento.categoria` que genera cada pago.
export const CATEGORIAS_EVENTO = CATEGORIAS_MOVIMIENTO.Ingreso;

export const ESTADOS_EVENTO = ['abierto', 'cerrado'];

const eventoSchema = new mongoose.Schema({
  clubId: {
    type: String,
    required: true,
    index: true,
  },
  nombre: {
    type: String,
    required: true,
  },
  descripcion: {
    type: String,
    default: '',
  },
  categoria: {
    type: String,
    enum: CATEGORIAS_EVENTO,
    required: true,
  },
  fecha: {
    type: Date,
    required: true,
  },
  // Sugerencia al agregar un participante (appcarc-backend#174) — cada
  // participante puede editarlo igual que ya pasa con CargoPuntual, no es
  // un precio fijo para todos.
  precioSugerido: {
    type: Number,
    default: null,
    min: 0,
  },
  estado: {
    type: String,
    enum: ESTADOS_EVENTO,
    default: 'abierto',
  },
  active: {
    type: Boolean,
    default: true,
    index: true,
  },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: String, default: null },
  createdBy: { type: String, default: '' },
  updatedBy: { type: String, default: '' },
}, { timestamps: true });

eventoSchema.index({ clubId: 1, active: 1, fecha: -1 });

const Evento = mongoose.model('Evento', eventoSchema);

export default Evento;
