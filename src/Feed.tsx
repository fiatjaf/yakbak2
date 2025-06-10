import { batch, createEffect, createSignal, For, Match, onCleanup, Show, Switch } from "solid-js"
import { Globe, Loader, Telescope, User, Users } from "lucide-solid"
import { createVisibilityObserver } from "@solid-primitives/intersection-observer"
import { NostrEvent } from "@nostr/tools/pure"
import { Filter } from "@nostr/tools/filter"
import { pool } from "@nostr/gadgets/global"
import { outboxFilterRelayBatch } from "@nostr/gadgets/outbox"
import { DuplicateEventError } from "@nostr/gadgets/store"
import { loadFavoriteRelays, loadFollowsList } from "@nostr/gadgets/lists"
import { SubCloser } from "@nostr/tools/abstract-pool"
import { Image } from "@kobalte/core/image"

import { ToggleGroup, ToggleGroupItem } from "./components/ui/toggle-group"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "./components/ui/dropdown-menu"

import user from "./user"
import { DefinedTab, global, outbox, Tab } from "./nostr"
import { prettyRelayURL } from "./utils"
import VoiceNote from "./VoiceNote"
import { Button } from "./components/ui/button"
import { useNavigate } from "@solidjs/router"
import debounce from "debounce"

const NOTES_PER_PAGE = 3
const INITIAL_THRESHOLD = 7

