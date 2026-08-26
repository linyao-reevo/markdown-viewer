
// In page editing. Every top level block carries the source line range it was
// compiled from, so a click can be mapped back to the markdown, edited, and
// spliced into the buffer without touching a single byte of any other block.

// toggling edit mode injects this file into a tab that may already have it, so
// the second run has to keep the first one's listeners and state
var mdedit = typeof mdedit !== 'undefined' ? mdedit : (() => {

  // blocks that survive a round trip through Turndown
  var RICH = /^(?:P|H1|H2|H3|H4|H5|H6|UL|OL|BLOCKQUOTE|TABLE|DL)$/

  // anything rendered from something Turndown cannot reproduce
  var OPAQUE = 'pre, svg, script, style, mjx-container, .mermaid, .katex'

  var edit = {
    active: null,   // {el, node, range, mode, before}
    blocks: [],
    dirty: false,
    history: [],
    pending: null,  // index of a block to enter once the next render lands
    bar: null,
    kind: 'clean',
    text: '',
  }

  var container = () => document.querySelector('#_html')

  var enabled = () =>
    !!state.edit &&
    !state.raw &&
    !!state.blockmap &&
    location.protocol === 'file:'

  /*-------------------------------------------------------------------------*/
  /* markdown out of html                                                    */

  var turndown = null

  var service = () => {
    if (turndown) {
      return turndown
    }

    turndown = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      fence: '```',
      emDelimiter: '*',
      strongDelimiter: '**',
      linkStyle: 'inlined',
    })

    if (typeof turndownPluginGfm !== 'undefined') {
      turndown.use(turndownPluginGfm.gfm)
    }

    // the heading anchor icon is injected by the viewer, not by the author
    turndown.addRule('viewerAnchor', {
      filter: (node) =>
        node.nodeName === 'A' && node.classList.contains('anchor'),
      replacement: () => '',
    })

    // emoji images carry their own shortname
    turndown.addRule('emoji', {
      filter: (node) =>
        node.nodeName === 'IMG' && node.classList.contains('emojione'),
      replacement: (content, node) => node.getAttribute('alt') || '',
    })

    return turndown
  }

  var toMarkdown = (el) => {
    var clone = el.cloneNode(true)
    clone.removeAttribute('data-md-line')
    clone.removeAttribute('contenteditable')
    clone.classList.remove('_md-block', '_md-editing')
    Array.from(clone.querySelectorAll('.anchor')).forEach((node) => node.remove())
    Array.from(clone.querySelectorAll('[contenteditable]'))
      .forEach((node) => node.removeAttribute('contenteditable'))

    return service().turndown(clone.outerHTML).trim()
  }

  /*-------------------------------------------------------------------------*/
  /* block map                                                               */

  // line ranges come from the compiler, which never saw the frontmatter
  var rangeOf = (el) => {
    var attr = el.getAttribute('data-md-line')
    if (!attr) {
      return null
    }
    var parts = attr.split(',').map(Number)
    if (parts.length !== 2 || parts.some(isNaN)) {
      return null
    }
    var offset = state.offset || 0
    return mdlines.trimRange(state.markdown, [parts[0] + offset, parts[1] + offset])
  }

  // find the top level blocks and make sure each one carries its range
  var stamp = () => {
    edit.blocks = []

    var root = container()
    if (!root) {
      return
    }

    if (state.blockmap === 'ordinal') {
      var kids = Array.from(root.children)
      // the ordinal map only holds while every top level element has exactly
      // one token behind it; if that is not true, refuse rather than guess
      if (!state.lines || state.lines.length !== kids.length) {
        return
      }
      kids.forEach((el, index) => {
        el.setAttribute('data-md-line', state.lines[index].join(','))
      })
      edit.blocks = kids
      return
    }

    // attrs: the marker may sit on a descendant, such as the <code> inside a
    // fenced block, so lift it to the top level element it belongs to
    Array.from(root.querySelectorAll('[data-md-line]')).forEach((el) => {
      var top = el
      while (top.parentElement && top.parentElement !== root) {
        top = top.parentElement
      }
      if (top.parentElement !== root || edit.blocks.indexOf(top) !== -1) {
        return
      }
      top.setAttribute('data-md-line', el.getAttribute('data-md-line'))
      edit.blocks.push(top)
    })
  }

  var rich = (el) =>
    RICH.test(el.tagName) && !el.querySelector(OPAQUE)

  /*-------------------------------------------------------------------------*/
  /* entering and leaving a block                                            */

  var enter = (el) => {
    var range = rangeOf(el)
    if (!range) {
      return
    }
    return rich(el) ? enterRich(el, range) : enterSource(el, range)
  }

  var enterRich = (el, range) => {
    // the anchor icon is viewer furniture, not content; hide it rather than
    // remove it so leaving the block without a change needs no re-render
    Array.from(el.querySelectorAll('.anchor'))
      .forEach((node) => (node.style.display = 'none'))

    edit.active = {
      el,
      node: el,
      range,
      mode: 'rich',
      before: mdlines.readBlock(state.markdown, range),
    }

    el.setAttribute('contenteditable', 'true')
    el.classList.add('_md-editing')
    el.focus()
    paint()
  }

  var enterSource = (el, range) => {
    var before = mdlines.readBlock(state.markdown, range)

    var area = document.createElement('textarea')
    area.className = '_md-source'
    area.value = before
    area.spellcheck = false

    var grow = () => {
      area.style.height = 'auto'
      area.style.height = (area.scrollHeight + 2) + 'px'
    }
    area.addEventListener('input', grow)

    el.replaceWith(area)
    grow()

    edit.active = {el, node: area, range, mode: 'source', before}

    area.focus()
    area.setSelectionRange(area.value.length, area.value.length)
    paint()
  }

  // returns true when the buffer changed
  var commit = (cancel) => {
    var active = edit.active
    if (!active) {
      return false
    }
    edit.active = null

    var after = cancel ? active.before
      : active.mode === 'source' ? active.node.value
      : toMarkdown(active.el)

    // put the dom back the way the renderer left it. Doing this here rather
    // than leaning on the next render matters, because an edit that produces
    // identical html produces no mithril update at all.
    if (active.mode === 'source') {
      active.node.replaceWith(active.el)
    }
    else {
      active.el.removeAttribute('contenteditable')
      active.el.classList.remove('_md-editing')
      Array.from(active.el.querySelectorAll('.anchor'))
        .forEach((node) => node.style.removeProperty('display'))
    }

    var changed = mdlines.normalise(after) !== mdlines.normalise(active.before)

    if (!changed) {
      paint()
      return false
    }

    // whole buffer snapshots, not ranges: a later edit elsewhere shifts the
    // line numbers an earlier range was recorded against
    edit.history.push(state.markdown)
    state.markdown = mdlines.spliceBlock(state.markdown, active.range, after)
    mark(true)

    rerender()
    return true
  }

  var undo = () => {
    if (!edit.history.length) {
      return
    }
    state.markdown = edit.history.pop()
    mark(edit.history.length > 0)
    rerender()
  }

  var rerender = () => {
    // makes content/index.js run its post render pass again, which restores
    // syntax highlighting, diagrams and the scroll position
    state.reload.md = true
    render(state.markdown)
  }

  var mark = (dirty) => {
    edit.dirty = dirty
    state.dirty = dirty
    status(dirty ? 'dirty' : 'clean', dirty ? 'Unsaved changes' : 'No changes')
  }

  /*-------------------------------------------------------------------------*/
  /* saving                                                                  */

  var save = (force) => {
    if (!enabled()) {
      return
    }

    status('saving', 'Saving…')

    chrome.runtime.sendMessage({
      message: 'edit.save',
      url: location.href,
      markdown: state.markdown,
      original: state.original,
      force: !!force,
    }, (res) => {
      if (chrome.runtime.lastError) {
        status('error', chrome.runtime.lastError.message)
        return
      }
      if (!res) {
        status('error', 'The extension did not answer')
        return
      }

      if (res.ok) {
        state.original = state.markdown
        // let autoreload reseed from disk instead of treating our own write as
        // an external change
        state.reload.current = ''
        edit.history = []
        mark(false)
        status('saved', 'Saved')
        return
      }

      status('error',
        res.error === 'cancelled' ? 'Not saved' :
        res.error === 'nohandle' ? 'No write access to this file' :
        res.error === 'permission' ? 'Write access was not granted' :
        res.error === 'mismatch' ? 'This file changed on disk since it was opened' :
        res.message || 'Could not write the file'
      )

      if (res.error === 'mismatch') {
        edit.kind = 'mismatch'
        paint()
      }
    })
  }

  /*-------------------------------------------------------------------------*/
  /* status bar                                                              */

  var status = (kind, text) => {
    edit.kind = kind
    edit.text = text
    paint()
  }

  var button = (action, label) => {
    var el = document.createElement('button')
    el.type = 'button'
    el.className = '_md-bar-button'
    el.setAttribute('data-action', action)
    el.textContent = label
    return el
  }

  var paint = () => {
    if (!enabled()) {
      if (edit.bar && edit.bar.isConnected) {
        edit.bar.remove()
      }
      return
    }

    if (!edit.bar) {
      edit.bar = document.createElement('div')
      edit.bar.id = '_md-bar'
      edit.bar.addEventListener('click', (e) => {
        var action = e.target.getAttribute && e.target.getAttribute('data-action')
        if (!action) {
          return
        }
        e.preventDefault()
        e.stopPropagation()
        if (action === 'save') {
          save(false)
        }
        else if (action === 'force') {
          save(true)
        }
        else if (action === 'reload') {
          location.reload()
        }
      })
    }

    if (!edit.bar.isConnected) {
      document.body.appendChild(edit.bar)
    }

    edit.bar.className = '_md-bar-' + edit.kind

    edit.bar.textContent = ''

    var text = document.createElement('span')
    text.className = '_md-bar-text'
    text.textContent = edit.text || (edit.dirty ? 'Unsaved changes' : 'No changes')
    edit.bar.appendChild(text)

    if (edit.kind === 'mismatch') {
      edit.bar.appendChild(button('reload', 'Reload'))
      edit.bar.appendChild(button('force', 'Overwrite'))
    }
    else {
      edit.bar.appendChild(button('save', 'Save'))
    }
  }

  /*-------------------------------------------------------------------------*/
  /* wiring                                                                  */

  // called by content/index.js after every render
  var attach = () => {
    if (!enabled()) {
      edit.blocks = []
      edit.active = null
      paint()
      return
    }

    stamp()
    edit.blocks.forEach((el) => el.classList.add('_md-block'))

    if (!edit.blocks.length) {
      status('error', 'This document cannot be mapped back to its source')
      return
    }

    if (edit.pending !== null) {
      var target = edit.blocks[edit.pending]
      edit.pending = null
      if (target) {
        enter(target)
        return
      }
    }

    paint()
  }

  document.addEventListener('click', (e) => {
    if (!enabled()) {
      return
    }
    if (edit.bar && edit.bar.contains(e.target)) {
      return
    }
    // clicks inside the block being edited place the caret, nothing more
    if (edit.active && edit.active.node && edit.active.node.contains(e.target)) {
      return
    }
    if (!e.target.closest) {
      return
    }
    // links stay clickable
    if (e.target.closest('a[href]')) {
      commit()
      return
    }

    var block = e.target.closest('._md-block')

    if (!block) {
      commit()
      return
    }

    var index = edit.blocks.indexOf(block)

    if (!commit()) {
      enter(block)
    }
    else if (index !== -1) {
      // the dom is about to be replaced, so pick the block up again by position
      edit.pending = index
    }
  }, true)

  document.addEventListener('keydown', (e) => {
    if (!enabled()) {
      return
    }
    var accel = e.metaKey || e.ctrlKey

    if (accel && e.key.toLowerCase() === 's') {
      e.preventDefault()
      commit()
      save(false)
    }
    else if (e.key === 'Escape' && edit.active) {
      e.preventDefault()
      commit(true)
    }
    else if (accel && e.key === 'Enter' && edit.active) {
      e.preventDefault()
      commit()
    }
    else if (accel && !e.shiftKey && e.key.toLowerCase() === 'z' && !edit.active) {
      e.preventDefault()
      undo()
    }
  }, true)

  window.addEventListener('beforeunload', (e) => {
    if (enabled() && (edit.dirty || edit.active)) {
      e.preventDefault()
      e.returnValue = ''
    }
  })

  return {attach, save, commit, dirty: () => edit.dirty}
})()
