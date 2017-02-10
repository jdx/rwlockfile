const {describe, it} = require('mocha')
const lock = require('..')

describe('rwlockfile', function () {
  it('locks a file', async function () {
    await lock.write('foo')
    await lock.write('foo', {timeout: 100})
    .should.be.rejectedWith('foo.write is locked')
  })
})
