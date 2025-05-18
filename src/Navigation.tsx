import { Component } from "solid-js"
import { A } from "@solidjs/router"
import LoginArea from "./LoginArea"

function Navigation() {
  return (
    <nav class="border-b">
      <div class="container mx-auto px-4 h-16 flex items-center justify-between">
        <A href="/" class="flex items-center space-x-2">
          <img src="/yakbak-logo.png" alt="YakBak Logo" class="h-8 w-auto" />
          <span class="text-xl font-bold">YakBak2</span>
        </A>

        <div class="flex items-center gap-4">
          <LoginArea />
        </div>
      </div>
    </nav>
  )
}

export default Navigation as Component
