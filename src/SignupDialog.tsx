import { generateSecretKey } from "@nostr/tools/pure"
import { nsecEncode } from "@nostr/tools/nip19"
import { createSignal, Match, Switch } from "solid-js"
import { Download, Key } from "lucide-solid"
import { toast } from "solid-sonner"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "./components/ui/dialog"
import { Button } from "./components/ui/button"
import { addLogin } from "./user"

function SignupDialog(props: { isOpen: boolean; onClose: () => void }) {
  const [step, setStep] = createSignal<"generate" | "download" | "done">("generate")
  const [isLoading, setIsLoading] = createSignal(false)
  const [nsec, setNsec] = createSignal("")

  return (
    <Dialog open={props.isOpen} onOpenChange={props.onClose}>
      <DialogContent class="sm:max-w-md p-0 overflow-hidden rounded-2xl">
        <Switch>
          <Match when={step() === "generate"}>
            <DialogHeader class="px-6 pt-6 pb-0 relative">
              <DialogTitle class="text-xl font-semibold text-center">
                Create your account
              </DialogTitle>
              <DialogDescription class="text-center text-muted-foreground mt-2">
                Generate a secure key for your account
              </DialogDescription>
            </DialogHeader>
            <div class="px-6 py-8 space-y-6">
              <div class="text-center space-y-6">
                <div class="p-4 rounded-lg bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
                  <Key class="w-16 h-16 text-primary" />
                </div>
                <p class="text-sm text-gray-600 dark:text-gray-300">
                  We'll generate a secure key for your account. You'll need this key to log in
                  later.
                </p>
                <Button
                  class="w-full rounded-full py-6"
                  onClick={generateKey}
                  disabled={isLoading()}
                >
                  {isLoading() ? "Generating key..." : "Generate my key"}
                </Button>
              </div>
            </div>
          </Match>

          <Match when={step() === "download"}>
            <DialogHeader class="px-6 pt-6 pb-0 relative">
              <DialogTitle class="text-xl font-semibold text-center">
                Setting Up Your Account
              </DialogTitle>
              <DialogDescription class="text-center text-muted-foreground mt-2">
                Finalizing your account setup
              </DialogDescription>
            </DialogHeader>
            <div class="px-6 py-8 space-y-6">
              <div class="space-y-6">
                <div class="p-4 rounded-lg border bg-gray-50 dark:bg-gray-800 overflow-auto">
                  <code class="text-xs break-all">{nsec()}</code>
                </div>

                <div class="text-sm text-gray-600 dark:text-gray-300 space-y-2">
                  <p class="font-medium text-red-500">Important:</p>
                  <ul class="list-disc pl-5 space-y-1">
                    <li>This is your only way to access your account</li>
                    <li>Store it somewhere safe</li>
                    <li>Never share this key with anyone</li>
                  </ul>
                </div>

                <div class="flex flex-col space-y-3">
                  <Button variant="outline" class="w-full" onClick={downloadKey}>
                    <Download class="w-4 h-4 mr-2" />
                    Download Key
                  </Button>

                  <Button class="w-full rounded-full py-6" onClick={finishSignup}>
                    I've saved my key, continue
                  </Button>
                </div>
              </div>
            </div>
          </Match>

          <Match when={step() === "done"}>
            <DialogHeader class="px-6 pt-6 pb-0 relative">
              <DialogTitle class="text-xl font-semibold text-center">Download Your Key</DialogTitle>
              <DialogDescription class="text-center text-muted-foreground mt-2">
                Keep your key safe - you'll need it to log in
              </DialogDescription>
            </DialogHeader>
            <div class="px-6 py-8 space-y-6">
              <div class="flex justify-center items-center py-8">
                <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              </div>
            </div>
          </Match>
        </Switch>
      </DialogContent>
    </Dialog>
  )

  function generateKey() {
    setIsLoading(true)

    try {
      const privateKey = generateSecretKey()
      const nsec = nsecEncode(privateKey)
      setNsec(nsec)
      setStep("download")
    } catch (error) {
      console.error("Failed to generate key:", error)
      toast.error("Failed to generate key. Please try again.", {})
    } finally {
      setIsLoading(false)
    }
  }

  function downloadKey() {
    const blob = new Blob([nsec()], { type: "text/plain" })
    const url = globalThis.URL.createObjectURL(blob)

    const a = document.createElement("a")
    a.href = url
    a.download = "nsec.txt"
    document.body.appendChild(a)
    a.click()

    globalThis.URL.revokeObjectURL(url)
    document.body.removeChild(a)

    toast.info("Your key has been downloaded. Keep it safe!")
  }

  function finishSignup() {
    setStep("done")
    addLogin(nsec())
    props.onClose()
    toast.success("You are now logged in.")
  }
}

export default SignupDialog
