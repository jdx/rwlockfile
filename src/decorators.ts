import L = require('./lockfile')
import RWL = require('./rwlockfile')

export interface LockfileOptions {
  sync?: boolean
}
export function lockfile(prop: string, opts: LockfileOptions = {}) {
  const Lockfile = require('./lockfile').default
  return methodDecorator(function ({original, propertyName}) {
    return function (this: any, ...args: any[]) {
      const lockfile: L.default = this[prop]
      if (!(lockfile instanceof Lockfile)) {
        throw new Error('prop does not point to a Lockfile instance')
      }
      if (opts.sync) {
        lockfile.addSync({ reason: propertyName.toString() })
        try {
          return original.apply(this, args)
        } finally {
          lockfile.removeSync()
        }
      } else {
        return (async () => {
          await lockfile.add({ reason: propertyName.toString() })
          try {
            return await original.apply(this, args)
          } finally {
            await lockfile.remove()
          }
        })()
      }
    }
  })
}

export interface RWLockfileOptions {
  ifLocked?: string
}

export function rwlockfile(prop: string, type: 'read' | 'write', opts: RWLockfileOptions = {}) {
  const RWLockfile = require('./rwlockfile').default
  return methodDecorator<(...args: any[]) => Promise<any>>(function ({original, propertyName}) {
    return async function (this: any, ...args: any[]) {
      const lockfile: RWL.default = this[prop]
      if (!(lockfile instanceof RWLockfile)) {
        throw new Error('prop does not point to a Lockfile instance')
      }
      const addOpts: RWL.RWLockOptions = {
        reason: propertyName.toString()
      }
      if (opts.ifLocked) {
        addOpts.ifLocked = () => this[opts.ifLocked as any]()
      }
      await lockfile.add(type, addOpts)
      let result
      try {
        result = await original.apply(this, args)
      } finally {
        await lockfile.remove(type)
      }
      return result
    }
  })
}

export function onceAtATime(argKey?: number) {
  return methodDecorator<(...args: any[]) => Promise<any>>(function ({original}) {
    const key = Symbol('onceAtATime')
    return async function (this: any, ...args: any[]) {
      const subKey = argKey !== undefined ? args[argKey] : key
      const cache = (this[key] = this[key] || {})
      if (cache[subKey]) return cache[subKey]
      cache[subKey] = original.apply(this, args)
      try {
        return await cache[subKey]
      } finally {
        delete cache[subKey]
      }
    }
  })
}

export interface IDecoratorOptions<T> {
  target: Object,
  propertyName: string | symbol,
  descriptor: TypedPropertyDescriptor<T>,
  original: T
}

export interface IDecorator<T> {
  (opts: IDecoratorOptions<T>): T
}

function methodDecorator<T extends Function> (fn: IDecorator<T>): MethodDecorator {
  return (target, propertyName, descriptor) => {
    if (isMethodDecorator(descriptor)) {
      descriptor.value = fn({target, propertyName, descriptor, original: descriptor.value} as any) as any
      return descriptor
    } else {
      throw new Error(`${propertyName} on ${target} is not a a method`)
    }
  }
}

function isMethodDecorator<T>(prop: TypedPropertyDescriptor<T>): prop is {value: T | undefined} {
  if (!prop) return false
  return !!(prop as {value: T}).value
}
