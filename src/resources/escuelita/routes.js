import express from 'express';
import { protect, authorize } from '../../middleware/auth.js';
import { PERMISOS } from '../../constants/permisos.js';
import { getAlumnosHandler } from './handlers/getAlumnos.handler.js';
import { createAlumnoHandler } from './handlers/createAlumno.handler.js';
import { updateAlumnoHandler } from './handlers/updateAlumno.handler.js';
import { deleteAlumnoHandler } from './handlers/deleteAlumno.handler.js';
import { purgarAlumnoHandler } from './handlers/purgarAlumno.handler.js';
import { checkinEscuelitaHandler } from './handlers/checkinEscuelita.handler.js';

const router = express.Router();

router.post('/checkin', protect, authorize(PERMISOS.ESCUELITA_CHECKIN), checkinEscuelitaHandler);
router.get('/', protect, authorize(PERMISOS.ESCUELITA_READ), getAlumnosHandler);
router.post('/', protect, authorize(PERMISOS.ESCUELITA_WRITE), createAlumnoHandler);
router.put('/:id', protect, authorize(PERMISOS.ESCUELITA_WRITE), updateAlumnoHandler);
router.delete('/:id', protect, authorize(PERMISOS.ESCUELITA_DELETE), deleteAlumnoHandler);
router.delete('/:id/purgar', protect, authorize(PERMISOS.ESCUELITA_PURGAR), purgarAlumnoHandler);

export default router;
