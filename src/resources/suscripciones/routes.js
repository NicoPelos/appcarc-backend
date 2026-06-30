import express from 'express';
import { protect, authorize } from '../../middleware/auth.js';
import { getSuscripcionesHandler } from './handlers/getSuscripciones.handler.js';
import { createSuscripcionHandler } from './handlers/createSuscripcion.handler.js';
import { closeSuscripcionHandler } from './handlers/closeSuscripcion.handler.js';
import { deleteSuscripcionHandler } from './handlers/deleteSuscripcion.handler.js';

const router = express.Router();

router.get('/', protect, authorize('admin', 'autoridad', 'secretaria'), getSuscripcionesHandler);
router.post('/', protect, authorize('admin', 'secretaria'), createSuscripcionHandler);
router.put('/:id/cerrar', protect, authorize('admin', 'secretaria'), closeSuscripcionHandler);
router.delete('/:id', protect, authorize('admin'), deleteSuscripcionHandler);

export default router;
