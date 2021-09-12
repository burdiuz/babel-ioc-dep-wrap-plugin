import {
  generateWrapperFn,
  importDeclarationFn,
  validateNesting,
} from './utils.js';

export const wrapWithAsyncFn = (globalRequire = false) => {
  const funcArg = globalRequire
    ? {
        type: 'AssignmentPattern',
        left: {
          type: 'Identifier',
          name: 'require',
        },
        right: {
          type: 'Identifier',
          name: 'require',
        },
      }
    : {
        type: 'Identifier',
        name: 'require',
      };

  return () => ({
    visitor: {
      Program: generateWrapperFn(false, true, [funcArg]),
      ImportDeclaration: importDeclarationFn,
      CallExpression(path) {
        if (
          path.node.callee.name === 'require' &&
          path.parent.type !== 'AwaitExpression'
        ) {
          // No need to validate for import() because it already returns Promise and being properly handled.
          validateNesting(path);

          path.replaceWith({
            type: 'AwaitExpression',
            argument: path.node,
          });
        } else if (path.node.callee.type === 'Import') {
          path.replaceWith({
            type: 'CallExpression',
            callee: {
              type: 'Identifier',
              name: 'require',
            },
            arguments: path.node.arguments,
          });
        }
      },
    },
  });
};

export default wrapWithAsyncFn;
