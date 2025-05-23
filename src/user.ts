import { loadNostrUser, NostrUser } from "@nostr/gadgets/metadata"
import { decode } from "@nostr/tools/nip19"
import { BunkerSigner, parseBunkerInput } from "@nostr/tools/nip46"
import { createSignal } from "solid-js"
import {
  EventTemplate,
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  NostrEvent
} from "@nostr/tools/pure"
import { bytesToHex, hexToBytes } from "@noble/hashes/utils"

type User = NostrUser & { signer: Signer } & { _method: string }
type Signer = { signEvent: (event: EventTemplate) => Promise<NostrEvent> }

const [user, set] = createSignal<{
  current: User | null
  all: User[]
}>({
  current: null,
  all: []
})

export default user

export function setLogin(pubkey: string) {
  set(user => ({
    current: user.all.find(u => u.pubkey === pubkey),
    ...user
  }))
  storeState()
}

export function removeLogin(pubkey: string) {
  set(user => {
    const all = user.all.filter(u => u.pubkey !== pubkey)
    let current = user.current
    if (current?.pubkey === pubkey) {
      current = all[0]
    }
    return { all, current }
  })
  storeState()
}

export async function addLogin(data: string) {
  const newUser = await makeUserLogin(data)

  set(user => ({
    all: [...user.all, newUser],
    current: newUser
  }))
  storeState()
}

async function makeUserLogin(data: string): Promise<User> {
  let pubkey: string
  let signer: Signer

  if (data === "nip07") {
    pubkey = await (window as any).nostr.getPublicKey()
    signer = (window as any).nostr
  } else if (data.startsWith("bunker://")) {
    const bp = await parseBunkerInput(data)
    const clientKeyHex = localStorage.getItem("nostr:nip46:clientkey")
    let clientKey: Uint8Array
    if (clientKeyHex) {
      clientKey = hexToBytes(clientKeyHex)
    } else {
      clientKey = generateSecretKey()
      localStorage.setItem("nostr:nip46:clientkey", bytesToHex(clientKey))
    }
    const bunker = new BunkerSigner(clientKey, bp)
    await bunker.connect()
    pubkey = await bunker.getPublicKey()
    signer = bunker
  } else {
    const res = decode(data)
    const sk = res.data as Uint8Array
    pubkey = getPublicKey(sk)
    signer = {
      signEvent(event) {
        return finalizeEvent(event, sk)
      }
    }
  }

  const pm = await loadNostrUser(pubkey)
  return { ...pm, signer, _method: data }
}

function storeState() {
  const u = user()
  if (u?.current) {
    localStorage.setItem("nostr:current", u.current.pubkey)
    localStorage.setItem("nostr:logins", JSON.stringify(u.all.map(u => u._method)))
  } else {
    localStorage.removeItem("nostr:current")
    localStorage.removeItem("nostr:logins")
  }
}

;(async function initialLoad() {
  await new Promise(resolve => setTimeout(resolve, 200))

  const logins = JSON.parse(localStorage.getItem("nostr:logins") || "[]") as string[]
  const users = await Promise.all(logins.map(data => makeUserLogin(data)))

  const current = localStorage.getItem("nostr:current")

  set({ all: users, current: users.find(u => u.pubkey === current) })
})()
