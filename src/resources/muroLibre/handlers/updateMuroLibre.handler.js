import Asistencia from '../../asistencias/models/Asistencia.js';
import Movimiento from '../../movimientos/models/Movimiento.js';
import mongoose from 'mongoose';
import { logAudit } from '../../audit/services/audit.service.js';

const VALID_PAYMENT_METHODS = ['Efectivo', 'Transferencia'];

/**
 * @openapi
 * /api/muro-libre/{id}:
 *   put:
 *     summary: Editar registro de muro libre (solo admin/secretary)
 *     tags: [MuroLibre]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fecha: { type: string, format: date-time }
 *               monto: { type: number }
 *               formaPago:
 *                 type: string
 *                 enum: [Efectivo, Transferencia]
 *               observaciones: { type: string }
 *     responses:
 *       200:
 *         description: Registro actualizado
 *       400:
 *         description: Datos inválidos
 *       404:
 *         description: Registro no encontrado
 *       500:
 *         description: Error al actualizar registro
 */
export const updateMuroLibreHandler = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let resultado;
    let registroAntes = null;
    await session.withTransaction(async () => {
      const { id } = req.params;
      const { fecha, monto, formaPago, observaciones } = req.body;
      const actor = req.user.email || req.user.id;

      const registro = await Asistencia.findOne({
        _id: id, clubId: req.user.clubId, tipo: 'muro_libre', active: true,
      }).session(session);

      if (!registro) {
        return res.status(404).json({ message: 'Registro no encontrado' });
      }
      registroAntes = registro.toObject();

      if (fecha !== undefined) {
        const d = new Date(fecha);
        if (isNaN(d.getTime())) {
          return res.status(400).json({ message: 'Fecha inválida' });
        }
        registro.fecha = d;
      }

      if (monto !== undefined) {
        const m = Number(monto);
        if (!Number.isFinite(m) || m < 0) {
          return res.status(400).json({ message: 'Monto inválido' });
        }
        registro.monto = m;

        if (registro.movimientoId) {
          await Movimiento.findByIdAndUpdate(
            registro.movimientoId,
            { amount: m, updatedBy: actor },
            { session },
          );
        }
      }

      if (formaPago !== undefined) {
        if (!VALID_PAYMENT_METHODS.includes(formaPago)) {
          return res.status(400).json({ message: 'formaPago debe ser Efectivo o Transferencia' });
        }
        registro.formaPago = formaPago;

        if (registro.movimientoId) {
          await Movimiento.findByIdAndUpdate(
            registro.movimientoId,
            { paymentMethod: formaPago, updatedBy: actor },
            { session },
          );
        }
      }

      if (observaciones !== undefined) {
        registro.observaciones = String(observaciones).trim();
      }

      registro.updatedBy = actor;
      await registro.save({ session });
      resultado = registro;
    });

    if (resultado) {
      logAudit({ clubId: req.user?.clubId, req, action: 'UPDATE', resource: 'Asistencia', resourceId: resultado._id, before: registroAntes, after: resultado.toObject() });
      return res.status(200).json(resultado);
    }
  } catch (error) {
    console.error('Error actualizando muro libre:', error);
    return res.status(500).json({ message: 'Error al actualizar registro' });
  } finally {
    session.endSession();
  }
};

export default updateMuroLibreHandler;
