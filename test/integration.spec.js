import { describe, test, expect, beforeAll } from '@jest/globals';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import babel from '@babel/core';
import { wrapWithAsyncFn, wrapWithGeneratorFn } from '../index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(__dirname, 'fixture.js')).toString();

const transform = (plugins) =>
  babel.transformSync(fixture, { plugins }).code;

// The fixture contains these require() calls — all must be transformed.
const REQUIRED_MODULES = ['stuff', 'init', 'b.js', 'c.js'];
// These dynamic imports must also be transformed.
const IMPORTED_MODULES = ['init-async-import', 'init-async-require', 'init-import'];
const ALL_MODULES = [...REQUIRED_MODULES, ...IMPORTED_MODULES];

describe('fixture — generator wrapper (async=true)', () => {
  let result;
  beforeAll(() => {
    result = transform([wrapWithGeneratorFn(true)]);
  });

  test('wraps in async generator function', () => {
    expect(result).toMatch(/async function\s*\*\s*moduleInitFunction/);
  });

  test('removes "use strict" directive', () => {
    expect(result).not.toContain('"use strict"');
  });

  test('converts every require() and import() to yield { require: ... }', () => {
    for (const mod of ALL_MODULES) {
      expect(result).toMatch(new RegExp(`require:\\s*['"]${mod.replace('.', '\\.')}['"]`));
    }
  });

  test('does not contain bare require() calls', () => {
    expect(result).not.toMatch(/\brequire\s*\(/);
  });

  test('does not contain dynamic import() calls', () => {
    expect(result).not.toContain('import(');
  });

  test('returns module.exports', () => {
    expect(result).toMatch(/return module\.exports/);
  });

  test('preserves non-require code', () => {
    expect(result).toContain('printTips');
    expect(result).toContain('tips');
  });
});

describe('fixture — generator wrapper (async=false)', () => {
  let result;
  beforeAll(() => {
    result = transform([wrapWithGeneratorFn(false)]);
  });

  test('wraps in non-async generator function', () => {
    expect(result).toMatch(/function\s*\*\s*moduleInitFunction/);
    expect(result).not.toMatch(/async function\s*\*\s*moduleInitFunction/);
  });

  test('removes "use strict" directive', () => {
    expect(result).not.toContain('"use strict"');
  });

  test('converts every require() and import() to yield { require: ... }', () => {
    for (const mod of ALL_MODULES) {
      expect(result).toMatch(new RegExp(`require:\\s*['"]${mod.replace('.', '\\.')}['"]`));
    }
  });

  test('does not contain bare require() calls', () => {
    expect(result).not.toMatch(/\brequire\s*\(/);
  });

  test('does not contain dynamic import() calls', () => {
    expect(result).not.toContain('import(');
  });

  test('returns module.exports', () => {
    expect(result).toMatch(/return module\.exports/);
  });
});

describe('fixture — async wrapper (globalRequire=true)', () => {
  let result;
  beforeAll(() => {
    result = transform([wrapWithAsyncFn(true)]);
  });

  test('wraps in async function', () => {
    expect(result).toMatch(/async function moduleInitFunction/);
  });

  test('require parameter defaults to global require', () => {
    expect(result).toMatch(/require\s*=\s*require/);
  });

  test('removes "use strict" directive', () => {
    expect(result).not.toContain('"use strict"');
  });

  test('converts every require() to await require()', () => {
    for (const mod of REQUIRED_MODULES) {
      expect(result).toMatch(
        new RegExp(`await require\\(['"]${mod.replace('.', '\\.')}['"]\\)`),
      );
    }
  });

  test('converts dynamic import() calls to await require()', () => {
    for (const mod of IMPORTED_MODULES) {
      expect(result).toMatch(
        new RegExp(`await require\\(['"]${mod.replace('.', '\\.')}['"]\\)`),
      );
    }
  });

  test('does not contain dynamic import() calls', () => {
    expect(result).not.toContain('import(');
  });

  test('returns module.exports', () => {
    expect(result).toMatch(/return module\.exports/);
  });

  test('preserves non-require code', () => {
    expect(result).toContain('printTips');
    expect(result).toContain('tips');
  });
});

describe('fixture — async wrapper (globalRequire=false)', () => {
  let result;
  beforeAll(() => {
    result = transform([wrapWithAsyncFn(false)]);
  });

  test('wraps in async function', () => {
    expect(result).toMatch(/async function moduleInitFunction/);
  });

  test('require parameter has no default', () => {
    expect(result).not.toMatch(/require\s*=\s*require/);
    expect(result).toMatch(/moduleInitFunction\(require,/);
  });

  test('removes "use strict" directive', () => {
    expect(result).not.toContain('"use strict"');
  });

  test('converts every require() to await require()', () => {
    for (const mod of REQUIRED_MODULES) {
      expect(result).toMatch(
        new RegExp(`await require\\(['"]${mod.replace('.', '\\.')}['"]\\)`),
      );
    }
  });

  test('converts dynamic import() calls to await require()', () => {
    for (const mod of IMPORTED_MODULES) {
      expect(result).toMatch(
        new RegExp(`await require\\(['"]${mod.replace('.', '\\.')}['"]\\)`),
      );
    }
  });

  test('does not contain dynamic import() calls', () => {
    expect(result).not.toContain('import(');
  });

  test('returns module.exports', () => {
    expect(result).toMatch(/return module\.exports/);
  });
});
