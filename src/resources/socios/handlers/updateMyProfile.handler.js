import Socio from '../models/Socio.js';
import User from '../../usuarios/models/User.js';
import { syncSocioToSheet } from '../services/socioSheetSync.js';

/**
 * @openapi
 * /api/socios/me/profile:
 *   put:
 *     summary: Actualizar el perfil del usuario actual
 *     tags: [Perfil]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre:
 *                 type: string
 *                 description: Nombre del usuario
 *               apellido:
 *                 type: string
 *               telefono:
 *                 type: string
 *               correoElectronico:
 *                 type: string
 *               fotoPerfil:
 *                 type: string
 *                 description: URL de la foto de perfil
 *               redesSociales:
 *                 type: object
 *                 properties:
 *                   instagram:
 *                     type: string
 *                   facebook:
 *                     type: string
 *                   twitter:
 *                     type: string
 *                   linkedin:
 *                     type: string
 *                   whatsapp:
 *                     type: string
 *     responses:
 *       200:
 *         description: Perfil actualizado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 socio:
 *                   type: object
 *       400:
 *         description: Usuario no tiene socio vinculado
 *       404:
 *         description: Usuario o socio no encontrado
 *       500:
 *         description: Error al actualizar perfil
 */
export const updateMyProfileHandler = async (req, res) => {
  try {
    const user = await User.findById(req.user?.id);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    if (!user.socioId) {
      return res.status(400).json({ message: 'Usuario no tiene socio vinculado' });
    }

    // Campos permitidos para actualizar (seguridad - no permitir cambiar dni, estado, etc)
    const allowedFields = [
      'nombre',
      'apellido',
      'telefono',
      'correoElectronico',
      'fotoPerfil',
      'redesSociales',
    ];

    const updateData = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    const socio = await Socio.findOneAndUpdate(
      { _id: user.socioId, clubId: req.user?.clubId },
      updateData,
      { returnDocument: 'after', runValidators: true }
    );

    if (!socio) {
      return res.status(404).json({ message: 'Socio no encontrado' });
    }

    // Actualizar nombre en User si se proporciona
    if (updateData.nombre) {
      user.nombre = updateData.nombre;
      await user.save();
    }

    // Sincronizar con Google Sheets
    await syncSocioToSheet(socio);

    res.status(200).json({
      message: 'Perfil actualizado exitosamente',
      socio,
    });
  } catch (error) {
    console.error('Error actualizando perfil:', error);
    res.status(500).json({ message: 'Error al actualizar perfil' });
  }
};

export default updateMyProfileHandler;
