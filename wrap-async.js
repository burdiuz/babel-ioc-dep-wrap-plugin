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
  { convertImports = true, hoistNestedRequires = true } = {},
) => {
  const funcArg = globalRequire
    ? {
        type: 'AssignmentPattern',
        left: { type: 'Identifier', name: 'require' },
        right: { type: 'Identifier', name: 'require' },
      }
    : { type: 'Identifier', name: 'require' };

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
            insertHoistedRequires(fnDecl, state.iocPlugin.hoisted, makeAwaitRequireExpression);
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
          convertImportDeclarationToStatements(path.node, makeAwaitRequireExpression, getTempId),
        );
      },
      CallExpression(path, state) {
        if (
          path.node.callee.name === 'require' &&
          path.parent.type !== 'AwaitExpression'
        ) {
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
          path.replaceWith({ type: 'AwaitExpression', argument: path.node });
        } else if (path.node.callee.type === 'Import') {
          // Dynamic import() → require(); the resulting require() will be re-visited
          // and wrapped in await. Nested import() is left as-is (returns Promise natively).
          if (!isNestedRequire(path)) {
            path.replaceWith({
              type: 'CallExpression',
              callee: { type: 'Identifier', name: 'require' },
              arguments: path.node.arguments,
            });
          }
        }
      },
    },
  });
};

export default wrapWithAsyncFn;
