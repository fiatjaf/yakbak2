import { bech32 } from "@scure/base"
import { nwc as NWC } from "@getalby/sdk"
import { createResource } from "solid-js"
import LRUCache from "@fiatjaf/lru-cache/lru-cache"

import settings from "./settings"
import { NostrUser } from "@nostr/gadgets/metadata"

const [nwc] = createResource(settings, settings => {
  if (!settings || !settings.nwcConnectionString) return

  return new NWC.NWCClient({
    nostrWalletConnectUrl: settings.nwcConnectionString
  })
})

export default nwc

const zapEndpointsCache = new LRUCache<string, Promise<string>>(200)

export async function getZapEndpoint(author: NostrUser): Promise<string | undefined> {
  const metadata = author.metadata
  if (!metadata) return undefined

  let res: Promise<string>
  if ((res = zapEndpointsCache.get(author.pubkey))) return res

  res = new Promise(async resolve => {
    try {
      const { lud06, lud16 } = metadata
      let lnurl: string
      if (lud06) {
        let { words } = bech32.decode(lud06, 1000)
        let data = bech32.fromWords(words)
        lnurl = new TextDecoder().decode(data)
      } else if (lud16) {
        let [name, domain] = lud16.split("@")
        lnurl = new URL(`/.well-known/lnurlp/${name}`, `https://${domain}`).toString()
      } else {
        return undefined
      }

      let res = await fetch(lnurl)
      let body = await res.json()

      if (body.allowsNostr && body.nostrPubkey) {
        resolve(body.callback)
        return
      }
    } catch (err) {
      /***/
    }

    resolve(undefined)
  })

  zapEndpointsCache.set(author.pubkey, res)
  return res
}
