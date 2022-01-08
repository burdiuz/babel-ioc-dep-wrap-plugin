const MODULE_INIT_FN_NAME = 'moduleInitFunction';

export const isASTRequireCall = (node) =>
  node.callee.name === 'require' || node.callee.type === 'Import';

export const isNodeModuleWrapper = (node) =>
  node.type === 'FunctionDeclaration' && node.id.name === MODULE_INIT_FN_NAME;

export const validateNesting = (path) => {
  const parentFn = path.getFunctionParent();
  if (parentFn && !isNodeModuleWrapper(parentFn.node)) {
    console.log(path.parent);
    throw Error(
      'Sorry, "babel-ioc-dep-wrap-plugin" does not work with nested requires. All require() calls must be located at the top level of the module.',
    );
  }
};

const removeUseStrictDirective = (path) => {
  const indices = [];

  if (!path.node.directives) {
    return path;
  }

  path.node.directives = path.node.directives.forEach(
    ({ value: { value } = {} }, index) => {
      if (value.value === 'use strict') {
        indices.push(index);
      }
    },
  );

  indices.reverse();
  indices.forEach((i) => {
    path.node.directives.splice(i, 1);
  });

  return path;
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
              left: {
                type: 'Identifier',
                name: 'exports',
              },
              right: {
                type: 'ObjectExpression',
                properties: [],
              },
            },
          ],
          id: {
            type: 'Identifier',
            name: MODULE_INIT_FN_NAME,
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
          __moduleWrapper__: true,
        },
      ],
    });
  };

export const importDeclarationFn = () => {
  throw Error(
    'Import declarations aren\'t supported by "babel-ioc-dep-wrap-plugin", having import declarations wrapped into function results in broken code. Please, convert them into require() calls.',
  );
};
