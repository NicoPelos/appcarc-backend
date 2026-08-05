import mongoose from 'mongoose';

// Mismo shape que los items que ya arma RegistrarCobroScreen para /api/cobros
// (ver registrarCobro.service.js) — se guardan tal cual para poder llamar a
// registrarCobro con exactamente lo mismo una vez que Mercado Pago confirma
// el pago, sin tener que re-derivar montos ni resolver precios de nuevo.
const pagoOnlineItemSchema = new mongoose.Schema({
  socioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Socio', required: true },
  suscripcionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Suscripcion', default: null },
  cargoPuntualId: { type: mongoose.Schema.Types.ObjectId, ref: 'CargoPuntual', default: null },
  muroLibrePendiente: { type: Boolean, default: false },
  periodos: { type: [String], default: undefined },
  cantidad: { type: Number, default: undefined },
  amount: { type: Number, required: true, min: 0 },
  description: { type: String, default: '' },
}, { _id: false });

const pagoOnlineIntentSchema = new mongoose.Schema({
  clubId: { type: String, required: true, index: true },
  socioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Socio', required: true, index: true },

  // Quién generó el link (secretaría/admin) — se reutiliza como actor
  // sintético al confirmar el pago desde el webhook (sin req.user real).
  requestedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requestedByEmail: { type: String, required: true },

  items: {
    type: [pagoOnlineItemSchema],
    required: true,
    validate: {
      validator: (v) => Array.isArray(v) && v.length > 0,
      message: 'La intención de pago debe incluir al menos un item',
    },
  },
  totalAmount: { type: Number, required: true, min: 0 },

  preferenceId: { type: String, default: null, index: true },
  externalReference: { type: String, required: true, unique: true, index: true },

  estado: {
    type: String,
    enum: ['pendiente', 'aprobado', 'rechazado', 'expirado'],
    default: 'pendiente',
    index: true,
  },

  mpPaymentId: { type: String, default: null, index: true },
  mpStatus: { type: String, default: null },
  mpStatusDetail: { type: String, default: null },

  cobroId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cobro', default: null },
}, { timestamps: true });

const PagoOnlineIntent = mongoose.model('PagoOnlineIntent', pagoOnlineIntentSchema);

export default PagoOnlineIntent;
