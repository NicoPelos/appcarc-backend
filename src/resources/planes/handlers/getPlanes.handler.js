import Plan from '../models/Plan.js';

export const getPlanesHandler = async (req, res) => {
  try {
    const { tipo, trash } = req.query;
    const showTrash = trash === 'true';

    const filter = { clubId: req.user.clubId, active: !showTrash };
    if (tipo) filter.tipo = tipo;

    const planes = await Plan.find(filter)
      .populate('etiquetaId', 'nombre unidad')
      .sort({ tipo: 1, nombre: 1 })
      .lean();

    return res.status(200).json(planes);
  } catch (error) {
    console.error('Error obteniendo planes:', error);
    return res.status(500).json({ message: 'Error al obtener planes' });
  }
};

export default getPlanesHandler;
