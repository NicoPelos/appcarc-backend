import express from 'express';
import { protect, authorize } from '../../middleware/auth.js';
import { syncSheetsHandler } from './handlers/syncSheets.handler.js';

const router = express.Router();

router.post('/sheets', protect, authorize('admin', 'autoridad'), syncSheetsHandler);

export default router;
