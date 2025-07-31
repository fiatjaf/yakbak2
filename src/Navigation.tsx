import { Component, Show } from "solid-js"
import { A } from "@solidjs/router"
import LoginArea from "./LoginArea"
import ThemeToggle from "./components/ThemeToggle"
import NotificationBell from "./components/NotificationBell"
import user from "./user"

function Navigation() {
  return (
    <nav class="border-b">
      <div class="container mx-auto px-4 h-16 flex items-center justify-between">
        <A href="/" class="flex items-center space-x-2">
          <img src="/favicon.ico" alt="YakBak Logo" class="h-8 w-auto" />
          <span class="text-xl font-bold">YakBak</span>
        </A>

        <div class="flex items-center gap-4">
          <ThemeToggle />
          <Show when={user().current}>
            <NotificationBell />
          </Show>
          <LoginArea />
        </div>
      </div>
    </nav>
  )
}

export default Navigation as Component
