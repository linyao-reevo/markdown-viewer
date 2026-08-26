
md.compilers.remark = (() => {
  var defaults = {
    breaks: false,
    gfm: true,
    sanitize: false,
  }

  var description = {
    breaks: 'Exposes newline characters inside paragraphs as breaks',
    gfm: 'Toggle GFM (GitHub Flavored Markdown)',
    sanitize: 'Disable HTML tag rendering',
  }

  // sanitizing strips unknown attributes, so the map only survives with it off
  var ctor = ({storage: {state}}) => ({
    defaults,
    description,
    blockmap: () => state.remark.sanitize ? false : 'attrs',
    compile: (markdown, opts = {}) =>
      remark.remark()
        .use(remark.parse)
        .use(state.remark.gfm ? remark.gfm : undefined)
        .use(state.remark.breaks ? remark.breaks : undefined)
        .use(remark.stringify)
        .use(remark.slug)
        .use(opts.blockmap && !state.remark.sanitize ? mdblockmap.remark : undefined)
        .use(remark.html, state.remark) // sanitize
        .processSync(markdown)
        .value
  })

  return Object.assign(ctor, {defaults, description})
})()
