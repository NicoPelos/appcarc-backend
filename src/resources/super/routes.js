import express from 'express';
import { protectSuper } from '../../middleware/auth.js';

import { getClubsHandler }       from './handlers/getClubs.handler.js';
import { createClubHandler }     from './handlers/createClub.handler.js';
import { updateClubHandler }     from './handlers/updateClub.handler.js';
import { suspendClubHandler }    from './handlers/suspendClub.handler.js';
import { getUsersHandler }       from './handlers/getUsers.handler.js';
import { createSuperUserHandler }from './handlers/createSuperUser.handler.js';
import { updateSuperUserHandler }from './handlers/updateSuperUser.handler.js';
import { deleteSuperUserHandler }from './handlers/deleteSuperUser.handler.js';
import { resetUserPasswordHandler } from './handlers/resetUserPassword.handler.js';
import { getSuperAuditHandler }  from './handlers/getSuperAudit.handler.js';
import { revertSuperAuditHandler } from './handlers/revertSuperAudit.handler.js';
import { getHealthHandler }      from './handlers/getHealth.handler.js';
import { runJobHandler }         from './handlers/runJob.handler.js';

const router = express.Router();

// Clubs
router.get('/clubs',              protectSuper, getClubsHandler);
router.post('/clubs',             protectSuper, createClubHandler);
router.patch('/clubs/:id',        protectSuper, updateClubHandler);
router.patch('/clubs/:id/suspend',protectSuper, suspendClubHandler);

// Usuarios
router.get('/users',                        protectSuper, getUsersHandler);
router.post('/users',                       protectSuper, createSuperUserHandler);
router.patch('/users/:id',                  protectSuper, updateSuperUserHandler);
router.delete('/users/:id',                 protectSuper, deleteSuperUserHandler);
router.post('/users/:id/reset-password',    protectSuper, resetUserPasswordHandler);

// Audit cross-club
router.get('/audit', protectSuper, getSuperAuditHandler);
router.post('/audit/:id/revert', protectSuper, revertSuperAuditHandler);

// Sistema
router.get('/health',            protectSuper, getHealthHandler);
router.post('/jobs/:nombre/run', protectSuper, runJobHandler);

export default router;
