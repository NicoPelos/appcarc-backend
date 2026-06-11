import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

import bcrypt from 'bcryptjs'; // Importar bcrypt para encriptar contraseñas
import tokenService from '../../../services/tokenBlacklistService.js';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// @desc    Registrar un nuevo usuario
// @route   POST /api/auth/register
// @access  Public (o Private si solo admins pueden crear usuarios)
export const register = async (req, res) => {
  const { email, password, nombre, role, clubId } = req.body;

  try {
    // Verificar si el usuario ya existe
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'El usuario ya existe con este email.' });
    }

    // Encriptar la contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Crear nuevo usuario
    user = new User({
      email,
      password: hashedPassword,
      nombre,
      role: role || 'secretary', // Rol por defecto si no se especifica
      clubId, // Es crucial asignar el clubId al registrar
    });

    await user.save();

    // Generar JWT
    const token = jwt.sign(
      { id: user._id, role: user.role, clubId: user.clubId },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.status(201).json({
      token,
      user: { id: user._id, email: user.email, nombre: user.nombre, role: user.role, clubId: user.clubId }
    });

  } catch (error) {
    console.error('Error en el registro de usuario:', error);
    res.status(500).json({ message: 'Error en el servidor al registrar usuario.' });
  }
};

// @desc    Login con Google Identity Services
export const googleLogin = async (req, res) => {
  const { idToken } = req.body;

  try {
    // 1. Verificar el token con Google
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    
    const { email, name, picture } = ticket.getPayload();

    // 2. Buscar si el usuario ya existe en nuestra DB
    let user = await User.findOne({ email });

    if (!user) {
      // En un sistema multi-club, aquí podrías manejar invitaciones
      // o asignar un club por defecto/temporal para nuevos registros.
      return res.status(403).json({ 
        message: 'Tu usuario no está registrado en ningún club. Contacta al administrador.' 
      });
    }

    if (!user.active) {
      return res.status(403).json({ message: 'Usuario desactivado' });
    }

    // 3. Generar nuestro JWT con la info de multi-tenencia
    const token = jwt.sign(
      { 
        id: user._id, 
        role: user.role, 
        clubId: user.clubId 
      }, 
      process.env.JWT_SECRET, 
      { expiresIn: '8h' }
    );

    res.status(200).json({
      token,
      user: { nombre: user.nombre || name, email, role: user.role, clubId: user.clubId, picture }
    });
  } catch (error) {
    console.error('Error en Google Login:', error);
    res.status(401).json({ message: 'Autenticación de Google fallida' });
  }
};

// @desc    Login con email y contraseña
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // 1. Buscar usuario por email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Credenciales inválidas.' });
    }

    // 2. Verificar contraseña
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Credenciales inválidas.' });
    }

    if (!user.active) {
      return res.status(403).json({ message: 'Usuario desactivado' });
    }

    // 3. Generar JWT
    const token = jwt.sign(
      { id: user._id, role: user.role, clubId: user.clubId },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.status(200).json({
      token,
      user: { id: user._id, email: user.email, nombre: user.nombre, role: user.role, clubId: user.clubId }
    });
  } catch (error) {
    console.error('Error en el login de usuario:', error);
    res.status(500).json({ message: 'Error en el servidor al iniciar sesión.' });
  }
};

// @desc    Logout: invalidar token
// @route   POST /api/auth/logout
// @access  Protected (token en header)
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