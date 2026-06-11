import express from 'express';
import { googleLogin, register, login, logout, changePassword } from './handlers/auth.handler.js';
import { protect } from '../../middleware/auth.js';

const router = express.Router();

/**
 * @openapi
 * /api/auth/google:
 *   post:
 *     summary: Login con Google Identity Services
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               idToken:
 *                 type: string
 */
router.post('/google', googleLogin);

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
 *                 enum: [admin, secretary, viewer, socio]
 *                 default: secretary
 *               clubId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Usuario registrado exitosamente
 *       400:
 *         description: Error en los datos enviados o usuario ya existe
 */
router.post('/register', register);

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
router.post('/login', login);

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

export default router;