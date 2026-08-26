# ToC On By Default, With Scroll Spy

Date: 2026-08-26

## Problem

Markdown Viewer already builds a table of contents. `mdpost.toc` in
`lib/postprocess.js` walks the compiled html for headings and returns a nested
list of links. `content/index.js` renders it as `#_toc` and `content/index.css`
pins it to a 300px fixed column on the left.

Two things keep it from being useful.

1. It is off. `background/storage.js` ships `content.toc: false`, so a new user
   never sees the sidebar unless they find the "Generate Table of Contents"
   toggle in the popup.
2. It does not track the reader. Every link looks the same no matter where the
   document is scrolled. In a long file the sidebar cannot answer "where am I".

## Scope

In scope:

- Ship the ToC on by default for new installs.
- Mark the section the reader is currently in, and keep that mark visible in the
  sidebar.

Out of scope:

- A show/hide button on the page. The popup toggle stays the only control.
- Moving the sidebar to the right. `body._toc-right` exists in the css but
  nothing sets it. It is left alone.
- Resizing the sidebar.
- Changing how the ToC html is built. `mdpost.toc` is unchanged.

## Default

`background/storage.js` sets `content.toc: true`.

Defaults are only read on a fresh install. An existing user has a stored
settings object and keeps `toc: false` until they toggle it themselves. This is
a new user change, not a migration. `README.md` is updated so the documented
default matches.

## Scroll spy

The work splits in two. The rule for picking the active heading is pure and
lives in `lib/`, where node can test it. The measuring and the class toggling
touch the DOM and live in `content/`.

### lib/toc.js

One function, no DOM:

```
mdtoc.active(tops, scroll, viewport, page) -> index
```

- `tops` are the document offsets of the headings, in order.
- `scroll` is the current scroll offset.
- `viewport` is the height of the visible area.
- `page` is the full scroll height of the document.

The rule:

- With no headings, return `-1`.
- If the page is scrolled to the bottom, return the last index. Without this the
  final heading can never become active when the last section is shorter than
  the viewport.
- Otherwise return the index of the last heading whose top is at or above the
  scroll line, where the scroll line sits a small distance below the top of the
  viewport so a heading counts as reached slightly before it touches the edge.
- Before the first heading is reached, return `0`. The first section is active
  from the top of the document.

The file follows the pattern the other `lib/` files use: an IIFE assigned to a
global, with a `module.exports` tail so node can require it.

### content/toc.js

Injected only when the ToC is on, alongside `/lib/toc.js`, after
`/content/scroll.js` in `background/inject.js`. The global is `tocspy`, so it
does not collide with the `mdtoc` the lib half defines.

`tocspy.attach()`:

- Reads the sidebar links from `#_toc a[href^="#"]` and finds each heading with
  `document.getElementById`. Lookup by id rather than by a css selector, because
  a heading id is user text and is not safe to interpolate into a selector.
- The fragment is used **as it is**, not decoded. `markdown-it-anchor` percent
  encodes the heading id, and `mdpost.toc` copies that id into the href
  untouched, so the raw fragment is already the literal id. Decoding first turns
  `#install-(v1.0)-50%25-%5Bdone%5D` into a string no element has, and every
  heading with punctuation silently drops out of the spy. A decoded lookup stays
  as a second attempt, for a compiler that stores an already unescaped id.
- Records each heading's document offset. Links whose heading is missing are
  dropped rather than left in place, so one bad entry cannot shift every entry
  after it.
- Does nothing when `state.raw` is set. The sidebar is hidden in raw mode.
- Is safe to call more than once. It tears down its previous listeners first.

On scroll, throttled with `requestAnimationFrame`:

- Ask `mdtoc.active` for the index.
- If it changed, remove `_active` from the previous link and add it to the new
  one.
- Then keep the active link visible: if the link sits above the top of the
  sidebar or below its bottom, adjust `#_toc.scrollTop` so it is in view. If the
  link is already visible the sidebar is not touched, so scrolling the sidebar by
  hand is not fought.

Heading offsets are re-measured on `resize`, and on every `attach`.

### Wiring

`content/index.js`:

- `update()` calls `tocspy.attach()` last, after the Prism, mermaid and MathJax
  passes are scheduled. Those passes change layout, so measuring before them
  would record stale offsets. `attach` is scheduled behind them with the same
  `setTimeout` style the surrounding calls use.
- The `#_toc` vnode gets an `onupdate` that re-attaches. Mithril can replace the
  trusted html on redraw, which throws away the `_active` class and the link
  elements the spy is holding.

Both call sites sit behind `if (state.content.toc)`, the way the mermaid and
MathJax calls sit behind their own flags, because the file is not injected when
the ToC is off.

## Styling

`content/index.css`, in the existing `/*toc*/` block:

- `--toc-active-fg` and `--toc-active-bg` defined for light and dark under
  `prefers-color-scheme`, matching how `--toc-delimiter` is already declared,
  with `._color-light` and `._color-dark` overrides for when the theme forces a
  mode.
- `#_toc ._ul a._active` sets the background, the color, and a bold weight.

`content/themes.css` gets `._theme-github` and `._theme-github-dark` overrides
for `a._active`, next to the existing per theme ToC rules.

## Testing

`test/toc.test.js` covers `mdtoc.active`:

- An empty list returns `-1`.
- Scroll at the top returns the first heading.
- The index advances as a heading crosses the scroll line, and not before.
- Scrolled to the bottom returns the last heading even when the last section is
  shorter than the viewport.

`test/postprocess.test.js` gains one case that pins the invariant the DOM half
depends on: the toc href equals the heading id byte for byte, the id really is
escaped, and decoding the fragment would break the lookup.

The DOM half is not covered by `node --test`. The repo has no browser harness
and adding a permanent one is out of scope. It was instead checked once against
real Chrome, with two throwaway pages that load the real `lib/toc.js`,
`content/toc.js` and `content/index.css` over compiled markdown and drive the
page over the DevTools protocol:

- the entry boundary, a punctuation heavy heading id, the bottom of page rule,
  raw mode clearing the highlight, and re-attach never leaving two entries lit;
- with a document long enough to overflow the sidebar: the sidebar scrolling to
  reveal a deep entry, and leaving the sidebar alone both while the section is
  unchanged and after the reader scrolls it by hand.

That run is what caught the fragment decoding bug described above.

## Risks

- Heading offsets are measured once per attach. A late layout shift that no
  resize event follows, such as a slow remote image, leaves the offsets stale
  and the highlight off by a section until the next resize. Accepted. The
  existing `scroll.js` load gate already waits on images, so this is a narrow
  case.
- Auto scrolling the sidebar supersedes the sidebar scroll position that
  `content/scroll.js` saves under the `md-toc-` key. On load the sidebar ends up
  showing the section the reader was last on rather than the exact sidebar
  offset they left. This is intended: the sidebar follows the document.
