import { useParams } from "@solidjs/router"

import Feed from "./Feed"
import { DefinedTab, global } from "./nostr"

function Hashtag() {
  const { tag } = useParams<{ tag: string }>()

  return (
    <div class="container mx-auto px-4 py-8 max-w-2xl">
      <Feed
        forcedTabs={[[`#${tag}`, { ...global[1], baseFilter: { "#t": [tag] } }] as DefinedTab]}
      />
    </div>
  )
}

export default Hashtag
