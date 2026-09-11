import express from 'express';
import { protect, authorize } from '../../middleware/auth.js';
import { PERMISOS } from '../../constants/permisos.js';
import { crearEventoHandler } from './handlers/crearEvento.handler.js';
import { getEventosHandler } from './handlers/getEventos.handler.js';
import { getEventoHandler } from './handlers/getEvento.handler.js';
import { updateEventoHandler } from './handlers/updateEvento.handler.js';
import { cerrarEventoHandler } from './handlers/cerrarEvento.handler.js';

const router = express.Router();

router.get('/', protect, authorize(PERMISOS.EVENTOS_READ), getEventosHandler);
router.post('/', protect, authorize(PERMISOS.EVENTOS_WRITE), crearEventoHandler);
router.get('/:id', protect, authorize(PERMISOS.EVENTOS_READ), getEventoHandler);
router.put('/:id', protect, authorize(PERMISOS.EVENTOS_WRITE), updateEventoHandler);
router.post('/:id/cerrar', protect, authorize(PERMISOS.EVENTOS_WRITE), cerrarEventoHandler);

export default router;
