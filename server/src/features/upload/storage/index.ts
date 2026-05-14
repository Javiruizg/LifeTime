import { LocalStorageAdapter } from './local.storage';
import { StorageAdapter } from './storage.interface';

export * from './storage.interface';

export function createStorageAdapter(): StorageAdapter {
  // Future: read env to decide between local / S3 / etc.
  return new LocalStorageAdapter();
}
