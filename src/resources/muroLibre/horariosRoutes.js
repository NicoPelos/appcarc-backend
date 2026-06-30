import express from 'express';
import { protect, authorize } from '../../middleware/auth.js';
import { getHorariosHandler } from './handlers/getHorarios.handler.js';
import { createHorarioHandler } from './handlers/createHorario.handler.js';
import { updateHorarioHandler } from './handlers/updateHorario.handler.js';
import { deleteHorarioHandler } from './handlers/deleteHorario.handler.js';
import { getEtiquetasHandler } from './handlers/getEtiquetas.handler.js';
import { createEtiquetaHandler } from './handlers/createEtiqueta.handler.js';
import { deleteEtiquetaHandler } from './handlers/deleteEtiqueta.handler.js';
import { getDeudaStaffHandler } from './handlers/getDeudaStaff.handler.js';

const router = express.Router();

// Deuda del staff (antes de /:id para no colisionar)
router.get('/deuda', protect, authorize('admin', 'autoridad', 'secretaria'), getDeudaStaffHandler);

// Etiquetas
router.get('/etiquetas', protect, authorize('admin', 'secretaria'), getEtiquetasHandler);
router.post('/etiquetas', protect, authorize('admin', 'secretaria'), createEtiquetaHandler);
router.delete('/etiquetas/:id', protect, authorize('admin', 'secretaria'), deleteEtiquetaHandler);

// Horarios
router.get('/', protect, authorize('admin', 'autoridad', 'secretaria', 'profesor', 'palestrero', 'limpieza', 'arreglos', 'colaborador'), getHorariosHandler);
router.post('/', protect, authorize('admin', 'secretaria', 'palestrero', 'limpieza', 'arreglos'), createHorarioHandler);
router.put('/:id', protect, authorize('admin', 'secretaria', 'palestrero', 'limpieza', 'arreglos'), updateHorarioHandler);
router.delete('/:id', protect, authorize('admin', 'secretaria', 'palestrero', 'limpieza', 'arreglos'), deleteHorarioHandler);

export default router;
