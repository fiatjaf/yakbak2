import { Component, Show } from "solid-js"

import Feed from "./Feed"
import Create from "./Create"
import user from "./user"

function Home() {
  return (
    <div class="container mx-auto px-4 py-8 max-w-2xl">
      <Feed />
      <Show when={user.current}>
        <Create />
      </Show>
    </div>
  )
}

export default Home as Component
