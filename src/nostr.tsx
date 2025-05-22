import { loadRelayList } from "@nostr/gadgets/lists"
import { Filter } from "@nostr/tools/filter"
import { normalizeURL } from "@nostr/tools/utils"

export type Tab = { type: "relays"; relays: string[] } | { type: "users"; pubkeys: string[] }
export type DefinedTab = [string, Tab]

/**
 * Returns a map of {relayUrl: [filter]} to be passed to pool.subscribeMap() according to the
 * currently selected group.
 */
export async function getRequestDeclaration(
  tab: Tab,
  baseFilters: Filter[]
): Promise<{ url: string; filter: Filter }[]> {
  const declaration: { url: string; filter: Filter }[] = []

  switch (tab.type) {
    case "relays": {
      for (let i = 0; i < tab.relays.length; i++) {
        for (let f = 0; f < baseFilters.length; f++) {
          declaration.push({
            url: tab.relays[i],
            filter: baseFilters[f]
          })
        }
      }
      return declaration
    }
    case "users": {
      type Count = { count: number }
      const relaysByCount: { [url: string]: Count } = {}
      const relaysByPubKey: { [pubkey: string]: { [url: string]: Count } } = {}
      const numberOfRelaysPerUser =
        tab.pubkeys.length < 100
          ? 4
          : tab.pubkeys.length < 800
            ? 3
            : tab.pubkeys.length < 1200
              ? 2
              : 1

      // get the most popular relays among the list of followed people
      await Promise.all(
        tab.pubkeys.map(async pubkey => {
          const rl = await loadRelayList(pubkey)
          relaysByPubKey[pubkey] = {}

          let w = 0
          for (let i = 0; i < rl.items.length; i++) {
            if (rl.items[i].write) {
              try {
                const url = normalizeURL(rl.items[i].url)
                const count = relaysByCount[url] || { count: 0 }
                relaysByCount[url] = count
                relaysByPubKey[pubkey][url] = count
                count.count++
                w++
              } catch (_err) {
                /***/
              }
            }

            if (w >= 7) break
          }
        })
      )

      // choose from the most popular first for each user
      for (let i = 0; i < tab.pubkeys.length; i++) {
        const pubkey = tab.pubkeys[i]
        const list: [string, number][] = Object.entries(relaysByPubKey[pubkey]).map(
          ([url, count]) => [url, count.count]
        )
        list.sort((a, b) => b[1] - a[1])

        // we'll get a number of relays per user that will be bigger if we're following less people,
        // smaller otherwise
        const top = list.slice(0, numberOfRelaysPerUser)

        for (let r = 0; r < top.length; r++) {
          const url = top[r][0]
          let found = false
          for (let i = 0; i < declaration.length; i++) {
            const decl = declaration[i]
            if (decl.url === url) {
              // if this relay is found that means it already has all the filters
              // so we just add the pubkey to all of them
              found = true
              decl.filter.authors!.push(pubkey)
            }
          }

          // otherwise we add all the filters to this relay
          if (!found) {
            for (let f = 0; f < baseFilters.length; f++) {
              declaration.push({
                url,
                filter: { ...baseFilters[f], authors: [pubkey] }
              })
            }
          }
        }
      }

      return declaration
    }
  }
}
