import express from 'express';
import { protect, authorize } from '../../middleware/auth.js';
import { createMuroLibreHandler } from './handlers/createMuroLibre.handler.js';
import { getMuroLibreHandler } from './handlers/getMuroLibre.handler.js';
import { checkinMuroLibreHandler } from './handlers/checkinMuroLibre.handler.js';
import { updateMuroLibreHandler } from './handlers/updateMuroLibre.handler.js';
import { deleteMuroLibreHandler } from './handlers/deleteMuroLibre.handler.js';

const router = express.Router();

router.get('/', protect, authorize('admin', 'secretary', 'socio'), getMuroLibreHandler);
router.post('/', protect, authorize('admin', 'secretary'), createMuroLibreHandler);
router.post('/checkin', protect, authorize('admin', 'secretary'), checkinMuroLibreHandler);
router.put('/:id', protect, authorize('admin', 'secretary'), updateMuroLibreHandler);
router.delete('/:id', protect, authorize('admin', 'secretary'), deleteMuroLibreHandler);

export default router;
