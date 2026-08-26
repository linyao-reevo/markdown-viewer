
var origins = Origins()
var folders = Folders()
var popup = Popup()

m.mount(document.querySelector('main'), {
  view: () => [
    origins.render(),
    folders.render(),
    popup.options(),
  ]
})

// header menu
var sections = {
  Origins: '.m-origins',
  Folders: '.m-folders',
  Settings: '.m-settings',
}

document.querySelector('.nav').addEventListener('click', (e) => {
  e.preventDefault()

  if (e.target.innerText === 'Help') {
    window.location = 'https://github.com/simov/markdown-viewer#table-of-contents'
    return
  }

  var selected = sections[e.target.innerText]
  if (!selected) {
    return
  }

  Array.from(document.querySelectorAll('.nav a')).forEach((link) => {
    link.classList.remove('active')
  })
  e.target.classList.add('active')

  Object.keys(sections).forEach((name) => {
    var section = document.querySelector(sections[name])
    if (section) {
      section.classList.toggle('hidden', sections[name] !== selected)
    }
  })
})
