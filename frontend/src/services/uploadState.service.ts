/**
 * Persistent upload state management using localForage (IndexedDB).
 *
 * Stores the multipart upload progress so that uploads can be resumed
 * after the browser tab is closed or the network drops.
 */
import localForage from "localforage";

const store = localForage.createInstance({
  name: "minddrive",
  storeName: "upload_state",
  description: "Resumable upload state for multipart uploads",
});

export interface UploadPartState {
  PartNumber: number;
  ETag: string;
}

export interface ResumableUploadState {
  /** S3 multipart upload ID */
  uploadId: string;
  /** S3 object key */
  key: string;
  /** File size in bytes */
  fileSize: number;
  /** File MIME type */
  mimeType: string;
  /** Original file name */
  originalName: string;
  /** Target folder id */
  folderId: string;
  /** Total parts */
  totalParts: number;
  /** Chunk size used */
  chunkSize: number;
  /** Already uploaded parts (sparse — indexed by part idx 0-based) */
  finishedParts: (UploadPartState | null)[];
  /** Timestamp when upload was started */
  createdAt: number;
  /** Timestamp of last successful part */
  updatedAt: number;
}

const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Build a storage key from the file hash.
 */
function stateKey(hash: string): string {
  return `upload_${hash}`;
}

export const uploadStateStore = {
  async get(hash: string): Promise<ResumableUploadState | null> {
    const state = await store.getItem<ResumableUploadState>(stateKey(hash));
    if (!state) return null;

    // Discard stale entries
    if (Date.now() - state.createdAt > STALE_THRESHOLD_MS) {
      await store.removeItem(stateKey(hash));
      return null;
    }

    return state;
  },

  async save(hash: string, state: ResumableUploadState): Promise<void> {
    await store.setItem(stateKey(hash), { ...state, updatedAt: Date.now() });
  },

  async updatePart(
    hash: string,
    partIndex: number,
    part: UploadPartState,
  ): Promise<void> {
    const state = await store.getItem<ResumableUploadState>(stateKey(hash));
    if (!state) return;
    state.finishedParts[partIndex] = part;
    state.updatedAt = Date.now();
    await store.setItem(stateKey(hash), state);
  },

  async remove(hash: string): Promise<void> {
    await store.removeItem(stateKey(hash));
  },

  /** Clean up all stale entries */
  async cleanup(): Promise<void> {
    const keys = await store.keys();
    const now = Date.now();
    for (const key of keys) {
      const state = await store.getItem<ResumableUploadState>(key);
      if (state && now - state.createdAt > STALE_THRESHOLD_MS) {
        await store.removeItem(key);
      }
    }
  },
};
