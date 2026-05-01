# Babel IoC Dependency Wrapper Plugin

Wraps a CommonJS module's body in a container function so that `require()` calls can be intercepted and resolved asynchronously from a custom source (e.g. over HTTP, from a database, or from a sandboxed registry). Two wrapper variants are provided: one based on `async/await` and one based on generators.

## Installation

```bash
npm install --save-dev @actualwave/babel-ioc-dep-wrap-plugin
```

`@babel/core` is required as a peer dependency:

```bash
npm install --save-dev @babel/core
```

## Usage

Both plugins are plain Babel plugin factories — call them to get a plugin and pass the result in the `plugins` array.

```javascript
import babel from '@babel/core';
import { wrapWithAsyncFn, wrapWithGeneratorFn } from '@actualwave/babel-ioc-dep-wrap-plugin';

const result = babel.transformSync(sourceCode, {
  plugins: [wrapWithAsyncFn()],
});
```

---

## Async Wrapper

`wrapWithAsyncFn(globalRequire?, options?)` wraps the module in an `async function`. Every `require()` call is converted to `await require()`, and dynamic `import()` calls at the top level are converted to `await require()`. A custom `require` function is passed as the first argument at call time, letting you intercept every dependency load.

### Options

| Argument | Type | Default | Description |
|---|---|---|---|
| `globalRequire` | `boolean` | `false` | When `true`, the `require` parameter defaults to the global `require`, allowing fallback to normal resolution. |
| `options.convertImports` | `boolean` | `false` | When `true`, converts ES6 `import` declarations to `await require()` calls automatically. |
| `options.hoistNestedRequires` | `boolean` | `false` | When `true`, hoists `require()` calls found inside nested functions to the top of the wrapper instead of throwing. |

### Example — basic

```javascript
// Input
"use strict";
require('init');
const b = require('b.js');
const { c } = require('c.js');
module.exports = { b, c };
```

```javascript
// Output
async function moduleInitFunction(require, exports = {}) {
  const module = { exports };
  await require('init');
  const b = await require('b.js');
  const { c } = await require('c.js');
  module.exports = { b, c };
  return module.exports;
}
```

### Example — `convertImports: true`

```javascript
// Input
import defaultExport from 'a';
import { x, y } from 'b';
import * as ns from 'c';
import 'd';
import def, { x } from 'e';
```

```javascript
// Output (inside wrapper)
const defaultExport = (await require('a')).default;
const { x, y } = await require('b');
const ns = await require('c');
await require('d');
const _import0 = await require('e');
const def = _import0.default;
const { x } = _import0;
```

### Example — `hoistNestedRequires: true`

```javascript
// Input
function process(item) {
  const { helper } = require('helpers');
  return helper(item);
}
```

```javascript
// Output (inside wrapper)
const _hoisted0 = await require('helpers');
function process(item) {
  const { helper } = _hoisted0;
  return helper(item);
}
```

### Dynamic `import()`

Top-level `import()` is converted to `await require()`. Nested `import()` (inside a function) is left as-is since it returns a Promise natively.

```javascript
// Top-level import() → await require()
import('lazy-module');          // → await require('lazy-module')
await import('lazy-module');    // → await require('lazy-module')

// Nested import() → left unchanged
const fn = async () => { await import('lazy-module'); };
```

---

## Generator Wrapper

`wrapWithGeneratorFn(async?, options?)` wraps the module in a generator function. Every `require()` and top-level `import()` call is converted to `yield { require: '<name>' }`, pausing execution until the caller resumes with the resolved module.

### Options

| Argument | Type | Default | Description |
|---|---|---|---|
| `async` | `boolean` | `true` | When `true`, produces `async function*`; when `false`, produces `function*`. |
| `options.convertImports` | `boolean` | `false` | When `true`, converts ES6 `import` declarations to `yield { require: ... }`. |
| `options.hoistNestedRequires` | `boolean` | `false` | When `true`, hoists `require()` inside nested functions to the wrapper top. |

### Example — basic

```javascript
// Input
require('init');
const b = require('b.js');
```

```javascript
// Output (async=true)
async function* moduleInitFunction(exports = {}) {
  const module = { exports };
  yield { require: 'init' };
  const b = yield { require: 'b.js' };
  return module.exports;
}
```

### Example — `async: false`

```javascript
function* moduleInitFunction(exports = {}) {
  const module = { exports };
  yield { require: 'init' };
  const b = yield { require: 'b.js' };
  return module.exports;
}
```

### Example — `convertImports: true`

```javascript
// Input
import foo from 'a';
import { x } from 'b';
```

```javascript
// Output (inside wrapper)
const foo = (yield { require: 'a' }).default;
const { x } = yield { require: 'b' };
```

### Dynamic `import()`

Top-level `import()` and `await import()` are both converted to `yield { require: ... }`. Nested `import()` is left as-is.

```javascript
import('lazy-module');          // → yield { require: 'lazy-module' }
await import('lazy-module');    // → yield { require: 'lazy-module' }
```

---

## Both wrappers — `module.exports` support

Both wrappers inject `const module = { exports }` and return `module.exports`. This means all three CommonJS export patterns work correctly:

```javascript
exports.foo = 1;           // ✓
module.exports.foo = 1;    // ✓
module.exports = { foo };  // ✓  (return module.exports picks up the reassignment)
```

---

## Calling a wrapped module

### Async wrapper — custom HTTP loader

```javascript
const moduleCache = new Map();

const asyncRequire = async (name, exports) => {
  const code = await fetch(`/modules?name=${encodeURIComponent(name)}`).then((r) => r.text());
  eval(code); // moduleInitFunction is now defined
  return moduleInitFunction(asyncRequire, exports);
};

const require = (name) => {
  if (moduleCache.has(name)) return moduleCache.get(name);
  const exports = {};
  // Store early to handle circular dependencies
  moduleCache.set(name, exports);
  return asyncRequire(name, exports);
};

const { myExport } = await require('entry-module');
```

### Generator wrapper — step-through loader

```javascript
async function loadModule(name) {
  const code = await fetch(`/modules?name=${encodeURIComponent(name)}`).then((r) => r.text());
  eval(code); // moduleInitFunction is now defined

  const gen = moduleInitFunction();
  let step = gen.next();

  while (!step.done) {
    const depExports = await loadModule(step.value.require);
    step = gen.next(depExports);
  }

  return step.value; // final module.exports
}
```

---

## Limitations

1. **Nested `require()` calls throw by default.** A `require()` inside an inner function cannot be converted to `await`/`yield` without breaking the surrounding function. Enable `hoistNestedRequires: true` to automatically lift these to the top of the wrapper, or pre-load them before the inner function runs.

2. **ES6 `import` declarations throw by default.** Static imports cannot be placed inside a function body. Enable `convertImports: true` to convert them automatically, or convert them to `require()` calls before running the plugin.

3. **No AMD/UMD wrapping.** Only CommonJS `require()` is handled.

---

## Running tests

```bash
npm install
npm test
```

To run the transformation demo (prints transformed output to stdout):

```bash
npm run test:demo
```

---

## Live demo

A working example using the async wrapper to load modules over HTTP is available at [js-codemirror-package](https://burdiuz.github.io/js-codemirror-package/).
