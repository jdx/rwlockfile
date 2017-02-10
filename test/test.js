const {describe, it} = require('mocha')
const lock = require('..')

describe('rwlockfile', function () {
  it('fails with 2 writers', async function () {
    await lock.write('tmp/a')
    await lock.write('tmp/a', {timeout: 100})
    .should.be.rejectedWith('a.write is locked')
  })

  it('fails with 1 reader and 1 writer', async function () {
    await lock.read('tmp/b')
    await lock.write('tmp/b', {timeout: 100})
    .should.be.rejectedWith('b is locked with active readers')
  })
})
