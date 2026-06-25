import express from 'express';
import { protect, authorize } from '../../middleware/auth.js';
import { getAlumnosHandler } from './handlers/getAlumnos.handler.js';
import { createAlumnoHandler } from './handlers/createAlumno.handler.js';
import { updateAlumnoHandler } from './handlers/updateAlumno.handler.js';
import { deleteAlumnoHandler } from './handlers/deleteAlumno.handler.js';
import { getCategoriasHandler } from './handlers/getCategorias.handler.js';
import { createCategoriaHandler } from './handlers/createCategoria.handler.js';
import { updateCategoriaHandler } from './handlers/updateCategoria.handler.js';
import { deleteCategoriaHandler } from './handlers/deleteCategoria.handler.js';

const router = express.Router();

router.get('/', protect, authorize('admin', 'secretary', 'socio'), getAlumnosHandler);
router.post('/', protect, authorize('admin', 'secretary'), createAlumnoHandler);
router.put('/:id', protect, authorize('admin', 'secretary'), updateAlumnoHandler);
router.delete('/:id', protect, authorize('admin', 'secretary'), deleteAlumnoHandler);

router.get('/categorias', protect, authorize('admin', 'secretary'), getCategoriasHandler);
router.post('/categorias', protect, authorize('admin'), createCategoriaHandler);
router.put('/categorias/:id', protect, authorize('admin'), updateCategoriaHandler);
router.delete('/categorias/:id', protect, authorize('admin'), deleteCategoriaHandler);

export default router;
