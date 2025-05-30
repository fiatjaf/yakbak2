import { IDBEventStore } from "@nostr/gadgets/store"
import { Filter } from "@nostr/tools/filter"

export type Tab = {
  baseFilter?: Filter
} & ({ type: "relays"; relays: string[] } | { type: "users"; pubkeys: string[] })
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

export class OutboxDB {
  store: IDBEventStore
  thresholds: { [pubkey: string]: [oldest: number, newest: number] }

  constructor() {
    this.store = new IDBEventStore()
    this.thresholds = JSON.parse(localStorage.getItem("thresholds") || "{}")
  }

  saveThresholds() {
    localStorage.setItem("thresholds", JSON.stringify(this.thresholds))
  }
}

export const outbox = new OutboxDB()
