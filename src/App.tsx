import type { Component } from "solid-js"
import { Route, Router } from "@solidjs/router"
import Home from "./Home"
import Navigation from "./Navigation"

function App() {
  return (
    <>
      <Navigation />
      <Router>
        <Route path="/" component={Home} />
        <Route path="/" component={Profile} />
        <Route path="/" component={Home} />
      </Router>
    </>
  )
}

export default App as Component
