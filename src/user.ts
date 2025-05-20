import { NostrUser } from "@nostr/gadgets/metadata"
import { EventTemplate, NostrEvent } from "@nostr/tools/pure"
import { createStore } from "solid-js/store"

type User = NostrUser & { signer: { signEvent: (event: EventTemplate) => Promise<NostrEvent> } }

const [loginStore, set] = createStore<{
  current: User | null
  all: User[]
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
