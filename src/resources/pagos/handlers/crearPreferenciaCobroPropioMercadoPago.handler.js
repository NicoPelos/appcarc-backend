import { BusinessError, crearPreferenciaCobroPropioMercadoPago } from '../services/crearPreferenciaCobroPropioMercadoPago.service.js';

/**
 * @openapi
 * /api/pagos/mercadopago/preferencia-propia:
 *   post:
 *     summary: Generar un link de pago de Mercado Pago para el usuario autenticado y/o sus vínculos
 *     description: >
 *       El usuario elige QUÉ ítems pendientes pagar (períodos de cuota, un
 *       cargo puntual, visitas de Muro Libre) de su propio perfil y/o de sus
 *       hijos vinculados (ver VinculoFamiliar), en un mismo link — pero nunca
 *       el monto: los importes se resuelven siempre en el servidor (precio
 *       vigente o snapshot ya guardado), ignorando cualquier "amount" que
 *       pueda venir en el body. Cada item indica su propio socioId, validado
 *       contra los perfiles realmente accesibles del usuario.
 *     tags: [Pagos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [items]
 *             properties:
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [socioId]
 *                   properties:
 *                     socioId: { type: string }
 *                     suscripcionId: { type: string }
 *                     periodos:
 *                       type: array
 *                       items: { type: string }
 *                     cargoPuntualId: { type: string }
 *                     muroLibrePendiente: { type: boolean }
 *     responses:
 *       201:
 *         description: Preferencia creada
 *       400:
 *         description: Datos inválidos o club sin Mercado Pago configurado
 *       401:
 *         description: El usuario autenticado no tiene ningún perfil de socio asociado
 *       403:
 *         description: Un item indica un socioId que no es un perfil accesible del usuario
 *       404:
 *         description: Ítem no encontrado para el socio
 *       409:
 *         description: El ítem ya está pagado
 *       502:
 *         description: Error comunicándose con Mercado Pago
 */
export const crearPreferenciaCobroPropioMercadoPagoHandler = async (req, res) => {
  try {
    const result = await crearPreferenciaCobroPropioMercadoPago({
      clubId: req.user?.clubId,
      requestedByUserId: req.user?.id,
      requestedByEmail: req.user?.email,
      items: req.body?.items,
    });

    res.status(201).json(result);
  } catch (error) {
    if (error instanceof BusinessError) {
      return res.status(error.status).json({ message: error.message });
    }

    console.error('Error generando link de pago propio de Mercado Pago:', error);
    res.status(500).json({ message: 'Error al generar el link de pago' });
  }
};

export default crearPreferenciaCobroPropioMercadoPagoHandler;
