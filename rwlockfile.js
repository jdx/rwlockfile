/**
 * @module rwlockfile
 */

const fs = require('graceful-fs')
const path = require('path')
const rimraf = require('rimraf')

let locks = {}
let readers = {}

function pidActive (pid) {
  const ps = require('ps-node')
  return new Promise((resolve, reject) => {
    if (!pid) return resolve(false)
    ps.lookup({pid}, (err, result) => {
      if (err) return reject(err)
      resolve(result.length > 0)
    })
  })
}

async function lockActive (path) {
  try {
    let file = await readFile(path)
    let pid = parseInt(file.trim())
    return pidActive(pid)
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }
}

function unlock (path) {
  return new Promise(resolve => rimraf(path, resolve))
}

function wait (ms = 100) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function unlockSync (path) {
  try {
    rimraf.sync(path)
  } catch (err) { }
  delete locks[path]
}

function lock (p, timeout) {
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

function readFile (path) {
  return new Promise((resolve, reject) => {
    fs.readFile(path, 'utf8', (err, body) => {
      if (err) return reject(err)
      resolve(body)
    })
  })
}

function writeFile (path, content) {
  return new Promise((resolve, reject) => {
    fs.writeFile(path, content, (err, body) => {
      if (err) return reject(err)
      resolve(body)
    })
  })
}

function getReaders (path) {
  return readFile(path + '.readers', 'utf8')
  .then(f => f.split('\n').map(r => parseInt(r)))
  .catch(() => [])
}

function getReadersSync (path) {
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

function waitForReaders (path, options, timeout) {
  if (timeout === undefined) timeout = options.timeout
  return getReaders(path)
  .then(readers => {
    if (options.skipOwnPid) readers = readers.filter(r => r !== process.pid)
    if (readers.length === 0) return
    let reader = readers.shift()
    return pidActive(reader)
    .then(active => {
      if (active) {
        if (timeout <= 0) throw new Error(`${path} is locked with active readers`)
        return wait()
        .then(() => waitForReaders(path, options, timeout - 100))
      }
      return lock(path + '.readers.lock')
      .then(() => saveReaders(path, readers))
      .then(() => unlock(path + '.readers.lock'))
      .then(() => waitForReaders(path, options, timeout))
    })
  })
}

function waitForWriter (path, timeout) {
  return hasWriter(path)
  .then(active => {
    if (active) {
      if (timeout <= 0) throw new Error(`${path} is locked with an active writer`)
      return wait()
      .then(() => waitForWriter(path, timeout - 100))
    }
    return unlock(path)
  })
}

function unreadSync (path) {
  // TODO: potential lock issue here since not using .readers.lock
  let readers = getReadersSync(path)
  saveReadersSync(path, readers.filter(r => r !== process.pid))
}

/**
 * lock for writing
 * @param path {string} - path of lockfile to use
 * @param options {object}
 * @param [options.timeout=60000] {number} - Max time to wait for lockfile to be open
 * @param [options.skipOwnPid] {boolean} - Do not wait on own pid (to upgrade current process)
 * @returns {Promise}
 */
exports.write = function (path, options = {}) {
  options.timeout = options.timeout || 60000
  return waitForReaders(path, options)
  .then(() => lock(path + '.writer', options.timeout))
  .then(() => () => unlock(path + '.writer'))
}

/**
 * lock for reading
 * @param path {string} - path of lockfile to use
 * @param options {object}
 * @param [options.timeout=60000] {number} - Max time to wait for lockfile to be open
 * @returns {Promise}
 */
exports.read = function (path, options = {}) {
  options.timeout = options.timeout || 60000
  return waitForWriter(path, options.timeout)
  .then(() => lock(path + '.readers.lock'))
  .then(() => getReaders(path))
  .then(readers => saveReaders(path, readers.concat([process.pid])))
  .then(() => unlock(path + '.readers.lock'))
  .then(() => { readers[path] = 1 })
}

/**
 * check if active writer
 * @param path {string} - path of lockfile to use
 */
function hasWriter (p) {
  return Promise.resolve(readFile(path.join(p + '.writer', 'pid')).catch(err => {
    if (err.code !== 'ENOENT') throw err
  }))
  .then(pid => {
    if (!pid) return false
    return pidActive(parseInt(pid))
  })
}
exports.hasWriter = hasWriter

exports.unreadSync = unreadSync

process.on('exit', function () {
  Object.keys(locks).forEach(unlockSync)
  Object.keys(readers).forEach(unreadSync)
})
