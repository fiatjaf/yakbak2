import { createSignal, createEffect, onCleanup } from "solid-js"
import { NostrEvent } from "@nostr/tools/pure"
import { pool } from "@nostr/gadgets/global"
import { loadRelayList } from "@nostr/gadgets/lists"
import { SubCloser } from "@nostr/tools/abstract-pool"
import user from "./user"

export interface Notification {
  id: string
  type: "reply" | "reaction" | "zap"
  event: NostrEvent
  targetEvent: NostrEvent
  timestamp: number
  read: boolean
}

interface NotificationStorage {
  notifications: Notification[]
  unreadCount: number
  seenNotificationIds: string[] // Track all notification IDs we've ever seen
}

const [notifications, setNotifications] = createSignal<Notification[]>([])
const [unreadCount, setUnreadCount] = createSignal(0)

let notificationCloser: SubCloser | null = null
let userEventIds = new Set<string>()
let isLoadingFromStorage = false
let seenNotificationIds = new Set<string>()

// Storage keys
function getNotificationStorageKey(pubkey: string): string {
  return `yakbak:notifications:${pubkey}`
}

// Load notifications from localStorage
function loadNotificationsFromStorage(pubkey: string): NotificationStorage {
  try {
    const stored = localStorage.getItem(getNotificationStorageKey(pubkey))
    console.log(`Loading notifications for ${pubkey}:`, stored)
    if (stored) {
      const parsed = JSON.parse(stored) as NotificationStorage
      // Validate the structure and ensure notifications are not too old (keep last 30 days)
      const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60)
      const validNotifications = parsed.notifications.filter(n => n.timestamp > thirtyDaysAgo)
      const result = {
        notifications: validNotifications,
        unreadCount: validNotifications.filter(n => !n.read).length,
        seenNotificationIds: parsed.seenNotificationIds || []
      }
      console.log(`Loaded ${result.notifications.length} notifications, ${result.unreadCount} unread, ${result.seenNotificationIds.length} seen IDs`)
      return result
    }
  } catch (err) {
    console.warn("Failed to load notifications from storage:", err)
  }
  console.log(`No stored notifications for ${pubkey}`)
  return { notifications: [], unreadCount: 0, seenNotificationIds: [] }
}

// Save notifications to localStorage
function saveNotificationsToStorage(pubkey: string, data: NotificationStorage) {
  try {
    console.log(`Saving notifications for ${pubkey}:`, `${data.notifications.length} notifications, ${data.unreadCount} unread`)
    localStorage.setItem(getNotificationStorageKey(pubkey), JSON.stringify(data))
  } catch (err) {
    console.warn("Failed to save notifications to storage:", err)
  }
}

// Update storage whenever notifications change
function updateStorage() {
  const currentUser = user().current
  if (!currentUser) return
  
  const currentNotifications = notifications()
  const currentUnreadCount = unreadCount()
  const actualUnreadCount = currentNotifications.filter(n => !n.read).length
  
  // Use the actual count if there's a mismatch
  const finalUnreadCount = currentUnreadCount !== actualUnreadCount ? actualUnreadCount : currentUnreadCount
  
  const data: NotificationStorage = {
    notifications: currentNotifications,
    unreadCount: finalUnreadCount,
    seenNotificationIds: Array.from(seenNotificationIds)
  }
  
  console.log(`updateStorage called - notifications: ${data.notifications.length}, unreadCount: ${data.unreadCount}, seen IDs: ${data.seenNotificationIds.length}`)
  saveNotificationsToStorage(currentUser.pubkey, data)
}

// Load user's events (kind:1222 and kind:1244) to monitor for notifications
async function loadUserEvents() {
  const currentUser = user().current
  if (!currentUser) return

  const relays = (await loadRelayList(currentUser.pubkey)).items
    .filter(r => r.read)
    .slice(0, 4)
    .map(r => r.url)

  const userEvents = await pool.querySync(relays, {
    authors: [currentUser.pubkey],
    kinds: [1222, 1244],
    limit: 100
  })

  userEventIds.clear()
  userEvents.forEach(event => userEventIds.add(event.id))
  console.log(`Loaded ${userEvents.length} user events to monitor:`, Array.from(userEventIds))
}

