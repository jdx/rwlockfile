// @flow

const fs = require('graceful-fs')
const path = require('path')
const rimraf = require('rimraf')
const debug = require('debug')('rwlockfile')

let locks = {}
let readers = {}

function pidActive (pid): Promise<boolean> {
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

async function getReaders (path): Promise<number[]> {
  try {
    let f = await readFile(path + '.readers')
    return f.split('\n').map(r => parseInt(r))
  } catch (err) {
    return []
  }
}

function getReadersSync (path): number[] {
  try {
    let f = fs.readFileSync(path + '.readers', 'utf8')
    return f.split('\n').map(r => parseInt(r))
  } catch (err) { return [] }
}

function saveReaders (path, readers) {
  path += '.readers'
  if (readers.length === 0) {
    return fs.unlink(path).catch(() => {})
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

function waitForReaders (path: string, timeout: number, skipOwnPid: boolean) {
  return getReaders(path)
  .then(readers => {
    if (skipOwnPid) readers = readers.filter(r => r !== process.pid)
    if (readers.length === 0) return
    let reader = readers.shift()
    return pidActive(reader)
    .then(active => {
      if (active) {
        debug(`waiting for readers: path=${path} timeout=${timeout}`)
        if (timeout <= 0) throw new Error(`${path} is locked with active readers`)
        return wait()
        .then(() => waitForReaders(path, timeout - 100, skipOwnPid))
      }
      return lock(path + '.readers.lock', timeout)
      .then(() => saveReaders(path, readers))
      .then(() => unlock(path + '.readers.lock'))
      .then(() => waitForReaders(path, timeout, skipOwnPid))
    })
  })
}

function waitForWriter (path, timeout) {
  return hasWriter(path)
  .then(active => {
    if (active) {
      debug(`waiting for writer: path=${path} timeout=${timeout}`)
      if (timeout <= 0) throw new Error(`${path} is locked with an active writer`)
      return wait()
      .then(() => waitForWriter(path, timeout - 100))
    }
    return unlock(path)
  })
}

function unreadSync (path: string) {
  // TODO: potential lock issue here since not using .readers.lock
  let readers = getReadersSync(path)
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
  options.skipOwnPid = !!options.skipOwnPid
  options.timeout = options.timeout || 60000
  debug(`write(${path}, timeout=${options.timeout}, skipOwnPid=${options.skipOwnPid.toString()})`)
  await waitForReaders(path, options.timeout, options.skipOwnPid)
  await lock(path + '.writer', options.timeout)
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
  options.timeout = options.timeout || 60000
  debug(`read(${path}, timeout=${options.timeout})`)
  await waitForWriter(path, options.timeout)
  await lock(path + '.readers.lock', options.timeout)
  let readersFile = await getReaders(path)
  await saveReaders(path, readersFile.concat([process.pid]))
  await unlock(path + '.readers.lock')
  readers[path] = 1
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

exports.unreadSync = unreadSync

process.on('exit', function () {
  Object.keys(locks).forEach(unlockSync)
  Object.keys(readers).forEach(unreadSync)
})
