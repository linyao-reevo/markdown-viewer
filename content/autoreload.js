
;(() => {

  var response = (md) => {
    if (!state.reload.current) {
      state.reload.current = md
      state.original = md
      return
    }

    if (state.reload.current === md) {
      return
    }

    // an unsaved edit outranks whatever is on disk
    if (state.dirty) {
      return
    }

    state.reload.md = true
    state.reload.current = md
    state.original = md
    render(md)
  }

  var xhr = new XMLHttpRequest()
  xhr.onreadystatechange = () => {
    if (xhr.readyState === 4) {
      response(xhr.responseText)
    }
  }

  var get = () => {
    if (location.protocol === 'file:') {
      chrome.runtime.sendMessage({
        message: 'autoreload',
        location: location.href
      }, (res) => {
        if (res.err) {
          console.error(res.err)
          clearInterval(state.reload.interval)
        }
        else {
          response(res.body)
        }
      })
    }
    else {
      xhr.open('GET', location.href + '?preventCache=' + Date.now(), true)
      try {
        xhr.send()
      }
      catch (err) {
        console.error(err)
        clearInterval(state.reload.interval)
      }
    }
  }

  get()
  state.reload.interval = setInterval(get, state.reload.ms)
})()
