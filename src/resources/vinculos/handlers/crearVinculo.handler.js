import { crearVinculoFamiliar, BusinessError } from '../services/crearVinculoFamiliar.service.js';
import { logAudit } from '../../audit/services/audit.service.js';

/**
 * @openapi
 * /api/vinculos:
 *   post:
 *     summary: Vincular un socio (hijo) a un usuario tutor (padre/madre), que podrá "entrar como" ese socio
 *     tags: [Vinculos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [hijoSocioId]
 *             properties:
 *               hijoSocioId:
 *                 type: string
 *               padreUserId:
 *                 type: string
 *                 description: Usuario tutor ya existente
 *               padreSocioId:
 *                 type: string
 *                 description: El tutor es socio del club — se usa/crea su cuenta
 *               padreEmail:
 *                 type: string
 *                 description: El tutor no es socio — se busca o crea una cuenta con este email
 *               padreNombre:
 *                 type: string
 *                 description: Requerido junto con padreEmail si la cuenta del tutor todavía no existe
 *     responses:
 *       201:
 *         description: Vínculo creado
 *       400:
 *         description: Datos inválidos
 *       404:
 *         description: Socio o usuario no encontrado
 *       409:
 *         description: El vínculo ya existe
 */
export const crearVinculoHandler = async (req, res) => {
  try {
    const { hijoSocioId } = req.body;
    if (!hijoSocioId) return res.status(400).json({ message: 'hijoSocioId es requerido' });

    const { vinculo, padre } = await crearVinculoFamiliar({
      clubId: req.user?.clubId,
      user: req.user,
      hijoSocioId,
      body: req.body,
    });

    logAudit({ clubId: req.user?.clubId, req, action: 'CREATE', resource: 'VinculoFamiliar', resourceId: vinculo._id, before: null, after: vinculo.toObject() });
    return res.status(201).json({ vinculo, padre: { id: padre._id, email: padre.email, nombre: padre.nombre } });
  } catch (error) {
    if (error instanceof BusinessError) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error('Error creando vínculo familiar:', error);
    return res.status(500).json({ message: 'Error al crear el vínculo' });
  }
};

export default crearVinculoHandler;
