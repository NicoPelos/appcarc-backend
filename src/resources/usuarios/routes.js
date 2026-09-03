import express from 'express';
import rateLimit from 'express-rate-limit';
import { googleLogin, googleCallback, register, login, selectProfile, getProfiles, switchProfile, refresh, logout, changePassword, registerPushToken } from './handlers/auth.handler.js';
import { protect, authorize } from '../../middleware/auth.js';
import { PERMISOS } from '../../constants/permisos.js';

// No-op en test: los tests de integración (supertest) pegan contra este mismo
// Express real, todos desde el mismo origen — max:10 cada 15min se agota
// enseguida corriendo la suite completa y algunos tests reciben un 429 real
// en vez del código que están probando (mismo criterio que apiLimiter en
// index.js, appcarc-backend#143 — este limiter quedó afuera de ese fix por
// vivir en otro archivo).
const loginLimiter = process.env.NODE_ENV === 'test'
  ? (req, res, next) => next()
  : rateLimit({
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
 * /api/auth/select-profile:
 *   post:
 *     summary: Elegir con qué perfil entrar (el propio o un hijo vinculado) tras un login con múltiples perfiles
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - selectToken
 *               - socioId
 *             properties:
 *               selectToken: { type: string }
 *               socioId: { type: string }
 *     responses:
 *       200: { description: Login exitoso, token final scoped al perfil elegido }
 *       401: { description: selectToken inválido o expirado }
 *       403: { description: No tenés acceso a ese perfil }
 */
router.post('/select-profile', loginLimiter, selectProfile);

/**
 * @openapi
 * /api/auth/profiles:
 *   get:
 *     summary: Listar los perfiles disponibles del usuario logueado (el propio + hijos vinculados)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Lista de perfiles }
 */
router.get('/profiles', protect, getProfiles);

/**
 * @openapi
 * /api/auth/switch-profile:
 *   post:
 *     summary: Cambiar el perfil activo de la sesión (sin volver a pedir contraseña)
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
 *               - socioId
 *             properties:
 *               socioId: { type: string }
 *     responses:
 *       200: { description: Login exitoso, token final scoped al perfil elegido }
 *       403: { description: No tenés acceso a ese perfil }
 */
router.post('/switch-profile', protect, switchProfile);

/**
 * @openapi
 * /api/auth/refresh:
 *   post:
 *     summary: Renovar el access token a partir de un refresh token vigente, sin pedir contraseña de nuevo
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200: { description: Access token renovado (incluye un refreshToken nuevo, rotado) }
 *       400: { description: Falta refreshToken }
 *       401: { description: refreshToken inválido, vencido o ya usado }
 */
router.post('/refresh', loginLimiter, refresh);

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
 *     summary: Cerrar sesión (invalidar access token y, si se manda, el refresh token)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken: { type: string }
 */
router.post('/logout', protect, logout);
router.put('/push-token', protect, registerPushToken);

export default router;