import express from 'express';
import { protect, authorize } from '../../middleware/auth.js';
import { getAsistenciasHandler } from './handlers/getAsistencias.handler.js';
import { createAsistenciaEscuelitaHandler } from './handlers/createAsistenciaEscuelita.handler.js';

const router = express.Router();

router.get('/', protect, authorize('admin', 'secretary', 'socio'), getAsistenciasHandler);
router.post('/escuelita', protect, authorize('admin', 'secretary'), createAsistenciaEscuelitaHandler);

export default router;
