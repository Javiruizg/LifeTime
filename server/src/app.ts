import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import uploadRouter from './features/upload/upload.routes';

const app = express();

// ─── Middleware globales ──────────────────────────────────
app.use(helmet()); // Seguridad HTTP headers
app.use(cors()); // Permitir CORS (ajustar configuración según necesidades)
app.use(express.json()); // Parsear JSON en body de requests
app.use(express.urlencoded({ extended: true })); // Parsear URL-encoded bodies (para formularios)

// Servir imágenes subidas de forma estática
const uploadsDir = process.env.UPLOADS_DIR ?? 'uploads';
app.use('/uploads', express.static(path.resolve(uploadsDir)));

// ─── Health check ─────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Features (se añadirán según se implementen) ──────────
// app.use('/api/auth', authRouter);
// app.use('/api/profile', profileRouter);
// app.use('/api/friends', friendsRouter);
// app.use('/api/map', mapRouter);
// app.use('/api/chat', chatRouter);
app.use('/api/upload', uploadRouter);

// ─── Error handler global ─────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('❌ Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
