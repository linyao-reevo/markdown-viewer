// These passes are string surgery over compiled html. Edit mode adds a
// data-md-line attribute to every top level block, which is exactly the kind of
// change that used to break them, so each one is checked against real compiler
// output both with and without the block map.

var test = require('node:test')
var assert = require('node:assert')

var mdit = require('markdown-it')
var anchor = require('markdown-it-anchor')

var blockmap = require('../lib/blockmap.js')
var post = require('../lib/postprocess.js')

var SOURCE = [
  '# Title',
  '',
  'text',
  '',
  '## Sub Heading',
  '',
  '```mermaid',
  'graph TD;',
  '  A-->B;',
  '```',
  '',
  '```js',
  'var a = 1',
  '```',
  '',
].join('\n')

var render = (mapped) => {
  var instance = mdit({html: true}).use(anchor)
  if (mapped) {
    instance.use(blockmap.markdownIt)
  }
  return instance.render(SOURCE)
}

// run every case twice: plain, and the way edit mode compiles it
var both = (name, check) => {
  test(name + ' (plain)', () => check(render(false), false))
  test(name + ' (with block map)', () => check(render(true), true))
}

both('the block map only shows up when asked for', (html, mapped) => {
  assert.equal(/data-md-line/.test(html), mapped)
})

both('mermaid fences are rewritten to code.mermaid', (html) => {
  var out = post.mermaid(html)

  assert.ok(/<code[^>]*class="mermaid"/.test(out), 'mermaid class not applied')
  assert.ok(!/language-mermaid/.test(out), 'language class left behind')
})

both('other languages are left alone', (html) => {
  assert.ok(/class="language-js"/.test(post.mermaid(html)))
})

both('the mermaid attributes survive the rewrite', (html, mapped) => {
  var out = post.mermaid(html)
  assert.equal(/<code data-md-line="[^"]+" class="mermaid"/.test(out), mapped)
})

both('diagram definitions can be read back', (html) => {
  var definitions = post.definitions(post.mermaid(html))

  assert.equal(definitions.length, 1)
  assert.equal(definitions[0], 'graph TD;\n  A--&gt;B;\n')
})

both('an anchor is added to every heading', (html) => {
  var out = post.anchors(html)
  var found = out.match(/<a class="anchor" name="([^"]+)"/g) || []

  assert.equal(found.length, 2)
  assert.ok(/name="title"/.test(out), 'missing the title anchor')
  assert.ok(/name="sub-heading"/.test(out), 'missing the sub heading anchor')
})

both('the anchor goes inside the heading it belongs to', (html) => {
  var out = post.anchors(html)
  assert.ok(
    /<h1[^>]*>\s*<a class="anchor" name="title"/.test(out),
    'anchor not placed directly after the opening tag'
  )
})

both('the table of contents lists every heading', (html) => {
  var toc = post.toc(html)

  assert.ok(/href="#title"/.test(toc), 'title missing from the toc')
  assert.ok(/href="#sub-heading"/.test(toc), 'sub heading missing from the toc')
  assert.ok(/>Title</.test(toc), 'title text missing')
  assert.ok(/>Sub Heading</.test(toc), 'sub heading text missing')
})

both('the toc nests by heading level', (html) => {
  var toc = post.toc(html)
  var levels = (toc.match(/<div class="_ul">/g) || []).length

  // one wrapper per level, for an h1 and an h2
  assert.equal(levels, 3)
})

test('the toc is empty for a document with no headings', () => {
  assert.equal(post.toc(mdit().render('just text\n')), '')
})

// content/toc.js pairs a toc entry with its heading by looking the fragment up
// with getElementById. markdown-it anchor percent encodes the id, and post.toc
// copies that id into the href untouched, so the two match byte for byte and
// the fragment must not be decoded first.
test('the toc href is the heading id verbatim, escaping and all', () => {
  var html = mdit({html: true}).use(anchor).render('## Install (v1.0) 50% [done]\n')

  var id = /<h2[^>]*\sid="([^"]*)"/.exec(html)[1]
  var href = /href="#([^"]*)"/.exec(post.toc(html))[1]

  assert.equal(href, id)
  assert.ok(/%/.test(id), 'expected the compiler to escape this id: ' + id)
  assert.notEqual(decodeURIComponent(href), id, 'decoding the fragment would break the lookup')
})

test('mermaid rewriting is a no-op when there are no diagrams', () => {
  var html = mdit().render('# T\n\n```js\nvar a = 1\n```\n')
  assert.equal(post.mermaid(html), html)
})

test('definitions returns nothing when there are no diagrams', () => {
  assert.deepEqual(post.definitions(mdit().render('# T\n')), [])
})
