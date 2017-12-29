// import {spawn} from 'child_process'
import * as FS from 'fs-extra'
import {IDebug} from 'debug'
import * as path from 'path'

const version = require('../package.json').version

// let locks: {[k: string]: number} = {}
// let readers: {[k: string]: number} = {}

// async function pidActive (pid: number): Promise<boolean> {
//   if (!pid || isNaN(pid)) return false
//   return process.platform === 'win32' ? pidActiveWindows(pid) : pidActiveUnix(pid)
// }

// function pidActiveWindows (pid: number): Promise<boolean> {
//   return new Promise((resolve, reject) => {
//     const p = spawn('tasklist', ['/fi', `PID eq ${pid}`])
//     p.on('close', code => {
//       if (code !== 0) reject(new Error(`tasklist exited with code ${code}`))
//     })
//     p.stdout.on('data', (stdout: string) => {
//       resolve(!stdout.includes('No tasks are running'))
//     })
//   })
// }

// function pidActiveUnix (pid: number): boolean {
//   try {
//     return !!process.kill(pid, 0)
//   } catch (e) {
//     return e.code === 'EPERM'
//   }
// }

// async function lockActive (path: string): Promise<boolean> {
//   try {
//     let file = await readFile(path)
//     let pid = parseInt(file.trim())
//     let active = pidActive(pid)
//     if (!active) debug(`stale pid ${path} ${pid}`)
//     return active
//   } catch (err) {
//     if (err.code !== 'ENOENT') throw err
//     return false
//   }
// }

// function unlock (path: string) {
//   return new Promise(resolve => fs.remove(path, resolve))
//   .then(() => { delete locks[path] })
// }

// function unlockSync (path: string) {
//   try {
//     fs.removeSync(path)
//   } catch (err) { debug(err) }
//   delete locks[path]
// }

// function lock (p: string, timeout: number) {
//   let pidPath = path.join(p, 'pid')
//   if (!fs.existsSync(path.dirname(p))) fs.mkdirpSync(path.dirname(p))
//   return new Promise((resolve, reject) => {
//     fs.mkdir(p, (err) => {
//       if (!err) {
//         locks[p] = 1
//         fs.writeFile(pidPath, process.pid.toString(), resolve)
//         return
//       }
//       if (err.code !== 'EEXIST') return reject(err)
//       lockActive(pidPath).then(active => {
//         if (!active) return unlock(p).then(resolve).catch(reject)
//         if (timeout <= 0) throw new Error(`${p} is locked`)
//         debug(`locking ${p} ${timeout / 1000}s...`)
//         wait(1000).then(() => lock(p, timeout - 1000).then(resolve).catch(reject))
//       }).catch(reject)
//     })
//   })
// }

// function readFile (path: string): Promise<string> {
//   return new Promise((resolve, reject) => {
//     fs.readFile(path, 'utf8', (err, body) => {
//       if (err) return reject(err)
//       resolve(body)
//     })
//   })
// }

// function writeFile (path: string, content: string) {
//   return new Promise((resolve, reject) => {
//     fs.writeFile(path, content, (err, body) => {
//       if (err) return reject(err)
//       resolve(body)
//     })
//   })
// }

// async function getReadersFile (path): Promise<number[]> {
//   try {
//     let f = await readFile(path + '.readers')
//     return f.split('\n').map(r => parseInt(r))
//   } catch (err) {
//     return []
//   }
// }

// const unlink = p => new Promise((resolve, reject) => fs.unlink(p, err => err ? reject(err) : resolve()))

// function saveReaders (path, readers) {
//   path += '.readers'
//   if (readers.length === 0) {
//     return unlink(path).catch(() => {})
//   } else {
//     return writeFile(path, readers.join('\n'))
//   }
// }

// function saveReadersSync (path, readers) {
//   path += '.readers'
//   try {
//     if (readers.length === 0) {
//       fs.unlinkSync(path)
//     } else {
//       fs.writeFileSync(path, readers.join('\n'))
//     }
//   } catch (err) {}
// }

