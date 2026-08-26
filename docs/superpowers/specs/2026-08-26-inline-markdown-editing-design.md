# Inline Markdown Editing

Date: 2026-08-26

## Problem

Markdown Viewer renders a local `.md` file into a styled page. It is read only.
To change one sentence the user must leave the browser, open an editor, save, and
come back. This spec adds editing to the rendered page itself, and saves the
result back to the original file on disk.

## Scope

In scope:

- Editing a rendered `.md` file that was loaded from a `file://` URL in Chrome.
- Writing the edited text back to the same file on disk.

Out of scope:

- Remote `.md` URLs. There is no local file to write to. The Edit toggle is
  disabled and states the reason.
- Firefox. Firefox has no File System Access API. `manifest.firefox.json` is not
  changed and no edit code loads there.
- Editing the raw markdown view. Edit mode applies to the rendered view only.
- Creating new files, renaming files, or editing frontmatter through the UI.
  Frontmatter is preserved byte for byte.

## Constraints

Three browser rules shape the whole design.

1. A `file://` page has an opaque origin. Chrome refuses the File System Access
   API there. The picker cannot run in the content script.
2. An extension action popup is destroyed when a file dialog takes focus. The
   picker cannot run in the popup either. It has to run in a real extension
   window created with `chrome.windows.create`.
3. A service worker can be stopped at any time. A write started there can be cut
   in half. Writes run in an offscreen document instead.

## Architecture

```
file:// page                    service worker              offscreen document
------------                    --------------              ------------------
content/edit.js                 background/messages.js      offscreen/index.js
content/index.js                background/fs.js
  |                                   |                            |
  |  edit.save {markdown, url}        |                            |
  |----------------------------------->                            |
  |                                   |  fs.write {handle, text}   |
  |                                   |---------------------------->
  |                                   |                            | verify
  |                                   |                            | write
  |                                   |<----------------------------
  |<-----------------------------------                            |
  |  {ok} or {error, reason}          |
                                      |
                                      |  no handle for this path
                                      v
                               chrome.windows.create
                               picker/index.html
                               showSaveFilePicker()
```

### 1. Source mapping

Editing one block means knowing which source lines produced which rendered
element. The compiler is the only component that knows this.

Each compiler gains an optional `blockmap` capability. When present, `compile`
returns HTML in which every top level block element carries
`data-md-line="start,end"`, a half open line range into the markdown source.

- `markdown-it`: a core ruler plugin walks the token stream and calls
  `token.attrSet('data-md-line', ...)` on every opening token at nesting level 0
  that has a `token.map`. This is exact.
- `remark`: a plugin sets `node.data.hProperties['data-md-line']` on each child
  of the mdast root from `node.position`. `remark-html` copies the property
  through. This is exact.
- `marked`: `marked.Lexer.lex` gives top level tokens with `raw`. Accumulating
  `raw` lengths yields a line range per token. The ranges are returned as an
  ordered list and stamped onto the top level children of the rendered container
  in document order. If the two counts disagree, edit mode is refused for that
  document rather than guessing.

Blocks that no compiler can attribute, such as raw HTML blocks, simply carry no
marker. They are not editable. That is the safe outcome.

Two corrections are needed:

- **Frontmatter offset.** `content/index.js` strips frontmatter before
  compiling, which shifts every line number. `frontmatter()` returns the number
  of stripped lines and the offset is added back to every range.
- **Compiler support.** `markdown-it` (the default), `remark` and `marked` are
  supported. Any other compiler disables edit mode with a message naming it.

`state.markdown` in `content/index.js` becomes the single authoritative source
string. Rendered HTML is always derived from it and never the other way round.

### 2. In-page editing

An `edit` toggle sits in the popup next to `raw`, persisted in
`chrome.storage.sync` like `raw`. It is disabled when `raw` is on, when the
compiler has no `blockmap`, or when the page is not a `file://` URL.

With edit mode on:

- Hovering a block that has `data-md-line` outlines it and shows a pencil in the
  gutter. Clicking enters the block.
- **Safe blocks** — paragraph, heading, list, blockquote, table — become
  `contenteditable`. On commit, Turndown converts that element's HTML back to
  markdown and the result replaces exactly the source lines in its range.
- **Unsafe blocks** — fenced code, indented code, raw HTML, mermaid, MathJax,
  footnote definitions, link reference definitions — instead swap into a
  monospace textarea holding their verbatim source lines. This keeps Turndown
  from ever flattening a diagram into its rendered SVG.
- Commit happens on blur, on `Esc`, or on `Ctrl/Cmd+Enter`. `Esc` in a textarea
  cancels instead.
- After a commit the whole document is re-rendered from the updated
  `state.markdown` through the existing `render()` path, so heading ids, the
  table of contents, link reference definitions and anchors all stay correct.
  Re-rendering on commit rather than on keystroke keeps this cheap.
