import { RWLockfileError } from './errors'

test('unhandled', () => {
  expect(() => {
    throw new RWLockfileError({ status: 'open', file: 'myfile' })
  }).toThrow('Unexpected status: open')
})
