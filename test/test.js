const {describe, it} = require('mocha')
const lock = require('..')
const fs = require('graceful-fs')

describe('rwlockfile', function () {
  it('fails with 2 writers', async function () {
    await lock.write('tmp/a')
    await lock.write('tmp/a', {timeout: 200})
    .should.be.rejectedWith('tmp/a.writer is locked')
  })

  it('fails with 1 reader trying to write', async function () {
    await lock.read('tmp/b')
    // add some junk readers
    fs.appendFileSync('tmp/b.readers', '\n1298782\n\nlskjdf')
    await lock.write('tmp/b', {timeout: 200})
    .should.be.rejectedWith('tmp/b is locked with active readers')
  })

  it('fails with 1 writer trying to read', async function () {
    await lock.write('tmp/c')
    await lock.read('tmp/c', {timeout: 200})
    .should.be.rejectedWith('tmp/c is locked with an active writer')
  })

  it('succeeds when write locking with stale writer', async function () {
    fs.writeFileSync('tmp/d.writer', '290830098')
    await lock.write('tmp/d')
  })

  it('succeeds when read locking with stale writer', async function () {
    fs.writeFileSync('tmp/e.writer', '290830098')
    await lock.read('tmp/e')
  })
})
