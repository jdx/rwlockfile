import { Status } from './rwlockfile'

export class LockfileError extends Error {
  code = 'ELOCK'
  file: string
  msg: string | undefined
  reason: string | undefined

  constructor({ msg, file, reason }: { file: string; msg?: string; reason?: string }) {
    super(msg || (reason ? `${reason}: ${file}` : `lock exists!: ${file}`))
    this.file = file
    this.msg = msg
    this.reason = reason
  }
}

export class RWLockfileError extends LockfileError {
  status: Status

  constructor(status: Status) {
    switch (status.status) {
      case 'write_lock':
        super({ file: status.file, msg: `write lock exists: ${status.job.reason || ''}` })
        break
      case 'read_lock':
        super({ file: status.file, msg: `read lock exists: ${status.jobs[0].reason || ''}` })
        break
      default:
        throw new Error(`Unexpected status: ${status.status}`)
    }
    this.status = status
  }
}
