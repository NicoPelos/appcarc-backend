import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  // DNI no se almacena en texto plano por privacidad; el sistema puede
  // inicializar la contraseña a partir del DNI y marcar mustChangePassword.
  mustChangePassword: { type: Boolean, default: false },
  passwordChangedAt: { type: Date },
  googleId: { type: String, default: null },
  nombre: String,
  role: { 
    type: String, 
    enum: ['admin', 'secretary', 'socio'], 
    default: 'secretary' 
  },
  clubId: { type: String, required: true }, // Identificador del club al que pertenece
  socioId: { type: String, unique: true, sparse: true },
  active: { type: Boolean, default: true }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

export default User;