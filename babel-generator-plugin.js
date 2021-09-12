const isASTRequireCall = (node) =>
  node.callee.name === 'require' || node.callee.type === 'Import';

export const wrapWithGeneratorFunctionPlugin = () => () => ({
  visitor: {
    Program(path) {
      const programBody = path.node.body;

      path.node.body = [
        {
          type: 'FunctionDeclaration',
          generator: true,
          async: true,
          params: [],
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
    AwaitExpression(path) {
      if (
        path.node.argument.type === 'CallExpression' &&
        isASTRequireCall(path.node.argument)
      ) {
        path.replaceWith({ ...path.node.argument });
      }
    },
    CallExpression(path) {
      if (isASTRequireCall(path.node)) {
        path.replaceWith({
          type: 'YieldExpression',
          delegate: false,
          argument: {
            type: 'ObjectExpression',
            properties: [
              {
                type: 'ObjectProperty',
                method: false,
                key: {
                  type: 'Identifier',
                  name: 'require',
                },
                computed: false,
                shorthand: false,
                value: path.node.arguments[0],
              },
            ],
          },
        });
      }
    },
  },
});
