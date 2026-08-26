
// Turning a file:// URL into a writable FileSystemFileHandle. Shared by the
// offscreen writer and the picker window.

var mdhandles = (() => {

  // walk a relative path below a granted directory handle
  var walk = async (dir, parts) => {
    var handle = dir
    try {
      for (var i = 0; i < parts.length - 1; i++) {
        handle = await handle.getDirectoryHandle(parts[i])
      }
      return await handle.getFileHandle(parts[parts.length - 1])
    }
    catch (err) {
      return null
    }
  }

  // a file handle picked for this exact url wins; otherwise look for the file
  // below one of the granted folders.
  //
  // Returns {handle, root, source} on success, or {reason, folders} explaining
  // why not, because "no write access" on its own tells the user nothing about
  // what to do next.
  var resolve = async (url) => {
    var picked = await mdidb.files.get(url)
    if (picked) {
      return {handle: picked.handle, root: picked.handle, source: 'file'}
    }

    var parts = mdpaths.segments(url)
    var dirs = await mdidb.dirs.list()

    for (var dir of dirs) {
      for (var relative of mdpaths.candidates(parts, dir.name)) {
        var handle = await walk(dir.handle, relative)
        if (handle) {
          return {handle, root: dir.handle, source: 'dir'}
        }
      }
    }

    return {
      reason: dirs.length ? 'notfound' : 'nogrants',
      folders: dirs.map((dir) => dir.name),
    }
  }

  var granted = async (handle) => {
    if (!handle || typeof handle.queryPermission !== 'function') {
      // a handle without queryPermission is treated as usable; the write will
      // fail loudly instead of silently doing nothing
      return true
    }
    return await handle.queryPermission({mode: 'readwrite'}) === 'granted'
  }

  return {walk, resolve, granted}
})()

if (typeof module !== 'undefined' && module.exports) {
  module.exports = mdhandles
}
