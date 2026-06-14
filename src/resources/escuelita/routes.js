import express from 'express';
import { protect, authorize } from '../../middleware/auth.js';
import { getAlumnosHandler } from './handlers/getAlumnos.handler.js';
import { createAlumnoHandler } from './handlers/createAlumno.handler.js';
import { updateAlumnoHandler } from './handlers/updateAlumno.handler.js';
import { deleteAlumnoHandler } from './handlers/deleteAlumno.handler.js';

const router = express.Router();

router.get('/', protect, authorize('admin', 'secretary', 'socio'), getAlumnosHandler);
router.post('/', protect, authorize('admin', 'secretary'), createAlumnoHandler);
router.put('/:id', protect, authorize('admin', 'secretary'), updateAlumnoHandler);
router.delete('/:id', protect, authorize('admin', 'secretary'), deleteAlumnoHandler);

export default router;
