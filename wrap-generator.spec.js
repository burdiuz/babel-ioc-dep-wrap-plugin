import { describe, test, expect } from '@jest/globals';
import babel from '@babel/core';
import { wrapWithGeneratorFn } from './wrap-generator.js';

// Default options are now convertImports=true, hoistNestedRequires=true.
// Tests that check the disabled-option error paths pass explicit overrides.
const transform = (code, async = true, options = {}) =>
  babel.transformSync(code, { plugins: [wrapWithGeneratorFn(async, options)] }).code;

describe('wrapWithGeneratorFn', () => {
  describe('wrapper structure', () => {
    test('wraps module body in a generator function named moduleInitFunction', () => {
      const result = transform(`const x = require('x');`);
      expect(result).toMatch(/function\s*\*\s*moduleInitFunction/);
    });

    test('creates async generator when async=true', () => {
      const result = transform(`const x = require('x');`, true);
      expect(result).toMatch(/async function\s*\*\s*moduleInitFunction/);
    });

    test('creates non-async generator when async=false', () => {
      const result = transform(`const x = require('x');`, false);
      expect(result).not.toMatch(/async function\s*\*\s*moduleInitFunction/);
      expect(result).toMatch(/function\s*\*\s*moduleInitFunction/);
    });

    test('adds exports parameter with default empty object', () => {
      const result = transform(`const x = require('x');`);
      expect(result).toMatch(/exports\s*=\s*\{\}/);
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
      const matches = twice.match(/function\s*\*\s*moduleInitFunction/g);
      expect(matches).toHaveLength(1);
    });
  });

  describe('require() transformation', () => {
    test('converts require() to yield { require: ... }', () => {
      const result = transform(`require('x');`);
      expect(result).toMatch(/yield\s*\{/);
      expect(result).toMatch(/require:\s*['"]x['"]/);
    });

    test('converts multiple require() calls to yields', () => {
      const result = transform(`require('a');\nrequire('b');`);
      const matches = result.match(/yield\s*\{/g);
      expect(matches).toHaveLength(2);
    });

    test('preserves require argument as yield value', () => {
      const result = transform(`const x = require('my-module');`);
      expect(result).toMatch(/require:\s*['"]my-module['"]/);
    });

    test('strips await from await require() before converting to yield', () => {
      const result = transform(`const x = await require('x');`);
      expect(result).not.toContain('await');
      expect(result).toMatch(/yield\s*\{/);
    });
  });

  describe('import() transformation', () => {
    test('converts top-level dynamic import() to yield { require: ... }', () => {
      const result = transform(`import('my-module');`);
      expect(result).toMatch(/yield\s*\{/);
      expect(result).toMatch(/require:\s*['"]my-module['"]/);
      expect(result).not.toContain('import(');
    });

    test('converts await import() to yield { require: ... }', () => {
      const result = transform(`const x = await import('my-module');`);
      expect(result).toMatch(/require:\s*['"]my-module['"]/);
      expect(result).not.toContain('await');
      expect(result).not.toContain('import(');
    });

    test('leaves nested dynamic import() as-is', () => {
      const result = transform(`const fn = async () => { const x = await import('x'); };`);
      expect(result).toContain('import(');
    });
  });

  describe('convertImports option', () => {
    test('converts side-effect import to yield expression (default on)', () => {
      const result = transform(`import 'foo';`);
      expect(result).toMatch(/yield\s*\{/);
      expect(result).toMatch(/require:\s*['"]foo['"]/);
      expect(result).not.toContain('import ');
    });

    test('converts default import to .default member access', () => {
      const result = transform(`import foo from 'foo';`);
      expect(result).toMatch(/foo.*=.*yield.*\.default/s);
      expect(result).not.toContain('import ');
    });

    test('converts named imports to destructuring', () => {
      const result = transform(`import { a, b } from 'foo';`);
      expect(result).toMatch(/\{[^}]*a[^}]*b[^}]*\}.*=.*yield/s);
      expect(result).not.toContain('import ');
    });

    test('converts aliased named import', () => {
      const result = transform(`import { a as myA } from 'foo';`);
      expect(result).toMatch(/a:\s*myA/);
      expect(result).toMatch(/require:\s*['"]foo['"]/);
    });

    test('converts namespace import', () => {
      const result = transform(`import * as ns from 'foo';`);
      expect(result).toMatch(/const ns.*=.*yield/s);
      expect(result).not.toContain('import ');
    });

    test('converts mixed default and named imports via temp variable', () => {
      const result = transform(`import foo, { a } from 'foo';`);
      expect(result).toContain('_import0');
      expect(result).toContain('.default');
      expect(result).toMatch(/require:\s*['"]foo['"]/);
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
        transform(`import foo from 'foo';`, true, { convertImports: false }),
      ).toThrow(/import declarations/i);
    });
  });

  describe('hoistNestedRequires option', () => {
    test('hoists require from nested named function to wrapper body (default on)', () => {
      const result = transform(`function fn() { const x = require('x'); return x; }`);
      expect(result).toMatch(/const _hoisted0.*=.*yield/s);
      expect(result).toMatch(/require:\s*['"]x['"]/);
      expect((result.match(/_hoisted0/g) || []).length).toBeGreaterThanOrEqual(2);
    });

    test('hoists require from arrow function', () => {
      const result = transform(`const fn = () => { const x = require('x'); };`);
      expect(result).toContain('_hoisted0');
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
        transform(`function fn() { require('x'); }`, true, { hoistNestedRequires: false }),
      ).toThrow(/nested requires/i);
    });
  });

  describe('convertImports + hoistNestedRequires together', () => {
    test('handles import declarations and nested requires in the same module', () => {
      const result = transform(`import foo from 'a';\nfunction fn() { require('b'); }`);
      expect(result).toMatch(/foo.*=.*yield.*\.default/s);
      expect(result).toContain('_hoisted0');
      expect(result).toMatch(/require:\s*['"]b['"]/);
    });

    test('hoisted requires appear before converted imports', () => {
      const result = transform(`import foo from 'a';\nfunction fn() { require('b'); }`);
      expect(result.indexOf('_hoisted0')).toBeLessThan(result.indexOf('foo'));
    });
  });

  describe('error cases', () => {
    test('throws on ES6 import declaration when convertImports is false', () => {
      expect(() =>
        transform(`import foo from 'foo';`, true, { convertImports: false }),
      ).toThrow(/import declarations/i);
    });

    test('throws when require() is inside a nested function and hoistNestedRequires is false', () => {
      expect(() =>
        transform(`const fn = () => { require('x'); };`, true, { hoistNestedRequires: false }),
      ).toThrow(/nested requires/i);
    });

    test('throws when require() is inside a named function and hoistNestedRequires is false', () => {
      expect(() =>
        transform(`function load() { return require('x'); }`, true, {
          hoistNestedRequires: false,
        }),
      ).toThrow(/nested requires/i);
    });
  });
});
