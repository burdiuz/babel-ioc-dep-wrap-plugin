const MODULE_INIT_FN_NAME = 'moduleInitFunction';

export const isASTRequireCall = (node) =>
  node.callee.name === 'require' || node.callee.type === 'Import';

export const isNodeModuleWrapper = (node) =>
  node.type === 'FunctionDeclaration' && node.id.name === MODULE_INIT_FN_NAME;

export const isNestedRequire = (path) => {
  const parentFn = path.getFunctionParent();
  return !!(parentFn && !isNodeModuleWrapper(parentFn.node));
};

export const validateNesting = (path) => {
  if (isNestedRequire(path)) {
    throw Error(
      'Sorry, "babel-ioc-dep-wrap-plugin" does not work with nested requires. All require() calls must be located at the top level of the module.',
    );
  }
};

const removeUseStrictDirective = (path) => {
  if (!path.node.directives) {
    return path;
  }

  path.node.directives = path.node.directives.filter(
    ({ value: { value } = {} }) => value !== 'use strict',
  );

  return path;
};

export const makeAwaitRequireExpression = (args) => ({
  type: 'AwaitExpression',
  argument: {
    type: 'CallExpression',
    callee: { type: 'Identifier', name: 'require' },
    arguments: args,
  },
});

export const makeYieldRequireExpression = (args) => ({
  type: 'YieldExpression',
  delegate: false,
  argument: {
    type: 'ObjectExpression',
    properties: [
      {
        type: 'ObjectProperty',
        method: false,
        key: { type: 'Identifier', name: 'require' },
        computed: false,
        shorthand: false,
        value: args[0],
      },
    ],
  },
});

const makeVariableDeclaration = (id, init) => ({
  type: 'VariableDeclaration',
  kind: 'const',
  declarations: [{ type: 'VariableDeclarator', id, init }],
});

const makeMemberExpression = (object, propertyName) => ({
  type: 'MemberExpression',
  object,
  property: { type: 'Identifier', name: propertyName },
  computed: false,
  optional: false,
});

export const convertImportDeclarationToStatements = (node, makeRequireExpr, getTempId) => {
  const { source, specifiers } = node;
  const defaultSpec = specifiers.find((s) => s.type === 'ImportDefaultSpecifier');
  const namedSpecs = specifiers.filter((s) => s.type === 'ImportSpecifier');
  const nsSpec = specifiers.find((s) => s.type === 'ImportNamespaceSpecifier');

  // import 'foo'
  if (specifiers.length === 0) {
    return [{ type: 'ExpressionStatement', expression: makeRequireExpr([source]) }];
  }

  // import * as ns from 'foo'
  if (nsSpec) {
    return [
      makeVariableDeclaration(
        { type: 'Identifier', name: nsSpec.local.name },
        makeRequireExpr([source]),
      ),
    ];
  }

  const makeObjectPattern = (specs) => ({
    type: 'ObjectPattern',
    properties: specs.map((s) => ({
      type: 'ObjectProperty',
      method: false,
      computed: false,
      shorthand: s.imported.name === s.local.name,
      key: { type: 'Identifier', name: s.imported.name },
      value: { type: 'Identifier', name: s.local.name },
    })),
  });

  // import { a, b as c } from 'foo'
  if (!defaultSpec && namedSpecs.length > 0) {
    return [
      makeVariableDeclaration(makeObjectPattern(namedSpecs), makeRequireExpr([source])),
    ];
  }

  // import foo from 'foo'
  if (defaultSpec && namedSpecs.length === 0) {
    return [
      makeVariableDeclaration(
        { type: 'Identifier', name: defaultSpec.local.name },
        makeMemberExpression(makeRequireExpr([source]), 'default'),
      ),
    ];
  }

  // import foo, { a, b } from 'foo'  — needs temp variable
  const tempId = getTempId();
  const statements = [
    makeVariableDeclaration(
      { type: 'Identifier', name: tempId },
      makeRequireExpr([source]),
    ),
    makeVariableDeclaration(
      { type: 'Identifier', name: defaultSpec.local.name },
      makeMemberExpression({ type: 'Identifier', name: tempId }, 'default'),
    ),
  ];
  if (namedSpecs.length > 0) {
    statements.push(
      makeVariableDeclaration(
        makeObjectPattern(namedSpecs),
        { type: 'Identifier', name: tempId },
      ),
    );
  }
  return statements;
};

export const insertHoistedRequires = (wrapperFnNode, hoisted, makeRequireExpr) => {
  if (!hoisted.length) return;
  const decls = hoisted.map(({ varName, args }) =>
    makeVariableDeclaration({ type: 'Identifier', name: varName }, makeRequireExpr(args)),
  );
  // Insert after 'const module = { exports }' at index 0
  wrapperFnNode.body.body.splice(1, 0, ...decls);
};

export const generateWrapperFn =
  (generator, async = true, params = []) =>
  (path) => {
    if (isNodeModuleWrapper(path.node.body[0])) {
      return;
    }

    removeUseStrictDirective(path);

    const programBody = path.node.body;

    path.replaceWith({
      ...path.node,
      body: [
        {
          type: 'FunctionDeclaration',
          generator,
          async,
          params: [
            ...params,
            {
              type: 'AssignmentPattern',
              left: { type: 'Identifier', name: 'exports' },
              right: { type: 'ObjectExpression', properties: [] },
            },
          ],
          id: {
            type: 'Identifier',
            name: MODULE_INIT_FN_NAME,
          },
          body: {
            type: 'BlockStatement',
            body: [
              {
                /**
                 * TODO: alternatively, rewrite all `module.exports` references to `exports`
                 */
                type: 'VariableDeclaration',
                declarations: [
                  {
                    type: 'VariableDeclarator',
                    id: { type: 'Identifier', name: 'module' },
                    init: {
                      type: 'ObjectExpression',
                      properties: [
                        {
                          type: 'ObjectProperty',
                          method: false,
                          computed: false,
                          shorthand: false,
                          key: { type: 'Identifier', name: 'exports' },
                          value: { type: 'Identifier', name: 'exports' },
                        },
                      ],
                    },
                  },
                ],
                kind: 'const',
              },
              ...programBody,
              {
                type: 'ReturnStatement',
                argument: {
                  type: 'MemberExpression',
                  object: { type: 'Identifier', name: 'module' },
                  property: { type: 'Identifier', name: 'exports' },
                  computed: false,
                  optional: false,
                },
              },
            ],
          },
          __moduleWrapper__: true,
        },
      ],
    });
  };
