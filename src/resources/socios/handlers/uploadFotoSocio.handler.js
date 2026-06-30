import path from 'path';
import sharp from 'sharp';
import multer from 'multer';
import Socio from '../models/Socio.js';

const FOTO_DIR = path.resolve('uploads/fotos');
const MAX_SIZE_MB = 5;

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Solo se permiten imágenes'));
    }
    cb(null, true);
  },
});

/**
 * @openapi
 * /api/socios/{id}/foto:
 *   put:
 *     summary: Subir o reemplazar foto de perfil del socio
 *     tags: [Socios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               foto:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: URL de la foto guardada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 fotoPerfil: { type: string }
 *       400:
 *         description: No se recibió imagen
 *       403:
 *         description: Sin permiso para modificar este socio
 *       404:
 *         description: Socio no encontrado
 *       500:
 *         description: Error al subir foto
 */
export const uploadFotoSocioHandler = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.roles?.includes('socio') && req.user.socioId !== id) {
      return res.status(403).json({ message: 'No tenés permiso para modificar este socio' });
    }

    const socio = await Socio.findOne({ _id: id, clubId: req.user.clubId, active: true });
    if (!socio) return res.status(404).json({ message: 'Socio no encontrado' });

    if (!req.file) return res.status(400).json({ message: 'No se recibió ninguna imagen' });

    const filename = `socio_${id}.jpg`;
    const filepath = path.join(FOTO_DIR, filename);

    await sharp(req.file.buffer)
      .resize(256, 256, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 80 })
      .toFile(filepath);

    socio.fotoPerfil = `/uploads/fotos/${filename}`;
    socio.updatedBy = req.user.email || req.user.id;
    await socio.save();

    return res.status(200).json({ fotoPerfil: socio.fotoPerfil });
  } catch (error) {
    console.error('Error subiendo foto de socio:', error);
    return res.status(500).json({ message: 'Error al subir foto' });
  }
};
