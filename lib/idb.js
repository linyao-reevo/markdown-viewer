
// File System Access handles are structured cloneable, so they survive in
// IndexedDB. The database lives on the extension origin and is shared by the
// options page, the picker window and the offscreen writer.

var mdidb = (() => {

  var NAME = 'markdown-viewer-fs'
  var VERSION = 1

  var db = null

  var open = () => db ? Promise.resolve(db) : new Promise((resolve, reject) => {
    var request = indexedDB.open(NAME, VERSION)
    request.onupgradeneeded = () => {
      var upgrade = request.result
      if (!upgrade.objectStoreNames.contains('dirs')) {
        upgrade.createObjectStore('dirs', {keyPath: 'id', autoIncrement: true})
      }
      if (!upgrade.objectStoreNames.contains('files')) {
        upgrade.createObjectStore('files', {keyPath: 'url'})
      }
    }
    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }
    request.onerror = () => reject(request.error)
  })

  var run = (store, mode, action) => open().then((db) => new Promise((resolve, reject) => {
    var tx = db.transaction(store, mode)
    var request = action(tx.objectStore(store))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }))

  return {
    dirs: {
      list: () => run('dirs', 'readonly', (s) => s.getAll()),
      add: (handle) => run('dirs', 'readwrite', (s) =>
        s.add({name: handle.name, handle})),
      remove: (id) => run('dirs', 'readwrite', (s) => s.delete(id)),
    },
    files: {
      get: (url) => run('files', 'readonly', (s) => s.get(url)),
      set: (url, handle) => run('files', 'readwrite', (s) =>
        s.put({url, handle})),
      remove: (url) => run('files', 'readwrite', (s) => s.delete(url)),
    },
  }
})()

if (typeof module !== 'undefined' && module.exports) {
  module.exports = mdidb
}
