import { Component, Switch, Match, createSignal } from "solid-js"
import { toast } from "solid-sonner"

import { Button } from "./components/ui/button"
import { Card } from "./components/ui/card"
import { Input } from "./components/ui/input"
import { Label } from "./components/ui/label"
import user from "./user"
import { saveSettings } from "./settings"

function Settings() {
  const [nwcConnectionString, setNwcConnectionString] = createSignal("")
  const [defaultZapAmount, setDefaultZapAmount] = createSignal(21)

  return (
    <div class="container mx-auto px-4 py-8 max-w-2xl">
      <Switch>
        <Match when={!user().current}>
          <div class="text-center">Please log in to access settings</div>
        </Match>

        <Match when={user().current}>
          <h1 class="text-2xl font-bold mb-8">Settings</h1>

          <Card class="p-6 space-y-6">
            <div class="space-y-4">
              <h2 class="text-xl font-semibold">Nostr Wallet Connect</h2>
              <p class="text-sm text-muted-foreground">
                Connect your wallet to enable zaps. Get your connection string from{" "}
                <a
                  href="https://nwc.getalby.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-primary hover:underline"
                >
                  Alby
                </a>
                .
              </p>

              <div class="space-y-2">
                <Label for="nwc">Connection String</Label>
                <Input
                  id="nwc"
                  value={nwcConnectionString()}
                  onInput={e => setNwcConnectionString(e.target.value)}
                  placeholder="nostr+walletconnect://..."
                />
              </div>

              <div class="space-y-2">
                <Label for="zap-amount">Default Zap Amount (sats)</Label>
                <Input
                  id="zap-amount"
                  type="number"
                  value={defaultZapAmount()}
                  onInput={e => setDefaultZapAmount(parseInt(e.target.value))}
                  placeholder="21"
                />
              </div>

              <Button onClick={handleSave} class="w-full">
                Save Settings
              </Button>
            </div>
          </Card>
        </Match>
      </Switch>
    </div>
  )

  function handleSave() {
    if (!user) {
      toast.error("You must be logged in to save settings")
      return
    }

    saveSettings({
      nwcConnectionString: nwcConnectionString(),
      defaultZapAmount: defaultZapAmount()
    })
    toast.success("Settings saved successfully")
  }
}

export default Settings as Component
