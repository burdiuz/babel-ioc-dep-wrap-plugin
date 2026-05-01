import {
  isASTRequireCall,
  generateWrapperFn,
  isNestedRequire,
  validateNesting,
  convertImportDeclarationToStatements,
  insertHoistedRequires,
  makeYieldRequireExpression,
} from './utils.js';

export const wrapWithGeneratorFn = (
  async = true,
  { convertImports = true, hoistNestedRequires = true } = {},
) => {
  const wrapperFn = generateWrapperFn(true, async);

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
            insertHoistedRequires(fnDecl, state.iocPlugin.hoisted, makeYieldRequireExpression);
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
          convertImportDeclarationToStatements(path.node, makeYieldRequireExpression, getTempId),
        );
      },
      AwaitExpression(path) {
        // Strip await from await require() / await import() at the top level so the
        // CallExpression visitor can convert them to yield expressions.
        if (
          path.node.argument.type === 'CallExpression' &&
          isASTRequireCall(path.node.argument) &&
          !isNestedRequire(path)
        ) {
          path.replaceWith({ ...path.node.argument });
        }
      },
      CallExpression(path, state) {
        if (!isASTRequireCall(path.node)) return;

        const isDynamicImport = path.node.callee.type === 'Import';

        if (isNestedRequire(path)) {
          if (isDynamicImport) {
            // import() inside a nested function returns a Promise naturally; leave it.
            return;
          }
          if (hoistNestedRequires) {
            const varName = `_hoisted${state.iocPlugin.hoisted.length}`;
            state.iocPlugin.hoisted.push({ varName, args: path.node.arguments });
            path.replaceWith({ type: 'Identifier', name: varName });
          } else {
            validateNesting(path);
          }
          return;
        }

        path.replaceWith(makeYieldRequireExpression(path.node.arguments));
      },
    },
  });
};
