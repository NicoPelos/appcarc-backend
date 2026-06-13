import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Socio from '../../socios/models/Socio.js';
import bcrypt from 'bcryptjs';

/**
 * @openapi
 * /api/auth/login-dni:
 *   post:
 *     summary: Login con email y DNI (primer acceso de socio)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - dni
 *               - clubId
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email del socio
 *               dni:
 *                 type: string
 *                 description: DNI del socio (contraseña inicial)
 *               clubId:
 *                 type: string
 *                 description: ID del club
 *     responses:
 *       200:
 *         description: Login exitoso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 user:
 *                   type: object
 *                 socio:
 *                   type: object
 *                 firstLogin:
 *                   type: boolean
 *                   description: True si es primer login (necesita cambiar contraseña)
 *       401:
 *         description: Email o DNI inválidos
 *       500:
 *         description: Error al iniciar sesión
 */
export const loginWithDniHandler = async (req, res) => {
  const { email, dni, clubId } = req.body;

  if (!email || !dni || !clubId) {
    return res.status(400).json({ message: 'Email, DNI y clubId son requeridos.' });
  }

  try {
    // Buscar socio por email y DNI
    const socio = await Socio.findOne({
      correoElectronico: email,
      dni: dni,
      clubId: clubId,
      active: true,
    });

    if (!socio) {
      return res.status(401).json({ message: 'Email o DNI inválidos.' });
    }

    // Buscar o crear usuario
    let user = await User.findOne({ email, clubId });
    let firstLogin = false;

    if (!user) {
      // Primer login: crear usuario con contraseña = DNI hasheada
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(dni, salt);

      user = new User({
        email,
        password: hashedPassword,
        nombre: socio.nombre,
        role: 'socio', // Por defecto 'socio', admin puede cambiar después
        clubId,
        socioId: socio._id.toString(),
        active: true,
      });

      await user.save();
      firstLogin = true;
    } else {
      // Usuario existente: validar contraseña
      const isMatch = await bcrypt.compare(dni, user.password);
      if (!isMatch) {
        // Si el DNI no coincide con la contraseña actual, es un error
        // (el usuario ya cambió su contraseña)
        return res.status(401).json({
          message: 'Credenciales inválidas. Si olvidaste tu contraseña, contacta al administrador.',
        });
      }
    }

    if (!user.active) {
      return res.status(403).json({ message: 'Usuario desactivado' });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role, clubId: user.clubId },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.status(200).json({
      token,
      firstLogin,
      user: {
        id: user._id,
        email: user.email,
        nombre: user.nombre,
        role: user.role,
        clubId: user.clubId,
        socioId: user.socioId,
      },
      socio: {
        id: socio._id,
        nombre: socio.nombre,
        apellido: socio.apellido,
        fotoPerfil: socio.fotoPerfil,
        redesSociales: socio.redesSociales,
      },
    });
  } catch (error) {
    console.error('Error en login con DNI:', error);
    res.status(500).json({ message: 'Error en el servidor al iniciar sesión.' });
  }
};

export default loginWithDniHandler;
