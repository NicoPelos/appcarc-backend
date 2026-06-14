import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Socio from '../../socios/models/Socio.js';
import bcrypt from 'bcryptjs';
import tokenService from '../../../services/tokenBlacklistService.js';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const register = async (req, res) => {
  const { email, password, dni, nombre, role, clubId } = req.body;

  try {
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ message: 'El usuario ya existe con este email.' });

    // Encriptar la contraseña (si no viene password, usar DNI como contraseña temporal)
    let mustChangePassword = false;
    let hashedPassword;
    if (!password && dni) {
      mustChangePassword = true;
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(dni, salt);
    } else {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(password, salt);
    }

    user = new User({ email, password: hashedPassword, nombre, role: role || 'secretary', clubId, mustChangePassword });
    await user.save();

    const token = jwt.sign({ id: user._id, role: user.role, clubId: user.clubId }, process.env.JWT_SECRET, { expiresIn: '8h' });

    res.status(201).json({ token, user: { id: user._id, email: user.email, nombre: user.nombre, role: user.role, clubId: user.clubId, mustChangePassword: user.mustChangePassword } });
  } catch (error) {
    console.error('Error en el registro de usuario:', error);
    res.status(500).json({ message: 'Error en el servidor al registrar usuario.' });
  }
};

export const googleLogin = async (req, res) => {
  const { idToken, clubId } = req.body;
  try {
    const ticket = await client.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
    const { email, name, picture } = ticket.getPayload();

    if (!clubId) {
      return res.status(400).json({ message: 'clubId es requerido' });
    }

    let user = await User.findOne({ email, clubId });

    // Si no existe usuario, intentar crear uno vinculado a un socio
    if (!user) {
      // Buscar si existe un socio con ese email
      const socio = await Socio.findOne({
        correoElectronico: email,
        clubId: clubId,
        active: true,
      });

      if (!socio) {
        return res.status(403).json({
          message: 'Tu email no está registrado como socio en ningún club. Contacta al administrador.',
        });
      }

      // Crear usuario automáticamente vinculado al socio
      // Generar contraseña aleatoria (para seguridad, el usuario puede cambiarla después)
      const randomPassword = Math.random().toString(36).slice(-12);
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(randomPassword, salt);

      user = new User({
        email,
        password: hashedPassword,
        nombre: socio.nombre,
        role: 'socio', // Por defecto socio, admin puede cambiar después
        clubId: clubId,
        socioId: socio._id.toString(),
        active: true,
      });

      await user.save();
    }

    if (!user.active) {
      return res.status(403).json({ message: 'Usuario desactivado' });
    }

    // Obtener datos del socio si existen
    const socio = user.socioId ? await Socio.findById(user.socioId) : null;

    const token = jwt.sign(
      { id: user._id, role: user.role, clubId: user.clubId },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.status(200).json({
      token,
      user: {
        id: user._id,
        nombre: user.nombre || name,
        email,
        role: user.role,
        clubId: user.clubId,
        socioId: user.socioId,
        picture,
        mustChangePassword: !!user.mustChangePassword,
      },
      socio: socio ? {
        id: socio._id,
        nombre: socio.nombre,
        apellido: socio.apellido,
        fotoPerfil: socio.fotoPerfil,
        redesSociales: socio.redesSociales,
      } : null,
    });
  } catch (error) {
    console.error('Error en Google Login:', error);
    res.status(401).json({ message: 'Autenticación de Google fallida' });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Credenciales inválidas.' });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Credenciales inválidas.' });
    if (!user.active) return res.status(403).json({ message: 'Usuario desactivado' });
    const token = jwt.sign({ id: user._id, role: user.role, clubId: user.clubId }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.status(200).json({ token, user: { id: user._id, email: user.email, nombre: user.nombre, role: user.role, clubId: user.clubId, mustChangePassword: !!user.mustChangePassword } });
  } catch (error) {
    console.error('Error en el login de usuario:', error);
    res.status(500).json({ message: 'Error en el servidor al iniciar sesión.' });
  }
};

export const logout = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(400).json({ message: 'Falta token' });
    await tokenService.addToken(token);
    return res.status(200).json({ message: 'Desconectado correctamente' });
  } catch (error) {
    console.error('Error en logout:', error);
    return res.status(500).json({ message: 'Error en el servidor al desconectar.' });
  }
};

export const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!newPassword) {
    return res.status(400).json({ message: 'newPassword es requerido.' });
  }

  try {
    const user = await User.findById(req.user?.id);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }

    // Permitir cambio sin currentPassword si el usuario está marcado para cambiar (primer login)
    if (!currentPassword && !user.mustChangePassword) {
      return res.status(400).json({ message: 'currentPassword requerido.' });
    }

    if (currentPassword) {
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: 'Contraseña actual inválida.' });
      }
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.mustChangePassword = false;
    user.passwordChangedAt = new Date();
    await user.save();

    res.status(200).json({ message: 'Contraseña actualizada correctamente.' });
  } catch (error) {
    console.error('Error cambiando contraseña:', error);
    res.status(500).json({ message: 'Error en el servidor al cambiar contraseña.' });
  }
};

export default { register, login, googleLogin, logout, changePassword };
