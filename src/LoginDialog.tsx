import { createSignal, Show } from "solid-js"
import { Shield } from "lucide-solid"

import { Button } from "./components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "./components/ui/dialog"
import { Label } from "./components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs"
import { Input } from "./components/ui/input"
import user, { addLogin } from "./user"

function LoginDialog(props: {
  isOpen: boolean
  onClose: () => void
  onLogin: () => void
  onSignup?: () => void
}) {
  const [isLoading, setIsLoading] = createSignal(false)
  const [nsec, setNsec] = createSignal("")
  const [bunkerUri, setBunkerUri] = createSignal("")
  const showExtension = () => (window as any).nostr && !user().all.find(u => u._method === "nip07")

  return (
    <Dialog open={props.isOpen} onOpenChange={props.onClose}>
      <DialogContent class="sm:max-w-md p-0 overflow-hidden rounded-2xl">
        <DialogHeader class="px-6 pt-6 pb-0 relative">
          <DialogTitle class="text-xl font-semibold text-center">Log in</DialogTitle>
          <DialogDescription class="text-center text-muted-foreground mt-2">
            Access your account securely with your preferred method
          </DialogDescription>
        </DialogHeader>

        <div class="px-6 py-8 space-y-6">
          <Tabs defaultValue={"nostr" in window ? "extension" : "key"} class="w-full">
            <TabsList class={`grid mb-6 ${showExtension() ? "grid-cols-3" : "grid-cols-2"}`}>
              <Show when={showExtension()}>
                <TabsTrigger value="extension">Extension</TabsTrigger>
              </Show>
              <TabsTrigger value="key">nsec</TabsTrigger>
              <TabsTrigger value="bunker">Bunker</TabsTrigger>
            </TabsList>

            <TabsContent value="extension" class="space-y-4 min-h-[185px]">
              <div class="text-center p-4 rounded-lg bg-gray-50 dark:bg-gray-800">
                <Shield class="w-12 h-12 mx-auto mb-3 text-primary" />
                <p class="text-sm text-gray-600 dark:text-gray-300 mb-4">
                  Login with one click using the browser extension
                </p>
                <Button
                  class="w-full rounded-full py-6"
                  onClick={handleExtensionLogin}
                  disabled={isLoading()}
                >
                  {isLoading() ? "Logging in..." : "Login with Extension"}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="key" class="space-y-4 min-h-[185px]">
              <div class="space-y-4">
                <div class="space-y-2">
                  <Label for="nsec" class="text-sm font-medium text-gray-700 dark:text-gray-400">
                    Enter your secret key:
                  </Label>
                  <Input
                    id="nsec"
                    value={nsec()}
                    onInput={e => setNsec(e.target.value)}
                    class="rounded-lg border-gray-300 dark:border-gray-700 focus-visible:ring-primary"
                    placeholder="nsec1..."
                  />
                </div>
                <Button
                  class="w-full rounded-full py-6 mt-4"
                  onClick={handleKeyLogin}
                  disabled={isLoading() || !nsec().trim() || !nsec().startsWith("nsec1")}
                >
                  {isLoading() ? "Verifying..." : "Login with Nsec"}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="bunker" class="space-y-4 min-h-[185px]">
              <div class="space-y-2">
                <Label for="bunkerUri" class="text-sm font-medium text-gray-700 dark:text-gray-400">
                  Enter your remote signer URI:
                </Label>
                <Input
                  id="bunkerUri"
                  value={bunkerUri()}
                  onInput={e => setBunkerUri(e.target.value)}
                  class="rounded-lg border-gray-300 dark:border-gray-700 focus-visible:ring-primary"
                  placeholder="bunker://"
                />
                <Show when={bunkerUri().trim() && !bunkerUri().startsWith("bunker://")}>
                  <p class="text-red-500 text-xs">URI must start with bunker://</p>
                </Show>
              </div>

              <Button
                class="w-full rounded-full py-6"
                onClick={handleBunkerLogin}
                disabled={
                  isLoading() || !bunkerUri().trim() || !bunkerUri().startsWith("bunker://")
                }
              >
                {isLoading() ? "Connecting..." : "Login with Bunker"}
              </Button>
            </TabsContent>
          </Tabs>

          <div class="text-center text-sm">
            <p class="text-gray-600 dark:text-gray-400">
              Don't have an account?{" "}
              <button
                onClick={handleSignupClick}
                class="cursor-pointer text-primary hover:underline font-medium"
              >
                Create one!
              </button>
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )

  function handleExtensionLogin() {
    try {
      addLogin("nip07")
      props.onLogin()
      props.onClose()
    } catch (error) {
      console.error("extension login failed:", error)
    } finally {
      setIsLoading(false)
    }
  }

  function handleBunkerLogin() {
    if (!bunkerUri().trim() || !bunkerUri().startsWith("bunker://")) return
    setIsLoading(true)

    try {
      addLogin(bunkerUri())
      props.onLogin()
      props.onClose()
      setBunkerUri("")
    } catch (error) {
      console.error("bunker login failed:", error)
    } finally {
      setIsLoading(false)
    }
  }

  function handleKeyLogin() {
    if (!nsec().trim() || !nsec().startsWith("nsec1")) return
    setIsLoading(true)

    try {
      addLogin(nsec())
      props.onLogin()
      props.onClose()
      setNsec("")
    } catch (error) {
      console.error("nsec login failed:", error)
    } finally {
      setIsLoading(false)
    }
  }

  function handleSignupClick() {
    props.onClose()
    if (props.onSignup) {
      props.onSignup()
    }
  }
}

export default LoginDialog
