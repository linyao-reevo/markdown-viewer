
// The only place that writes to the file system. A service worker can be
// stopped mid write and an action popup is destroyed when a file dialog takes
// focus, so neither is safe to write from. This document has neither problem.

;(() => {

  var status = async ({url}) => {
    var found = await mdhandles.resolve(url)
    if (!found.handle) {
      return {error: found.reason, folders: found.folders}
    }
    if (!await mdhandles.granted(found.root)) {
      return {error: 'permission', source: found.source}
    }
    return {ok: true, source: found.source}
  }

  var write = async ({url, markdown, original, force}) => {
    var found = await mdhandles.resolve(url)
    if (!found.handle) {
      return {error: found.reason, folders: found.folders}
    }
    if (!await mdhandles.granted(found.root)) {
      return {error: 'permission', source: found.source}
    }

    var disk
    try {
      disk = await (await found.handle.getFile()).text()
    }
    catch (err) {
      // the picked handle points at a file that is gone; forget it so the next
      // save asks again instead of failing forever
      if (found.source === 'file') {
        await mdidb.files.remove(url)
      }
      return {error: 'gone'}
    }

    if (!force && mdlines.normalise(disk) !== mdlines.normalise(original)) {
      return {error: 'mismatch'}
    }

    try {
      var writable = await found.handle.createWritable()
      await writable.write(mdlines.applyEol(markdown, mdlines.eol(disk)))
      await writable.close()
    }
    catch (err) {
      return {error: 'write', message: String(err && err.message || err)}
    }

    return {ok: true, source: found.source}
  }

  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (req.target !== 'offscreen') {
      return false
    }

    var handler =
      req.message === 'fs.write' ? write :
      req.message === 'fs.status' ? status :
      null

    if (!handler) {
      return false
    }

    handler(req)
      .then(sendResponse)
      .catch((err) => sendResponse({
        error: 'write',
        message: String(err && err.message || err),
      }))

    return true
  })
})()
