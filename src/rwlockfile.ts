// import {spawn} from 'child_process'
import * as FS from 'fs-extra'
import { IDebug } from 'debug'
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
  ifLocked: ({ reason }: { reason?: string }) => Promise<void> | void
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
  private updater: NodeJS.Timer

  /**
   * creates a new simple lockfile without read/write support
   */
  constructor(base: string, options: LockfileOptions = {}) {
    this.base = base
    this._debug = (options.debug as any) || (debugEnvVar && require('debug')('rwlockfile'))
    this.fs = require('fs-extra')
    this.uuid = require('uuid/v4')()
  }

  get count(): number {
    return this._count
  }
  get dirPath() {
    return path.resolve(this.base + '.lock')
  }

  /**
   * creates a lock
   * same as add
   */
  lock(): Promise<void> {
    return this.add()
  }

  /**
   * creates a lock
   * same as add
   */
  lockSync(): void {
    this.addSync()
  }

  /**
   * removes all lock counts
   */
  @onceAtATime()
  async unlock(): Promise<void> {
    if (!this.count) return
    this.debug('unlock', this.dirPath)
    await this._unlock(false)
    await this.fs.removeSync(this.dirPath)
    this.stopLocking()
  }

  /**
   * removes all lock counts
   */
  unlockSync(): void {
    if (!this.count) return
    this.debug('unlockSync', this.dirPath)
    this._unlock(true)
  }

  /**
   * adds 1 lock count
   */
  async add(opts: Partial<LockOptions> = {}): Promise<void> {
    if (this.count) return
    const add = async () => {
      this.debug('lock', this.dirPath)
      await this._lock({
        timeout: this.timeout,
        minRetryInterval: 50,
        ifLocked: ({ reason: _ }) => {},
        ...opts,
      })
    }
    await (this.promises.lock = this.promises.lock || add())
    this._count++
  }

  /**
   * adds 1 lock count
   */
  addSync(opts: { reason?: string } = {}): void {
    if (this.count) return
    this._lockSync(opts)
    this._count++
  }

  /**
   * removes 1 lock count
   */
  async remove(): Promise<void> {
    switch (this.count) {
      case 0:
        break
      case 1:
        await this.unlock()
        break
      default:
        this._count--
        break
    }
  }

  /**
   * removes 1 lock count
   */
  removeSync(): void {
    switch (this.count) {
      case 0:
        break
      case 1:
        this.unlockSync()
        break
      default:
        this._count--
        break
    }
  }

  /**
   * check if this instance can get a lock
   * returns true if it already has a lock
   */
  async check(): Promise<boolean> {
    if (this.count) return true
    return (this.promises.check =
      this.promises.check ||
      (async () => {
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
      })())
  }

  /**
   * check if this instance can get a lock
   * returns true if it already has a lock
   */
  checkSync(): boolean {
    if (this.count) return true
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

  private get _infoPath() {
    return path.join(this.dirPath, 'info.json')
  }

  private async fetchReason(): Promise<string | undefined> {
    try {
      const b: LockInfoJSON = await this.fs.readJSON(this._infoPath)
      return b.reason
    } catch (err) {
      if (err.code !== 'ENOENT') this.debug(err)
    }
  }

  private fetchReasonSync(): string | undefined {
    try {
      const b: LockInfoJSON = this.fs.readJSONSync(this._infoPath)
      return b.reason
    } catch (err) {
      if (err.code !== 'ENOENT') this.debug(err)
    }
  }

  private saveReason(reason: string | undefined, sync: true): Promise<void>
  private saveReason(reason: string | undefined, sync?: boolean): void
  private saveReason(reason: string | undefined, sync = false): Promise<void> | void {
    const writeJSON = sync ? this.fs.writeJSONSync : this.fs.writeJSON
    writeJSON(
      this._infoPath,
      {
        version,
        uuid: this.uuid,
        pid: process.pid,
        reason,
      },
      { spaces: 2 },
    )
  }

  private async fetchMtime(): Promise<Date | undefined> {
    try {
      const { mtime } = await this.fs.stat(this.dirPath)
      return mtime
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
  }

  private fetchMtimeSync(): Date | undefined {
    try {
      const { mtime } = this.fs.statSync(this.dirPath)
      return mtime
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
  }

  private isStale(mtime?: Date): boolean {
    if (!mtime) return true
    return mtime < new Date(Date.now() - this.stale)
  }

  private debug(msg: string, ...args: any[]) {
    if (this._debug) this._debug(msg, ...args)
  }

  private async _lock(opts: LockOptions): Promise<void> {
    try {
      await this.fs.mkdirp(path.dirname(this.dirPath))
      await this.fs.mkdir(this.dirPath)
      this.startLocking(opts.reason)
    } catch (err) {
      if (err.code !== 'EEXIST') throw err
      const reason = await this.fetchReason()
      this.debug('waiting for lock', reason, this.dirPath)
      await opts.ifLocked({ reason })
      if (opts.timeout < 0) throw new LockfileError({ reason, file: this.dirPath })
      if (await this.check()) return this._lock(opts)
      const interval = random(100, 2000)
      await wait(interval)
      return this._lock({
        ...opts,
        timeout: opts.timeout - interval,
        minRetryInterval: opts.minRetryInterval * 2,
      })
    }
  }

  private _lockSync(opts: { reason?: string } = {}): void {
    if (this.count) return
    try {
      this.debug('lockSync', this.dirPath)
      this.fs.mkdirpSync(path.dirname(this.dirPath))
      this.fs.mkdirSync(this.dirPath)
      this.startLocking(opts.reason, true)
    } catch (err) {
      if (err.code !== 'EEXIST') throw err
      let reason = this.fetchReasonSync()
      if (this.checkSync()) return this._lockSync(opts)
      if (this.retries < 1) throw new LockfileError({ reason, file: this.dirPath })
      this.retries--
      this._lockSync(opts)
    }
  }

  private startLocking(reason: string | undefined, sync = false) {
    this.saveReason(reason, sync)
    this.updater = setInterval(() => {
      let now = Date.now() / 1000
      this.fs.utimes(this.dirPath, now, now)
    }, 1000)
  }

  private _unlock(sync: true): void
  private _unlock(sync?: false): Promise<void>
  private _unlock(sync = false): Promise<void> | void {
    this.fs.removeSync(this.dirPath)
  }

  private stopLocking() {
    this.fs.remove(this.infoPath)
    delete this.promises.unlock
    clearInterval(this.updater)
    delete this.updater
    this._count = 0
  }

  private _debugReport(
    action: 'add' | 'addSync' | 'remove' | 'removeSync' | 'unlock' | 'unlockSync',
    type: RWLockType,
  ) {
    const operator = (action.startsWith('unlock') && `-${this.count}`) || (action.startsWith('remove') && '-1') || '+1'
    this.debug(`${action}:${type} ${this.count}${operator}`)
  }
}

export interface RWLockfileOptions {
  debug?: IDebug
  file?: string
}

export type RWLockType = 'read' | 'write'

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
  private _count: { read: number; write: number } = { read: 0, write: 0 }

  /**
   * creates a new read/write lockfile
   * @param base {string} - base filepath to create lock from
   */
  constructor(base: string, options: RWLockfileOptions = {}) {
    this.base = base
    this.debug = options.debug || require('debug')('rwlockfile')
    this.uuid = require('uuid/v4')()
    this.fs = require('fs-extra')
    instances.push(this)
    this.internal = new Lockfile(this.file, options)
  }

  get count(): { readonly read: number; readonly write: number } {
    return { read: this._count.read, write: this._count.write }
  }
  get file() {
    return path.resolve(this.base + '.lock')
  }

  async add(type: RWLockType, { reason }: { reason?: string } = {}) {
    this._debugReport('add', type)
    if (!this.count[type]) await this._add(type, reason)
    this._count[type]++
  }

  addSync(type: RWLockType, { reason }: { reason?: string } = {}): void {
    this._debugReport('addSync', type)
    if (!this.count[type]) this._addSync(type, reason)
    this._count[type]++
  }

  async remove(type: RWLockType): Promise<void> {
    this._debugReport('remove', type)
    switch (this.count[type]) {
      case 0:
        break
      case 1:
        await this.removeAll(type)
        break
      default:
        this._count[type]--
        break
    }
  }

  removeSync(type: RWLockType): void {
    this._debugReport('removeSync', type)
    switch (this.count[type]) {
      case 0:
        break
      case 1:
        this.removeAllSync(type)
        break
      default:
        this._count[type]--
        break
    }
  }

  async removeAll(type?: RWLockType): Promise<void> {
    if (!type) {
      await Promise.all([this.removeAll('read'), this.removeAll('write')])
      return
    }
    if (!this.count[type]) return
    this._debugReport('removeAll', type)
    await this._removeJob(type)
    this._count[type] = 0
  }

  removeAllSync(type?: RWLockType): void {
    if (!type) {
      this.removeAllSync('read')
      this.removeAllSync('write')
      return
    }
    if (!this.count[type]) return
    this._debugReport('removeAllSync', type)
    this._removeJobSync(type)
    this._count[type] = 0
  }

  async check(type: RWLockType): Promise<boolean> {
    const f = await this._fetchFile()
    if (f.writer) return false
    if (type === 'write') {
      if (f.readers.length) return false
    }
    return true
    // this.internal.addSync({reason: 'checkWriteSync'})
    // this.internal.removeSync()
  }

  checkSync(type: RWLockType): boolean {
    const f = this._fetchFileSync()
    if (f.writer) return false
    if (type === 'write') {
      if (f.readers.length) return false
    }
    return true
    // this.internal.addSync({reason: 'checkWriteSync'})
    // this.internal.removeSync()
  }

  private _parseFile(input: any): RWLockfileJSON {
    function addDates(readers?: Job[]) {
      return (readers || []).map(r => ({
        ...r,
        created: new Date(r.created),
      }))
    }

    return {
      ...input,
      readers: addDates(input.readers),
    }
  }

  private _stringifyFile(input: RWLockfileJSON): any {
    return {
      ...input,
      readers: (input.readers || []).map(r => ({ ...r, created: r.created.toISOString() })),
    }
  }

  private async _fetchFile(): Promise<RWLockfileJSON> {
    try {
      let f = await this.fs.readJSON(this.file)
      return this._parseFile(f)
    } catch (err) {
      if (err.code !== 'ENOENT') this.debug(err)
      return {
        version,
        readers: [],
      }
    }
  }

  private _fetchFileSync(): RWLockfileJSON {
    try {
      let f = this.fs.readJSONSync(this.file)
      return this._parseFile(f)
    } catch (err) {
      if (err.code !== 'ENOENT') this.debug(err)
      return {
        version,
        readers: [],
      }
    }
  }

  private writeFile(f: RWLockfileJSON) {
    return this.fs.outputJSONSync(this.file, this._stringifyFile(f))
  }

  private writeFileSync(f: RWLockfileJSON) {
    this.fs.outputJSONSync(this.file, this._stringifyFile(f))
  }

  private addJob(type: RWLockType, reason: string | undefined, f: RWLockfileJSON) {
    let job: Job = {
      reason,
      pid: process.pid,
      created: new Date(),
      uuid: this.uuid,
    }
    if (type === 'read') f.readers.push(job)
    else f.writer = job
  }

  @onceAtATime(0)
  private async _removeJob(type: RWLockType) {
    try {
      await this.internal.add({ reason: `_removeJob:${type}` })
      let f = await this._fetchFile()
      this._removeJobFromFile(type, f)
      await this.writeFile(f)
    } finally {
      await this.internal.remove()
    }
  }

  private _removeJobSync(type: RWLockType) {
    try {
      this.internal.addSync({ reason: `_removeJobSync:${type}` })
      let f = this._fetchFileSync()
      this._removeJobFromFile(type, f)
      this.writeFileSync(f)
    } finally {
      this.internal.removeSync()
    }
  }

  private _removeJobFromFile(type: RWLockType, f: RWLockfileJSON) {
    if (type === 'read') f.readers = f.readers.filter(r => r.uuid !== this.uuid)
    else if (f.writer && f.writer.uuid === this.uuid) delete f.writer
  }

  @onceAtATime(1)
  async _add(type: RWLockType, reason?: string) {
    try {
      await this.internal.add({ reason: `add:${type}` })
      if (!await this.check(type)) throw new LockfileError({ file: this.file, reason })
      let f = await this._fetchFile()
      this.addJob(type, reason, f)
      await this.writeFile(f)
    } finally {
      await this.internal.remove()
    }
  }

  private _addSync(type: RWLockType, reason?: string) {
    try {
      this.internal.addSync({ reason: `addSync:${type}` })
      if (!this.checkSync(type)) throw new LockfileError({ file: this.file, reason })
      let f = this._fetchFileSync()
      this.addJob(type, reason, f)
      this.writeFileSync(f)
    } finally {
      this.internal.removeSync()
    }
  }

  private _debugReport(
    action: 'add' | 'addSync' | 'remove' | 'removeSync' | 'removeAll' | 'removeAllSync',
    type: RWLockType,
  ) {
    const operator =
      (action.startsWith('removeAll') && `-${this.count[type]}`) || (action.startsWith('remove') && '-1') || '+1'
    const read = this.count['read'] + type === 'read' ? operator : ''
    const write = this.count['write'] + type === 'write' ? operator : ''
    this.debug(`${action}:${type} read:${read} write:${write}`)
  }
}

const instances: RWLockfile[] = []
process.once('exit', () => {
  for (let i of instances) i.removeAllSync()
})

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function random(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min) + min)
}

function debugEnvVar(): boolean {
  return process.env.RWLOCKFILE_DEBUG === '1'
}

function onceAtATime(argKey?: number) {
  const key = Symbol('onceAtATimeKey')
  return (_: any, __: string, descriptor: TypedPropertyDescriptor<(...args: any[]) => Promise<any>>) => {
    if (!descriptor.value && !descriptor.get)
      throw new Error('Only put the @onceAtATime decorator on a method or getter.')
    const originalMethod = descriptor.value || descriptor.get
    let fn: any = async function(this: any, ...args: any[]) {
      const cache = fn[key]
      const subKey = argKey !== undefined ? args[argKey] : Symbol('noArg')
      const v = await (cache[subKey] = cache[subKey] || originalMethod!.apply(this, args))
      delete cache[subKey]
      return v
    }
    fn[key] = {}
    if (descriptor.value) descriptor.value = fn
    else descriptor.get = fn
    return descriptor
  }
}

export class LockfileError extends Error {
  code = 'ELOCK'
  msg: string
  file: string
  reason: string

  constructor({ msg, file, reason }: { file: string; msg?: string; reason?: string }) {
    super(msg || (reason ? `${reason}: ${file}` : `lock exists!: ${file}`))
  }
}

export default RWLockfile
