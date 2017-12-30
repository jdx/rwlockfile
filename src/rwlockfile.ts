import { spawn, spawnSync } from 'child_process'
import { lockfile, lockfileSync, onceAtATime } from './decorators'
import * as FS from 'fs-extra'
import * as path from 'path'
import Lockfile, { LockfileOptions } from './lockfile'
import { RWLockfileError } from './errors'

const version = require('../package.json').version

export type ReadStatus =
  | {
      status: 'open'
    }
  | {
      status: 'write_lock'
      job: Job
    }

export type WriteStatus =
  | ReadStatus
  | {
      status: 'read_lock'
      jobs: Job[]
    }

export type Status = WriteStatus

export interface RWLockOptions {
  reason?: string
  ifLocked?: ({ reason }: { reason?: string }) => Promise<void> | void
  timeout?: number
  retryInterval?: number
}

export interface RWLockfileOptions extends LockfileOptions {
  timeout?: number
  retryInterval?: number
}

export type RWLockType = 'read' | 'write'

export interface Job {
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
  private _debug: any
  private uuid: string
  private fs: typeof FS
  private timeout: number
  private retryInterval: number
  // @ts-ignore
  private internal: Lockfile
  private _count: { read: number; write: number } = { read: 0, write: 0 }

  /**
   * creates a new read/write lockfile
   * @param base {string} - base filepath to create lock from
   */
  constructor(base: string, options: RWLockfileOptions = {}) {
    this.base = base
    this._debug = options.debug || (debugEnvVar() && require('debug')('rwlockfile'))
    this.uuid = require('uuid/v4')()
    this.fs = require('fs-extra')
    this.timeout = options.timeout || 30000
    this.retryInterval = options.retryInterval || 1000
    instances.push(this)
    this.internal = new Lockfile(this.file, {
      debug: debugEnvVar() === 2 && this._debug,
    })
  }

  get count(): { readonly read: number; readonly write: number } {
    return { read: this._count.read, write: this._count.write }
  }
  get file() {
    return path.resolve(this.base + '.lock')
  }

  async add(type: RWLockType, opts: RWLockOptions = {}) {
    this._debugReport('add', type)
    if (!this.count[type]) await this._lock(type, opts)
    this._count[type]++
  }

  addSync(type: RWLockType, { reason }: { reason?: string } = {}): void {
    this._debugReport('addSync', type)
    if (!this.count[type]) this._lockSync(type, reason)
    this._count[type]++
  }

  async remove(type: RWLockType): Promise<void> {
    this._debugReport('remove', type)
    switch (this.count[type]) {
      case 0:
        break
      case 1:
        await this.unlock(type)
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
        this.unlockSync(type)
        break
      default:
        this._count[type]--
        break
    }
  }

  async unlock(type?: RWLockType): Promise<void> {
    if (!type) {
      await this.unlock('read')
      await this.unlock('write')
      return
    }
    if (!this.count[type]) return
    this._debugReport('unlock', type)
    await this._removeJob(type)
    this._count[type] = 0
  }

  unlockSync(type?: RWLockType): void {
    if (!type) {
      this.unlockSync('read')
      this.unlockSync('write')
      return
    }
    if (!this.count[type]) return
    this._debugReport('unlockSync', type)
    this._removeJobSync(type)
    this._count[type] = 0
  }

  @lockfile('internal')
  async check(type: RWLockType): Promise<Status> {
    const f = await this._fetchFile()
    const status = this._statusFromFile(type, f)
    if (status.status === 'open') return status
    else if (status.status === 'write_lock') {
      if (!await pidActive(status.job.pid)) {
        this.debug(`removing inactive write pid: ${status.job.pid}`)
        delete f.writer
        await this.writeFile(f)
        return this.check(type)
      }
      return status
    } else if (status.status === 'read_lock') {
      const pids = await Promise.all(
        status.jobs.map(async j => {
          if (!await pidActive(j.pid)) return j.pid
        }),
      )
      const inactive = pids.filter(p => !!p)
      if (inactive.length) {
        this.debug(`removing inactive read pids: ${inactive}`)
        f.readers = f.readers.filter(j => !inactive.includes(j.pid))
        await this.writeFile(f)
        return this.check(type)
      }
      if (!status.jobs.find(j => j.uuid !== this.uuid)) return { status: 'open' }
      return status
    } else throw new Error(`Unexpected status: ${status!.status}`)
  }

  @lockfileSync('internal')
  checkSync(type: RWLockType): Status {
    const f = this._fetchFileSync()
    const status = this._statusFromFile(type, f)
    if (status.status === 'open') return status
    else if (status.status === 'write_lock') {
      if (!pidActiveSync(status.job.pid)) {
        this.debug(`removing inactive writer pid: ${status.job.pid}`)
        delete f.writer
        this.writeFileSync(f)
        return this.checkSync(type)
      }
      return status
    } else if (status.status === 'read_lock') {
      const inactive = status.jobs.map(j => j.pid).filter(pid => !pidActiveSync(pid))
      if (inactive.length) {
        this.debug(`removing inactive reader pids: ${inactive}`)
        f.readers = f.readers.filter(j => !inactive.includes(j.pid))
        this.writeFileSync(f)
        return this.checkSync(type)
      }
      if (!status.jobs.find(j => j.uuid !== this.uuid)) return { status: 'open' }
      return status
    } else throw new Error(`Unexpected status: ${status!.status}`)
  }

  private _statusFromFile(type: RWLockType, f: RWLockfileJSON): Status {
    if (f.writer) return { status: 'write_lock', job: f.writer }
    if (type === 'write') {
      if (f.readers.length) return { status: 'read_lock', jobs: f.readers }
    }
    return { status: 'open' }
  }

