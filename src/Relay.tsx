import { Show } from "solid-js"
import { useParams } from "@solidjs/router"

import Feed from "./Feed"
import { DefinedTab } from "./nostr"
import { recordingReply } from "./global"
import Create from "./Create"

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
      <Show when={!recordingReply()}>
        <div class="fixed bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
          <Create vanishesOnScroll exclusive toRelays={[url()]} />
        </div>
      </Show>
    </div>
  )
}

export default RelayPage
