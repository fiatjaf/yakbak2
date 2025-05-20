import { loadNostrUser } from "@nostr/gadgets/metadata"
import { NostrEvent } from "@nostr/tools/pure"
import { neventEncode, npubEncode } from "@nostr/tools/nip19"
import { onMount, createResource, createSignal, onCleanup, For, createEffect } from "solid-js"
import { toast } from "solid-sonner"
import { A, useNavigate } from "@solidjs/router"
import { Badge, Copy, Heart, MoreVertical, Share2, Trash2, Zap } from "lucide-solid"
import { pool } from "@nostr/gadgets/global"
import { loadRelayList } from "@nostr/gadgets/lists"
import { SubCloser } from "@nostr/tools/abstract-pool"

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
import { Show } from "solid-js"
import { Avatar, AvatarFallback, AvatarImage } from "./components/ui/avatar"

function VoiceNote(props: { event: NostrEvent }) {
  const [author] = createResource(props.event.pubkey, loadNostrUser)
  const nevent = neventEncode({
    id: props.event.id,
    author: props.event.pubkey,
    relays: []
  })
  const npub = npubEncode(props.event.pubkey)
  const navigate = useNavigate()
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = createSignal(false)
  const [hasReacted, setHasReacted] = createSignal(false)
  // const { sendZap, settings } = useNWC()
  const [reactionCount, setReactionCount] = createSignal(0)
  const [zapAmount, setZapAmount] = createSignal(0)
  const [hasZapped, setHasZapped] = createSignal(false)
  let audioRef: HTMLAudioElement | undefined
  const isMessagePage = location.pathname.startsWith("/message/")
  let theirInbox: string[] = []
  let ourOutbox: string[] = []

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
              break
            case 7:
              setReactionCount(curr => curr + 1)
              if (user.current && event.pubkey === user.current.pubkey) {
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
    if (!user.current) return

    ourOutbox = (await loadRelayList(user.current.pubkey)).items
      .filter(r => r.write)
      .slice(0, 4)
      .map(r => r.url)
  })

  const hashtags = () => props.event.tags.filter(t => t[0] === "t").map(t => t[1])
  const isReply = () => !!props.event.tags.find(tag => tag[0] === "e")

  return (
    <div
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
        navigate(`/message/${nevent}`)
      }}
      class={`block rounded-lg transition-colors ${
        isMessagePage ? "" : "hover:bg-accent/50 cursor-pointer"
      }`}
    >
      <Card class="p-4">
        <div class="flex items-start space-x-4">
          <div class="flex-shrink-0">
            <A
              href={`/profile/${npub}`}
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
              <div class="flex items-center space-x-2">
                <A
                  href={`/profile/${npub}`}
                  onClick={e => e.stopPropagation()}
                  tabIndex={0}
                  aria-label={`View profile of ${author()?.shortName}`}
                  class="font-medium cursor-pointer hover:underline"
                >
                  {author()?.shortName}
                </A>
                <span class="text-sm text-muted-foreground">
                  {new Date(props.event.created_at * 1000).toLocaleString()}
                </span>
              </div>
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
                  {user.current?.pubkey === props.event.pubkey && (
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
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReaction}
                class={hasReacted() ? "text-red-500 hover:text-red-600" : ""}
              >
                <Heart class={`h-5 w-5 ${hasReacted() ? "fill-current" : ""}`} />
                <Show when={reactionCount() > 0}>
                  <span class="ml-1 text-sm">{reactionCount()}</span>
                </Show>
              </Button>
              <Button variant="ghost" size="sm" onClick={handleZap}>
                <Zap class={`h-5 w-5 ${hasZapped() ? "text-yellow-500 fill-current" : ""}`} />
                <Show when={zapAmount() > 0}>
                  <span class="ml-1 text-sm">{formatZapAmount(Math.round(zapAmount()))}</span>
                </Show>
              </Button>
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
    let ourOutbox = (await loadRelayList(user.current.pubkey)).items
      .filter(r => r.write)
      .slice(0, 4)
      .map(r => r.url)

    let res = pool.publish(
      ourOutbox,
      await user.current.signer.signEvent({
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
    try {
      if (hasReacted) {
        // find the user's reaction event and delete
        const userReactions = await pool.querySync(theirInbox, [
          {
            kinds: [7],
            authors: [user.pubkey],
            "#e": [message.id]
          }
        ])

        if (userReactions.length > 0) {
          // Delete the reaction
          publishEvent(
            {
              kind: 5,
              content: "",
              tags: [["e", userReactions[0].id]]
            },
            {
              onSuccess: () => {
                setHasReacted(false)
                setReactionCount(prev => Math.max(0, prev - 1))
                toast.success("Reaction removed")
              }
            }
          )
        }
      } else {
        // Add new reaction
        publishEvent(
          {
            kind: 7,
            content: "+",
            tags: [
              ["e", message.id],
              ["p", message.pubkey]
            ]
          },
          {
            onSuccess: () => {
              setHasReacted(true)
              setReactionCount(prev => prev + 1)
              toast.success("Reaction sent")
            }
          }
        )
      }
    } catch (error) {
      console.error("Error toggling reaction:", error)
      toast.error("Failed to toggle reaction")
    }
  }

  async function handleZap() {
    if (!settings?.nwcConnectionString) {
      toast.error("Please set up Nostr Wallet Connect in settings")
      return
    }

    try {
      // Get the author's metadata to find their lightning address
      const authorMetadata = await nostr.query([
        {
          kinds: [0],
          authors: [message.pubkey]
        }
      ])

      const metadata = authorMetadata[0]?.content ? JSON.parse(authorMetadata[0].content) : null
      const lightningAddress = metadata?.lud16

      if (!lightningAddress) {
        toast.error("Author has not set up a lightning address")
        return
      }

      // Create a zap request event
      const zapRequest = {
        kind: 9734,
        content: "",
        tags: [
          ["p", message.pubkey],
          ["e", message.id],
          ["amount", (settings.defaultZapAmount * 1000).toString()], // Convert to msats
          ["relays", ...Array.from(nostr.relays.keys())]
        ]
      }

      // Publish the zap request
      await publishEvent(zapRequest)

      // Send the actual zap
      await sendZap(lightningAddress, settings.defaultZapAmount)
      setHasZapped(true)

      // Wait a bit for the zap receipt to be published
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Query for zap events with a longer timeout
      const zapEvents = await nostr.query(
        [
          {
            kinds: [9734, 9735],
            "#e": [message.id]
          }
        ],
        { signal: AbortSignal.timeout(5000) }
      )

      const totalZaps = zapEvents.reduce((sum, event) => {
        // For zap requests (9734), look for amount in the amount tag
        if (event.kind === 9734) {
          const amountTag = event.tags.find(tag => tag[0] === "amount")?.[1]
          if (amountTag) {
            const amount = parseInt(amountTag) / 1000 // Convert msats to sats
            return sum + amount
          }
        }

        // For zap receipts (9735), look for amount in the description tag
        if (event.kind === 9735) {
          const zapReceipt = event.tags.find(t => tag[0] === "description")?.[1]
          if (!zapReceipt) return sum

          try {
            const receipt = JSON.parse(zapReceipt)
            const amount = receipt.amount
            if (amount) {
              return sum + amount / 1000
            }
          } catch (e) {
            console.error("Error parsing zap receipt:", e)
          }
        }
        return sum
      }, 0)

      setZapAmount(Math.round(totalZaps))
    } catch (error) {
      console.error("Error sending zap:", error)
      toast.error(error instanceof Error ? error.message : "Failed to send zap")
    }
  }

  async function handleShareURL() {
    try {
      const url = `${window.location.origin}/message/${nevent}`
      await navigator.clipboard.writeText(url)
      toast.success("URL copied to clipboard")
    } catch (error) {
      console.error("Error sharing URL:", error)
      toast.error("Failed to share URL")
    }
  }
}

export default VoiceNote
