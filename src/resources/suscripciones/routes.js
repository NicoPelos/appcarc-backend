import express from 'express';
import { protect, authorize } from '../../middleware/auth.js';
import { PERMISOS } from '../../constants/permisos.js';
import { getSuscripcionesHandler } from './handlers/getSuscripciones.handler.js';
import { createSuscripcionHandler } from './handlers/createSuscripcion.handler.js';
import { closeSuscripcionHandler } from './handlers/closeSuscripcion.handler.js';
import { deleteSuscripcionHandler } from './handlers/deleteSuscripcion.handler.js';

const router = express.Router();

router.get('/', protect, authorize(PERMISOS.SUSCRIPCIONES_READ), getSuscripcionesHandler);
router.post('/', protect, authorize(PERMISOS.SUSCRIPCIONES_WRITE), createSuscripcionHandler);
router.put('/:id/cerrar', protect, authorize(PERMISOS.SUSCRIPCIONES_CLOSE), closeSuscripcionHandler);
router.delete('/:id', protect, authorize(PERMISOS.SUSCRIPCIONES_DELETE), deleteSuscripcionHandler);

export default router;
