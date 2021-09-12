import { readFileSync } from 'fs';
import babel from '@babel/core';

import { wrapWithGeneratorFunctionPlugin } from './babel-generator-plugin.js';
import { wrapWithAsyncFunctionPlugin } from './babel-async-plugin.js';

const content = readFileSync('test.js').toString();

const result = babel.transformSync(content, {
  plugins: [wrapWithGeneratorFunctionPlugin()],
  // plugins: [wrapWithAsyncFunctionPlugin(true)],
});

console.log(result.code);
