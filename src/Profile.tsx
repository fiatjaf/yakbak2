import { useParams } from "@solidjs/router"
import { decode } from "@nostr/tools/nip19"
import { createEffect, createResource, createSignal, Match, Show, Switch } from "solid-js"
import { loadNostrUser } from "@nostr/gadgets/metadata"
import { toast } from "solid-sonner"

import Feed from "./Feed"
import { DefinedTab } from "./nostr"
import { Card } from "./components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "./components/ui/avatar"
import { Button } from "./components/ui/button"
import user from "./user"
import { isValid, Nip05 } from "@nostr/tools/nip05"
import { loadFollowsList, loadRelayList } from "@nostr/gadgets/lists"
import { EventTemplate } from "@nostr/tools/pure"
import { pool } from "@nostr/gadgets/global"
import { Check, Copy, Loader } from "lucide-solid"

function Profile() {
  const params = useParams<{ npub: string }>()
  const [author] = createResource(
    () => params.npub,
    async npub => {
      const { type, data } = decode(npub)
      if (type === "npub") {
        return loadNostrUser(data)
      } else if (type === "nprofile") {
        return loadNostrUser(data.pubkey)
      } else {
        throw new Error(`unexpected profile ${npub}`)
      }
    }
  )
  const [validNIP05] = createResource(
    author,
    async a => a.metadata?.nip05 && (await isValid(a.pubkey, a.metadata.nip05 as Nip05))
  )
  const [isFollowing, setIsFollowing] = createSignal(false)
  createEffect(() => {
    if (!user() || !user().current || !author()) return

    loadFollowsList(user().current.pubkey).then(follows => {
      setIsFollowing(follows.items.some(pk => pk === author().pubkey))
    })
  })

  return (
    <Switch>
      <Match when={author.loading}>
        <div class="flex justify-center mt-12">
          <Loader class="animate-spin rounded-full h-8 w-8" />
        </div>
      </Match>
      <Match when={author()}>
        <div class="container mx-auto px-4 py-8 max-w-2xl">
          <Card class="p-6 mb-8">
            <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between">
              <div class="flex items-start w-full space-x-4">
                <Avatar class="h-20 w-20">
                  <AvatarImage src={author().image} alt="Avatar" />
                  <AvatarFallback>{author().npub.slice(-2)}</AvatarFallback>
                </Avatar>
                <div class="flex-1">
                  <div class="flex items-center justify-between gap-2">
                    <h1 class="text-2xl font-bold flex items-center gap-2">
                      {author().shortName}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          navigator.clipboard.writeText(author().npub).then(() => {
                            toast.success("npub copied to clipboard")
                          })
                        }}
                        title="Copy npub"
                      >
                        <Copy />
                      </Button>
                    </h1>
                    <Show
                      when={user()?.current?.pubkey && user().current.pubkey !== author().pubkey}
                    >
                      <div class="flex items-center">
                        <Button size="sm" variant="outline" onClick={handleFollowUnfollow}>
                          {isFollowing() ? "Unfollow" : "Follow"}
                        </Button>
                      </div>
                    </Show>
                  </div>
                  <p class="text-muted-foreground mt-1">{author().metadata.about}</p>
                  <Show when={validNIP05()}>
                    <div class="text-sm text-primary mt-1 flex items-center gap-1">
                      <span class="inline text-green-600">
                        <Check />
                      </span>{" "}
                      {author().metadata.nip05}
                    </div>
                  </Show>
                </div>
              </div>
            </div>
          </Card>

          <Feed
            forcedTabs={[
              [author().shortName, { type: "users", pubkeys: [author().pubkey] }] as DefinedTab
            ]}
            invisibleToggles
          />
        </div>
      </Match>
    </Switch>
  )

  async function handleFollowUnfollow() {
    const follows = await loadFollowsList(
      user().current.pubkey,
      ["wss://purplepag.es", "wss://relay.nostr.band", "wss://relay.damus.io"],
      true
    )
    if (!follows.event) {
      toast.error("Couldn't find your follow list")
      return
    }

    try {
      let update: EventTemplate | undefined
      let successMessage: string
      let newState = isFollowing()
      if (!isFollowing()) {
        // we're supposed to follow
        if (!follows.items.some(pk => pk === author().pubkey)) {
          update = {
            ...follows.event,
            created_at: Math.round(Date.now() / 1000),
            tags: [...follows.event.tags, ["p", author().pubkey]]
          }
        }
        successMessage = `Followed ${author().shortName}`
        newState = true
      } else {
        // we're supposed to unfollow
        if (follows.items.some(pk => pk === author().pubkey)) {
          update = {
            ...follows.event,
            created_at: Math.round(Date.now() / 1000),
            tags: follows.event.tags.filter(tag => tag[1] !== author().pubkey)
          }
        }
        successMessage = `Unfollowed ${author().shortName}`
        newState = false
      }

      if (update) {
        const writeRelays = (await loadRelayList(user().current.pubkey)).items
          .filter(r => r.write)
          .slice(0, 4)
          .map(r => r.url)

        const newEvent = await user().current.signer.signEvent(update)
        await Promise.any(pool.publish(writeRelays, newEvent))
        toast.success(successMessage)
        setIsFollowing(newState)
        await loadFollowsList(user().current.pubkey, [], newEvent)
      }
    } catch (err) {
      console.error("Failed to update follow list:", err)
      toast.error("Failed to update follow list")
    }
  }
}

export default Profile
