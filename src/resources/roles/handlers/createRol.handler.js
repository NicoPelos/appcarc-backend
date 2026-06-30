import Rol from '../models/Rol.js';
import { TODOS_LOS_PERMISOS } from '../../../constants/permisos.js';
import { invalidarClub } from '../../../services/permisosCache.js';

export const createRolHandler = async (req, res) => {
  const { nombre, permisos = [] } = req.body;
  if (!nombre) return res.status(400).json({ message: 'El campo nombre es requerido' });

  const invalidos = permisos.filter(p => !TODOS_LOS_PERMISOS.includes(p));
  if (invalidos.length) return res.status(400).json({ message: `Permisos inválidos: ${invalidos.join(', ')}` });

  try {
    const existe = await Rol.findOne({ clubId: req.user.clubId, nombre });
    if (existe) return res.status(409).json({ message: `El rol '${nombre}' ya existe` });

    const rol = new Rol({ clubId: req.user.clubId, nombre, permisos });
    await rol.save();
    invalidarClub(req.user.clubId);
    res.status(201).json(rol);
  } catch (error) {
    res.status(500).json({ message: 'Error creando rol' });
  }
};
