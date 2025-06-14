import { A } from "@solidjs/router"
import { ChevronDown, LogOut, UserPlus, Settings } from "lucide-solid"
import { For, Show } from "solid-js"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "./components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "./components/ui/avatar"

import user, { setLogin, removeLogin } from "./user"

function AccountSwitcher(props: { onAddAccountClick: () => void }) {
  return (
    <Show when={user().current}>
      <DropdownMenu>
        <DropdownMenuTrigger>
          <button class="cursor-pointer flex items-center gap-3 p-3 rounded-full hover:bg-accent transition-all w-full text-foreground">
            <Avatar class="w-10 h-10">
              <AvatarImage
                src={user().current.metadata.picture}
                alt={user().current.metadata.name}
              />
              <AvatarFallback>{user().current.npub.slice(-2)}</AvatarFallback>
            </Avatar>
            <div class="flex-1 text-left hidden md:block">
              <p class="font-medium text-sm">{user().current.metadata.name}</p>
            </div>
            <ChevronDown class="w-4 h-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent class="w-56 p-2 animate-scale-in">
          <div class="font-medium text-sm px-2 py-1.5">Switch Account</div>
          <For each={user().all}>
            {other => (
              <DropdownMenuItem
                onClick={() => setLogin(other.pubkey)}
                class="flex items-center gap-2 cursor-pointer p-2 rounded-md"
              >
                <Avatar class="w-8 h-8">
                  <AvatarImage src={other.image} alt="avatar" />
                  <AvatarFallback>{other.npub.slice(-2)}</AvatarFallback>
                </Avatar>
                <div class="flex-1">
                  <p class="text-sm font-medium">{other.shortName}</p>
                </div>
                <Show when={other.pubkey === user().current.pubkey}>
                  <div class="w-2 h-2 rounded-full bg-primary" />
                </Show>
              </DropdownMenuItem>
            )}
          </For>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={props.onAddAccountClick}
            class="flex items-center gap-2 cursor-pointer p-2 rounded-md"
          >
            <UserPlus class="w-4 h-4" />
            <span>Add another account</span>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <A href="/settings" class="flex w-full items-center gap-2 cursor-pointer rounded-md">
              <Settings class="w-4 h-4" />
              <span>Settings</span>
            </A>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => removeLogin(user().current.pubkey)}
            class="flex items-center gap-2 cursor-pointer p-2 rounded-md text-red-500"
          >
            <LogOut class="w-4 h-4" />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </Show>
  )
}

export default AccountSwitcher
