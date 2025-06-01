export function formatZapAmount(amount: number): string {
  if (amount < 1000) {
    return amount.toString()
  }
  const kAmount = amount / 1000
  return `${kAmount.toFixed(1)}K`.replace(/\.0K$/, "K")
}

export function getSatoshisAmountFromBolt11(bolt11: string): number {
  if (bolt11.length < 50) {
    return 0
  }
  bolt11 = bolt11.substring(0, 50)
  const idx = bolt11.lastIndexOf("1")
  if (idx === -1) {
    return 0
  }
  const hrp = bolt11.substring(0, idx)
  if (!hrp.startsWith("lnbc")) {
    return 0
  }
  const amount = hrp.substring(4) // equivalent to strings.CutPrefix

  if (amount.length < 1) {
    return 0
  }

  // if last character is a digit, then the amount can just be interpreted as BTC
  const char = amount[amount.length - 1]
  const digit = char.charCodeAt(0) - "0".charCodeAt(0)
  const isDigit = digit >= 0 && digit <= 9

  let cutPoint = amount.length - 1
  if (isDigit) {
    cutPoint++
  }

  if (cutPoint < 1) {
    return 0
  }

  const num = parseInt(amount.substring(0, cutPoint))

  switch (char) {
    case "m":
      return num * 100000
    case "u":
      return num * 100
    case "n":
      return num / 10
    case "p":
      return num / 10000
    default:
      return num * 100000000
  }
}

export function parseHashtags(input: string): string[] {
  return input
    .split(/[\s,]+/)
    .map(tag => tag.replace(/^#/, "").trim())
    .filter(tag => tag.length > 0)
}

export function prettyRelayURL(url: string): string {
  let x = url.split("://")[1].split("?")[0]
  while (x.endsWith("/")) {
    x = x.substring(0, x.length - 1)
  }
  return x
}
