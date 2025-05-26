import { useParams } from "@solidjs/router"

import Feed from "./Feed"
import { DefinedTab } from "./nostr"

function RelayPage() {
  const params = useParams<{ host: string }>()
  const url = () => {
    const h = decodeURIComponent(params.host)
    if (h.startsWith("wss://") || h.startsWith("ws://")) {
      return h
    }
    return "wss://" + h
  }

  return (
    <div class="container mx-auto px-4 py-8 max-w-2xl">
      <Feed forcedTabs={[[url(), { type: "relays", relays: [url()] }] as DefinedTab]} />
    </div>
  )
}

export default RelayPage
