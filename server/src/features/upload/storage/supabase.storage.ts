import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { StorageAdapter } from '../../../shared/types/storage.interface';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? 'uploads';

export class SupabaseStorageAdapter implements StorageAdapter {
  private client: SupabaseClient;
  private bucket: string;

  constructor() {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error(
        'Supabase storage requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars'
      );
    }
    this.client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    this.bucket = SUPABASE_STORAGE_BUCKET;
  }

  async save(dir: string, filename: string, buffer: Buffer): Promise<string> {
    const filePath = `${dir}/${filename}`;
    const contentType = filePath.endsWith('.webp') ? 'image/webp' : 'application/octet-stream';

    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(filePath, buffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      throw new Error(`Supabase upload failed: ${error.message}`);
    }

    const { data } = this.client.storage
      .from(this.bucket)
      .getPublicUrl(filePath);

    return data.publicUrl;
  }

  async delete(url: string): Promise<void> {
    const filePath = this.extractPath(url);
    if (!filePath) return;

    const { error } = await this.client.storage
      .from(this.bucket)
      .remove([filePath]);

    if (error) {
      throw new Error(`Supabase delete failed: ${error.message}`);
    }
  }

  private extractPath(url: string): string | null {
    try {
      const parsed = new URL(url);
      const prefix = `/storage/v1/object/public/${this.bucket}/`;
      const idx = parsed.pathname.indexOf(prefix);
      if (idx === -1) return null;
      return parsed.pathname.slice(idx + prefix.length);
    } catch {
      return null;
    }
  }
}
