import { loadNostrUser } from "@nostr/gadgets/metadata"
import { makeZapRequest } from "@nostr/tools/nip57"
import { NostrEvent } from "@nostr/tools/pure"
import { decode, EventPointer, neventEncode, npubEncode } from "@nostr/tools/nip19"
import { createResource, createSignal, onCleanup, For, Show, createEffect } from "solid-js"
import { toast } from "solid-sonner"
import { A, useLocation, useNavigate } from "@solidjs/router"
import { Copy, Heart, Loader, Mic, MoreVertical, Share2, Trash2, Zap } from "lucide-solid"
import { pool } from "@nostr/gadgets/global"
import { loadRelayList } from "@nostr/gadgets/lists"
import { SubCloser } from "@nostr/tools/abstract-pool"
import { matchEventPubkey } from "@nostr/tools/fakejson"

import { Button } from "./components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "./components/ui/dialog"
import { Card } from "./components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "./components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "./components/ui/avatar"
import { Badge } from "./components/ui/badge"
import { cn } from "./components/utils"

import user from "./user"
import { formatZapAmount, getSatoshisAmountFromBolt11 } from "./utils"
import settings from "./settings"
import nwc, { getZapEndpoint } from "./zap"
import Create from "./Create"
import { globalRelays } from "./nostr"
import AudioPlayer from "./AudioPlayer"

