import type { Component } from "solid-js"
import { Route, Router } from "@solidjs/router"
import { pool } from "@nostr/gadgets/global"

import { Toaster } from "./components/ui/sonner"
import { ThemeProvider } from "./theme"

import Home from "./Home"
import Navigation from "./Navigation"
import Profile from "./Profile"
import VoiceNotePage from "./VoiceNotePage"
import Settings from "./Settings"
import Hashtag from "./Hashtag"
import RelayPage from "./Relay"

pool.trackRelays = true

function App() {
  return (
    <ThemeProvider>
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
        <Route path="/hashtag/:tag" component={Hashtag} />
        <Route path="/r/:host" component={RelayPage} />
        <Route path="/settings" component={Settings} />
      </Router>
    </ThemeProvider>
  )
}

export default App as Component
