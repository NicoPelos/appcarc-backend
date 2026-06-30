import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: { type: String, required: true },
  password: { type: String, required: true },
  mustChangePassword: { type: Boolean, default: false },
  passwordChangedAt: { type: Date },
  googleId: { type: String, default: null },
  nombre: String,
  roles: {
    type: [String],
    enum: ['admin', 'autoridad', 'secretaria', 'profesor', 'palestrero', 'limpieza', 'arreglos', 'colaborador', 'socio'],
    default: ['socio'],
  },
  clubId: { type: String, required: true },
  socioId: { type: String, unique: true, sparse: true },
  expoPushToken: { type: String, default: null },
  active: { type: Boolean, default: true },
}, { timestamps: true });

// Un email puede existir en distintos clubs (multi-tenant)
userSchema.index({ email: 1, clubId: 1 }, { unique: true });

const User = mongoose.model('User', userSchema);

export default User;