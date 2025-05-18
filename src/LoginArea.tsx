import { Component, createSignal } from "solid-js"
import AccountSwitcher from "./AccountSwitcher"

function LoginArea() {
  // const { currentUser } = useLoggedInAccounts();
  const [loginDialogOpen, setLoginDialogOpen] = createSignal(false)
  const [signupDialogOpen, setSignupDialogOpen] = createSignal(false)

  const handleLogin = () => {
    setLoginDialogOpen(false)
    setSignupDialogOpen(false)
  }

  return (
    <>
      {currentUser ? (
        <AccountSwitcher onAddAccountClick={() => setLoginDialogOpen(true)} />
      ) : (
        <Button
          onClick={() => setLoginDialogOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground w-full font-medium transition-all hover:bg-primary/90 animate-scale-in"
        >
          <User className="w-4 h-4" />
          <span>Log in</span>
        </Button>
      )}

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
