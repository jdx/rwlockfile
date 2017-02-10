rwlockfile
==========

[![Build Status](https://semaphoreci.com/api/v1/dickeyxxx/rwlockfile/branches/master/badge.svg)](https://semaphoreci.com/dickeyxxx/rwlockfile)

node utility for read/write lockfiles

<a name="module_rwlockfile"></a>

## rwlockfile
<a name="module_rwlockfile.write"></a>

### rwlockfile.write(path, options)
lock for writing

**Kind**: static method of <code>[rwlockfile](#module_rwlockfile)</code>  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| path | <code>string</code> |  | path of lockfile to use |
| options | <code>object</code> |  |  |
| [options.timeout] | <code>number</code> | <code>60000</code> | Max time to wait for lockfile to be open |

