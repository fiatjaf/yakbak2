import { bech32 } from "@scure/base"
import { loadNostrUser } from "@nostr/gadgets/metadata"
import { makeZapRequest } from "@nostr/tools/nip57"
import { NostrEvent } from "@nostr/tools/pure"
import { neventEncode, npubEncode } from "@nostr/tools/nip19"
import { onMount, createResource, createSignal, onCleanup, For, Show, createEffect } from "solid-js"
import { toast } from "solid-sonner"
import { A, useLocation, useNavigate } from "@solidjs/router"
import { Badge, Copy, Heart, MoreVertical, Share2, Trash2, Zap } from "lucide-solid"
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

import user from "./user"
import { formatZapAmount, getSatoshisAmountFromBolt11 } from "./utils"
import { Avatar, AvatarFallback, AvatarImage } from "./components/ui/avatar"
import settings from "./settings"
import nwc from "./nwc"
import Create from "./Create"

function VoiceNote(props: { event: NostrEvent }) {
  const [author] = createResource(props.event.pubkey, loadNostrUser)
  const nevent = neventEncode({
    id: props.event.id,
    author: props.event.pubkey,
    relays: Array.from(pool.seenOn.get(props.event.id)).map(r => r.url)
  })
  const npub = npubEncode(props.event.pubkey)
  const navigate = useNavigate()
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = createSignal(false)
  const [hasReacted, setHasReacted] = createSignal(false)
  const [reactionCount, setReactionCount] = createSignal(0)
  const [zapAmount, setZapAmount] = createSignal(0)
  const [hasZapped, setHasZapped] = createSignal(false)
  let audioRef: HTMLAudioElement | undefined

  const location = useLocation()
  const isMessagePage = location.pathname.startsWith("/nevent1")

  let theirInbox: string[] = []
  let ourOutbox: string[] = []
  const [zapEndpoint] = createResource(author, async author => {
    const metadata = author.metadata
    if (!metadata) return undefined

    const { lud06, lud16 } = metadata
    let lnurl: string
    if (lud06) {
      let { words } = bech32.decode(lud06, 1000)
      let data = bech32.fromWords(words)
      lnurl = new TextDecoder().decode(data)
    } else if (lud16) {
      let [name, domain] = lud16.split("@")
      lnurl = new URL(`/.well-known/lnurlp/${name}`, `https://${domain}`).toString()
    } else {
      return undefined
    }

    let res = await fetch(lnurl)
    let body = await res.json()

    if (body.allowsNostr && body.nostrPubkey) {
      return body.callback
    }

    return undefined
  })

  // Check if the current user has reacted to this message and get reaction count
  let closer: SubCloser
  onMount(async () => {
    theirInbox = (await loadRelayList(props.event.pubkey)).items
      .filter(r => r.read)
      .slice(0, 4)
      .map(r => r.url)

    closer = pool.subscribe(
      theirInbox,
      {
        kinds: [7, 9735],
        "#e": [props.event.id]
      },
      {
        label: "reactions",
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
                break
              }
              break
            case 7:
              setReactionCount(curr => curr + 1)
              if (user().current && event.pubkey === user().current.pubkey) {
                setHasReacted(true)
                break
              }
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

  createEffect(async () => {
    if (!user().current) return

    ourOutbox = (await loadRelayList(user().current.pubkey)).items
      .filter(r => r.write)
      .slice(0, 4)
      .map(r => r.url)
  })

  const hashtags = () => props.event.tags.filter(t => t[0] === "t").map(t => t[1])
  const isReply = () => !!props.event.tags.find(tag => tag[0] === "e")

  return (
    <div class={`block rounded-lg transition-colors hover:bg-accent/50 cursor-pointer`}>
      <Card class="p-4">
        <div class="flex items-start space-x-4">
          <div class="flex-shrink-0">
            <A
              href={`/${npub}`}
              onClick={e => e.stopPropagation()}
              tabIndex={0}
              aria-label={`View profile of ${author()?.shortName}`}
            >
              <Avatar class="h-10 w-10">
                <AvatarImage src={author()?.image} alt="avatar" />
                <AvatarFallback>{author()?.npub.slice(-2)}</AvatarFallback>
              </Avatar>
            </A>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between">
              <A
                href={`/${npub}`}
                onClick={e => e.stopPropagation()}
                tabIndex={0}
                aria-label={`View profile of ${author()?.shortName}`}
                class="font-medium cursor-pointer hover:underline"
              >
                {author()?.shortName}
              </A>
              <div class="flex items-center gap-2">
                <span
                  class="text-sm text-muted-foreground hover:underline"
                  onClick={e => {
                    if (
                      isMessagePage ||
                      (e.target instanceof HTMLElement &&
                        (e.target.closest("button") ||
                          e.target.closest("a") ||
                          e.target.closest('[role="menu"]')))
                    ) {
                      return
                    }
                    navigate(`/${nevent}`)
                  }}
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
                    {nevent && (
                      <DropdownMenuItem
                        onClick={async () => {
                          await navigator.clipboard.writeText(nevent)
                          toast.success("nevent copied to clipboard")
                        }}
                      >
                        <Copy class="mr-2 h-4 w-4" />
                        Copy nevent
                      </DropdownMenuItem>
                    )}
                    {nevent && (
                      <DropdownMenuItem onClick={handleShareURL}>
                        <Share2 class="mr-2 h-4 w-4" />
                        Share URL
                      </DropdownMenuItem>
                    )}
                    {user().current?.pubkey === props.event.pubkey && (
                      <DropdownMenuItem
                        onClick={() => setIsDeleteDialogOpen(true)}
                        class="text-destructive focus:text-destructive"
                      >
                        <Trash2 class="mr-2 h-4 w-4" />
                        Request deletion
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <div class="mt-2">
              <audio
                controls
                class="w-full"
                ref={audioRef}
                src={props.event.content}
                preload="metadata"
              >
                Your browser does not support the audio element.
              </audio>
            </div>

            {/* Hashtags display */}
            {!isReply && hashtags.length > 0 && (
              <div class="mt-2 flex flex-wrap gap-2">
                <For each={hashtags()}>
                  {tag => (
                    <A
                      href={`/hashtag/${tag}`}
                      onClick={e => e.stopPropagation()}
                      class="no-underline"
                    >
                      <Badge class="hover:bg-accent">#{tag}</Badge>
                    </A>
                  )}
                </For>
              </div>
            )}

            <div class="mt-4 flex items-center flex-wrap gap-6">
              <Show when={user()?.current}>
                <Create replyingTo={props.event} />
              </Show>
              <Button variant="ghost" size="sm" onClick={handleReaction}>
                <Heart class={`h-5 w-5 ${hasReacted() ? "fill-current text-red-500" : ""}`} />
                <Show when={reactionCount() > 0}>
                  <span class="ml-1 text-sm">{reactionCount()}</span>
                </Show>
              </Button>
              <Show when={zapEndpoint() && settings().defaultZapAmount}>
                <Button variant="ghost" size="sm" onClick={handleZap}>
                  <Zap class={`h-5 w-5 ${hasZapped() ? "text-yellow-500 fill-current" : ""}`} />
                  <Show when={zapAmount() > 0}>
                    <span class="ml-1 text-sm">{formatZapAmount(Math.round(zapAmount()))}</span>
                  </Show>
                </Button>
              </Show>
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

  async function handleDelete() {
    let ourOutbox = (await loadRelayList(user().current.pubkey)).items
      .filter(r => r.write)
      .slice(0, 4)
      .map(r => r.url)

    let res = pool.publish(
      ourOutbox,
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
    const reactionTargets = [...theirInbox, ...ourOutbox]

    try {
      if (hasReacted()) {
        // find the user's reaction event and delete
        const userReactions = await pool.querySync(theirInbox, {
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

    const zr = await user().current.signer.signEvent(
      makeZapRequest({
        profile: props.event.pubkey,
        event: props.event.id,
        amount: settings().defaultZapAmount * 1000,
        relays: [...theirInbox, ...ourOutbox],
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

    try {
      const amount = getSatoshisAmountFromBolt11(invoice)
      await nwc().payInvoice({ invoice })
      toast.success(`Sent ${amount} sats!`)
      setHasZapped(true)
    } catch (error) {
      console.error("Error sending zap:", error)
      toast.error("Failed to send zap")
    }
  }

  async function handleShareURL() {
    try {
      const url = `${window.location.origin}/${nevent}`
      await navigator.clipboard.writeText(url)
      toast.success("URL copied to clipboard")
    } catch (error) {
      console.error("Error sharing URL:", error)
      toast.error("Failed to share URL")
    }
  }
}

export default VoiceNote
