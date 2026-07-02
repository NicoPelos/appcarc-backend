import Club from '../../clubs/models/Club.js';

export const createClubHandler = async (req, res) => {
  try {
    const { nombre, slug, logoUrl, contacto, plan, modulos } = req.body;

    if (!nombre || !slug) {
      return res.status(400).json({ message: 'nombre y slug son requeridos' });
    }

    const existe = await Club.findOne({ slug: slug.toLowerCase() });
    if (existe) return res.status(409).json({ message: `Ya existe un club con slug '${slug}'` });

    const club = await Club.create({ nombre, slug, logoUrl, contacto, plan, modulos });
    res.status(201).json(club);
  } catch (error) {
    console.error('Error creando club:', error);
    res.status(500).json({ message: 'Error al crear club' });
  }
};
