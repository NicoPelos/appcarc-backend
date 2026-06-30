import express from 'express';
import { protect, authorize } from '../../middleware/auth.js';
import { getAsistenciasHandler } from './handlers/getAsistencias.handler.js';
import { createAsistenciaEscuelitaHandler } from './handlers/createAsistenciaEscuelita.handler.js';
import { updateAsistenciaHandler } from './handlers/updateAsistencia.handler.js';
import { deleteAsistenciaHandler } from './handlers/deleteAsistencia.handler.js';

const router = express.Router();

router.get('/', protect, authorize('admin', 'autoridad', 'secretaria', 'profesor', 'colaborador'), getAsistenciasHandler);
router.post('/escuelita', protect, authorize('admin', 'secretaria', 'profesor', 'colaborador'), createAsistenciaEscuelitaHandler);
router.put('/:id', protect, authorize('admin', 'secretaria'), updateAsistenciaHandler);
router.delete('/:id', protect, authorize('admin', 'secretaria'), deleteAsistenciaHandler);

export default router;
