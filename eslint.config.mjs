// ESLint (flat config). Development only; the game never loads this file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';

// Screeps globals (constants, Game, Memory, prototypes) are read from @types/screeps.
function screepsGlobals() {
  const out = {};
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const dts = fs.readFileSync(path.join(dir, 'node_modules/@types/screeps/index.d.ts'), 'utf8');
    const re = /^declare (?:const|var|let|class|function|namespace) ([A-Za-z_$][\w$]*)/gm;
    let m;
    while ((m = re.exec(dts))) out[m[1]] = 'readonly';
  } catch {
    // typings not installed: no-undef will report every constant
  }
  out.Memory = 'writable';
  return out;
}

const commonGlobals = { console: 'readonly', module: 'writable', require: 'readonly', global: 'readonly' };

export default [
  { ignores: ['node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['*.js'],
    languageOptions: {
      ecmaVersion: 2017,
      sourceType: 'commonjs',
      globals: Object.assign({}, commonGlobals, screepsGlobals()),
    },
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: Object.assign({}, commonGlobals, screepsGlobals(), {
        describe: 'readonly', test: 'readonly', it: 'readonly', expect: 'readonly',
        beforeEach: 'readonly', afterEach: 'readonly', beforeAll: 'readonly', jest: 'readonly',
        process: 'readonly', __dirname: 'readonly',
      }),
    },
    rules: { 'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }] },
  },
];