- Turndown is configured to match markdown-it output: `-` bullets, ATX
  headings, fenced code, `*` emphasis. A commit with no change produces no diff.

A status bar is fixed to the bottom right. It shows `unsaved`, `saved`, or an
error, and carries a Save button. `Ctrl/Cmd+S` saves. Each block keeps its
pre-edit source lines so a single block edit can be undone.

Autoreload is suspended while the buffer is dirty, and `beforeunload` warns on
unsaved changes.

### 3. Save path

**Folder grants.** A new Options tab, *Editable folders*, calls
`showDirectoryPicker({mode: 'readwrite'})` and stores the returned
`FileSystemDirectoryHandle` in IndexedDB on the extension origin. The tab lists
granted folders and can revoke them.

**Resolution.** A directory handle exposes only its own name, never its absolute
path. For `file:///Users/you/notes/sub/a.md` and a grant named `notes`, the
extension finds `notes` among the path segments, treats the remainder `sub/a.md`
as a relative path, and walks it with `getDirectoryHandle` and `getFileHandle`.
Every candidate position is tried, longest first.

**Verification.** Before the first write through a resolved handle, the file is
read and compared with the text the page originally loaded. A mismatch means
either the wrong file was resolved, because two folders share a name, or the
file changed on disk since it was loaded. Either way the write is refused and
the status bar offers *Reload* or *Overwrite anyway*. This check is what makes
suffix matching safe rather than a guess.

**Line endings.** The `<pre>` text a content script reads is newline normalised.
The on-disk file may use CRLF and may or may not end in a newline. Both traits
are detected from the file read during verification and reapplied on write, so
saving does not rewrite every line of a CRLF file.

**Writes** run in an offscreen document created with reason `BLOBS`, for the
lifetime reason given under Constraints.

**Fallback.** When no granted folder covers the path, the service worker opens
`picker/index.html` in a small extension window. A click there runs
`showSaveFilePicker` with the file's name suggested, and the resulting file
handle is cached under the file URL. Later saves of the same file are silent.

**Lapsed permission.** Chrome drops handle permissions between browser sessions
unless the user granted persistent access. When `queryPermission` returns
anything but `granted`, the same window is opened to call `requestPermission`
behind a click, since that requires user activation.

## Files

New:

- `content/edit.js`, `content/edit.css` — in-page editing.
- `background/fs.js` — handle store, folder resolution, offscreen lifecycle.
- `offscreen/index.html`, `offscreen/index.js` — verification and writing.
- `picker/index.html`, `picker/index.js` — picker and permission window.
- `options/folders.js` — Editable folders tab.
- `build/turndown/build.sh`, `build/turndown/package.json` — vendored Turndown.
- `test/` — unit tests for the pure logic.

Modified:

- `content/index.js` — authoritative source string, block map plumbing,
  frontmatter offset.
- `content/autoreload.js` — expose its last-seen text, pause while dirty.
- `background/messages.js` — `edit.save`, `edit.folders`, block map in the
  `markdown` response.
- `background/inject.js` — inject the edit script and stylesheet.
- `background/index.js` — import `fs.js`.
- `background/storage.js` — `edit` default.
- `background/compilers/{markdown-it,remark,marked}.js` — `blockmap`.
- `popup/index.js`, `options/index.html`, `options/index.js` — UI.
- `manifest.chrome.json` — `offscreen` permission, new web accessible
  resources.
- `build/package.sh` — build Turndown.
- `README.md`, `CHANGELOG.md`.

## Error handling

| Situation | Behaviour |
| --- | --- |
| Compiler has no block map | Edit toggle disabled, reason shown in popup |
| Block map count disagrees with the DOM | Edit mode refused for that document |
| Not a `file://` URL | Edit toggle disabled, reason shown |
| No granted folder covers the path | Picker window opens; cancelling leaves the buffer dirty |
| Handle permission lapsed | Permission window opens behind a click |
| On-disk content differs from what was loaded | Write refused; Reload or Overwrite anyway |
| Write throws | Error surfaced in the status bar; buffer stays dirty |
| Tab closed while dirty | `beforeunload` warning |

## Testing

The repository has no test runner. The risky logic here is pure, so a small one
is added: `node --test` over `test/`, covering

- line splicing, including ranges at the start and end of a file and ranges that
  span a fenced block,
- block map extraction with a frontmatter offset,
- folder relative path resolution, including duplicate folder names and paths
  that do not resolve,
- line ending and trailing newline detection and reapplication.

Everything that needs a browser — picker windows, permission prompts,
contenteditable behaviour, Turndown fidelity — is covered by a manual checklist
in the implementation plan.

## Known limitation

Turndown normalises within an edited block. A `*` bullet may come back as `-`,
and a reference link may come back inline. Damage is confined to the block the
user actually touched; every other line in the file is byte identical. The
unsafe-block fallback and per-block undo are the mitigations. Dropping Turndown
in favour of a source textarea for every block would remove this entirely and
would not change any other part of the design.
