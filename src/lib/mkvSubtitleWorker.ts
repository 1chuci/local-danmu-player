import { extractLocalMkvTracks } from './localMkvReader'

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<File>) => void) | null
  postMessage: (message: unknown, transfer?: Transferable[]) => void
}
scope.onmessage = async ({ data: file }) => {
  try {
    const result = await extractLocalMkvTracks(file)
    // The renderer needs text only; do not retain or transfer embedded fonts.
    const tracks = result.map(track => ({ type: track.type, subtitle: track.output.subtitle }))
    scope.postMessage({ tracks }, tracks.map(track => track.subtitle.buffer as ArrayBuffer))
  } catch (error) {
    scope.postMessage({ error: {
      name: error instanceof Error ? error.name : 'Error',
      message: error instanceof Error ? error.message : String(error),
    } })
  }
}
