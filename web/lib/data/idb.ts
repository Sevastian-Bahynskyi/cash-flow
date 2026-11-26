// A tiny key-value store on IndexedDB for the offline copy of the user's data (web-pwa skill).
// It is a cache, never the source of truth; every call fails soft (private mode, eviction).
const DB = 'cashflow', STORE = 'kv'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  try {
    const db = await open()
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return undefined
  }
}

export const idbGet = <T>(key: string): Promise<T | undefined> => tx<T>('readonly', (s) => s.get(key) as IDBRequest<T>)
export const idbSet = async (key: string, value: unknown): Promise<void> => { await tx('readwrite', (s) => s.put(value, key)) }
export const idbDel = async (key: string): Promise<void> => { await tx('readwrite', (s) => s.delete(key)) }
export const idbClear = async (): Promise<void> => { await tx('readwrite', (s) => s.clear()) }
