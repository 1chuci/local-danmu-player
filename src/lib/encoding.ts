export function decodeSubtitleText(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3))
  if (bytes.length > 8) {
    let evenNulls = 0
    let oddNulls = 0
    const sampleLength = Math.min(bytes.length, 512)
    for (let i = 0; i < sampleLength; i++) {
      if (bytes[i] === 0) {
        if (i % 2) oddNulls++
        else evenNulls++
      }
    }
    if (oddNulls > sampleLength / 8) return new TextDecoder('utf-16le').decode(bytes)
    if (evenNulls > sampleLength / 8) return new TextDecoder('utf-16be').decode(bytes)
  }
  return new TextDecoder('utf-8').decode(bytes)
}
