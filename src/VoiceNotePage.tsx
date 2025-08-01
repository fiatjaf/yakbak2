import { decode, EventPointer } from "@nostr/tools/nip19"
import { NostrEvent } from "@nostr/tools/pure"
import { Loader } from "lucide-solid"
import { createStore } from "solid-js/store"
import { useParams } from "@solidjs/router"
import { createResource, createEffect, For, onCleanup, Show, Switch, Match, batch } from "solid-js"
import { pool } from "@nostr/gadgets/global"
import { loadRelayList } from "@nostr/gadgets/lists"
import { SubCloser } from "@nostr/tools/abstract-pool"

import VoiceNote from "./VoiceNote"
import { outbox } from "./nostr"

type SubThread = {
  event: NostrEvent
  children: SubThread[]
}

function VoiceNotePage() {
  const params = useParams<{ nevent: string }>()

  const [event] = createResource(
    () => params.nevent,
    async nevent => {
      const ptr = decode(nevent).data as EventPointer

      // try on local database
      let res = await outbox.store.getByIds([ptr.id])
      if (res.length) return res[0]

      // try on relays from hint
      if (ptr.relays) {
        let res = await pool.querySync(ptr.relays, { ids: [ptr.id] }, { label: "note-1st" })
        if (res.length) return res[0]
      }

      // try on outbox relays if there is an author hint
      if (ptr.author) {
        let outboxMinusHint = (await loadRelayList(ptr.author)).items
          .filter(r => r.write && ptr.relays.indexOf(r.url) === -1)
          .slice(0, 4)
          .map(r => r.url)
        res = await pool.querySync(outboxMinusHint, { ids: [ptr.id] }, { label: "note-2nd" })
        if (res.length === 0) throw new Error(`couldn't find event ${ptr.id}`)
        return res[0]
      }
    }
  )

  const [root] = createResource<NostrEvent | null, NostrEvent>(event, async (event: NostrEvent) => {
    const tag = event.tags.find(t => t[0] === "E")
    if (!tag) return event

    const id = tag[1]
    // try on local database
    let res = await outbox.store.getByIds([id])
    if (res.length) return res[0]

    const hint = tag[2]
    if (hint) {
      let res = await pool.querySync([hint], { ids: [id] }, { label: "parent-1st" })
      if (res.length) return res[0]
    }

    // try relays from the author if there is an author hint
    const author = tag[3]
    let authorOutboxMinusHint: string[] = []
    if (author) {
      authorOutboxMinusHint = (await loadRelayList(author)).items
        .filter(r => r.write && r.url !== hint)
        .slice(0, 4)
        .map(r => r.url)

      // try on outbox relays
      const res = await pool.querySync(
        authorOutboxMinusHint,
        { ids: [id] },
        { label: "parent-2nd" }
      )
      if (res.length) return res[0]
    }

    // now try the same relays this note was found in
    const sameRelayMinusHintAndOutbox = Array.from(pool.seenOn.get(event.id) || [])
      .map(r => r.url)
      .filter(url => url !== hint && authorOutboxMinusHint.indexOf(url) === -1)
    res = await pool.querySync(sameRelayMinusHintAndOutbox, { ids: [id] }, { label: "parent-3nd" })
    if (res.length) return res[0]

    // fallback to treating this as the root if none other is found
    return event
  })

  const [thread, setThread] = createStore<Record<string, SubThread>>({})

  let closer: SubCloser
  createEffect(() => {
    const root_ = root()
    if (!root_) return
    ;(async () => {
      let waiting: NostrEvent[] = []

      // fetch from our database
      for await (let event of outbox.store.queryEvents({
        kinds: [1244],
        "#E": [root_.id],
        limit: 30
      })) {
        waiting.push(event)
      }

      // fetch from relays
      let inbox = (await loadRelayList(root_.pubkey)).items
        .filter(r => r.read)
        .slice(0, 4)
        .map(r => r.url)

      if (root_.id !== event()?.id) {
        inbox = inbox.concat(
          (await loadRelayList(event().pubkey)).items
            .filter(r => r.read)
            .slice(0, 4)
            .map(r => r.url)
        )
      }

      let eosed = false

      if (closer) closer.close()

      closer = pool.subscribe(
        inbox,
        {
          kinds: [1244],
          "#E": [root_.id],
          limit: 30
        },
        {
          label: "replies-n",
          onevent(event) {
            if (eosed) {
              const parentId = event.tags.find(t => t[0] === "e")[1]
              if (parentId in thread) {
                batch(() => {
                  const subt = { event, children: [] }
                  setThread(parentId, "children", thread[parentId].children.length, subt)
                  setThread(event.id, subt)
                })
              } else if (parentId === root_.id) {
                setThread(event.id, { event, children: [] })
              } else {
                console.warn("couldn't find the parent for", event, "in the thread")
                return
              }
            } else {
              waiting.push(event)
            }
          },
          oneose() {
            waiting.sort((a, b) => b.created_at - a.created_at)
            const thread: Record<string, SubThread> = {}

            for (let i = waiting.length - 1; i >= 0; i--) {
              const event = waiting[i]
              const parentId = event.tags.find(t => t[0] === "e")[1]
              if (parentId && parentId !== root_.id) {
                const parent = thread[parentId]
                if (!parent) {
                  console.warn("couldn't find the parent for", event, "in the thread")
                  continue
                }
                const subt = { event, children: [] }
                parent.children.push(subt)
                thread[event.id] = subt
              }
              thread[event.id] = { event, children: [] }
            }

            setThread(thread)
            waiting = null
            eosed = true
          }
        }
      )
    })()
  })

  onCleanup(() => {
    if (closer) closer.close()
  })

  return (
    <Switch>
      <Match when={event.error}>
        <div class="container mx-auto px-4 py-8 max-w-2xl">
          <div class="text-center">Something went wrong: {String(event.error)}</div>
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
          <div class="text-center">Voice note not found</div>
        </div>
      </Match>
      <Match when={root()}>
        <div class="container mx-auto px-4 py-8 max-w-2xl">
          <div class="mb-2">
            <VoiceNote
              event={root()}
              class={
                event()?.id === root()?.id ? "border-green-200/50 border-2" : "border-primary/20"
              }
            />
          </div>
          <Show when={Object.keys(thread).length > 0}>
            <For each={Object.values(thread)}>
              {subt => (
                <Show when={subt.event.tags.find(t => t[0] === "e")[1] === root().id}>
                  <ThreadWrapper {...subt} />
                </Show>
              )}
            </For>
          </Show>
        </div>
      </Match>
    </Switch>
  )

  function ThreadWrapper(props: SubThread) {
    return (
      <div class="translate-x-4">
        <VoiceNote
          event={props.event}
          class={`${props.event.id === event()?.id ? "border-green-200/50 border-2" : "border-primary/20"}`}
        />
        <For each={props.children}>{subt => <ThreadWrapper {...subt} />}</For>
      </div>
    )
  }
}

export default VoiceNotePage
