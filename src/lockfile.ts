import * as FS from 'fs-extra'
import * as path from 'path'

import { LockfileError } from './errors'
import { onceAtATime } from './decorators'

const version = require('../package.json').version

export interface LockfileOptions {
  debug?: any
  timeout?: number
  retryInterval?: number
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
  retryInterval: number
}

export default class Lockfile {
  public base: string
  public timeout = 30000
  public retryInterval = 10
  public stale = 10000
  public uuid: string
  private fs: typeof FS
  private _debug?: (msg: string, ...args: any[]) => {}
  private _count = 0
  private updater?: NodeJS.Timer

  /**
   * creates a new simple lockfile without read/write support
   */
  constructor(base: string, options: LockfileOptions = {}) {
    this.timeout = options.timeout || this.timeout
    this.retryInterval = options.retryInterval || this.retryInterval
    this.base = base
    this._debug = options.debug as any
    this.fs = require('fs-extra')
    this.uuid = require('uuid/v4')()
    instances.push(this)
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
    this._debugReport('unlock')
    await this.fs.remove(this.dirPath)
    await this.fs.remove(this._infoPath)
    this._stopLocking()
  }

  /**
   * removes all lock counts
   */
  unlockSync(): void {
    if (!this.count) return
    this._debugReport('unlock')
    this.fs.removeSync(this.dirPath)
    this.fs.removeSync(this._infoPath)
    this._stopLocking()
  }

  /**
   * adds 1 lock count
   */
  async add(opts: Partial<LockOptions> = {}): Promise<void> {
    this._debugReport('add', opts.reason)
    if (!this.count) await this._add(opts)
    this._count++
  }

  /**
   * adds 1 lock count
   */
  addSync(opts: { reason?: string } = {}): void {
    this._debugReport('add', opts.reason)
    if (!this.count) this._lockSync(opts)
    this._count++
  }

  /**
   * removes 1 lock count
   */
  async remove(): Promise<void> {
    this._debugReport('remove')
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
  @onceAtATime()
  async check(): Promise<boolean> {
    const mtime = await this.fetchMtime()
    const status = this._status(mtime)
    return ['open', 'have_lock', 'stale'].includes(status)
  }

  /**
   * check if this instance can get a lock
   * returns true if it already has a lock
   */
  checkSync(): boolean {
    const mtime = this.fetchMtimeSync()
    const status = this._status(mtime)
    return ['open', 'have_lock', 'stale'].includes(status)
  }

  private get _infoPath() {
    return path.resolve(this.dirPath + '.info.json')
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

  private async _saveReason(reason: string | undefined): Promise<void> {
    try {
      await this.fs.writeJSON(this._infoPath, {
        version,
        uuid: this.uuid,
        pid: process.pid,
        reason,
      })
    } catch (err) {
      this.debug(err)
    }
  }

  private _saveReasonSync(reason: string | undefined): void {
    try {
      this.fs.writeJSONSync(this._infoPath, {
        version,
        uuid: this.uuid,
        pid: process.pid,
        reason,
      })
    } catch (err) {
      this.debug(err)
    }
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

  @onceAtATime()
  private async _add(opts: Partial<LockOptions>) {
    await this._lock({
      timeout: this.timeout,
      retryInterval: this.retryInterval,
      ifLocked: ({ reason: _ }) => {},
      ...opts,
    })
    await this._saveReason(opts.reason)
    this.startLocking()
  }

  private async _lock(opts: LockOptions): Promise<void> {
    this.debug('_lock', this.dirPath)
    await this.fs.mkdirp(path.dirname(this.dirPath))
    try {
      await this.fs.mkdir(this.dirPath)
    } catch (err) {
      if (!['EEXIST', 'EPERM'].includes(err.code)) throw err

      // grab reason
      const reason = await this.fetchReason()
      this.debug('waiting for lock', reason, this.dirPath)

      // run callback
      await opts.ifLocked({ reason })

      // check if timed out
      if (opts.timeout < 0) throw new LockfileError({ reason, file: this.dirPath })

      // check if stale
      const mtime = await this.fetchMtime()
      const status = this._status(mtime)

      switch (status) {
        case 'stale':
          try {
            await this.fs.rmdir(this.dirPath)
          } catch (err) {
            if (err.code !== 'ENOENT') throw err
          }
        case 'open':
        case 'have_lock':
          return this._lock(opts)
      }

      // wait before retrying
      const interval = random(opts.retryInterval / 2, opts.retryInterval * 2)
      await wait(interval)
      return this._lock({
        ...opts,
        timeout: opts.timeout - interval,
        retryInterval: opts.retryInterval * 2,
      })
    }
  }

  private _lockSync({ reason, retries = 20 }: { reason?: string; retries?: number } = {}): void {
    this.debug('_lockSync', this.dirPath)
    this.fs.mkdirpSync(path.dirname(this.dirPath))
    try {
      this.fs.mkdirSync(this.dirPath)
    } catch (err) {
      if (!['EEXIST', 'EPERM'].includes(err.code)) throw err

      // check if stale
      const mtime = this.fetchMtimeSync()
      const status = this._status(mtime)

      if (retries <= 0) {
        let reason = this.fetchReasonSync()
        throw new LockfileError({ reason, file: this.dirPath })
      }

      if (status === 'stale') {
        try {
          this.fs.rmdirSync(this.dirPath)
        } catch (err) {
          if (!['EPERM', 'ENOENT'].includes(err.code)) throw err
        }
      }
      return this._lockSync({ reason, retries: retries - 1 })
    }
    this._saveReasonSync(reason)
    this.startLocking()
  }

  private _status(mtime: Date | undefined): 'locked' | 'stale' | 'open' | 'have_lock' {
    if (this.count) return 'have_lock'
    if (!mtime) return 'open'
    const stale = this.isStale(mtime)
    if (mtime && stale) return 'stale'
    return 'locked'
  }

  private startLocking() {
    this.updater = setInterval(() => {
      let now = Date.now() / 1000
      this.fs.utimes(this.dirPath, now, now).catch(err => {
        this.debug(err)
        this._stopLocking()
      })
    }, 1000)
  }

  private _stopLocking(): void {
    if (this.updater) clearInterval(this.updater)
    this._count = 0
  }

  private _debugReport(action: 'add' | 'remove' | 'unlock', reason?: string) {
    this.debug(`${action} ${this.count} ${reason ? `${reason} ` : ''}${this.dirPath}`)
  }
}

export interface RWLockfileOptions {
  debug?: any
  file?: string
}

const instances: Lockfile[] = []
process.once('exit', () => {
  for (let i of instances) {
    try {
      i.unlockSync()
    } catch (err) {}
  }
})

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function random(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min) + min)
}
