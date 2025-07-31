import { Bell, Heart, MessageCircle, Zap } from "lucide-solid"
import { createSignal, For, Show, createResource, createEffect } from "solid-js"
import { A } from "@solidjs/router"
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
import {
  notifications,
  unreadCount,
  markAsRead,
  markAllAsRead,
  clearNotifications,
  Notification
} from "../notifications"
import { loadNostrUser } from "@nostr/gadgets/metadata"
import { npubEncode, neventEncode } from "@nostr/tools/nip19"
import { formatZapAmount, getSatoshisAmountFromBolt11 } from "../utils"
import { pool } from "@nostr/gadgets/global"

function NotificationBell() {
  const [isOpen, setIsOpen] = createSignal(false)
  
  // Debug logging
  createEffect(() => {
    console.log(`NotificationBell - notifications count: ${notifications().length}, unread count: ${unreadCount()}`)
  })

  function getNotificationIcon(type: Notification["type"]) {
    switch (type) {
      case "reply":
        return <MessageCircle class="h-4 w-4 text-blue-500" />
      case "reaction":
        return <Heart class="h-4 w-4 text-red-500" />
      case "zap":
        return <Zap class="h-4 w-4 text-yellow-500" />
    }
  }

  function getNotificationText(notification: Notification) {
    switch (notification.type) {
      case "reply":
        return "replied to your voice note"
      case "reaction":
        return "liked your voice note"
      case "zap":
        const amount = getSatoshisAmountFromBolt11(
          notification.event.tags.find(t => t[0] === "bolt11")?.[1] || ""
        )
        return `zapped ${formatZapAmount(amount)} sats`
    }
  }

  function getTargetUrl(notification: Notification) {
    return `/${neventEncode({
      id: notification.targetEvent.id,
      author: notification.targetEvent.pubkey,
      relays: Array.from(pool.seenOn.get(notification.targetEvent.id) || []).map(r => r.url)
    })}`
  }

  function handleNotificationClick(notification: Notification) {
    if (!notification.read) {
      markAsRead(notification.id)
    }
    setIsOpen(false)
  }

  return (
    <DropdownMenu open={isOpen()} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger>
        <Button variant="ghost" size="icon" class="relative">
          <Bell class="h-5 w-5" />
          <Show when={unreadCount() > 0}>
            <Badge
              variant="destructive"
              class="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center"
            >
              {unreadCount() > 9 ? "9+" : unreadCount()}
            </Badge>
          </Show>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent class="w-80 max-h-96 overflow-y-auto">
        <div class="flex items-center justify-between p-2 border-b">
          <span class="font-medium">Notifications</span>
          <div class="flex gap-1">
            <Show when={notifications().some(n => !n.read)}>
              <Button variant="ghost" size="sm" class="text-xs" onClick={() => markAllAsRead()}>
                Mark all read
              </Button>
            </Show>
            <Show when={notifications().length > 0}>
              <Button
                variant="ghost"
                size="sm"
                class="text-xs"
                onClick={() => clearNotifications()}
              >
                Clear
              </Button>
            </Show>
          </div>
        </div>
        <Show
          when={notifications().length > 0}
          fallback={
            <div class="p-4 text-center text-sm text-muted-foreground">No notifications yet</div>
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
          class={`p-3 border-0 shadow-none ${props.notification.read ? "bg-transparent" : "bg-accent/50"}`}
        >
          <div class="flex items-start space-x-3">
            <Avatar class="h-8 w-8 flex-shrink-0">
              <AvatarImage src={author()?.image} alt="avatar" />
              <AvatarFallback>{author()?.npub.slice(-2)}</AvatarFallback>
            </Avatar>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                {getNotificationIcon(props.notification.type)}
                <span class="text-sm font-medium truncate">{author()?.shortName}</span>
              </div>
              <p class="text-xs text-muted-foreground mb-1">
                {getNotificationText(props.notification)}
              </p>
              <span class="text-xs text-muted-foreground">
                {new Date(props.notification.timestamp * 1000).toLocaleString()}
              </span>
            </div>
            <Show when={!props.notification.read}>
              <div class="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
            </Show>
          </div>
        </Card>
      </A>
    </DropdownMenuItem>
  )

  function getNotificationIcon(type: Notification["type"]) {
    switch (type) {
      case "reply":
        return <MessageCircle class="h-4 w-4 text-blue-500" />
      case "reaction":
        return <Heart class="h-4 w-4 text-red-500" />
      case "zap":
        return <Zap class="h-4 w-4 text-yellow-500" />
    }
  }

  function getNotificationText(notification: Notification) {
    switch (notification.type) {
      case "reply":
        return "replied to your voice note"
      case "reaction":
        return "liked your voice note"
      case "zap":
        const amount = getSatoshisAmountFromBolt11(
          notification.event.tags.find(t => t[0] === "bolt11")?.[1] || ""
        )
        return `zapped ${formatZapAmount(amount)} sats`
    }
  }

  function getTargetUrl(notification: Notification) {
    return `/${neventEncode({
      id: notification.targetEvent.id,
      author: notification.targetEvent.pubkey,
      relays: Array.from(pool.seenOn.get(notification.targetEvent.id) || []).map(r => r.url)
    })}`
  }
}

export default NotificationBell