  private _parseFile(input: any): RWLockfileJSON {
    function addDate(job?: Job) {
      if (!job) return
      return {
        ...job,
        created: new Date(job.created || 0),
      }
    }

    return {
      ...input,
      writer: addDate(input.writer),
      readers: input.readers.map(addDate),
    }
  }

  private _stringifyFile(input: RWLockfileJSON): any {
    function addDate(job?: Job) {
      if (!job) return
      return {
        ...job,
        created: (job.created || new Date(0)).toISOString(),
      }
    }

    return {
      ...input,
      writer: addDate(input.writer),
      readers: (input.readers || []).map(addDate),
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

  private writeFile(f: RWLockfileJSON): Promise<void> {
    return this.fs.outputJSON(this.file, this._stringifyFile(f))
  }

  private writeFileSync(f: RWLockfileJSON): void {
    this.fs.outputJSONSync(this.file, this._stringifyFile(f))
  }

  private addJob(type: RWLockType, reason: string | undefined, f: RWLockfileJSON): void {
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
  @lockfile('internal')
  private async _removeJob(type: RWLockType): Promise<void> {
    let f = await this._fetchFile()
    this._removeJobFromFile(type, f)
    await this.writeFile(f)
  }

  @lockfileSync('internal')
  private _removeJobSync(type: RWLockType): void {
    let f = this._fetchFileSync()
    this._removeJobFromFile(type, f)
    this.writeFileSync(f)
  }

  private _removeJobFromFile(type: RWLockType, f: RWLockfileJSON): void {
    if (type === 'read') f.readers = f.readers.filter(r => r.uuid !== this.uuid)
    else if (f.writer && f.writer.uuid === this.uuid) delete f.writer
  }

  @onceAtATime(1)
  async _lock(type: RWLockType, opts: RWLockOptions): Promise<void> {
    opts.timeout = opts.timeout || this.timeout
    opts.retryInterval = opts.retryInterval || this.retryInterval
    let ifLockedCb = once(opts.ifLocked || (() => {}))
    while (true) {
      try {
        await this._tryLock(type, opts.reason)
        return
      } catch (err) {
        if (err.code !== 'ELOCK') throw err
        await ifLockedCb()
        if (opts.timeout < 0) throw err

        // try again
        const interval = random(opts.retryInterval / 2, opts.retryInterval * 2)
        await wait(interval)
        opts.timeout -= interval
      }
    }
  }

  @lockfile('internal')
  async _tryLock(type: RWLockType, reason?: string): Promise<void> {
    const status = await this.check(type)
    if (status.status !== 'open') {
      this.debug('status: %o', status)
      throw new RWLockfileError(status, this.file)
    }
    let f = await this._fetchFile()
    this.addJob(type, reason, f)
    await this.writeFile(f)
  }

  @lockfileSync('internal')
  private _lockSync(type: RWLockType, reason?: string): void {
    const status = this.checkSync(type)
    if (status.status !== 'open') {
      this.debug('status: %o', status)
      throw new RWLockfileError(status, this.file)
    }
    let f = this._fetchFileSync()
    this.addJob(type, reason, f)
    this.writeFileSync(f)
  }

  private get debug() {
    return this._debug || ((..._: any[]) => {})
  }
  private _debugReport(
    action: 'add' | 'addSync' | 'remove' | 'removeSync' | 'unlock' | 'unlockSync',
    type: RWLockType,
  ): void {
    const operator =
      (action.startsWith('unlock') && `-${this.count[type]}`) || (action.startsWith('remove') && '-1') || '+1'
    const read = this.count['read'] + (type === 'read' ? operator : '')
    const write = this.count['write'] + (type === 'write' ? operator : '')
    this.debug(`${action}:${type} read:${read} write:${write} ${this.file}`)
  }
}

const instances: RWLockfile[] = []
process.once('exit', () => {
  for (let i of instances) i.unlockSync()
})

function debugEnvVar(): number {
  return (process.env.RWLOCKFILE_DEBUG === '1' && 1) || (process.env.RWLOCKFILE_DEBUG === '2' && 2) || 0
}

function pidActiveSync(pid: number): boolean {
  if (!pid || isNaN(pid)) return false
  return process.platform === 'win32' ? pidActiveWindowsSync(pid) : pidActiveUnix(pid)
}

async function pidActive(pid: number): Promise<boolean> {
  if (!pid || isNaN(pid)) return false
  return process.platform === 'win32' ? pidActiveWindows(pid) : pidActiveUnix(pid)
}

function pidActiveWindows(pid: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const p = spawn('tasklist', ['/fi', `PID eq ${pid}`])
    p.on('close', code => {
      if (code !== 0) reject(new Error(`tasklist exited with code ${code}`))
    })
    p.stdout.on('data', (stdout: string) => {
      resolve(!stdout.includes('No tasks are running'))
    })
  })
}

function pidActiveWindowsSync(pid: number): boolean {
  const { stdout, error, status } = spawnSync('tasklist', ['/fi', `PID eq ${pid}`], {
    stdio: [0, null, 2],
    encoding: 'utf8',
  })
  if (error) throw error
  if (status !== 0) throw new Error(`tasklist exited with code ${status}`)
  return !stdout.includes('No tasks are running')
}

function pidActiveUnix(pid: number): boolean {
  try {
    return !!process.kill(pid, 0)
  } catch (e) {
    return e.code === 'EPERM'
  }
}

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function random(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min) + min)
}

function once(fn: Function) {
  return () => {
    try {
      return fn()
    } finally {
      fn = () => {}
    }
  }
}

export default RWLockfile
