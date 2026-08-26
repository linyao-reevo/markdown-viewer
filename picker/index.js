
// A file dialog closes an action popup and cannot run on a file:// page at
// all, so both the picker and the permission prompt live in this window. It
// stores what the user grants and reports back to the service worker.

;(() => {

  var params = new URLSearchParams(location.search)
  var mode = params.get('mode') === 'permission' ? 'permission' : 'save'
  var url = params.get('url') || ''
  var name = mdpaths.filename(url) || 'document.md'

  var $ = document.querySelector.bind(document)

  var reported = false
  var report = (result) => {
    if (reported) {
      return
    }
    reported = true
    chrome.runtime.sendMessage({message: 'picker.done', url, ok: !!result.ok})
  }

  var fail = (message) => {
    $('#error').textContent = message
    $('#error').classList.remove('hidden')
    $('#grant').disabled = false
  }

  var save = async () => {
    var handle = await window.showSaveFilePicker({
      suggestedName: name,
      startIn: 'documents',
      types: [{
        description: 'Markdown',
        accept: {'text/markdown': [
          '.markdown', '.mdown', '.mkdn', '.md', '.mkd',
          '.mdwn', '.mdtxt', '.mdtext', '.text',
        ]},
      }],
    })
    await mdidb.files.set(url, handle)
    return {ok: true}
  }

  var permission = async () => {
    var found = await mdhandles.resolve(url)
    if (!found) {
      // the grant is gone entirely, so fall back to picking the file
      return save()
    }
    var state = await found.root.requestPermission({mode: 'readwrite'})
    return {ok: state === 'granted'}
  }

  $('#path').textContent = decodeURIComponent(url.replace(/^file:\/\//i, ''))

  $('#explain').textContent = mode === 'permission'
    ? 'Chrome dropped write access to this file when the browser restarted. Grant it again to save.'
    : 'Chrome cannot write to a local file until you point at it once. Choose this same file to save your edits.'

  $('#grant').textContent = mode === 'permission' ? 'Grant access' : 'Choose file'

  $('#grant').addEventListener('click', () => {
    $('#error').classList.add('hidden')
    $('#grant').disabled = true

    ;(mode === 'permission' ? permission() : save())
      .then((result) => {
        report(result)
        window.close()
      })
      .catch((err) => {
        if (err && err.name === 'AbortError') {
          report({ok: false})
          window.close()
          return
        }
        fail(String(err && err.message || err))
      })
  })

  // closing the window without choosing counts as a cancel
  window.addEventListener('unload', () => report({ok: false}))
})()
