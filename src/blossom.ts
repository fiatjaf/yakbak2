import { pool } from "@nostr/gadgets/global"
import { loadRelayList } from "@nostr/gadgets/lists"
import { NostrEvent } from "@nostr/tools"
import { sha256 } from "@noble/hashes/sha256"

import user from "./user"
import { bytesToHex } from "@noble/hashes/utils"

interface BlobDescriptor {
  url: string
  sha256: string
  size: number
  type?: string
  uploaded: number
}

const DEFAULT_BLOSSOM_SERVERS = ["https://blossom.band", "https://blossom.primal.net"]

async function createAuthorizationEvent(
  verb: "get" | "upload" | "list" | "delete",
  sha256?: Uint8Array,
  expirationHours: number = 24
): Promise<NostrEvent> {
  const now = Math.floor(Date.now() / 1000)
  const tags = [
    ["t", verb],
    ["expiration", (now + expirationHours * 3600).toString()]
  ]

  if (sha256 && (verb === "upload" || verb === "delete")) {
    tags.push(["x", bytesToHex(sha256)])
  }

  return await user().current.signer.signEvent({
    kind: 24242,
    content: "",
    tags,
    created_at: now
  })
}

export async function uploadToBlossom(
  blob: Blob,
  servers: string[] = DEFAULT_BLOSSOM_SERVERS
): Promise<string> {
  if (servers.length === 0) {
    throw new Error("No valid blossom servers available")
  }

  const sha = sha256(new Uint8Array(await blob.arrayBuffer()))
  const authEvent = await createAuthorizationEvent("upload", sha)
  const authHeader = `Nostr ${btoa(JSON.stringify(authEvent))}`

  // once this is set we'll attempt mirroring from this server to others
  let uploadedTo: string | undefined

  for (const server of servers) {
    try {
      const target = new URL(`/${uploadedTo ? "mirror" : "upload"}`, server).toString()
      console.log("attempting", target)

      // upload or mirror the blob
      const response = await fetch(target, {
        method: "PUT",
        body: uploadedTo ? JSON.stringify({ url: uploadedTo }) : blob,
        headers: {
          "Content-Type": blob.type,
          "Content-Length": blob.size.toString(),
          Accept: "application/json",
          Authorization: authHeader
        },
        mode: "cors",
        credentials: "omit"
      })

      if (!response.ok) {
        const reason = response.headers.get("X-Reason")
        console.log(
          `upload failed with status ${response.status}${
            reason ? ` - ${reason}` : ""
          } for ${target}`
        )

        // try to get more error details
        try {
          const errorData = await response.text()
          console.log("error response:", errorData)
        } catch (e) {
          console.log("could not read error response")
        }
        continue
      }

      const data: BlobDescriptor = await response.json()
      if (!data.url) {
        console.log("no URL returned from server", target)
        continue
      }
      if (data.sha256 !== bytesToHex(sha)) {
        console.log("server returned different SHA256 hash:", data.sha256)
        continue
      }

      uploadedTo = data.url
    } catch (error) {
      console.error(`failed to upload to ${server}:`, error)
      continue
    }
  }

  if (!uploadedTo) {
    throw new Error(`all blossom servers failed (${servers})`)
  }

  return uploadedTo
}

export async function getBlossomServers(pubkey: string): Promise<string[]> {
  const outbox = (await loadRelayList(user().current.pubkey)).items
    .filter(r => r.write)
    .slice(0, 6)
    .map(r => r.url)

  const blossomEvents = await pool.querySync(outbox, {
    kinds: [10063],
    authors: [pubkey],
    limit: 1
  })

  // if no blossom servers are found, return the default server
  if (!blossomEvents.length) {
    console.log("no blossom servers found, using default server")
    return DEFAULT_BLOSSOM_SERVERS
  }

  // extract server URLs from the 'server' tags and fix any malformed URLs
  const servers = blossomEvents.flatMap((event: NostrEvent) =>
    event.tags.filter(tag => tag[0] === "server").map(tag => tag[1])
  )

  if (servers.length === 0) {
    console.log("no valid blossom servers found in events, using default server")
    return DEFAULT_BLOSSOM_SERVERS
  }

  console.log("found blossom servers:", servers)
  return servers
}
