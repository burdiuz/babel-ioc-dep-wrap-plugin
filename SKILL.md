---
name: babel-ioc-dep-wrap-plugin
description: >
  Transforms CommonJS modules by wrapping their body in an async function or generator
  so that require() calls can be intercepted and resolved from a custom source at runtime
  (e.g. over HTTP, from a registry, or from a sandbox). Supports automatic conversion of
  ES6 import declarations, dynamic import() calls, and nested require() hoisting — all
  enabled by default. Use this skill when you need to load JavaScript modules dynamically
  without the file system, intercept dependency resolution in a Babel pipeline, or build
  an IoC container around CommonJS or ES-module-style source files.
license: ISC
compatibility: Requires Node.js with @babel/core installed. ESM project (type=module). Tests require Node.js 18+ for --experimental-vm-modules.
metadata:
  author: Oleg Galaburda
  version: "0.0.4"
  package: "@actualwave/babel-ioc-dep-wrap-plugin"
---

## Overview

This Babel plugin package provides two transformation strategies. Both wrap the entire module body in a container function so that a custom resolver can be injected at call time. All new-feature options default to `true`, making the plugin work on real-world code without any configuration.

- **`wrapWithAsyncFn`** — wraps in `async function moduleInitFunction(require, exports = {})` (parameter name configurable via `requireName`). Every `require()` becomes `await require()`. Dynamic `import()` at the top level is also converted.
- **`wrapWithGeneratorFn`** — wraps in `function* moduleInitFunction(exports = {})`. Every `require()` and top-level `import()` becomes `yield { require: '<name>' }`.

Both wrappers:
- Remove `"use strict"` directives (invalid inside a function body)
- Inject `const module = { exports }` so `module.exports` assignments work
- Return `module.exports` (captures full-reassignment patterns like `module.exports = { ... }`)
- Convert ES6 `import` declarations to the appropriate `require` form (`convertImports: true`)
- Hoist `require()` calls found inside nested functions to the wrapper top (`hoistNestedRequires: true`)

## How to apply the plugin

```javascript
import babel from '@babel/core';
import { wrapWithAsyncFn, wrapWithGeneratorFn } from '@actualwave/babel-ioc-dep-wrap-plugin';

// Async variant — all options at default (convertImports=true, hoistNestedRequires=true)
const asyncResult = babel.transformSync(sourceCode, {
  plugins: [wrapWithAsyncFn()],
});

// Generator variant — explicit options
const genResult = babel.transformSync(sourceCode, {
  plugins: [wrapWithGeneratorFn(true, { convertImports: true, hoistNestedRequires: true })],
});
```

## Plugin options

### `wrapWithAsyncFn(globalRequire?, options?)`

| Argument | Type | Default | Effect |
|---|---|---|---|
| `globalRequire` | boolean | `false` | When `true`, adds `= require` default to the resolver parameter so the module can fall back to Node's built-in require. |
| `options.requireName` | string | `'require'` | Name used for the injected resolver parameter and all generated calls in the output. |
| `options.convertImports` | boolean | `true` | Converts ES6 `import` declarations to `await <requireName>()` calls. When `false`, throws on any `import` declaration. |
| `options.hoistNestedRequires` | boolean | `true` | Lifts `require()` calls inside nested functions to the top of the wrapper. When `false`, throws on any nested `require()`. |

### `wrapWithGeneratorFn(async?, options?)`

| Argument | Type | Default | Effect |
|---|---|---|---|
| `async` | boolean | `true` | When `true`, produces `async function*`; when `false`, produces `function*`. |
| `options.convertImports` | boolean | `true` | Converts ES6 `import` declarations to `yield { require: ... }`. When `false`, throws on any `import` declaration. |
| `options.hoistNestedRequires` | boolean | `true` | Lifts `require()` calls inside nested functions to the top of the wrapper. When `false`, throws on any nested `require()`. |

## Input / output examples

### Async wrapper — full example

Input:
```javascript
"use strict";
import defaultDep from 'a';
import { helper } from 'b';
const c = require('c');

function process(item) {
  const { util } = require('utils');
  return util(defaultDep, helper, c, item);
}

module.exports = { process };
```

Output:
```javascript
async function moduleInitFunction(require, exports = {}) {
  const module = { exports };
  const _hoisted0 = await require('utils');   // nested require hoisted
  const defaultDep = (await require('a')).default;  // import declaration converted
  const { helper } = await require('b');
  const c = await require('c');

  function process(item) {
    const { util } = _hoisted0;              // replaced with hoisted var
    return util(defaultDep, helper, c, item);
  }

  module.exports = { process };
  return module.exports;                     // returns the reassigned value
}
```

### Generator wrapper — full example

Input:
```javascript
import foo from 'a';
const b = require('b');
module.exports = { foo, b };
```

Output:
```javascript
async function* moduleInitFunction(exports = {}) {
  const module = { exports };
  const foo = (yield { require: 'a' }).default;
  const b = yield { require: 'b' };
  module.exports = { foo, b };
  return module.exports;
}
```

### Async wrapper — custom `requireName`

