import express from 'express';
import { createMovimientoHandler } from './handlers/createMovimiento.handler.js';
import { deleteMovimientoHandler } from './handlers/deleteMovimiento.handler.js';
import { getMovimientosHandler } from './handlers/getMovimientos.handler.js';
import { updateMovimientoHandler } from './handlers/updateMovimiento.handler.js';
import { protect, authorize } from '../../middleware/auth.js';
import { PERMISOS } from '../../constants/permisos.js';

const router = express.Router();

router.get('/', protect, authorize(PERMISOS.MOVIMIENTOS_READ), getMovimientosHandler);
router.post('/', protect, authorize(PERMISOS.MOVIMIENTOS_WRITE), createMovimientoHandler);
router.put('/:id', protect, authorize(PERMISOS.MOVIMIENTOS_WRITE), updateMovimientoHandler);
router.delete('/:id', protect, authorize(PERMISOS.MOVIMIENTOS_DELETE), deleteMovimientoHandler);

export default router;
