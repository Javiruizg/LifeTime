/**
 * Abstract storage adapter interface.
 * Implementations handle the actual persistence of file buffers.
 * This makes swapping from local disk to S3 a one-class change.
 */
export interface StorageAdapter {
  /**
   * Persist a file buffer and return the public relative URL.
   * @param dir  Subdirectory (e.g. "profiles")
   * @param filename  Final filename (e.g. "5_a1b2c3d4.webp")
   * @param buffer  Processed image buffer
   * @returns Public URL path (e.g. "/uploads/profiles/5_a1b2c3d4.webp")
   */
  save(dir: string, filename: string, buffer: Buffer): Promise<string>;

  /**
   * Delete a file by its public relative URL.
   * @param relativeUrl  URL returned by save()
   */
  delete(relativeUrl: string): Promise<void>;
}
