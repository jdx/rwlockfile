import * as path from 'path'
import Lockfile from './lockfile'
import { lockfile, onceAtATime } from './decorators'

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('onceAtATime', () => {
  class MyClass {
    calls: string[] = []

    @onceAtATime()
    async a() {
      this.calls.push('a')
      return this.calls
    }
  }

  let a: MyClass
  beforeEach(() => {
    a = new MyClass()
  })

  test('returns value', async () => {
    await expect(a.a()).resolves.toEqual(['a'])
  })

  test('only runs once here', async () => {
    a.a()
    await a.a()
    expect(a.calls).toEqual(['a'])
  })

  test('runs twice here', async () => {
    await a.a()
    await a.a()
    expect(a.calls).toEqual(['a', 'a'])
  })

  describe('with 2 methods', () => {
    class DoubleMethodClass extends MyClass {
      @onceAtATime()
      async b() {
        this.calls.push('b')
      }
    }

    let a: DoubleMethodClass
    beforeEach(() => {
      a = new DoubleMethodClass()
    })

    test('runs both just once', async () => {
      a.a()
      a.a()
      a.b()
      await a.b()
      expect(a.calls).toEqual(['a', 'b'])
    })
  })

  describe('with 2 instances', () => {
    let b: MyClass
    beforeEach(() => {
      b = new MyClass()
    })

    test('runs both just once', async () => {
      a.a()
      a.a()
      b.a()
      await b.a()
      expect(a.calls).toEqual(['a'])
      expect(b.calls).toEqual(['a'])
    })
  })

  describe('caches with argument', () => {
    class ArgumentClass extends MyClass {
      @onceAtATime(0)
      async b(c: string) {
        this.calls.push(c)
        return this.calls
      }
    }

    let a: ArgumentClass
    beforeEach(() => {
      a = new ArgumentClass()
    })

    test('caches separately', async () => {
      a.b('1')
      a.b('2')
      await a.b('2')
      expect(a.calls).toEqual(['1', '2'])
    })
  })
})

describe('lockfile', () => {
  let count = 0
  let lockfilePath
  class MyLockClass {
    mylock: Lockfile
    info: string[] = []

    constructor (lockfilePath: string) {
      this.mylock = new Lockfile(lockfilePath, {
        debug: require('debug')('lockfile')
      })
    }

    @lockfile('mylock')
    async run(n: number) {
      this.info.push('start')
      await wait(1)
      this.info.push('done')
      return `n: ${n}`
    }
  }

  let a: MyLockClass
  let b: MyLockClass

  beforeEach(() => {
    count++
    lockfilePath = path.join(__dirname, `../tmp/test/decorators/${count}`)
    a = new MyLockClass(lockfilePath)
    b = new MyLockClass(lockfilePath)
  })

  test('it locks', async () => {
    let apromise = a.run(1)
    let bpromise = b.run(2)
    expect(await apromise).toEqual('n: 1')
    expect(a.info).toEqual(['start', 'done'])
    expect(b.info).toEqual([])
    expect(await bpromise).toEqual('n: 2')
    expect(a.info).toEqual(['start', 'done'])
    expect(b.info).toEqual(['start', 'done'])
  })
})
