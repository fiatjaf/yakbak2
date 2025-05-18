import { Component } from "solid-js"

function Create() {
  const { user } = useCurrentUser()
  const { nostr } = useNostr()
  const { mutate: publishVoice } = useNostrPublish()
  const queryClient = useQueryClient()
  const [isRecording, setIsRecording] = useState(false)
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [recordingTime, setRecordingTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const MAX_RECORDING_TIME = 60 // 60 seconds
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isVisible, setIsVisible] = useState(true)
  const [lastScrollY, setLastScrollY] = useState(0)
  const [hashtags, setHashtags] = useState<string[]>([])
  const [isHashtagDialogOpen, setIsHashtagDialogOpen] = useState(false)
  const [newHashtag, setNewHashtag] = useState("")

  useEffect(() => {
    let timer: NodeJS.Timeout
    if (isRecording) {
      timer = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= MAX_RECORDING_TIME) {
            handleStopRecording()
            return prev
          }
          return prev + 1
        })
      }, 1000)
    }
    return () => {
      if (timer) clearInterval(timer)
    }
  }, [isRecording])

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY
      setIsVisible(currentScrollY < lastScrollY || currentScrollY < 10)
      setLastScrollY(currentScrollY)
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [lastScrollY])

  const handleStartRecording = async () => {
    if (!user) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      setIsRecording(true)
      setPreviewUrl(null)
      setRecordingTime(0)

      const recorder = new MediaRecorder(stream)
      const audioChunks: Blob[] = []

      recorder.ondataavailable = event => {
        audioChunks.push(event.data)
      }

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: "audio/webm" })
        const url = URL.createObjectURL(audioBlob)
        setPreviewUrl(url)
      }

      recorder.start()
      setMediaRecorder(recorder)
    } catch (error) {
      console.error("Error accessing microphone:", error)
      toast.error("Failed to access microphone")
    }
  }

  const handleStopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop()
      setIsRecording(false)
      setMediaRecorder(null)
    }
  }

  const handleDiscardRecording = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
      toast.info("Voice message discarded")
    }
    setRecordingTime(0)
    setHashtags([])
    setNewHashtag("")
  }

  const handlePlayPause = () => {
    if (!previewUrl) return

    if (!audioRef.current) {
      audioRef.current = new Audio(previewUrl)
      audioRef.current.onended = () => {
        setIsPlaying(false)
      }
    }

    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current.play()
      setIsPlaying(true)
    }
  }

  const handlePublishRecording = async () => {
    if (!previewUrl || !user?.pubkey || !user.signer) return

    try {
      const response = await fetch(previewUrl)
      const audioBlob = await response.blob()
      // Ensure the blob has the correct MIME type for Blossom server
      const audioBlobWithType = new Blob([audioBlob], { type: "video/webm" })

      const blossomServers = await getBlossomServers(nostr, user.pubkey)
      if (!blossomServers.length) {
        toast.error("No valid blossom servers found")
        return
      }

      const audioUrl = await uploadToBlossom(
        audioBlobWithType,
        blossomServers,
        user.pubkey,
        user.signer
      )

      publishVoice(
        {
          kind: 1222,
          content: audioUrl,
          tags: [...hashtags.map(tag => ["t", tag])]
        },
        {
          onSuccess: async () => {
            const tempId = "temp-" + Date.now()
            const newMessage: NostrEvent = {
              kind: 1222,
              content: audioUrl,
              created_at: Math.floor(Date.now() / 1000),
              pubkey: user.pubkey,
              id: tempId,
              sig: "",
              tags: []
            }

            // Immediately add the new message to the feed
            queryClient.setQueryData<QueryData>(["voiceMessages", "global"], oldData => {
              if (!oldData) return oldData
              return {
                ...oldData,
                pages: [[newMessage, ...(oldData.pages[0] || [])], ...oldData.pages.slice(1)]
              }
            })

            // Also update the following feed if user is logged in
            queryClient.setQueryData<QueryData>(["voiceMessages", "following"], oldData => {
              if (!oldData) return oldData
              return {
                ...oldData,
                pages: [[newMessage, ...(oldData.pages[0] || [])], ...oldData.pages.slice(1)]
              }
            })

            // Wait a bit before refreshing to ensure the message is propagated
            setTimeout(async () => {
              try {
                // Get the latest messages
                const events = await nostr.query(
                  [
                    {
                      kinds: [1222],
                      authors: [user.pubkey],
                      since: Math.floor(Date.now() / 1000) - 30 // Last 30 seconds
                    }
                  ],
                  { signal: AbortSignal.timeout(2000) }
                )

                if (events.length > 0) {
                  // Update the feed with the real message
                  queryClient.setQueryData<QueryData>(["voiceMessages", "global"], oldData => {
                    if (!oldData) return oldData
                    // Replace the temporary message with the real one
                    const updatedPages = oldData.pages.map(page =>
                      page.map(msg => (msg.id === tempId ? events[0] : msg))
                    )
                    return { ...oldData, pages: updatedPages }
                  })

                  queryClient.setQueryData<QueryData>(["voiceMessages", "following"], oldData => {
                    if (!oldData) return oldData
                    // Replace the temporary message with the real one
                    const updatedPages = oldData.pages.map(page =>
                      page.map(msg => (msg.id === tempId ? events[0] : msg))
                    )
                    return { ...oldData, pages: updatedPages }
                  })
                }
              } catch (error) {
                console.error("Error updating message:", error)
              }
            }, 3000)

            toast.success("Voice message published successfully")
            if (previewUrl) {
              URL.revokeObjectURL(previewUrl)
              setPreviewUrl(null)
            }
            setRecordingTime(0)
          }
        }
      )
    } catch (error) {
      console.error("Error publishing voice message:", error)
      toast.error("Failed to publish voice message")
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <>
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
        {previewUrl && hashtags.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {hashtags.map(tag => (
              <span
                key={tag}
                className="bg-secondary text-xs px-2 py-1 rounded-full cursor-pointer"
                onClick={() => setHashtags(hashtags.filter(t => t !== tag))}
              >
                #{tag} ×
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-4">
          {previewUrl && (
            <>
              <Button
                onClick={handleDiscardRecording}
                size="lg"
                className="w-12 h-12 rounded-[50%] shadow-lg flex items-center justify-center p-0"
              >
                <Trash2 className="h-5 w-5" />
              </Button>
              <Button
                onClick={isRecording ? handleStopRecording : handlePlayPause}
                size="lg"
                className={`w-16 h-16 rounded-[50%] shadow-lg transition-transform duration-200 flex items-center justify-center p-0 ${
                  isRecording ? "bg-destructive hover:bg-destructive/90" : ""
                }`}
                disabled={!user}
              >
                {isRecording ? (
                  <div className="flex flex-col items-center">
                    <MicOff className="h-6 w-6" />
                    <span className="text-xs mt-1">{formatTime(recordingTime)}</span>
                  </div>
                ) : previewUrl ? (
                  isPlaying ? (
                    <Pause className="h-6 w-6" />
                  ) : (
                    <Play className="h-6 w-6" />
                  )
                ) : (
                  <Mic className="h-6 w-6" />
                )}
              </Button>
              <Button
                onClick={handlePublishRecording}
                size="lg"
                className="w-12 h-12 rounded-[50%] shadow-lg flex items-center justify-center p-0"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="w-12 h-12 rounded-[50%] shadow-lg flex items-center justify-center p-0"
                onClick={() => setIsHashtagDialogOpen(true)}
                disabled={hashtags.length >= 3}
              >
                <Hash className="h-5 w-5 text-primary" />
              </Button>
              <Dialog open={isHashtagDialogOpen} onOpenChange={setIsHashtagDialogOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      <span className="flex items-center gap-2">
                        <Hash className="h-5 w-5 text-primary" />
                        Add Hashtags
                      </span>
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Add hashtag (max 3)"
                        value={newHashtag}
                        onChange={e => setNewHashtag(e.target.value)}
                        maxLength={30}
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            const newTags = parseHashtags(newHashtag)
                            const uniqueTags = Array.from(new Set([...hashtags, ...newTags])).slice(
                              0,
                              3
                            )
                            setHashtags(uniqueTags)
                            setNewHashtag("")
                          }
                        }}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          const newTags = parseHashtags(newHashtag)
                          const uniqueTags = Array.from(new Set([...hashtags, ...newTags])).slice(
                            0,
                            3
                          )
                          setHashtags(uniqueTags)
                          setNewHashtag("")
                        }}
                        disabled={hashtags.length >= 3 || !newHashtag.trim()}
                      >
                        <Hash className="h-4 w-4 text-primary" />
                      </Button>
                    </div>
                    {hashtags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {hashtags.map(tag => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="cursor-pointer"
                            onClick={() => setHashtags(hashtags.filter(t => t !== tag))}
                          >
                            #{tag} ×
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}
          {!previewUrl && (
            <Button
              onClick={isRecording ? handleStopRecording : handleStartRecording}
              size="lg"
              className={`w-16 h-16 rounded-[50%] shadow-lg transition-transform duration-200 flex items-center justify-center p-0 ${
                isRecording ? "bg-destructive hover:bg-destructive/90" : ""
              }`}
              disabled={!user}
            >
              {isRecording ? (
                <div className="flex flex-col items-center">
                  <MicOff className="h-6 w-6" />
                  <span className="text-xs mt-1">{formatTime(recordingTime)}</span>
                </div>
              ) : (
                <Mic className="h-6 w-6" />
              )}
            </Button>
          )}
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Voice Message</DialogTitle>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            {!previewUrl ? (
              <Button
                onClick={isRecording ? handleStopRecording : handleStartRecording}
                variant={isRecording ? "destructive" : "default"}
                className="w-full"
              >
                {isRecording ? (
                  <>
                    <MicOff className="mr-2 h-4 w-4" />
                    Stop Recording
                  </>
                ) : (
                  <>
                    <Mic className="mr-2 h-4 w-4" />
                    Record Voice Message
                  </>
                )}
              </Button>
            ) : (
              <div className="space-y-4">
                <div className="bg-muted p-4 rounded-lg">
                  <audio controls className="w-full">
                    <source src={previewUrl} type="audio/webm" />
                    Your browser does not support the audio element.
                  </audio>
                </div>
                <div className="flex space-x-2">
                  <Button onClick={handlePublishRecording} className="flex-1">
                    <Play className="mr-2 h-4 w-4" />
                    Publish
                  </Button>
                  <Button onClick={handleDiscardRecording} variant="destructive" className="flex-1">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Discard
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function parseHashtags(input: string): string[] {
  return input
    .split(/[\s,]+/)
    .map(tag => tag.replace(/^#/, "").trim())
    .filter(tag => tag.length > 0)
}

export default Create as Component
