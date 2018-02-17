rwlockfile
==========

[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)
[![Greenkeeper badge](https://badges.greenkeeper.io/jdxcode/rwlockfile.svg)](https://greenkeeper.io/)
[![codecov](https://codecov.io/gh/jdxcode/rwlockfile/branch/master/graph/badge.svg)](https://codecov.io/gh/jdxcode/rwlockfile)
[![CircleCI](https://circleci.com/gh/jdxcode/rwlockfile.svg?style=svg)](https://circleci.com/gh/jdxcode/rwlockfile)
[![Build status](https://ci.appveyor.com/api/projects/status/2s8cyotehrtap0t2/branch/master?svg=true)](https://ci.appveyor.com/project/Heroku/rwlockfile/branch/master)
[![npm](https://img.shields.io/npm/v/rwlockfile.svg)](https://npmjs.org/package/rwlockfile)
[![npm](https://img.shields.io/npm/dw/rwlockfile.svg)](https://npmjs.org/package/rwlockfile)
[![npm](https://img.shields.io/npm/l/rwlockfile.svg)](https://github.com/jdxcode/rwlockfile/blob/master/package.json)

node utility for read/write lockfiles

This is the only node package as of this writing I'm aware of that allows you to have read/write lockfiles. If you're looking for a simpler solution, check out [proper-lockfile](https://www.npmjs.com/package/proper-lockfile). Use this package if you need read/write lock support.

This follows the standard [Readers-Writers Lock design pattern](https://en.wikipedia.org/wiki/Readers–writer_lock). Any number of readers are allowed at one time. 1 writer is allowed at one time iff there are no current readers.

Usage
=====

```js
const {RWLockfile} = require('rwlockfile')

// 'myfile' is the path to a file to use as the base for the lockfile
// it will add '.lock' to the end for the actual lockfile, so in this case 'myfile.lock'
let lock = new RWLockfile('myfile', {
  // how long to wait until timeout. Default: 30000
  timeout: 30000,
  // mininum time to wait between checking for locks
  // automatically adds some noise and duplicates this number each check
  retryInterval: 10,
})

// add a reader async or synchronously. If the count is >= 1 it creates a read lock
await lock.add('read')
lock.addSync('read')

// remove a reader async or synchronously. If the count == 0 it creates removes the read lock
lock.remove('read')
lock.removeSync('read')

// add a writer async or synchronously
lock.add('write')
lock.addSync('write')
```
