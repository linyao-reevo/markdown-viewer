
// Line level helpers shared by the content script, the offscreen writer and the
// unit tests. Loaded as a plain script in the browser, required in node.

var mdlines = (() => {

  // Same expression content/index.js uses to strip frontmatter before
  // compiling. Kept identical on purpose: the line offset it produces has to
  // match the text the compiler actually saw.
  var frontmatter = /^(?:-|\+){3}[\s\S]+?(?:-|\+){3}/

  var split = (text) => text.split('\n')

  var join = (lines) => lines.join('\n')

  // number of source lines content/index.js removes before compiling
  var frontmatterOffset = (markdown) => {
    var match = frontmatter.exec(markdown)
    return !match ? 0 : (match[0].match(/\n/g) || []).length
  }

  // replace the half open line range [start, end) with replacement text
  var spliceBlock = (markdown, [start, end], replacement) => {
    var lines = split(markdown)
    var from = Math.max(0, Math.min(start, lines.length))
    var to = Math.max(from, Math.min(end, lines.length))
    var body = replacement.replace(/\r/g, '').replace(/\n+$/, '')
    var insert = body === '' ? [] : split(body)
    return join(lines.slice(0, from).concat(insert, lines.slice(to)))
  }

  // compilers hand back ranges that swallow the blank line after a block.
  // Editing such a range would delete the separator and glue the block to the
  // next one, so shrink the range to the lines that actually hold content.
  var trimRange = (markdown, [start, end]) => {
    var lines = split(markdown)
    var to = Math.min(end, lines.length)
    while (to > start + 1 && /^\s*$/.test(lines[to - 1])) {
      to--
    }
    return [start, to]
  }

  var readBlock = (markdown, [start, end]) => {
    var lines = split(markdown)
    return join(lines.slice(Math.max(0, start), Math.max(0, end)))
  }

  // line ending style of a file on disk
  var eol = (text) => ({
    crlf: /\r\n/.test(text),
    trailing: /\n$/.test(text),
  })

  // reapply a line ending style to a buffer that uses \n internally
  var applyEol = (text, style) => {
    var out = text.replace(/\r\n/g, '\n')
    if (style.trailing && !/\n$/.test(out)) {
      out += '\n'
    }
    if (style.crlf) {
      out = out.replace(/\n/g, '\r\n')
    }
    return out
  }

  // comparison form: line endings and trailing whitespace carry no meaning
  // because innerText of a <pre> already normalises them
  var normalise = (text) => text.replace(/\r\n/g, '\n').replace(/\s+$/, '')

  return {
    split,
    join,
    frontmatterOffset,
    spliceBlock,
    trimRange,
    readBlock,
    eol,
    applyEol,
    normalise,
  }
})()

if (typeof module !== 'undefined' && module.exports) {
  module.exports = mdlines
}
