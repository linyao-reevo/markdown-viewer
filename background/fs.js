
// Bridge between the content script and the two extension contexts that are
// allowed to touch the file system: the offscreen document does the writing,
// the picker window does anything that needs a file dialog or a user gesture.

md.fs = () => {

  var creating = null

  var ensureOffscreen = async () => {
    if (chrome.runtime.getContexts) {
      var contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
      })
      if (contexts.length) {
        return
      }
    }

    if (creating) {
      return creating
    }

    creating = chrome.offscreen.createDocument({
      url: '/offscreen/index.html',
      reasons: ['BLOBS'],
      justification: 'Write edited markdown back to the file it was loaded from',
    })
      .catch((err) => {
        // a second create for an already open document is not an error here
        if (!/single offscreen document/i.test(String(err && err.message))) {
          throw err
        }
      })
      .finally(() => {
        creating = null
      })

    return creating
  }

  var call = async (req) => {
    await ensureOffscreen()
    return chrome.runtime.sendMessage(Object.assign({target: 'offscreen'}, req))
  }

  // one picker window at a time, resolved by picker.done or by the user
  // closing the window
  var pending = null

  var openPicker = (url, mode) => {
    if (pending) {
      return pending.promise
    }

    var settle
    var promise = new Promise((resolve) => (settle = resolve))
    pending = {url, promise, settle, id: null}

    chrome.windows.create({
      url: '/picker/index.html?mode=' + mode + '&url=' + encodeURIComponent(url),
      type: 'popup',
      width: 520,
      height: 300,
    }, (win) => {
      if (pending) {
        pending.id = win && win.id
      }
    })

    return promise
  }

  var finish = (ok) => {
    if (!pending) {
      return
    }
    var settle = pending.settle
    pending = null
    settle(ok)
  }

  chrome.windows.onRemoved.addListener((id) => {
    if (pending && pending.id === id) {
      finish(false)
    }
  })

  var save = async ({url, markdown, original, force}) => {
    var result = await call({message: 'fs.write', url, markdown, original, force})

    if (result && (result.error === 'nohandle' || result.error === 'permission')) {
      var granted = await openPicker(url, result.error === 'permission' ? 'permission' : 'save')
      if (!granted) {
        return {error: 'cancelled'}
      }
      result = await call({message: 'fs.write', url, markdown, original, force})
    }

    return result
  }

  var status = ({url}) => call({message: 'fs.status', url})

  return {save, status, finish}
}