// async function getActiveReaders (path: string, timeout: number, skipOwnPid: boolean = false): Promise<number[]> {
//   await lock(path + '.readers.lock', timeout)
//   let readers: number[] = await getReadersFile(path)
//   let promises = readers.map(r => pidActive(r).then(active => active ? r : null))
//   let activeReaders = (await Promise.all(promises): any)
//   activeReaders = activeReaders.filter(r => r !== null)
//   if (activeReaders.length !== readers.length) {
//     await saveReaders(path, activeReaders)
//   }
//   await unlock(path + '.readers.lock')
//   return skipOwnPid ? activeReaders.filter(r => r !== process.pid) : activeReaders
// }

// async function waitForReaders (path: string, timeout: number, skipOwnPid: boolean) {
//   let readers = await getActiveReaders(path, timeout, skipOwnPid)
//   if (readers.length !== 0) {
//     if (timeout <= 0) throw new Error(`${path} is locked with ${readers.length === 1 ? 'a reader' : 'readers'} active: ${readers.join(' ')}`)
//     debug(`waiting for readers: ${readers.join(' ')} timeout=${timeout}`)
//     await wait(1000)
//     await waitForReaders(path, timeout - 1000, skipOwnPid)
//   }
// }

// function waitForWriter (path, timeout) {
//   return hasWriter(path)
//   .then(active => {
//     if (active) {
//       if (timeout <= 0) throw new Error(`${path} is locked with an active writer`)
//       debug(`waiting for writer: path=${path} timeout=${timeout}`)
//       return wait(1000)
//       .then(() => waitForWriter(path, timeout - 1000))
//     }
//     return unlock(path)
//   })
// }

// async function unread (path: string, timeout: number = 60000) {
//   await lock(path + '.readers.lock', timeout)
//   let readers = await getReadersFile(path)
//   if (readers.find(r => r === process.pid)) {
//     await saveReaders(path, readers.filter(r => r !== process.pid))
//   }
//   await unlock(path + '.readers.lock')
// }
// exports.unread = unread

/**
 * lock for writing
 * @param path {string} - path of lockfile to use
 * @param options {object}
 * @param [options.timeout=60000] {number} - Max time to wait for lockfile to be open
 * @param [options.skipOwnPid] {boolean} - Do not wait on own pid (to upgrade current process)
 * @returns {Promise}
 */
// exports.write = async function (path: string, options: Partial<WriteLockOptions> = {}) {
//   let skipOwnPid = !!options.skipOwnPid
//   let timeout = options.timeout || 60000
//   debug(`write ${path}`)
//   await waitForReaders(path, timeout, skipOwnPid)
//   await lock(path + '.writer', timeout)
//   return () => unlock(path + '.writer')
// }

// type ReadLockOptions = { // eslint-disable-line
//   timeout: number
// }

// /**
//  * lock for reading
//  * @param path {string} - path of lockfile to use
//  * @param options {object}
//  * @param [options.timeout=60000] {number} - Max time to wait for lockfile to be open
//  * @returns {Promise}
//  */
// exports.read = async function (path: string, options: Partial<ReadLockOptions> = {}) {
//   let timeout = options.timeout || 60000
//   debug(`read ${path}`)
//   await waitForWriter(path, timeout)
//   await lock(path + '.readers.lock', timeout)
//   let readersFile = await getReadersFile(path)
//   await saveReaders(path, readersFile.concat([process.pid]))
//   await unlock(path + '.readers.lock')
//   readers[path] = 1
//   return () => unread(path, timeout)
// }


// async function hasReaders (p: string, options: Partial<WriteLockOptions> = {}): Promise<boolean> {
//   let timeout = options.timeout || 60000
//   let skipOwnPid = !!options.skipOwnPid
//   let readers = await getActiveReaders(p, timeout, skipOwnPid)
//   return readers.length !== 0
// }
// exports.hasReaders = hasReaders

export class LockfileError extends Error {
  code = 'ELOCK'
  msg: string
  file: string
  reason: string

  constructor ({msg, file, reason}: {msg?: string, file: string, reason?: string}) {
    super(msg || (reason ? `${reason}: ${file}` : `lock exists!: ${file}`))
  }
}

export interface LockfileOptions {
  debug?: IDebug
}

interface LockInfoJSON {
  version: string
  uuid: string
  pid: number
  reason?: string
}

export interface LockOptions {
  reason?: string
  ifLocked: ({reason}: {reason?: string}) => (Promise<void> | void)
  timeout: number
  minRetryInterval: number
}

