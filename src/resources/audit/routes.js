import { Router } from 'express';
import { protect } from '../../middleware/auth.js';
import { authorize } from '../../middleware/auth.js';
import getAuditLogsHandler from './handlers/getAuditLogs.handler.js';
import revertAuditLogHandler from './handlers/revertAuditLog.handler.js';

const router = Router();

router.get('/', protect, authorize('admin', 'autoridad'), getAuditLogsHandler);
router.post('/:id/revert', protect, authorize('admin'), revertAuditLogHandler);

export default router;
