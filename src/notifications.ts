import { createSignal, createEffect } from "solid-js"
import { NostrEvent } from "@nostr/tools/pure"
import { Filter } from "@nostr/tools/filter"
import { pool } from "@nostr/gadgets/global"
import { loadRelayList } from "@nostr/gadgets/lists"
import { SubCloser } from "@nostr/tools/abstract-pool"

import user, { User } from "./user"
import { outbox } from "./nostr"

export type Notification = {
  event: NostrEvent
  seen: boolean
}

const notificationKinds = [7, 16, 9321, 9735, 1244]

let lastSeen = 0

const [notifications, setNotifications] = createSignal<Notification[]>([])

let notificationCloser: SubCloser | null = null

// restart notification stuff whenever the current user changes
createEffect(() => {
  const currentUser = user().current
  if (!currentUser) return
  ;(async () => {
    const stored = outbox.store.queryEvents(
      {
        kinds: notificationKinds,
        "#k": ["1222", "1244"],
        "#p": [currentUser.pubkey]
      },
      80
    )
    lastSeen = parseInt(localStorage.getItem(lastSeenKey(currentUser))) || 0

    let all: Notification[] = []
    for await (let evt of stored) {
      if (!evt.tags.find(t => t[0] === "e" || t[0] === "E")?.[1]) return

      all.push({
        event: evt,
        seen: evt.created_at <= lastSeen
      })
    }
    setNotifications(all)
    startNotificationMonitoring(lastSeen)
  })()
})

async function startNotificationMonitoring(since: number) {
  const currentUser = user().current
  if (!currentUser) return

  const relays = (await loadRelayList(currentUser.pubkey)).items
    .filter(r => r.read)
    .slice(0, 4)
    .map(r => r.url)

  if (notificationCloser) {
    notificationCloser.close()
    notificationCloser = null
  }

  const filter: Filter = {
    kinds: notificationKinds,
    "#p": [currentUser.pubkey],
    "#k": ["1222", "1244"],
    since
  }

  console.log(`notifications sub on ${relays.length} with:`, filter)
  notificationCloser = pool.subscribe(relays, filter, {
    label: "notifications",
    async onevent(event) {
      // skip events without a target id entirely
      if (!event.tags.find(t => t[0] === "e" || t[0] === "E")?.[1]) return

      // store on database
      outbox.store.saveEvent(event)

      // don't notify for our own events
      if (event.pubkey === currentUser.pubkey) return

      switch (event.kind) {
        case 16:
          // repost
          break
        case 7:
          // reaction
          break
        case 1244:
          // reply
          break
        case 9321:
          // nutzap
          // TODO: check nutzap mint and DLEQ signature
          break
        case 9735:
          // zap
          // TODO: check zap origin validity
          break
        default:
          return
      }

      setNotifications(prev => {
        if (prev.some(n => n.event.id === event.id)) {
          return prev
        }
        return [...prev, { event, seen: event.created_at <= lastSeen }]
      })
    }
  })
}

export function markAsRead(notification: Notification) {
  const currentUser = user().current
  if (!currentUser) return

  setNotifications(all => all.map(n => ({ ...n, seen: n === notification ? true : n.seen })))
  localStorage.setItem(lastSeenKey(currentUser), notification.event.created_at.toString())
}

export function markAllAsRead() {
  const currentUser = user().current
  if (!currentUser) return

  setNotifications(all => all.map(n => ({ ...n, seen: true })))
  localStorage.setItem(lastSeenKey(currentUser), Math.round(Date.now() / 1000).toString())
}

function lastSeenKey(currentUser: User) {
  return `last-seen-by:${currentUser.pubkey}`
}

export { notifications }
