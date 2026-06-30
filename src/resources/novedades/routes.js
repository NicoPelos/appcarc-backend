import express from 'express';
import { protect, authorize } from '../../middleware/auth.js';
import { getNovedadesHandler } from './handlers/getNovedades.handler.js';
import { createNovedadHandler } from './handlers/createNovedad.handler.js';
import { syncNovedadesHandler } from './handlers/syncNovedades.handler.js';

const router = express.Router();

router.get('/', protect, getNovedadesHandler);
router.post('/', protect, authorize('admin', 'secretaria'), createNovedadHandler);
router.post('/sync', protect, authorize('admin', 'secretaria'), syncNovedadesHandler);

export default router;
