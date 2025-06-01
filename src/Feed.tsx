import { batch, createEffect, createSignal, For, Match, onCleanup, Show, Switch } from "solid-js"
import { getSemaphore } from "@henrygd/semaphore"
import { Globe, Loader, Telescope, User, Users } from "lucide-solid"
import { createVisibilityObserver } from "@solid-primitives/intersection-observer"
import { NostrEvent } from "@nostr/tools/pure"
import { Filter, matchFilter } from "@nostr/tools/filter"
import { pool } from "@nostr/gadgets/global"
import { outboxFilterRelayBatch } from "@nostr/gadgets/outbox"
import { DuplicateEventError } from "@nostr/gadgets/store"
import { loadFavoriteRelays, loadFollowsList, loadRelayList } from "@nostr/gadgets/lists"
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
            label: `feed-${selectedLabel}`,
            onevent(event) {
              if (event.tags.find(t => t[0] === "e")) return
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

          function flush() {
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
          // outbox feed
          const outboxPager = {
            allEvents: [],
            threshold: INITIAL_THRESHOLD,
            showMore() {
              const hasNew = this.allEvents.length > this.threshold
              if (hasNew) {
                this.threshold += NOTES_PER_PAGE
                setNotes(this.allEvents.slice(0, this.threshold))
              } else {
                setPaginable(false)

                if (this.allEvents.length) {
                  maybeFetchBackwardsUntil(
                    this.allEvents[this.allEvents.length - 1].created_at
                  ).then(() => {
                    if (signal.aborted) return

                    this.threshold += NOTES_PER_PAGE
                    setNotes(this.allEvents.slice(0, this.threshold))
                    setPaginable(true)
                  })
                }
              }
            }
          }
          pageManager = outboxPager

          // from whom we're going to fetch
          const authors = selectedTab.pubkeys

          // display what we have stored immediately
          for await (let evt of outbox.store.queryEvents({ kinds: [1222], authors, limit: 100 })) {
            if (signal.aborted) return
            outboxPager.allEvents.push(evt)
          }

          if (signal.aborted) return
          console.debug("stored events:", authors, outboxPager.allEvents)
          if (outboxPager.allEvents.length !== 0) {
            flush()
          } else {
            // if there is nothing in the database we do a preliminary query
            // just to show something before we start the "sync" process below
            console.debug("doing preliminary fetch before the full sync process")
            await new Promise(async resolve => {
              let preliminaryEvents: NostrEvent[] = []
              let preliminarySub = pool.subscribeMap(
                await outboxFilterRelayBatch(authors, {
                  kinds: [1222],
                  limit: 10,
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
                  onclose: resolve
                }
              )
            })
          }

          // sync up each of the pubkeys to present
          console.log("starting catch up sync")
          let addedNewEventsOnSync = false
          const now = Math.round(Date.now() / 1000)
          const promises: Promise<void>[] = []
          for (let i = 0; i < authors.length; i++) {
            let pubkey = authors[i]
            let bound = outbox.thresholds[pubkey]
            let newest = bound ? bound[1] : undefined

            if (newest > now - 60 * 60 * 2) {
              // if this person was caught up to 2 hours ago there is no need to repeat this
              // (we'll make up for these missing events in the ongoing live subscription)
              console.log(`${i + 1}/${authors.length} skip`, newest, ">", now - 60 * 60 * 2)
              continue
            }

            const sem = getSemaphore("outbox-sync", 15) // do it only 15 pubkeys at a time
            promises.push(
              sem.acquire().then(async () => {
                if (signal.aborted) {
                  sem.release()
                  return
                }

                let relays = (await loadRelayList(pubkey)).items
                  .filter(r => r.write)
                  .slice(0, 4)
                  .map(r => r.url)

                if (signal.aborted) {
                  sem.release()
                  return
                }

                let events: NostrEvent[]
                try {
                  events = await Promise.race([
                    pool.querySync(
                      relays,
                      { kinds: [1222, 1244], authors: [pubkey], since: newest, limit: 200 },
                      { label: `catchup-${pubkey.substring(0, 6)}` }
                    ),
                    new Promise<NostrEvent[]>((_, rej) => setTimeout(rej, 5000))
                  ])
                } catch (err) {
                  console.warn("failed to query events for", pubkey, "at", relays)
                  events = []
                }

                if (signal.aborted) {
                  sem.release()
                  return
                }

                console.debug(
                  `${i + 1}/${authors.length} catching up with`,
                  pubkey,
                  relays,
                  { kinds: [1222, 1244], authors: [pubkey], since: newest },
                  `got ${events.length} events`,
                  events
                )

                for (let event of events) {
                  try {
                    await outbox.store.saveEvent(event)

                    // saved, now we know this was a new event, we can add it to our list of events to be displayed
                    if (!selectedTab.baseFilter || matchFilter(selectedTab.baseFilter, event)) {
                      outboxPager.allEvents.push(event)
                      outboxPager.threshold++
                      addedNewEventsOnSync = true
                    }
                  } catch (err) {
                    if (err instanceof DuplicateEventError) {
                      console.warn("tried to save duplicate:", event)
                    } else {
                      throw err
                    }
                  }
                }

                // update stored bound thresholds for this person since they're caught up to now
                if (bound) {
                  bound[1] = now
                } else if (events.length) {
                  // didn't have anything before, but now we have all of these
                  bound = [events[events.length - 1].created_at, now]
                } else {
                  // no bound, no events
                  bound = [now - 1, now]
                }
                console.debug("new bound for", pubkey, bound)
                outbox.thresholds[pubkey] = bound

                sem.release()
              })
            )
          }

          await Promise.all(promises)

          // now we've caught up with the current moment for everybody
          outbox.saveThresholds()
          if (signal.aborted) return

          console.debug(`all caught up`)
          setPaginable(true)

          if (addedNewEventsOnSync) {
            outboxPager.allEvents.sort((a, b) => b.created_at - a.created_at)
            flush()
          }

          // finally open this ongoing subscription
          const declaration = await outboxFilterRelayBatch(authors, {
            kinds: [1222, 1244],
            since: now - 60 * 60 * 2
          })
          closer = pool.subscribeMap(declaration, {
            label: `feed-${selectedLabel}`,
            async onevent(event) {
              if (!selectedTab.baseFilter || matchFilter(selectedTab.baseFilter, event)) {
                outboxPager.allEvents.unshift(event)
                setNotes(events => [event, ...events])
                outboxPager.threshold++
              }

              try {
                await outbox.store.saveEvent(event)

                this.thresholds[event.pubkey][1] = Math.round(Date.now() / 1000)
              } catch (err) {
                if (err instanceof DuplicateEventError) {
                  console.warn("tried to save duplicate from ongoing:", event)
                } else {
                  throw err
                }
              }
            }
          })

          function flush() {
            batch(() => {
              setNotes(
                outboxPager.allEvents.slice(
                  0,
                  Math.min(outboxPager.allEvents.length, outboxPager.threshold)
                )
              )
              setLoading(outboxPager.allEvents.length === 0)
            })
          }

          async function maybeFetchBackwardsUntil(ts: number) {
            // from all our authors check which ones need a new page fetch
            for (let pubkey of authors) {
              const sem = getSemaphore("outbox-sync", 15) // do it only 15 pubkeys at a time
              await sem.acquire().then(async () => {
                if (signal.aborted) {
                  sem.release()
                  return
                }

                let bound = outbox.thresholds[pubkey]
                if (!bound) {
                  // this should never happen because we set the bounds for everybody
                  // (on the first fetch if they don't have one)
                  console.error("pagination on pubkey without a bound", pubkey)
                  sem.release()
                  return
                }

                let oldest = bound ? bound[0] : undefined

                // if we already have events for this person that are older don't try to fetch anything
                if (oldest < ts) {
                  sem.release()
                  return
                }

                let relays = (await loadRelayList(pubkey)).items
                  .filter(r => r.write)
                  .slice(0, 4)
                  .map(r => r.url)

                if (signal.aborted) {
                  sem.release()
                  return
                }

                const events = await pool.querySync(
                  relays,
                  { kinds: [1222, 1244], authors: [pubkey], until: oldest, limit: 200 },
                  { label: `page-${pubkey.substring(0, 6)}` }
                )

                console.debug(
                  "paginating to the past",
                  pubkey,
                  relays,
                  { kinds: [1222, 1244], authors: [pubkey], until: oldest },
                  events
                )

                for (let event of events) {
                  try {
                    await outbox.store.saveEvent(event)
                  } catch (err) {
                    if (err instanceof DuplicateEventError) {
                      console.warn("tried to save duplicate:", event)
                    } else {
                      throw err
                    }
                  }
                }

                // update oldest bound threshold
                if (events.length) {
                  // didn't have anything before, but now we have all of these
                  bound[0] = events[events.length - 1].created_at
                }
                console.debug("updated bound for", pubkey, bound)
                outbox.thresholds[pubkey] = bound

                sem.release()
              })
            }

            outbox.saveThresholds()
            console.debug("paginated back")

            // after having downloaded more stuff from everybody we needed we can grab stuff from our database
            // and put it in memory
            for await (let evt of outbox.store.queryEvents({
              kinds: [1222],
              authors,
              until: ts - 1,
              limit: 100
            })) {
              outboxPager.allEvents.push(evt)
            }
          }
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
