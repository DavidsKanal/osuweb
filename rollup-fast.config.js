// This file is a faster way to bundle the project, but will throw much less TypeScript errors. Good for repetetive iterative work, but not good for being 100% type-correct. It's for debug, basically.

import typescript from 'rollup-plugin-typescript';

export default [{
    input: './src/ts/index.ts',
    plugins: [
        typescript()
    ],
    output: {
        format: 'iife',
        file: './src/js/bundle.js',
        name: '', // Empty string here to create an unnamed IIFE
    }
},
{
    input: './src/ts/multithreading/worker.ts',
    plugins: [
        typescript()
    ],
    output: {
        format: 'iife',
        file: './src/js/worker_bundle.js',
        name: '', // Empty string here to create an unnamed IIFE
    }
}];