function Feed(props: { forcedTabs?: DefinedTab[]; invisibleToggles?: boolean }) {
  // eslint-disable-next-line solid/reactivity
  const [tab, setTab] = createSignal<DefinedTab>(props.forcedTabs ? props.forcedTabs[0] : global)
  const [notes, setNotes] = createSignal<NostrEvent[]>([])
  const [isLoading, setLoading] = createSignal(false)
  // eslint-disable-next-line solid/reactivity
  const [visibleTabs, setVisibleTabs] = createSignal<[string, Tab][]>(props.forcedTabs ?? [global])
  const [paginable, setPaginable] = createSignal(false)
  const navigate = useNavigate()

  let pageManager: {
    showMore: () => void
  }

  let ref: HTMLDivElement | undefined
  let closer: SubCloser
  let abort = new AbortController()
  const visible = createVisibilityObserver({ threshold: 1 })(() => ref)

  onCleanup(() => {
    if (closer) closer.close()
    abort.abort("<Feed /> component cleanup")
  })

  createEffect(() => {
    if (closer) closer.close()
    abort.abort("<Feed /> tab changed")
    abort = new AbortController()
    const signal = abort.signal

    signal.onabort = v => console.debug("aborted!", v)

    const [selectedLabel, selectedTab] = tab()
    setPaginable(false)

    if (selectedTab.type === "relaysubmenu") {
      console.error("this should never happen")
      return
    }

    // ~
    ;(async () => {
      console.log("starting subscription", selectedLabel, selectedTab)
      setPaginable(false)
      setLoading(true)
      setNotes([])

      switch (selectedTab.type) {
        case "relays": {
          // relay feed
          const relayPager = {
            allEvents: [],
            threshold: INITIAL_THRESHOLD,
            showMore() {
              const hasNew = this.allEvents.length > this.threshold
              if (hasNew) {
                this.threshold += NOTES_PER_PAGE
                setNotes(this.allEvents.slice(0, this.threshold))
              } else {
                setPaginable(false)
                // TODO: load more from relays somehow
              }
            }
          }
          pageManager = relayPager

          const declaration: { url: string; filter: Filter }[] = []
          for (let i = 0; i < selectedTab.relays.length; i++) {
            declaration.push({
              url: selectedTab.relays[i],
              filter: {
                kinds: [1222],

                // hashtags and whatever else goes here
                ...selectedTab.baseFilter,

                // see note about this under "infinite scroll / pagination"
                limit: 400
              }
            })
          }

          let eosed = false
          let doneWaiting = setTimeout(flush, 2800)
          closer = pool.subscribeMap(declaration, {
            onauth: evtt => user().current.signer.signEvent(evtt),
            label: `feed-${selectedLabel}`,
            onevent(event) {
              relayPager.allEvents.push(event)
              if (eosed) {
                relayPager.allEvents.unshift(event)
                setNotes(events => [event, ...events])
                relayPager.threshold++
              }
            },
            oneose() {
              clearTimeout(doneWaiting)
              eosed = true
              flush()
            }
          })

          signal.addEventListener("abort", () => {
            closer.close()
          })

          function flush() {
            if (signal.aborted) return

            relayPager.allEvents.sort((a, b) => b.created_at - a.created_at)
            batch(() => {
              setNotes(relayPager.allEvents.slice(0, relayPager.threshold))
              setLoading(false)
              setPaginable(true)
            })
          }

          break
        }
        case "users": {
          // from whom we're going to fetch
          const authors = selectedTab.pubkeys

          // this will be used in filtering what we display, not what we sync
          const baseFilter = selectedTab.baseFilter

          const outboxPager: {
            // this is just a count of how many times showMore() has been called
            page: number
            // ended means we won't paginate back ever again
            ended: boolean
            expectedLimit: () => number
            showMore: () => void
          } = {
            page: 0,
            ended: false,
            expectedLimit() {
              return INITIAL_THRESHOLD + NOTES_PER_PAGE * outboxPager.page
            },
            async showMore() {
              if (this.ended) return

              setPaginable(false)
              this.page++
              const expected = this.expectedLimit()
              let total = await flush()
              if (total < expected) {
                // gotta ask relays for more older stuff
                let lastNoteWeHave = notes().slice(-1)[0]
                if (lastNoteWeHave) {
                  console.debug("asking relays for stuff older than", lastNoteWeHave.created_at)
                  await outbox.before(authors, lastNoteWeHave.created_at - 1, signal)
                  // now we can flush again
                  let total = await flush()
                  if (total < expected) {
                    console.debug(
                      `failed to fetch anything more for ${authors} declaring this feed ended`
                    )
                    this.ended = true
                  }
                }
              }
              setTimeout(() => {
                setPaginable(true)
              }, 1000)
            }
          }

          pageManager = outboxPager

          async function flush(): Promise<number> {
            let total = 0
            let events: NostrEvent[] = []
            for await (let evt of outbox.store.queryEvents({
              kinds: [1222],
              authors,
              ...baseFilter,
              limit: outboxPager.expectedLimit()
            })) {
              if (signal.aborted) return
              events.push(evt)
              total++
            }

            batch(() => {
              setNotes(events)
              setLoading(events.length === 0)
            })

            return total
          }

          // display what we have stored immediately
          await flush()
          if (signal.aborted) return

          // if we don't have anything stored, do a preliminary fetch
          // (just to show something before we start the "sync" process below)
          let preliminary: Promise<void>
          if (notes().length === 0) {
            console.debug("doing preliminary fetch before the full sync process")
            preliminary = new Promise<void>(async resolve => {
              let preliminaryEvents: NostrEvent[] = []
              let preliminarySub = pool.subscribeMap(
                await outboxFilterRelayBatch(authors, {
                  kinds: [1222],
                  limit: outboxPager.expectedLimit(),
                  ...selectedTab.baseFilter
                }),
                {
                  label: `preliminary-${selectedLabel}`,
                  async onevent(event) {
                    preliminaryEvents.push(event)

                    try {
                      await outbox.store.saveEvent(event)
                    } catch (err) {
                      if (err instanceof DuplicateEventError) {
                        console.warn("tried to save duplicate from ongoing:", event)
                      } else {
                        throw err
                      }
                    }
                  },
                  oneose() {
                    preliminarySub.close()
                    if (signal.aborted) return
                    preliminaryEvents.sort((a, b) => b.created_at - a.created_at)
                    batch(() => {
                      setNotes(preliminaryEvents)
                      setLoading(false)
                    })
                  },
                  onclose() {
                    resolve()
                  }
                }
              )

              signal.addEventListener("abort", () => preliminarySub.close())
            })
          }

          // now do the sync from wherever we left before (or an indeterminate point in the past) to now
          let addedNewEvents = await outbox.sync(authors, signal)

          // after the sync we can show the events we have in the database
          await preliminary
          if (signal.aborted) return
          if (addedNewEvents) {
            await flush()
          }
          setPaginable(true)

          // finally open this ongoing subscription
          outbox.live(authors, debounce(flush, 500), signal)
        }
      }
    })()
  })

  // infinite scroll / pagination
  createEffect(() => {
    if (paginable() && visible()) {
      // our infinite scroll is just allowing more events to be rendered
      // we already have these events in memory, but we don't render them all at once because it's wasteful
      // (requires opening more subscriptions, fetching replies etc)
      console.debug("infinite scroll next page threshold", paginable())
      pageManager.showMore()
    }
  })

  createEffect(() => {
    if (props.forcedTabs) return

    if (!user()?.current) {
      setVisibleTabs([global])
      return
    }

    Promise.allSettled([
      loadFollowsList(user().current.pubkey),
      loadFavoriteRelays(user().current.pubkey)
    ]).then(([fl, fr]) => {
      const newTabs = [global]

      if (fl.status === "fulfilled") {
        newTabs.push(["Following", { type: "users", pubkeys: fl.value.items }])
      }

      if (fr.status === "fulfilled") {
        let submenuItems = []
        for (let item of fr.value.items) {
          if (typeof item !== "string") continue // TODO: handle relay sets
          submenuItems.push(item)
        }

        if (submenuItems.length > 0) {
          newTabs.push(["Relays", { type: "relaysubmenu", items: submenuItems }])
        }
      }

      setVisibleTabs(newTabs)
    })
  })

  createEffect(() => {
    let vts = visibleTabs()
    let previouslySelected = sessionStorage.getItem("selected-tab")
    let vt = vts.find(vt => vt[0] === previouslySelected)
    if (vt) {
      setTab(vt)
    }
  })

  return (
    <div class="space-y-4">
      <Show when={!props.invisibleToggles}>
        <div class="flex justify-center -mt-6 mb-2">
          <ToggleGroup value={tab()[0]} onChange={handleSelectTab}>
            <For each={visibleTabs()}>
              {dt => {
                return (
                  <Switch>
                    <Match when={dt[0] === "Global"}>
                      <ToggleGroupItem value={dt[0]} aria-label={dt[0]}>
                        <Globe class="h-4 w-4 mr-2" />
                        {dt[0]}
                      </ToggleGroupItem>
                    </Match>
                    <Match when={dt[1].type === "users" && dt[1].pubkeys.length === 1}>
                      <ToggleGroupItem value={dt[0]} aria-label={dt[0]}>
                        <User class="h-4 w-4 mr-2" />
                        {dt[0]}
                      </ToggleGroupItem>
                    </Match>
                    <Match when={dt[1].type === "users" && dt[1].pubkeys.length > 1}>
                      <ToggleGroupItem value={dt[0]} aria-label={dt[0]}>
                        <Users class="h-4 w-4 mr-2" />
                        {dt[0]}
                      </ToggleGroupItem>
                    </Match>
                    <Match when={dt[1].type === "relays" && dt[1].relays.length === 1}>
                      <ToggleGroupItem value={dt[0]} aria-label={dt[0]}>
                        <Image fallbackDelay={600}>
                          <Image.Img
                            src={new URL(
                              "/favicon.ico",
                              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                              // @ts-ignore
                              dt[1].relays[0].replace("wss://", "https://")
                            ).toString()}
                            class="h-4 w-4 mr-2"
                          />
                          <Image.Fallback>
                            <Telescope class="h-4 w-4 mr-2" />
                          </Image.Fallback>
                        </Image>
                        {prettyRelayURL(dt[0])}
                      </ToggleGroupItem>
                    </Match>
                    <Match when={dt[1].type === "relays"}>
                      <ToggleGroupItem value={dt[0]} aria-label={dt[0]}>
                        <Telescope class="h-4 w-4 mr-2" />
                        {dt[0]}
                      </ToggleGroupItem>
                    </Match>
                    <Match when={dt[1].type === "relaysubmenu"}>
                      <DropdownMenu placement="bottom" orientation="vertical">
                        <DropdownMenuTrigger class="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-transparent h-9 px-3 hover:bg-muted hover:text-muted-foreground data-[pressed]:bg-accent data-[pressed]:text-accent-foreground">
                          <Telescope class="h-4 w-4 mr-2" />
                          {dt[0]}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
                          {/* @ts-ignore */}
                          <For each={dt[1].items}>
                            {relay => (
                              <DropdownMenuItem>
                                <Button
                                  variant="ghost"
                                  aria-label={relay}
                                  class="justify-start w-full"
                                  onClick={() =>
                                    navigate(`/r/${encodeURIComponent(prettyRelayURL(relay))}`)
                                  }
                                >
                                  <Image>
                                    <Image.Img
                                      src={new URL(
                                        "/favicon.ico",
                                        relay.replace("wss://", "https://")
                                      ).toString()}
                                      class="h-4 w-4 mr-2"
                                    />
                                    <Image.Fallback>
                                      <Telescope class="h-4 w-4 mr-2" />
                                    </Image.Fallback>
                                  </Image>
                                  {prettyRelayURL(relay)}
                                </Button>
                              </DropdownMenuItem>
                            )}
                          </For>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </Match>
                  </Switch>
                )
              }}
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

  function handleSelectTab(value: string) {
    if (value) {
      let vt = visibleTabs().find(vt => vt[0] === value)
      if (vt) {
        setTab(vt)
        sessionStorage.setItem("selected-tab", value)
      }
    }
  }
}

export default Feed
