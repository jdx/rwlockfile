// @flow

const lock = require('./rwlockfile')
const fs = require('graceful-fs')
const tmp = require('tmp')

let t
beforeEach(() => {
  t = tmp.tmpNameSync()
})

test('fails with 2 writers', async () => {
  tmp.tmpNameSync()
  expect.assertions(1)
  await lock.write(t)
  try {
    await lock.write(t, {timeout: 200})
  } catch (err) {
    expect(err.message).toEqual(`${t}.writer is locked`)
  }
})

test('fails with 1 reader trying to write', async () => {
  expect.assertions(1)
  await lock.read(t)
  // add some junk readers
  fs.appendFileSync(`${t}.readers`, '\n1298782\n\nlskjdf')
  try {
    await lock.write(t, {timeout: 200})
  } catch (err) {
    expect(err.message).toContain(`${t} is locked with a reader active`)
  }
})

test('fails with 1 writer trying to read', async () => {
  expect.assertions(1)
  await lock.write(t)
  try {
    await lock.read(t, {timeout: 200})
  } catch (err) {
    expect(err.message).toEqual(`${t} is locked with an active writer`)
  }
})

test('succeeds when write locking with stale writer', async () => {
  fs.mkdirSync(`${t}.writer`)
  fs.writeFileSync(`${t}.writer/pid`, '290830098')
  await lock.write(t)
})

test('succeeds when read locking with stale writer', async () => {
  if (!fs.existsSync(`${t}.writer`)) fs.mkdirSync(`${t}.writer`)
  fs.writeFileSync(`${t}.writer/pid`, '290830098')
  await lock.read(t)
})

test('succeeds when read locking with stale writer dir', async () => {
  if (!fs.existsSync(`${t}.writer`)) fs.mkdirSync(`${t}.writer`)
  await lock.write(t)
})

test('hasWriter', async () => {
  expect(await lock.hasWriter(t)).toEqual(false)
  let unlock = await lock.write(t)
  expect(await lock.hasWriter(t)).toEqual(true)
  await unlock()
  expect(await lock.hasWriter(t)).toEqual(false)
})

test('hasReaders', async () => {
  expect(await lock.hasReaders(t)).toEqual(false)
  let unlock = await lock.read(t)
  expect(await lock.hasReaders(t)).toEqual(true)
  await unlock()
  expect(await lock.hasReaders(t)).toEqual(false)
})

test('unreadSync', async () => {
  expect(await lock.hasReaders(t)).toEqual(false)
  await lock.read(t)
  expect(await lock.hasReaders(t)).toEqual(true)
  lock.unreadSync(t)
  expect(await lock.hasReaders(t)).toEqual(false)
})

test('cleanup', async () => {
  expect(await lock.hasReaders(t)).toEqual(false)
  await lock.read(t)
  expect(await lock.hasReaders(t)).toEqual(true)
  lock.cleanup()
  expect(await lock.hasReaders(t)).toEqual(false)
})
