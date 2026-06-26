import express from 'express';
import { protect, authorize } from '../../middleware/auth.js';
import { getHorariosHandler } from './handlers/getHorarios.handler.js';
import { createHorarioHandler } from './handlers/createHorario.handler.js';
import { updateHorarioHandler } from './handlers/updateHorario.handler.js';
import { deleteHorarioHandler } from './handlers/deleteHorario.handler.js';
import { getEtiquetasHandler } from './handlers/getEtiquetas.handler.js';
import { createEtiquetaHandler } from './handlers/createEtiqueta.handler.js';
import { deleteEtiquetaHandler } from './handlers/deleteEtiqueta.handler.js';

const router = express.Router();

// Etiquetas (deben ir antes de /:id para no colisionar)
router.get('/etiquetas', protect, authorize('admin', 'secretary'), getEtiquetasHandler);
router.post('/etiquetas', protect, authorize('admin', 'secretary'), createEtiquetaHandler);
router.delete('/etiquetas/:id', protect, authorize('admin', 'secretary'), deleteEtiquetaHandler);

// Horarios
router.get('/', protect, authorize('admin', 'secretary'), getHorariosHandler);
router.post('/', protect, authorize('admin', 'secretary'), createHorarioHandler);
router.put('/:id', protect, authorize('admin', 'secretary'), updateHorarioHandler);
router.delete('/:id', protect, authorize('admin', 'secretary'), deleteHorarioHandler);

export default router;
