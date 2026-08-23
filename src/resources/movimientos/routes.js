import express from 'express';
import { createMovimientoHandler } from './handlers/createMovimiento.handler.js';
import { deleteMovimientoHandler } from './handlers/deleteMovimiento.handler.js';
import { getMovimientosHandler } from './handlers/getMovimientos.handler.js';
import { updateMovimientoHandler } from './handlers/updateMovimiento.handler.js';
import { upload, handleUploadError, uploadComprobanteHandler } from './handlers/uploadComprobante.handler.js';
import { deleteComprobanteHandler } from './handlers/deleteComprobante.handler.js';
import { mercadopagoCandidatosHandler } from './handlers/mercadopagoCandidatos.handler.js';
import { vincularMercadopagoHandler, desvincularMercadopagoHandler } from './handlers/mercadopagoVinculo.handler.js';
import { protect, authorize } from '../../middleware/auth.js';
import { PERMISOS } from '../../constants/permisos.js';

const router = express.Router();

router.get('/', protect, authorize(PERMISOS.MOVIMIENTOS_READ), getMovimientosHandler);
router.post('/', protect, authorize(PERMISOS.MOVIMIENTOS_WRITE), createMovimientoHandler);
router.put('/:id', protect, authorize(PERMISOS.MOVIMIENTOS_WRITE), updateMovimientoHandler);
router.delete('/:id', protect, authorize(PERMISOS.MOVIMIENTOS_DELETE), deleteMovimientoHandler);
router.post('/:id/comprobantes', protect, authorize(PERMISOS.MOVIMIENTOS_WRITE), upload.single('foto'), handleUploadError, uploadComprobanteHandler);
router.delete('/:id/comprobantes/:comprobanteId', protect, authorize(PERMISOS.MOVIMIENTOS_WRITE), deleteComprobanteHandler);
router.get('/:id/mercadopago-candidatos', protect, authorize(PERMISOS.MOVIMIENTOS_READ), mercadopagoCandidatosHandler);
router.post('/:id/mercadopago-vinculo', protect, authorize(PERMISOS.MOVIMIENTOS_WRITE), vincularMercadopagoHandler);
router.delete('/:id/mercadopago-vinculo/:paymentId', protect, authorize(PERMISOS.MOVIMIENTOS_WRITE), desvincularMercadopagoHandler);

export default router;
