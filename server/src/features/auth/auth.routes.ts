import { Router } from 'express';
import { deviceAuthController, refreshTokenController } from './auth.controller';

const router = Router();

router.post('/device', deviceAuthController);
router.post('/refresh', refreshTokenController);

export default router;
