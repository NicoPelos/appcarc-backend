import express from 'express';
import authRoutes from './resources/usuarios/routes.js';
import socioRoutes from './resources/socios/routes.js';
import movimientoRoutes from './resources/movimientos/routes.js';
import cobroRoutes from './resources/cobros/routes.js';
import muroLibreRoutes from './resources/muroLibre/routes.js';
import escuelitaRoutes from './resources/escuelita/routes.js';
import asistenciasRoutes from './resources/asistencias/routes.js';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/socios', socioRoutes);
router.use('/movimientos', movimientoRoutes);
router.use('/cobros', cobroRoutes);
router.use('/muro-libre', muroLibreRoutes);
router.use('/escuelita', escuelitaRoutes);
router.use('/asistencias', asistenciasRoutes);

export default router;
