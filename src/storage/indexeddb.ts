import type { WorldSnapshot } from "../app/state/store";

const DB = "cosmic_sandbox_db";
const STORE = "slots";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveWorldSlot(slot: 1 | 2 | 3, snap: WorldSnapshot) {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(snap, `slot_${slot}`);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadWorldSlot(slot: 1 | 2 | 3): Promise<WorldSnapshot | null> {
  const db = await openDB();
  const val = await new Promise<WorldSnapshot | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(`slot_${slot}`);
    req.onsuccess = () => resolve((req.result as WorldSnapshot) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return val;
}
