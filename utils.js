export const isASTRequireCall = (node) =>
  node.callee.name === 'require' || node.callee.type === 'Import';

export const generateWrapperGn = (generator, async = true, params = []) => (path) => {
    const programBody = path.node.body;

    path.node.body = [
      {
        type: 'FunctionDeclaration',
        generator,
        async,
        params,
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
  };