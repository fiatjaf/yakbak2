import { decode, EventPointer } from "@nostr/tools/nip19"
import { NostrEvent } from "@nostr/tools/pure"
import { useParams } from "@solidjs/router"
import {
  createResource,
  createEffect,
  createSignal,
  For,
  onCleanup,
  Show,
  Switch,
  Match
} from "solid-js"
import { pool } from "@nostr/gadgets/global"
import { loadRelayList } from "@nostr/gadgets/lists"
import { SubCloser } from "@nostr/tools/abstract-pool"

import VoiceNote from "./VoiceNote"
import { Card } from "./components/ui/card"
import { Loader } from "lucide-solid"

function VoiceNotePage() {
  const { nevent } = useParams<{ nevent: string }>()

  const [event] = createResource(nevent, async () => {
    const ptr = decode(nevent).data as EventPointer
    if (ptr.relays) {
      let res = await pool.querySync(ptr.relays, { ids: [ptr.id] }, { label: "note-1st" })
      if (res.length) return res[0]
    }
    let outboxMinusHint = (await loadRelayList(ptr.author)).items
      .filter(r => r.write && ptr.relays.indexOf(r.url) === -1)
      .slice(0, 4)
      .map(r => r.url)
    const res = await pool.querySync(outboxMinusHint, { ids: [ptr.id] }, { label: "note-2nd" })
    if (res.length === 0) throw new Error(`couldn't find event ${ptr.id}`)
    return res[0]
  })

  const [root] = createResource<NostrEvent | null, NostrEvent>(event, async (event: NostrEvent) => {
    const tag = event.tags.find(t => t[0] === "E")
    if (!tag) return null

    const id = tag[1]
    const hint = tag[2]
    if (hint) {
      let res = await pool.querySync([hint], { ids: [id] }, { label: "parent-1st" })
      if (res.length) return res[0]
    }
    const author = tag[3]
    let outboxMinusHint = (await loadRelayList(author)).items
      .filter(r => r.write && r.url !== hint)
      .slice(0, 4)
      .map(r => r.url)
    const res = await pool.querySync(outboxMinusHint, { ids: [id] }, { label: "parent-2nd" })
    return res[0] || null
  })

  const [replies, setReplies] = createSignal<NostrEvent[]>([])

  let closer: SubCloser
  createEffect(async () => {
    const parent = event()
    if (!parent) return
    const inbox = (await loadRelayList(parent.pubkey)).items
      .filter(r => r.read)
      .slice(0, 4)
      .map(r => r.url)

    let eosed = false
    let waiting: NostrEvent[] = []

    if (closer) closer.close()

    closer = pool.subscribe(
      inbox,
      {
        kinds: [1244],
        "#e": [parent.id],
        limit: 30
      },
      {
        label: "replies-n",
        onevent(event) {
          if (eosed) {
            setReplies(replies => [event, ...replies])
          } else {
            waiting.push(event)
          }
        },
        oneose() {
          waiting.sort((a, b) => b.created_at - a.created_at)
          setReplies(waiting)
          waiting = null
          eosed = true
        }
      }
    )
  })

  onCleanup(() => {
    if (closer) closer.close()
  })

  return (
    <Switch>
      <Match when={event.error}>
        <div class="container mx-auto px-4 py-8 max-w-2xl">
          <div class="text-center">Invalid message</div>
        </div>
      </Match>
      <Match when={event.loading}>
        <div class="container mx-auto px-4 py-8 max-w-2xl">
          <div class="flex justify-center">
            <Loader class="animate-spin rounded-full h-8 w-8" />
          </div>
        </div>
      </Match>
      <Match when={!event()}>
        <div class="container mx-auto px-4 py-8 max-w-2xl">
          <div class="text-center">Message not found</div>
        </div>
      </Match>
      <Match when={true}>
        <div class="container mx-auto px-4 py-8 max-w-2xl">
          {/* Show root message if this is a reply */}
          <Show when={root()}>
            <div class="mb-2">
              <Card class="p-4 border-2 border-primary/40 bg-muted/50">
                <VoiceNote event={root()} />
              </Card>
            </div>
          </Show>
          {/* if root is shown, nest the current message visually */}
          <div class={root() ? "ml-6 border-l-2 border-primary/30 pl-4" : ""}>
            <Show when={root()}>
              <div class="text-xs text-muted-foreground mb-2 font-semibold uppercase tracking-wide">
                Reply
              </div>
            </Show>
            <VoiceNote event={event()} />
          </div>
          <Show when={replies()?.length > 0}>
            <h2 class="text-lg font-semibold my-6">Replies</h2>
            <Show when={replies().length > 0}>
              <div class="space-y-4">
                <For each={replies()}>
                  {reply => (
                    <div class="ml-6 border-l-2 border-primary/20 pl-4">
                      <VoiceNote event={reply} />
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </div>
      </Match>
    </Switch>
  )
}

export default VoiceNotePage
