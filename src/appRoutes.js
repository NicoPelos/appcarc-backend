import express from 'express';
import authRoutes from './resources/usuarios/routes.js';
import socioRoutes from './resources/socios/routes.js';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/socios', socioRoutes);

export default router;
