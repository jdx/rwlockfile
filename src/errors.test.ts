import {RWLockfileError} from './errors'

test('unhandled', () => {
  expect(() => {
    throw new RWLockfileError({status: 'open'}, 'myfile')
  }).toThrow('Unexpected status: open')
})
