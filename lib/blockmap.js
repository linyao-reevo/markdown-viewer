
// Source maps. Editing a block means knowing which source lines produced which
// rendered element, and only the compiler knows that. Each function here
// teaches one compiler to hand that information over.

var mdblockmap = (() => {

  // markdown-it: every block level token carries token.map, a half open line
  // range. Stamping it on the opening token of each top level block puts the
  // range on the element the token renders into.
  var markdownIt = (instance) => {
    instance.core.ruler.push('blockmap', (state) => {
      var level = 0
      state.tokens.forEach((token) => {
        if (level === 0 && token.map && token.nesting !== -1 && token.type !== 'inline') {
          token.attrSet('data-md-line', token.map[0] + ',' + token.map[1])
        }
        level += token.nesting
      })
    })
  }

  // remark: mdast nodes carry a position, and remark-html copies
  // data.hProperties onto the element it builds. Lines are one based and the
  // end line is inclusive, so both need shifting to a half open range.
  var remark = () => (tree) => {
    tree.children.forEach((node) => {
      if (!node.position) {
        return
      }
      var data = node.data || (node.data = {})
      var props = data.hProperties || (data.hProperties = {})
      props['data-md-line'] =
        (node.position.start.line - 1) + ',' + node.position.end.line
    })
  }

  // marked: no positions at all, but top level tokens carry their raw text and
  // map one to one onto the top level elements of the output. Each token is
  // located by searching for its raw text from where the previous one ended.
  // Adding up raw lengths instead would drift, because marked swallows link
  // reference definitions without emitting a token for them.
  //
  // Returns null when the mapping cannot hold.
  var marked = (tokens, source) => {
    var text = String(source).replace(/\r\n/g, '\n')

    var ranges = []
    var offset = 0
    var scanned = 0
    var line = 0

    // token offsets only ever grow, so counting newlines once is enough
    var lineAt = (target) => {
      while (scanned < target) {
        if (text.charCodeAt(scanned) === 10) {
          line++
        }
        scanned++
      }
      return line
    }

    for (var token of tokens) {
      // a raw html block can render into zero or many elements, which breaks
      // the one to one mapping the whole approach relies on
      if (token.type === 'html') {
        return null
      }

      var raw = token.raw.replace(/\r\n/g, '\n')
      var at = text.indexOf(raw, offset)
      if (at === -1) {
        return null
      }

      var start = lineAt(at)
      offset = at + raw.length

      var count = (raw.match(/\n/g) || []).length
      var end = /\n$/.test(raw) ? start + count : start + count + 1

      // these render into nothing at all
      if (token.type !== 'space' && token.type !== 'def') {
        ranges.push([start, end])
      }
    }

    return ranges
  }

  return {markdownIt, remark, marked}
})()

if (typeof module !== 'undefined' && module.exports) {
  module.exports = mdblockmap
}
