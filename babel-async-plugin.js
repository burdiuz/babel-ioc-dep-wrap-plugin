export const wrapWithAsyncFunctionPlugin = (globalRequire = false) => {
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
      Program(path) {
        const programBody = path.node.body;

        path.node.body = [
          {
            type: 'FunctionDeclaration',
            generator: false,
            async: true,
            params: [funcArg],
            id: {
              type: 'Identifier',
              name: 'initFunction',
            },
            body: {
              type: 'BlockStatement',
              body: [
                ...programBody,
                {
                  type: 'ReturnStatement',
                  argument: {
                    type: 'Identifier',
                    name: 'exports',
                  },
                },
              ],
            },
          },
        ];
      },
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

export default wrapWithAsyncFunctionPlugin;
