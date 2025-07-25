import { OutboxManager } from "@nostr/gadgets/outbox"
import { Filter } from "@nostr/tools/filter"

export type Tab =
  | { type: "relays"; relays: string[]; baseFilter?: Filter }
  | { type: "users"; pubkeys: string[]; baseFilter?: Filter }
  | { type: "relaysubmenu"; items: string[] }
export type DefinedTab = [string, Tab]

export const globalRelays = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://nostr.wine",
  "wss://relay.nostr.band"
]

export const global: DefinedTab = [
  "Global",
  {
    type: "relays",
    relays: globalRelays
  }
]

export const outbox = new OutboxManager([1222, 1244])
