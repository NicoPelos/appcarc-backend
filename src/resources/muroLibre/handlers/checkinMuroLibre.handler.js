import { BusinessError, registrarMuroLibre } from '../services/registrarMuroLibre.service.js';
import { resolveSocioFromQrTokenOrDni, findActiveSocioById, getPaseMuroLibreVigente } from '../../socios/services/socioQr.service.js';
import { notifyRoles, notifySocio } from '../../../services/pushNotification.service.js';
import { tienePermiso } from '../../../services/permisosCache.js';
import { PERMISOS } from '../../../constants/permisos.js';

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
 *               fecha:
 *                 type: string
 *                 format: date-time
 *                 description: Fecha del check-in (default ahora) — para cargar asistencia de un día anterior
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
    const { token, dni, tipoPase, estadoPago, paymentMethod, enviarComprobanteWp, observaciones, fecha } = req.body;

    const roles = req.user?.roles ?? [];
    const esStaff = roles.includes('superadmin')
      || await tienePermiso(req.user?.clubId, roles, PERMISOS.MURO_LIBRE_CHECKIN);

    // Autoescaneo del QR de pared (appCARC-mobile#60): quien llama solo tiene
    // el permiso "propio", no el de staff — se ignora cualquier token/dni que
    // venga en el body y se fuerza la identidad a la del usuario logueado.
    // También se auto-detecta si tiene pase mensual vigente (en vez de asumir
    // "diario" y crear una deuda que ya está cubierta, ver issue #81) en vez
    // de tomar tipoPase/estadoPago del body.
    let socio;
    let method;
    let tipoPaseFinal = tipoPase;
    let estadoPagoFinal = estadoPago;

    if (esStaff) {
      ({ socio, method } = await resolveSocioFromQrTokenOrDni({
        token,
        dni,
        clubId: req.user?.clubId,
        missingMessage: 'Se requiere token QR o DNI para identificar el socio',
      }));
    } else {
      if (!req.user?.socioId) {
        throw new BusinessError('Tu usuario no tiene un socio asociado', 403);
      }
      socio = await findActiveSocioById(req.user.socioId, req.user.clubId);
      if (!socio) {
        throw new BusinessError('Socio no encontrado o inactivo', 404);
      }
      method = 'SELF';

      // Solo hace falta saber si está suscripto al pase mensual — si lo está
      // pero no pagó el período actual, registrarMuroLibre ya se encarga de
      // avisarlo (advertencia PASE_MENSUAL_IMPAGO) sin bloquear el check-in.
      const pase = await getPaseMuroLibreVigente(socio._id, req.user.clubId);
      tipoPaseFinal = pase.suscripto ? 'mensual' : 'diario';
      estadoPagoFinal = 'pendiente';
    }

    const advertencias = [];
    const result = await registrarMuroLibre({
      clubId: req.user?.clubId,
      user: req.user,
      body: {
        socioId: String(socio._id),
        tipoPase: tipoPaseFinal,
        estadoPago: estadoPagoFinal,
        paymentMethod: esStaff ? paymentMethod : undefined,
        enviarComprobanteWp,
        observaciones,
        fecha,
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
          data: { tipo: 'advertencia_checkin', asistenciaId: String(result.registro._id), url: 'carc://advertencias?tipo=muro_libre' },
        }),
        notifySocio(socio._id, {
          title: '⚠️ Advertencias en tu ingreso',
          body: resumen,
          data: { tipo: 'advertencia_socio', url: 'carc://cuotas' },
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