```javascript
// wrapWithAsyncFn(false, { requireName: 'load' })
// Input: const b = require('b.js');
async function moduleInitFunction(load, exports = {}) {
  const module = { exports };
  const b = await load('b.js');
  return module.exports;
}
```

With `globalRequire: true` the parameter defaults to the global `require` regardless of `requireName`:

```javascript
// wrapWithAsyncFn(true, { requireName: 'load' })
async function moduleInitFunction(load = require, exports = {}) { ... }
```

### import() — dynamic imports

Both wrappers handle top-level dynamic imports and `await import()`:

```javascript
// Input
import('lazy');
await import('also-lazy');

// Async wrapper output
await require('lazy');
await require('also-lazy');

// Generator wrapper output
yield { require: 'lazy' };
yield { require: 'also-lazy' };
```

Nested `import()` (inside a function body) is left as-is in both wrappers since it returns a Promise natively.

### import declaration forms

All five forms are supported when `convertImports` is enabled. Async wrapper output uses `<requireName>` (default `require`):

| Import form | Async wrapper result | Generator wrapper result |
|---|---|---|
| `import 'foo'` | `await require('foo')` | `yield { require: 'foo' }` |
| `import foo from 'foo'` | `const foo = (await require('foo')).default` | `const foo = (yield { require: 'foo' }).default` |
| `import { a, b } from 'foo'` | `const { a, b } = await require('foo')` | `const { a, b } = yield { require: 'foo' }` |
| `import * as ns from 'foo'` | `const ns = await require('foo')` | `const ns = yield { require: 'foo' }` |
| `import foo, { a } from 'foo'` | temp var + `.default` + destructure | same pattern |

### Nested require hoisting

```javascript
// Input
function process(item) {
  const { util } = require('utils');
  return util(item);
}

// Async output (inside wrapper)
const _hoisted0 = await require('utils');  // lifted before module body
function process(item) {
  const { util } = _hoisted0;
  return util(item);
}
```

Multiple nested requires each get a unique variable: `_hoisted0`, `_hoisted1`, etc. Hoisted declarations are inserted before all other module code (after `const module = { exports }`).

## Calling the wrapped module

### Async wrapper — custom HTTP loader

```javascript
const moduleCache = new Map();

const asyncRequire = async (name, exports) => {
  const code = await fetch(`/modules?name=${encodeURIComponent(name)}`).then((r) => r.text());
  eval(code);
  return moduleInitFunction(asyncRequire, exports);
};

const require = (name) => {
  if (moduleCache.has(name)) return moduleCache.get(name);
  const exports = {};
  // Store early to handle circular dependencies
  moduleCache.set(name, exports);
  return asyncRequire(name, exports);
};

const myModule = await require('entry-module');
```

### Generator wrapper — step-through loader

```javascript
async function loadModule(name) {
  const code = await fetch(`/modules?name=${encodeURIComponent(name)}`).then((r) => r.text());
  eval(code);
  const gen = moduleInitFunction();
  let step = gen.next();
  while (!step.done) {
    const depExports = await loadModule(step.value.require);
    step = gen.next(depExports);
  }
  return step.value; // module.exports
}
```

## Opting out of default behaviour

All new features are on by default. Pass explicit options to disable any of them:

```javascript
// Strict mode — throw on any import declaration or nested require
wrapWithAsyncFn(false, { convertImports: false, hoistNestedRequires: false })
wrapWithGeneratorFn(true, { convertImports: false, hoistNestedRequires: false })
```

## Known limitations

- **AMD/UMD modules** — only CommonJS `require()` and ES6 `import` are handled.
- **`await require()` inside nested async functions** — the nested `await` is left in place; only bare `require()` calls are hoisted.
- **Nested `import()` is not hoisted** — it is left as-is since it returns a Promise natively and does not require special handling.

## Running the test suite

```bash
npm install
npm test
```

The project uses Jest with `--experimental-vm-modules` for ESM compatibility. Test files follow the `*.spec.js` naming convention and live alongside their source files.

## File map

| File | Purpose |
|---|---|
| [index.js](index.js) | Re-exports both plugin factories |
| [wrap-async.js](wrap-async.js) | `wrapWithAsyncFn` implementation |
| [wrap-generator.js](wrap-generator.js) | `wrapWithGeneratorFn` implementation |
| [utils.js](utils.js) | Shared AST helpers: `generateWrapperFn`, `convertImportDeclarationToStatements`, `insertHoistedRequires`, `makeAwaitRequireExpression`, `makeYieldRequireExpression` |
| [wrap-async.spec.js](wrap-async.spec.js) | Tests for async wrapper |
| [wrap-generator.spec.js](wrap-generator.spec.js) | Tests for generator wrapper |
| [utils.spec.js](utils.spec.js) | Unit tests for AST utility functions and import conversion |
| [test/integration.spec.js](test/integration.spec.js) | Integration tests — all four plugin modes run against the fixture |
| [test/fixture.js](test/fixture.js) | Sample source used by integration tests and the demo runner |
| [test/index.js](test/index.js) | Demo runner — prints transformed output (`npm run test:demo`) |
