import type { Component } from "solid-js"
import { Route, Router } from "@solidjs/router"

import Home from "./Home"
import Navigation from "./Navigation"
import Profile from "./Profile"
import VoiceNotePage from "./VoiceNotePage"
import Settings from "./Settings"
import { Toaster } from "./components/ui/sonner"
import { pool } from "@nostr/gadgets/global"

pool.trackRelays = true

function App() {
  return (
    <>
      <Toaster />
      <Router
        root={props => (
          <>
            <Navigation />
            {props.children}
          </>
        )}
      >
        <Route path="/" component={Home} />
        <Route path="/:npub" matchFilters={{ npub: /^(npub|nprofile)1/ }} component={Profile} />
        <Route path="/:nevent" matchFilters={{ nevent: /^nevent1/ }} component={VoiceNotePage} />
        <Route path="/settings" component={Settings} />
      </Router>
    </>
  )
}

export default App as Component
