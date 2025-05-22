import { createSignal } from "solid-js"

export type Settings = {
  nwcConnectionString: string
  defaultZapAmount: number
}

const [settings, set] = createSignal<Settings>({
  nwcConnectionString: "",
  defaultZapAmount: 0
})

export default settings

export function saveSettings(newSettings: Settings) {
  localStorage.setItem("yakbak-nwc-settings", JSON.stringify(newSettings))
  set(newSettings)
}

;(function initialLoad() {
  set(JSON.parse(localStorage.getItem("yakbak-nwc-settings") || "{}"))
})()
