// @flow

const fs = require('graceful-fs')
const path = require('path')
const rimraf = require('rimraf')
const debug = require('debug')('rwlockfile')

let locks = {}
let readers = {}

async function pidActive (pid): Promise<boolean> {
  if (isNaN(pid)) return false
  const ps = require('ps-node')
  return new Promise((resolve, reject) => {
    if (!pid) return resolve(false)
    ps.lookup({pid}, (err, result) => {
      if (err) return reject(err)
      resolve(result.length > 0)
    })
  })
}

async function lockActive (path): Promise<boolean> {
  try {
    let file = await readFile(path)
    let pid = parseInt(file.trim())
    return pidActive(pid)
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
    return false
  }
}

function unlock (path) {
  debug(`unlocking ${path}`)
  return new Promise(resolve => rimraf(path, resolve))
  .then(() => { delete locks[path] })
}

function wait (ms = 100) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function unlockSync (path) {
  debug(`unlocking ${path}`)
  try {
    rimraf.sync(path)
  } catch (err) { debug(err) }
  delete locks[path]
}

function lock (p: string, timeout: number) {
  debug(`locking ${p}`)
  let pidPath = path.join(p, 'pid')
  return new Promise((resolve, reject) => {
    fs.mkdir(p, (err) => {
      if (!err) {
        locks[p] = 1
        fs.writeFile(pidPath, process.pid.toString(), resolve)
        return
      }
      if (err.code !== 'EEXIST') return reject(err)
      lockActive(pidPath).then(active => {
        if (!active) return unlock(p).then(resolve).catch(reject)
        if (timeout <= 0) throw new Error(`${p} is locked`)
        wait().then(() => lock(p, timeout - 100).then(resolve).catch(reject))
      }).catch(reject)
    })
  })
}

function readFile (path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    fs.readFile(path, 'utf8', (err, body) => {
      if (err) return reject(err)
      resolve(body)
    })
  })
}

function writeFile (path: string, content: string) {
  return new Promise((resolve, reject) => {
    fs.writeFile(path, content, (err, body) => {
      if (err) return reject(err)
      resolve(body)
    })
  })
}

async function getReadersFile (path): Promise<number[]> {
  try {
    let f = await readFile(path + '.readers')
    return f.split('\n').map(r => parseInt(r))
  } catch (err) {
    return []
  }
}

function getReadersFileSync (path): number[] {
  try {
    let f = fs.readFileSync(path + '.readers', 'utf8')
    return f.split('\n').map(r => parseInt(r))
  } catch (err) { return [] }
}

const unlink = p => new Promise((resolve, reject) => fs.unlink(p, err => err ? reject(err) : resolve()))

function saveReaders (path, readers) {
  path += '.readers'
  if (readers.length === 0) {
    return unlink(path).catch(() => {})
  } else {
    return writeFile(path, readers.join('\n'))
  }
}

function saveReadersSync (path, readers) {
  path += '.readers'
  try {
    if (readers.length === 0) {
      fs.unlinkSync(path)
    } else {
      fs.writeFileSync(path, readers.join('\n'))
    }
  } catch (err) {}
}

async function getActiveReaders (path: string, timeout: number, skipOwnPid: boolean = false): Promise<number[]> {
  await lock(path + '.readers.lock', timeout)
  let readers: number[] = await getReadersFile(path)
  let promises = readers.map(r => pidActive(r).then(active => active ? r : null))
  let activeReaders = (await Promise.all(promises): any)
  activeReaders = activeReaders.filter(r => r !== null)
  if (activeReaders.length !== readers.length) {
    await saveReaders(path, activeReaders)
  }
  await unlock(path + '.readers.lock')
  return skipOwnPid ? activeReaders.filter(r => r !== process.pid) : activeReaders
}

