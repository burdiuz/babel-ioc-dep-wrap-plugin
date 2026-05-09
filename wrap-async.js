import {
  generateWrapperFn,
  isNestedRequire,
  validateNesting,
  convertImportDeclarationToStatements,
  insertHoistedRequires,
  makeAwaitRequireExpression,
} from './utils.js';

export const wrapWithAsyncFn = (
  globalRequire = false,
  { convertImports = true, hoistNestedRequires = true, requireName = 'require' } = {},
) => {
  const funcArg = globalRequire
    ? {
        type: 'AssignmentPattern',
        left: { type: 'Identifier', name: requireName },
        right: { type: 'Identifier', name: 'require' },
      }
    : { type: 'Identifier', name: requireName };

  // Bound maker so all generated calls use the configured name.
  const makeRequireExpr = (args) => makeAwaitRequireExpression(args, requireName);

  const wrapperFn = generateWrapperFn(false, true, [funcArg]);

  return () => ({
    visitor: {
      Program: {
        enter(path, state) {
          state.iocPlugin = { importCounter: 0, hoisted: [] };
          wrapperFn(path);
        },
        exit(path, state) {
          const fnDecl = path.node.body[0];
          if (fnDecl?.type === 'FunctionDeclaration') {
            insertHoistedRequires(fnDecl, state.iocPlugin.hoisted, makeRequireExpr);
          }
        },
      },
      ImportDeclaration(path, state) {
        if (!convertImports) {
          throw Error(
            'Import declarations aren\'t supported by "babel-ioc-dep-wrap-plugin". Please convert them to require() calls, or enable the convertImports option.',
          );
        }
        const getTempId = () => `_import${state.iocPlugin.importCounter++}`;
        path.replaceWithMultiple(
          convertImportDeclarationToStatements(path.node, makeRequireExpr, getTempId),
        );
      },
      CallExpression(path, state) {
        if (path.node.callee.name === 'require') {
          if (path.parent.type === 'AwaitExpression') {
            // Source already awaited this require() — rename the callee if needed, don't re-wrap.
            if (requireName !== 'require') {
              path.replaceWith({
                type: 'CallExpression',
                callee: { type: 'Identifier', name: requireName },
                arguments: path.node.arguments,
              });
            }
            return;
          }
          if (isNestedRequire(path)) {
            if (hoistNestedRequires) {
              const varName = `_hoisted${state.iocPlugin.hoisted.length}`;
              state.iocPlugin.hoisted.push({ varName, args: path.node.arguments });
              path.replaceWith({ type: 'Identifier', name: varName });
            } else {
              validateNesting(path);
            }
            return;
          }
          path.replaceWith({
            type: 'AwaitExpression',
            argument: {
              type: 'CallExpression',
              callee: { type: 'Identifier', name: requireName },
              arguments: path.node.arguments,
            },
          });
        } else if (path.node.callee.type === 'Import') {
          // Convert import() directly to await requireName() in one step so it is
          // not re-processed by the require() branch above. Nested import() is left
          // as-is since it returns a Promise natively.
          if (!isNestedRequire(path)) {
            path.replaceWith({
              type: 'AwaitExpression',
              argument: {
                type: 'CallExpression',
                callee: { type: 'Identifier', name: requireName },
                arguments: path.node.arguments,
              },
            });
          }
        }
      },
    },
  });
};

export default wrapWithAsyncFn;
