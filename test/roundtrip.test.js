// The property the whole feature rests on: editing a block and changing
// nothing must leave the document rendering exactly as it did before. This is
// what catches a Turndown setting that quietly rewrites markdown.

var test = require('node:test')
var assert = require('node:assert')

var mdit = require('markdown-it')
var TurndownService = require('turndown')
var gfm = require('turndown-plugin-gfm')

var blockmap = require('../lib/blockmap.js')
var lines = require('../lib/lines.js')

// the same settings content/edit.js configures Turndown with
var turndown = () => {
  var service = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
  })
  service.use(gfm.gfm)
  return service
}

// the tags content/edit.js opens as rich text rather than as source
var RICH = /^<(?:p|h[1-6]|ul|ol|blockquote|table|dl)[ >]/

var render = (markdown) => mdit({html: true, linkify: true}).render(markdown)

var mapped = (markdown) => {
  var html = mdit({html: true, linkify: true}).use(blockmap.markdownIt).render(markdown)
  return (html.match(/data-md-line="[^"]+"/g) || [])
    .map((attr) => attr.replace(/[^0-9,]/g, '').split(',').map(Number))
    .map((range) => lines.trimRange(markdown, range))
}

var DOC = [
  '# Heading One',
  '',
  'A paragraph with **bold**, *italic*, `code` and a [link](http://example.com).',
  '',
  '## Heading Two',
  '',
  '- first item',
  '- second item with **bold**',
  '- third item',
  '',
  '1. one',
  '2. two',
  '',
  '> a quoted line',
  '',
  '| name | value |',
  '| ---- | ----- |',
  '| a    | 1     |',
  '| b    | 2     |',
  '',
  'A closing paragraph.',
  '',
].join('\n')

var richBlocks = () =>
  mapped(DOC).filter((range) => RICH.test(render(lines.readBlock(DOC, range)).trim()))

test('the document has rich blocks to check', () => {
  assert.ok(richBlocks().length >= 6, 'expected several editable blocks')
})

test('a no-op edit of any rich block leaves the rendering identical', () => {
  var before = render(DOC)

  richBlocks().forEach((range) => {
    var source = lines.readBlock(DOC, range)
    var back = turndown().turndown(render(source)).trim()
    var after = render(lines.spliceBlock(DOC, range, back))

    assert.equal(after, before,
      'block at line ' + range[0] + ' did not survive the round trip\n' +
      '--- source ---\n' + source + '\n--- back ---\n' + back)
  })
})

test('a no-op edit leaves every other line byte identical', () => {
  richBlocks().forEach((range) => {
    var source = lines.readBlock(DOC, range)
    var back = turndown().turndown(render(source)).trim()
    var spliced = lines.spliceBlock(DOC, range, back)

    var original = lines.split(DOC)
    var edited = lines.split(spliced)

    // everything above the edited block is untouched
    assert.deepEqual(edited.slice(0, range[0]), original.slice(0, range[0]))

    // and so is everything below it, allowing for a change in block height
    var drift = edited.length - original.length
    assert.deepEqual(
      edited.slice(range[1] + drift),
      original.slice(range[1]),
      'lines after the block at ' + range[0] + ' were rewritten'
    )
  })
})

test('an actual edit changes only the block it was made in', () => {
  var range = mapped(DOC).find((candidate) =>
    lines.readBlock(DOC, candidate) === 'A closing paragraph.')

  assert.ok(range, 'expected to find the closing paragraph')

  var edited = lines.spliceBlock(DOC, range, 'A closing paragraph, revised.')
  var original = lines.split(DOC)
  var after = lines.split(edited)

  assert.equal(after.length, original.length)
  after.forEach((line, index) => {
    if (index === range[0]) {
      assert.equal(line, 'A closing paragraph, revised.')
    }
    else {
      assert.equal(line, original[index], 'line ' + index + ' was rewritten')
    }
  })
})
