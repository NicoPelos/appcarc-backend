import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  nombre: String,
  role: { 
    type: String, 
    enum: ['admin', 'secretary', 'viewer'], 
    default: 'secretary' 
  },
  clubId: { type: String, required: true }, // Identificador del club al que pertenece
  active: { type: Boolean, default: true }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

export default User;