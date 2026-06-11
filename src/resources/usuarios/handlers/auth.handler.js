import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import tokenService from '../../../services/tokenBlacklistService.js';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const register = async (req, res) => {
  const { email, password, nombre, role, clubId } = req.body;

  try {
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ message: 'El usuario ya existe con este email.' });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    user = new User({ email, password: hashedPassword, nombre, role: role || 'secretary', clubId });
    await user.save();

    const token = jwt.sign({ id: user._id, role: user.role, clubId: user.clubId }, process.env.JWT_SECRET, { expiresIn: '8h' });

    res.status(201).json({ token, user: { id: user._id, email: user.email, nombre: user.nombre, role: user.role, clubId: user.clubId } });
  } catch (error) {
    console.error('Error en el registro de usuario:', error);
    res.status(500).json({ message: 'Error en el servidor al registrar usuario.' });
  }
};

export const googleLogin = async (req, res) => {
  const { idToken } = req.body;
  try {
    const ticket = await client.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
    const { email, name, picture } = ticket.getPayload();
    let user = await User.findOne({ email });
    if (!user) return res.status(403).json({ message: 'Tu usuario no está registrado en ningún club. Contacta al administrador.' });
    if (!user.active) return res.status(403).json({ message: 'Usuario desactivado' });
    const token = jwt.sign({ id: user._id, role: user.role, clubId: user.clubId }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.status(200).json({ token, user: { nombre: user.nombre || name, email, role: user.role, clubId: user.clubId, picture } });
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
    res.status(200).json({ token, user: { id: user._id, email: user.email, nombre: user.nombre, role: user.role, clubId: user.clubId } });
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

export default { register, login, googleLogin, logout };
