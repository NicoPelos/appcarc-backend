import express from 'express';
import { protect, authorize } from '../../middleware/auth.js';
import { createMuroLibreHandler } from './handlers/createMuroLibre.handler.js';
import { getMuroLibreHandler } from './handlers/getMuroLibre.handler.js';
import { checkinMuroLibreHandler } from './handlers/checkinMuroLibre.handler.js';

const router = express.Router();

router.get('/', protect, authorize('admin', 'secretary', 'socio'), getMuroLibreHandler);
router.post('/', protect, authorize('admin', 'secretary'), createMuroLibreHandler);
router.post('/checkin', protect, authorize('admin', 'secretary'), checkinMuroLibreHandler);

export default router;
