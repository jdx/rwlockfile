/**
 * @module rwlockfile
 */

const fs = require('graceful-fs')

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

function lockActive (path) {
  return readFile(path)
  .then(file => {
    let pid = parseInt(file.trim())
    return pidActive(pid)
  })
}

function unlock (path) {
  return new Promise(resolve => fs.unlink(path, resolve))
}

function wait (ms = 100) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function unlockSync (path) {
  try {
    fs.unlinkSync(path)
  } catch (err) { }
  delete locks[path]
}

function lock (path, timeout) {
  return new Promise((resolve, reject) => {
    fs.open(path, 'wx', (err, fd) => {
      if (!err) {
        locks[path] = fd
        fs.write(fd, process.pid.toString(), resolve)
        return
      }
      if (err.code !== 'EEXIST') return reject(err)
      lockActive(path).then(active => {
        if (!active) return unlock(path).then(resolve).catch(reject)
        if (timeout <= 0) throw new Error(`${path} is locked`)
        wait().then(() => lock(path, timeout - 100).then(resolve).catch(reject))
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
  return readFile(path + '.readers')
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

function waitForReaders (path, timeout) {
  return getReaders(path)
  .then(readers => {
    if (readers.length === 0) return
    let reader = readers.shift()
    return pidActive(reader)
    .then(active => {
      if (active) {
        if (timeout <= 0) throw new Error(`${path} is locked with active readers`)
        return wait()
        .then(() => waitForReaders(path, timeout - 100))
      }
      return lock(path + '.readers.lock')
      .then(() => saveReaders(path, readers))
      .then(() => unlock(path + '.readers.lock'))
      .then(() => waitForReaders(path, timeout))
    })
  })
}

function waitForWriter (path, timeout) {
  return Promise.resolve(readFile(path + '.writer').catch(err => {
    if (err.code !== 'ENOENT') throw err
  }))
  .then(pid => {
    if (!pid) return
    return pidActive(parseInt(pid))
    .then(active => {
      if (active) {
        if (timeout <= 0) throw new Error(`${path} is locked with an active writer`)
        return wait()
        .then(() => waitForWriter(path, timeout - 100))
      }
      return unlock(path)
    })
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
 */
exports.write = function (path, options = {}) {
  options.timeout = options.timeout || 60000
  return waitForReaders(path, options.timeout)
  .then(() => lock(path + '.writer', options.timeout))
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

process.on('exit', function () {
  Object.keys(locks).forEach(unlockSync)
  Object.keys(readers).forEach(unreadSync)
})
