// Photos live in IndexedDB rather than with the tree in localStorage: localStorage holds a few megabytes, which even compressed photos
// would use up after a handful of pictures. Two stores share the database: "ops" holds photo changes waiting for "Zapisz zmiany",
// "cache" holds a local copy of every photo in Notion, so the tree shows them without going to the network.

export type PhotoOp =
  | { id: string; kind: 'add'; personId: string; property: string; blob: Blob; filename: string }
  | { id: string; kind: 'remove'; personId: string; property: string; fileKey: string; name: string };

const DB_NAME = 'nft-photos';
const OPS = 'ops';
const CACHE = 'cache';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OPS)) db.createObjectStore(OPS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(CACHE)) db.createObjectStore(CACHE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(name: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(name, mode);
      const request = run(transaction.objectStore(name));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export const photoQueue = {
  list: () => withStore<PhotoOp[]>(OPS, 'readonly', (store) => store.getAll() as IDBRequest<PhotoOp[]>),
  put: (op: PhotoOp) => withStore(OPS, 'readwrite', (store) => store.put(op)),
  delete: (id: string) => withStore(OPS, 'readwrite', (store) => store.delete(id)),
  clear: () => withStore(OPS, 'readwrite', (store) => store.clear()),
};

export const photoCache = {
  get: async (key: string) => (await withStore<{ key: string; blob: Blob } | undefined>(CACHE, 'readonly', (store) => store.get(key) as IDBRequest<{ key: string; blob: Blob } | undefined>))?.blob,
  put: (key: string, blob: Blob) => withStore(CACHE, 'readwrite', (store) => store.put({ key, blob })),
  keys: () => withStore<IDBValidKey[]>(CACHE, 'readonly', (store) => store.getAllKeys()).then((keys) => keys.map(String)),
  delete: (key: string) => withStore(CACHE, 'readwrite', (store) => store.delete(key)),
  clear: () => withStore(CACHE, 'readwrite', (store) => store.clear()),
};

export function newPhotoOpId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// A Notion file URL carries a fresh signature on every read, but its path (which contains the file's id) stays the same.
export function photoFileKey(url: string): string {
  return url.split('?')[0]!;
}
