
// String passes over the compiled html. These used to assume a tag's first
// attribute was the one they were looking for, which stopped being true once
// edit mode started stamping data-md-line onto every top level block. They all
// tolerate any attribute order now.

var mdpost = (() => {

  // <h2 id="x"> or <h2 data-md-line="3,4" id="x">
  var HEADING = /<h([1-6])(?:\s[^>]*?)?\sid="([^"]*)"[^>]*>/

  var walk = (regex, string) => {
    var out = []
    var match
    while ((match = regex.exec(string)) !== null) {
      out.push(match)
      if (match.index === regex.lastIndex) {
        regex.lastIndex++
      }
    }
    return out
  }

  // mermaid reads diagrams from code.mermaid, so the language class the
  // compiler produced has to be rewritten
  var mermaid = (html) =>
    html.replace(
      /<code\s([^>]*)class="language-(?:mermaid|mmd)"/gi,
      (all, attrs) => '<code ' + attrs + 'class="mermaid"'
    )

  // the diagram definitions as the compiler left them. mermaid replaces the
  // content of each code.mermaid with an svg, so re-rendering needs the
  // original text back, and the html is the only place it still exists.
  var definitions = (html) =>
    walk(/<pre><code\s[^>]*class="mermaid">([\s\S]+?)<\/code><\/pre>/gi, html)
      .map((match) => match[1])

  // the clickable anchor icon beside every heading
  var anchors = (html) =>
    html.replace(new RegExp('(' + HEADING.source + ')', 'g'), (header, tag, level, id) =>
      tag +
      '<a class="anchor" name="' + id + '" href="#' + id + '">' +
      '<span class="octicon octicon-link"></span></a>'
    )

  var toc = (html) =>
    walk(new RegExp(HEADING.source + '(.*?)<\\/h[1-6]>', 'gs'), html)
      .map((match) => ({level: match[1], id: match[2], title: match[3]}))
      .reduce((toc, {id, title, level}) => toc +=
        '<div class="_ul">'.repeat(level) +
        '<a href="#' + id + '">' +
          title.replace(/<a[^>]+>/g, '').replace(/<\/a>/g, '') +
        '</a>' +
        '</div>'.repeat(level)
      , '')

  return {mermaid, definitions, anchors, toc}
})()

if (typeof module !== 'undefined' && module.exports) {
  module.exports = mdpost
}
