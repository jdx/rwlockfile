import L = require('./lockfile')
import RWL = require('./rwlockfile')

export function lockfileSync(prop: string) {
  const Lockfile = require('./lockfile').default
  return (_: any, name: string, descriptor: TypedPropertyDescriptor<(...args: any[]) => any>) => {
    if (!descriptor || (!descriptor.value && !descriptor.get)) {
      throw new Error('Only put the @lockfileSync decorator on a method or getter.')
    }
    const originalMethod = descriptor.value || descriptor.get
    let fn: any = function(this: any, ...args: any[]) {
      const lockfile: L.default = this[prop]
      if (!(lockfile instanceof Lockfile)) {
        throw new Error('prop does not point to a RWLockfile instance')
      }
      lockfile.addSync({ reason: name })
      try {
        return originalMethod!.apply(this, args)
      } finally {
        lockfile.removeSync()
      }
    }
    if (descriptor.value) descriptor.value = fn
    else descriptor.get = fn
    return descriptor
  }
}

export function lockfile(prop: string) {
  const Lockfile = require('./lockfile').default
  return (_: any, name: string, descriptor: TypedPropertyDescriptor<(...args: any[]) => Promise<any>>) => {
    if (!descriptor || (!descriptor.value && !descriptor.get)) {
      throw new Error('Only put the @lockfile decorator on a method or getter.')
    }
    const originalMethod = descriptor.value || descriptor.get
    let fn: any = async function(this: any, ...args: any[]) {
      const lockfile: L.default = this[prop]
      if (!(lockfile instanceof Lockfile)) {
        throw new Error('prop does not point to a Lockfile instance')
      }
      await lockfile.add({ reason: name })
      try {
        return await originalMethod!.apply(this, args)
      } finally {
        await lockfile.remove()
      }
    }
    if (descriptor.value) descriptor.value = fn
    else descriptor.get = fn
    return descriptor
  }
}

export function rwlockfile(prop: string, type: 'read' | 'write') {
  const RWLockfile = require('./rwlockfile').default
  return (_: any, name: string, descriptor: TypedPropertyDescriptor<(...args: any[]) => Promise<any>>) => {
    if (!descriptor || (!descriptor.value && !descriptor.get)) {
      throw new Error('Only put the @rwlockfile decorator on a method or getter.')
    }
    const originalMethod = descriptor.value || descriptor.get
    let fn: any = async function(this: any, ...args: any[]) {
      const lockfile: RWL.default = this[prop]
      if (!(lockfile instanceof RWLockfile)) {
        throw new Error('prop does not point to a Lockfile instance')
      }
      await lockfile.add(type, { reason: name })
      let result
      try {
        result = await originalMethod!.apply(this, args)
      } finally {
        await lockfile.remove(type)
      }
      return result
    }
    if (descriptor.value) descriptor.value = fn
    else descriptor.get = fn
    return descriptor
  }
}

export function onceAtATime(argKey?: number) {
  const key = Symbol('onceAtATimeKey')
  return (_: any, __: string, descriptor: TypedPropertyDescriptor<(...args: any[]) => Promise<any>>) => {
    if (!descriptor || (!descriptor.value && !descriptor.get)) {
      throw new Error('Only put the @onceAtATime decorator on a method or getter.')
    }
    const originalMethod = descriptor.value || descriptor.get
    let noArgSubkey = Symbol('noArg')
    let fn: any = async function(this: any, ...args: any[]) {
      const subKey = argKey !== undefined ? args[argKey] : noArgSubkey
      const cache = (this[key] = this[key] || {})
      if (cache[subKey]) return cache[subKey]
      cache[subKey] = originalMethod!.apply(this, args)
      try {
        return await cache[subKey]
      } finally {
        delete cache[subKey]
      }
    }
    if (descriptor.value) descriptor.value = fn
    else descriptor.get = fn
    return descriptor
  }
}
