import { Component, createMemo } from "solid-js"
import { Button } from "./components/ui/button"
import VoiceMessage from "./VoiceMessage"
import { ChevronDown, ChevronUp } from "lucide-solid"

function Feed() {
  const { user } = useCurrentUser()
  const { ref, inView } = useInView()
  const [filter, setFilter] = useState<FeedFilter>("global")
  const queryClient = useQueryClient()
  const [updateCounter, setUpdateCounter] = useState(0)
  const processedEvents = useRef<Set<string>>(new Set())
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set())

  const { data, error, fetchNextPage, hasNextPage, isFetchingNextPage, status, refetch } =
    useInfiniteQuery({
      queryKey: ["voiceMessages", filter],
      initialPageParam: Math.floor(Date.now() / 1000), // Start from current time
      queryFn: async ({ pageParam = Math.floor(Date.now() / 1000) }) => {
        const signal = AbortSignal.timeout(1500)

        // Base filter for voice messages
        const baseFilter = {
          kinds: [1222],
          limit: PAGE_SIZE,
          until: pageParam as number
          // Remove the since filter to get all messages
        }

        // If following filter is selected and user is logged in, add authors filter
        if (filter === "following" && user?.pubkey) {
          console.log("[VoiceMessageFeed] Fetching following list for user:", user.pubkey)
          const following = await nostr.query(
            [
              {
                kinds: [3],
                authors: [user.pubkey],
                limit: 1
              }
            ],
            { signal }
          )

          const followingEvent = following[0]
          if (followingEvent?.tags) {
            const followingList = followingEvent.tags
              .filter(tag => tag[0] === "p")
              .map(tag => tag[1])

            console.log("[VoiceMessageFeed] Following list length:", followingList.length)

            if (followingList.length > 0) {
              console.log("[VoiceMessageFeed] Fetching following feed with authors:", followingList)
              const followingEvents = await nostr.query(
                [
                  {
                    ...baseFilter,
                    authors: followingList
                  }
                ],
                { signal }
              )
              console.log("[VoiceMessageFeed] Following feed events:", followingEvents.length)
              return followingEvents
            } else {
              console.log("[VoiceMessageFeed] Following list is empty")
            }
          } else {
            console.log("[VoiceMessageFeed] No following event found")
          }
          return []
        }

        // Global feed
        console.log("[VoiceMessageFeed] Fetching global feed")
        const globalEvents = await nostr.query([baseFilter], { signal })
        console.log("[VoiceMessageFeed] Global feed events:", globalEvents.length)
        return globalEvents
      },
      getNextPageParam: (lastPage: NostrEvent[]) => {
        if (!lastPage || lastPage.length < PAGE_SIZE) {
          console.log("[VoiceMessageFeed] No more pages available")
          return undefined
        }
        const lastMessage = lastPage[lastPage.length - 1]
        if (!lastMessage) {
          console.log("[VoiceMessageFeed] No last message found")
          return undefined
        }
        // Subtract 1 from the timestamp to avoid getting the same message again
        const nextParam = lastMessage.created_at - 1
        console.log(
          "[VoiceMessageFeed] Next page param:",
          nextParam,
          new Date(nextParam * 1000).toISOString()
        )
        return nextParam
      },
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      refetchOnReconnect: true
    })

  // Organize messages into threads
  const threadedMessages = createMemo(() => {
    if (!data?.pages) return []

    console.log("[VoiceMessageFeed] Recomputing threaded messages, update counter:", updateCounter)
    const allMessages = data.pages.flat()
    const messageMap = new Map<string, ThreadedMessage>()
    const rootMessages: ThreadedMessage[] = []
    const processedMessages = new Set<string>()

    // First pass: create message objects with empty replies array
    allMessages.forEach(message => {
      messageMap.set(message.id, { ...message, replies: [] })
    })

    // Second pass: organize into threads
    allMessages.forEach(message => {
      if (processedMessages.has(message.id)) return

      const rootTag = message.tags.find(tag => tag[0] === "e" && tag[3] === "root")
      const replyTag = message.tags.find(tag => tag[0] === "e" && tag[3] === "reply")

      const threadedMessage = messageMap.get(message.id)
      if (!threadedMessage) return

      if (rootTag) {
        const rootId = rootTag[1]
        const rootMessage = messageMap.get(rootId)
        if (rootMessage) {
          // Check if this reply already exists
          const existingReplyIndex = rootMessage.replies.findIndex(
            reply => reply.id === message.id || reply.id.startsWith("temp-")
          )

          if (existingReplyIndex === -1) {
            rootMessage.replies.push(threadedMessage)
          } else {
            // Replace the temporary reply with the real one
            rootMessage.replies[existingReplyIndex] = threadedMessage
          }
          processedMessages.add(message.id)
        }
      } else if (!replyTag) {
        // This is a root message
        rootMessages.push(threadedMessage)
        processedMessages.add(message.id)
      }
    })

    // Sort root messages by created_at
    return rootMessages.sort((a, b) => b.created_at - a.created_at)
  }, [data?.pages, updateCounter])

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage])

  // Refetch when filter changes
  useEffect(() => {
    refetch()
  }, [filter, refetch])

  const toggleReplies = (messageId: string) => {
    setExpandedReplies(prev => {
      const next = new Set(prev)
      if (next.has(messageId)) {
        next.delete(messageId)
      } else {
        next.add(messageId)
      }
      return next
    })
  }

  if (status === "error") {
    return <div>Error: {error.message}</div>
  }

  const hasMessages = data?.pages?.[0]?.length > 0
  const isLoading = status === "pending"
  const isError = status === "error"

  return (
    <div class="space-y-4">
      <div class="flex justify-center -mt-6 mb-2">
        <ToggleGroup
          type="single"
          value={filter}
          onValueChange={value => value && setFilter(value as FeedFilter)}
        >
          <ToggleGroupItem value="global" aria-label="Global feed">
            <Globe class="h-4 w-4 mr-2" />
            Global
          </ToggleGroupItem>
          <ToggleGroupItem value="following" aria-label="Following feed" disabled={!user}>
            <Users class="h-4 w-4 mr-2" />
            Following
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div class="space-y-4">
        {isLoading ? (
          <div class="flex justify-center">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
          </div>
        ) : isError ? (
          <div class="text-center text-red-500">Error loading messages</div>
        ) : (
          threadedMessages.map(message => (
            <div key={message.id} class="space-y-4">
              <VoiceMessage message={message} />
              {message.replies.length > 0 && (
                <div class="ml-8">
                  <Button
                    variant="ghost"
                    size="sm"
                    class="flex items-center gap-2 text-muted-foreground hover:text-foreground"
                    onClick={() => toggleReplies(message.id)}
                  >
                    {expandedReplies.has(message.id) ? (
                      <ChevronUp class="h-4 w-4" />
                    ) : (
                      <ChevronDown class="h-4 w-4" />
                    )}
                    {message.replies.length} {message.replies.length === 1 ? "reply" : "replies"}
                  </Button>
                  {expandedReplies.has(message.id) && (
                    <div class="mt-2 space-y-4 border-l-2 border-muted pl-4">
                      {message.replies
                        .sort((a, b) => a.created_at - b.created_at)
                        .map(reply => (
                          <VoiceMessage key={reply.id} message={reply} />
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div ref={ref} class="h-12 w-full flex items-center justify-center">
        {isFetchingNextPage ? (
          <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900" />
        ) : !hasNextPage && hasMessages ? (
          <div class="text-sm text-muted-foreground">No more messages</div>
        ) : !hasMessages ? (
          <div class="text-sm text-muted-foreground">
            {filter === "following" && !user
              ? "Please log in to see messages from people you follow"
              : filter === "following" && user
                ? "No messages from people you follow yet"
                : "No messages yet. Be the first to record a voice message!"}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default Feed as Component
