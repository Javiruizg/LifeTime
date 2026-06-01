import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import path from 'path';
import authRouter from './features/auth/auth.routes';
import uploadRouter from './features/upload/upload.routes';
import profileRouter from './features/profile/profile.routes';

const app = express();

// Global middlewares
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the uploads directory
const uploadsDir = process.env.UPLOADS_DIR ?? 'uploads';
app.use('/uploads', express.static(path.resolve(uploadsDir)));

// Serve default assets (e.g. default avatar)
app.use('/defaults', express.static(path.resolve('public/defaults')));

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/profile', profileRouter);

// Error handler global
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
