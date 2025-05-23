import { Component, Show } from "solid-js"

import Feed from "./Feed"
import Create from "./Create"
import user from "./user"
import { recordingReply } from "./global"

function Home() {
  return (
    <div class="container mx-auto px-4 py-8 max-w-2xl">
      <Feed />
      <Show when={user()?.current && !recordingReply()}>
        <div class="fixed bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
          <Create />
        </div>
      </Show>
    </div>
  )
}

export default Home as Component
