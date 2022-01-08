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
async function moduleinitFunction(require) {
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
async function* moduleinitFunction() {
  yield {
    require: 'init',
  };
  const b = yield {
    require: 'b.js',
  };
  return exports;
}
```

### Limitations

1.  Import declarations cannot be processed, so source must be a CommonJs module. Since import delcarations could be only found in top level/scope of the module, it is a good target for future update.
2.  Nested `require()` calls, like `const stuff = (() => require('stuff'))()`, since require calls are being transformed into await calls or generator yields, covering nested require() calls does not seem doable. However, nested dynamic imports are supported with async wrapper, because they return Promise anyway.
    > This also seems like a target for update, to return a list of such requires if any and warning instead of error. Modules from this list could be pre-loaded and provided immediately.
3.  No AMD/UMD wrapping.

### Example require() using fetch()
When module is required, it loads module code from `./modules?name=<package name>` and returns promise which resolves with module exports.
```javascript
const moduleCache = new Map();

/**
 * Load and evaluate module
 * @private
 */
const asyncRequire = async (moduleName, exports) =>
  fetch(`./modules?name=${encodeURIComponent(moduleName)}`)
    .then((response) => response.text())
    .then((code) => {
      eval(code);

      return moduleInitFunction(require, exports);
    });

/**
 * Cache module or return cached module
 * 
 * @param {String} moduleName
 * @returns {Promise<Object>} Module exports
 */
const require = (moduleName) => {
  if (moduleCache.has(moduleName)) {
    return moduleCache.get(moduleName);
  }

  const exports = {};

  /**
   * This helps to resolve circular dependencies.
   * We return module exports early and fill it when it is ready.
   * This way it won't block loading other modules.
   */
  moduleCache.set(moduleName, exports);

  return asyncRequire(moduleName, exports);
};
```
To use such require, just call it and wait for promise to resolve
```javascript
const dependencies = async () => {
  const { moduleFn } = await require('my-module'); 

};
```
This way requiring modules [works in this example](https://burdiuz.github.io/js-codemirror-package/).