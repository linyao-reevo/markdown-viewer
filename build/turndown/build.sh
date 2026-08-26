#!/bin/bash

# set current working directory to directory of the shell script
cd "$(dirname "$0")"

# before
npm ci 2> /dev/null || npm i
mkdir -p tmp

# turndown.min.js
npx terser --compress --mangle -- node_modules/turndown/dist/turndown.js > tmp/turndown.min.js
npx terser --compress --mangle -- node_modules/turndown-plugin-gfm/dist/turndown-plugin-gfm.js > tmp/turndown-plugin-gfm.min.js

# copy
cp tmp/turndown.min.js ../../vendor/
cp tmp/turndown-plugin-gfm.min.js ../../vendor/

# after
rm -rf node_modules/ tmp/
