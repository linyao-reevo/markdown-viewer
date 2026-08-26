# Implementation Plan: Inline Markdown Editing

Spec: `docs/superpowers/specs/2026-08-26-inline-markdown-editing-design.md`

Each stage leaves the extension in a working state. Stages 1 to 3 are pure logic
with unit tests. Stages 4 onward touch the browser and end with the manual
checklist.

## Stage 1 — Test harness

- Add `package.json` at the repository root with a single `test` script running
  `node --test test/`. No dependencies.
- Add `test/` with one placeholder test so the runner is proven to work.
- Add `node_modules/` to `.gitignore` if not already covered.

Done when `npm test` runs and passes.

## Stage 2 — Pure editing logic

Add `content/lines.js`, loaded into the page alongside the other content
scripts and also `require`-able from tests through a small UMD-style footer that
matches how the rest of the repository exposes globals.

Functions:

- `splitLines(text)` and `joinLines(lines)`.
- `spliceBlock(markdown, [start, end], replacement)` — replace a half open line
  range, normalising the replacement's trailing newlines so no blank line is
  gained or lost.
- `frontmatterOffset(markdown)` — number of leading lines that
  `content/index.js` strips, so ranges can be shifted back.
- `eol(text)` — detect `\r\n` versus `\n` and whether the text ends in a
  newline; `applyEol(text, style)` to reapply.
- `normalise(text)` — strip `\r` and trailing blank lines, for content
  comparison.

Tests cover ranges at the first line, the last line, a range spanning a fenced
block, an empty replacement, a CRLF file, and a file with no trailing newline.

## Stage 3 — Folder resolution logic

Add `background/paths.js` with pure functions, tested without any browser API:

- `filePathFromUrl(url)` — decode a `file://` URL into path segments.
- `candidateRelativePaths(segments, folderName)` — every relative path implied
  by a folder of that name appearing in the segments, longest match first.

Tests cover a plain path, a folder name that appears twice, a folder name that
does not appear, URL encoded segments, and a file directly in the granted
folder.

## Stage 4 — Block maps in the compilers

- `background/compilers/markdown-it.js`: add a `blockmap` plugin that stamps
  `data-md-line` on nesting level 0 opening tokens that have `token.map`. Expose
  `blockmap: true` on the compiler.
- `background/compilers/remark.js`: add a plugin setting
  `data.hProperties['data-md-line']` on root children. Expose `blockmap: true`.
- `background/compilers/marked.js`: add `lines(markdown)` returning an ordered
  list of ranges from `Lexer.lex`, and expose `blockmap: 'ordinal'`.
- `background/messages.js`: the `markdown` handler accepts `{blockmap: true}`
  and returns `{html, lines, blockmap}` where `blockmap` is `false`, `true` or
  `'ordinal'`.

Verify by hand in the service worker console that a sample document produces
ranges that line up with its source.

## Stage 5 — Handle store and writer

- `background/fs.js`:
  - IndexedDB wrapper storing directory handles by name and file handles by
    file URL.
  - `resolve(url)` walking granted folders using `background/paths.js`.
  - `ensureOffscreen()` creating the offscreen document once.
  - `write({url, markdown, original})` delegating to the offscreen document.
- `offscreen/index.html` and `offscreen/index.js`: read the file, compare with
  `original` using `normalise`, refuse on mismatch unless `force` is set, then
  write with the original line ending style reapplied.
- `picker/index.html` and `picker/index.js`: a single button that calls
  `showSaveFilePicker` or `handle.requestPermission`, stores the result, and
  closes the window.
- `background/messages.js`: `edit.save`, `edit.folders.list`, `edit.folders.add`,
  `edit.folders.remove`.
- `background/index.js`: import `fs.js` and wire it into `messages`.
- `manifest.chrome.json`: add the `offscreen` permission and the new pages.

## Stage 6 — In-page editor

- Vendor Turndown: `build/turndown/package.json` pinning `turndown` and
  `turndown-plugin-gfm`, `build/turndown/build.sh` copying the UMD builds into
  `vendor/`, and a line in `build/package.sh`.
- `content/edit.js`:
  - stamp `data-md-line` for the ordinal case, refuse on count mismatch,
  - hover affordance and click to enter a block,
  - contenteditable for safe blocks, textarea for unsafe ones,
  - Turndown configured for markdown-it style output,
  - commit, splice, re-render, dirty tracking, per block undo,
  - status bar, `Ctrl/Cmd+S`, `beforeunload`.
- `content/edit.css`.
- `content/index.js`: keep `state.markdown` authoritative, carry the block map,
  apply the frontmatter offset, expose `render` to `edit.js`.
- `content/autoreload.js`: hold its last seen text on `state.reload.current` and
  skip polling while dirty.
- `background/inject.js`: inject `lines.js`, `turndown`, `edit.js` and
  `edit.css` when edit mode is on.

## Stage 7 — UI

- `background/storage.js`: `edit: false` default.
- `popup/index.js`: `edit` toggle beside `raw`, disabled with a reason when the
  compiler has no block map or the tab is not a `file://` URL.
- `options/index.html` and `options/index.js`: *Folders* nav entry.
- `options/folders.js`: list, add and remove granted folders.

## Stage 8 — Docs and release notes

- `README.md`: a section describing edit mode, the folder grant, and the
  limitations.
- `CHANGELOG.md`: an entry for the change.

## Outcome

All stages are implemented. Five things came out differently than planned:

1. The pure logic went to `lib/` rather than `content/` and `background/`,
   because the offscreen writer and the picker window need it too.
2. `marked`'s mapping had to change. Adding up `raw` lengths drifts, because
   marked consumes link reference definitions without emitting a token for
   them, which silently shifts every later block by one. Each token is now
   located by searching for its raw text from the previous token's end.
3. Compilers report a block's range with the following blank line included.
   Splicing that range deletes the separator and glues the block to the next
   one, so `trimRange` shrinks every range before it is used.
4. Undo keeps whole buffer snapshots, not line ranges. A later edit elsewhere
   shifts the lines an earlier range was recorded against.
5. Edit mode is refused while the `mathjax` content option is on. That pass
   collapses multi line formulas into a placeholder before compiling, so line
   numbers after one of them are wrong.

Two bugs were found and fixed during self review rather than in the browser:
committing an edit that produces identical HTML left the DOM unrestored,
because mithril does not diff trusted content that has not changed; and the
first `marked` implementation produced a plausible but wrong range for the last
block of any document containing a link reference definition.

`build/package.sh chrome` fails in this environment at the `themes` step, which
clones an external repository. That failure predates this work and is unrelated
to it. Every step before it, including the new `turndown` build, succeeds.

## Manual checklist

Load the unpacked extension from a `build/package.sh chrome` output and confirm:

1. A local `.md` file renders as before with edit mode off.
2. Turning edit mode on outlines blocks on hover.
3. Clicking a paragraph makes it editable; typing and blurring re-renders it.
4. Clicking a fenced code block gives a source textarea, not a rich editor.
5. A mermaid diagram is not editable as rich text.
6. `Ctrl/Cmd+S` with no granted folder opens the picker window; choosing the
   file saves it, and the file on disk contains the edit.
7. A second `Ctrl/Cmd+S` saves silently.
8. Granting the containing folder in Options makes a different `.md` file in
   that folder save without any picker.
9. Editing the file in another editor and then saving from the page is refused
   with the mismatch message.
10. A CRLF file saves without its line endings being rewritten.
11. Frontmatter survives a save byte for byte.
12. Closing the tab while dirty warns.
13. Autoreload does not fight the editor while dirty.
14. A remote `.md` URL shows the edit toggle disabled with a reason.
