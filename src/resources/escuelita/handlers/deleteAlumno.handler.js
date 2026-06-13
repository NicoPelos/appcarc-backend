import Escuelita from '../models/Escuelita.js';

/**
 * @openapi
 * /api/escuelita/{id}:
 *   delete:
 *     summary: Dar de baja un alumno de escuelita (baja lógica)
 *     tags: [Escuelita]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del alumno de escuelita a dar de baja
 *     responses:
 *       200:
 *         description: Alumno dado de baja exitosamente
 *       404:
 *         description: Alumno de escuelita no encontrado
 *       500:
 *         description: Error al dar de baja alumno de escuelita
 */


export const deleteAlumnoHandler = async (req, res) => {
  try {
    const alumno = await Escuelita.findOneAndUpdate(
      { _id: req.params.id, clubId: req.user?.clubId, active: true },
      {
        active: false,
        estado: 'baja',
        updatedBy: req.user.email || req.user.id,
      },
      { returnDocument: 'after' }
    );

    if (!alumno) {
      return res.status(404).json({ message: 'Alumno de escuelita no encontrado' });
    }

    res.status(200).json({ message: 'Alumno dado de baja de escuelita' });
  } catch (error) {
    console.error('Error dando de baja alumno de escuelita:', error);
    res.status(500).json({ message: 'Error al dar de baja alumno de escuelita' });
  }
};

export default deleteAlumnoHandler;
