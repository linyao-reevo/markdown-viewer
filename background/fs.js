
// Bridge between the content script and the two extension contexts that are
// allowed to touch the file system: the offscreen document does the writing,
// the picker window does anything that needs a file dialog or a user gesture.
//
// A save never waits for the picker window. Granting access takes as long as
// the user takes, and a service worker can be stopped after seconds of idling,
// which would strand the save and the message channel it was answering on.
// Instead the save fails with a reason, the page offers a Grant button, and the
// page is told to try again once the grant lands.

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

  var save = ({url, markdown, original, force}) =>
    call({message: 'fs.write', url, markdown, original, force})

  var status = ({url}) => call({message: 'fs.status', url})

  // open the grant window and return at once
  var grant = ({url, mode}) => {
    chrome.windows.create({
      url: '/picker/index.html' +
        '?mode=' + (mode === 'permission' ? 'permission' : 'save') +
        '&url=' + encodeURIComponent(url),
      type: 'popup',
      width: 560,
      height: 400,
    })
    return Promise.resolve({ok: true})
  }

  // the grant landed, so tell whichever tab is showing that file to try again.
  // The tab id is not remembered on purpose: the worker may have been replaced
  // while the window was open.
  var finish = (ok, url) => {
    if (!ok || !url) {
      return
    }
    chrome.tabs.query({}, (tabs) => {
      // lastError just means no tab urls are visible to us
      chrome.runtime.lastError
      ;(tabs || [])
        .filter((tab) => tab.url === url)
        .forEach((tab) => {
          chrome.tabs.sendMessage(tab.id, {message: 'edit.retry'}, () => {
            chrome.runtime.lastError
          })
        })
    })
  }

  return {save, status, grant, finish}
}
