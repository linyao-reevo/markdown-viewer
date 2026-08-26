var test = require('node:test')
var assert = require('node:assert')

var paths = require('../lib/paths.js')

test('segments splits a file url', () => {
  assert.deepEqual(
    paths.segments('file:///Users/you/notes/sub/a.md'),
    ['Users', 'you', 'notes', 'sub', 'a.md']
  )
})

test('segments decodes escaped characters', () => {
  assert.deepEqual(
    paths.segments('file:///Users/you/my%20notes/a%20b.md'),
    ['Users', 'you', 'my notes', 'a b.md']
  )
})

test('segments drops the query and the fragment', () => {
  assert.deepEqual(
    paths.segments('file:///notes/a.md#heading'),
    ['notes', 'a.md']
  )
})

test('segments keeps a windows drive letter', () => {
  assert.deepEqual(
    paths.segments('file:///C:/notes/a.md'),
    ['C:', 'notes', 'a.md']
  )
})

test('filename returns the last segment', () => {
  assert.equal(paths.filename('file:///notes/a.md'), 'a.md')
})

test('candidates resolves a file below the granted folder', () => {
  assert.deepEqual(
    paths.candidates(['Users', 'you', 'notes', 'sub', 'a.md'], 'notes'),
    [['sub', 'a.md']]
  )
})

test('candidates resolves a file directly in the granted folder', () => {
  assert.deepEqual(
    paths.candidates(['Users', 'you', 'notes', 'a.md'], 'notes'),
    [['a.md']]
  )
})

test('candidates returns the deepest occurrence first', () => {
  assert.deepEqual(
    paths.candidates(['notes', 'x', 'notes', 'a.md'], 'notes'),
    [['a.md'], ['x', 'notes', 'a.md']]
  )
})

test('candidates returns nothing when the folder is absent', () => {
  assert.deepEqual(
    paths.candidates(['Users', 'you', 'docs', 'a.md'], 'notes'),
    []
  )
})

test('candidates never treats the file itself as the folder', () => {
  assert.deepEqual(
    paths.candidates(['Users', 'notes'], 'notes'),
    []
  )
})
