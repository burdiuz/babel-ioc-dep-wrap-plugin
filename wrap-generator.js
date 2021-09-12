import { isASTRequireCall, generateWrapperGn } from './utils.js';

export const wrapWithGeneratorFn = (async = true) => () => ({
  visitor: {
    Program: generateWrapperGn(true, async),
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
