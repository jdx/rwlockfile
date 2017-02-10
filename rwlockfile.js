const fs = require('graceful-fs')

let locks = {}

function pidActive (pid) {
  const ps = require('ps-node')
  return new Promise((resolve, reject) => {
    ps.lookup({pid}, (err, result) => {
      if (err) return reject(err)
      resolve(result.length > 0)
    })
  })
}

function lockActive (path) {
  return new Promise((resolve, reject) => {
    fs.readFile(path, 'utf8', (err, body) => {
      if (err) return reject(err)
      let pid = parseInt(body.trim())
      pidActive(pid).then(resolve).catch(reject)
    })
  })
}

function unlock (path) {
  return new Promise(resolve => fs.unlink(path, resolve))
}

function unlockSync (path) {
  try {
    fs.unlinkSync(path)
  } catch (err) { }
  delete locks[path]
}

function lock (path, timeout = 60000) {
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
        setTimeout(() => lock(path, timeout - 100).then(resolve).catch(reject), 100)
      }).catch(reject)
    })
  })
}

exports.write = function (path, options = {}) {
  return lock(path + '.write', options.timeout)
}

process.on('exit', function () {
  Object.keys(locks).forEach(unlockSync)
})

