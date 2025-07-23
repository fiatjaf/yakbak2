import { For, Show, createEffect, createSignal, onCleanup } from "solid-js"
import { Button } from "./components/ui/button"
import { NostrEvent } from "@nostr/tools/pure"
import { Pause, Play } from "lucide-solid"

function AudioPlayer(props: { event: NostrEvent }) {
  const [isPlaying, setIsPlaying] = createSignal(false)
  const [currentTime, setCurrentTime] = createSignal(0)
  const [duration, setDuration] = createSignal(0)
  let audioRef: HTMLAudioElement | undefined

  const imeta = () => props.event.tags.find(t => t[0] == "imeta")
  const src = () =>
    imeta()
      ?.find(item => item.startsWith("url "))
      ?.split(" ")[1] ?? props.event.content

  const waveform = () =>
    imeta()
      ?.find(item => item.startsWith("waveform "))
      ?.split(" ")
      .slice(1)
      .map(parseFloat) ?? Array.from({ length: 100 }, () => 0.8)

  createEffect(() => {
    const dur = imeta()
      ?.find(item => item.startsWith("duration "))
      ?.split(" ")[1]

    if (dur) {
      const duration = parseFloat(dur)
      if (duration > 0) {
        setDuration(duration)
      }
    }
  })

  const togglePlayPause = () => {
    if (!audioRef) return

    if (isPlaying()) {
      audioRef.pause()
    } else {
      audioRef.play()
    }
    setIsPlaying(!isPlaying())
  }

  const handleSeek = (e: MouseEvent) => {
    if (!audioRef || !duration()) return

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentage = x / rect.width
    const newTime = percentage * duration()

    audioRef.currentTime = newTime
    setCurrentTime(newTime)
  }

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }

  const progress = () => (duration() > 0 ? (currentTime() / duration()) * 100 : 0)

  onCleanup(() => {
    if (audioRef) {
      audioRef.pause()
    }
  })

  return (
    <div class="w-full bg-card border rounded-lg p-4">
      <audio
        ref={audioRef}
        src={src()}
        onTimeUpdate={() => {
          setCurrentTime(audioRef.currentTime)
        }}
        onLoadedMetadata={() => {
          if (audioRef.duration !== Infinity) {
            setDuration(audioRef.duration)
          }
        }}
        onEnded={() => setIsPlaying(false)}
        preload="metadata"
      />

      <div class="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={togglePlayPause}
          class="h-10 w-10 rounded-full"
        >
          {isPlaying() ? <Pause /> : <Play />}
        </Button>

        <div class="flex-1">
          <div class="relative h-12 cursor-pointer" onClick={handleSeek}>
            {/* waveform */}
            <svg
              class="absolute inset-0 w-full h-full"
              preserveAspectRatio="none"
              viewBox="0 0 100 100"
            >
              <For each={waveform()}>
                {(height, index) => {
                  const x = () => (index() / waveform().length) * 100
                  const width = 100 / waveform().length - 0.5
                  const isPassed = () => x() < progress()

                  return (
                    <rect
                      x={x()}
                      y={50 - (height * 50) / 2}
                      width={width}
                      height={height * 50}
                      fill={isPassed() ? "currentColor" : "currentColor"}
                      opacity={isPassed() ? 1 : 0.3}
                      class="transition-opacity"
                    />
                  )
                }}
              </For>

              {/* Progress indicator */}
              <Show when={duration()}>
                <line
                  x1={progress()}
                  y1="0"
                  x2={progress()}
                  y2="100"
                  stroke="currentColor"
                  stroke-width="1"
                />
              </Show>
            </svg>
          </div>

          <Show when={duration()}>
            <div class="flex justify-between text-xs text-muted-foreground mt-1">
              <span>{formatTime(currentTime())}</span>
              <span>{formatTime(duration())}</span>
            </div>
          </Show>
        </div>

        <Show when={!duration()}>
          <div class="text-xs text-muted-foreground ml-1">{formatTime(currentTime())}</div>
        </Show>
      </div>
    </div>
  )
}

export default AudioPlayer