function VoiceNote(props: { event: NostrEvent; class?: string }) {
  const [author] = createResource(() => props.event.pubkey, loadNostrUser)
  const nevent = () =>
    neventEncode({
      id: props.event.id,
      author: props.event.pubkey,
      relays: Array.from(pool.seenOn.get(props.event.id) || []).map(r => r.url)
    })
  const relays = () =>
    Array.from(pool.seenOn.get(props.event.id) || [])
      .slice(0, 3)
      .map(r => r.url)
      .map(url => (url.startsWith("wss://") ? url.substring(6) : url))
      .map(url => (url.endsWith("/") ? url.slice(0, -1) : url))
  const npub = () => npubEncode(props.event.pubkey)
  const navigate = useNavigate()
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = createSignal(false)
  const [hasReacted, setHasReacted] = createSignal(false)
  const [reactionCount, setReactionCount] = createSignal(0)
  const [replyCount, setReplyCount] = createSignal(0)
  const [hasReplied, setHasReplied] = createSignal(false)
  const [zapAmount, setZapAmount] = createSignal(0)
  const [isZapping, setIsZapping] = createSignal(false)
  const [hasZapped, setHasZapped] = createSignal(false)

  const location = useLocation()

  const [zapEndpoint] = createResource(author, getZapEndpoint)

  // check if the current user has reacted to this message and get reaction count, zap count, reply count etc
  let closer: SubCloser
  createEffect(() => {
    if (closer) closer.close()
    if (theirInbox.loading) return

    closer = pool.subscribe(
      theirInbox(),
      {
        kinds: [7, 9735, 1244],
        "#e": [props.event.id]
      },
      {
        label: "replies/reactions/zaps",
        onevent(event) {
          switch (event.kind) {
            case 9735:
              const amt = getSatoshisAmountFromBolt11(event.tags.find(t => t[0] === "bolt11")[1])
              setZapAmount(curr => curr + amt)
              if (
                user().current &&
                matchEventPubkey(
                  event.tags.find(t => t[0] === "description")[1],
                  user().current.pubkey
                )
              ) {
                setHasZapped(true)
              }
              break
            case 7:
              setReactionCount(curr => curr + 1)
              if (user().current && event.pubkey === user().current.pubkey) {
                setHasReacted(true)
              }
              break
            case 1244:
              setReplyCount(curr => curr + 1)
              if (user().current && event.pubkey === user().current.pubkey) {
                setHasReplied(true)
              }
              break
          }
        }
      }
    )
  })

  onCleanup(() => {
    if (closer) {
      closer.close()
    }
  })

  const [ourOutbox] = createResource(
    user,
    async user => {
      if (!user?.current) return []

      return (await loadRelayList(user.current.pubkey)).items
        .filter(r => r.write)
        .slice(0, 4)
        .map(r => r.url)
    },
    {
      initialValue: []
    }
  )

  const [theirInbox] = createResource(
    () => props.event.pubkey,
    async pubkey => {
      return (await loadRelayList(pubkey)).items
        .filter(r => r.read)
        .slice(0, 4)
        .map(r => r.url)
    }
  )

  const hashtags = () => props.event.tags.filter(t => t[0] === "t").map(t => t[1])
  const isReply = () => !!props.event.tags.find(tag => tag[0] === "e")

  return (
    <div class="block rounded-lg transition-colors hover:bg-accent/50 p-2">
      <Card class={cn(props.class, "p-4 dark:bg-white/12")}>
        <div class="flex items-start space-x-4">
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between">
              <A
                href={`/${npub()}`}
                onClick={e => e.stopPropagation()}
                tabIndex={0}
                aria-label={`View profile of ${author()?.shortName}`}
                class="font-medium cursor-pointer hover:underline flex items-center gap-2"
              >
                <Avatar class="h-10 w-10">
                  <AvatarImage src={author()?.image} alt="avatar" />
                  <AvatarFallback>{author()?.npub.slice(-2)}</AvatarFallback>
                </Avatar>
                <div>{author()?.shortName}</div>
              </A>
              <div class="flex items-center gap-2">
                <span
                  class="text-sm text-muted-foreground hover:underline cursor-pointer"
                  onClick={maybeNavigateToNote}
                >
                  {new Date(props.event.created_at * 1000).toLocaleString()}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger>
                    <Button variant="ghost" size="icon" class="h-8 w-8">
                      <MoreVertical class="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem
                      onClick={() => {
                        navigator.clipboard.writeText(nevent()).then(() => {
                          toast.success("nevent copied to clipboard")
                        })
                      }}
                    >
                      <Copy class="mr-2 h-4 w-4" />
                      Copy nevent
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleShareURL}>
                      <Share2 class="mr-2 h-4 w-4" />
                      Share URL
                    </DropdownMenuItem>
                    <Show when={user().current?.pubkey === props.event.pubkey}>
                      <DropdownMenuItem
                        onClick={() => setIsDeleteDialogOpen(true)}
                        class="text-destructive focus:text-destructive"
                      >
                        <Trash2 class="mr-2 h-4 w-4" />
                        Request deletion
                      </DropdownMenuItem>
                    </Show>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <div class="mt-2">
              <AudioPlayer event={props.event} />
            </div>

            {/* hashtags */}
            {!isReply() && hashtags().length > 0 && (
              <div class="mt-2 flex flex-wrap gap-2">
                <For each={hashtags()}>
                  {tag => (
                    <A
                      href={`/hashtag/${tag}`}
                      onClick={e => e.stopPropagation()}
                      class="no-underline"
                    >
                      <Badge variant="secondary" class="hover:bg-accent">
                        #{tag}
                      </Badge>
                    </A>
                  )}
                </For>
              </div>
            )}

            <div class="mt-4 flex items-center justify-between mr-2">
              <div class="flex items-center gap-2">
                <Create replyingTo={props.event}>
                  <Mic class={`h-5 w-5 ${hasReplied() ? "text-sky-500" : ""}`} />
                  <Show when={replyCount() > 0}>
                    <span class="ml-1 text-sm">{replyCount()}</span>
                  </Show>
                </Create>
                <Button variant="ghost" size="sm" onClick={handleReaction} title="Likes">
                  <Heart class={`h-5 w-5 ${hasReacted() ? "fill-current text-red-500" : ""}`} />
                  <Show when={reactionCount() > 0}>
                    <span class="ml-1 text-sm">{reactionCount()}</span>
                  </Show>
                </Button>
                <Show when={zapEndpoint() && settings().defaultZapAmount}>
                  <Show
                    fallback={
                      <Button variant="ghost" size="sm" onClick={handleZap} title="Zaps">
                        <Zap
                          class={`h-5 w-5 ${hasZapped() ? "text-yellow-500 fill-current" : ""}`}
                        />
                        <Show when={zapAmount() > 0}>
                          <span class="ml-1 text-sm">
                            {formatZapAmount(Math.round(zapAmount()))}
                          </span>
                        </Show>
                      </Button>
                    }
                    when={isZapping()}
                  >
                    <Loader class="text-yellow-500 animate-spin rounded-full h-8 w-8" />
                  </Show>
                </Show>
              </div>
              <div class="flex items-center gap-2 overflow-hidden">
                <div class="hidden sm:flex items-center gap-2">
                  <For each={relays()}>
                    {url => (
                      <Badge
                        variant="outline"
                        class="cursor-pointer font-normal text-xs max-w-36 px-1 text-ellipsis overflow-hidden hover:bg-secondary"
                        onClick={() => maybeNavigateToRelay(url)}
                      >
                        {url}
                      </Badge>
                    )}
                  </For>
                </div>
                <Badge
                  variant="outline"
                  class="hidden md:block cursor-pointer font-normal hover:bg-secondary text-xs px-1"
                  onClick={maybeNavigateToNote}
                  title={nevent()}
                >
                  {nevent().slice(-5)}
                </Badge>
              </div>
            </div>

            <Dialog open={isDeleteDialogOpen()} onOpenChange={setIsDeleteDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete Request</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to request deletion of this message? This action cannot be
                    undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="destructive" onClick={handleDelete}>
                    Request Deletion
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </Card>
    </div>
  )

  function maybeNavigateToNote() {
    if (
      location.pathname.startsWith("/nevent1") &&
      (decode(location.pathname.split("/")[1]).data as EventPointer).id === props.event.id
    ) {
      // we're already there
      return
    }

    navigate(`/${nevent()}`)
  }

  function maybeNavigateToRelay(url: string) {
    const encoded = encodeURIComponent(url)

    if (location.pathname.startsWith("/r/" + encoded)) {
      // don't navigate in this case
      return
    }

    navigate(`/r/${encoded}`)
  }

  async function handleDelete() {
    let res = pool.publish(
      ourOutbox(),
      await user().current.signer.signEvent({
        created_at: Math.round(Date.now() / 1000),
        kind: 5,
        content: "",
        tags: [["e", props.event.id]]
      })
    )

    try {
      await Promise.any(res)
      toast.success("Message deleted")
    } catch (err) {
      toast.error(`Failed to delete: ${err}`)
    }

    setIsDeleteDialogOpen(false)
  }

  async function handleReaction() {
    const reactionTargets = [...(theirInbox() || globalRelays), ...ourOutbox()]

    try {
      if (hasReacted()) {
        // find the user's reaction event and delete
        const userReactions = await pool.querySync(theirInbox() || globalRelays, {
          kinds: [7],
          authors: [user().current.pubkey],
          "#e": [props.event.id]
        })

        if (userReactions.length > 0) {
          pool.publish(
            reactionTargets,
            await user().current.signer.signEvent({
              created_at: Math.round(Date.now() / 1000),
              kind: 5,
              content: "",
              tags: [["e", userReactions[0].id]]
            })
          )
          setHasReacted(false)
          setReactionCount(prev => Math.max(0, prev - 1))
          toast.success("Reaction removed")
        }
      } else {
        // add new reaction
        pool.publish(
          reactionTargets,
          await user().current.signer.signEvent({
            created_at: Math.round(Date.now() / 1000),
            kind: 7,
            content: "+",
            tags: [
              ["e", props.event.id],
              ["p", props.event.pubkey]
            ]
          })
        )
        toast.success("Like sent")
        setHasReacted(true)
      }
    } catch (error) {
      console.error("Error toggling reaction:", error)
      toast.error("Failed to toggle reaction")
    }
  }

  async function handleZap() {
    const cb = zapEndpoint()
    if (!cb) return

    setIsZapping(true)

    try {
      const zr = await user().current.signer.signEvent(
        makeZapRequest({
          profile: props.event.pubkey,
          event: props.event.id,
          amount: settings().defaultZapAmount * 1000,
          relays: [...theirInbox(), ...ourOutbox()],
          comment: ""
        })
      )

      const { pr: invoice } = await (
        await fetch(
          cb +
            (cb.includes("?") ? "&" : "?") +
            "amount=" +
            settings().defaultZapAmount * 1000 +
            "&nostr=" +
            JSON.stringify(zr)
        )
      ).json()

      const amount = getSatoshisAmountFromBolt11(invoice)
      await nwc().payInvoice({ invoice })
      toast.success(`Sent ${amount} sats!`)
      setHasZapped(true)
    } catch (error) {
      console.error("Error sending zap:", error)
      toast.error("Failed to send zap")
    } finally {
      setIsZapping(false)
    }
  }

  async function handleShareURL() {
    try {
      const url = `${window.location.origin}/${nevent()}`
      await navigator.clipboard.writeText(url)
      toast.success("URL copied to clipboard")
    } catch (error) {
      console.error("Error sharing URL:", error)
      toast.error("Failed to share URL")
    }
  }
}

export default VoiceNote
