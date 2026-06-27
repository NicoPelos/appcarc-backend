import express from 'express';
import { protect, authorize } from '../../middleware/auth.js';
import { getEtiquetasHandler } from './handlers/getEtiquetas.handler.js';
import { createEtiquetaHandler } from './handlers/createEtiqueta.handler.js';
import { updateEtiquetaHandler } from './handlers/updateEtiqueta.handler.js';
import { deleteEtiquetaHandler } from './handlers/deleteEtiqueta.handler.js';

const router = express.Router();

router.get('/', protect, authorize('admin', 'secretary'), getEtiquetasHandler);
router.post('/', protect, authorize('admin'), createEtiquetaHandler);
router.put('/:id', protect, authorize('admin'), updateEtiquetaHandler);
router.delete('/:id', protect, authorize('admin'), deleteEtiquetaHandler);

export default router;
