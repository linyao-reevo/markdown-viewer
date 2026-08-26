var test = require('node:test')
var assert = require('node:assert')

var lines = require('../lib/lines.js')

test('spliceBlock replaces the first line', () => {
  assert.equal(
    lines.spliceBlock('a\n\nb\n', [0, 1], 'z'),
    'z\n\nb\n'
  )
})

test('spliceBlock replaces the last line', () => {
  assert.equal(
    lines.spliceBlock('a\n\nb', [2, 3], 'z'),
    'a\n\nz'
  )
})

test('spliceBlock replaces a multi line range', () => {
  assert.equal(
    lines.spliceBlock('a\nb\nc\nd', [1, 3], 'x\ny'),
    'a\nx\ny\nd'
  )
})

test('spliceBlock spans a fenced block', () => {
  var md = [
    '# title',
    '',
    '```js',
    'var a = 1',
    '```',
    '',
    'tail',
  ].join('\n')

  assert.equal(
    lines.spliceBlock(md, [2, 5], '```js\nvar b = 2\n```'),
    ['# title', '', '```js', 'var b = 2', '```', '', 'tail'].join('\n')
  )
})

test('spliceBlock drops the lines when the replacement is empty', () => {
  assert.equal(
    lines.spliceBlock('a\n\nb\n', [2, 3], ''),
    'a\n\n'
  )
})

test('spliceBlock ignores trailing newlines in the replacement', () => {
  assert.equal(
    lines.spliceBlock('a\n\nb\n', [0, 1], 'z\n\n\n'),
    'z\n\nb\n'
  )
})

test('spliceBlock clamps a range past the end of the file', () => {
  assert.equal(
    lines.spliceBlock('a\nb', [1, 99], 'z'),
    'a\nz'
  )
})

test('trimRange drops the blank line a compiler swallowed', () => {
  // markdown-it reports [4,7) for this list, which includes the separator
  var md = ['a', '', 'b', '', '- one', '- two', '', 'tail'].join('\n')
  assert.deepEqual(lines.trimRange(md, [4, 7]), [4, 6])
})

test('trimRange leaves a tight range alone', () => {
  assert.deepEqual(lines.trimRange('a\nb\nc', [0, 2]), [0, 2])
})

test('trimRange keeps at least one line', () => {
  assert.deepEqual(lines.trimRange('a\n\n\n', [1, 4]), [1, 2])
})

test('trimming stops a list edit from eating the blank before the next block', () => {
  var md = ['- one', '- two', '', '```js', 'x', '```'].join('\n')
  var range = lines.trimRange(md, [0, 3])

  assert.equal(
    lines.spliceBlock(md, range, '- one\n- two\n- three'),
    ['- one', '- two', '- three', '', '```js', 'x', '```'].join('\n')
  )
})

test('readBlock returns the source of a range', () => {
  assert.equal(
    lines.readBlock('a\nb\nc\nd', [1, 3]),
    'b\nc'
  )
})

test('frontmatterOffset counts the stripped yaml lines', () => {
  var md = '---\ntitle: x\n---\n\n# H\n'
  assert.equal(lines.frontmatterOffset(md), 2)
  // the offset has to land the heading on the same line as the stripped text
  var stripped = md.replace(/^(?:-|\+){3}[\s\S]+?(?:-|\+){3}/, '')
  assert.equal(lines.split(stripped)[2], '# H')
  assert.equal(lines.split(md)[2 + lines.frontmatterOffset(md)], '# H')
})

test('frontmatterOffset counts the stripped toml lines', () => {
  assert.equal(lines.frontmatterOffset('+++\ntitle = "x"\n+++\n\n# H\n'), 2)
})

test('frontmatterOffset is zero without frontmatter', () => {
  assert.equal(lines.frontmatterOffset('# H\n\ntext\n'), 0)
})

test('eol detects crlf and a trailing newline', () => {
  assert.deepEqual(lines.eol('a\r\nb\r\n'), {crlf: true, trailing: true})
  assert.deepEqual(lines.eol('a\nb'), {crlf: false, trailing: false})
})

test('applyEol restores crlf and the trailing newline', () => {
  assert.equal(
    lines.applyEol('a\nb', {crlf: true, trailing: true}),
    'a\r\nb\r\n'
  )
})

test('applyEol leaves a plain buffer alone', () => {
  assert.equal(
    lines.applyEol('a\nb\n', {crlf: false, trailing: true}),
    'a\nb\n'
  )
})

test('applyEol never removes a trailing newline', () => {
  assert.equal(
    lines.applyEol('a\nb\n', {crlf: false, trailing: false}),
    'a\nb\n'
  )
})

test('normalise ignores line endings and trailing whitespace', () => {
  assert.equal(lines.normalise('a\r\nb\r\n\n'), lines.normalise('a\nb'))
})

test('emptied catches a blank write over real content', () => {
  assert.equal(lines.emptied('', 'a\nb\n'), true)
  assert.equal(lines.emptied('   \n\n', 'a\nb\n'), true)
  assert.equal(lines.emptied(undefined, 'a\nb\n'), true)
})

test('emptied allows an ordinary write', () => {
  assert.equal(lines.emptied('a\nb\n', 'a\n'), false)
  assert.equal(lines.emptied('a', 'a\nb\nc\n'), false)
})

test('emptied allows writing nothing over nothing', () => {
  assert.equal(lines.emptied('', ''), false)
  assert.equal(lines.emptied('', '\n\n  \n'), false)
  assert.equal(lines.emptied('', undefined), false)
})
