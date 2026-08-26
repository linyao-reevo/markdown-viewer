// A stored settings object is used whole and never falls back to the defaults,
// so a changed default only reaches a fresh install. Anything that has to reach
// an existing one goes through md.storage.migrations, which runs on every load
// and therefore has to be safe to run twice.

var test = require('node:test')
var assert = require('node:assert')

var fs = require('node:fs')
var vm = require('node:vm')
var path = require('node:path')

// background/storage.js is a plain script that hangs itself off a global, not a
// module, so it is evaluated in a sandbox with the extension globals stubbed
var load = () => {
  var sandbox = {
    md: {},
    chrome: {runtime: {getURL: (file) => 'chrome-extension://id' + file}},
  }
  vm.createContext(sandbox)
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../background/storage.js'), 'utf8'), sandbox)
  return sandbox.md.storage
}

var storage = load()

// what an install that has been through every earlier migration looks like
var stored = () => ({
  theme: 'github',
  compiler: 'markdown-it',
  raw: false,
  edit: false,
  match: '\\.md$',
  header: null,
  icon: false,
  themes: {width: 'auto'},
  content: {
    autoreload: false,
    emoji: false,
    mathjax: false,
    mermaid: false,
    syntax: true,
    toc: false,
  },
  origins: {'file://': {header: true, path: true, match: '\\.md$'}},
  settings: {icon: 'default', theme: 'light'},
  custom: {theme: '', color: 'auto'},
  marked: {linkify: true},
  remark: {},
  'markdown-it': {abbr: false},
})

test('the toc is turned on for an install that predates the new default', () => {
  var state = stored()
  storage.migrations(state)

  assert.equal(state.content.toc, true)
})

test('turning the toc back off afterwards survives the next load', () => {
  var state = stored()
  storage.migrations(state)

  // the user decides they do not want it
  state.content.toc = false
  storage.migrations(state)

  assert.equal(state.content.toc, false, 'the migration ran a second time')
})

test('a fresh install is already on and is not migrated again', () => {
  var defaults = storage.defaults({'markdown-it': {defaults: {}}, marked: {defaults: {}}, remark: {defaults: {}}})

  assert.equal(defaults.content.toc, true)
  assert.equal(defaults.tocDefault, true, 'the marker is missing, so the migration would fire on a fresh install')
})

test('migrating does not disturb the other content options', () => {
  var state = stored()
  storage.migrations(state)

  assert.equal(state.content.syntax, true)
  assert.equal(state.content.emoji, false)
  assert.equal(state.content.mermaid, false)
  assert.equal(state.content.mathjax, false)
  assert.equal(state.content.autoreload, false)
})
