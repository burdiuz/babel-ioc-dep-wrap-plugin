import { describe, test, expect } from '@jest/globals';
import {
  isASTRequireCall,
  isNodeModuleWrapper,
  makeAwaitRequireExpression,
  makeYieldRequireExpression,
  convertImportDeclarationToStatements,
} from './utils.js';

// ─── AST mock helpers ───────────────────────────────────────────────────────

const str = (value) => ({ type: 'StringLiteral', value });
const id = (name) => ({ type: 'Identifier', name });

const defaultSpec = (name) => ({ type: 'ImportDefaultSpecifier', local: id(name) });
const namedSpec = (imported, local = imported) => ({
  type: 'ImportSpecifier',
  imported: id(imported),
  local: id(local),
});
const nsSpec = (name) => ({ type: 'ImportNamespaceSpecifier', local: id(name) });
const importDecl = (source, specifiers = []) => ({ source: str(source), specifiers });

const mockRequireExpr = (args) => ({ type: 'MockExpr', args });
let tempCount = 0;
const getTempId = () => `_import${tempCount++}`;

// ─── isASTRequireCall ────────────────────────────────────────────────────────

describe('isASTRequireCall', () => {
  test('returns true for require() call node', () => {
    expect(isASTRequireCall({ callee: { name: 'require' } })).toBe(true);
  });

  test('returns true for dynamic import() call node', () => {
    expect(isASTRequireCall({ callee: { type: 'Import' } })).toBe(true);
  });

  test('returns false for other function calls', () => {
    expect(isASTRequireCall({ callee: { name: 'fetch' } })).toBe(false);
  });

  test('returns false for method calls', () => {
    expect(
      isASTRequireCall({ callee: { type: 'MemberExpression', name: undefined } }),
    ).toBe(false);
  });
});

// ─── isNodeModuleWrapper ─────────────────────────────────────────────────────

describe('isNodeModuleWrapper', () => {
  test('returns true for moduleInitFunction FunctionDeclaration', () => {
    expect(
      isNodeModuleWrapper({ type: 'FunctionDeclaration', id: { name: 'moduleInitFunction' } }),
    ).toBe(true);
  });

  test('returns false for different function name', () => {
    expect(
      isNodeModuleWrapper({ type: 'FunctionDeclaration', id: { name: 'someOtherFunction' } }),
    ).toBe(false);
  });

  test('returns false for non-function node type', () => {
    expect(
      isNodeModuleWrapper({ type: 'ArrowFunctionExpression', id: { name: 'moduleInitFunction' } }),
    ).toBe(false);
  });

  test('returns false for expression statement', () => {
    expect(isNodeModuleWrapper({ type: 'ExpressionStatement', id: null })).toBe(false);
  });
});

// ─── makeAwaitRequireExpression ──────────────────────────────────────────────

describe('makeAwaitRequireExpression', () => {
  test('returns an AwaitExpression node', () => {
    const node = makeAwaitRequireExpression([str('foo')]);
    expect(node.type).toBe('AwaitExpression');
  });

  test('wraps a CallExpression to require()', () => {
    const node = makeAwaitRequireExpression([str('foo')]);
    expect(node.argument.type).toBe('CallExpression');
    expect(node.argument.callee.name).toBe('require');
  });

  test('passes args through to the require() call', () => {
    const arg = str('my-module');
    const node = makeAwaitRequireExpression([arg]);
    expect(node.argument.arguments[0]).toBe(arg);
  });

  test('uses default callee name "require" when none provided', () => {
    const node = makeAwaitRequireExpression([str('foo')]);
    expect(node.argument.callee.name).toBe('require');
  });

  test('uses custom callee name when provided', () => {
    const node = makeAwaitRequireExpression([str('foo')], 'load');
    expect(node.argument.callee.name).toBe('load');
  });
});

// ─── makeYieldRequireExpression ──────────────────────────────────────────────

describe('makeYieldRequireExpression', () => {
  test('returns a YieldExpression node', () => {
    const node = makeYieldRequireExpression([str('foo')]);
    expect(node.type).toBe('YieldExpression');
    expect(node.delegate).toBe(false);
  });

  test('argument is an ObjectExpression with a require property', () => {
    const node = makeYieldRequireExpression([str('foo')]);
    expect(node.argument.type).toBe('ObjectExpression');
    expect(node.argument.properties[0].key.name).toBe('require');
  });

  test('passes args[0] as the require property value', () => {
    const arg = str('my-module');
    const node = makeYieldRequireExpression([arg]);
    expect(node.argument.properties[0].value).toBe(arg);
  });
});

