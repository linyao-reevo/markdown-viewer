
// Marks the table of contents entry for the section the reader is on, and keeps
// that entry in view. The rule for picking the entry lives in lib/toc.js. This
// file only measures the page and moves the class around.

var tocspy = (() => {

  // breathing room left above or below the entry when the sidebar is nudged
  var PAD = 20

  // sidebar links paired with the document offset of their heading
  var entries = []
  var index = -1
  var ticking = false
  var listening = false

  // mdpost.toc copies the heading id straight into the href, and markdown-it
  // anchor percent encodes that id, so the raw fragment is usually the literal
  // id and decoding it would break the match. the decoded form is only a
  // fallback, for a compiler that stores an id the browser had to unescape.
  // decoding is best effort: a bare % is not valid escaping and would throw.
  var heading = (href) => {
    var raw = href.slice(1)
    var found = document.getElementById(raw)
    if (found) return found
    try {
      return document.getElementById(decodeURIComponent(raw))
    }
    catch (err) {
      return null
    }
  }

  // heading offsets have to be read after prism, mermaid and mathjax have had
  // their pass, since all three change the height of the document
  var measure = () => {
    var toc = $('#_toc')
    entries = !toc ? [] : Array.from(toc.querySelectorAll('a[href^="#"]'))
      .map((link) => ({link, target: heading(link.getAttribute('href'))}))
      // a toc entry with no heading cannot be measured. it should not happen,
      // the toc is built from the same html, but a missing one must not shift
      // every entry after it.
      .filter(({target}) => target)
      .map(({link, target}) => ({
        link,
        top: target.getBoundingClientRect().top + window.pageYOffset,
      }))
  }

  // forget which entry was active. the class has to come off every link rather
  // than off entries[index], since re-measuring is exactly when that index
  // stops meaning anything.
  var reset = () => {
    entries.forEach(({link}) => link.classList.remove('_active'))
    index = -1
  }

  // scroll the sidebar only when the active entry is outside it. anything more
  // eager fights the reader scrolling the sidebar by hand.
  var reveal = (link) => {
    var toc = $('#_toc')
    if (!toc) return

    var box = toc.getBoundingClientRect()
    var rect = link.getBoundingClientRect()

    if (rect.top < box.top) {
      toc.scrollTop -= (box.top - rect.top) + PAD
    }
    else if (rect.bottom > box.bottom) {
      toc.scrollTop += (rect.bottom - box.bottom) + PAD
    }
  }

  var mark = () => {
    var next = mdtoc.active(
      entries.map((entry) => entry.top),
      window.pageYOffset,
      window.innerHeight,
      Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
    )
    if (next === index) return

    if (entries[index]) entries[index].link.classList.remove('_active')
    index = next
    if (!entries[index]) return

    entries[index].link.classList.add('_active')
    reveal(entries[index].link)
  }

  var onscroll = () => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(() => {
      ticking = false
      mark()
    })
  }

  var onresize = () => {
    reset()
    measure()
    mark()
  }

  // safe to call again. a redraw can rebuild the toc, so the links held here go
  // stale and the measurements with them.
  var attach = () => {
    reset()

    // the sidebar is hidden in raw mode. dropping the entries leaves mark() with
    // nothing to do until the rendered view comes back.
    if (state.raw || !$('#_toc')) {
      entries = []
      return
    }

    measure()
    mark()

    if (!listening) {
      listening = true
      window.addEventListener('scroll', onscroll)
      window.addEventListener('resize', onresize)
    }
  }

  return {attach}
})()
