import { BusinessError, registrarCobro } from '../services/registrarCobro.service.js';
import { sendPushNotification } from '../../../services/pushNotification.service.js';
import User from '../../usuarios/models/User.js';
import Etiqueta from '../../etiquetas/models/Etiqueta.js';
import { logAudit } from '../../audit/services/audit.service.js';

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

const formatPeriodo = (periodo) => {
  const [year, month] = periodo.split('-');
  return `${MESES[parseInt(month, 10) - 1]} ${year}`;
};

const buildCuotaBody = (cuotas, etiquetaNombreById) => {
  const label = (c) => (etiquetaNombreById.get(String(c.etiquetaId)) || 'cuota').toLowerCase();
  if (cuotas.length === 1) {
    const c = cuotas[0];
    return `Se registró el pago de tu ${label(c)} para ${formatPeriodo(c.periodo)}`;
  }
  const lista = cuotas.map((c) => `${label(c)} ${formatPeriodo(c.periodo)}`).join(', ');
  return `Se registraron ${cuotas.length} pagos: ${lista}`;
};

/**
 * @openapi
 * components:
 *   schemas:
 *     CobroRequest:
 *       type: object
 *       required:
 *         - paymentMethod
 *         - items
 *       properties:
 *         date:
 *           type: string
 *           format: date-time
 *           description: Fecha del cobro. Si no se envía, usa la fecha actual.
 *         paymentMethod:
 *           type: string
 *           enum: [Efectivo, Transferencia]
 *           description: Forma de pago (Efectivo o Transferencia)
 *         responsable:
 *           type: string
 *           description: Responsable del cobro. Si no se envía, usa el email del usuario logueado.
 *         description:
 *           type: string
 *           description: Descripción opcional del cobro
 *         items:
 *           type: array
 *           minItems: 1
 *           items:
 *             $ref: '#/components/schemas/CobroItemRequest'
 *     CobroItemRequest:
 *       type: object
 *       required:
 *         - socioId
 *         - suscripcionId
 *       properties:
 *         socioId:
 *           type: string
 *           description: ID del socio al que corresponde la cuota.
 *         suscripcionId:
 *           type: string
 *           description: ID de la suscripción del socio (determina la etiqueta/precio).
 *         periodo:
 *           type: string
 *           pattern: '^\d{4}-(0[1-9]|1[0-2])$'
 *           example: "2026-06"
 *         periodoDesde:
 *           type: string
 *           pattern: '^\d{4}-(0[1-9]|1[0-2])$'
 *           example: "2026-06"
 *         periodos:
 *           type: array
 *           items:
 *             type: string
 *             pattern: '^\d{4}-(0[1-9]|1[0-2])$'
 *         cantidad:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         amount:
 *           type: number
 *           minimum: 0
 *           description: Importe unitario confirmado. Si no se envía, se usa el precio vigente.
 *         precioSugeridoSnapshot:
 *           type: number
 *           minimum: 0
 *         description:
 *           type: string
 */
export const createCobroHandler = async (req, res) => {
  try {
    const result = await registrarCobro({
      clubId: req.user?.clubId,
      user: req.user,
      body: req.body,
    });

    res.status(201).json(result);

    logAudit({ clubId: req.user?.clubId, req, action: 'CREATE', resource: 'Cobro', resourceId: result.cobro._id, before: null, after: { cobro: result.cobro, cuotas: result.cuotas } });

    const cuotasBySocioId = result.cuotas.reduce((acc, cuota) => {
      const key = cuota.socioId.toString();
      if (!acc[key]) acc[key] = [];
      acc[key].push(cuota);
      return acc;
    }, {});

    const etiquetaIds = [...new Set(result.cuotas.map((c) => c.etiquetaId).filter(Boolean).map(String))];
    const etiquetas = etiquetaIds.length
      ? await Etiqueta.find({ _id: { $in: etiquetaIds } }, 'nombre').lean()
      : [];
    const etiquetaNombreById = new Map(etiquetas.map((e) => [String(e._id), e.nombre]));

    const socioIds = Object.keys(cuotasBySocioId);
    const users = await User.find({
      socioId: { $in: socioIds },
      active: true,
      expoPushToken: { $ne: null },
    }).select('socioId expoPushToken').lean();

    for (const user of users) {
      const cuotas = cuotasBySocioId[user.socioId];
      if (!cuotas?.length) continue;
      sendPushNotification([user.expoPushToken], {
        title: 'Pago registrado',
        body: buildCuotaBody(cuotas, etiquetaNombreById),
        data: { tipo: 'cobro_registrado', cobroId: result.cobro._id.toString() },
      }).catch((err) => console.error('Error enviando push de cobro:', err));
    }
  } catch (error) {
    if (error instanceof BusinessError) {
      return res.status(error.status).json({ message: error.message });
    }

    console.error('Error registrando cobro:', error);
    res.status(500).json({ message: 'Error al registrar cobro' });
  }
};

export default createCobroHandler;
