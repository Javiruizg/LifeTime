import fs from 'fs/promises';
import path from 'path';
import { StorageAdapter } from '../../../shared/types/storage.interface';

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? 'uploads';
const BASE_PATH = path.resolve(UPLOADS_DIR);

export class LocalStorageAdapter implements StorageAdapter {
  async save(dir: string, filename: string, buffer: Buffer): Promise<string> {
    const dirPath = path.join(BASE_PATH, dir);
    await fs.mkdir(dirPath, { recursive: true });

    const filePath = path.join(dirPath, filename);
    await fs.writeFile(filePath, buffer);

    // Return the public URL path that matches the static serve mount
    return `/uploads/${dir}/${filename}`;
  }

  async delete(relativeUrl: string): Promise<void> {
    // relativeUrl is like "/uploads/profiles/5_abc.webp"
    const relativePath = relativeUrl.replace(/^\/uploads\//, '');
    const filePath = path.join(BASE_PATH, relativePath);

    try {
      await fs.unlink(filePath);
    } catch (err) {
      // Ignore "file not found" errors; re-throw others
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }
}
