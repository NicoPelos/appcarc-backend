import Plan from '../models/Plan.js';
import Etiqueta from '../../etiquetas/models/Etiqueta.js';
import { logAudit } from '../../audit/services/audit.service.js';

const TIPOS = ['social', 'escuelita', 'muro_libre'];
const MODALIDADES = ['mensual', 'por_uso'];

export const createPlanHandler = async (req, res) => {
  try {
    const { nombre, descripcion = '', tipo, modalidad, etiquetaId, atributos = {} } = req.body;

    if (!nombre) return res.status(400).json({ message: 'nombre es requerido' });
    if (!tipo || !TIPOS.includes(tipo)) return res.status(400).json({ message: `tipo debe ser: ${TIPOS.join(', ')}` });
    if (!modalidad || !MODALIDADES.includes(modalidad)) return res.status(400).json({ message: `modalidad debe ser: ${MODALIDADES.join(', ')}` });
    if (!etiquetaId) return res.status(400).json({ message: 'etiquetaId es requerido' });

    const etiqueta = await Etiqueta.findOne({ _id: etiquetaId, clubId: req.user.clubId, active: true });
    if (!etiqueta) return res.status(404).json({ message: 'Etiqueta no encontrada' });

    const plan = new Plan({
      clubId: req.user.clubId,
      nombre,
      descripcion,
      tipo,
      modalidad,
      etiquetaId,
      atributos,
      createdBy: req.user.email || req.user.id,
      updatedBy: req.user.email || req.user.id,
    });

    await plan.save();
    logAudit({ clubId: req.user?.clubId, req, action: 'CREATE', resource: 'Plan', resourceId: plan._id, before: null, after: plan.toObject() });
    return res.status(201).json(plan);
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'Ya existe un plan con ese nombre' });
    console.error('Error creando plan:', error);
    return res.status(500).json({ message: 'Error al crear plan' });
  }
};

export default createPlanHandler;
