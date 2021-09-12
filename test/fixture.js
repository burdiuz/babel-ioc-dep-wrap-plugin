// import something from 'something';

const bestStuff = require('stuff');

export const someStuff = bestStuff.getStuff();
export const somethingEsle = something.doThing();

/**
 * Paste or drop some JavaScript here and explore
 * the syntax tree created by chosen parser.
 * You can use all the cool new features from ES6
 * and even more. Enjoy!
 */

require('init');

await import('init-async-import');

await require('init-async-require');

import('init-import');

const b = require('b.js');

const { c, d, e } = require('c.js');

let tips = [
  "Click on any AST node with a '+' to expand it",

  'Hovering over a node highlights the \
   corresponding location in the source code',

  'Shift click on an AST node to expand the whole subtree',
];

function printTips() {
  tips.forEach((tip, i) => console.log(`Tip ${i}:` + tip));
}
