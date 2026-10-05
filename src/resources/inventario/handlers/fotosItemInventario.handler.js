import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import sharp from 'sharp';
import multer from 'multer';
import ItemInventario from '../models/ItemInventario.js';
import { logAudit } from '../../audit/services/audit.service.js';

const FOTOS_DIR = path.resolve('uploads/inventario');
fs.mkdirSync(FOTOS_DIR, { recursive: true });

const MAX_FOTOS_POR_ITEM = 10;
const MAX_SIZE_MB = 15;

export const uploadFoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Solo se permiten imágenes'));
    cb(null, true);
  },
});

export const handleUploadFotoError = (err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ message: `La imagen supera el tamaño máximo permitido (${MAX_SIZE_MB}MB).` });
  }
  if (err) return res.status(400).json({ message: err.message || 'Error al procesar la imagen' });
  next();
};

export const uploadFotoItemInventarioHandler = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'ID inválido' });
    if (!req.file) return res.status(400).json({ message: 'No se recibió ninguna imagen' });

    const item = await ItemInventario.findOne({ _id: id, clubId: req.user?.clubId, active: true });
    if (!item) return res.status(404).json({ message: 'Ítem no encontrado' });
    if (item.fotos.length >= MAX_FOTOS_POR_ITEM) {
      return res.status(400).json({ message: `Un ítem admite como máximo ${MAX_FOTOS_POR_ITEM} fotos` });
    }

    const buffer = await sharp(req.file.buffer)
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    const actor = req.user?.email ?? req.user?.id ?? 'Sistema';
    item.fotos.push({ url: '', createdBy: actor });
    const foto = item.fotos[item.fotos.length - 1];

    const filename = `item_${item._id}_${foto._id}.jpg`;
    fs.writeFileSync(path.join(FOTOS_DIR, filename), buffer);
    foto.url = `/uploads/inventario/${filename}`;
    item.updatedBy = actor;
    await item.save();

    logAudit({ clubId: req.user?.clubId, req, action: 'UPDATE', resource: 'ItemInventario', resourceId: item._id, before: null, after: { fotoAgregada: foto.url } });
    res.status(201).json(foto);
  } catch (error) {
    console.error('Error subiendo foto de inventario:', error);
    res.status(500).json({ message: 'Error al subir la foto' });
  }
};

export const deleteFotoItemInventarioHandler = async (req, res) => {
  try {
    const { id, fotoId } = req.params;
    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(fotoId)) {
      return res.status(400).json({ message: 'ID inválido' });
    }

    const item = await ItemInventario.findOne({ _id: id, clubId: req.user?.clubId, active: true });
    if (!item) return res.status(404).json({ message: 'Ítem no encontrado' });

    const foto = item.fotos.id(fotoId);
    if (!foto) return res.status(404).json({ message: 'Foto no encontrada' });

    const antes = item.toObject();
    const archivo = path.join(FOTOS_DIR, path.basename(foto.url));
    item.fotos.pull({ _id: fotoId });
    item.updatedBy = req.user?.email ?? req.user?.id ?? 'Sistema';
    await item.save();
    fs.promises.unlink(archivo).catch(() => {});

    logAudit({ clubId: req.user?.clubId, req, action: 'UPDATE', resource: 'ItemInventario', resourceId: item._id, before: antes, after: item.toObject() });
    res.status(200).json({ message: 'Foto eliminada' });
  } catch (error) {
    console.error('Error eliminando foto de inventario:', error);
    res.status(500).json({ message: 'Error al eliminar la foto' });
  }
};

export default uploadFotoItemInventarioHandler;
