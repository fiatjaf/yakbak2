import type { Component } from "solid-js"
import { Route, Router } from "@solidjs/router"
import Home from "./Home"
import Navigation from "./Navigation"
import Profile from "./Profile"
import VoiceMessagePage from "./VoiceMessagePage"
import Settings from "./Settings"
import { Toaster } from "./components/ui/sonner"

function App() {
  return (
    <>
      <Navigation />
      <Toaster />
      <Router>
        <Route path="/" component={Home} />
        <Route path="/profile/:npub" component={Profile} />
        <Route path="/message/:nevent" component={VoiceMessagePage} />
        <Route path="/settings" component={Settings} />
      </Router>
    </>
  )
}

export default App as Component
