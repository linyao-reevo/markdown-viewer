
md.messages = ({storage: {defaults, state, set}, compilers, mathjax, xhr, webrequest, icon, fs}) => {

  // what kind of source map the current compiler can produce, if any
  var blockmap = () => {
    // the mathjax pass collapses multi line formulas into a placeholder before
    // compiling, so every line number after one of them is wrong
    if (state.content.mathjax) {
      return false
    }
    var compiler = compilers[state.compiler]
    return compiler.blockmap ? compiler.blockmap() : false
  }

  var blockmapReason = () =>
    blockmap() ? '' :
    state.content.mathjax ? 'Not available while MathJax is on' :
    'The ' + state.compiler + ' compiler exposes no source positions'

  return (req, sender, sendResponse) => {

    // addressed at the offscreen document, which has its own listener
    if (req.target) {
      return false
    }

    // content
    if (req.message === 'markdown') {
      var markdown = req.markdown

      if (state.content.mathjax) {
        var jax = mathjax()
        markdown = jax.tokenize(markdown)
      }

      var map = req.blockmap ? blockmap() : false
      var compiler = compilers[state.compiler]

      var html = compiler.compile(markdown, {blockmap: !!map})

      if (state.content.mathjax) {
        html = jax.detokenize(html)
      }

      sendResponse({
        message: 'html',
        html,
        blockmap: map,
        lines: map === 'ordinal' && compiler.lines ? compiler.lines(markdown) : null,
      })
    }
    else if (req.message === 'edit.save') {
      fs.save(req)
        .then(sendResponse)
        .catch((err) => sendResponse({
          error: 'write',
          message: String(err && err.message || err),
        }))
    }
    else if (req.message === 'edit.status') {
      fs.status(req)
        .then(sendResponse)
        .catch(() => sendResponse({error: 'nohandle'}))
    }
    else if (req.message === 'picker.done') {
      fs.finish(req.ok)
      sendResponse()
    }
    else if (req.message === 'autoreload') {
      xhr.get(req.location, (err, body) => {
        sendResponse({err, body})
      })
    }
    else if (req.message === 'prism') {
      chrome.scripting.executeScript({
        target: {tabId: sender.tab.id},
        files: [
          `/vendor/prism/prism-${req.language}.min.js`,
        ],
        injectImmediately: true
      }, sendResponse)
    }
    else if (req.message === 'mathjax') {
      chrome.scripting.executeScript({
        target: {tabId: sender.tab.id},
        files: [
          `/vendor/mathjax/extensions/${req.extension}.js`,
        ],
        injectImmediately: true
      }, sendResponse)
    }

    // popup
    else if (req.message === 'popup') {
      sendResponse(Object.assign({}, state, {
        options: state[state.compiler],
        description: compilers[state.compiler].description,
        compilers: Object.keys(compilers),
        themes: state.themes,
        settings: {theme: state.settings.theme},
        blockmap: blockmap(),
        blockmapReason: blockmapReason(),
      }))
    }
    else if (req.message === 'popup.edit') {
      set({edit: req.edit})
      if (!req.edit) {
        notifyContent({message: 'edit', edit: false})
      }
      else {
        // the editor is only injected when it is needed, so turning the mode
        // on mid page has to put it there first
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
          chrome.scripting.executeScript({
            target: {tabId: tabs[0].id},
            files: [
              '/vendor/turndown.min.js',
              '/vendor/turndown-plugin-gfm.min.js',
              '/content/edit.js',
            ],
          }, () => {
            // lastError just means the tab has no viewer running
            chrome.runtime.lastError
            chrome.tabs.sendMessage(tabs[0].id, {message: 'edit', edit: true})
          })
        })
      }
      sendResponse()
    }
    else if (req.message === 'popup.theme') {
      set({theme: req.theme})
      notifyContent({message: 'theme', theme: req.theme})
      sendResponse()
    }
    else if (req.message === 'popup.raw') {
      set({raw: req.raw})
      notifyContent({message: 'raw', raw: req.raw})
      sendResponse()
    }
    else if (req.message === 'popup.themes') {
      set({themes: req.themes})
      notifyContent({message: 'themes', themes: req.themes})
      sendResponse()
    }
    else if (req.message === 'popup.defaults') {
      var options = Object.assign({}, defaults)
      options.origins = state.origins
      set(options)
      notifyContent({message: 'reload'})
      sendResponse()
    }
    else if (req.message === 'popup.compiler.name') {
      set({compiler: req.compiler})
      notifyContent({message: 'reload'})
      sendResponse()
    }
    else if (req.message === 'popup.compiler.options') {
      set({[req.compiler]: req.options})
      notifyContent({message: 'reload'})
      sendResponse()
    }
    else if (req.message === 'popup.content') {
      set({content: req.content})
      notifyContent({message: 'reload'})
      webrequest()
      sendResponse()
    }
    else if (req.message === 'popup.advanced') {
      // ff: opens up about:addons with openOptionsPage
      if (/Firefox/.test(navigator.userAgent)) {
        chrome.management.getSelf((extension) => {
          chrome.tabs.create({url: extension.optionsUrl})
        })
      }
      else {
        chrome.runtime.openOptionsPage()
      }
      sendResponse()
    }

    // origins view
    else if (req.message === 'options.origins') {
      sendResponse({
        origins: state.origins,
        match: state.match,
      })
    }
    // origins options
    else if (req.message === 'origin.add') {
      state.origins[req.origin] = {
        header: true,
        path: true,
        match: defaults.match,
      }
      set({origins: state.origins})
      sendResponse()
    }
    else if (req.message === 'origin.remove') {
      delete state.origins[req.origin]
      set({origins: state.origins})
      webrequest()
      sendResponse()
    }
    else if (req.message === 'origin.update') {
      state.origins[req.origin] = req.options
      set({origins: state.origins})
      webrequest()
      sendResponse()
    }

    // settings view
    else if (req.message === 'options.settings') {
      sendResponse(state.settings)
    }
    // settings options
    else if (req.message === 'options.icon') {
      set({settings: req.settings})
      icon()
      sendResponse()
    }
    else if (req.message === 'options.theme') {
      set({settings: req.settings})
      sendResponse()
    }
    else if (req.message === 'custom.get') {
      sendResponse(state.custom)
    }
    else if (req.message === 'custom.set') {
      set({custom: req.custom}).then(sendResponse).catch((err) => {
        if (/QUOTA_BYTES_PER_ITEM quota exceeded/.test(err.message)) {
          sendResponse({error: 'Minified theme exceeded 8KB in size!'})
        }
      })
    }

    return true
  }

  function notifyContent (req, res) {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, req, res)
    })
  }
}
