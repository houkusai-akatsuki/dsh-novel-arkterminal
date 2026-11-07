import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fsp } from 'node:fs'
import vm from 'node:vm'

const source = await fsp.readFile(new URL('../lib/client.js', import.meta.url), 'utf8')

function fakeReact() {
  return {
    createElement(type, props, ...children) {
      return { type, props: props || {}, children }
    },
    useState(initial) {
      return [typeof initial === 'function' ? initial() : initial, () => {}]
    },
    useEffect() {},
    useRef() { return { current: null } },
    useMemo(factory) { return factory() },
    useCallback(fn) { return fn },
  }
}

test('client module loads and registers sidebar icon + main panel', () => {
  let captured = null
  const sandbox = {
    console,
    window: {
      __ModuleLoader__: {
        load(config) { captured = config },
      },
    },
  }
  vm.runInNewContext(source, sandbox)
  assert.ok(captured, 'module loader was not called')
  assert.equal(captured.id, 'dsh-novel-arkterminal')

  const react = fakeReact()
  const exported = captured.factory((name) => {
    if (name === 'react') return react
    throw new Error('unexpected client dependency: ' + name)
  })
  assert.equal(exported.name, 'novel-terminal')
  assert.deepEqual(Array.from(exported.inject), ['slots'])
  assert.equal(typeof exported.apply, 'function')

  const registrations = []
  const ctx = {
    effect(fn) {
      const dispose = fn()
      if (typeof dispose === 'function') exported.disposed = dispose
    },
    slots: {
      inject(_name, callback) { callback() },
      register(spec, component) {
        registrations.push({ spec, component })
        return () => {}
      },
    },
  }
  exported.apply(ctx)
  const sidebar = registrations.find((item) => item.spec.name === 'sidebar.panellist')
  const main = registrations.find((item) => item.spec.name === 'main')
  assert.ok(sidebar, 'sidebar.panellist registration missing')
  assert.equal(sidebar.spec.id, 'novel-terminal')
  assert.ok(main, 'main registration missing')
  assert.equal(main.spec.key, 'novel-terminal')

  const icon = sidebar.component({ size: 18, active: true })
  assert.equal(icon.type, 'svg')
  assert.equal(main.component.name, 'TerminalApp')

  // Dialogue bubbles / history review / per-bubble font scale are part of the bundle.
  assert.ok(source.includes('nt-dialog-bubble'), 'dialogue bubble CSS missing')
  assert.ok(source.includes('DialogueHistoryPanel'), 'dialogue history panel missing')
  assert.ok(source.includes('dialogueFontScale'), 'dialogue font scale pref missing')
})