// Monitor for notifications
async function startNotificationMonitoring() {
  const currentUser = user().current
  if (!currentUser) return

  await loadUserEvents()
  if (userEventIds.size === 0) {
    console.log(`No user events found to monitor notifications for`)
    return
  }

  const relays = (await loadRelayList(currentUser.pubkey)).items
    .filter(r => r.read)
    .slice(0, 4)
    .map(r => r.url)

  if (notificationCloser) {
    notificationCloser.close()
  }

  const subscriptionFilter = {
    kinds: [7, 9735, 1244],
    "#e": Array.from(userEventIds)
  }
  
  console.log(`Starting notification subscription on ${relays.length} relays with filter:`, subscriptionFilter)
  
  notificationCloser = pool.subscribe(
    relays,
    subscriptionFilter,
    {
      label: "notifications",
      onevent(event) {
        // Don't notify for our own events
        if (event.pubkey === currentUser.pubkey) {
          console.log(`Ignoring own event:`, event.id)
          return
        }

        const targetEventId = event.tags.find(t => t[0] === "e")?.[1]
        if (!targetEventId) {
          console.log(`No target event ID found in event:`, event.id)
          return
        }
        if (!userEventIds.has(targetEventId)) {
          console.log(`Target event ${targetEventId} not in our userEventIds, ignoring event:`, event.id)
          return
        }
        
        console.log(`Processing valid notification event:`, event.id, `targeting our event:`, targetEventId)

        let type: "reply" | "reaction" | "zap"
        switch (event.kind) {
          case 7:
            type = "reaction"
            break
          case 9735:
            type = "zap"
            break
          case 1244:
            type = "reply"
            break
          default:
            return
        }

        // Find the target event from our stored events
        pool.querySync(relays, { ids: [targetEventId], limit: 1 }).then(targetEvents => {
          if (targetEvents.length === 0) return

          const notification: Notification = {
            id: event.id,
            type,
            event,
            targetEvent: targetEvents[0],
            timestamp: event.created_at,
            read: false
          }

          console.log(`New notification received:`, notification.id, notification.type)

          let notificationWasAdded = false
          
          setNotifications(prev => {
            // Check if we've already seen this notification (either in current list or previously)
            if (prev.some(n => n.id === notification.id) || seenNotificationIds.has(notification.id)) {
              console.log(`Duplicate/seen notification ignored:`, notification.id)
              return prev
            }
            
            // Add to seen IDs set
            seenNotificationIds.add(notification.id)
            
            const updated = [notification, ...prev].slice(0, 50) // Keep last 50 notifications
            console.log(`Added NEW notification, total now:`, updated.length)
            notificationWasAdded = true
            // Save to storage when new notification arrives
            setTimeout(() => updateStorage(), 0)
            return updated
          })

          // Only increment unread count if notification was actually added
          if (notificationWasAdded) {
            setUnreadCount(prev => prev + 1)
          }
        })
      }
    }
  )
}

// Initialize notification monitoring when user changes
createEffect(() => {
  const currentUser = user().current
  if (currentUser) {
    // Load stored notifications for this user
    isLoadingFromStorage = true
    const stored = loadNotificationsFromStorage(currentUser.pubkey)
    console.log(`Setting notifications:`, stored.notifications.length, `Setting unread count:`, stored.unreadCount)
    setNotifications(stored.notifications)
    setUnreadCount(stored.unreadCount)
    
    // Load seen notification IDs
    seenNotificationIds.clear()
    stored.seenNotificationIds.forEach(id => seenNotificationIds.add(id))
    console.log(`Loaded ${seenNotificationIds.size} seen notification IDs`)
    
    // Double check the sync
    setTimeout(() => {
      const currentNotifications = notifications()
      const currentUnread = unreadCount()
      const actualUnread = currentNotifications.filter(n => !n.read).length
      console.log(`After loading - Notifications: ${currentNotifications.length}, Unread count: ${currentUnread}, Actual unread: ${actualUnread}`)
      
      if (currentUnread !== actualUnread) {
        console.warn(`SYNC ISSUE: Unread count (${currentUnread}) doesn't match actual unread (${actualUnread})`)
        setUnreadCount(actualUnread)
        updateStorage()
      }
    }, 100)
    
    isLoadingFromStorage = false
    
    // Start monitoring for new notifications
    startNotificationMonitoring()
  } else {
    if (notificationCloser) {
      notificationCloser.close()
      notificationCloser = null
    }
    setNotifications([])
    setUnreadCount(0)
    userEventIds.clear()
    seenNotificationIds.clear()
  }
})

// Note: Storage is now handled manually in specific functions to avoid timing issues

export function markAsRead(notificationId: string) {
  console.log(`Marking notification as read: ${notificationId}`)
  setNotifications(prev => prev.map(n => (n.id === notificationId ? { ...n, read: true } : n)))
  setUnreadCount(prev => Math.max(0, prev - 1))
  // Save immediately after user action
  updateStorage()
}

export function markAllAsRead() {
  console.log(`Marking all notifications as read`)
  const updatedNotifications = notifications().map(n => ({ ...n, read: true }))
  setNotifications(updatedNotifications)
  setUnreadCount(0)
  
  // Force save the correct state
  setTimeout(() => {
    const currentUser = user().current
    if (currentUser) {
      console.log(`Force saving all-read state`)
      saveNotificationsToStorage(currentUser.pubkey, {
        notifications: updatedNotifications,
        unreadCount: 0,
        seenNotificationIds: Array.from(seenNotificationIds)
      })
    }
  }, 10)
}

export function clearNotifications() {
  console.log(`Clearing all notifications`)
  // Clear notifications but keep seen IDs so they don't reappear
  setNotifications([])
  setUnreadCount(0)
  
  // Force the correct state for storage
  setTimeout(() => {
    const currentUser = user().current
    if (currentUser) {
      console.log(`Force saving empty state after clear (keeping ${seenNotificationIds.size} seen IDs)`)
      saveNotificationsToStorage(currentUser.pubkey, {
        notifications: [],
        unreadCount: 0,
        seenNotificationIds: Array.from(seenNotificationIds)
      })
    }
  }, 10)
}

export { notifications, unreadCount }
