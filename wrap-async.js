import { generateWrapperGn } from './utils.js';

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
      Program: generateWrapperGn(false, true, [funcArg]),
      CallExpression(path) {
        if (
          path.node.callee.name === 'require' &&
          path.parent.type !== 'AwaitExpression'
        ) {
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
