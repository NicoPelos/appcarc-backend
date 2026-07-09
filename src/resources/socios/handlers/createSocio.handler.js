import Socio from '../models/Socio.js';
import { syncSocioToSheet } from '../services/socioSheetSync.js';
import { prepareSocioCreateData, syncSocioUserIfPossible } from '../services/socioData.service.js';
import { logAudit } from '../../audit/services/audit.service.js';
import { notifyRoles } from '../../../services/pushNotification.service.js';

/**
 * @openapi
 * /api/socios:
 *   post:
 *     summary: Crear socio
 *     tags: [Socios]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - apellido
 *               - nombre
 *               - dni
 *             properties:
 *               dni:
 *                 type: string
 *                 description: DNI del socio
 *               nombre:
 *                 type: string
 *                 description: Nombre del socio
 *               apellido:
 *                 type: string
 *                 description: Apellido del socio
 *               correoElectronico:
 *                 type: string
 *                 description: Correo electrónico del socio
 *               telefono:
 *                 type: string
 *                 description: Teléfono del socio
 *               domicilioCompleto:
 *                 type: string
 *                 description: Domicilio completo del socio
 *               calle:
 *                 type: string
 *                 description: Calle del socio
 *               altura:
 *                 type: string
 *                 description: Altura del socio
 *               direccionActual:
 *                 type: string
 *                 description: Dirección actual del socio
 *     responses:
*       201:
*         description: Socio creado exitosamente
*       400:
*         description: Error en los datos enviados para la creación
*       500:
*         description: Error al crear socio
 */

export const createSocioHandler = async (req, res) => {
  try {
    const socio = new Socio(prepareSocioCreateData(req.body, req.user));
    await socio.save();

    await syncSocioUserIfPossible(socio);
    await syncSocioToSheet(socio);

    logAudit({ clubId: req.user?.clubId, req, action: 'CREATE', resource: 'Socio', resourceId: socio._id, before: null, after: socio.toObject() });

    res.status(201).json(socio);

    notifyRoles(req.user?.clubId, ['autoridad', 'secretaria'], {
      title: '🎉 Nuevo socio en el padrón',
      body: `${socio.nombre} ${socio.apellido} se incorporó como socio`,
      data: { tipo: 'nuevo_socio', socioId: socio._id.toString() },
    }).catch((err) => console.error('Error enviando push de nuevo socio:', err));
  } catch (error) {
    console.error('Error creando socio (handler):', error);
    res.status(400).json({ message: error.message });
  }
};

export default createSocioHandler;
