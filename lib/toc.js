
// Which table of contents entry the reader is currently on. Pure on purpose:
// the content script measures the page and toggles the class, this file only
// decides the index, so node can test the rule without a DOM.

var mdtoc = (() => {

  // a heading counts as reached slightly before it touches the top of the
  // viewport, otherwise the entry only lights up once the heading is already
  // scrolled out of sight
  var LINE = 80

  // tops    document offsets of the headings, in document order
  // scroll  current scroll offset
  // view    height of the visible area
  // page    full scroll height of the document
  var active = (tops, scroll, view, page) => {
    if (!tops.length) return -1

    // the last section is often shorter than the viewport, so its heading can
    // never cross the scroll line. at the bottom of the page it wins anyway.
    if (scroll + view >= page) return tops.length - 1

    var line = scroll + LINE
    var index = 0
    for (var i = 0; i < tops.length; i++) {
      if (tops[i] > line) break
      index = i
    }
    return index
  }

  return {active, LINE}
})()

if (typeof module !== 'undefined' && module.exports) {
  module.exports = mdtoc
}
