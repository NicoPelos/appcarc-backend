import express from 'express';
import rateLimit from 'express-rate-limit';
import { googleLogin, googleCallback, register, login, logout, changePassword, registerPushToken } from './handlers/auth.handler.js';
import { getStaffHandler } from './handlers/getStaff.handler.js';
import { protect, authorize } from '../../middleware/auth.js';
import { PERMISOS } from '../../constants/permisos.js';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Demasiados intentos de login. Intentá de nuevo en 15 minutos.' },
});

const router = express.Router();

/**
 * @openapi
 * /api/auth/google:
 *   post:
 *     summary: Login con Google OAuth (crea Usuario automáticamente si Socio existe)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - idToken
 *               - clubId
 *             properties:
 *               idToken:
 *                 type: string
 *                 description: Token de autenticación de Google
 *               clubId:
 *                 type: string
 *                 description: ID del club al que pertenece el socio
 *     responses:
 *       200:
 *         description: Login exitoso (nuevo o existente)
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
 *       400:
 *         description: Falta clubId
 *       403:
 *         description: Email no está registrado como socio en el club
 *       401:
 *         description: Token de Google inválido
 */
router.post('/google', googleLogin);
router.get('/google/callback', googleCallback);

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     summary: Registrar un nuevo usuario con email y contraseña
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - clubId
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *               nombre:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, secretary, socio]
 *                 default: secretary
 *               clubId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Usuario registrado exitosamente
 *       400:
 *         description: Error en los datos enviados o usuario ya existe
 */
router.post('/register', protect, authorize(PERMISOS.USUARIOS_WRITE), register);

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Iniciar sesión con email y contraseña
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, format: password }
 *     responses:
 *       200: { description: Login exitoso }
 *       400: { description: Credenciales inválidas }
 */
router.post('/login', loginLimiter, login);

/**
 * @openapi
 * /api/auth/password:
 *   put:
 *     summary: Cambiar contraseña del usuario autenticado
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword: { type: string, format: password }
 *               newPassword: { type: string, format: password }
 *     responses:
 *       200: { description: Contraseña actualizada correctamente }
 *       400: { description: Error en los datos enviados }
 */
router.put('/password', protect, changePassword);

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     summary: Cerrar sesión (invalidar token)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 */
router.post('/logout', protect, logout);
router.put('/push-token', protect, registerPushToken);
router.get('/staff', protect, authorize(PERMISOS.HORARIOS_READ), getStaffHandler);

export default router;