import express from 'express';
import { protect, authorize } from '../../middleware/auth.js';
import { getAlumnosHandler } from './handlers/getAlumnos.handler.js';
import { createAlumnoHandler } from './handlers/createAlumno.handler.js';
import { updateAlumnoHandler } from './handlers/updateAlumno.handler.js';
import { deleteAlumnoHandler } from './handlers/deleteAlumno.handler.js';
import { purgarAlumnoHandler } from './handlers/purgarAlumno.handler.js';
import { getCategoriasHandler } from './handlers/getCategorias.handler.js';
import { createCategoriaHandler } from './handlers/createCategoria.handler.js';
import { updateCategoriaHandler } from './handlers/updateCategoria.handler.js';
import { deleteCategoriaHandler } from './handlers/deleteCategoria.handler.js';
import { checkinEscuelitaHandler } from './handlers/checkinEscuelita.handler.js';

const router = express.Router();

router.post('/checkin', protect, authorize('admin', 'secretaria', 'profesor', 'colaborador'), checkinEscuelitaHandler);
router.get('/', protect, authorize('admin', 'autoridad', 'secretaria', 'profesor', 'colaborador'), getAlumnosHandler);
router.post('/', protect, authorize('admin', 'secretaria'), createAlumnoHandler);
router.put('/:id', protect, authorize('admin', 'secretaria'), updateAlumnoHandler);
router.delete('/:id', protect, authorize('admin', 'secretaria'), deleteAlumnoHandler);
router.delete('/:id/purgar', protect, authorize('admin'), purgarAlumnoHandler);

router.get('/categorias', protect, authorize('admin', 'autoridad', 'secretaria', 'profesor', 'colaborador'), getCategoriasHandler);
router.post('/categorias', protect, authorize('admin'), createCategoriaHandler);
router.put('/categorias/:id', protect, authorize('admin'), updateCategoriaHandler);
router.delete('/categorias/:id', protect, authorize('admin'), deleteCategoriaHandler);

export default router;
