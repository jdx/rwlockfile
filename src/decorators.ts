export function onceAtATime(argKey?: number) {
  const key = Symbol('onceAtATimeKey')
  return (_: any, __: string, descriptor: TypedPropertyDescriptor<(...args: any[]) => Promise<any>>) => {
    if (!descriptor.value && !descriptor.get) throw new Error('Only put the @onceAtATime decorator on a method or getter.')
    const originalMethod = descriptor.value || descriptor.get
    let noArgSubkey = Symbol('noArg')
    let fn: any = async function (this: any, ...args: any[]) {
      const subKey = (argKey !== undefined) ? args[argKey] : noArgSubkey
      const cache = this[key] = this[key] || {}
      const v = await (cache[subKey] = cache[subKey] || originalMethod!.apply(this, args))
      delete cache[subKey]
      return v
    }
    if (descriptor.value) descriptor.value = fn
    else descriptor.get = fn
    return descriptor
  }
}
