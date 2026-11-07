/* dsh-novel-arkterminal / client apply + sidebar icon. */

const STYLE_ID = 'dsh-novel-arkterminal-style'

function ensureStyle() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}

function removeStyle() {
  if (typeof document === 'undefined') return
  const style = document.getElementById(STYLE_ID)
  if (style && style.parentNode) style.parentNode.removeChild(style)
}

function SidebarIcon(props) {
  const size = props && Number(props.size) ? Number(props.size) : 18
  const active = props && props.active
  const color = active ? 'var(--nt-accent, #57ffb0)' : 'currentColor'
  return h('svg', {
    className: 'nt-sidebar-icon',
    width: size,
    height: size,
    viewBox: '0 0 64 64',
    fill: 'none',
    'aria-hidden': 'true',
    style: { color },
  },
    h('rect', { x: 8, y: 10, width: 48, height: 34, rx: 4, stroke: color, strokeWidth: 3 }),
    h('path', { d: 'M18 21h18M18 28h26M18 35h12', stroke: color, strokeWidth: 3, strokeLinecap: 'round' }),
    h('path', { d: 'M24 50h16l3 6H21z', fill: color, opacity: 0.8 }),
    h('rect', { x: 14, y: 57, width: 36, height: 2.5, rx: 1.25, fill: color, opacity: 0.5 }),
  )
}

function apply(ctx) {
  try {
    ctx.effect(() => {
      ensureStyle()
      return () => removeStyle()
    }, 'novel-terminal: style')
  } catch {
    ensureStyle()
  }
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      { name: 'sidebar.panellist', id: 'novel-terminal', order: 20, label: '方舟终端' },
      SidebarIcon,
    ),
  )
  ctx.slots.inject('main', () =>
    ctx.slots.register(
      { name: 'main', key: 'novel-terminal' },
      TerminalApp,
    ),
  )
}
