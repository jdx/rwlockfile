import {RWLockfile, Lockfile} from './rwlockfile'
import * as fs from 'fs-extra'
import * as path from 'path'
import * as tmp from 'tmp'

const dir = path.join(__dirname, '../tmp/test')

let f: string

const debug = require('debug')

jest.useFakeTimers()
const flush = () => new Promise(resolve => setImmediate(resolve))

beforeEach(() => {
  debug('lock:test')('beforeEach')
  f = tmp.tmpNameSync({dir})
})

afterAll(async () => {
  await fs.remove(path.join(__dirname, '../tmp'))
})

async function tick (until: Promise<any>) {
  while (true) {
    const r = await Promise.race([flush(), until.then(() => true)])
    if (r) return until
    jest.runOnlyPendingTimers()
  }
}

describe('lockfile', () => {
  let a: Lockfile
  let b: Lockfile
  beforeEach(() => {
    a = new Lockfile(f, {debug: debug('lock:a')})
    b = new Lockfile(f, {debug: debug('lock:b')})
  })

  describe('add', () => {
    test('.lock() adds 1', async () => {
      expect(a.count).toEqual(0)
      await a.lock()
      expect(a.count).toEqual(1)
      await a.lock()
      expect(a.count).toEqual(1)
    })

    test('.lockSync() adds 1', () => {
      expect(a.count).toEqual(0)
      a.lockSync()
      expect(a.count).toEqual(1)
      a.lockSync()
      expect(a.count).toEqual(1)
    })

    test('.add() adds 1', async () => {
      expect(a.count).toEqual(0)
      await a.add()
      expect(a.count).toEqual(1)
      await a.add()
      expect(a.count).toEqual(2)
    })

    test('.addSync() adds 1', async () => {
      expect(a.count).toEqual(0)
      a.addSync()
      expect(a.count).toEqual(1)
      a.addSync()
      expect(a.count).toEqual(2)
    })
  })

  test('adding/removing works fine', async () => {
    a.addSync()
    await a.add()
    expect(a.count).toEqual(2)
    await a.remove()
    a.removeSync()
    a.remove()
    expect(a.count).toEqual(0)
    a.removeSync()
    await b.add()
    b.addSync()
    await b.remove()
    b.removeSync()
    await b.remove()
    b.unlockSync()
    await b.unlock()
  })

  test('errors on .lock() when locked', async () => {
    await a.add({reason: 'a reason'})
    await expect(tick(b.add())).rejects.toThrow(/^a reason:/)
  })

  test('errors on .lockSync() when locked sync', async () => {
    a.addSync({reason: 'a reason'})
    await flush()
    jest.runOnlyPendingTimers()
    await flush()
    await flush()
    expect(() => b.addSync()).toThrow(/^a reason:/)
  })

  test('times out eventually', async () => {
    let run = async () => {
      await a.add({reason: 'a reason'})
      expect(await a.check()).toEqual(true)
      expect(a.checkSync()).toEqual(true)
      expect(await b.check()).toEqual(false)
      expect(b.checkSync()).toEqual(false)
      let add = b.add()
      while (true) {
        await Promise.race([flush(), add])
        jest.runOnlyPendingTimers()
      }
    }

    return expect(run()).rejects.toThrow(/^a reason/)
  })

  test('does not unlock when does not own', async () => {
    expect(await b.check()).toEqual(true)
    await a.lock()
    await b.unlock()
    expect(await b.check()).toEqual(false)
  })

  test('does not unlock when does not own sync', async () => {
    expect(b.checkSync()).toEqual(true)
    a.lockSync()
    b.unlockSync()
    expect(b.checkSync()).toEqual(false)
  })

  test('unlocks', async () => {
    await a.lock()
    expect(await b.check()).toEqual(false)
    await a.unlock()
    await b.lock()
  })

  test('stale', async () => {
    fs.mkdirpSync(a.dirPath)
    const now = Date.now()/1000
    fs.utimesSync(a.dirPath, now, now-11)
    await tick(a.lock())
  })

  test('stale sync', async () => {
    const now = Date.now()/1000
    fs.mkdirpSync(a.dirPath)
    fs.utimesSync(a.dirPath, now, now-11)
    a.lockSync()
  })

  test('needs to be stale enough sync', async () => {
    fs.mkdirpSync(a.dirPath)
    expect(a.checkSync()).toEqual(false)
    const now = Date.now()/1000
    fs.utimesSync(a.dirPath, now, now-9)
    expect(a.checkSync()).toEqual(false)
    fs.utimesSync(a.dirPath, now, now-11)
    expect(a.checkSync()).toEqual(true)
  })

  test('needs to be stale enough', async () => {
    await fs.mkdirp(a.dirPath)
    expect(await a.check()).toEqual(false)
    const now = Date.now()/1000
    await fs.utimes(a.dirPath, now, now-9)
    expect(await a.check()).toEqual(false)
    await fs.utimes(a.dirPath, now, now-11)
    expect(await a.check()).toEqual(true)
  })

  test('updates lockfile time while locked', async () => {
    const now = Date.now()/1000
    await a.lock()
    await fs.utimes(a.dirPath, now, now-20)
    jest.runOnlyPendingTimers()
    expect(await b.check()).toEqual(false)
  })
})

describe('rwlockfile', () => {
  let a: RWLockfile
  let b: RWLockfile
  beforeEach(() => {
    a = new RWLockfile(f, {debug: debug('lock:a')})
    b = new RWLockfile(f, {debug: debug('lock:b')})
  })

  test('can get a write lock', async () => {
    await a.addWriter()
  })

  test('can get a write lock sync', () => {
    a.addWriterSync()
  })

  test('can get multiple read locks', () => {
    a.addReaderSync()
    b.addReaderSync()
  })

  test('cannot get a write lock when reader lock sync', () => {
    a.addReaderSync()
    expect(() => b.addWriterSync()).toThrowError(/lock exists/)
    b.addReaderSync()
    a.removeReaderSync()
    a.addReaderSync()
    b.addReaderSync()
    expect(() => a.addWriterSync()).toThrowError(/lock exists/)
  })

  test('cannot get a write lock when reader lock', async () => {
    await expect(b.checkWrite()).resolves.toEqual(true)
    await a.addReader()
    await expect(b.checkWrite()).resolves.toEqual(false)
    await b.addReader()
    await a.removeReader()
    await a.addReader()
    await b.addReader()
    // await expect(() => a.addWriterSync()).toThrowError(/lock exists/)
  })
})
