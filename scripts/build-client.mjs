/**
 * Build lib/client.js from src/client/*.js fragments.
 * The DSH Web module loader expects one file shaped as
 * window.__ModuleLoader__.load({ id, factory(require) { ... } }).
 */
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const srcDir = path.join(root, 'src', 'client')
const outFile = path.join(root, 'lib', 'client.js')

const head = `window.__ModuleLoader__.load({
  id: "dsh-novel-arkterminal",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    const React = require('react');
    const h = React.createElement;
`

const tail = `
    exports.name = 'novel-terminal'
    exports.inject = ['slots']
    exports.apply = apply
    return module.exports
  },
});
`

const names = (await fsp.readdir(srcDir)).filter((name) => name.endsWith('.js')).sort()
const fragments = []
for (const name of names) {
  const text = await fsp.readFile(path.join(srcDir, name), 'utf8')
  fragments.push(`/* ===== ${name} ===== */\n` + text.trimEnd())
}
const output = head + fragments.join('\n\n') + tail
await fsp.mkdir(path.dirname(outFile), { recursive: true })
await fsp.writeFile(outFile, output, 'utf8')
console.log(`[dsh-novel-arkterminal] built ${path.relative(root, outFile)} from ${names.length} fragments (${output.length} bytes)`)
