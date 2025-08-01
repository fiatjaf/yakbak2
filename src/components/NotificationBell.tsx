import { Bell, Heart, MessageCircle, Zap } from "lucide-solid"
import { createSignal, For, Show, createResource, createEffect } from "solid-js"
import { A } from "@solidjs/router"
import { loadNostrUser } from "@nostr/gadgets/metadata"
import { neventEncode } from "@nostr/tools/nip19"

import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Card } from "./ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "./ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar"

import { notifications, markAsRead, markAllAsRead, Notification } from "../notifications"
import { formatZapAmount, getSatoshisAmountFromBolt11 } from "../utils"
import { pool } from "@nostr/gadgets/global"

function NotificationBell() {
  const [isOpen, setIsOpen] = createSignal(false)
  const unreadCount = () =>
    notifications().reduce((c, notification) => (notification.seen ? c : c + 1), 0)

  createEffect(() => {
    console.log(
      `NotificationBell - notifications count: ${notifications().length}, unread count: ${unreadCount()}`
    )
  })

  return (
    <DropdownMenu open={isOpen()} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger>
        <Button variant="ghost" size="icon" class="relative cursor-pointer">
          <Bell class="h-5 w-5" />
          <Show when={unreadCount() > 0}>
            <Badge
              variant="outline"
              class="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center"
            >
              {unreadCount() > 100 ? "100+" : unreadCount()}
            </Badge>
          </Show>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent class="w-80 max-h-96 overflow-y-auto">
        <div class="flex items-center justify-between p-2 border-b">
          <span class="font-medium">Notifications</span>
          <div class="flex gap-1">
            <Show when={notifications()?.some(n => !n.seen)}>
              <Button variant="ghost" size="sm" class="text-xs" onClick={() => markAllAsRead()}>
                Mark all read
              </Button>
            </Show>
          </div>
        </div>
        <Show
          when={notifications().length > 0}
          fallback={
            <div class="p-4 text-center text-sm text-muted-foreground">No notifications yet.</div>
          }
        >
          <For each={notifications()}>
            {notification => (
              <NotificationItem
                notification={notification}
                onClick={() => handleNotificationClick(notification)}
              />
            )}
          </For>
        </Show>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  function handleNotificationClick(notification: Notification) {
    markAsRead(notification)
    setIsOpen(false)
  }
}

function NotificationItem(props: { notification: Notification; onClick: () => void }) {
  const [author] = createResource(() => props.notification.event.pubkey, loadNostrUser)

  return (
    <DropdownMenuItem class="p-0">
      <A
        href={getTargetUrl(props.notification)}
        class="w-full p-3 no-underline"
        onClick={props.onClick}
      >
        <Card
          class={`p-3 border-0 shadow-none ${props.notification.seen ? "bg-transparent" : "bg-accent/50"}`}
        >
          <div class="flex items-start space-x-3">
            <Avatar class="h-8 w-8 flex-shrink-0">
              <AvatarImage src={author()?.image} alt="avatar" />
              <AvatarFallback>{author()?.npub.slice(-2)}</AvatarFallback>
            </Avatar>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                {getNotificationIcon(props.notification)}
                <span class="text-sm font-medium truncate">{author()?.shortName}</span>
              </div>
              <p class="text-xs text-muted-foreground mb-1">
                {getNotificationText(props.notification)}
              </p>
              <span class="text-xs text-muted-foreground">
                {new Date(props.notification.event.created_at * 1000).toLocaleString()}
              </span>
            </div>
            <Show when={!props.notification.seen}>
              <div class="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
            </Show>
          </div>
        </Card>
      </A>
    </DropdownMenuItem>
  )
}

function getNotificationIcon(notification: Notification) {
  switch (notification.event.kind) {
    case 1244:
      return <MessageCircle class="h-4 w-4 text-blue-500" />
    case 7:
      return <Heart class="h-4 w-4 text-red-500" />
    case 9321:
    case 9735:
      return <Zap class="h-4 w-4 text-yellow-500" />
    default:
    // TODO: other kinds
  }
}

function getNotificationText(notification: Notification) {
  switch (notification.event.kind) {
    case 1244:
      return "replied to your voice note"
    case 7:
      return "liked your voice note"
    case 9321:
    case 9735:
      const amount = getSatoshisAmountFromBolt11(
        notification.event.tags.find(t => t[0] === "bolt11")?.[1] || ""
      )
      return `zapped ${formatZapAmount(amount)} sats`
    default:
    // TODO: other kinds
  }
}

function getTargetUrl(notification: Notification) {
  let tag = notification.event.tags.find(t => t[0] === "E")
  if (!tag) {
    tag = notification.event.tags.find(t => t[0] === "e")
    if (!tag) {
      return null
    }
  }

  const id = tag[1]
  const relay = tag[2]
  const author = tag[3]

  return `/${neventEncode({
    id,
    author,
    relays: Array.from(pool.seenOn.get(id) || [])
      .map(r => r.url)
      .concat(relay)
  })}`
}

export default NotificationBell
