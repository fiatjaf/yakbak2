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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs"
import { Input } from "./components/ui/input"
import user from "./user"

function LoginDialog(props: {
  isOpen: boolean
  onClose: () => void
  onLogin: () => void
  onSignup?: () => void
}) {
  const [isLoading, setIsLoading] = createSignal(false)
  const [nsec, setNsec] = createSignal("")
  const [bunkerUri, setBunkerUri] = createSignal("")

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
            <TabsList class="grid grid-cols-3 mb-6">
              <Show when={(window as any).nostr}>
                <TabsTrigger value="extension">Extension</TabsTrigger>
              </Show>
              <TabsTrigger value="key">nsec</TabsTrigger>
              <TabsTrigger value="bunker">Bunker</TabsTrigger>
            </TabsList>

            <TabsContent value="extension" class="space-y-4">
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

            <TabsContent value="key" class="space-y-4">
              <div class="space-y-4">
                <div class="space-y-2">
                  <label for="nsec" class="text-sm font-medium text-gray-700 dark:text-gray-400">
                    Enter your nsec
                  </label>
                  <Input
                    id="nsec"
                    value={nsec()}
                    onChange={e => setNsec(e.target.value)}
                    class="rounded-lg border-gray-300 dark:border-gray-700 focus-visible:ring-primary"
                    placeholder="nsec1..."
                  />
                </div>

                <Button
                  class="w-full rounded-full py-6 mt-4"
                  onClick={handleKeyLogin}
                  disabled={isLoading() || !nsec().trim()}
                >
                  {isLoading() ? "Verifying..." : "Login with Nsec"}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="bunker" class="space-y-4">
              <div class="space-y-2">
                <label for="bunkerUri" class="text-sm font-medium text-gray-700 dark:text-gray-400">
                  Bunker URI
                </label>
                <Input
                  id="bunkerUri"
                  value={bunkerUri()}
                  onChange={e => setBunkerUri(e.target.value)}
                  class="rounded-lg border-gray-300 dark:border-gray-700 focus-visible:ring-primary"
                  placeholder="bunker://"
                />
                {bunkerUri().trim() && !bunkerUri().startsWith("bunker://") && (
                  <p class="text-red-500 text-xs">URI must start with bunker://</p>
                )}
              </div>

              <Button
                class="w-full rounded-full py-6"
                onClick={handleBunkerLogin}
                disabled={
                  isLoading() || !!bunkerUri().trim() || !bunkerUri().startsWith("bunker://")
                }
              >
                {isLoading() ? "Connecting..." : "Login with Bunker"}
              </Button>
            </TabsContent>
          </Tabs>

          <div class="text-center text-sm">
            <p class="text-gray-600 dark:text-gray-400">
              Don't have an account?{" "}
              <button onClick={handleSignupClick} class="text-primary hover:underline font-medium">
                Sign up
              </button>
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )

  function handleExtensionLogin() {}

  function handleBunkerLogin() {
    if (!bunkerUri().trim() || !bunkerUri().startsWith("bunker://")) return
    setIsLoading(true)

    try {
      login.bunker(bunkerUri())
      props.onLogin()
      props.onClose()
    } catch (error) {
      console.error("Bunker login failed:", error)
    } finally {
      setIsLoading(false)
    }
  }

  function handleKeyLogin() {
    if (!nsec().trim()) return
    setIsLoading(true)

    try {
      login.nsec(nsec())
      props.onLogin()
      props.onClose()
    } catch (error) {
      console.error("Nsec login failed:", error)
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
