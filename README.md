# Babel IoC Dependency Wrapper Plugin
Wraps module content into a container that overwrites `require()`(i.e. works only with CommonJS modules) calls with custom calls to intercept dependency loading. It provides two wrapper versions for async and generator wrapper functions.

### Async Wrapper
 Async wrapper allows providing custom `require()` replacement and all calls to it are done via `await` statement.
Source: 
```javascript
require('init');

const b = require('b.js');
```

Result:
```javascript
async function initFunction(require) {
  await require('init');
  const b = await require('b.js');
  return exports;
}
```

### Generator Wrapper
 Generator wrapper, replaces all require() calls into `yeild`s, so you module pauses until dependencies are resolved and control flow returned.
 Source: 
```javascript
require('init');

const b = require('b.js');
```

Result:
```javascript
async function* initFunction() {
  yield {
    require: 'init'
  };
  const b = yield {
    require: 'b.js'
  };
  return exports;
}   
```