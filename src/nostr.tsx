import { loadRelayList } from "@nostr/gadgets/lists"
import { outboxFilterRelayBatch } from "@nostr/gadgets/outbox"
import { Filter } from "@nostr/tools/filter"
import { normalizeURL } from "@nostr/tools/utils"

export type Tab = {
  baseFilter?: Filter
} & ({ type: "relays"; relays: string[] } | { type: "users"; pubkeys: string[] })
export type DefinedTab = [string, Tab]

export const global: DefinedTab = [
  "Global",
  {
    type: "relays",
    relays: ["wss://relay.damus.io", "wss://nos.lol", "wss://nostr.wine", "wss://relay.nostr.band"]
  }
]

/**
 * Returns a map of {relayUrl: [filter]} to be passed to pool.subscribeMap() according to the
 * currently selected group.
 */
export async function getRequestDeclaration(
  tab: Tab,
  baseFilter: Filter
): Promise<{ url: string; filter: Filter }[]> {
  const declaration: { url: string; filter: Filter }[] = []

  switch (tab.type) {
    case "relays": {
      for (let i = 0; i < tab.relays.length; i++) {
        declaration.push({
          url: tab.relays[i],
          filter: baseFilter
        })
      }
      return declaration
    }
    case "users": {
      return outboxFilterRelayBatch(tab.pubkeys, baseFilter)
    }
  }
}
