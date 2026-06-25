import express from 'express';
import { protect, authorize } from '../../middleware/auth.js';
import { getPreciosHandler } from './handlers/getPrecios.handler.js';
import { createPrecioHandler } from './handlers/createPrecio.handler.js';
import { updatePrecioHandler } from './handlers/updatePrecio.handler.js';
import { deletePrecioHandler } from './handlers/deletePrecio.handler.js';

const router = express.Router();

router.get('/', protect, authorize('admin', 'secretary'), getPreciosHandler);
router.post('/', protect, authorize('admin'), createPrecioHandler);
router.put('/:id', protect, authorize('admin'), updatePrecioHandler);
router.delete('/:id', protect, authorize('admin'), deletePrecioHandler);

export default router;
