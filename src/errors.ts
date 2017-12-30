export class LockfileError extends Error {
  code = 'ELOCK'
  msg: string
  file: string
  reason: string

  constructor({ msg, file, reason }: { file: string; msg?: string; reason?: string }) {
    super(msg || (reason ? `${reason}: ${file}` : `lock exists!: ${file}`))
  }
}
