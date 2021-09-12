import { readFileSync } from 'fs';
import babel from '@babel/core';

import { wrapWithAsyncFn, wrapWithGeneratorFn } from '../index.js';

const content = readFileSync('./fixture.js').toString();
let result;

console.log('\n\n ------ Convert with Generator Wrapper Fn: async wrapper = TRUE');

result = babel.transformSync(content, {
  plugins: [wrapWithGeneratorFn(true)],
});

console.log(result.code);

console.log('\n\n ------ Convert with Generator Wrapper Fn: async wrapper = FALSE');

result = babel.transformSync(content, {
  plugins: [wrapWithGeneratorFn(false)],
});

console.log(result.code);

console.log('\n\n ------ Convert with Async Wrapper Fn: global require = TRUE');
result = babel.transformSync(content, {
  plugins: [wrapWithAsyncFn(true)],
});

console.log(result.code);

console.log('\n\n ------ Convert with Async Wrapper Fn: global require = FALSE');
result = babel.transformSync(content, {
  plugins: [wrapWithAsyncFn(false)],
});

console.log(result.code);
