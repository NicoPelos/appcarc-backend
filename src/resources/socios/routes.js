import express from 'express';
import { createSocioHandler } from './handlers/createSocio.handler.js';
import { getSociosHandler } from './handlers/getSocios.handler.js';
import { getSocioByIdHandler } from './handlers/getSocioById.handler.js';
import { updateSocioHandler } from './handlers/updateSocio.handler.js';
import { deleteSocioHandler } from './handlers/deleteSocio.handler.js';
import { restoreSocioHandler } from './handlers/restoreSocio.handler.js';
import { getSocioQrHandler } from './handlers/getSocioQr.handler.js';
import { verifySocioQrHandler } from './handlers/verifySocioQr.handler.js';
import { protect, authorize } from '../../middleware/auth.js';

const router = express.Router();

/**
 * @openapi
 * /api/socios:
 *   get:
 *     summary: Obtener lista de socios
 *     tags: [Socios]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de socios disponible
 */
router.get('/', protect, authorize('admin', 'secretary', 'viewer'), getSociosHandler);

/**
 * @openapi
 * /api/socios:
 *   post:
 *     summary: Crear un nuevo socio
 *     tags: [Socios]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               socioNumber:
 *                 type: string
 *               sexo:
 *                 type: string
 *                 enum: [Masculino, Femenino, Otro]
 *               apellido:
 *                 type: string
 *               nombre:
 *                 type: string
 *               dni:
 *                 type: string
 *               fechaNacimiento:
 *                 type: string
 *                 format: date
 *               direccionActual:
 *                 type: string
 *               domicilioCompleto:
 *                 type: string
 *               calle:
 *                 type: string
 *               altura:
 *                 type: string
 *               ciudad:
 *                 type: string
 *               nacionalidad:
 *                 type: string
 *               telefonoEmergencia:
 *                 type: string
 *               observaciones:
 *                 type: string
 *               fechaDeAsociado:
 *                 type: string
 *                 format: date
 *               estado:
 *                 type: string
 *                 enum: [Activo, Adherente, Baja]
 *               condicionObs:
 *                 type: string
 *               correoElectronico:
 *                 type: string
 *                 format: email
 *               telefono:
 *                 type: string
 *     responses:
 *       201:
 *         description: Socio creado exitosamente
 */
router.post('/', protect, authorize('admin', 'secretary'), createSocioHandler);
router.get('/:id/qr', protect, authorize('admin', 'secretary'), getSocioQrHandler);
router.post('/verify', protect, authorize('admin', 'secretary', 'viewer'), verifySocioQrHandler);

router.get('/:id', protect, authorize('admin', 'secretary', 'viewer'), getSocioByIdHandler);

/**
 * @openapi
 * /api/socios/{id}:
 *   put:
 *     summary: Actualizar datos de un socio
 *     tags: [Socios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               apellido:
 *                 type: string
 *               nombre:
 *                 type: string
 *               sexo:
 *                 type: string
 *               direccionActual:
 *                 type: string
 *               ciudad:
 *                 type: string
 *               nacionalidad:
 *                 type: string
 *               fechaDeAsociado:
 *                 type: string
 *                 format: date
 *               estado:
 *                 type: string
 *               condicionObs:
 *                 type: string
 *               correoElectronico:
 *                 type: string
 *                 format: email
 *               telefono:
 *                 type: string
 *     responses:
 *       200:
 *         description: Socio actualizado exitosamente
 */
router.put('/:id', protect, authorize('admin', 'secretary'), updateSocioHandler);
router.put('/:id/restore', protect, authorize('admin', 'secretary'), restoreSocioHandler);

/**
 * @openapi
 * /api/socios/{id}/restore:
 *   put:
 *     summary: Restaurar socio desde la papelera
 *     tags: [Socios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Socio restaurado exitosamente
 */

/**
 * @openapi
 * /api/socios/{id}:
 *   delete:
 *     summary: Desactivar un socio
 *     tags: [Socios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Socio desactivado con éxito
 */
router.delete('/:id', protect, authorize('admin'), deleteSocioHandler);

export default router;
