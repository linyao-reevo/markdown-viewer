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
                               showDirectoryPicker()
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
- `marked`: `marked.Lexer.lex` gives top level tokens with `raw`. Each token is
  located by searching for its raw text from where the previous token ended,
  and the resulting ranges are stamped onto the top level children of the
  rendered container in document order. Adding up raw lengths instead would
  drift, because marked consumes link reference definitions without emitting a
  token for them — a silent one-block offset for everything that follows. If
  the range count and the element count disagree, edit mode is refused for that
  document rather than guessing.

Blocks that no compiler can attribute, such as raw HTML blocks, simply carry no
marker. They are not editable. That is the safe outcome. For `marked`, whose
mapping is positional, a raw HTML block refuses the whole document, because one
such block can render into any number of elements.

Three corrections are needed:

- **Frontmatter offset.** `content/index.js` strips frontmatter before
  compiling, which shifts every line number. `frontmatterOffset()` returns the
  number of stripped lines and the offset is added back to every range.
- **Trailing blank lines.** Compilers report a block's range with the blank
  line that follows it included. Splicing such a range would delete the
  separator and glue the block to the next one, so every range is shrunk to the
  lines that actually hold content before it is used.
- **Compiler support.** `markdown-it` (the default), `marked` and `remark` are
  supported. Any other compiler disables edit mode with a message naming it, as
  does the `mathjax` content option: the MathJax pass collapses multi line
  formulas into a placeholder before compiling, so every line number after one
  of them is wrong.

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
- Commit happens on clicking away or on `Ctrl/Cmd+Enter`. `Esc` abandons the
  block. On commit the DOM is restored explicitly rather than by waiting for
  the next render, because an edit that produces identical HTML produces no
  render at all.
- After a commit the whole document is re-rendered from the updated
  `state.markdown` through the existing `render()` path, so heading ids, the
  table of contents, link reference definitions and anchors all stay correct.
  Re-rendering on commit rather than on keystroke keeps this cheap.
- Turndown is configured to match markdown-it output: `-` bullets, ATX
  headings, fenced code, `*` emphasis. A commit with no change produces no diff.

A status bar is fixed to the bottom right. It shows `unsaved`, `saved`, or an
error, and carries a Save button. `Ctrl/Cmd+S` saves, `Ctrl/Cmd+Z` undoes the
last committed block. Undo keeps whole buffer snapshots rather than line
ranges, because an edit elsewhere shifts the lines an earlier range was
recorded against.

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
`picker/index.html` in a small extension window. Its primary action is
`showDirectoryPicker`, pre-labelled with the name of the folder the file sits
in, because one grant there covers every markdown file under it; the chosen
folder is rejected and forgotten again if it turns out not to contain the file.
A secondary action grants the single file and caches the handle under the file
URL. Either way, later saves are silent.

That secondary action uses `showOpenFilePicker` followed by
`requestPermission`, never `showSaveFilePicker`. A save picker truncates
whatever it is pointed at the moment it is confirmed, so offering it for the
file the page is showing empties that file. Two prompts is the price of not
destroying the document. The handle is stored before the permission prompt, so
a refusal can be retried as a plain permission request instead of starting
over.

The window is worded as a permission prompt rather than a save dialog, since
the write always goes to the file the page was loaded from.

**Never writing nothing over something.** Before any write, the content on disk
is checked, and an empty buffer over a non-empty file is refused unless the
user forces it. The check is against the file rather than against what the page
loaded, so it holds even when the buffer was emptied by a bug upstream rather
than by the user. Autoreload applies the same rule while edit mode is on, so a
file that momentarily reads as empty cannot blank the view.

**Lapsed permission.** Chrome drops handle permissions between browser sessions
unless the user granted persistent access. When `queryPermission` returns
anything but `granted`, the same window is opened to call `requestPermission`
behind a click, since that requires user activation.

## Files

New:

- `content/edit.js`, `content/edit.css` — in-page editing.
- `lib/lines.js`, `lib/paths.js`, `lib/blockmap.js` — the pure logic, shared by
  the page, the offscreen writer and the tests.
- `lib/idb.js`, `lib/handles.js` — handle storage and resolution, shared by the
  options page, the picker window and the offscreen writer.
- `background/fs.js` — offscreen lifecycle and picker window management.
- `offscreen/index.html`, `offscreen/index.js` — verification and writing.
- `picker/index.html`, `picker/index.js`, `picker/index.css` — picker and
  permission window.
- `options/folders.js` — Editable folders tab.
- `build/turndown/build.sh`, `build/turndown/package.json` — vendored Turndown.
- `package.json`, `test/` — the test runner and the unit tests.

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
| Compiler has no block map, or MathJax is on | Edit toggle disabled, reason shown in popup |
| Block map count disagrees with the DOM | Edit mode refused for that document |
| Not a `file://` URL | Edit toggle disabled, reason shown |
| No granted folder covers the path | Picker window opens; cancelling leaves the buffer dirty |
| Handle permission lapsed | Permission window opens behind a click |
| On-disk content differs from what was loaded | Write refused; Reload or Overwrite anyway |
| Buffer is empty and the file is not | Write refused, line count shown; Overwrite anyway |
| Write throws | Error surfaced in the status bar; buffer stays dirty |
| Tab closed while dirty | `beforeunload` warning |

## Testing

The repository has no test runner. The risky logic here is pure, so a small one
is added: `npm test`, which is `node --test` over `test/`, covering

- line splicing, including ranges at the start and end of a file and ranges
  that span a fenced block,
- range trimming, and the list edit that would otherwise eat the blank line
  before the next block,
- block map extraction against the real `markdown-it` and `marked`, including
  the link reference definition case and CRLF source,
- folder relative path resolution, including duplicate folder names and paths
  that do not resolve,
- line ending and trailing newline detection and reapplication,
- the round trip property: rendering a block, converting it back with the real
  Turndown configuration and splicing it in leaves the document rendering
  identical and every other line byte identical.

That last one is what catches a Turndown setting that quietly rewrites
markdown, so it is the test to keep green when the configuration is touched.

Everything that needs a browser — picker windows, permission prompts,
contenteditable behaviour — is covered by a manual checklist in the
implementation plan.

## Known limitation

Turndown normalises within an edited block. A `*` bullet may come back as `-`,
and a reference link may come back inline. Damage is confined to the block the
user actually touched; every other line in the file is byte identical. The
unsafe-block fallback and per-block undo are the mitigations. Dropping Turndown
in favour of a source textarea for every block would remove this entirely and
would not change any other part of the design.
