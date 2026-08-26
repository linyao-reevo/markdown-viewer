var test = require('node:test')
var assert = require('node:assert')

var mdit = require('markdown-it')
var {Marked} = require('marked')

var blockmap = require('../lib/blockmap.js')
var lines = require('../lib/lines.js')

var SOURCE = [
  '# Title',            // 0
  '',                   // 1
  'Some **bold** text.',// 2
  '',                   // 3
  '- one',              // 4
  '- two',              // 5
  '',                   // 6
  '```js',              // 7
  'var a = 1',          // 8
  '```',                // 9
  '',                   // 10
  '> quote',            // 11
  '',                   // 12
  '[ref]: http://x',    // 13
  '',                   // 14
  'Uses [ref].',        // 15
  '',                   // 16
].join('\n')

// the ranges a reader would write down by hand, after trimming
var EXPECTED = [
  [0, 1],   // heading
  [2, 3],   // paragraph
  [4, 6],   // list
  [7, 10],  // fenced code
  [11, 12], // blockquote
  [15, 16], // paragraph using the reference
]

var attrs = (html) =>
  (html.match(/data-md-line="[^"]+"/g) || [])
    .map((attr) => attr.replace(/[^0-9,]/g, '').split(',').map(Number))

var trimmed = (ranges) => ranges.map((range) => lines.trimRange(SOURCE, range))

/*---------------------------------------------------------------------------*/
/* markdown-it                                                               */

test('markdown-it stamps a range on every top level block', () => {
  var html = mdit({html: true}).use(blockmap.markdownIt).render(SOURCE)
  assert.deepEqual(trimmed(attrs(html)), EXPECTED)
})

test('markdown-it ranges read back the source of their block', () => {
  var html = mdit({html: true}).use(blockmap.markdownIt).render(SOURCE)

  var read = trimmed(attrs(html)).map((range) => lines.readBlock(SOURCE, range))

  assert.deepEqual(read, [
    '# Title',
    'Some **bold** text.',
    '- one\n- two',
    '```js\nvar a = 1\n```',
    '> quote',
    'Uses [ref].',
  ])
})

test('markdown-it does not stamp nested blocks', () => {
  var source = '> quote\n>\n> - a\n> - b\n'
  var html = mdit().use(blockmap.markdownIt).render(source)
  assert.equal(attrs(html).length, 1)
})

test('markdown-it ranges never overlap and stay in order', () => {
  var html = mdit({html: true}).use(blockmap.markdownIt).render(SOURCE)
  var ranges = trimmed(attrs(html))
  var total = lines.split(SOURCE).length

  ranges.reduce((previousEnd, [start, end]) => {
    assert.ok(start >= previousEnd, `${start} overlaps a block ending at ${previousEnd}`)
    assert.ok(end > start, `empty range at ${start}`)
    assert.ok(end <= total, `range past the end of the file at ${end}`)
    return end
  }, 0)
})

test('markdown-it adds nothing when the plugin is not used', () => {
  assert.equal(attrs(mdit().render(SOURCE)).length, 0)
})

/*---------------------------------------------------------------------------*/
/* marked                                                                    */

var marked = () => new Marked({gfm: true})

test('marked maps every rendered top level element', () => {
  var instance = marked()
  var ranges = blockmap.marked(instance.lexer(SOURCE), SOURCE)

  assert.deepEqual(trimmed(ranges), EXPECTED)
})

test('marked stays aligned across a link reference definition', () => {
  // the definition renders into nothing and marked emits no token for it, so
  // a naive walk over raw lengths lands the last paragraph on the wrong line
  var instance = marked()
  var ranges = trimmed(blockmap.marked(instance.lexer(SOURCE), SOURCE))

  assert.equal(lines.readBlock(SOURCE, ranges[ranges.length - 1]), 'Uses [ref].')
})

test('marked ranges never overlap and stay in order', () => {
  var ranges = trimmed(blockmap.marked(marked().lexer(SOURCE), SOURCE))
  var total = lines.split(SOURCE).length

  ranges.reduce((previousEnd, [start, end]) => {
    assert.ok(start >= previousEnd, `${start} overlaps a block ending at ${previousEnd}`)
    assert.ok(end > start, `empty range at ${start}`)
    assert.ok(end <= total, `range past the end of the file at ${end}`)
    return end
  }, 0)
})

test('marked refuses a document with a raw html block', () => {
  var source = '# Title\n\n<div>\n  <span>x</span>\n</div>\n\ntail\n'
  var instance = marked()

  assert.equal(blockmap.marked(instance.lexer(source), source), null)
})

test('marked handles crlf source', () => {
  var source = SOURCE.replace(/\n/g, '\r\n')
  var instance = marked()
  var ranges = blockmap.marked(instance.lexer(source), source)

  assert.deepEqual(ranges.map((range) => lines.trimRange(source, range)), EXPECTED)
})

/*---------------------------------------------------------------------------*/
/* remark                                                                    */

test('remark sets a half open range on every root child', () => {
  // remark-html is esm only, so the plugin is exercised against a hand built
  // tree instead; the shape is all this function depends on
  var tree = {
    children: [
      {type: 'heading', position: {start: {line: 1}, end: {line: 1}}},
      {type: 'paragraph', position: {start: {line: 3}, end: {line: 3}}},
      {type: 'list', position: {start: {line: 5}, end: {line: 6}}},
      {type: 'code', position: {start: {line: 8}, end: {line: 10}}},
    ],
  }

  blockmap.remark()(tree)

  assert.deepEqual(
    tree.children.map((node) => node.data.hProperties['data-md-line']),
    ['0,1', '2,3', '4,6', '7,10']
  )
})

test('remark keeps existing hProperties', () => {
  var tree = {
    children: [{
      type: 'heading',
      data: {hProperties: {id: 'title'}},
      position: {start: {line: 1}, end: {line: 1}},
    }],
  }

  blockmap.remark()(tree)

  assert.deepEqual(tree.children[0].data.hProperties, {
    id: 'title',
    'data-md-line': '0,1',
  })
})

test('remark skips a node without a position', () => {
  var tree = {children: [{type: 'paragraph'}]}
  blockmap.remark()(tree)
  assert.equal(tree.children[0].data, undefined)
})
