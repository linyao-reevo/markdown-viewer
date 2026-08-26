
// Chrome will not hand an extension write access to a local path without one
// user mediated grant, and that grant cannot be asked for from a file:// page
// or from an action popup, which a file dialog closes. So it is asked for
// here, once, and remembered.
//
// Granting the containing folder is the default, because it covers every
// markdown file in it. Picking the single file is offered as a fallback.

;(() => {

  var params = new URLSearchParams(location.search)
  var mode = params.get('mode') === 'permission' ? 'permission' : 'save'
  var url = params.get('url') || ''
  var name = mdpaths.filename(url) || 'document.md'
  var parts = mdpaths.segments(url)
  var folder = parts.length > 1 ? parts[parts.length - 2] : ''

  var $ = document.querySelector.bind(document)

  var reported = false

  // resolves once the worker has the message. Closing the window immediately
  // after sending can drop it, and then nothing tells the page to try again.
  var report = (ok) => {
    if (reported) {
      return Promise.resolve()
    }
    reported = true
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({message: 'picker.done', url, ok: !!ok}, () => {
        chrome.runtime.lastError
        resolve()
      })
    })
  }

  var busy = (state) => {
    $('#grant').disabled = state
    $('#single').disabled = state
  }

  var fail = (message) => {
    $('#error').textContent = message
    $('#error').classList.remove('hidden')
    busy(false)
  }

  var done = (ok) => report(ok).then(() => window.close())

  // grant the folder the file sits in; every markdown file under it saves
  // silently from then on
  var grantFolder = async () => {
    var handle = await window.showDirectoryPicker({mode: 'readwrite'})
    var id = await mdidb.dirs.add(handle)

    // make sure the folder they chose actually contains this file, otherwise
    // the next save would open this window all over again
    if (!(await mdhandles.resolve(url)).handle) {
      await mdidb.dirs.remove(id)
      throw new Error(
        'That folder does not contain ' + name + '. Choose ' +
        (folder ? '"' + folder + '"' : 'the folder the file is in') + ' instead.'
      )
    }

    return true
  }

  // Deliberately an open picker, not a save picker. A save picker truncates
  // whatever it is pointed at the moment it is confirmed, which empties the
  // very file the page is showing. An open picker only reads, so write access
  // is asked for separately.
  var grantFile = async () => {
    var picked = await window.showOpenFilePicker({
      multiple: false,
      types: [{
        description: 'Markdown',
        accept: {'text/markdown': [
          '.markdown', '.mdown', '.mkdn', '.md', '.mkd',
          '.mdwn', '.mdtxt', '.mdtext', '.text',
        ]},
      }],
    })

    var handle = picked[0]

    if (handle.name !== name) {
      throw new Error(
        'That is ' + handle.name + ', not ' + name +
        '. Choose the file the page is showing.'
      )
    }

    // remembered before the prompt, so a refusal can be retried as a plain
    // permission request rather than starting over
    await mdidb.files.set(url, handle)

    if (await handle.queryPermission({mode: 'readwrite'}) === 'granted') {
      return true
    }

    return await handle.requestPermission({mode: 'readwrite'}) === 'granted'
  }

  var regrant = async () => {
    var found = await mdhandles.resolve(url)
    if (!found.handle) {
      // the grant is gone entirely, so ask for it from scratch
      return grantFolder()
    }
    return await found.root.requestPermission({mode: 'readwrite'}) === 'granted'
  }

  var run = (action) => {
    $('#error').classList.add('hidden')
    busy(true)

    action()
      .then(done)
      .catch((err) => {
        if (err && err.name === 'AbortError') {
          done(false)
          return
        }
        fail(String(err && err.message || err))
      })
  }

  /*-------------------------------------------------------------------------*/

  $('#path').textContent = decodeURIComponent(url.replace(/^file:\/\//i, ''))

  if (mode === 'permission') {
    $('#title').textContent = 'Grant write access again'
    $('#explain').textContent =
      'Chrome dropped write access to this file when the browser restarted.'
    $('#grant').textContent = 'Grant access'
    $('#note').textContent =
      'Saving overwrites this file in place. Chrome may ask again after a restart.'
  }
  else {
    $('#title').textContent = 'Allow saving to this folder'
    $('#explain').textContent =
      'Chrome needs your permission once before an extension can write to a ' +
      'local file. Choose the folder this file is in and every markdown file ' +
      'in it saves in place from then on, with no further prompts.'
    $('#grant').textContent =
      folder ? 'Choose the "' + folder + '" folder' : 'Choose folder'
    $('#single').textContent = 'Only this file'
    $('#single').classList.remove('hidden')
    $('#note').textContent =
      'These are permission prompts, not Save As. Nothing is written until you ' +
      'save. Granting a single file asks twice: once to point at it, once to ' +
      'allow editing.'
  }

  $('#grant').addEventListener('click', () =>
    run(mode === 'permission' ? regrant : grantFolder))

  $('#single').addEventListener('click', () => run(grantFile))

  // closing the window without choosing counts as a cancel
  window.addEventListener('unload', () => report(false))
})()
