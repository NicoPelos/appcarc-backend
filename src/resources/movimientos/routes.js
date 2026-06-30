import express from 'express';
import { createMovimientoHandler } from './handlers/createMovimiento.handler.js';
import { deleteMovimientoHandler } from './handlers/deleteMovimiento.handler.js';
import { getMovimientosHandler } from './handlers/getMovimientos.handler.js';
import { updateMovimientoHandler } from './handlers/updateMovimiento.handler.js';
import { protect, authorize } from '../../middleware/auth.js';

const router = express.Router();

router.get('/', protect, authorize('admin', 'autoridad', 'secretaria'), getMovimientosHandler);
router.post('/', protect, authorize('admin', 'secretaria'), createMovimientoHandler);
router.put('/:id', protect, authorize('admin', 'secretaria'), updateMovimientoHandler);
router.delete('/:id', protect, authorize('admin', 'secretaria'), deleteMovimientoHandler);

export default router;
