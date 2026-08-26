var Folders = () => {

  var state = {
    folders: [],
    error: '',
    supported: typeof window.showDirectoryPicker === 'function',
  }

  var load = async () => {
    var dirs = await mdidb.dirs.list()
    var folders = []

    for (var dir of dirs) {
      var permission = 'granted'
      try {
        permission = await dir.handle.queryPermission({mode: 'readwrite'})
      }
      catch (err) {
        permission = 'unknown'
      }
      folders.push({id: dir.id, name: dir.name, handle: dir.handle, permission})
    }

    state.folders = folders
    m.redraw()
  }

  load()

  var fail = (err) => {
    if (err && err.name === 'AbortError') {
      return
    }
    state.error = String(err && err.message || err)
    m.redraw()
  }

  var events = {
    add: () => {
      state.error = ''
      window.showDirectoryPicker({mode: 'readwrite'})
        .then((handle) => mdidb.dirs.add(handle))
        .then(load)
        .catch(fail)
    },

    grant: (folder) => {
      state.error = ''
      folder.handle.requestPermission({mode: 'readwrite'})
        .then(load)
        .catch(fail)
    },

    remove: (folder) => {
      state.error = ''
      mdidb.dirs.remove(folder.id).then(load).catch(fail)
    },
  }

  var render = () =>
    m('.row m-folders hidden',
      m('.col-xxl-8.col-xl-8.col-lg-10.col-md-12.col-sm-12',
        m('h3', 'Editable Folders'),
        m('.bs-callout',
          m('p',
            'Chrome will not let an extension write to a local file until you ' +
            'point at it. Grant a folder here and every markdown file inside ' +
            'it saves without asking again.'
          ),

          !state.supported &&
          m('p.m-error',
            'This browser has no File System Access API, so editing cannot ' +
            'save to disk.'
          ),

          state.supported && !state.folders.length &&
          m('p.m-label', 'No folders granted yet.'),

          state.folders.map((folder) =>
            m('.row m-folder',
              m('.col-xxl-6.col-xl-6.col-lg-6.col-md-6.col-sm-12',
                m('span.m-label', folder.name),
                folder.permission !== 'granted' &&
                m('span.m-warning', ' access expired')
              ),
              m('.col-xxl-6.col-xl-6.col-lg-6.col-md-6.col-sm-12',
                folder.permission !== 'granted' &&
                m('button.mdc-button mdc-button--raised m-button', {
                  onclick: () => events.grant(folder)
                  },
                  'Grant again'
                ),
                m('button.mdc-button mdc-button--raised m-button', {
                  onclick: () => events.remove(folder)
                  },
                  'Remove'
                )
              )
            )
          ),

          state.supported &&
          m('button.mdc-button mdc-button--raised m-button', {
            onclick: events.add
            },
            'Add folder'
          ),

          state.error &&
          m('p.m-error', state.error)
        )
      )
    )

  return {state, render}
}
