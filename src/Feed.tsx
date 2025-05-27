import { batch, createEffect, createSignal, For, Match, onCleanup, Show, Switch } from "solid-js"
import { Globe, Loader, Telescope, User, Users } from "lucide-solid"
import { createVisibilityObserver } from "@solid-primitives/intersection-observer"
import { NostrEvent } from "@nostr/tools/pure"
import { pool } from "@nostr/gadgets/global"
import { loadFollowsList } from "@nostr/gadgets/lists"
import { SubCloser } from "@nostr/tools/abstract-pool"

import VoiceNote from "./VoiceNote"
import user from "./user"
import { ToggleGroup, ToggleGroupItem } from "./components/ui/toggle-group"
import { DefinedTab, getRequestDeclaration, global, Tab } from "./nostr"

const NOTES_PER_PAGE = 3
const INITIAL_THRESHOLD = 7

function Feed(props: { forcedTabs?: DefinedTab[]; invisibleToggles?: boolean }) {
  // eslint-disable-next-line solid/reactivity
  const [tab, setTab] = createSignal<DefinedTab>(props.forcedTabs ? props.forcedTabs[0] : global)
  const [notes, setNotes] = createSignal<NostrEvent[]>([])
  const [isLoading, setLoading] = createSignal(false)
  // eslint-disable-next-line solid/reactivity
  const [visibleTabs, setVisibleTabs] = createSignal<[string, Tab][]>(props.forcedTabs ?? [global])
  let allEvents: NostrEvent[] = []
  let threshold = INITIAL_THRESHOLD

  let ref: HTMLDivElement | undefined
  let closer: SubCloser
  const visible = createVisibilityObserver({ threshold: 1 })(() => ref)

  onCleanup(() => {
    if (closer) closer.close()
  })

  createEffect(() => {
    if (closer) closer.close()
    const selected = tab()

    ;(async () => {
      console.log("starting subscription", selected)
      allEvents = []
      threshold = INITIAL_THRESHOLD
      setLoading(true)
      setNotes([])

      const requestMap = await getRequestDeclaration(selected[1], {
        ...(selected[1].baseFilter || {}),
        kinds: [1222],
        limit: 400 // see note about this under "infinite scroll / pagination"
      })
      let eosed = false
      let doneWaiting = setTimeout(flush, 2800)
      closer = pool.subscribeMap(requestMap, {
        label: `feed-${selected[0]}`,
        onevent(event) {
          if (event.tags.find(t => t[0] === "e")) return
          allEvents.push(event)
          if (eosed) {
            allEvents.unshift(event)
            setNotes(events => [event, ...events])
            threshold++
          }
        },
        oneose() {
          clearTimeout(doneWaiting)
          eosed = true
          flush()
        }
      })

      function flush() {
        allEvents.sort((a, b) => b.created_at - a.created_at)
        batch(() => {
          setNotes(allEvents.slice(0, threshold))
          setLoading(false)
        })
      }
    })()
  })

  // infinite scroll / pagination
  createEffect(() => {
    if (visible()) {
      // our infinite scroll is just allowing more events to be rendered
      // we already have these events in memory, but we don't render them all at once because it's wasteful
      // (requires opening more subscriptions, fetching replies etc)
      // TODO: store things locally instead of having to download a ton of events on first load
      console.log("infinite scroll next page threshold")
      threshold += NOTES_PER_PAGE
      setNotes(allEvents.slice(0, threshold))
    }
  })

  createEffect(() => {
    if (props.forcedTabs) return

    if (!user()?.current) {
      setVisibleTabs([global])
      return
    }

    loadFollowsList(user().current.pubkey).then(follows => {
      setVisibleTabs([global, ["Following", { type: "users", pubkeys: follows.items }]])
    })
  })

  return (
    <div class="space-y-4">
      <Show when={!props.invisibleToggles}>
        <div class="flex justify-center -mt-6 mb-2">
          <ToggleGroup
            value={tab()[0]}
            onChange={(value: string) => value && setTab(visibleTabs().find(vt => vt[0] === value))}
          >
            <For each={visibleTabs()}>
              {dt => (
                <ToggleGroupItem value={dt[0]} aria-label={dt[0]}>
                  <Switch>
                    <Match when={dt[0] === "Global"}>
                      <Globe class="h-4 w-4 mr-2" />
                    </Match>
                    <Match when={dt[1].type === "users" && dt[1].pubkeys.length === 1}>
                      <User class="h-4 w-4 mr-2" />
                    </Match>
                    <Match when={dt[1].type === "users" && dt[1].pubkeys.length > 1}>
                      <Users class="h-4 w-4 mr-2" />
                    </Match>
                    <Match when={dt[1].type === "relays"}>
                      <Telescope class="h-4 w-4 mr-2" />
                    </Match>
                  </Switch>
                  {dt[0]}
                </ToggleGroupItem>
              )}
            </For>
          </ToggleGroup>
        </div>
      </Show>

      <div class="space-y-4">
        <Switch>
          <Match when={isLoading()}>
            <div class="flex justify-center mt-12">
              <Loader class="animate-spin rounded-full h-8 w-8" />
            </div>
          </Match>
          <Match when={true}>
            <For each={notes()}>
              {note => (
                <div class="space-y-4">
                  <VoiceNote event={note} />
                </div>
              )}
            </For>
          </Match>
        </Switch>
      </div>

      <div ref={ref} class="h-12 w-full flex items-center justify-center" />

      {/*
        {isFetchingNextPage ? (
          <Loader class="animate-spin rounded-full h-4 w-4" />
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

export default Feed