export class Lockfile {
  public base: string
  public timeout = 30000
  public stale = 10000
  public uuid: string
  public retries = 10
  private fs: typeof FS
  private _debug?: (msg: string, ...args: any[]) => {}
  private _count = 0
  private locked = false
  private updater: any
  private promises: {
    lock?: Promise<void>
    unlock?: Promise<void>
    check?: Promise<boolean>
  } = {}

  /**
   * creates a new simple lockfile without read/write support
   */
  constructor (base: string, options: LockfileOptions = {}) {
    this.base = base
    this._debug = options.debug as any || (debugEnvVar && require('debug')('rwlockfile'))
    this.fs = require('fs-extra')
    this.uuid = require('uuid/v4')()
  }

  get count() { return this._count }
  get dirPath() { return path.resolve(this.base + '.lock') }

  async lock(opts: Partial<LockOptions> = {}): Promise<void> {
    if (this.locked) return
    if (this._count < 1) this._count = 1
    return this.promises.lock = this.promises.lock || (async () => {
      this.debug('lock', this.dirPath)
      await this._lock({
        timeout: this.timeout,
        minRetryInterval: 50,
        ifLocked: ({reason: _}) => {},
        ...opts,
      })
      this.startLocking(opts.reason)
    })()
  }

  lockSync(opts: {reason?: string} = {}): void {
    if (this.locked) return
    if (this._count < 1) this._count = 1
    try {
      this.debug('lockSync', this.dirPath)
      this.fs.mkdirpSync(path.dirname(this.dirPath))
      this.fs.mkdirSync(this.dirPath)
      this.startLocking(opts.reason, true)
    } catch (err) {
      if (err.code !== 'EEXIST') throw err
      let reason = this.fetchReasonSync()
      if (this.checkSync()) return this.lockSync(opts)
      if (this.retries < 1) throw new LockfileError({reason, file: this.dirPath})
      this.retries--
      this.lockSync(opts)
    }
  }

  async unlock (): Promise<void> {
    if (!this.locked) return this.debug('unlock called, but lockfile not locked', this.dirPath)
    return this.promises.unlock = this.promises.unlock || (async () => {
      this.debug('unlock', this.dirPath)
      await this.fs.rmdir(this.dirPath)
      this.stopLocking()
    })()
  }

  unlockSync () {
    if (!this.locked) return this.debug('unlockSync called, but lockfile not locked', this.dirPath)
    this.debug('unlockSync', this.dirPath)
    this.fs.rmdirSync(this.dirPath)
    this.stopLocking()
  }

  async add (opts: Partial<LockOptions> = {}): Promise<void> {
    this._count++
    await this.lock(opts)
  }

  addSync (opts: {reason?: string} = {}) {
    this._count++
    this.lockSync(opts)
  }

  /**
   * removes 1 lock count
   */
  async remove (): Promise<void> {
    if (this._count > 0) this._count--
    if (this._count < 1) await this.unlock()
  }

  /**
   * removes 1 lock count
   */
  removeSync () {
    if (this._count > 0) this._count--
    if (this._count < 1) this.unlockSync()
  }

  /**
   * check if this instance can get a lock
   * returns true if it already has a lock
   */
  async check (): Promise<boolean> {
    if (this.locked) return true
    return this.promises.check = this.promises.check || (async () => {
      const mtime = await this.fetchMtime()
      const stale = this.isStale(mtime)
      if (mtime && stale) {
        try {
          this.debug('stale lockfile, deleting', this.dirPath)
          await this.fs.rmdir(this.dirPath)
          return true
        } catch (err) {
          if (this.retries > 1 && err.code === 'ENOENT') {
            this.retries--
            return this.check()
          }
          throw err
        }
      }
      delete this.promises.check
      return !mtime || stale
    })()
  }

  /**
   * check if this instance can get a lock
   * returns true if it already has a lock
   */
  checkSync (): boolean {
    if (this.locked) return true
    const mtime = this.fetchMtimeSync()
    if (!mtime) return true
    if (mtime && !this.isStale(mtime)) return false
    try {
      this.debug('stale lockfile, deleting', this.dirPath)
      this.fs.rmdirSync(this.dirPath)
      return true
    } catch (err) {
      if (err.code === 'ENOENT') return true
      throw err
    }
  }

  private get infoPath() { return path.resolve(this.dirPath + '.info.json') }

