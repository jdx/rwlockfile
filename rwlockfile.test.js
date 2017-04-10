const lock = require('./rwlockfile')
const fs = require('graceful-fs')

test('fails with 2 writers', async () => {
  expect.assertions(1)
  await lock.write('tmp/a')
  try {
    await lock.write('tmp/a', {timeout: 200})
  } catch (err) {
    expect(err.message).toEqual('tmp/a.writer is locked')
  }
})

test('fails with 1 reader trying to write', async () => {
  expect.assertions(1)
  await lock.read('tmp/b')
  // add some junk readers
  fs.appendFileSync('tmp/b.readers', '\n1298782\n\nlskjdf')
  try {
    await lock.write('tmp/b', {timeout: 200})
  } catch (err) {
    expect(err.message).toEqual('tmp/b is locked with active readers')
  }
})

test('fails with 1 writer trying to read', async () => {
  expect.assertions(1)
  await lock.write('tmp/c')
  try {
    await lock.read('tmp/c', {timeout: 200})
  } catch (err) {
    expect(err.message).toEqual('tmp/c is locked with an active writer')
  }
})

test('succeeds when write locking with stale writer', async () => {
  fs.mkdirSync('tmp/d.writer')
  fs.writeFileSync('tmp/d.writer/pid', '290830098')
  await lock.write('tmp/d')
})

test('succeeds when read locking with stale writer', async () => {
  if (!fs.existsSync('tmp/e.writer')) fs.mkdirSync('tmp/e.writer')
  fs.writeFileSync('tmp/e.writer/pid', '290830098')
  await lock.read('tmp/e')
})

test('succeeds when read locking with stale writer dir', async () => {
  if (!fs.existsSync('tmp/f.writer')) fs.mkdirSync('tmp/f.writer')
  await lock.write('tmp/f')
})
