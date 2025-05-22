import {
  Component,
  createEffect,
  createSignal,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch
} from "solid-js"
import { ChevronDown, ChevronUp, Globe, Users } from "lucide-solid"
import { createVisibilityObserver } from "@solid-primitives/intersection-observer"
import { NostrEvent } from "@nostr/tools/pure"
import { pool } from "@nostr/gadgets/global"
import { SubCloser } from "@nostr/tools/abstract-pool"
import { loadRelayList } from "@nostr/gadgets/lists"
import { getSemaphore } from "@henrygd/semaphore"

import { Button } from "./components/ui/button"
import VoiceNote from "./VoiceNote"
import user from "./user"
import { ToggleGroup, ToggleGroupItem } from "./components/ui/toggle-group"

type TabName = "global" | "following"

type Thread = { event: NostrEvent; children: Thread[]; expanded: boolean }

const globalRelays = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://nostr.wine",
  "wss://relay.nostr.band"
]

function Feed() {
  const [tab, setTab] = createSignal<TabName>("global")
  const [threads, setThreads] = createSignal<Thread[]>([])
  const [error, setError] = createSignal<null | string>(null)
  const [isLoading, setLoading] = createSignal(false)

  let ref: HTMLDivElement | undefined
  let closer: SubCloser
  let events: NostrEvent[] = []
  const visible = createVisibilityObserver({ threshold: 1 })(() => ref)

  onCleanup(() => {
    if (closer) closer.close()
  })
  onMount(() => {
    console.log("starting subscription")
    setLoading(true)

    let eosed = true
    switch (tab()) {
      case "global": {
        closer = pool.subscribe(
          globalRelays,
          { kinds: [1222], limit: 100 },
          {
            label: "global-feed",
            onevent(event) {
              if (event.tags.find(t => t[0] === "e")) return

              events.push(event)
              if (eosed) {
                setThreads(threads => [{ event, children: [], expanded: false }, ...threads])
                loadReplies(event)
              }
            },
            oneose() {
              eosed = true
              events.sort((a, b) => b.created_at - a.created_at)
              setThreads(
                events.map(event => {
                  loadReplies(event)
                  return { event, children: [], expanded: false }
                })
              )
              setLoading(false)
            }
          }
        )
        break
      }
      case "following": {
        break
      }
    }

    async function loadReplies(parent: NostrEvent) {
      const inbox = (await loadRelayList(parent.pubkey)).items
        .filter(r => r.read)
        .slice(0, 4)
        .map(r => r.url)

      const msem = inbox.map(r => getSemaphore(r))
      await Promise.all(msem.map(sem => sem.acquire()))

      const replies = await pool.querySync(
        inbox,
        {
          kinds: [1244],
          "#e": [parent.id],
          limit: 30
        },
        { label: "replies-f" }
      )

      msem.forEach(sem => sem.release())

      setThreads(threads => {
        let idx = threads.findIndex(thread => thread.event === parent)
        threads[idx].children = replies.map(event => ({ event, children: [], expanded: false }))
        return threads
      })
    }
  })

  createEffect(() => {
    if (visible()) {
      console.log("fetch next page")
    }
  })

  return (
    <div class="space-y-4">
      <Show when={!!user().current}>
        <div class="flex justify-center -mt-6 mb-2">
          <ToggleGroup
            value={tab()}
            onChange={(value: string) => value && setTab(value as TabName)}
          >
            <ToggleGroupItem value="global" aria-label="Global feed">
              <Globe class="h-4 w-4 mr-2" />
              Global
            </ToggleGroupItem>
            <ToggleGroupItem value="following" aria-label="Following feed">
              <Users class="h-4 w-4 mr-2" />
              Following
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </Show>

      <div class="space-y-4">
        <Switch>
          <Match when={isLoading()}>
            <div class="flex justify-center">
              <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
            </div>
          </Match>
          <Match when={error()}>
            <div class="text-center text-red-500">Error loading messages</div>
          </Match>
          <Match when={true}>
            <For each={threads()}>
              {thread => (
                <div class="space-y-4">
                  <VoiceNote event={thread.event} />
                  <Show when={thread.children.length}>
                    <div class="ml-8">
                      <Button
                        variant="ghost"
                        size="sm"
                        class="flex items-center gap-2 text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          setThreads(threads => {
                            const idx = threads.indexOf(thread)
                            threads[idx].expanded = true
                            return threads
                          })
                        }
                      >
                        <Switch>
                          <Match when={thread.expanded}>
                            <ChevronUp class="h-4 w-4" />
                          </Match>
                          <Match when={!thread.expanded}>
                            <ChevronDown class="h-4 w-4" />
                          </Match>
                        </Switch>
                        {thread.children.length}{" "}
                        {thread.children.length === 1 ? "reply" : "replies"}
                      </Button>
                      <Show when={thread.expanded}>
                        <div class="mt-2 space-y-4 border-l-2 border-muted pl-4">
                          <For each={thread.children}>
                            {reply => <VoiceNote event={reply.event} />}
                          </For>
                        </div>
                      </Show>
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </Match>
        </Switch>
      </div>

      <div ref={ref} class="h-12 w-full flex items-center justify-center"></div>

      {/*
        {isFetchingNextPage ? (
          <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900" />
        ) : !hasNextPage && hasMessages ? (
          <div class="text-sm text-muted-foreground">No more messages</div>
        ) : !hasMessages ? (
          <div class="text-sm text-muted-foreground">
            {filter === "following" && !user
              ? "Please log in to see messages from people you follow"
              : filter === "following" && user
                ? "No messages from people you follow yet"
                : "No messages yet. Be the first to record a voice message!"}
          </div>
        ) : null}
      */}
    </div>
  )
}

export default Feed as Component
