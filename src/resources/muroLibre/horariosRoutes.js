import express from 'express';
import { protect, authorize } from '../../middleware/auth.js';
import { getHorariosHandler } from './handlers/getHorarios.handler.js';
import { createHorarioHandler } from './handlers/createHorario.handler.js';
import { updateHorarioHandler } from './handlers/updateHorario.handler.js';
import { deleteHorarioHandler } from './handlers/deleteHorario.handler.js';

const router = express.Router();

router.get('/', protect, authorize('admin', 'secretary'), getHorariosHandler);
router.post('/', protect, authorize('admin', 'secretary'), createHorarioHandler);
router.put('/:id', protect, authorize('admin', 'secretary'), updateHorarioHandler);
router.delete('/:id', protect, authorize('admin', 'secretary'), deleteHorarioHandler);

export default router;