async function waitForReaders (path: string, timeout: number, skipOwnPid: boolean) {
  let readers = await getActiveReaders(path, timeout, skipOwnPid)
  if (readers.length !== 0) {
    if (timeout <= 0) throw new Error(`${path} is locked with ${readers.length === 1 ? 'a reader' : 'readers'} active: ${readers.join(' ')}`)
    debug(`waiting for readers: ${readers.join(' ')} timeout=${timeout}`)
    await wait(100)
    await waitForReaders(path, timeout - 100, skipOwnPid)
  }
}

function waitForWriter (path, timeout) {
  return hasWriter(path)
  .then(active => {
    if (active) {
      if (timeout <= 0) throw new Error(`${path} is locked with an active writer`)
      debug(`waiting for writer: path=${path} timeout=${timeout}`)
      return wait()
      .then(() => waitForWriter(path, timeout - 100))
    }
    return unlock(path)
  })
}

async function unread (path: string, timeout: number) {
  await lock(path + '.readers.lock', timeout)
  let readers = await getReadersFile(path)
  if (readers.find(r => r === process.pid)) {
    await saveReaders(path, readers.filter(r => r !== process.pid))
  }
  await unlock(path + '.readers.lock')
}
exports.unread = unread

function unreadSync (path: string) {
  // TODO: potential lock issue here since not using .readers.lock
  let readers = getReadersFileSync(path)
  saveReadersSync(path, readers.filter(r => r !== process.pid))
}

type WriteLockOptions = {
  timeout: number,
  skipOwnPid: boolean
}

/**
 * lock for writing
 * @param path {string} - path of lockfile to use
 * @param options {object}
 * @param [options.timeout=60000] {number} - Max time to wait for lockfile to be open
 * @param [options.skipOwnPid] {boolean} - Do not wait on own pid (to upgrade current process)
 * @returns {Promise}
 */
exports.write = async function (path: string, options: $Shape<WriteLockOptions> = {}) {
  let skipOwnPid = !!options.skipOwnPid
  let timeout = options.timeout || 60000
  debug(`write(${path}, timeout=${timeout}, skipOwnPid=${skipOwnPid.toString()})`)
  await waitForReaders(path, timeout, skipOwnPid)
  await lock(path + '.writer', timeout)
  return () => unlock(path + '.writer')
}

type ReadLockOptions = {
  timeout: number
}

/**
 * lock for reading
 * @param path {string} - path of lockfile to use
 * @param options {object}
 * @param [options.timeout=60000] {number} - Max time to wait for lockfile to be open
 * @returns {Promise}
 */
exports.read = async function (path: string, options: $Shape<ReadLockOptions> = {}) {
  let timeout = options.timeout || 60000
  debug(`read(${path}, timeout=${timeout})`)
  await waitForWriter(path, timeout)
  await lock(path + '.readers.lock', timeout)
  let readersFile = await getReadersFile(path)
  await saveReaders(path, readersFile.concat([process.pid]))
  await unlock(path + '.readers.lock')
  readers[path] = 1
  return () => unread(path, timeout)
}

/**
 * check if active writer
 * @param path {string} - path of lockfile to use
 */
async function hasWriter (p: string): Promise<boolean> {
  let pid
  try {
    pid = await readFile(path.join(p + '.writer', 'pid'))
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }
  if (!pid) return false
  let active = await pidActive(parseInt(pid))
  debug(`hasWriter(${p}): ${active ? 'yes' : 'no'}`)
  return active
}
exports.hasWriter = hasWriter

async function hasReaders (p: string, options: $Shape<WriteLockOptions> = {}): Promise<boolean> {
  let timeout = options.timeout || 60000
  let skipOwnPid = !!options.skipOwnPid
  let readers = await getActiveReaders(p, timeout, skipOwnPid)
  debug(`hasReaders(${p}): ${readers.length}`)
  return readers.length !== 0
}
exports.hasReaders = hasReaders

exports.unreadSync = unreadSync

exports.cleanup = function () {
  Object.keys(locks).forEach(unlockSync)
  Object.keys(readers).forEach(unreadSync)
}

process.once('exit', exports.cleanup)