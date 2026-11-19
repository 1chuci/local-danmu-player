export function createSerialQueue() {
  let tail: Promise<void> = Promise.resolve()
  return function run<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation, operation)
    tail = result.then(() => undefined, () => undefined)
    return result
  }
}
