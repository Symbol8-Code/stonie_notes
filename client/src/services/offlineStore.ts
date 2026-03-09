/**
 * IndexedDB-based offline store for STonIE Notes.
 *
 * Stores:
 * - Cached cards (read-through cache populated on every successful fetch)
 * - A sync queue of pending mutations to replay when back online
 */

import type { Card } from '@/types/models'

const DB_NAME = 'stonie-notes-offline'
const DB_VERSION = 1

const STORE_CARDS = 'cards'
const STORE_SYNC_QUEUE = 'syncQueue'

export interface SyncQueueEntry {
  id: number // auto-incremented
  action: 'create' | 'update' | 'archive'
  /** For create: a temporary local ID. For update/archive: the real server ID. */
  cardId: string
  /** Payload for create/update */
  data?: Record<string, unknown>
  createdAt: number
}

// ── DB lifecycle ─────────────────────────────────

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_CARDS)) {
        db.createObjectStore(STORE_CARDS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_SYNC_QUEUE)) {
        db.createObjectStore(STORE_SYNC_QUEUE, { keyPath: 'id', autoIncrement: true })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx(
  storeName: string,
  mode: IDBTransactionMode,
): Promise<IDBObjectStore> {
  return openDb().then((db) => {
    const t = db.transaction(storeName, mode)
    return t.objectStore(storeName)
  })
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// ── Cards cache ──────────────────────────────────

/** Replace the full card cache with fresh data from the server. */
export async function cacheCards(cards: Card[]): Promise<void> {
  const db = await openDb()
  const t = db.transaction(STORE_CARDS, 'readwrite')
  const store = t.objectStore(STORE_CARDS)
  store.clear()
  for (const card of cards) {
    store.put(card)
  }
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })
}

/** Put a single card into the cache (upsert). */
export async function cacheCard(card: Card): Promise<void> {
  const store = await tx(STORE_CARDS, 'readwrite')
  await reqToPromise(store.put(card))
}

/** Remove a card from the cache. */
export async function removeCachedCard(id: string): Promise<void> {
  const store = await tx(STORE_CARDS, 'readwrite')
  await reqToPromise(store.delete(id))
}

/** Get all cached cards. */
export async function getCachedCards(): Promise<Card[]> {
  const store = await tx(STORE_CARDS, 'readonly')
  return reqToPromise(store.getAll())
}

// ── Sync queue ───────────────────────────────────

/** Enqueue a mutation to be replayed when back online. */
export async function enqueue(
  action: SyncQueueEntry['action'],
  cardId: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const store = await tx(STORE_SYNC_QUEUE, 'readwrite')
  await reqToPromise(
    store.add({ action, cardId, data, createdAt: Date.now() }),
  )
}

/** Get all pending sync entries, oldest first. */
export async function getPendingEntries(): Promise<SyncQueueEntry[]> {
  const store = await tx(STORE_SYNC_QUEUE, 'readonly')
  return reqToPromise(store.getAll())
}

/** Remove a single sync entry after it has been successfully replayed. */
export async function removeSyncEntry(id: number): Promise<void> {
  const store = await tx(STORE_SYNC_QUEUE, 'readwrite')
  await reqToPromise(store.delete(id))
}

/** Clear the entire sync queue. */
export async function clearSyncQueue(): Promise<void> {
  const store = await tx(STORE_SYNC_QUEUE, 'readwrite')
  await reqToPromise(store.clear())
}
