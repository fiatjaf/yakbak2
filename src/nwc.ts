import { nwc as NWC } from "@getalby/sdk"
import { createResource } from "solid-js"

import settings from "./settings"
import { getSatoshisAmountFromBolt11 } from "./utils"
import { toast } from "solid-sonner"

const [nwc] = createResource(settings(), settings => {
  if (!settings || !settings.nwcConnectionString) return

  return new NWC.NWCClient({
    nostrWalletConnectUrl: settings.nwcConnectionString
  })
})

export async function payInvoice(invoice: string) {
  try {
    const amount = getSatoshisAmountFromBolt11(invoice)
    await nwc().payInvoice({ invoice })
    toast.success(`Sent ${amount} sats!`)
  } catch (error) {
    console.error("Error sending zap:", error)
    toast.error("Failed to send zap")
  }
}
