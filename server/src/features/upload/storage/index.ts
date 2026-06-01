import { LocalStorageAdapter } from './local.storage';
import { SupabaseStorageAdapter } from './supabase.storage';
import { StorageAdapter } from '../../../shared/types/storage.interface';

export * from '../../../shared/types/storage.interface';

export function createStorageAdapter(): StorageAdapter {
  const provider = process.env.STORAGE_PROVIDER ?? 'local';

  switch (provider) {
    case 'supabase':
      return new SupabaseStorageAdapter();
    case 'local':
    default:
      return new LocalStorageAdapter();
  }
}
