import { nwc as NWC } from "@getalby/sdk"
import { createResource } from "solid-js"

import settings from "./settings"

const [nwc] = createResource(settings, settings => {
  if (!settings || !settings.nwcConnectionString) return

  return new NWC.NWCClient({
    nostrWalletConnectUrl: settings.nwcConnectionString
  })
})

export default nwc
