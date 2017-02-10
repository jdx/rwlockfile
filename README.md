rwlockfile
==========

[![Build Status](https://semaphoreci.com/api/v1/dickeyxxx/rwlockfile/branches/master/badge.svg)](https://semaphoreci.com/dickeyxxx/rwlockfile)

node utility for read/write lockfiles

<a name="module_rwlockfile"></a>

## rwlockfile

* [rwlockfile](#module_rwlockfile)
    * [.write(path, options)](#module_rwlockfile.write)
    * [.read(path, options)](#module_rwlockfile.read)

<a name="module_rwlockfile.write"></a>

### rwlockfile.write(path, options)
lock for writing

**Kind**: static method of <code>[rwlockfile](#module_rwlockfile)</code>  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| path | <code>string</code> |  | path of lockfile to use |
| options | <code>object</code> |  |  |
| [options.timeout] | <code>number</code> | <code>60000</code> | Max time to wait for lockfile to be open |

<a name="module_rwlockfile.read"></a>

### rwlockfile.read(path, options)
lock for reading

**Kind**: static method of <code>[rwlockfile](#module_rwlockfile)</code>  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| path | <code>string</code> |  | path of lockfile to use |
| options | <code>object</code> |  |  |
| [options.timeout] | <code>number</code> | <code>60000</code> | Max time to wait for lockfile to be open |

