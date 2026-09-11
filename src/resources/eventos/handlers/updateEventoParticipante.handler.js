import mongoose from 'mongoose';
import EventoParticipante from '../models/EventoParticipante.js';
import { logAudit } from '../../audit/services/audit.service.js';

/**
 * @openapi
 * /api/eventos/{eventoId}/participantes/{participanteId}:
 *   put:
 *     summary: Editar el monto esperado de un participante (y su nombre, si no es socio)
 *     tags: [Eventos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventoId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: participanteId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               monto: { type: number }
 *               nombre: { type: string }
 *               apellido: { type: string }
 *     responses:
 *       200:
 *         description: Participante actualizado
 *       400:
 *         description: Datos inválidos
 *       404:
 *         description: Participante no encontrado
 *       409:
 *         description: El participante ya está anulado
 *       500:
 *         description: Error al actualizar el participante
 */
export const updateEventoParticipanteHandler = async (req, res) => {
  try {
    const { eventoId, participanteId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(eventoId) || !mongoose.Types.ObjectId.isValid(participanteId)) {
      return res.status(400).json({ message: 'ID inválido' });
    }

    const participante = await EventoParticipante.findOne({ _id: participanteId, eventoId, clubId: req.user.clubId, active: true });
    if (!participante) return res.status(404).json({ message: 'Participante no encontrado' });
    if (participante.estado === 'anulada') return res.status(409).json({ message: 'El participante ya está anulado' });

    const { monto, nombre, apellido } = req.body;
    const antes = participante.toObject();

    if (monto !== undefined) {
      const montoNum = Number(monto);
      if (!Number.isFinite(montoNum) || montoNum < 0) return res.status(400).json({ message: 'monto debe ser un número mayor o igual a cero' });
      if (montoNum < participante.montoPagadoSnapshot) {
        return res.status(400).json({ message: `El monto no puede ser menor a lo ya pagado ($${participante.montoPagadoSnapshot})` });
      }
      participante.montoEsperadoSnapshot = montoNum;
      participante.estado = montoNum <= participante.montoPagadoSnapshot ? 'pagada' : (participante.montoPagadoSnapshot > 0 ? 'parcial' : 'pendiente');
    }

    if ((nombre !== undefined || apellido !== undefined) && participante.socioId) {
      return res.status(400).json({ message: 'El nombre de un participante que es socio se edita desde su ficha, no acá' });
    }
    if (nombre !== undefined) {
      if (!String(nombre).trim()) return res.status(400).json({ message: 'nombre no puede quedar vacío' });
      participante.nombre = nombre.trim();
    }
    if (apellido !== undefined) participante.apellido = apellido.trim();

    participante.updatedBy = req.user.email || req.user.id;
    await participante.save();

    logAudit({ clubId: req.user?.clubId, req, action: 'UPDATE', resource: 'EventoParticipante', resourceId: participante._id, before: antes, after: participante.toObject() });
    return res.status(200).json(participante);
  } catch (error) {
    console.error('Error actualizando el participante:', error);
    return res.status(500).json({ message: 'Error al actualizar el participante' });
  }
};

export default updateEventoParticipanteHandler;
