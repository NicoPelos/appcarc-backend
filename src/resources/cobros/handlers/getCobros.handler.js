import Cobro from '../models/Cobro.js';

/**
 * @openapi
 * components:
 *   schemas:
 *     CobroResponse:
 *       type: object
 *       properties:
 *         page:
 *           type: integer
 *           description: Número de página actual
 *         limit:
 *           type: integer
 *           description: Cantidad de ítems por página
 *         total:
 *           type: integer
 *           description: Total de cobros encontrados
 *         totalPages:
 *           type: integer
 *           description: Total de páginas disponibles
 *         cobros:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Cobro'
 *     Cobro:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: ID del cobro
 *         clubId:
 *           type: string
 *           description: ID del club asociado
 *         responsable:
 *           type: string
 *           description: Responsable del cobro (nombre o email)
 *         paymentMethod:
 *           type: string
 *           enum: [Efectivo, Transferencia]
 *         totalAmount:
 *           type: number
 *           description: Monto total del cobro
 *         description:
 *           type: string
 *           nullable: true
 *         date:
 *           type: string
 *           format: date-time
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/CobroItem'
 *         createdAt:
 *           type: string
 *           format: date-time
 *     CobroItem:
 *       type: object
 *       properties:
 *         socioId:
 *           type: string
 *         tipo:
 *           type: string
 *           enum: [social, escuelita]
 *         periodo:
 *           type: string
 *           pattern: '^\d{4}-(0[1-9]|1[0-2])$'
 *           example: "2026-06"
 *         amount:
 *           type: number
 *         precioSugeridoSnapshot:
 *           type: number
 *           nullable: true
 *         precioCodigo:
 *           type: string
 *         description:
 *           type: string
 */

export const getCobrosHandler = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const filter = { clubId: req.user?.clubId, active: true };

    const [total, cobros] = await Promise.all([
      Cobro.countDocuments(filter),
      Cobro.find(filter)
        .sort({ date: -1, createdAt: -1 })
        .skip((pageNumber - 1) * pageSize)
        .limit(pageSize),
    ]);

    res.status(200).json({
      page: pageNumber,
      limit: pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      cobros,
    });
  } catch (error) {
    console.error('Error obteniendo cobros:', error);
    res.status(500).json({ message: 'Error al obtener cobros' });
  }
};

export default getCobrosHandler;
