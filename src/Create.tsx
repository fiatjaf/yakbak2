import { ArrowUpToLine, Hash, Loader, Mic, MicOff, Pause, Play, Trash2 } from "lucide-solid"
import { toast } from "solid-sonner"
import {
  createEffect,
  createSignal,
  For,
  JSXElement,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch
} from "solid-js"

import { Button } from "./components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./components/ui/dialog"
import { Input } from "./components/ui/input"
import user from "./user"
import { parseHashtags } from "./utils"
import { pool } from "@nostr/gadgets/global"
import { loadRelayList } from "@nostr/gadgets/lists"
import { getBlossomServers, uploadToBlossom } from "./blossom"
import { Badge } from "./components/ui/badge"
import { NostrEvent } from "@nostr/tools/pure"
import { recordingReply, recordingRoot, setRecordingReply, setRecordingRoot } from "./global"

function Create(props: {
  replyingTo?: NostrEvent
  children?: JSXElement
  vanishesOnScroll?: boolean
}) {
  const [isRecording, setIsRecording] = props.replyingTo
    ? [
        () => recordingReply() === props.replyingTo.id,
        (is: boolean) => setRecordingReply(is ? props.replyingTo.id : "")
      ]
    : [recordingRoot, setRecordingRoot]
  const [previewUrl, setPreviewUrl] = createSignal<string | null>(null)
  const [isUploading, setIsUploading] = createSignal(false)
  const [recordingDuration, setRecordingDuration] = createSignal(0)
  let recordingInterval: number
  const [isPlaying, setIsPlaying] = createSignal(false)
  const [hashtags, setHashtags] = createSignal<string[]>([])
  const [isHashtagDialogOpen, setIsHashtagDialogOpen] = createSignal(false)
  const [newHashtag, setNewHashtag] = createSignal("")
  const [isScrolling, setIsScrolling] = createSignal(false)

  let audioRef: HTMLAudioElement | undefined
  let mediaRecorder: MediaRecorder | undefined
  let outbox: string[] = []

  createEffect(async () => {
    if (!user()?.current) return

    outbox = (await loadRelayList(user().current.pubkey)).items
      .filter(r => r.write)
      .slice(0, 4)
      .map(r => r.url)
  })

  onMount(() => {
    if (props.vanishesOnScroll) window.addEventListener("scroll", handleScroll)
  })
  onCleanup(() => {
    window.removeEventListener("scroll", handleScroll)
  })
  let scrollingTimeout: number
  function handleScroll() {
    setIsScrolling(true)
    if (scrollingTimeout) clearTimeout(scrollingTimeout)
    scrollingTimeout = setTimeout(() => {
      setIsScrolling(false)
    }, 220)
  }

  return (
    <Switch>
      {/* uploading */}
      <Match when={isUploading()}>
        <Loader class="animate-spin rounded-full h-6 w-6" />
      </Match>

      {/* after we have recorded something we can discard, listen or publish */}
      <Match when={previewUrl()}>
        <div class="mb-2 flex flex-wrap gap-2">
          <For each={hashtags()}>
            {tag => (
              <span
                class="bg-secondary text-xs px-2 py-1 rounded-full cursor-pointer"
                onClick={() => setHashtags(hashtags().filter(t => t !== tag))}
              >
                #{tag} ×
              </span>
            )}
          </For>
        </div>
        <div class="flex items-center gap-4">
          <Button
            onClick={handleDiscardRecording}
            size="lg"
            class={`h-12 w-12 rounded-[50%] shadow-lg flex items-center justify-center p-0`}
          >
            <Trash2 class="h-5 w-5" />
          </Button>
          <Button
            onClick={handlePlayPause}
            size="lg"
            class={`h-16 w-16 rounded-[50%] shadow-lg transition-transform duration-200 flex items-center justify-center p-0`}
          >
            <Switch>
              <Match when={previewUrl()}>
                <Switch>
                  <Match when={isPlaying()}>
                    <Pause class="h-6 w-6" />
                  </Match>
                  <Match when={true}>
                    <Play class="h-6 w-6" />
                  </Match>
                </Switch>
              </Match>
              <Match when={true}>
                <Mic class="h-6 w-6" />
              </Match>
            </Switch>
          </Button>
          <Button
            onClick={handlePublishRecording}
            size="lg"
            class={`h-12 w-12 rounded-[50%] shadow-lg flex items-center justify-center p-0`}
          >
            <ArrowUpToLine />
          </Button>
          <Show when={!props.replyingTo}>
            <Button
              type="button"
              size="lg"
              variant="outline"
              class="w-12 h-12 rounded-[50%] shadow-lg flex items-center justify-center p-0"
              onClick={() => setIsHashtagDialogOpen(true)}
              disabled={hashtags().length >= 3}
            >
              <Hash class="h-5 w-5 text-primary" />
            </Button>
          </Show>
          <Dialog open={isHashtagDialogOpen()} onOpenChange={setIsHashtagDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  <span class="flex items-center gap-2">
                    <Hash class="h-5 w-5 text-primary" />
                    Add hashtags
                  </span>
                </DialogTitle>
              </DialogHeader>
              <div class="space-y-4">
                <form
                  class="flex items-center gap-2"
                  onSubmit={e => {
                    e.preventDefault()
                    const newTags = parseHashtags(newHashtag())
                    const uniqueTags = Array.from(new Set([...hashtags(), ...newTags]))
                      .slice(0, 3)
                      .map(hashtag => hashtag.toLowerCase())
                    setHashtags(uniqueTags)
                    setNewHashtag("")
                  }}
                >
                  <Input
                    placeholder="Add hashtag (max 3)"
                    value={newHashtag()}
                    onInput={e => setNewHashtag(e.target.value)}
                    maxLength={30}
                    class="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={hashtags().length >= 3 || !newHashtag().trim()}
                  >
                    <Hash class="h-4 w-4 text-primary" />
                  </Button>
                </form>
                <Show when={hashtags().length > 0}>
                  <div class="flex flex-wrap gap-2">
                    <For each={hashtags()}>
                      {tag => (
                        <Badge
                          class="cursor-pointer"
                          onClick={() => setHashtags(hashtags().filter(t => t !== tag))}
                        >
                          #{tag} ×
                        </Badge>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </Match>

      {/* recording */}
      <Match when={isRecording()}>
        <div class="flex items-center gap-4">
          <Button
            onClick={handleRecord}
            size={props.replyingTo ? "sm" : "lg"}
            variant={props.replyingTo ? "ghost" : undefined}
            class="h-16 w-16 shadow-lg rounded-[50%] transition-transform duration-200 bg-destructive hover:bg-destructive/90"
            title={props.replyingTo ? "Replies" : undefined}
          >
            <div class="flex flex-col items-center">
              <MicOff class="h-6 w-6" />
              <span class="text-xs mt-1">{recordingDuration()}s / 60</span>
            </div>
          </Button>
        </div>
      </Match>

      {/* if we're not recording scrolling makes the button invisible */}
      <Match when={isScrolling()}>
        <></>
      </Match>

      {/* default state, ready to record */}
      <Match when={!previewUrl()}>
        <div class="flex items-center gap-4">
          <Button
            onClick={handleRecord}
            size={props.replyingTo ? "sm" : "lg"}
            variant={props.replyingTo ? "ghost" : undefined}
            class={`${props.replyingTo ? "h-9 bg-transparent text-black hover:bg-accent shadow-none rounded-md" : "h-16 w-16 shadow-lg rounded-[50%]"} transition-transform duration-200`}
            title={props.replyingTo ? "Replies" : undefined}
          >
            <Switch>
              <Match when={props.children}>
                {/* display either the stuff we got from the parent
                      (which probably includes a count of replies and stuff) */}
                {props.children}
              </Match>
              <Match when={true}>
                {/* or display the default icon (this is in the standalone record button case) */}
                <Mic class="h-6 w-6" />
              </Match>
            </Switch>
          </Button>
        </div>
      </Match>
    </Switch>
  )

  async function handleRecord() {
    if (!user()?.current) {
      // don't do anything if the user is not logged in
      return
    }

    if (props.replyingTo && recordingRoot()) {
      // if global is already recording we can't
      return
    }

    if (props.replyingTo && recordingReply() && recordingReply() !== props.replyingTo.id) {
      // if some other reply is being recorded we can't start this one either
      return
    }

    if (!props.replyingTo && recordingReply()) {
      // this should never happen as the button will vanish anyway but just for completeness
      return
    }

    if (isRecording()) {
      // stop recording
      stopRecording()
      return
    }

    // actually start recording
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      setIsRecording(true)
      setPreviewUrl(null)
      setRecordingDuration(0)

      recordingInterval = setInterval(() => {
        setRecordingDuration(curr => curr + 1)
        if (recordingDuration() >= 60) {
          stopRecording()
        }
      }, 1000)

      const recorder = new MediaRecorder(stream)
      const audioChunks: Blob[] = []

      recorder.ondataavailable = event => {
        audioChunks.push(event.data)
      }

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: "audio/webm" })
        const url = URL.createObjectURL(audioBlob)
        setPreviewUrl(url)
        clearInterval(recordingInterval)
      }

      recorder.start()
      mediaRecorder = recorder
    } catch (error) {
      console.error("Error accessing microphone:", error)
      toast.error("Failed to access microphone")
      clearInterval(recordingInterval)
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop()
      setIsRecording(false)
      mediaRecorder = undefined
      clearInterval(recordingInterval)
    }
  }

  function handleDiscardRecording() {
    if (previewUrl()) {
      URL.revokeObjectURL(previewUrl())
      setPreviewUrl(null)
      toast.info("Voice message discarded")
    }
    setIsPlaying(false)
    setRecordingDuration(0)
    setHashtags([])
    setNewHashtag("")
  }

  function handlePlayPause() {
    if (!audioRef) {
      audioRef = new Audio(previewUrl())
      audioRef.onended = () => {
        setIsPlaying(false)
      }
    }

    if (isPlaying()) {
      audioRef.pause()
      setIsPlaying(false)
    } else {
      audioRef.play()
      setIsPlaying(true)
    }
  }

  async function handlePublishRecording() {
    setIsUploading(true)

    const response = await fetch(previewUrl())
    const audioBlob = await response.blob()
    const audioBlobWithType = new Blob([audioBlob], { type: "video/webm" })

    const blossomServers = await getBlossomServers(user().current.pubkey)
    if (!blossomServers.length) {
      toast.error("No valid blossom servers found")
      setIsUploading(false)
      return
    }

    try {
      const audioUrl = await uploadToBlossom(audioBlobWithType, blossomServers)
      const event = await user().current.signer.signEvent({
        created_at: Math.round(Date.now() / 1000),
        kind: props.replyingTo ? 1244 : 1222,
        content: audioUrl,
        tags: [
          ...hashtags().map(tag => ["t", tag]),
          ...(props.replyingTo
            ? [
                ["p", props.replyingTo.pubkey],
                ["e", props.replyingTo.id],
                ["k", props.replyingTo.kind.toString()],
                ...(props.replyingTo.kind === 1244 || props.replyingTo.kind === 1111
                  ? props.replyingTo.tags.filter(t => t[0] === "P" || t[0] === "E" || t[0] === "K")
                  : [
                      ["P", props.replyingTo.pubkey],
                      ["E", props.replyingTo.id],
                      ["K", props.replyingTo.kind.toString()]
                    ])
              ]
            : [])
        ]
      })

      const relays = props.replyingTo
        ? [
            ...outbox,
            ...(await loadRelayList(props.replyingTo.pubkey)).items
              .filter(r => r.read)
              .map(r => r.url)
          ]
        : outbox

      await Promise.any(pool.publish(relays, event))

      toast.success("Voice message published successfully")
      if (previewUrl()) {
        URL.revokeObjectURL(previewUrl())
        setPreviewUrl(null)
      }
      setRecordingDuration(0)
    } catch (err) {
      console.error("failed to publish", err)
      toast.error("Failed to publish")
    } finally {
      setIsUploading(false)
    }
  }
}

export default Create
