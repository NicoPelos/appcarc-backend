import express from 'express';
import { protect } from '../../middleware/auth.js';
import { registrarPuntajeHandler } from './handlers/registrarPuntaje.handler.js';
import { getPodioHandler } from './handlers/getPodio.handler.js';

const router = express.Router();

// Sin `authorize`: cualquier usuario logueado del club puede jugar y
// aparecer en el podio, sin importar su rol (mismo criterio que
// /socios/me/profile o /notificaciones/me).
router.post('/puntaje', protect, registrarPuntajeHandler);
router.get('/podio', protect, getPodioHandler);

export default router;
