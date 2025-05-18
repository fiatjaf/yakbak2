import { Component } from "solid-js"
import Feed from "./Feed"
import Create from "./Create"

function Home() {
  return (
    <div class="container mx-auto px-4 py-8 max-w-2xl">
      <Feed />
      <Create />
    </div>
  )
}

export default Home as Component
