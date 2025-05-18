import { Component } from "solid-js"
import { Button } from "./components/ui/button"

function Settings() {
  const { user } = useCurrentUser()
  const { settings, saveSettings } = useNWC()

  const handleSave = () => {
    if (!user) {
      toast.error("You must be logged in to save settings")
      return
    }

    const newSettings: NWCSettings = {
      nwcConnectionString,
      defaultZapAmount
    }

    saveSettings(newSettings)
    toast.success("Settings saved successfully")
  }

  if (!user) {
    return (
      <div class="container mx-auto px-4 py-8 max-w-2xl">
        <div class="text-center">Please log in to access settings</div>
      </div>
    )
  }

  return (
    <div class="container mx-auto px-4 py-8 max-w-2xl">
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
            <Label htmlFor="nwc">Connection String</Label>
            <Input
              id="nwc"
              value={nwcConnectionString}
              onChange={e => setNwcConnectionString(e.target.value)}
              placeholder="nostr+walletconnect://..."
            />
          </div>

          <div class="space-y-2">
            <Label htmlFor="zap-amount">Default Zap Amount (sats)</Label>
            <Input
              id="zap-amount"
              type="number"
              value={defaultZapAmount}
              onChange={e => setDefaultZapAmount(e.target.value)}
              placeholder="1000"
            />
          </div>

          <Button onClick={handleSave} class="w-full">
            Save Settings
          </Button>
        </div>
      </Card>
    </div>
  )
}

export default Settings as Component
