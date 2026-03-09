import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import {
  getPendingEntries,
  removeSyncEntry,
} from '@/services/offlineStore'
import {
  createCard as apiCreateCard,
  updateCard as apiUpdateCard,
  archiveCard as apiArchiveCard,
} from '@/services/api'
import type { Card } from '@/types/models'

interface OnlineContextValue {
  online: boolean
  /** True while the sync queue is being replayed to the server */
  syncing: boolean
  /**
   * Incremented each time a sync completes.
   * Pages use this as a dependency to refetch after sync.
   */
  syncGeneration: number
  /** Manually trigger a sync attempt */
  syncNow: () => Promise<void>
}

const OnlineContext = createContext<OnlineContextValue>({
  online: true,
  syncing: false,
  syncGeneration: 0,
  syncNow: async () => {},
})

export function useOnlineContext() {
  return useContext(OnlineContext)
}

interface Props {
  children: ReactNode
}

export function OnlineProvider({ children }: Props) {
  const online = useOnlineStatus()
  const [syncing, setSyncing] = useState(false)
  const syncingRef = useRef(false)
  const [syncGeneration, setSyncGeneration] = useState(0)

  const syncNow = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return
    syncingRef.current = true
    setSyncing(true)
    try {
      const entries = await getPendingEntries()
      for (const entry of entries) {
        try {
          switch (entry.action) {
            case 'create':
              await apiCreateCard(entry.data as Pick<Card, 'title' | 'bodyText' | 'source'>)
              break
            case 'update':
              // Skip updates for local-only cards — they were already created above
              if (!entry.cardId.startsWith('local-')) {
                await apiUpdateCard(entry.cardId, entry.data as Partial<Card>)
              }
              break
            case 'archive':
              // Skip archives for local-only cards — server never knew about them
              if (!entry.cardId.startsWith('local-')) {
                await apiArchiveCard(entry.cardId)
              }
              break
          }
          await removeSyncEntry(entry.id)
        } catch {
          // Stop replaying on first failure — will retry next time
          break
        }
      }
      // Bump generation so pages know to refetch from server
      if (entries.length > 0) {
        setSyncGeneration((g) => g + 1)
      }
    } finally {
      syncingRef.current = false
      setSyncing(false)
    }
  }, [])

  // Auto-sync when coming back online
  useEffect(() => {
    if (online) {
      syncNow()
    }
  }, [online, syncNow])

  return (
    <OnlineContext.Provider value={{ online, syncing, syncGeneration, syncNow }}>
      {children}
    </OnlineContext.Provider>
  )
}