// ─── convertImportDeclarationToStatements ────────────────────────────────────

describe('convertImportDeclarationToStatements', () => {
  beforeEach(() => {
    tempCount = 0;
  });

  test('side-effect import returns a single ExpressionStatement', () => {
    const nodes = convertImportDeclarationToStatements(
      importDecl('foo'),
      mockRequireExpr,
      getTempId,
    );
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('ExpressionStatement');
    expect(nodes[0].expression.type).toBe('MockExpr');
  });

  test('side-effect import passes source to require expression factory', () => {
    const nodes = convertImportDeclarationToStatements(
      importDecl('foo'),
      mockRequireExpr,
      getTempId,
    );
    expect(nodes[0].expression.args[0].value).toBe('foo');
  });

  test('namespace import returns a single VariableDeclaration', () => {
    const nodes = convertImportDeclarationToStatements(
      importDecl('foo', [nsSpec('ns')]),
      mockRequireExpr,
      getTempId,
    );
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('VariableDeclaration');
    expect(nodes[0].declarations[0].id.name).toBe('ns');
  });

  test('named imports return a VariableDeclaration with ObjectPattern', () => {
    const nodes = convertImportDeclarationToStatements(
      importDecl('foo', [namedSpec('a'), namedSpec('b')]),
      mockRequireExpr,
      getTempId,
    );
    expect(nodes).toHaveLength(1);
    expect(nodes[0].declarations[0].id.type).toBe('ObjectPattern');
    const keys = nodes[0].declarations[0].id.properties.map((p) => p.key.name);
    expect(keys).toEqual(['a', 'b']);
  });

  test('aliased named import has distinct key and value', () => {
    const nodes = convertImportDeclarationToStatements(
      importDecl('foo', [namedSpec('original', 'alias')]),
      mockRequireExpr,
      getTempId,
    );
    const prop = nodes[0].declarations[0].id.properties[0];
    expect(prop.key.name).toBe('original');
    expect(prop.value.name).toBe('alias');
    expect(prop.shorthand).toBe(false);
  });

  test('non-aliased named import has shorthand=true', () => {
    const nodes = convertImportDeclarationToStatements(
      importDecl('foo', [namedSpec('a')]),
      mockRequireExpr,
      getTempId,
    );
    const prop = nodes[0].declarations[0].id.properties[0];
    expect(prop.shorthand).toBe(true);
  });

  test('default import returns a VariableDeclaration with .default MemberExpression', () => {
    const nodes = convertImportDeclarationToStatements(
      importDecl('foo', [defaultSpec('foo')]),
      mockRequireExpr,
      getTempId,
    );
    expect(nodes).toHaveLength(1);
    const init = nodes[0].declarations[0].init;
    expect(init.type).toBe('MemberExpression');
    expect(init.property.name).toBe('default');
  });

  test('mixed import returns three declarations (temp, default, named)', () => {
    const nodes = convertImportDeclarationToStatements(
      importDecl('foo', [defaultSpec('foo'), namedSpec('a'), namedSpec('b')]),
      mockRequireExpr,
      getTempId,
    );
    expect(nodes).toHaveLength(3);
    // 1st: temp variable holding require result
    expect(nodes[0].declarations[0].id.name).toBe('_import0');
    // 2nd: default via .default
    expect(nodes[1].declarations[0].id.name).toBe('foo');
    expect(nodes[1].declarations[0].init.property.name).toBe('default');
    // 3rd: named destructure from temp
    expect(nodes[2].declarations[0].id.type).toBe('ObjectPattern');
  });

  test('mixed import calls getTempId once', () => {
    const calls = [];
    const trackingGetTempId = () => {
      const id = `_import${calls.length}`;
      calls.push(id);
      return id;
    };
    convertImportDeclarationToStatements(
      importDecl('foo', [defaultSpec('foo'), namedSpec('a')]),
      mockRequireExpr,
      trackingGetTempId,
    );
    expect(calls).toHaveLength(1);
  });

  test('non-mixed imports do not call getTempId', () => {
    let called = false;
    const guardGetTempId = () => {
      called = true;
      return '_import0';
    };
    convertImportDeclarationToStatements(
      importDecl('foo', [defaultSpec('foo')]),
      mockRequireExpr,
      guardGetTempId,
    );
    expect(called).toBe(false);
  });
});
