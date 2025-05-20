import { NostrUser } from "@nostr/gadgets/metadata"
import { createStore } from "solid-js/store"

const [noteStore, set] = createStore<{
  current: NostrUser | null
  all: NostrUser[]
}>({
  current: null,
  all: []
})

export default loginStore

export function setLogin(pubkey: string) {
  set(
    "current",
    loginStore.all.find(u => u.pubkey === pubkey)
  )
}

export function removeLogin(pubkey: string) {
  set(
    "all",
    loginStore.all.filter(u => u.pubkey !== pubkey)
  )
}
