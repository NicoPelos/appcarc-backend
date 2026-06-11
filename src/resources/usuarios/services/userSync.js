import bcrypt from 'bcryptjs';
import User from '../models/User.js';

export const syncSocioUserFromSocio = async (socio) => {
  if (!socio?.correoElectronico || !socio?.dni) return null;

  const email = socio.correoElectronico.toLowerCase().trim();
  const nombre = `${socio.apellido || ''} ${socio.nombre || ''}`.trim();
  const password = socio.dni.toString().trim();

  if (!email || !password) return null;

  let user = null;
  if (socio._id) {
    user = await User.findOne({ socioId: socio._id.toString() });
  }
  if (!user) {
    user = await User.findOne({ email });
  }

  if (user) {
    user.nombre = nombre || user.nombre;
    user.clubId = socio.clubId || user.clubId;
    user.email = email;
    user.socioId = user.socioId || socio._id?.toString();
    if (user.role !== 'admin' && user.role !== 'secretary' && user.role !== 'viewer') {
      user.role = 'socio';
      user.active = true;
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password, salt);
    }
    await user.save();
    return user;
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  user = new User({
    email,
    password: hashedPassword,
    nombre,
    role: 'socio',
    clubId: socio.clubId,
    socioId: socio._id?.toString(),
    active: true,
  });

  await user.save();
  return user;
};