  private async fetchReason (): Promise<string | undefined> {
    try {
      const b: LockInfoJSON = await this.fs.readJSON(this.infoPath)
      return b.reason
    } catch (err) {
      if (err.code !== 'ENOENT') this.debug(err)
    }
  }

  private fetchReasonSync (): string | undefined {
    try {
      const b: LockInfoJSON = this.fs.readJSONSync(this.infoPath)
      return b.reason
    } catch (err) {
      if (err.code !== 'ENOENT') this.debug(err)
    }
  }

  private saveReason (reason: string | undefined, sync = false) {
    if (!reason) return
    let b = {
      version,
      uuid: this.uuid,
      pid: process.pid,
      reason,
    }
    if (sync) this.fs.writeJSONSync(this.infoPath, b)
    else return this.fs.writeJSON(this.infoPath, b)
  }

  private async fetchMtime(): Promise<Date | undefined> {
    try {
      const {mtime} = await this.fs.stat(this.dirPath)
      return mtime
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
  }

  private fetchMtimeSync (): Date | undefined {
    try {
      const {mtime} = this.fs.statSync(this.dirPath)
      return mtime
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
  }

  private isStale (mtime?: Date): boolean {
    if (!mtime) return true
    return mtime < new Date(Date.now() - this.stale)
  }

  private debug (msg: string, ...args: any[]) {
    if (this._debug) this._debug(msg, ...args)
  }

  private async _lock(opts: LockOptions): Promise<void> {
    try {
      await this.fs.mkdirp(path.dirname(this.dirPath))
      await this.fs.mkdir(this.dirPath)
    } catch (err) {
      if (err.code !== 'EEXIST') throw err
      const reason = await this.fetchReason()
      this.debug('waiting for lock', reason, this.dirPath)
      await opts.ifLocked({reason})
      if (opts.timeout < 0) throw new LockfileError({reason, file: this.dirPath})
      if (await this.check()) return this._lock(opts)
      const interval = random(100, 2000)
      await wait(interval)
      return this._lock({...opts,
        timeout: opts.timeout - interval,
        minRetryInterval: opts.minRetryInterval * 2
      })
    }
  }

  private startLocking (reason: string | undefined, sync = false) {
    this.locked = true
    this.saveReason(reason, sync)
    this.updater = setInterval(() => {
      let now = Date.now()/1000
      this.fs.utimes(this.dirPath, now, now)
    }, 1000)
  }

  private stopLocking () {
    this.locked = false
    this.fs.remove(this.infoPath)
    delete this.promises.unlock
    this._count = 0
    clearInterval(this.updater)
    delete this.updater
  }
}

export interface RWLockfileOptions {
  debug?: IDebug
  file?: string
}

interface Job {
  uuid: string
  pid: number
  reason?: string
  created: Date
}

interface RWLockfileJSON {
  version: string
  writer?: Job
  readers: Job[]
}

export class RWLockfile {
  public base: string
  private debug: any
  private uuid: string
  private fs: typeof FS
  private internal: Lockfile
  private myReaders = 0

  /**
   * creates a new read/write lockfile
   * @param base {string} - base filepath to create lock from
   */
  constructor (base: string, options: RWLockfileOptions = {}) {
    this.base = base
    this.debug = options.debug || require('debug')('rwlockfile')
    this.uuid = require('uuid/v4')()
    this.fs = require('fs-extra')
    instances.push(this)
    this.internal = new Lockfile(this.file, options)
  }

  get file() { return path.resolve(this.base + '.lock') }

  async addWriter (opts: {reason?: string} = {}) {
    await this.internal.add({reason: 'addWriter'})
    try {
      if (!await this.checkWrite()) throw new LockfileError({file: this.file, reason: opts.reason})
      let f = await this.fetchFile()
      this.addWriterToFile(opts.reason, f)
      await this.writeFile(f)
      await this.internal.remove()
    } finally {
      await this.internal.remove()
    }
  }

  addWriterSync (opts: {reason?: string} = {}) {
    this.internal.addSync({reason: 'addWriterSync'})
    try {
      if (!this.checkWriteSync()) throw new LockfileError({file: this.file, reason: opts.reason})
      let f = this.fetchFileSync()
      this.addWriterToFile(opts.reason, f)
      this.writeFileSync(f)
    } finally {
      this.internal.removeSync()
    }
  }

  async addReader (opts: {reason?: string} = {}) {
    this.internal.add({reason: 'addReader'})
    try {
      this.myReaders++
      const f = await this.fetchFile()
      this.addReaderToFile(opts.reason, f)
      await this.writeFile(f)
    } finally {
      await this.internal.remove()
    }
  }

  addReaderSync (opts: {reason?: string} = {}) {
    this.internal.addSync({reason: 'addReaderSync'})
    try {
      this.myReaders++
      const f = this.fetchFileSync()
      this.addReaderToFile(opts.reason, f)
      this.writeFileSync(f)
    } finally {
      this.internal.removeSync()
    }
  }

  removeReader () {
    this.myReaders--
    if (this.myReaders <= 0) this.removeAllReaders()
  }

  removeReaderSync () {
    this.myReaders--
    if (this.myReaders <= 0) this.removeAllReadersSync()
  }

  removeAllReaders() {
    this.internal.addSync({reason: 'removeReadersSync'})
    try {
      this.myReaders = 0
      const r = this.fetchFileSync()
      this.writeFileSync({
        ...r,
        readers: r.readers.filter(r => r.uuid !== this.uuid)
      })
    } finally {
      this.internal.removeSync()
    }
  }

  removeAllReadersSync () {
    this.myReaders = 0
    this.internal.addSync({reason: 'removeAllReadersSync'})
    const r = this.fetchFileSync()
    this.writeFileSync({
      ...r,
      readers: r.readers.filter(r => r.uuid !== this.uuid)
    })
    this.internal.removeSync()
  }

  removeWriterSync () {
  }

  removeAllSync () {
    this.debug('removeAllSync', this.base)
    this.removeWriterSync()
    this.removeAllReadersSync()
  }

  async checkWrite() {
    const f = await this.fetchFile()
    if (f.writer) return false
    if (f.readers.length) return false
    return true
    // this.internal.addSync({reason: 'checkWriteSync'})
    // this.internal.removeSync()
  }

  checkWriteSync () {
    const f = this.fetchFileSync()
    if (f.writer) return false
    if (f.readers.length) return false
    return true
    // this.internal.addSync({reason: 'checkWriteSync'})
    // this.internal.removeSync()
  }

  private parseFile(input: any): RWLockfileJSON {
    function addDates (readers?: Job[]) {
      return (readers || []).map(r => ({
        ...r,
        created: new Date(r.created)
      }))
    }

    return {
      ...input,
      readers: addDates(input.readers)
    }
  }

  private stringifyFile(input: RWLockfileJSON): any {
    return {
      ...input,
      readers: (input.readers || []).map(r => ({...r, created: r.created.toISOString()}))
    }
  }

  private async fetchFile (): Promise<RWLockfileJSON> {
    try {
      let f = await this.fs.readJSON(this.file)
      return this.parseFile(f)
    } catch (err) {
      if (err.code !== 'ENOENT') this.debug(err)
      return {
        version,
        readers: [],
      }
    }
  }

  private fetchFileSync (): RWLockfileJSON {
    try {
      let f = this.fs.readJSONSync(this.file)
      return this.parseFile(f)
    } catch (err) {
      if (err.code !== 'ENOENT') this.debug(err)
      return {
        version,
        readers: [],
      }
    }
  }

  private writeFile (f: RWLockfileJSON) {
    return this.fs.outputJSONSync(this.file, this.stringifyFile(f))
  }

  private writeFileSync (f: RWLockfileJSON) {
    this.fs.outputJSONSync(this.file, this.stringifyFile(f))
  }

  private addReaderToFile (reason: string | undefined, f: RWLockfileJSON) {
    f.readers.push({
      reason,
      pid: process.pid,
      created: new Date(),
      uuid: this.uuid,
    })
  }

  private addWriterToFile (reason: string | undefined, f: RWLockfileJSON) {
    f.writer = {
      reason,
      pid: process.pid,
      created: new Date(),
      uuid: this.uuid,
    }
  }
}

const instances: RWLockfile[] = []
process.once('exit', () => {
  for (let i of instances) i.removeAllSync()
})

function wait (ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function random (min: number, max: number): number {
  return Math.floor(Math.random() * (max - min) + min)
}

function debugEnvVar (): boolean {
  return process.env.RWLOCKFILE_DEBUG === '1'
}

export default RWLockfile
