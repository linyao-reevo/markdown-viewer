// The rule that picks the active table of contents entry. The content script
// measures the page and passes the numbers in, so everything worth getting
// wrong is testable here.

var test = require('node:test')
var assert = require('node:assert')

var toc = require('../lib/toc.js')

// a document taller than the viewport, so the bottom of page rule stays out of
// the way of the tests that are about the scroll line
var TOPS = [0, 500, 1000, 1500]
var VIEW = 600
var PAGE = 4000

test('a document with no headings has no active entry', () => {
  assert.equal(toc.active([], 0, VIEW, PAGE), -1)
})

test('the first heading is active before anything has scrolled', () => {
  assert.equal(toc.active(TOPS, 0, VIEW, PAGE), 0)
})

test('the first heading stays active while the second is still below the line', () => {
  // second heading is at 500, the line sits at scroll + LINE
  assert.equal(toc.active(TOPS, 500 - toc.LINE - 1, VIEW, PAGE), 0)
})

test('the next heading takes over once it crosses the line', () => {
  assert.equal(toc.active(TOPS, 500 - toc.LINE, VIEW, PAGE), 1)
})

test('the active entry advances through the document', () => {
  assert.equal(toc.active(TOPS, 1000, VIEW, PAGE), 2)
  assert.equal(toc.active(TOPS, 1600, VIEW, PAGE), 3)
})

test('the bottom of the page activates the last heading', () => {
  // last heading is at 3900, only 100px from the end, so it never crosses the
  // line on its own
  var tops = [0, 500, 1000, 3900]
  assert.equal(toc.active(tops, PAGE - VIEW, VIEW, PAGE), 3)
})

test('a document shorter than the viewport activates the last heading', () => {
  assert.equal(toc.active([0, 100], 0, 600, 400), 1)
})
