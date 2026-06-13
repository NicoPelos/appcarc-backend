import { BusinessError, registrarCobro } from '../services/registrarCobro.service.js';

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
 *         - tipo
 *       properties:
 *         socioId:
 *           type: string
 *           description: ID del socio al que corresponde la cuota.
 *         tipo:
 *           type: string
 *           enum: [social, escuelita]
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
  } catch (error) {
    if (error instanceof BusinessError) {
      return res.status(error.status).json({ message: error.message });
    }

    console.error('Error registrando cobro:', error);
    res.status(500).json({ message: 'Error al registrar cobro' });
  }
};

export default createCobroHandler;
