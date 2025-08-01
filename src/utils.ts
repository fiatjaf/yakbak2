export function formatZapAmount(amount: number): string {
  if (amount < 1000) {
    return amount.toString()
  }
  const kAmount = amount / 1000
  return `${kAmount.toFixed(1)}K`.replace(/\.0K$/, "K")
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

export async function generateWaveform(audioBlob: Blob, samples = 100): Promise<number[]> {
  const audioContext = new AudioContext()
  const arrayBuffer = await audioBlob.arrayBuffer()
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

  const channelData = audioBuffer.getChannelData(0) // Get first channel
  const blockSize = Math.floor(channelData.length / samples)
  const waveform: number[] = []

  for (let i = 0; i < samples; i++) {
    const start = blockSize * i
    let sum = 0

    for (let j = 0; j < blockSize; j++) {
      const amplitude = channelData[start + j]
      sum += amplitude * amplitude
    }

    const rms = Math.sqrt(sum / blockSize)
    const normalized = Math.min(1, rms * 3)
    waveform.push(normalized)
  }

  audioContext.close()
  return waveform
}
