import { BusinessError, registrarMuroLibre } from '../services/registrarMuroLibre.service.js';
import { resolveSocioFromQrTokenOrDni } from '../../socios/services/socioQr.service.js';
import { notifyRoles, notifySocio } from '../../../services/pushNotification.service.js';

/**
 * @openapi
 * /api/muro-libre/checkin:
 *   post:
 *     summary: Registrar check-in en muro libre
 *     tags: [MuroLibre]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tipoPase
 *             properties:
 *               token:
 *                 type: string
 *                 description: Token QR del socio
 *               dni:
 *                 type: string
 *                 description: DNI del socio
 *               tipoPase:
 *                 type: string
 *                 enum: [diario, mensual]
 *                 description: Tipo de pase
 *               estadoPago:
 *                 type: string
 *                 enum: [pagado, pendiente, exento]
 *                 description: Estado de pago
 *               paymentMethod:
 *                 type: string
 *                 enum: [Efectivo, Transferencia]
 *                 description: Forma de pago
 *               enviarComprobanteWp:
 *                 type: boolean
 *                 description: Indica si se debe enviar comprobante por WhatsApp
 *               observaciones:
 *                 type: string
 *                 description: Observaciones adicionales
 *     responses:
 *       201:
 *         description: Check-in registrado exitosamente
 *       400:
 *         description: Error en los datos enviados para el check-in
 *       404:
 *         description: Socio no encontrado
 *       500:
 *         description: Error al registrar check-in
 */

export const checkinMuroLibreHandler = async (req, res) => {
  try {
    const { token, dni, tipoPase, estadoPago, paymentMethod, enviarComprobanteWp, observaciones } = req.body;

    const { socio, method } = await resolveSocioFromQrTokenOrDni({
      token,
      dni,
      clubId: req.user?.clubId,
      missingMessage: 'Se requiere token QR o DNI para identificar el socio',
    });

    const advertencias = [];
    const result = await registrarMuroLibre({
      clubId: req.user?.clubId,
      user: req.user,
      body: {
        socioId: String(socio._id),
        tipoPase,
        estadoPago,
        paymentMethod,
        enviarComprobanteWp,
        observaciones,
      },
      scannedBy: req.user?.id,
      checkinMethod: method,
      advertencias,
    });

    const advertenciasResult = result.advertencias ?? [];
    if (advertenciasResult.length > 0) {
      const nombreCompleto = `${socio.nombre} ${socio.apellido}`;
      const resumen = advertenciasResult.map((a) => a.mensaje).join(' | ');
      Promise.all([
        notifyRoles(req.user?.clubId, ['secretaria'], {
          title: '⚠️ Ingreso con advertencias',
          body: `${nombreCompleto} ingresó a muro libre con ${advertenciasResult.length} advertencia(s): ${resumen}`,
          data: { tipo: 'advertencia_checkin', asistenciaId: String(result.registro._id) },
        }),
        notifySocio(socio._id, {
          title: '⚠️ Advertencias en tu ingreso',
          body: resumen,
          data: { tipo: 'advertencia_socio' },
        }),
      ]).catch((err) => console.error('[Push] Error enviando notificaciones de advertencia:', err.message));
    }

    res.status(201).json({ asistencia: result.registro, movimiento: result.movimiento, socio, advertencias: advertenciasResult });
  } catch (error) {
    if (error instanceof BusinessError || error.status) {
      return res.status(error.status).json({ message: error.message });
    }

    console.error('Error en el checkin de muro libre:', error);
    res.status(500).json({ message: 'Error en el checkin de muro libre' });
  }
};

export default checkinMuroLibreHandler;
