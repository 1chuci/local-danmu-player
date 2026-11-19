import { describe, expect, it } from 'vitest'
import { createSerialQueue } from './serialQueue'

describe('createSerialQueue', () => {
  it('runs only one async operation at a time and preserves enqueue order', async () => {
    const run = createSerialQueue()
    const order: number[] = []
    let active = 0
    let maxActive = 0
    const operation = (value: number) => run(async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      order.push(value)
      active -= 1
      return value
    })
    await expect(Promise.all([operation(1), operation(2), operation(3)])).resolves.toEqual([1, 2, 3])
    expect(order).toEqual([1, 2, 3])
    expect(maxActive).toBe(1)
  })

  it('continues after a rejected operation', async () => {
    const run = createSerialQueue()
    await expect(run(async () => { throw new Error('failure') })).rejects.toThrow('failure')
    await expect(run(async () => 'ready')).resolves.toBe('ready')
  })
})
