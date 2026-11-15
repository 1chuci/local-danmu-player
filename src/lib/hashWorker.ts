import SparkMD5 from 'spark-md5'

interface HashWorkerScope {
  onmessage: ((event: MessageEvent<ArrayBuffer>) => void) | null
  postMessage(message: string): void
}

const scope = self as unknown as HashWorkerScope

scope.onmessage = (event) => {
  scope.postMessage(SparkMD5.ArrayBuffer.hash(event.data))
}
