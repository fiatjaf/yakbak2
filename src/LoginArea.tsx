import { Component, createSignal, Match, Switch } from "solid-js"
import { User } from "lucide-solid"

import AccountSwitcher from "./AccountSwitcher"
import user from "./user"
import { Button } from "./components/ui/button"
import LoginDialog from "./LoginDialog"
import SignupDialog from "./SignupDialog"

export const [loginDialogOpen, setLoginDialogOpen] = createSignal(false)

function LoginArea() {
  const [signupDialogOpen, setSignupDialogOpen] = createSignal(false)

  const handleLogin = () => {
    setLoginDialogOpen(false)
    setSignupDialogOpen(false)
  }

  return (
    <>
      <Switch>
        <Match when={user().current}>
          <AccountSwitcher onAddAccountClick={() => setLoginDialogOpen(true)} />
        </Match>
        <Match when={!user().current}>
          <Button
            onClick={() => setLoginDialogOpen(true)}
            class="cursor-pointer flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground w-full font-medium transition-all hover:bg-primary/90 animate-scale-in"
          >
            <User class="w-4 h-4" />
            <span>Log in</span>
          </Button>
        </Match>
      </Switch>
      <LoginDialog
        isOpen={loginDialogOpen()}
        onClose={() => setLoginDialogOpen(false)}
        onLogin={handleLogin}
        onSignup={() => setSignupDialogOpen(true)}
      />
      <SignupDialog isOpen={signupDialogOpen()} onClose={() => setSignupDialogOpen(false)} />
    </>
  )
}

export default LoginArea as Component
