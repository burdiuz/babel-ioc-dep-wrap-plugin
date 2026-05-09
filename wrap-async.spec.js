import { describe, test, expect } from '@jest/globals';
import babel from '@babel/core';
import { wrapWithAsyncFn } from './wrap-async.js';

// Default options are now convertImports=true, hoistNestedRequires=true.
// Tests that check the disabled-option error paths pass explicit overrides.
const transform = (code, globalRequire = false, options = {}) =>
  babel.transformSync(code, { plugins: [wrapWithAsyncFn(globalRequire, options)] }).code;

describe('wrapWithAsyncFn', () => {
  describe('wrapper structure', () => {
    test('wraps module body in async function named moduleInitFunction', () => {
      const result = transform(`const x = require('x');`);
      expect(result).toMatch(/async function moduleInitFunction\(/);
    });

    test('adds exports parameter with default empty object', () => {
      const result = transform(`const x = require('x');`);
      expect(result).toMatch(/exports\s*=\s*\{\}/);
    });

    test('adds require as first parameter without default when globalRequire=false', () => {
      const result = transform(`require('x');`, false);
      expect(result).toMatch(/moduleInitFunction\(require,/);
      expect(result).not.toMatch(/require\s*=\s*require/);
    });

    test('adds require parameter with global require default when globalRequire=true', () => {
      const result = transform(`require('x');`, true);
      expect(result).toMatch(/require\s*=\s*require/);
    });

    test('declares module variable bound to exports inside wrapper', () => {
      const result = transform(`const x = require('x');`);
      expect(result).toMatch(/const module\s*=\s*\{/);
      expect(result).toMatch(/exports:\s*exports/);
    });

    test('returns module.exports at end of wrapper', () => {
      const result = transform(`const x = require('x');`);
      expect(result).toMatch(/return module\.exports;?\s*\}/);
    });

    test('module.exports reassignment is returned correctly', () => {
      const result = transform(`module.exports = { value: 1 };`);
      expect(result).toContain('module.exports = {');
      expect(result).toMatch(/return module\.exports/);
    });

    test('removes "use strict" directive', () => {
      const result = transform(`"use strict";\nconst x = require('x');`);
      expect(result).not.toContain('"use strict"');
    });

    test('does not double-wrap an already-wrapped module', () => {
      const once = transform(`const x = require('x');`);
      const twice = transform(once);
      const matches = twice.match(/async function moduleInitFunction/g);
      expect(matches).toHaveLength(1);
    });
  });

  describe('require() transformation', () => {
    test('converts require() to await require()', () => {
      const result = transform(`const x = require('x');`);
      expect(result).toContain('await require');
    });

    test('converts multiple require() calls to await require()', () => {
      const result = transform(`require('a');\nrequire('b');`);
      const matches = result.match(/await require/g);
      expect(matches).toHaveLength(2);
    });

    test('preserves require argument', () => {
      const result = transform(`const x = require('my-module');`);
      expect(result).toContain("await require('my-module')");
    });

    test('does not double-wrap already-awaited require()', () => {
      const result = transform(`await require('x');`);
      const matches = result.match(/await/g);
      expect(matches).toHaveLength(1);
    });
  });

  describe('import() transformation', () => {
    test('converts top-level dynamic import() to await require()', () => {
      const result = transform(`import('my-module');`);
      expect(result).toContain("await require('my-module')");
      expect(result).not.toContain('import(');
    });

    test('leaves nested dynamic import() as-is', () => {
      const result = transform(`const fn = async () => { await import('x'); };`);
      expect(result).toContain('import(');
    });
  });

  describe('convertImports option', () => {
    test('converts side-effect import to expression statement (default on)', () => {
      const result = transform(`import 'foo';`);
      expect(result).toContain("await require('foo')");
      expect(result).not.toContain('import ');
    });

    test('converts default import to .default member access', () => {
      const result = transform(`import foo from 'foo';`);
      expect(result).toMatch(/const foo.*=.*await require\(['"]foo['"]\).*\.default/s);
      expect(result).not.toContain('import ');
    });

    test('converts named imports to destructuring', () => {
      const result = transform(`import { a, b } from 'foo';`);
      expect(result).toMatch(/\{[^}]*a[^}]*b[^}]*\}.*=.*await require\(['"]foo['"]\)/s);
      expect(result).not.toContain('import ');
    });

    test('converts aliased named import', () => {
      const result = transform(`import { a as myA } from 'foo';`);
      expect(result).toMatch(/a:\s*myA/);
      expect(result).toContain("await require('foo')");
    });

    test('converts namespace import', () => {
      const result = transform(`import * as ns from 'foo';`);
      expect(result).toMatch(/const ns.*=.*await require\(['"]foo['"]\)/s);
      expect(result).not.toContain('import ');
    });

    test('converts mixed default and named imports via temp variable', () => {
      const result = transform(`import foo, { a } from 'foo';`);
      expect(result).toContain('_import0');
      expect(result).toContain('.default');
      expect(result).toContain("await require('foo')");
    });

    test('converts mixed default and multiple named imports, all extracted', () => {
      const result = transform(`import foo, { a, b, c } from 'foo';`);
      expect(result).toContain('_import0');
      expect(result).toContain('.default');
      expect(result).toMatch(/\{[^}]*a[^}]*b[^}]*c[^}]*\}/s);
    });

    test('assigns sequential temp IDs across multiple mixed imports', () => {
      const result = transform(`import a, { x } from 'a';\nimport b, { y } from 'b';`);
      expect(result).toContain('_import0');
      expect(result).toContain('_import1');
    });

    test('throws on import declaration when convertImports is false', () => {
      expect(() =>
        transform(`import foo from 'foo';`, false, { convertImports: false }),
      ).toThrow(/import declarations/i);
    });
  });

  describe('hoistNestedRequires option', () => {
    test('hoists require from nested named function to wrapper body (default on)', () => {
      const result = transform(`function fn() { const x = require('x'); return x; }`);
      expect(result).toMatch(/const _hoisted0.*=.*await require\(['"]x['"]\)/);
      expect((result.match(/_hoisted0/g) || []).length).toBeGreaterThanOrEqual(2);
    });

    test('hoists require from arrow function', () => {
      const result = transform(`const fn = () => { const x = require('x'); };`);
      expect(result).toMatch(/const _hoisted0.*=.*await require\(['"]x['"]\)/);
    });

    test('hoists require from doubly-nested function', () => {
      const result = transform(`function outer() { function inner() { require('x'); } }`);
      expect(result).toContain('_hoisted0');
    });

    test('assigns unique variable names to multiple nested requires', () => {
      const result = transform(
        `function a() { require('x'); }\nfunction b() { require('y'); }`,
      );
      expect(result).toContain('_hoisted0');
      expect(result).toContain('_hoisted1');
    });

    test('hoisted requires appear before the rest of the module body', () => {
      const result = transform(`const y = 1;\nfunction fn() { require('x'); }`);
      expect(result.indexOf('_hoisted0')).toBeLessThan(result.indexOf('const y'));
    });

    test('throws on nested require when hoistNestedRequires is false', () => {
      expect(() =>
        transform(`function fn() { require('x'); }`, false, { hoistNestedRequires: false }),
      ).toThrow(/nested requires/i);
    });
  });

  describe('convertImports + hoistNestedRequires together', () => {
    test('handles import declarations and nested requires in the same module', () => {
      const result = transform(`import foo from 'a';\nfunction fn() { require('b'); }`);
      expect(result).toMatch(/await require\(['"]a['"]\).*\.default/s);
      expect(result).toContain('_hoisted0');
      expect(result).toMatch(/await require\(['"]b['"]\)/);
    });

    test('hoisted requires appear before converted imports', () => {
      const result = transform(`import foo from 'a';\nfunction fn() { require('b'); }`);
      expect(result.indexOf('_hoisted0')).toBeLessThan(result.indexOf('foo'));
    });
  });

  describe('requireName option', () => {
    const transformRN = (code, globalRequire = false) =>
      transform(code, globalRequire, { requireName: 'load' });

    test('uses custom name as the wrapper parameter', () => {
      const result = transformRN(`require('x');`);
      expect(result).toMatch(/moduleInitFunction\(load,/);
      expect(result).not.toContain('(require,');
    });

    test('renames require() calls in output to custom name', () => {
      const result = transformRN(`const x = require('x');`);
      expect(result).toContain("await load('x')");
      expect(result).not.toMatch(/await require/);
    });

    test('renames already-awaited require() to custom name without double-wrapping', () => {
      const result = transformRN(`await require('x');`);
      expect(result).toContain("await load('x')");
      expect(result).not.toMatch(/await require/);
      expect((result.match(/await/g) || []).length).toBe(1);
    });

    test('uses custom name in hoisted require declarations', () => {
      const result = transformRN(`function fn() { require('x'); }`);
      expect(result).toMatch(/const _hoisted0\s*=\s*await load\(['"]x['"]\)/);
      expect(result).not.toMatch(/await require/);
    });

    test('uses custom name in converted import declarations', () => {
      const result = transformRN(`import foo from 'foo';`);
      expect(result).toMatch(/await load\(['"]foo['"]\)/);
      expect(result).not.toMatch(/await require/);
    });

    test('uses custom name when converting dynamic import() calls', () => {
      const result = transformRN(`import('x');`);
      expect(result).toContain("await load('x')");
      expect(result).not.toMatch(/await require/);
    });

    test('with globalRequire=true the parameter defaults to the global require', () => {
      const result = transformRN(`require('x');`, true);
      expect(result).toMatch(/load\s*=\s*require/);
      expect(result).toContain("await load('x')");
    });
  });

  describe('error cases', () => {
    test('throws on ES6 import declaration when convertImports is false', () => {
      expect(() =>
        transform(`import foo from 'foo';`, false, { convertImports: false }),
      ).toThrow(/import declarations/i);
    });

    test('throws when require() is inside a nested function and hoistNestedRequires is false', () => {
      expect(() =>
        transform(`const fn = () => { require('x'); };`, false, { hoistNestedRequires: false }),
      ).toThrow(/nested requires/i);
    });

    test('throws when require() is inside a named function and hoistNestedRequires is false', () => {
      expect(() =>
        transform(`function load() { return require('x'); }`, false, {
          hoistNestedRequires: false,
        }),
      ).toThrow(/nested requires/i);
    });
  });
});
