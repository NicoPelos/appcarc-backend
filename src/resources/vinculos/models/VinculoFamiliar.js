import mongoose from 'mongoose';

const vinculoFamiliarSchema = new mongoose.Schema({
  clubId: {
    type: String,
    required: true,
    index: true,
  },
  padreUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  hijoSocioId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Socio',
    required: true,
    index: true,
  },
  createdBy: {
    type: String,
    required: true,
  },
  updatedBy: {
    type: String,
    required: true,
  },
  active: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

vinculoFamiliarSchema.index(
  { clubId: 1, padreUserId: 1, hijoSocioId: 1, active: 1 },
  { unique: true },
);

export default mongoose.model('VinculoFamiliar', vinculoFamiliarSchema);
