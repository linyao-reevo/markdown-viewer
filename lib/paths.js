
// file:// URL to path segments, and the relative paths a granted folder
// implies. A FileSystemDirectoryHandle exposes only its own name, never its
// absolute path, so a granted folder has to be located by matching its name
// against the segments of the file URL.

var mdpaths = (() => {

  var segments = (url) => {
    var pathname = typeof url === 'string' && /^file:/i.test(url)
      ? url.replace(/^file:\/\//i, '').replace(/[?#].*$/, '')
      : String(url).replace(/[?#].*$/, '')

    return pathname
      .split('/')
      .filter(Boolean)
      .map((segment) => {
        try {
          return decodeURIComponent(segment)
        }
        catch (err) {
          return segment
        }
      })
  }

  var filename = (url) => segments(url).slice(-1)[0] || ''

  // every relative path implied by a folder of that name appearing in the
  // segments, deepest occurrence first so the shortest relative path is tried
  // before the ambiguous longer ones
  var candidates = (parts, folder) => {
    var out = []
    // the last segment is the file itself, so a folder cannot sit there
    for (var i = parts.length - 2; i >= 0; i--) {
      if (parts[i] === folder) {
        out.push(parts.slice(i + 1))
      }
    }
    return out
  }

  return {segments, filename, candidates}
})()

if (typeof module !== 'undefined' && module.exports) {
  module.exports = mdpaths
}
