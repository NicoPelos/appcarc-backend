import express from 'express';
import { protect, authorize } from '../../middleware/auth.js';
import { PERMISOS } from '../../constants/permisos.js';
import { crearPreferenciaCobroMercadoPagoHandler } from './handlers/crearPreferenciaCobroMercadoPago.handler.js';

const router = express.Router();

router.post('/mercadopago/preferencia-cobro', protect, authorize(PERMISOS.COBROS_WRITE), crearPreferenciaCobroMercadoPagoHandler);

export default router;
