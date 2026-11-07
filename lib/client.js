window.__ModuleLoader__.load({
  id: "dsh-novel-arkterminal",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    const React = require('react');
    const h = React.createElement;
/* ===== 00_prelude.js ===== */
/* dsh-novel-arkterminal / client prelude. This file is concatenated into lib/client.js. */

const API = '/dsh-novel-arkterminal/api'
const PREFS_KEY = 'dsh-novel-arkterminal:prefs'
const LEGACY_PREFS_KEY = 'dsh-novel-terminal:prefs'
const PREFS_VERSION = 3

const DEFAULT_PREFS = {
  typingSpeed: 18,          // ms per tick
  fontWeight: 400,
  fontScale: 1,
  dialogueFontScale: 1,
  scanlines: true,
  glow: true,
  reducedMotion: false,
  sound: false,
  soundVolume: 0.25,
  aiMode: 'auto',           // auto | manual | off
  aiProvider: '',
  aiModel: '',
  aiTemperature: 0.8,
  aiTopP: 1,
  aiPresencePenalty: 0,
  aiFrequencyPenalty: 0,
  aiMaxTokens: 2400,
  chapterWords: 800,        // AI continuation target length (Chinese characters)
  prefsVersion: PREFS_VERSION,
  writingStyle: 'default',  // id in BUILTIN_TEMPLATES.style / imported styles / 'default'
  writingLogic: 'default',  // id in BUILTIN_TEMPLATES.logic / imported
  writingCot: 'hidden-chain', // id in BUILTIN_TEMPLATES.cot / imported
  memoryFormat: 'default',  // id in BUILTIN_TEMPLATES.memory / imported
  editorMode: false,
  sideTab: 'goals',
}

function loadPrefs() {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY) || window.localStorage.getItem(LEGACY_PREFS_KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    const parsed = JSON.parse(raw)
    const merged = { ...DEFAULT_PREFS, ...(parsed && typeof parsed === 'object' ? parsed : {}) }
    // Clamp persisted values so a stray entry cannot send absurd limits to the model.
    const clampInt = (value, min, max, fallback) => {
      const number = Number(value)
      return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback
    }
    merged.aiMaxTokens = clampInt(merged.aiMaxTokens, 400, 256000, 2400)
    merged.chapterWords = clampInt(merged.chapterWords, 200, 20000, 800)
    const bubbleScale = Number(merged.dialogueFontScale)
    merged.dialogueFontScale = Number.isFinite(bubbleScale) ? Math.min(1.8, Math.max(0.75, bubbleScale)) : 1
    const temperature = Number(merged.aiTemperature)
    merged.aiTemperature = Number.isFinite(temperature) ? Math.min(1.5, Math.max(0, temperature)) : 0.8
    const topP = Number(merged.aiTopP)
    merged.aiTopP = Number.isFinite(topP) ? Math.min(1, Math.max(0, topP)) : 1
    const presencePenalty = Number(merged.aiPresencePenalty)
    merged.aiPresencePenalty = Number.isFinite(presencePenalty) ? Math.min(2, Math.max(-2, presencePenalty)) : 0
    const frequencyPenalty = Number(merged.aiFrequencyPenalty)
    merged.aiFrequencyPenalty = Number.isFinite(frequencyPenalty) ? Math.min(2, Math.max(-2, frequencyPenalty)) : 0
    // v2: the old 1200-token default truncated JSON continuations; bump it once.
    if (!parsed || parsed.prefsVersion !== PREFS_VERSION) {
      if (merged.aiMaxTokens === 1200) merged.aiMaxTokens = 2400
      merged.prefsVersion = PREFS_VERSION
    }
    return merged
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

function writePrefs(next) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(next))
  } catch {
    /* storage unavailable */
  }
}

async function api(path, options) {
  const opts = Object.assign({ method: 'GET' }, options || {})
  if (opts.body !== undefined) {
    opts.headers = Object.assign({ 'content-type': 'application/json' }, opts.headers || {})
    opts.body = JSON.stringify(opts.body)
  }
  let response
  try {
    response = await fetch(API + path, opts)
  } catch (error) {
    const wrapped = new Error('无法连接宿主数据接口：' + (error && error.message ? error.message : '网络错误'))
    wrapped.code = 'network'
    throw wrapped
  }
  let doc = null
  try {
    doc = await response.json()
  } catch {
    doc = null
  }
  if (!response.ok || !doc || doc.ok === false) {
    const info = (doc && doc.error) || {}
    const wrapped = new Error(info.message || ('请求失败：HTTP ' + response.status))
    wrapped.code = info.code || 'http_error'
    wrapped.status = response.status
    throw wrapped
  }
  return doc.data
}

function saveStateFromGame(game, storyTitle, storyId) {
  return {
    v: 1,
    storyId,
    title: storyTitle + ' · ' + new Date().toLocaleString(),
    nodeId: game.nodeId,
    visited: game.visited,
    flags: game.flags,
    history: game.history,
    snapshots: game.snapshots,
    createdAt: game.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function loadGameFromSave(save) {
  return {
    nodeId: save.nodeId,
    visited: Array.isArray(save.visited) ? save.visited : [save.nodeId],
    flags: save.flags && typeof save.flags === 'object' ? save.flags : {},
    history: Array.isArray(save.history) ? save.history : [],
    snapshots: Array.isArray(save.snapshots) ? save.snapshots : [],
    createdAt: save.createdAt || new Date().toISOString(),
  }
}

function textNodesFromBlocks(blocks, worldbook, openEntry) {
  const map = new Map()
  for (const entry of worldbook || []) map.set(entry.id, entry)
  const nodes = []
  ;(blocks || []).forEach((block, index) => {
    const children = []
    const text = String(block && block.text ? block.text : '')
    const pattern = /\[\[([\w:.-]+)\|([^\]]+)\]\]/g
    let last = 0
    let match
    while ((match = pattern.exec(text)) !== null) {
      if (match.index > last) children.push(text.slice(last, match.index))
      const entryId = match[1]
      const label = match[2]
      const entry = map.get(entryId)
      children.push(
        h(
          'button',
          {
            key: 'link-' + index + '-' + match.index,
            className: 'nt-we-link',
            type: 'button',
            title: entry ? entry.title : entryId,
            onClick: () => entry && openEntry(entry),
          },
          label,
        ),
      )
      last = match.index + match[0].length
    }
    if (last < text.length) children.push(text.slice(last))
    const tag = block.type === 'heading' ? 'div' : 'p'
    nodes.push(
      h(
        tag,
        {
          key: 'block-' + index,
          className:
            'nt-block nt-block-' +
            (block.type === 'dialogue' ? 'dialogue' : block.type === 'system' ? 'system' : block.type === 'heading' ? 'heading' : 'narration'),
        },
        block.speaker ? h('span', { className: 'nt-speaker' }, block.speaker + '：') : null,
        children,
      ),
    )
  })
  return nodes
}

function blockText(block) {
  const speaker = block && block.speaker ? block.speaker + '：' : ''
  return speaker + String((block && block.text) || '')
}

function summarizeNode(node, max) {
  const limit = max || 600
  const text = (node && Array.isArray(node.blocks) ? node.blocks : []).map(blockText).join('\n')
  return text.length > limit ? text.slice(0, limit) + '…' : text
}

function beep(freq, durationMs, volume) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const audio = new Ctx()
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = 'square'
    osc.frequency.value = freq
    gain.gain.value = Math.max(0.0001, Math.min(0.5, volume || 0.2))
    osc.connect(gain)
    gain.connect(audio.destination)
    osc.start()
    osc.stop(audio.currentTime + Math.max(0.02, (durationMs || 40) / 1000))
    setTimeout(() => audio.close().catch(() => {}), 400)
  } catch {
    /* audio is optional */
  }
}

function formatDate(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return String(value)
  }
}

/* ===== 05_writing_styles.js ===== */
/* dsh-novel-arkterminal / prompt template library: style / logic / cot / memory. */

const TEMPLATE_KINDS = ['style', 'logic', 'cot', 'memory']
const TEMPLATE_KIND_META = {
  style: { label: '文风', hint: '只影响 AI 续写的文字风格。' },
  logic: { label: '语言逻辑', hint: '视角、句式、描写与对白的通用写法约束。' },
  cot: { label: '思维链', hint: '要求 AI 把思考链写进 reasoning 字段；只用于记录，不进入正文。' },
  memory: { label: '记忆区格式', hint: '规定 AI 写 memoryAppend 时的记忆区结构。' },
}
const TEMPLATE_LIMIT = 80
const TEMPLATE_PROMPT_LIMIT = 2000

const BUILTIN_TEMPLATES = {
  style: [
    {
      id: 'literary-restrained',
      name: '克制文学',
      description: '留白、动作与细节驱动，少形容词与直接抒情。',
      prompt: '文风：克制文学。语言干净、内敛，重动作、细节与环境，少用形容词和排比；情绪藏在人物的动作与物件里，不直接抒情。对白自然简短，叙述冷静。',
    },
    {
      id: 'classical-baihua',
      name: '古典白话',
      description: '民国白话为底，掺少量文言节奏，用词雅正。',
      prompt: '文风：古典白话。以民国白话为底，掺少量文言节奏；用词雅正、句式讲究，避免网络词与当代口语；对白可略带旧时人物的腔调，但不必诘屈聱牙。',
    },
    {
      id: 'cold-realist',
      name: '冷硬纪实',
      description: '新闻纪实笔法：短句、精确的时空与数字。',
      prompt: '文风：冷硬纪实。新闻纪实笔法，短句为主，精确交代时间、地点、人数、物资；情绪藏进事实和动作里，不评论、不煽情。段落短，信息密度高。',
    },
    {
      id: 'lyrical',
      name: '诗意抒情',
      description: '意象丰富、节奏舒缓，允许环境与心理描写。',
      prompt: '文风：诗意抒情。意象丰富、节奏舒缓，允许较长的环境与心理描写；用具体的物象承载情绪，避免空洞的形容词堆砌和滥情。',
    },
    {
      id: 'suspense-cold',
      name: '悬疑冷峻',
      description: '信息差与压迫感，短段落，结尾留钩子。',
      prompt: '文风：悬疑冷峻。制造信息差与压迫感，段落短促，叙述者知道的比说出来的多；每段结尾留一点钩子，不提前揭底，不解释人物动机。',
    },
    {
      id: 'five-senses',
      name: '五感细描',
      description: '动作分三段、句式多变、五感反馈具体化。',
      prompt: '文风：五感细描。描写时充分运用定语、状语、补语与从句，注意变换句式；一段动作拆成开始—延伸—强调三个阶段分别展开。每段尽量给出具体的五感反馈：触觉（接触位置、状态、力的作用）、听觉（方位、大小、音色）、嗅觉与味觉（具体味道、浓淡、对身心的影响）、视觉（具象细节、通感、对衣物与身体形态的变形）。避免空洞概括。',
    },
    {
      id: 'grounded-dialogue',
      name: '生活化对白',
      description: '符合中国人日常口语与人物身份年龄，反翻译腔。',
      prompt: '文风：生活化对白。对白要符合中国人的口语习惯和说话人的年龄、身份、性格与场合，贴近生活、有真实的语气变化；避免翻译腔和复杂生硬的句式。不要用「该死」这类翻译腔感叹，改用「靠」「我去」等自然说法。叙述服务于对白，不抢戏。',
    },
  ],
  logic: [
    {
      id: 'kui-logic',
      name: '中文小说语言逻辑（Kui）',
      description: '第三人称、句式变化、动作三段、五感反馈、生活化对白。',
      prompt: '语言逻辑：保持第三人称视角，采用中文小说的写法。描写句使用丰富的定语、状语、补语及其从句，注意变换句式结构，避免连续同构句；一段动作拆成开始—延伸—强调三个阶段分别描写。进入新段落时，第一句不要与上一段第一句使用相同句式。五感反馈要具体：触觉写接触位置、状态、形变与力的作用；听觉写声音方位、大小与音色；嗅觉味觉写具体味道、浓淡及其对心理身体的影响；视觉写具象细节、通感与场景对人物衣着身体的影响。对白符合中国人的口语习惯与人物年龄、身份、性格，避免翻译腔。',
    },
    {
      id: 'dialogue-tags',
      name: '角色对话上色',
      description: '用 user/partner/npc 标签包裹对话，终端里按角色配色。',
      prompt: '语言逻辑（对话包裹）：输出角色对话时，根据说话者身份与关系使用固定 HTML 标签包裹：主角发言用 <user-dialogue>…</user-dialogue>；与主角有亲密关系的角色（爱人、妻子等）用 <partner-dialogue>…</partner-dialogue>；其他角色用 <npc-dialogue>…</npc-dialogue>。标签外的叙述不要包裹。',
    },
  ],
  cot: [
    {
      id: 'hidden-chain',
      name: '精简思维链（隐藏）',
      description: '单行箭头链，只写入 reasoning，不进入正文。',
      prompt: '思维链采用单行箭头链，例如：[解析: 任务与约束] -> [规划: 选定策略] -> [执行: 生成内容] -> [审查: 优化格式]。禁止换行与空行，尽量精简，不产生多余 token。整条思维链只写入 JSON 的 reasoning 字段，禁止出现在 blocks、choices 与 title 中；每轮都必须给出 reasoning，不得省略。',
    },
    {
      id: 'ten-step',
      name: '十步思维链',
      description: '解析指令→角色→人设→画面→剧情→利弊→矛盾→文风→记忆→对话归属。',
      prompt: '思维链用单行箭头链写进 reasoning，依次覆盖：①解析用户指令与约束；②解构当前角色与设定；③确立核心人设；④构建视觉形象；⑤设定剧情走向；⑥权衡行动利弊；⑦植入核心矛盾；⑧统一文风格式；⑨检查记忆区是否正确记录；⑩判断每句对话该用哪个标签包裹，并检查人设是否被轻易改变。禁止换行，只写入 reasoning。',
    },
    {
      id: 'rule-v3',
      name: '3.0 RULE 复核',
      description: '高权重规则自检：不省略、不缩减、记忆客观、格式完整。',
      prompt: '【RULE】为极高权重规则。写入 reasoning 前先列出本轮必须遵守的 RULE（格式、记忆、人设、不省略），并逐条自检：是否完整输出所有要求？是否省略了状态、细节或记忆？是否使用了「同上、省略、不变、被隐藏」等概括词？记忆是否客观、无修辞、无【】符号、不缩减已存在的条目？思维链只写入 reasoning，保持单行。',
    },
  ],
  memory: [
    {
      id: 'work-history',
      name: '工作记忆 + 历史档案（光湖）',
      description: '工作记忆最多 4 条，满 4 条合成一条历史档案并清空。',
      prompt: '记忆区格式：工作记忆（Working Memory）记录最近的交互，每条 >20 字，最多 4 条；历史档案（History Archive）永久存储，每条 >80 字，无数量上限，且只读。归档规则：每次交互结束后必须且只生成一条新的工作记忆摘要；在添加新条目之前，若工作记忆已达 4 条，则把当前 4 条合成一条档案存入历史档案，并清空工作记忆；无论是否触发合成，本次新摘要都加入工作记忆。所有记忆必须是客观总结，不含价值判断。memoryAppend 请按以下结构书写：工作记忆区（当前数目 x/4）+ 编号列表；历史档案区（当前档案数目）+ 编号列表，并在需要时说明本次触发的归档。',
    },
    {
      id: 'star-corridor',
      name: '星记忆回廊（表格）',
      description: 'LTM / STM 双表格；短期 7 条触发固化。',
      prompt: '记忆区格式：星记忆回廊（Star Memory Corridor）。memoryAppend 按下面结构书写：一个 <details><summary>星记忆回廊 (长期条数 | 短期条数)</summary> 包裹；内部先写「⚜️ 长期记忆区 (LTM)⚜️」表格，列为 No. / Time(时间) / Scene(场景) / Event(客观事实)；再写「⚜️ 短期记忆区 (STM) ⚜️」表格，列相同。每次交互新增一条短期记忆；短期记忆满 7 条时，下一次应触发固化周期：把全部短期记忆合并成一条长期记忆、清空短期记忆，并新增一条短期记忆。记忆必须客观、按时间顺序、不缩减已有条目。',
    },
    {
      id: 'v3-reduced',
      name: '3.0 缩减记忆（陈师傅）',
      description: '短期 ≤7 条、长期无上限、总结规则、客观不省略。',
      prompt: '记忆区格式（3.0 缩减版）：短期记忆每次交互新增且仅新增一条，每条 60–100 字，上限 7 条；长期记忆无上限，每条 150–300 字。总结规则：当短期记忆达到 7 条，把全部 7 条融合成一条新的长期记忆，彻底清空短期记忆，然后为当前回合生成一条新的短期记忆。所有记忆必须是客观事实总结：严禁修辞、严禁评价情节、绝对不出现【】符号、不遗漏关键情节；事件包含人物、起因、内容、结果与变化，关键专有名词与结论可适度引用原文；不缩减或修改任何已有记忆。记忆时间要包含年月日、第几天与详细时间。开局时长期记忆为空。',
    },
  ],
}

function defaultTemplate(kind) {
  return {
    id: 'default',
    kind,
    name: '默认（不启用）',
    description: '不向 AI 附加这一类指令。',
    prompt: '',
    builtin: true,
  }
}

function builtinTemplates(kind) {
  return (BUILTIN_TEMPLATES[kind] || []).map((template) => ({ ...template, kind, builtin: true }))
}

function normalizeTemplateId(value, fallback) {
  if (typeof value === 'string' && /^[\w.:-]{1,64}$/.test(value)) return value
  return fallback
}

function normalizeTemplateItem(item, fallbackKind, index) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null
  const kind = TEMPLATE_KINDS.includes(item.kind) ? item.kind : fallbackKind
  const name = typeof item.name === 'string' ? item.name.trim().slice(0, 80) : ''
  const prompt = typeof item.prompt === 'string' ? item.prompt.trim().slice(0, TEMPLATE_PROMPT_LIMIT) : ''
  if (!name || !prompt) return null
  const template = {
    id: normalizeTemplateId(item.id, kind + '-imported-' + Date.now().toString(36) + '-' + index),
    kind,
    name,
    prompt,
  }
  if (typeof item.description === 'string' && item.description.trim()) {
    template.description = item.description.trim().slice(0, 200)
  }
  const temperature = Number(item.temperature)
  if (Number.isFinite(temperature) && temperature >= 0 && temperature <= 1.5) template.temperature = temperature
  return template
}

function normalizeTemplatePayload(payload, fallbackKind) {
  const raw = Array.isArray(payload) ? payload : payload && Array.isArray(payload.styles) ? payload.styles : payload && Array.isArray(payload.templates) ? payload.templates : []
  const list = []
  raw.forEach((item, index) => {
    const normalized = normalizeTemplateItem(item, fallbackKind, index)
    if (normalized) list.push(normalized)
  })
  return list.slice(0, TEMPLATE_LIMIT)
}

function remoteTemplates(boot) {
  return normalizeTemplatePayload(boot && boot.styles ? boot.styles : [], 'style')
}

function templateList(kind, remote) {
  const list = [defaultTemplate(kind), ...builtinTemplates(kind)]
  for (const template of remote || []) {
    if (template.kind === kind) list.push({ ...template, imported: true })
  }
  return list
}

function findTemplate(kind, remote, selectedId) {
  const list = templateList(kind, remote)
  return list.find((template) => template.id === selectedId) || list[0]
}

function resolveTemplate(kind, remote, selectedId) {
  const found = findTemplate(kind, remote, selectedId)
  if (!found || found.id === 'default' || !found.prompt) return null
  return { id: found.id, name: found.name, prompt: found.prompt }
}

/* Backwards-compatible helpers for the writing-style kind. */
function writingStyleList(remote) {
  return templateList('style', remote)
}
function findWritingStyle(prefs, remote) {
  return findTemplate('style', remote, prefs.writingStyle)
}
function resolveWritingStyle(prefs, remote) {
  return resolveTemplate('style', remote, prefs.writingStyle)
}

function TemplateSettings(props) {
  const { kind, prefsKey, boot, prefs, updatePrefs, showToast, onReload } = props
  const meta = TEMPLATE_KIND_META[kind]
  const [remote, setRemote] = React.useState(() => remoteTemplates(boot))
  const [busy, setBusy] = React.useState(false)
  const [draftName, setDraftName] = React.useState('')
  const [draftPrompt, setDraftPrompt] = React.useState('')
  const fileRef = React.useRef(null)

  React.useEffect(() => {
    setRemote(remoteTemplates(boot))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boot && boot.styles])

  const list = templateList(kind, remote)
  const selected = findTemplate(kind, remote, prefs[prefsKey])

  const persist = async (nextRemote, message) => {
    setBusy(true)
    try {
      const data = await api('/styles', { method: 'PUT', body: { styles: nextRemote } })
      setRemote(remoteTemplates({ styles: data.styles || nextRemote }))
      if (showToast) showToast(message || (meta.label + '模板已保存'))
      if (onReload) onReload()
      return true
    } catch (error) {
      if (showToast) showToast(meta.label + '模板保存失败：' + error.message, true)
      return false
    } finally {
      setBusy(false)
    }
  }

  const importFile = async (file) => {
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const incoming = normalizeTemplatePayload(parsed, kind)
      if (incoming.length === 0) {
        if (showToast) showToast('文件里没有可导入的模板（需要 name + prompt）', true)
        return
      }
      const existing = remote.slice()
      for (const template of incoming) {
        const withKind = { ...template, kind }
        const conflict = existing.findIndex((item) => item.id === withKind.id && item.kind !== kind)
        const target = conflict >= 0 ? { ...withKind, id: kind + '-' + withKind.id } : withKind
        const index = existing.findIndex((item) => item.id === target.id)
        if (index >= 0) existing[index] = target
        else existing.push(target)
      }
      const ok = await persist(existing.slice(0, TEMPLATE_LIMIT), '已导入 ' + incoming.length + ' 个' + meta.label + '模板')
      if (ok) updatePrefs({ [prefsKey]: incoming[0].id })
    } catch (error) {
      if (showToast) showToast('导入失败：' + error.message, true)
    }
  }

  const exportTemplates = () => {
    downloadJson('novel-terminal-' + kind + '-templates.json', {
      schema: 1,
      exportedAt: new Date().toISOString(),
      styles: remote.filter((template) => template.kind === kind),
    })
  }

  const deleteSelected = async () => {
    if (!selected || !selected.imported) {
      if (showToast) showToast('默认项与内置模板不能删除；可另存为自定义模板后修改', true)
      return
    }
    if (!window.confirm('删除自定义' + meta.label + '模板「' + selected.name + '」？')) return
    const ok = await persist(remote.filter((template) => template.id !== selected.id), '已删除「' + selected.name + '」')
    if (ok) updatePrefs({ [prefsKey]: 'default' })
  }

  const addCustom = async () => {
    const name = draftName.trim()
    const prompt = draftPrompt.trim()
    if (!name) {
      if (showToast) showToast('请填写模板名称', true)
      return
    }
    if (!prompt) {
      if (showToast) showToast('请填写模板提示词', true)
      return
    }
    const item = {
      id: kind + '-custom-' + Date.now().toString(36),
      kind,
      name: name.slice(0, 80),
      prompt: prompt.slice(0, TEMPLATE_PROMPT_LIMIT),
    }
    const ok = await persist([...remote, item].slice(-TEMPLATE_LIMIT), '已添加自定义' + meta.label + '模板「' + item.name + '」')
    if (ok) {
      updatePrefs({ [prefsKey]: item.id })
      setDraftName('')
      setDraftPrompt('')
    }
  }

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
    h('div', { className: 'nt-faint' }, meta.hint),
    h('select', {
      value: prefs[prefsKey],
      onChange: (event) => updatePrefs({ [prefsKey]: event.target.value }),
    },
      list.map((template) => h('option', { key: template.id, value: template.id },
        (template.imported ? '自定义 · ' : '') + template.name,
      )),
    ),
    selected ? h('div', null,
      h('div', { className: 'nt-faint' }, selected.description || ''),
      h('div', { className: 'nt-memory', style: { maxHeight: '120px' } }, selected.prompt || '（不附加指令）'),
    ) : null,
    h('div', { className: 'nt-row-actions' },
      h('button', { type: 'button', onClick: () => fileRef.current && fileRef.current.click(), disabled: busy }, '导入模板 JSON'),
      h('button', { type: 'button', onClick: exportTemplates, disabled: busy }, '导出本类模板'),
      h('button', { type: 'button', onClick: () => void deleteSelected(), disabled: busy }, '删除所选自定义'),
      h('input', {
        ref: fileRef,
        type: 'file',
        accept: '.json,application/json',
        style: { display: 'none' },
        onChange: (event) => {
          const file = event.target.files && event.target.files[0]
          event.target.value = ''
          void importFile(file)
        },
      }),
    ),
    h('details', null,
      h('summary', { className: 'nt-faint', style: { cursor: 'pointer' } }, '新建自定义' + meta.label + '模板'),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' } },
        h('input', {
          type: 'text',
          value: draftName,
          placeholder: '模板名称',
          onChange: (event) => setDraftName(event.target.value),
        }),
        h('textarea', {
          value: draftPrompt,
          placeholder: '给 AI 的提示词（最多 ' + TEMPLATE_PROMPT_LIMIT + ' 字）',
          style: { minHeight: '72px' },
          onChange: (event) => setDraftPrompt(event.target.value),
        }),
        h('div', null,
          h('button', { type: 'button', disabled: busy, onClick: () => void addCustom() }, '添加并选用'),
        ),
      ),
    ),
    h('div', { className: 'nt-faint' },
      '导入格式：{"schema":1,"styles":[{"name":"名称","prompt":"提示词","description":"可选"}]}；也接受数组。模板存入剧情目录 styles.json（同一文件按 kind 区分四类）。',
    ),
  )
}

/* ===== 10_styles.js ===== */
/* dsh-novel-arkterminal / CRT stylesheet (injected once by apply). */

const CSS = String.raw`
.nt-root {
  --nt-bg: #040907;
  --nt-bg-2: #07110d;
  --nt-panel: rgba(8, 22, 16, 0.82);
  --nt-panel-solid: #0a1712;
  --nt-line: rgba(87, 255, 176, 0.22);
  --nt-line-strong: rgba(87, 255, 176, 0.5);
  --nt-ink: #b9f5d8;
  --nt-ink-dim: #6fa88e;
  --nt-ink-faint: #416b58;
  --nt-accent: #57ffb0;
  --nt-amber: #ffb454;
  --nt-red: #ff6b6b;
  --nt-glow: 0 0 6px rgba(87, 255, 176, 0.35);
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: var(--nt-ink);
  background:
    radial-gradient(ellipse at 50% 0%, rgba(87, 255, 176, 0.08), transparent 60%),
    linear-gradient(180deg, var(--nt-bg-2), var(--nt-bg));
  font-family: "Cascadia Mono", "JetBrains Mono", "Sarasa Mono SC", "Noto Sans Mono CJK SC", ui-monospace, "Microsoft YaHei", monospace;
  font-size: 15px;
  line-height: 1.75;
  overflow: hidden;
}
.nt-root.nt-no-glow { --nt-glow: none; }
.nt-root.nt-no-scan .nt-scan { display: none; }
.nt-root * { box-sizing: border-box; }
.nt-root button {
  font-family: inherit;
  color: inherit;
  background: transparent;
  border: 1px solid var(--nt-line);
  border-radius: 4px;
  padding: 4px 10px;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
}
.nt-root button:hover { border-color: var(--nt-line-strong); background: rgba(87, 255, 176, 0.08); }
.nt-root button:focus-visible { outline: 1px solid var(--nt-accent); outline-offset: 2px; }
.nt-root button[disabled] { opacity: 0.45; cursor: not-allowed; }
.nt-root input, .nt-root textarea, .nt-root select {
  font-family: inherit;
  color: var(--nt-ink);
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid var(--nt-line);
  border-radius: 4px;
  padding: 5px 8px;
}
.nt-root textarea { resize: vertical; }
.nt-scan {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 30;
  background: repeating-linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0) 0px,
    rgba(0, 0, 0, 0) 2px,
    rgba(0, 0, 0, 0.22) 3px,
    rgba(0, 0, 0, 0) 4px
  );
  mix-blend-mode: multiply;
  opacity: 0.55;
}
.nt-vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 29;
  background: radial-gradient(ellipse at center, transparent 55%, rgba(0, 0, 0, 0.55) 100%);
}
.nt-flicker { animation: nt-flicker 6s infinite steps(1, end); }
@keyframes nt-flicker {
  0%, 97%, 100% { opacity: 1; }
  98% { opacity: 0.94; }
  99% { opacity: 0.98; }
}
@media (prefers-reduced-motion: reduce) {
  .nt-flicker { animation: none; }
}
.nt-header {
  position: relative;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--nt-line);
  background: linear-gradient(180deg, rgba(87, 255, 176, 0.06), transparent);
  flex: 0 0 auto;
}
.nt-title { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.nt-title-main { font-size: 17px; letter-spacing: 2px; color: var(--nt-accent); text-shadow: var(--nt-glow); white-space: nowrap; }
.nt-title-sub { color: var(--nt-ink-dim); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nt-header-spacer { flex: 1 1 auto; }
.nt-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--nt-ink-dim);
  border: 1px solid var(--nt-line);
  border-radius: 999px;
  padding: 2px 10px;
  white-space: nowrap;
}
.nt-chip.is-live { color: var(--nt-accent); border-color: var(--nt-line-strong); }
.nt-chip.is-warn { color: var(--nt-amber); border-color: rgba(255, 180, 84, 0.4); }
.nt-chip.is-error { color: var(--nt-red); border-color: rgba(255, 107, 107, 0.4); }
.nt-body { position: relative; z-index: 4; display: flex; flex: 1 1 auto; min-height: 0; }
.nt-main { flex: 1 1 auto; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.nt-reader {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 22px 28px 12px;
  scrollbar-width: thin;
  scrollbar-color: var(--nt-line-strong) transparent;
}
.nt-chapter { color: var(--nt-amber); font-size: 13px; letter-spacing: 2px; margin-bottom: 6px; }
.nt-node-title { color: var(--nt-accent); font-size: 20px; letter-spacing: 1px; margin: 0 0 14px; }
.nt-block { margin: 0 0 12px; white-space: pre-wrap; word-break: break-word; }
.nt-block-dialogue { color: #d6ffe9; }
.nt-speaker { color: var(--nt-accent); }
.nt-block-system { color: var(--nt-amber); font-size: 13px; border-left: 2px solid rgba(255, 180, 84, 0.5); padding-left: 10px; }
.nt-block-heading { color: var(--nt-accent); font-size: 16px; letter-spacing: 2px; border-bottom: 1px dashed var(--nt-line); padding-bottom: 6px; margin-top: 18px; }
.nt-dialog-row { display: flex; gap: 8px; align-items: flex-start; margin: 12px 0; }
.nt-dialog-row.is-self { flex-direction: row-reverse; }
.nt-dialog-avatar {
  flex: 0 0 auto;
  width: 2em;
  height: 2em;
  border-radius: 50%;
  border: 1px solid var(--nt-line-strong);
  background: rgba(87, 255, 176, 0.06);
  color: var(--nt-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8em;
  text-transform: uppercase;
}
.nt-dialog-row.is-self .nt-dialog-avatar { color: var(--nt-amber); border-color: rgba(255, 180, 84, 0.5); background: rgba(255, 180, 84, 0.08); }
.nt-dialog-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; max-width: 84%; }
.nt-dialog-row.is-self .nt-dialog-main { align-items: flex-end; }
.nt-dialog-name { color: var(--nt-ink-dim); font-size: 0.72em; letter-spacing: 0.08em; }
.nt-dialog-row.is-self .nt-dialog-name { color: var(--nt-amber); }
.nt-dialog-bubble {
  font-size: calc(1em * var(--nt-bubble-scale, 1));
  border: 1px solid var(--nt-line);
  border-radius: 4px 12px 12px 12px;
  background: rgba(10, 30, 22, 0.55);
  color: #d6ffe9;
  padding: 0.55em 0.8em;
  line-height: 1.75;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.nt-dialog-row.is-self .nt-dialog-bubble {
  border-color: rgba(255, 180, 84, 0.45);
  background: rgba(50, 35, 15, 0.45);
  border-radius: 12px 4px 12px 12px;
}
.nt-dialog-bubble .nt-cursor { margin-left: 3px; }
.nt-history { max-height: 62vh; overflow: auto; padding-right: 4px; }
.nt-history-stream { display: flex; flex-direction: column; gap: 6px; }
.nt-history-chapter {
  color: var(--nt-amber);
  font-size: 0.82em;
  letter-spacing: 0.14em;
  border-bottom: 1px dashed var(--nt-line);
  padding: 8px 0 6px;
  margin-top: 10px;
}
.nt-history-group { margin-bottom: 16px; border-left: 1px solid var(--nt-line); padding-left: 10px; }
.nt-history-title { color: var(--nt-accent); font-size: 0.82em; letter-spacing: 0.1em; margin-bottom: 6px; }
.nt-history-choice { color: var(--nt-amber); font-size: 0.78em; margin: 6px 0 0 2.6em; }
.nt-history-dialogue { margin: 8px 0; }
.nt-history .nt-dialog-main { max-width: 90%; }
.nt-history .nt-dialog-bubble { font-size: calc(1em * var(--nt-bubble-scale, 1)); }
.nt-we-link {
  border: none;
  padding: 0 2px;
  color: var(--nt-accent);
  border-bottom: 1px dotted var(--nt-accent);
  border-radius: 0;
  background: transparent;
  text-shadow: var(--nt-glow);
}
.nt-we-link:hover { background: rgba(87, 255, 176, 0.12); }
.nt-dlg-user { color: #ff7a5c; }
.nt-dlg-partner { color: #ff9ecb; }
.nt-dlg-npc { color: #5aa8ff; }
.nt-cursor { display: inline-block; width: 9px; height: 1.1em; margin-left: 2px; vertical-align: text-bottom; background: var(--nt-accent); animation: nt-blink 1s steps(1, end) infinite; }
@keyframes nt-blink { 50% { opacity: 0; } }
.nt-typing-hint { color: var(--nt-ink-faint); font-size: 12px; margin-top: 10px; }
.nt-choices { padding: 12px 28px 6px; display: flex; flex-direction: column; gap: 8px; flex: 0 0 auto; }
.nt-choice {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  text-align: left;
  padding: 9px 12px;
  border-radius: 4px;
  border: 1px solid var(--nt-line);
  background: rgba(87, 255, 176, 0.03);
  color: var(--nt-ink);
}
.nt-choice:hover { background: rgba(87, 255, 176, 0.1); }
.nt-choice.is-ai { border-left: 2px solid var(--nt-amber); }
.nt-choice-index { color: var(--nt-accent); flex: 0 0 auto; }
.nt-choice-hint { color: var(--nt-ink-dim); font-size: 12px; margin-left: 6px; }
.nt-input-row { display: flex; gap: 8px; padding: 8px 28px 10px; flex: 0 0 auto; }
.nt-input-row input { flex: 1 1 auto; }
.nt-action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 8px 28px 12px;
  border-top: 1px solid var(--nt-line);
  flex: 0 0 auto;
}
.nt-action-row .nt-grow { flex: 1 1 auto; }
.nt-side {
  flex: 0 0 320px;
  min-width: 0;
  border-left: 1px solid var(--nt-line);
  background: var(--nt-panel);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.nt-tabs { display: flex; flex-wrap: wrap; gap: 2px; padding: 10px 12px 0; }
.nt-tab { border: 1px solid transparent; border-bottom: none; border-radius: 4px 4px 0 0; padding: 4px 9px; color: var(--nt-ink-dim); font-size: 12px; }
.nt-tab.is-active { color: var(--nt-accent); border-color: var(--nt-line); background: rgba(87, 255, 176, 0.06); }
.nt-side-body { flex: 1 1 auto; overflow-y: auto; padding: 12px 14px 20px; min-height: 0; }
.nt-side h4 { margin: 14px 0 6px; color: var(--nt-accent); font-size: 13px; letter-spacing: 1px; font-weight: 600; }
.nt-side h4:first-child { margin-top: 0; }
.nt-muted { color: var(--nt-ink-dim); font-size: 12px; }
.nt-faint { color: var(--nt-ink-faint); font-size: 12px; }
.nt-list { display: flex; flex-direction: column; gap: 6px; }
.nt-list-item { border: 1px solid var(--nt-line); border-radius: 4px; padding: 6px 9px; background: rgba(0,0,0,0.18); font-size: 13px; }
.nt-list-item button { padding: 0; border: none; text-align: left; width: 100%; }
.nt-list-item:hover { border-color: var(--nt-line-strong); }
.nt-tag { display: inline-block; font-size: 11px; color: var(--nt-amber); border: 1px solid rgba(255,180,84,0.35); border-radius: 3px; padding: 0 5px; margin-left: 6px; }
.nt-tag.is-done { color: var(--nt-ink-faint); border-color: var(--nt-line); text-decoration: line-through; }
.nt-memory { white-space: pre-wrap; font-size: 13px; color: var(--nt-ink-dim); background: rgba(0,0,0,0.22); border: 1px solid var(--nt-line); border-radius: 4px; padding: 10px; max-height: 100%; overflow: auto; }
.nt-wb-item { border: 1px solid var(--nt-line); border-radius: 4px; padding: 8px 10px; margin-bottom: 6px; cursor: pointer; }
.nt-wb-item:hover { border-color: var(--nt-line-strong); background: rgba(87,255,176,0.05); }
.nt-wb-title { color: var(--nt-ink); font-size: 13px; }
.nt-wb-type { font-size: 11px; color: var(--nt-amber); margin-left: 6px; }
.nt-wb-summary { color: var(--nt-ink-dim); font-size: 12px; margin-top: 3px; }
.nt-modal-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(0, 4, 2, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.nt-modal {
  width: min(980px, 96vw);
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--nt-panel-solid);
  border: 1px solid var(--nt-line-strong);
  border-radius: 6px;
  box-shadow: 0 0 40px rgba(87, 255, 176, 0.12);
}
.nt-modal-head { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid var(--nt-line); }
.nt-modal-title { color: var(--nt-accent); letter-spacing: 2px; flex: 1 1 auto; }
.nt-modal-body { padding: 14px 16px; overflow: auto; min-height: 0; }
.nt-settings-grid { display: grid; grid-template-columns: 160px 1fr; gap: 10px 14px; align-items: center; }
.nt-settings-grid label { color: var(--nt-ink-dim); font-size: 13px; }
.nt-settings-grid .nt-row-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.nt-editor { display: flex; gap: 14px; min-height: 0; flex: 1 1 auto; }
.nt-editor-nav { flex: 0 0 220px; overflow: auto; display: flex; flex-direction: column; gap: 4px; }
.nt-editor-nav button { text-align: left; padding: 4px 8px; font-size: 12px; }
.nt-editor-nav button.is-active { border-color: var(--nt-line-strong); color: var(--nt-accent); background: rgba(87,255,176,0.08); }
.nt-editor-main { flex: 1 1 auto; min-width: 0; overflow: auto; display: flex; flex-direction: column; gap: 8px; }
.nt-editor-main textarea { width: 100%; min-height: 120px; font-size: 12px; line-height: 1.5; }
.nt-editor-main textarea.nt-code { min-height: 260px; }
.nt-editor-toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.nt-toast {
  position: absolute;
  left: 50%;
  bottom: 90px;
  transform: translateX(-50%);
  z-index: 50;
  background: rgba(4, 12, 8, 0.95);
  border: 1px solid var(--nt-line-strong);
  color: var(--nt-ink);
  border-radius: 4px;
  padding: 8px 16px;
  max-width: 70%;
  font-size: 13px;
  box-shadow: var(--nt-glow);
}
.nt-toast.is-error { border-color: rgba(255,107,107,0.6); color: #ffd0d0; }
.nt-empty { color: var(--nt-ink-faint); font-size: 13px; padding: 24px; text-align: center; }
.nt-boot { flex: 1 1 auto; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 12px; }
.nt-boot-title { color: var(--nt-accent); letter-spacing: 6px; font-size: 20px; text-shadow: var(--nt-glow); }
.nt-boot-line { color: var(--nt-ink-dim); font-size: 13px; }
.nt-boot-err { color: var(--nt-red); font-size: 13px; max-width: 640px; text-align: center; white-space: pre-wrap; }
.nt-sidebar-icon { display: block; }
.nt-hidden { display: none !important; }
.nt-immersive .nt-side { display: none; }
.nt-immersive .nt-reader { padding: 40px max(40px, 8vw) 20px; }
@media (max-width: 980px) {
  .nt-side { display: none; }
  .nt-reader { padding: 16px; }
  .nt-choices { padding: 10px 16px; }
  .nt-input-row { padding: 8px 16px; }
  .nt-action-row { padding: 8px 16px; }
}
`

/* ===== 20_app.js ===== */
/* dsh-novel-arkterminal / main terminal application. */

function useToastState() {
  const [toast, setToast] = React.useState(null)
  const timer = React.useRef(null)
  const show = React.useCallback((message, isError) => {
    setToast({ message, isError: Boolean(isError) })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), 3800)
  }, [])
  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  return [toast, show]
}

function TerminalApp() {
  const [prefs, setPrefs] = React.useState(loadPrefs)
  const [boot, setBoot] = React.useState(null)
  const [phase, setPhase] = React.useState('loading')
  const [error, setError] = React.useState(null)
  const [game, setGame] = React.useState(null)
  const [sideTab, setSideTab] = React.useState(prefs.sideTab || 'goals')
  const [wbEntry, setWbEntry] = React.useState(null)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [editorOpen, setEditorOpen] = React.useState(false)
  const [savesOpen, setSavesOpen] = React.useState(false)
  const [dialogueOpen, setDialogueOpen] = React.useState(false)
  const [immersive, setImmersive] = React.useState(false)
  const [reveal, setReveal] = React.useState(0)
  const [typingDone, setTypingDone] = React.useState(false)
  const [job, setJob] = React.useState(null)
  const [busy, setBusy] = React.useState(false)
  const [toast, showToast] = useToastState()

  const readerRef = React.useRef(null)
  const saveTimer = React.useRef(null)
  const revealTimer = React.useRef(null)
  const jobTimer = React.useRef(null)
  const bootRef = React.useRef(null)
  const gameRef = React.useRef(null)
  const pollRef = React.useRef(0)

  bootRef.current = boot
  gameRef.current = game

  React.useEffect(() => {
    writePrefs(prefs)
  }, [prefs])

  const updatePrefs = React.useCallback((patch) => {
    setPrefs((current) => ({ ...current, ...patch }))
  }, [])

  const story = boot && boot.story ? boot.story : null
  const node = story && game && story.nodes ? story.nodes[game.nodeId] : null
  const worldbook = (boot && boot.worldbook) || []
  const wbMap = React.useMemo(() => {
    const map = new Map()
    for (const entry of worldbook) map.set(entry.id, entry)
    return map
  }, [worldbook])
  const worldbookRef = React.useRef(worldbook)
  worldbookRef.current = worldbook

  const loadBootstrap = React.useCallback(async (options) => {
    const opts = options || {}
    setPhase(opts.silent ? 'ready' : 'loading')
    try {
      const data = await api('/bootstrap')
      setBoot(data)
      setPhase('ready')
      setError(null)
      const current = gameRef.current
      const keepNode = opts.keepGame && current && data.story.nodes[current.nodeId]
      if (keepNode) {
        setGame(current)
        return data
      }
      const auto = (data.saves && data.saves.slots || []).find((slot) => slot.slot === 'auto')
      let initialGame = null
      if (auto && auto.storyId === data.story.id) {
        try {
          const loaded = await api('/save?slot=auto')
          if (loaded.save && loaded.save.storyId === data.story.id && data.story.nodes[loaded.save.nodeId]) {
            initialGame = loadGameFromSave(loaded.save)
          }
        } catch {
          initialGame = null
        }
      }
      if (!initialGame) {
        initialGame = {
          nodeId: data.story.start,
          visited: [data.story.start],
          flags: {},
          history: [],
          snapshots: [],
          createdAt: new Date().toISOString(),
        }
      }
      setGame(initialGame)
      return data
    } catch (err) {
      setPhase('error')
      setError(err)
      return null
    }
  }, [])

  React.useEffect(() => {
    void loadBootstrap({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------------- typewriter ---------------- */

  const reducedMotion = prefs.reducedMotion || (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  React.useEffect(() => {
    if (!node) return
    const blocks = Array.isArray(node.blocks) ? node.blocks : []
    const total = blocks.reduce((sum, block) => sum + String(block && block.text || '').length, 0)
    if (revealTimer.current) clearInterval(revealTimer.current)
    if (total === 0 || reducedMotion || prefs.typingSpeed <= 0) {
      setReveal(total)
      setTypingDone(true)
      return
    }
    setReveal(0)
    setTypingDone(false)
    const step = Math.max(1, Math.round(total / 480))
    revealTimer.current = setInterval(() => {
      setReveal((current) => {
        const next = current + step
        if (next >= total) {
          clearInterval(revealTimer.current)
          setTypingDone(true)
          return total
        }
        return next
      })
    }, Math.max(4, Number(prefs.typingSpeed) || 18))
    return () => {
      if (revealTimer.current) clearInterval(revealTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game && game.nodeId, node && node.blocks, reducedMotion, prefs.typingSpeed])

  const skipTyping = React.useCallback(() => {
    if (!node) return
    const total = (node.blocks || []).reduce((sum, block) => sum + String(block && block.text || '').length, 0)
    if (revealTimer.current) clearInterval(revealTimer.current)
    setReveal(total)
    setTypingDone(true)
  }, [node])

  /* ---------------- persistence ---------------- */

  const persistSave = React.useCallback(async (nextGame) => {
    const currentBoot = bootRef.current
    const currentGame = nextGame || gameRef.current
    if (!currentBoot || !currentGame) return
    try {
      await api('/save', {
        method: 'POST',
        body: {
          slot: 'auto',
          save: saveStateFromGame(currentGame, currentBoot.meta.storyTitle, currentBoot.meta.storyId),
        },
      })
    } catch (err) {
      // Keep the terminal usable even if the host route is unavailable.
      console.warn('[novel-terminal] auto save failed', err)
    }
  }, [])

  React.useEffect(() => {
    if (!game || phase !== 'ready') return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void persistSave(game)
    }, 800)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game && game.nodeId, game && game.flags, game && game.history.length])

  /* ---------------- navigation ---------------- */

  const scrollTop = React.useCallback(() => {
    if (readerRef.current) readerRef.current.scrollTop = 0
  }, [])

  const pushHistory = React.useCallback((currentGame, entry, nextNodeId) => {
    const snapshot = {
      nodeId: currentGame.nodeId,
      visited: currentGame.visited.slice(),
      flags: JSON.parse(JSON.stringify(currentGame.flags || {})),
      historyLength: currentGame.history.length,
    }
    return {
      ...currentGame,
      nodeId: nextNodeId,
      visited: currentGame.visited.includes(nextNodeId) ? currentGame.visited : [...currentGame.visited, nextNodeId],
      history: [...currentGame.history, entry],
      snapshots: [...currentGame.snapshots.slice(-49), snapshot],
    }
  }, [])

  const applyEffects = React.useCallback((flags, effects) => {
    const next = { ...(flags || {}) }
    if (effects && effects.set && typeof effects.set === 'object') {
      Object.assign(next, effects.set)
    }
    return next
  }, [])

  const postEvent = React.useCallback(async (event) => {
    try {
      await api('/event', { method: 'POST', body: event })
    } catch (err) {
      console.warn('[novel-terminal] event failed', err)
    }
  }, [])

  const navigateTo = React.useCallback((nextNodeId, choice) => {
    const currentBoot = bootRef.current
    const currentGame = gameRef.current
    if (!currentBoot || !currentGame) return
    if (!currentBoot.story.nodes[nextNodeId]) {
      showToast('目标节点不存在：' + nextNodeId, true)
      return
    }
    if (prefs.sound) beep(660, 40, prefs.soundVolume)
    const flags = choice ? applyEffects(currentGame.flags, choice.effects) : currentGame.flags
    const entry = {
      nodeId: currentGame.nodeId,
      next: nextNodeId,
      choiceId: choice ? choice.id : null,
      choiceLabel: choice ? choice.label : null,
      at: new Date().toISOString(),
    }
    const nextGame = pushHistory({ ...currentGame, flags }, entry, nextNodeId)
    setGame(nextGame)
    scrollTop()
    void postEvent({
      type: 'choice',
      nodeId: currentGame.nodeId,
      choiceId: choice ? choice.id : null,
      choiceLabel: choice ? choice.label : null,
      state: { flags },
    })
  }, [applyEffects, postEvent, prefs.sound, prefs.soundVolume, pushHistory, scrollTop, showToast])

  const buildRecent = React.useCallback(() => {
    const currentBoot = bootRef.current
    const currentGame = gameRef.current
    if (!currentBoot || !currentGame) return []
    const tail = currentGame.history.slice(-3)
    return tail.map((entry) => {
      const historyNode = currentBoot.story.nodes[entry.nodeId]
      return {
        title: historyNode ? historyNode.title || historyNode.chapter || entry.nodeId : entry.nodeId,
        text: historyNode ? summarizeNode(historyNode, 500) : '',
        choiceLabel: entry.choiceLabel || '',
      }
    })
  }, [])

  /* ---------------- AI continuation ---------------- */

  const pollJob = React.useCallback(async (jobId) => {
    if (jobTimer.current) clearTimeout(jobTimer.current)
    try {
      const result = await api('/ai/job?id=' + encodeURIComponent(jobId))
      setJob(result)
      if (result.status === 'running') {
        jobTimer.current = setTimeout(() => { void pollJob(jobId) }, 1200)
        return
      }
      setBusy(false)
      if (result.status === 'done' && result.nodeId) {
        const currentGame = gameRef.current
        const currentBoot = bootRef.current
        if (!currentGame || !currentBoot) return
        const data = await loadBootstrap({ silent: true, keepGame: true })
        if (!data) return
        const entry = {
          nodeId: currentGame.nodeId,
          next: result.nodeId,
          choiceId: result.action && result.action.choiceId ? result.action.choiceId : null,
          choiceLabel: result.action && result.action.choiceLabel ? result.action.choiceLabel : null,
          ai: true,
          at: new Date().toISOString(),
        }
        const nextGame = pushHistory(currentGame, entry, result.nodeId)
        setGame(nextGame)
        scrollTop()
        if (prefs.sound) beep(520, 60, prefs.soundVolume)
        showToast('AI 续写完成' + (result.usage ? '（' + (result.usage.totalTokens || result.usage.outputTokens || 0) + ' tokens）' : ''))
        setTimeout(() => setJob(null), 4000)
      } else if (result.status === 'cancelled') {
        showToast('续写已取消')
        setTimeout(() => setJob(null), 2000)
      } else {
        showToast('续写失败：' + (result.error && result.error.message ? result.error.message : '未知错误'), true)
      }
    } catch (err) {
      setBusy(false)
      showToast('续写任务查询失败：' + err.message, true)
    }
  }, [loadBootstrap, prefs.sound, prefs.soundVolume, pushHistory, scrollTop, showToast])

  const startContinuation = React.useCallback(async (action) => {
    const currentBoot = bootRef.current
    const currentGame = gameRef.current
    if (!currentBoot || !currentGame) return
    if (!currentBoot.ai || !currentBoot.ai.available) {
      showToast('AI 不可用：' + ((currentBoot.ai && currentBoot.ai.reason) || '宿主未提供 llm 服务'), true)
      return
    }
    if (busy) return
    setBusy(true)
    setJob({ status: 'running', startedAt: new Date().toISOString() })
    if (prefs.sound) beep(430, 60, prefs.soundVolume)
    try {
      const result = await api('/ai/continue', {
        method: 'POST',
        body: {
          parentId: currentGame.nodeId,
          action,
          recent: buildRecent(),
          prefs: {
            provider: prefs.aiProvider || undefined,
            model: prefs.aiModel || undefined,
            temperature: prefs.aiTemperature,
            topP: prefs.aiTopP,
            presencePenalty: prefs.aiPresencePenalty,
            frequencyPenalty: prefs.aiFrequencyPenalty,
            maxTokens: prefs.aiMaxTokens,
            chapterWords: prefs.chapterWords,
            style: resolveTemplate('style', currentBoot.styles || [], prefs.writingStyle),
            logic: resolveTemplate('logic', currentBoot.styles || [], prefs.writingLogic),
            cot: resolveTemplate('cot', currentBoot.styles || [], prefs.writingCot),
            memoryFormat: resolveTemplate('memory', currentBoot.styles || [], prefs.memoryFormat),
          },
        },
      })
      setJob((current) => ({ ...(current || {}), id: result.jobId, status: 'running' }))
      void pollJob(result.jobId)
    } catch (err) {
      setBusy(false)
      setJob(null)
      showToast('续写请求失败：' + err.message, true)
    }
  }, [buildRecent, busy, pollJob, prefs, showToast])

  /* ---------------- interactions ---------------- */

  const choose = React.useCallback((choice) => {
    const currentBoot = bootRef.current
    const currentGame = gameRef.current
    if (!currentBoot || !currentGame || !choice) return
    if (prefs.sound) beep(720, 30, prefs.soundVolume)
    const requires = Array.isArray(choice.requires) ? choice.requires : []
    for (const condition of requires) {
      if (!condition || typeof condition.flag !== 'string') continue
      const value = currentGame.flags ? currentGame.flags[condition.flag] : undefined
      if (condition.equals !== undefined ? value !== condition.equals : !value) {
        showToast('条件未满足：' + condition.flag, true)
        return
      }
    }
    if (choice.ai || choice.next === null || choice.next === undefined) {
      void startContinuation({ type: 'choice', choiceId: choice.id, choiceLabel: choice.label })
      return
    }
    navigateTo(choice.next, choice)
  }, [navigateTo, prefs.sound, prefs.soundVolume, showToast, startContinuation])

  const submitInput = React.useCallback(async (text) => {
    const currentBoot = bootRef.current
    const currentGame = gameRef.current
    if (!currentBoot || !currentGame) return
    const payloadText = String(text || '').trim()
    if (!payloadText) return
    if (currentBoot.ai && currentBoot.ai.available && prefs.aiMode !== 'off') {
      await startContinuation({ type: 'input', text: payloadText })
      return
    }
    await postEvent({ type: 'input', nodeId: currentGame.nodeId, text: payloadText })
    showToast('已写入待处理事件（inbox.jsonl）')
  }, [postEvent, prefs.aiMode, showToast, startContinuation])

  const revertLast = React.useCallback(() => {
    const currentGame = gameRef.current
    if (!currentGame || !currentGame.snapshots || currentGame.snapshots.length === 0) {
      showToast('没有可回退的步骤', true)
      return
    }
    const snapshot = currentGame.snapshots[currentGame.snapshots.length - 1]
    const nextGame = {
      ...currentGame,
      nodeId: snapshot.nodeId,
      visited: snapshot.visited || currentGame.visited,
      flags: snapshot.flags || {},
      history: currentGame.history.slice(0, snapshot.historyLength),
      snapshots: currentGame.snapshots.slice(0, -1),
    }
    setGame(nextGame)
    scrollTop()
    showToast('已回退到上一步')
  }, [scrollTop, showToast])

  const refreshStory = React.useCallback(async () => {
    try {
      const data = await loadBootstrap({ silent: true, keepGame: true })
      if (data) showToast('剧情与记忆已刷新')
    } catch (err) {
      showToast('刷新失败：' + err.message, true)
    }
  }, [loadBootstrap, showToast])

  const enterImmersive = React.useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
        setImmersive(true)
      } else {
        await document.exitFullscreen()
        setImmersive(false)
      }
    } catch {
      setImmersive((value) => !value)
    }
  }, [])

  React.useEffect(() => {
    const onChange = () => setImmersive(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const openWorldbook = React.useCallback((entry) => {
    setWbEntry(entry)
    setSideTab('worldbook')
  }, [])

  /* ---------------- polling ---------------- */

  React.useEffect(() => {
    if (phase !== 'ready') return undefined
    const timer = setInterval(async () => {
      if (document.hidden) return
      pollRef.current += 1
      if (pollRef.current % 2 !== 0) return
      try {
        const currentBoot = bootRef.current
        if (!currentBoot) return
        const data = await api('/refresh')
        if (data.storyHash && currentBoot.meta && data.storyHash !== currentBoot.meta.storyHash && currentBoot.meta.version) {
          // story.json text changed → reload the whole package
          await loadBootstrap({ silent: true, keepGame: true })
        } else if (data.memoryHash) {
          // memory/plans changes are cheap to merge into the current view
          setBoot((current) => current ? { ...current } : current)
        }
      } catch {
        /* transient */
      }
    }, 8000)
    return () => clearInterval(timer)
  }, [loadBootstrap, phase])

  React.useEffect(() => {
    const onKey = (event) => {
      if (settingsOpen || editorOpen || savesOpen) {
        if (event.key === 'Escape') {
          setSettingsOpen(false)
          setEditorOpen(false)
          setSavesOpen(false)
        }
        return
      }
      if (event.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return
      if (event.key === ' ' || event.key === 'Enter') {
        if (!typingDone) {
          event.preventDefault()
          skipTyping()
        }
        return
      }
      const index = Number(event.key)
      const choices = node && Array.isArray(node.choices) ? node.choices : []
      if (Number.isInteger(index) && index >= 1 && index <= choices.length) {
        event.preventDefault()
        choose(choices[index - 1])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [choose, editorOpen, node, savesOpen, settingsOpen, skipTyping, typingDone])

  React.useEffect(() => () => {
    if (revealTimer.current) clearInterval(revealTimer.current)
    if (jobTimer.current) clearTimeout(jobTimer.current)
    if (saveTimer.current) clearTimeout(saveTimer.current)
  }, [])

  /* ---------------- render ---------------- */

  const rootClass = 'nt-root' +
    (prefs.scanlines ? '' : ' nt-no-scan') +
    (prefs.glow ? '' : ' nt-no-glow') +
    (immersive ? ' nt-immersive' : '')

  const wrap = (children) =>
    h('div', {
      className: rootClass,
      style: {
        fontSize: (15 * (Number(prefs.fontScale) || 1)) + 'px',
        '--nt-bubble-scale': String(Number(prefs.dialogueFontScale) || 1),
      },
    },
      children,
      toast ? h('div', { className: 'nt-toast' + (toast.isError ? ' is-error' : '') }, toast.message) : null,
    )

  if (phase === 'loading') {
    return wrap(h('div', { className: 'nt-boot' },
      h('div', { className: 'nt-boot-title' }, 'ARK TERMINAL'),
      h('div', { className: 'nt-boot-line' }, '正在连接方舟终端…'),
    ))
  }

  if (phase === 'error' || !boot || !story || !game || !node) {
    return wrap(h('div', { className: 'nt-boot' },
      h('div', { className: 'nt-boot-title' }, 'ARK TERMINAL'),
      h('div', { className: 'nt-boot-err' }, error ? error.message : '故事数据不可用'),
      h('button', { type: 'button', onClick: () => void loadBootstrap({}) }, '重试'),
    ))
  }

  const blocks = Array.isArray(node.blocks) ? node.blocks : []
  const choices = typingDone && Array.isArray(node.choices) ? node.choices : []
  const inputEnabled = typingDone && node.input && node.input.enabled !== false
  const activeStyle = findWritingStyle(prefs, boot.styles || [])
  const activeCot = findTemplate('cot', boot.styles || [], prefs.writingCot)

  const header = h('div', { className: 'nt-header nt-flicker' },
    h('div', { className: 'nt-title' },
      h('span', { className: 'nt-title-main' }, '方舟终端'),
      h('span', { className: 'nt-title-sub' }, story.title + (story.subtitle ? ' · ' + story.subtitle : '')),
    ),
    h('div', { className: 'nt-header-spacer' }),
    h('span', { className: 'nt-chip' }, '章节 ' + (node.chapter || node.title || '—')),
    h('span', { className: 'nt-chip', title: activeStyle && activeStyle.prompt ? activeStyle.prompt : '未附加文风指令' },
      '文风 ' + (activeStyle ? activeStyle.name : '默认'),
    ),
    activeCot && activeCot.id !== 'default'
      ? h('span', { className: 'nt-chip', title: activeCot.prompt }, '思维链 ' + activeCot.name)
      : null,
    h('span', {
      className: 'nt-chip ' + (boot.ai && boot.ai.available ? 'is-live' : 'is-warn'),
      title: boot.ai && boot.ai.reason ? boot.ai.reason : '',
    }, boot.ai && boot.ai.available ? 'AI ' + (boot.ai.model || '') : 'AI 离线'),
    job && job.status === 'running' ? h('span', { className: 'nt-chip is-live' }, '续写中…') : null,
    h('button', { type: 'button', onClick: () => setDialogueOpen(true) }, '对话历史'),
    h('button', { type: 'button', title: '手动存档', onClick: () => { void persistSave(game); showToast('已自动存入 auto 槽') } }, '存档'),
    h('button', { type: 'button', onClick: () => setSavesOpen(true) }, '读档'),
    prefs.editorMode ? h('button', { type: 'button', onClick: () => setEditorOpen(true) }, '编辑') : null,
    h('button', { type: 'button', onClick: () => setSettingsOpen(true) }, '设置'),
    h('button', { type: 'button', onClick: () => void enterImmersive() }, immersive ? '退出沉浸' : '沉浸'),
  )

  const reader = h('div', { className: 'nt-reader', ref: readerRef, onClick: () => { if (!typingDone) skipTyping() } },
    h('div', { className: 'nt-chapter' }, node.chapter || ''),
    node.title ? h('h2', { className: 'nt-node-title' }, node.title) : null,
    renderRevealedBlocks(blocks, reveal, worldbook, openWorldbook, playerDisplayName(worldbook)),
    typingDone ? null : h('div', { className: 'nt-typing-hint' }, '点击或按空格跳过'),
  )

  const choiceList = h('div', { className: 'nt-choices' },
    choices.length > 0
      ? choices.map((choice, index) => h('button', {
        key: choice.id || index,
        type: 'button',
        className: 'nt-choice' + (choice.ai || choice.next === null ? ' is-ai' : ''),
        onClick: () => choose(choice),
      },
        h('span', { className: 'nt-choice-index' }, String(index + 1) + '.'),
        h('span', null, choice.label),
        choice.hint ? h('span', { className: 'nt-choice-hint' }, choice.hint) : null,
      ))
      : typingDone
        ? h('div', { className: 'nt-muted' }, '（没有预设选项，可以自由输入，或让 AI 续写）')
        : null,
  )

  const inputRow = typingDone ? h('form', {
    className: 'nt-input-row',
    onSubmit: (event) => {
      event.preventDefault()
      const form = event.currentTarget
      const input = form.elements && form.elements.namedItem('nt-input')
      const value = input ? input.value : ''
      if (input) input.value = ''
      void submitInput(value)
    },
  },
    h('input', {
      name: 'nt-input',
      type: 'text',
      autoComplete: 'off',
      placeholder: (node.input && node.input.placeholder) || '自由输入，交给 AI 继续故事…',
      'aria-label': '自由输入',
    }),
    h('button', { type: 'submit', disabled: busy }, busy ? '续写中…' : '发送'),
  ) : null

  const actions = h('div', { className: 'nt-action-row' },
    h('button', { type: 'button', onClick: revertLast }, '回退'),
    h('button', { type: 'button', onClick: () => void refreshStory() }, '刷新'),
    boot.ai && boot.ai.available
      ? h('button', {
        type: 'button',
        disabled: busy,
        onClick: () => void startContinuation({ type: 'enter' }),
      }, busy ? 'AI 续写中…' : 'AI 续写')
      : null,
    job && job.status === 'running' && job.id
      ? h('button', { type: 'button', onClick: async () => { try { await api('/ai/cancel', { method: 'POST', body: { id: job.id } }) } catch (err) { showToast(err.message, true) } } }, '取消续写')
      : null,
    h('span', { className: 'nt-grow' }),
    h('span', { className: 'nt-faint' }, '节点 ' + game.nodeId + ' · 已走 ' + game.history.length + ' 步'),
  )

  const side = h(SidePanel, {
    boot,
    game,
    node,
    sideTab,
    setSideTab,
    wbEntry,
    setWbEntry,
    openWorldbook,
    prefs,
    showToast,
    onReload: () => void loadBootstrap({ silent: true, keepGame: true }),
  })

  const modals = []
  if (settingsOpen) {
    modals.push(h(SettingsPanel, {
      key: 'settings',
      prefs,
      updatePrefs,
      boot,
      onClose: () => setSettingsOpen(false),
      onReload: () => void loadBootstrap({ silent: true, keepGame: true }),
      showToast,
    }))
  }
  if (savesOpen) {
    modals.push(h(SavesPanel, {
      key: 'saves',
      boot,
      game,
      story,
      onClose: () => setSavesOpen(false),
      showToast,
      setGame: (nextGame) => { setGame(nextGame); scrollTop() },
    }))
  }
  if (editorOpen) {
    modals.push(h(EditorPanel, {
      key: 'editor',
      boot,
      prefs,
      onClose: () => setEditorOpen(false),
      onReload: () => void loadBootstrap({ silent: true, keepGame: true }),
      showToast,
    }))
  }
  if (dialogueOpen) {
    modals.push(h(DialogueHistoryPanel, {
      key: 'dialogue',
      story,
      game,
      boot,
      onClose: () => setDialogueOpen(false),
    }))
  }

  return wrap([
    h('div', { key: 'scan', className: 'nt-scan' }),
    h('div', { key: 'vignette', className: 'nt-vignette' }),
    header,
    h('div', { key: 'body', className: 'nt-body' },
      h('div', { className: 'nt-main' },
        reader,
        choiceList,
        inputRow,
        actions,
      ),
      side,
    ),
    ...modals,
  ])
}

function renderRichText(visible, index, map, openEntry) {
  const children = []
  const linkRe = /\[\[([\w:.-]+)\|([^\]]+)\]\]/g
  const tagRe = /<(user|partner|npc)-dialogue>([\s\S]*?)<\/\1-dialogue>/g
  let i = 0
  while (i < visible.length) {
    linkRe.lastIndex = i
    tagRe.lastIndex = i
    const link = linkRe.exec(visible)
    const tag = tagRe.exec(visible)
    let next = null
    if (link && (!tag || link.index <= tag.index)) {
      next = { type: 'link', index: link.index, end: linkRe.lastIndex, match: link }
    } else if (tag) {
      next = { type: 'tag', index: tag.index, end: tagRe.lastIndex, match: tag }
    }
    if (!next) {
      children.push(visible.slice(i))
      break
    }
    if (next.index > i) children.push(visible.slice(i, next.index))
    if (next.type === 'link') {
      const entry = map.get(next.match[1])
      children.push(h('button', {
        key: 'we-' + index + '-' + next.index,
        type: 'button',
        className: 'nt-we-link',
        title: entry ? entry.title : next.match[1],
        onClick: (event) => { event.stopPropagation(); if (entry) openEntry(entry) },
      }, next.match[2]))
    } else {
      children.push(h('span', {
        key: 'dlg-' + index + '-' + next.index,
        className: 'nt-dlg-' + next.match[1],
      }, next.match[2]))
    }
    i = next.end
  }
  return children
}

function playerDisplayName(worldbook) {
  const entries = worldbook || []
  const entry = entries.find((item) => item && item.id === 'wb-player') ||
    entries.find((item) => item && /玩家角色/.test(item.title || ''))
  if (!entry) return ''
  const title = String(entry.title || '').replace(/^玩家角色\s*[·:：-]\s*/, '').trim()
  return title.split(/[（(]/)[0].trim() || title
}

function isPlayerSpeaker(speaker, playerName) {
  if (!speaker || !playerName) return false
  const value = String(speaker)
  return value.includes(playerName) || playerName.includes(value)
}

function renderRevealedBlocks(blocks, reveal, worldbook, openEntry, playerName) {
  const map = new Map()
  for (const entry of worldbook || []) map.set(entry.id, entry)
  const nodes = []
  let consumed = 0
  blocks.forEach((block, index) => {
    const text = String(block && block.text ? block.text : '')
    const remaining = reveal - consumed
    consumed += text.length
    if (remaining <= 0) return
    const visible = remaining >= text.length ? text : text.slice(0, remaining)
    const children = renderRichText(visible, index, map, openEntry)
    const completed = remaining >= text.length
    if (!completed) children.push(h('span', { key: 'cursor', className: 'nt-cursor' }))
    if (block.type === 'dialogue' && block.speaker) {
      const self = isPlayerSpeaker(block.speaker, playerName)
      nodes.push(h('div', { key: 'b-' + index, className: 'nt-dialog-row' + (self ? ' is-self' : '') },
        h('div', { className: 'nt-dialog-avatar', title: block.speaker }, String(block.speaker).slice(0, 1)),
        h('div', { className: 'nt-dialog-main' },
          h('div', { className: 'nt-dialog-name' }, block.speaker),
          h('div', { className: 'nt-dialog-bubble' }, children),
        ),
      ))
      return
    }
    const className = 'nt-block nt-block-' +
      (block.type === 'system' ? 'system' : block.type === 'heading' ? 'heading' : 'narration')
    nodes.push(h(block.type === 'heading' ? 'div' : 'p', { key: 'b-' + index, className }, children))
  })
  return nodes
}

/* ===== 25_panels.js ===== */
/* dsh-novel-arkterminal / side panels, settings, save manager. */

function Modal(props) {
  const handleMask = (event) => {
    if (event.target === event.currentTarget && props.onClose) props.onClose()
  }
  return h('div', { className: 'nt-modal-mask', onMouseDown: handleMask },
    h('div', { className: 'nt-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': props.title },
      h('div', { className: 'nt-modal-head' },
        h('span', { className: 'nt-modal-title' }, props.title),
        h('span', { style: { flex: '1 1 auto' } }),
        h('button', { type: 'button', onClick: props.onClose }, '关闭'),
      ),
      h('div', { className: 'nt-modal-body', style: props.bodyStyle }, props.children),
    ),
  )
}

function downloadJson(filename, value) {
  try {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  } catch (error) {
    console.warn('[novel-terminal] download failed', error)
  }
}

function WorldbookImportControl(props) {
  const { boot, showToast, onReload } = props
  const [mode, setMode] = React.useState('merge')
  const [resetRelated, setResetRelated] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const fileRef = React.useRef(null)

  const importFile = async (file) => {
    if (!file) return
    const warning = mode === 'replace'
      ? (resetRelated
        ? '将覆盖现有世界书，并清空计划、记忆区、存档与 AI 生成记录。继续？'
        : '将覆盖现有世界书（保留计划、记忆、存档与生成记录）。继续？')
      : (resetRelated
        ? '将把条目合并进现有世界书，并清空计划/记忆/存档/生成记录。继续？'
        : '将把条目合并进现有世界书（保留计划与记忆）。继续？')
    if (!window.confirm(warning)) return
    setBusy(true)
    try {
      const text = await file.text()
      const body = {
        text,
        mode,
        baseVersion: boot && boot.meta ? boot.meta.version : undefined,
      }
      if (resetRelated) body.reset = { plans: true, memory: true, saves: true, generated: true }
      const data = await api('/worldbook/import', { method: 'POST', body })
      const resetNote = data.reset && Object.keys(data.reset).length > 0 ? '，已清空计划/记忆/存档/生成记录' : ''
      if (showToast) {
        showToast('已导入 ' + data.imported + ' 条世界书（' + (data.mode === 'replace' ? '覆盖' : '合并') + '，现共 ' + data.total + ' 条）' + resetNote)
      }
      if (onReload) onReload()
    } catch (error) {
      if (showToast) showToast('世界书导入失败：' + error.message, true)
    } finally {
      setBusy(false)
    }
  }

  const exportWorldbook = () => {
    downloadJson('worldbook.json', { schema: 1, worldbook: (boot && boot.worldbook) || [] })
  }

  return h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' } },
    h('select', {
      value: mode,
      title: '合并：同 id 覆盖；覆盖：替换现有全部世界书',
      onChange: (event) => {
        const next = event.target.value
        setMode(next)
        setResetRelated(next === 'replace')
      },
    },
      h('option', { value: 'merge' }, '合并'),
      h('option', { value: 'replace' }, '覆盖'),
    ),
    h('label', { style: { display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' } },
      h('input', {
        type: 'checkbox',
        checked: resetRelated,
        onChange: (event) => setResetRelated(event.target.checked),
      }),
      '同时清空计划/记忆/存档/生成记录',
    ),
    h('button', { type: 'button', disabled: busy, onClick: () => fileRef.current && fileRef.current.click() },
      busy ? '导入中…' : '导入世界书'),
    h('button', { type: 'button', disabled: busy, onClick: exportWorldbook }, '导出世界书'),
    h('input', {
      ref: fileRef,
      type: 'file',
      accept: '.json,.md,.markdown,.txt,application/json,text/markdown,text/plain',
      style: { display: 'none' },
      onChange: (event) => {
        const file = event.target.files && event.target.files[0]
        event.target.value = ''
        void importFile(file)
      },
    }),
  )
}

function DialogueHistoryPanel(props) {
  const { story, game, boot, onClose } = props
  const playerName = playerDisplayName(boot && boot.worldbook)
  const history = (game && game.history) || []
  const path = []
  const seen = new Set()
  for (const nodeId of (game && game.visited) || []) {
    if (!nodeId || seen.has(nodeId)) continue
    seen.add(nodeId)
    path.push(nodeId)
  }
  if (game && game.nodeId && !seen.has(game.nodeId)) path.push(game.nodeId)
  const items = []
  let lastChapter = null
  let total = 0
  for (const nodeId of path) {
    const node = story && story.nodes ? story.nodes[nodeId] : null
    if (!node) continue
    const dialogues = (Array.isArray(node.blocks) ? node.blocks : [])
      .filter((block) => block && block.type === 'dialogue' && String(block.text || '').trim())
    const step = history.find((entry) => entry.nodeId === nodeId)
    const choiceLabel = step && step.choiceLabel ? step.choiceLabel : ''
    if (dialogues.length === 0 && !choiceLabel) continue
    const chapter = node.chapter || node.title || '未分章'
    if (chapter !== lastChapter) {
      items.push({ type: 'chapter', key: 'chapter-' + nodeId, title: chapter })
      lastChapter = chapter
    }
    dialogues.forEach((block, index) => {
      items.push({ type: 'dialogue', key: 'd-' + nodeId + '-' + index, block })
      total += 1
    })
    if (choiceLabel) items.push({ type: 'choice', key: 'c-' + nodeId, label: choiceLabel })
  }
  const chapterCount = items.filter((item) => item.type === 'chapter').length
  return h(Modal, { title: '对话历史' + (playerName ? ' · ' + playerName : ''), onClose },
    h('div', { className: 'nt-history' },
      h('div', { className: 'nt-faint', style: { marginBottom: '10px' } },
        '共 ' + total + ' 句对话 · ' + chapterCount + ' 个章节，已按剧情顺序连成一条记录'),
      items.length === 0
        ? h('div', { className: 'nt-empty' }, '还没有可回看的对话。读到带对话的剧情后再来看看。')
        : h('div', { className: 'nt-history-stream' },
          items.map((item) => {
            if (item.type === 'chapter') {
              return h('div', { key: item.key, className: 'nt-history-chapter' }, item.title)
            }
            if (item.type === 'choice') {
              return h('div', { key: item.key, className: 'nt-history-choice' }, '选择：' + item.label)
            }
            const self = isPlayerSpeaker(item.block.speaker, playerName)
            return h('div', { key: item.key, className: 'nt-dialog-row nt-history-dialogue' + (self ? ' is-self' : '') },
              h('div', { className: 'nt-dialog-avatar' }, String(item.block.speaker || '？').slice(0, 1)),
              h('div', { className: 'nt-dialog-main' },
                h('div', { className: 'nt-dialog-name' }, item.block.speaker || '旁白'),
                h('div', { className: 'nt-dialog-bubble' }, item.block.text),
              ),
            )
          }),
        ),
    ),
  )
}

function SidePanel(props) {
  const { boot, node, sideTab, setSideTab, wbEntry, setWbEntry, openWorldbook, showToast } = props
  const [search, setSearch] = React.useState('')
  const [memory, setMemory] = React.useState(boot ? boot.memory : '')
  const [memoryBusy, setMemoryBusy] = React.useState(false)
  const [memoryEditing, setMemoryEditing] = React.useState(false)
  const [memoryDraft, setMemoryDraft] = React.useState(boot ? boot.memory : '')
  const [memorySaving, setMemorySaving] = React.useState(false)

  React.useEffect(() => {
    const next = boot ? boot.memory : ''
    setMemory(next)
    if (!memoryEditing) setMemoryDraft(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boot && boot.memory])

  const refreshMemory = async () => {
    setMemoryBusy(true)
    try {
      const data = await api('/memory')
      setMemory(data.memory || '')
      setMemoryDraft(data.memory || '')
    } catch (error) {
      if (showToast) showToast('读取记忆失败：' + error.message, true)
    } finally {
      setMemoryBusy(false)
    }
  }

  const saveMemoryDraft = async () => {
    setMemorySaving(true)
    try {
      const data = await api('/memory', { method: 'PUT', body: { memory: memoryDraft } })
      setMemory(data.memory || '')
      setMemoryDraft(data.memory || '')
      setMemoryEditing(false)
      if (showToast) showToast('记忆区已保存')
    } catch (error) {
      if (showToast) showToast('记忆区保存失败：' + error.message, true)
    } finally {
      setMemorySaving(false)
    }
  }

  const appendMemory = async () => {
    const text = window.prompt('追加到记忆区的内容：')
    if (!text || !text.trim()) return
    try {
      const next = (memory.trimEnd() + '\n\n- ' + text.trim() + '\n').trimStart()
      const data = await api('/memory', { method: 'PUT', body: { memory: next } })
      setMemory(data.memory || '')
      setMemoryDraft(data.memory || '')
      if (showToast) showToast('已追加到记忆区')
    } catch (error) {
      if (showToast) showToast('追加失败：' + error.message, true)
    }
  }

  const plans = []
  for (const plan of boot && Array.isArray(boot.plans) ? boot.plans : []) plans.push({ ...plan, scope: '计划' })
  for (const goal of node && Array.isArray(node.goals) ? node.goals : []) plans.push({ ...goal, scope: '本节点' })
  const openPlans = plans.filter((plan) => plan.status !== 'done')
  const donePlans = plans.filter((plan) => plan.status === 'done')
  const story = boot ? boot.story : null
  const worldbook = boot && Array.isArray(boot.worldbook) ? boot.worldbook : []
  const filtered = search.trim()
    ? worldbook.filter((entry) => ((entry.title || '') + ' ' + (entry.summary || '') + ' ' + (entry.body || '')).toLowerCase().includes(search.trim().toLowerCase()))
    : worldbook

  const tabs = [
    { id: 'goals', label: '目标' },
    { id: 'memory', label: '记忆' },
    { id: 'cot', label: '思维链' },
    { id: 'worldbook', label: '世界书' },
    { id: 'status', label: '状态' },
  ]

  let body = null
  if (sideTab === 'goals') {
    body = h('div', null,
      h('h4', null, '未完成目标'),
      openPlans.length === 0 ? h('div', { className: 'nt-muted' }, '暂无未完成目标') : h('div', { className: 'nt-list' },
        openPlans.map((plan) => h('div', { key: (plan.scope || '') + plan.id, className: 'nt-list-item' },
          h('span', { className: 'nt-wb-title' }, plan.label),
          h('span', { className: 'nt-tag' }, plan.kind === 'objective' ? '目标' : '计划'),
          plan.detail ? h('div', { className: 'nt-muted', style: { marginTop: '3px' } }, plan.detail) : null,
          h('div', { className: 'nt-faint', style: { marginTop: '2px' } }, plan.scope || ''),
        ))),
      h('h4', null, '已完成'),
      donePlans.length === 0 ? h('div', { className: 'nt-muted' }, '暂无已完成项') : h('div', { className: 'nt-list' },
        donePlans.map((plan) => h('div', { key: (plan.scope || '') + plan.id, className: 'nt-list-item' },
          h('span', { className: 'nt-wb-title' }, plan.label),
          h('span', { className: 'nt-tag is-done' }, '已完成'),
        ))),
    )
  } else if (sideTab === 'memory') {
    const memoryPath = boot && boot.paths ? boot.paths.memoryFile : '—'
    body = h('div', null,
      h('h4', null, 'AI 记忆区'),
      h('div', { className: 'nt-faint', style: { marginBottom: '3px' } }, 'memory.md · AI 可读写；编辑会直接写入剧情目录'),
      h('div', { className: 'nt-faint', style: { marginBottom: '8px' } },
        '格式：' + findTemplate('memory', boot && boot.styles ? boot.styles : [], props.prefs ? props.prefs.memoryFormat : 'default').name),
      h('div', { className: 'nt-faint', style: { marginBottom: '8px', wordBreak: 'break-all' } },
        memoryPath + ' · ' + String(memoryDraft || '').length + ' 字符'),
      memoryEditing
        ? h('div', null,
          h('textarea', {
            value: memoryDraft,
            placeholder: '# 记忆区\n\n（可以写设定、事件摘要、伏笔提醒；AI 会读到它。）',
            style: { width: '100%', minHeight: '260px' },
            onChange: (event) => setMemoryDraft(event.target.value),
          }),
          h('div', { style: { marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' } },
            h('button', { type: 'button', disabled: memorySaving, onClick: () => void saveMemoryDraft() }, memorySaving ? '保存中…' : '保存'),
            h('button', { type: 'button', onClick: () => { setMemoryEditing(false); setMemoryDraft(memory) } }, '取消'),
            h('button', { type: 'button', disabled: memoryBusy, onClick: () => void refreshMemory() }, '重新读取'),
          ),
        )
        : h('div', null,
          h('div', { className: 'nt-memory', style: { minHeight: '120px' } },
            memory && memory.trim() ? memory : '（记忆区为空。AI 续写后会在这里追加摘要。）'),
          h('div', { style: { marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' } },
            h('button', { type: 'button', onClick: () => { setMemoryDraft(memory); setMemoryEditing(true) } }, '编辑'),
            h('button', { type: 'button', disabled: memoryBusy, onClick: () => void refreshMemory() }, memoryBusy ? '读取中…' : '重新读取'),
            h('button', { type: 'button', onClick: () => void appendMemory() }, '追加一条'),
          ),
        ),
    )
  } else if (sideTab === 'cot') {
    const cot = findTemplate('cot', boot && boot.styles ? boot.styles : [], props.prefs ? props.prefs.writingCot : 'default')
    const generated = boot && Array.isArray(boot.generated) ? boot.generated.filter((record) => record.reasoning) : []
    body = h('div', null,
      h('h4', null, '思维链'),
      h('div', { className: 'nt-faint', style: { marginBottom: '6px' } },
        '模板：' + cot.name + ' · 只保存在 generated 记录里，不进入正文'),
      h('div', { className: 'nt-memory', style: { maxHeight: '110px', marginBottom: '8px' } }, cot.prompt || '（未启用思维链）'),
      h('h4', null, '最近记录'),
      generated.length === 0
        ? h('div', { className: 'nt-muted' }, '暂无思维链记录。启用并完成一次 AI 续写后，这里会显示 reasoning。')
        : h('div', { className: 'nt-list' },
          generated.slice().reverse().slice(0, 8).map((record) => h('div', { key: record.id, className: 'nt-list-item' },
            h('div', { className: 'nt-wb-title' }, record.title || '续写'),
            h('div', { className: 'nt-faint' }, formatDate(record.createdAt) + (record.templates && record.templates.cot ? ' · ' + record.templates.cot : '')),
            h('div', { className: 'nt-memory', style: { marginTop: '4px', maxHeight: '120px' } }, record.reasoning || ''),
          ))),
    )
  } else if (sideTab === 'worldbook') {
    body = h('div', null,
      h('h4', null, '世界书'),
      h(WorldbookImportControl, { boot, showToast, onReload: props.onReload }),
      h('input', {
        type: 'search',
        value: search,
        placeholder: '搜索人物/地点/科技/事件…',
        style: { width: '100%', marginTop: '8px', marginBottom: '8px' },
        onChange: (event) => setSearch(event.target.value),
      }),
      wbEntry
        ? h('div', { style: { marginBottom: '10px' } },
          h('button', { type: 'button', onClick: () => setWbEntry(null) }, '← 返回列表'),
          h('h4', null, wbEntry.title + (wbEntry.type ? ' · ' + wbEntry.type : '')),
          wbEntry.summary ? h('div', { className: 'nt-muted', style: { marginBottom: '6px' } }, wbEntry.summary) : null,
          h('div', { className: 'nt-memory' }, wbEntry.body || wbEntry.summary || '（暂无详细条目）'),
        )
        : h('div', null,
          filtered.length === 0 ? h('div', { className: 'nt-muted' }, '没有匹配条目') : null,
          filtered.map((entry) => h('div', {
            key: entry.id,
            className: 'nt-wb-item',
            onClick: () => openWorldbook(entry),
          },
            h('span', { className: 'nt-wb-title' }, entry.title),
            entry.type ? h('span', { className: 'nt-wb-type' }, entry.type) : null,
            entry.summary ? h('div', { className: 'nt-wb-summary' }, entry.summary) : null,
          )),
        ),
    )
  } else {
    const visited = props.game ? props.game.visited.length : 0
    const saves = boot && boot.saves && Array.isArray(boot.saves.slots) ? boot.saves.slots : []
    body = h('div', null,
      h('h4', null, '运行状态'),
      h('div', { className: 'nt-muted' }, '故事：' + (story ? story.title : '—')),
      h('div', { className: 'nt-muted' }, '节点：' + (props.game ? props.game.nodeId : '—')),
      h('div', { className: 'nt-muted' }, '已访问：' + visited + ' 个节点'),
      h('div', { className: 'nt-muted' }, '历史步骤：' + (props.game ? props.game.history.length : 0)),
      h('div', { className: 'nt-muted' }, '内容版本：' + (boot && boot.meta ? String(boot.meta.version).slice(0, 12) : '—')),
      h('div', { className: 'nt-muted' }, 'AI 续写记录：' + (boot && boot.meta && boot.meta.counts ? boot.meta.counts.generated : 0)),
      h('div', { className: 'nt-muted' }, '文风：' + findTemplate('style', boot && boot.styles ? boot.styles : [], props.prefs ? props.prefs.writingStyle : 'default').name +
        ' · 语言逻辑：' + findTemplate('logic', boot && boot.styles ? boot.styles : [], props.prefs ? props.prefs.writingLogic : 'default').name),
      h('div', { className: 'nt-muted' }, '思维链：' + findTemplate('cot', boot && boot.styles ? boot.styles : [], props.prefs ? props.prefs.writingCot : 'default').name +
        ' · 记忆格式：' + findTemplate('memory', boot && boot.styles ? boot.styles : [], props.prefs ? props.prefs.memoryFormat : 'default').name),
      h('h4', null, '存档'),
      saves.length === 0 ? h('div', { className: 'nt-muted' }, '暂无存档') : h('div', { className: 'nt-list' },
        saves.map((slot) => h('div', { key: slot.slot, className: 'nt-list-item' },
          h('span', { className: 'nt-wb-title' }, slot.slot),
          h('span', { className: 'nt-faint' }, ' · ' + formatDate(slot.updatedAt) + ' · ' + (slot.nodeId || '')),
        ))),
      h('h4', null, '路径'),
      h('div', { className: 'nt-faint', style: { wordBreak: 'break-all' } }, boot && boot.paths ? boot.paths.root : '—'),
    )
  }

  return h('div', { className: 'nt-side' },
    h('div', { className: 'nt-tabs' },
      tabs.map((tab) => h('button', {
        key: tab.id,
        type: 'button',
        className: 'nt-tab' + (sideTab === tab.id ? ' is-active' : ''),
        onClick: () => setSideTab(tab.id),
      }, tab.label)),
    ),
    h('div', { className: 'nt-side-body' }, body),
  )
}

function SettingsPanel(props) {
  const { prefs, updatePrefs, boot, onClose, onReload, showToast } = props
  const [aiInfo, setAiInfo] = React.useState(boot ? boot.ai : null)
  const [busy, setBusy] = React.useState(false)
  const [editorMode, setEditorMode] = React.useState(Boolean(prefs.editorMode))
  const [importing, setImporting] = React.useState(false)
  const [resetStoryImport, setResetStoryImport] = React.useState(true)
  const [resetting, setResetting] = React.useState(false)
  const [manuscripts, setManuscripts] = React.useState(null)

  const refreshAi = async () => {
    try {
      const info = await api('/ai/config')
      setAiInfo(info)
      showToast(info.available ? 'AI 可用：' + info.provider + ' / ' + info.model : 'AI 不可用：' + (info.reason || '未知原因'), !info.available)
    } catch (error) {
      showToast('AI 状态查询失败：' + error.message, true)
    }
  }

  const importStory = async () => {
    const warning = resetStoryImport
      ? '用 manuscript/ 目录里的 Markdown 覆盖 story.json，并清空计划、记忆区、存档与 AI 生成记录？会先自动备份。'
      : '用 manuscript/ 目录里的 Markdown 覆盖 story.json（保留计划、记忆、存档与生成记录）？会先自动备份。'
    if (!window.confirm(warning)) return
    setImporting(true)
    try {
      const importBody = {}
      if (resetStoryImport) importBody.reset = { plans: true, memory: true, saves: true, generated: true }
      const result = await api('/story/import', { method: 'POST', body: importBody })
      const resetNote = result.reset && Object.keys(result.reset).length > 0 ? '（已重置计划/记忆/存档/生成记录）' : ''
      showToast('导入完成：' + result.chapters + ' 个章节' + resetNote)
      onReload()
    } catch (error) {
      showToast('导入失败：' + error.message, true)
    } finally {
      setImporting(false)
    }
  }

  const resetState = async (all) => {
    const warning = all
      ? '清空计划、记忆区、存档与 AI 生成记录？此操作不可撤销。'
      : '清空计划与记忆区？此操作不可撤销（记忆区清空后只能靠手动/外部备份恢复）。'
    if (!window.confirm(warning)) return
    setResetting(true)
    try {
      const body = all
        ? { reset: { plans: true, memory: true, saves: true, generated: true } }
        : { reset: { plans: true, memory: true } }
      await api('/reset', { method: 'POST', body })
      showToast(all ? '已清空计划/记忆/存档/生成记录' : '已清空计划与记忆区')
      onReload()
    } catch (error) {
      showToast('重置失败：' + error.message, true)
    } finally {
      setResetting(false)
    }
  }

  const listManuscripts = async () => {
    try {
      const data = await api('/manuscript')
      setManuscripts(data.files || [])
    } catch (error) {
      showToast(error.message, true)
    }
  }

  const models = aiInfo && Array.isArray(aiInfo.models) ? aiInfo.models : []
  return h(Modal, { title: '终端设置', onClose },
    h('div', { className: 'nt-settings-grid' },
      h('h4', { style: { gridColumn: '1 / span 2' } }, '显示'),
      h('label', null, '字号缩放'),
      h('input', {
        type: 'range', min: 0.85, max: 1.5, step: 0.05, value: prefs.fontScale,
        onChange: (event) => updatePrefs({ fontScale: Number(event.target.value) }),
      }),
      h('label', null, '对话字号'),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        h('input', {
          type: 'range', min: 0.8, max: 1.6, step: 0.05, value: prefs.dialogueFontScale,
          onChange: (event) => updatePrefs({ dialogueFontScale: Number(event.target.value) }),
        }),
        h('span', { className: 'nt-faint' }, '只缩放对话气泡/对话历史，总字号仍由上方「字号缩放」控制'),
      ),
      h('label', null, '打字速度（ms/字）'),
      h('input', {
        type: 'range', min: 4, max: 80, step: 2, value: prefs.typingSpeed,
        onChange: (event) => updatePrefs({ typingSpeed: Number(event.target.value) }),
      }),
      h('label', null, '扫描线'),
      h('label', null, h('input', {
        type: 'checkbox', checked: prefs.scanlines,
        onChange: (event) => updatePrefs({ scanlines: event.target.checked }),
      }), ' 显示 CRT 扫描线'),
      h('label', null, '辉光'),
      h('label', null, h('input', {
        type: 'checkbox', checked: prefs.glow,
        onChange: (event) => updatePrefs({ glow: event.target.checked }),
      }), ' 文字微发光'),
      h('label', null, '动效降级'),
      h('label', null, h('input', {
        type: 'checkbox', checked: prefs.reducedMotion,
        onChange: (event) => updatePrefs({ reducedMotion: event.target.checked }),
      }), ' 关闭闪烁/减少动画'),
      h('h4', { style: { gridColumn: '1 / span 2' } }, '音效'),
      h('label', null, '打字音效'),
      h('label', null, h('input', {
        type: 'checkbox', checked: prefs.sound,
        onChange: (event) => updatePrefs({ sound: event.target.checked }),
      }), ' 选择/续写提示音'),
      h('label', null, '音量'),
      h('input', {
        type: 'range', min: 0, max: 1, step: 0.05, value: prefs.soundVolume,
        onChange: (event) => updatePrefs({ soundVolume: Number(event.target.value) }),
      }),
      h('h4', { style: { gridColumn: '1 / span 2' } }, 'AI 续写'),
      h('label', null, '续写模式'),
      h('select', {
        value: prefs.aiMode,
        onChange: (event) => updatePrefs({ aiMode: event.target.value }),
      },
        h('option', { value: 'auto' }, '自动：选择/输入后立即续写'),
        h('option', { value: 'manual' }, '手动：按「AI 续写」按钮'),
        h('option', { value: 'off' }, '关闭：只记录事件'),
      ),
      h('label', null, '模型路由'),
      h('div', null,
        h('div', { className: 'nt-faint', style: { marginBottom: '4px' } },
          aiInfo && aiInfo.available
            ? '可用：' + aiInfo.provider + ' / ' + aiInfo.model
            : '不可用：' + ((aiInfo && aiInfo.reason) || '宿主未提供 llm 服务')),
        models.length > 0 ? h('select', {
          value: prefs.aiModel,
          onChange: (event) => updatePrefs({ aiModel: event.target.value, aiProvider: (models.find((model) => model.id === event.target.value) || {}).provider || prefs.aiProvider }),
        },
          h('option', { value: '' }, '跟随默认模型'),
          models.map((model) => h('option', { key: model.provider + ':' + model.id, value: model.id }, model.provider + ' / ' + model.name)),
        ) : null,
        h('div', { style: { marginTop: '6px', display: 'flex', gap: '8px' } },
          h('button', { type: 'button', onClick: () => void refreshAi() }, '重新检测'),
        ),
      ),
      h('label', null, '温度'),
      h('input', {
        type: 'number', min: 0, max: 1.5, step: 0.05, value: prefs.aiTemperature,
        onChange: (event) => updatePrefs({ aiTemperature: Math.min(1.5, Math.max(0, Number(event.target.value) || 0.8)) }),
      }),
      h('label', null, 'Top_P'),
      h('input', {
        type: 'number', min: 0, max: 1, step: 0.01, value: prefs.aiTopP,
        onChange: (event) => updatePrefs({ aiTopP: Math.min(1, Math.max(0, Number(event.target.value) || 1)) }),
      }),
      h('label', null, '存在惩罚'),
      h('input', {
        type: 'number', min: -2, max: 2, step: 0.1, value: prefs.aiPresencePenalty,
        onChange: (event) => updatePrefs({ aiPresencePenalty: Math.min(2, Math.max(-2, Number(event.target.value) || 0)) }),
      }),
      h('label', null, '频率惩罚'),
      h('input', {
        type: 'number', min: -2, max: 2, step: 0.1, value: prefs.aiFrequencyPenalty,
        onChange: (event) => updatePrefs({ aiFrequencyPenalty: Math.min(2, Math.max(-2, Number(event.target.value) || 0)) }),
      }),
      h('label', null, '最大 token'),
      h('input', {
        type: 'number', min: 400, max: 256000, step: 1000, value: prefs.aiMaxTokens,
        onChange: (event) => updatePrefs({ aiMaxTokens: Math.min(256000, Math.max(400, Number(event.target.value) || 2400)) }),
      }),
      h('div', { className: 'nt-faint', style: { gridColumn: '2' } }, 'V4.1-Flash 上下文 1M，单次输出上限最高可填 256000；过低会截断 JSON。'),
      h('label', null, '单章字数'),
      h('div', null,
        h('input', {
          type: 'number', min: 200, max: 20000, step: 100, value: prefs.chapterWords,
          onChange: (event) => updatePrefs({ chapterWords: Math.min(20000, Math.max(200, Number(event.target.value) || 800)) }),
          style: { width: '120px' },
        }),
        h('span', { className: 'nt-faint', style: { marginLeft: '8px' } }, 'AI 每次续写的正文目标字数，范围 200–20000，默认 800。'),
        h('div', { className: 'nt-faint' }, 'token 预算会按目标字数自动估算并取与「最大 token」中的较大值。'),
      ),
      h('h4', { style: { gridColumn: '1 / span 2' } }, '叙事模板'),
      h('div', { style: { gridColumn: '1 / span 2' } },
        [
          ['style', 'writingStyle'],
          ['logic', 'writingLogic'],
          ['cot', 'writingCot'],
          ['memory', 'memoryFormat'],
        ].map(([kind, prefsKey]) => h('details', { key: kind, open: kind === 'style', style: { marginBottom: '10px' } },
          h('summary', { style: { cursor: 'pointer', color: 'var(--nt-accent)', marginBottom: '6px' } },
            TEMPLATE_KIND_META[kind].label + ' · ' + findTemplate(kind, boot && boot.styles ? boot.styles : [], prefs[prefsKey]).name),
          h(TemplateSettings, { kind, prefsKey, prefs, updatePrefs, boot, showToast, onReload }),
        )),
      ),
      h('h4', { style: { gridColumn: '1 / span 2' } }, '剧情与编辑'),
      h('label', null, '剧情目录'),
      h('div', { className: 'nt-faint', style: { wordBreak: 'break-all' } },
        boot && boot.paths ? boot.paths.root + (boot.paths.writable ? '' : '（只读）') : '—'),
      h('label', null, '编辑模式'),
      h('label', null, h('input', {
        type: 'checkbox', checked: editorMode,
        onChange: (event) => {
          setEditorMode(event.target.checked)
          updatePrefs({ editorMode: event.target.checked })
        },
      }), ' 在顶栏显示「编辑」入口'),
      h('label', null, '稿件导入'),
      h('div', { className: 'nt-row-actions' },
        h('button', { type: 'button', onClick: () => void listManuscripts() }, '查看 manuscript/'),
        h('button', { type: 'button', onClick: () => void importStory(), disabled: importing }, importing ? '导入中…' : '从 Markdown 导入并覆盖'),
        h('label', { className: 'nt-faint', style: { display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' } },
          h('input', {
            type: 'checkbox',
            checked: resetStoryImport,
            onChange: (event) => setResetStoryImport(event.target.checked),
          }),
          '导入新故事时同时清空计划/记忆/存档/生成记录',
        ),
      ),
      h('label', null, '世界书导入'),
      h('div', null, h(WorldbookImportControl, { boot, showToast, onReload })),
      manuscripts ? h('div', { style: { gridColumn: '1 / span 2' } },
        h('div', { className: 'nt-faint' }, manuscripts.length + ' 个稿件文件'),
        h('div', { className: 'nt-memory', style: { maxHeight: '120px' } }, manuscripts.map((file) => file.name + '  (' + file.bytes + ' B)').join('\n')),
      ) : null,
      h('label', null, '刷新'),
      h('div', { className: 'nt-row-actions' },
        h('button', { type: 'button', onClick: () => { updatePrefs({ editorMode }); onReload(); showToast('已重新载入剧情') } }, '重新载入剧情与记忆'),
      ),
      h('label', null, '重置状态'),
      h('div', { className: 'nt-row-actions' },
        h('button', { type: 'button', disabled: resetting, onClick: () => void resetState(false) }, '清空计划与记忆'),
        h('button', { type: 'button', disabled: resetting, onClick: () => void resetState(true) }, '清空全部状态（含存档）'),
      ),
      h('h4', { style: { gridColumn: '1 / span 2' } }, '关于'),
      h('label', null, '终端'),
      h('div', { className: 'nt-faint' }, 'dsh-novel-arkterminal 0.1.0 · 节点 ' + (typeof process === 'undefined' ? '' : '') + 'web'),
      h('label', null, '重置'),
      h('div', { className: 'nt-row-actions' },
        h('button', {
          type: 'button',
          onClick: () => {
            if (!window.confirm('恢复默认终端设置？（不会删除存档与剧情）')) return
            updatePrefs({ ...DEFAULT_PREFS })
            showToast('已恢复默认设置')
          },
        }, '恢复默认设置'),
      ),
    ),
  )
}

function SavesPanel(props) {
  const { boot, story, onClose, showToast, setGame } = props
  const [slots, setSlots] = React.useState(boot && boot.saves && boot.saves.slots ? boot.saves.slots : [])
  const [busy, setBusy] = React.useState(false)
  const fileRef = React.useRef(null)

  const refresh = async () => {
    try {
      const data = await api('/saves')
      setSlots(data.slots || [])
    } catch (error) {
      showToast('读取存档失败：' + error.message, true)
    }
  }

  const saveTo = async (slot) => {
    const current = props.game
    if (!current) return
    setBusy(true)
    try {
      await api('/save', { method: 'POST', body: { slot, save: saveStateFromGame(current, story.title, story.id) } })
      await refresh()
      showToast('已存入 ' + slot)
    } catch (error) {
      showToast('存档失败：' + error.message, true)
    } finally {
      setBusy(false)
    }
  }

  const loadFrom = async (slot) => {
    try {
      const data = await api('/save?slot=' + encodeURIComponent(slot))
      setGame(loadGameFromSave(data.save))
      showToast('已读取 ' + slot)
      onClose()
    } catch (error) {
      showToast('读档失败：' + error.message, true)
    }
  }

  const deleteSlot = async (slot) => {
    if (!window.confirm('删除存档 ' + slot + '？')) return
    try {
      await api('/save/delete', { method: 'POST', body: { slot } })
      await refresh()
      showToast('已删除 ' + slot)
    } catch (error) {
      showToast('删除失败：' + error.message, true)
    }
  }

  const exportSlot = async (slot) => {
    try {
      const data = await api('/save/export?slot=' + encodeURIComponent(slot))
      downloadJson('novel-terminal-' + slot + '.json', data)
    } catch (error) {
      showToast('导出失败：' + error.message, true)
    }
  }

  const importFile = async (file) => {
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      await api('/save/import', { method: 'POST', body: parsed })
      await refresh()
      showToast('存档已导入')
    } catch (error) {
      showToast('导入失败：' + error.message, true)
    }
  }

  const manualSlots = ['manual1', 'manual2', 'manual3']
  return h(Modal, { title: '存档管理', onClose },
    h('h4', null, '自动存档'),
    h('div', { className: 'nt-list' },
      slots.filter((slot) => slot.slot === 'auto').map((slot) => h('div', { key: slot.slot, className: 'nt-list-item' },
        h('div', { className: 'nt-wb-title' }, 'auto · ' + formatDate(slot.updatedAt)),
        h('div', { className: 'nt-faint' }, '节点 ' + (slot.nodeId || '—')),
        h('div', { style: { display: 'flex', gap: '6px', marginTop: '4px' } },
          h('button', { type: 'button', onClick: () => void loadFrom(slot.slot) }, '读取'),
          h('button', { type: 'button', onClick: () => void exportSlot(slot.slot) }, '导出'),
        ),
      )),
      slots.filter((slot) => slot.slot === 'auto').length === 0 ? h('div', { className: 'nt-muted' }, '暂无自动存档') : null,
    ),
    h('h4', null, '手动存档槽'),
    h('div', { className: 'nt-list' },
      manualSlots.map((slotName) => {
        const slot = slots.find((item) => item.slot === slotName)
        return h('div', { key: slotName, className: 'nt-list-item' },
          h('div', { className: 'nt-wb-title' }, slotName + (slot ? ' · ' + formatDate(slot.updatedAt) : ' · 空')),
          slot ? h('div', { className: 'nt-faint' }, '节点 ' + (slot.nodeId || '—')) : null,
          h('div', { style: { display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' } },
            h('button', { type: 'button', disabled: busy, onClick: () => void saveTo(slotName) }, '写入'),
            slot ? h('button', { type: 'button', onClick: () => void loadFrom(slotName) }, '读取') : null,
            slot ? h('button', { type: 'button', onClick: () => void exportSlot(slotName) }, '导出') : null,
            slot ? h('button', { type: 'button', onClick: () => void deleteSlot(slotName) }, '删除') : null,
          ),
        )
      }),
    ),
    h('h4', null, '导入 / 重置'),
    h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } },
      h('button', { type: 'button', onClick: () => fileRef.current && fileRef.current.click() }, '导入存档文件'),
      h('input', {
        ref: fileRef, type: 'file', accept: '.json,application/json', style: { display: 'none' },
        onChange: (event) => { const file = event.target.files && event.target.files[0]; event.target.value = ''; void importFile(file) },
      }),
      h('button', { type: 'button', onClick: () => { onClose(); } }, '关闭'),
    ),
  )
}

/* ===== 30_editor.js ===== */
/* dsh-novel-arkterminal / story editor. */

function EditorPanel(props) {
  const { boot, onClose, onReload, showToast, prefs } = props
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState(null)
  const [story, setStory] = React.useState(null)
  const [worldbook, setWorldbook] = React.useState([])
  const [version, setVersion] = React.useState('')
  const [backups, setBackups] = React.useState([])
  const [tab, setTab] = React.useState('nodes')
  const [nodeId, setNodeId] = React.useState('')
  const [nodeTitle, setNodeTitle] = React.useState('')
  const [nodeChapter, setNodeChapter] = React.useState('')
  const [blocksText, setBlocksText] = React.useState('[]')
  const [choicesText, setChoicesText] = React.useState('[]')
  const [worldbookText, setWorldbookText] = React.useState('[]')
  const [plansText, setPlansText] = React.useState('[]')
  const [memoryText, setMemoryText] = React.useState('')
  const [rawText, setRawText] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)
  const [message, setMessage] = React.useState('')
  const wbFileRef = React.useRef(null)

  const loadRaw = React.useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await api('/story/raw')
      setStory(data.story)
      setWorldbook(data.worldbook || [])
      setVersion(data.version)
      setBackups(data.backups || [])
      const firstNode = data.story.start || Object.keys(data.story.nodes)[0] || ''
      setNodeId(firstNode)
      setWorldbookText(JSON.stringify(data.worldbook || [], null, 2))
      setRawText(JSON.stringify(data.story, null, 2))
      await loadNode(firstNode, data.story)
      const plans = await api('/plans')
      setPlansText(JSON.stringify(plans.plans || [], null, 2))
      const memory = await api('/memory')
      setMemoryText(memory.memory || '')
      setLoading(false)
      setDirty(false)
    } catch (error) {
      setLoading(false)
      setLoadError(error)
    }
  }, [])

  React.useEffect(() => {
    void loadRaw()
  }, [loadRaw])

  const loadNode = async (id, sourceStory) => {
    const target = sourceStory || story
    if (!target || !target.nodes || !target.nodes[id]) return
    const node = target.nodes[id]
    setNodeId(id)
    setNodeTitle(node.title || '')
    setNodeChapter(node.chapter || '')
    setBlocksText(JSON.stringify(node.blocks || [], null, 2))
    setChoicesText(JSON.stringify(node.choices || [], null, 2))
  }

  const selectNode = (id) => {
    if (dirty && !window.confirm('当前节点有未保存的修改，切换将丢失。继续？')) return
    void loadNode(id)
    setDirty(false)
  }

  const parseJsonOrError = (label, text) => {
    try {
      return JSON.parse(text)
    } catch (error) {
      throw new Error(label + ' 不是合法 JSON：' + error.message)
    }
  }

  const applyNodeEdits = () => {
    if (!story) return
    try {
      const blocks = parseJsonOrError('blocks', blocksText)
      const choices = parseJsonOrError('choices', choicesText)
      const next = JSON.parse(JSON.stringify(story))
      next.nodes[nodeId] = {
        ...next.nodes[nodeId],
        title: nodeTitle,
        chapter: nodeChapter,
        blocks,
        choices,
      }
      setStory(next)
      setDirty(true)
      setMessage('已应用到内存，点「保存到文件」写入 story.json')
    } catch (error) {
      setMessage(error.message)
    }
  }

  const saveStory = async () => {
    if (!story) return
    setBusy(true)
    try {
      const wb = tab === 'worldbook' ? parseJsonOrError('worldbook', worldbookText) : worldbook
      const raw = tab === 'raw' ? parseJsonOrError('story', rawText) : story
      const result = await api('/story', {
        method: 'PUT',
        body: { story: raw, worldbook: wb, baseVersion: version },
      })
      setStory(result.story)
      setWorldbook(result.worldbook || wb)
      setVersion(result.version)
      setRawText(JSON.stringify(result.story, null, 2))
      setDirty(false)
      setMessage('已保存（版本 ' + String(result.version).slice(0, 10) + '）')
      showToast('剧情已保存')
    } catch (error) {
      if (error.code === 'conflict_version') {
        setMessage('保存冲突：剧情已被其他操作修改。请先「重新载入」。')
      } else {
        setMessage('保存失败：' + error.message)
      }
    } finally {
      setBusy(false)
    }
  }

  const savePlans = async () => {
    try {
      const plans = parseJsonOrError('plans', plansText)
      await api('/plans', { method: 'PUT', body: { plans } })
      showToast('计划已保存')
    } catch (error) {
      setMessage(error.message)
    }
  }

  const saveMemory = async () => {
    try {
      await api('/memory', { method: 'PUT', body: { memory: memoryText } })
      showToast('记忆区已保存')
    } catch (error) {
      setMessage(error.message)
    }
  }

  const saveWorldbook = async () => {
    try {
      const wb = parseJsonOrError('worldbook', worldbookText)
      const result = await api('/worldbook', { method: 'PUT', body: { worldbook: wb, baseVersion: version } })
      setWorldbook(result.worldbook || wb)
      setVersion(result.version)
      showToast('世界书已保存')
    } catch (error) {
      setMessage(error.message)
    }
  }

  const importWorldbookFile = async (file) => {
    if (!file) return
    try {
      const text = await file.text()
      const result = await api('/worldbook/import', {
        method: 'POST',
        body: { text, mode: 'merge', baseVersion: version },
      })
      setWorldbook(result.worldbook || [])
      setWorldbookText(JSON.stringify(result.worldbook || [], null, 2))
      setVersion(result.version)
      setMessage('已导入 ' + result.imported + ' 条世界书（合并，现共 ' + result.total + ' 条）')
      showToast('世界书已导入')
    } catch (error) {
      setMessage('世界书导入失败：' + error.message)
    }
  }

  const exportWorldbook = () => {
    try {
      const list = JSON.parse(worldbookText)
      downloadJson('worldbook.json', { schema: 1, worldbook: list })
    } catch {
      downloadJson('worldbook.json', { schema: 1, worldbook })
    }
  }

  const importManuscript = async () => {
    if (!window.confirm('从 manuscript/ 导入并覆盖 story.json，并清空计划/记忆区/存档/AI 生成记录？会先自动备份。')) return
    setBusy(true)
    try {
      const result = await api('/story/import', {
        method: 'POST',
        body: {
          baseVersion: version,
          reset: { plans: true, memory: true, saves: true, generated: true },
        },
      })
      setMessage('导入完成：' + result.chapters + ' 章' +
        (result.reset && Object.keys(result.reset).length > 0 ? '（已清空计划/记忆/存档/生成记录）' : ''))
      await loadRaw()
      showToast('导入完成')
    } catch (error) {
      setMessage('导入失败：' + error.message)
    } finally {
      setBusy(false)
    }
  }

  const revertBackup = async () => {
    if (!window.confirm('恢复最近一次备份？当前 story.json 会被覆盖。')) return
    try {
      const result = await api('/story/backup/revert', { method: 'POST', body: {} })
      setMessage('已恢复备份：' + result.restored)
      await loadRaw()
    } catch (error) {
      setMessage('恢复失败：' + error.message)
    }
  }

  const adoptGenerated = async (recordId) => {
    try {
      const result = await api('/story/adopt', { method: 'POST', body: { recordId, baseVersion: version } })
      setMessage('已采纳生成节点：' + result.nodeId)
      await loadRaw()
    } catch (error) {
      setMessage('采纳失败：' + error.message)
    }
  }

  const nodeIds = story ? Object.keys(story.nodes) : []
  const generated = boot && Array.isArray(boot.generated) ? boot.generated : []

  const nav = h('div', { className: 'nt-editor-nav' },
    nodeIds.map((id) => h('button', {
      key: id,
      type: 'button',
      className: id === nodeId ? 'is-active' : '',
      onClick: () => selectNode(id),
      title: id,
    }, (story.nodes[id].title || story.nodes[id].chapter || id) + '  ·  ' + id)),
  )

  let content = null
  if (tab === 'nodes') {
    content = h('div', { className: 'nt-editor-main' },
      h('div', { className: 'nt-editor-toolbar' },
        h('strong', null, '节点 ' + nodeId),
        h('button', { type: 'button', onClick: applyNodeEdits }, '应用到内存'),
        h('button', { type: 'button', disabled: busy, onClick: () => void saveStory() }, '保存到文件'),
        h('button', { type: 'button', onClick: () => void loadNode(nodeId) }, '撤销修改'),
      ),
      h('div', { className: 'nt-settings-grid' },
        h('label', null, '标题'),
        h('input', { value: nodeTitle, onChange: (event) => setNodeTitle(event.target.value) }),
        h('label', null, '章节'),
        h('input', { value: nodeChapter, onChange: (event) => setNodeChapter(event.target.value) }),
      ),
      h('label', { className: 'nt-muted' }, 'blocks（JSON 数组）'),
      h('textarea', { className: 'nt-code', value: blocksText, onChange: (event) => { setBlocksText(event.target.value); setDirty(true) } }),
      h('label', { className: 'nt-muted' }, 'choices（JSON 数组，next 为节点 id 或 null；ai:true 表示由 AI 续写）'),
      h('textarea', { className: 'nt-code', value: choicesText, onChange: (event) => { setChoicesText(event.target.value); setDirty(true) } }),
    )
  } else if (tab === 'worldbook') {
    content = h('div', { className: 'nt-editor-main' },
      h('div', { className: 'nt-editor-toolbar' },
        h('strong', null, '世界书（' + worldbook.length + ' 条）'),
        h('button', { type: 'button', onClick: () => wbFileRef.current && wbFileRef.current.click() }, '导入世界书'),
        h('button', { type: 'button', onClick: exportWorldbook }, '导出世界书'),
        h('button', { type: 'button', onClick: () => void saveWorldbook() }, '保存世界书'),
        h('input', {
          ref: wbFileRef,
          type: 'file',
          accept: '.json,.md,.markdown,.txt,application/json,text/markdown,text/plain',
          style: { display: 'none' },
          onChange: (event) => {
            const file = event.target.files && event.target.files[0]
            event.target.value = ''
            void importWorldbookFile(file)
          },
        }),
      ),
      h('textarea', { className: 'nt-code', style: { minHeight: '420px' }, value: worldbookText, onChange: (event) => setWorldbookText(event.target.value) }),
    )
  } else if (tab === 'plans') {
    content = h('div', { className: 'nt-editor-main' },
      h('div', { className: 'nt-editor-toolbar' },
        h('strong', null, '计划 / 未完成目标'),
        h('button', { type: 'button', onClick: () => void savePlans() }, '保存 plans.json'),
      ),
      h('textarea', { className: 'nt-code', style: { minHeight: '360px' }, value: plansText, onChange: (event) => setPlansText(event.target.value) }),
    )
  } else if (tab === 'memory') {
    content = h('div', { className: 'nt-editor-main' },
      h('div', { className: 'nt-editor-toolbar' },
        h('strong', null, 'AI 记忆区'),
        h('button', { type: 'button', onClick: () => void saveMemory() }, '保存 memory.md'),
      ),
      h('textarea', { className: 'nt-code', style: { minHeight: '420px' }, value: memoryText, onChange: (event) => setMemoryText(event.target.value) }),
    )
  } else if (tab === 'generated') {
    content = h('div', { className: 'nt-editor-main' },
      h('div', { className: 'nt-editor-toolbar' }, h('strong', null, 'AI 生成记录（' + generated.length + '）')),
      generated.length === 0 ? h('div', { className: 'nt-muted' }, '还没有 AI 续写记录') : h('div', { className: 'nt-list' },
        generated.slice().reverse().map((record) => h('div', { key: record.id, className: 'nt-list-item' },
          h('div', { className: 'nt-wb-title' }, record.title + ' · ' + record.id),
          h('div', { className: 'nt-faint' }, '父节点 ' + (record.parentId || '—') + ' · ' + formatDate(record.createdAt)),
          h('div', { style: { marginTop: '4px' } },
            h('button', { type: 'button', onClick: () => void adoptGenerated(record.id) }, '采纳为故事节点'),
          ),
        )),
      ),
    )
  } else if (tab === 'backups') {
    content = h('div', { className: 'nt-editor-main' },
      h('div', { className: 'nt-editor-toolbar' },
        h('strong', null, '备份与导入'),
        h('button', { type: 'button', disabled: busy, onClick: () => void importManuscript() }, '从 manuscript/ 导入'),
        h('button', { type: 'button', onClick: () => void revertBackup() }, '恢复最近备份'),
      ),
      h('div', { className: 'nt-faint', style: { marginTop: '8px' } }, '最多保留 10 份备份。'),
      h('div', { className: 'nt-list' },
        backups.map((backup) => h('div', { key: backup.name, className: 'nt-list-item' }, backup.name)),
        backups.length === 0 ? h('div', { className: 'nt-muted' }, '暂无备份') : null,
      ),
    )
  } else {
    content = h('div', { className: 'nt-editor-main' },
      h('div', { className: 'nt-editor-toolbar' },
        h('strong', null, '原始 story.json'),
        h('button', { type: 'button', onClick: () => {
          try {
            const parsed = JSON.parse(rawText)
            setStory(parsed)
            setRawText(JSON.stringify(parsed, null, 2))
            setDirty(true)
            setMessage('已应用到内存，保存后写入')
          } catch (error) {
            setMessage('JSON 解析失败：' + error.message)
          }
        } }, '应用到内存'),
        h('button', { type: 'button', disabled: busy, onClick: () => void saveStory() }, '保存到文件'),
      ),
      h('textarea', { className: 'nt-code', style: { minHeight: '460px' }, value: rawText, onChange: (event) => setRawText(event.target.value) }),
    )
  }

  return h(Modal, { title: '剧情编辑器' + (dirty ? ' · 未保存' : ''), onClose, bodyStyle: { display: 'flex', flexDirection: 'column', minHeight: 0, flex: '1 1 auto' } },
    loading
      ? h('div', { className: 'nt-empty' }, '正在读取 story.json…')
      : loadError
        ? h('div', { className: 'nt-empty' },
          h('div', { className: 'nt-boot-err' }, '读取失败：' + loadError.message),
          h('button', { type: 'button', onClick: () => void loadRaw() }, '重试'),
        )
        : h('div', null,
          h('div', { className: 'nt-editor-toolbar', style: { marginBottom: '8px' } },
            h('button', { type: 'button', className: tab === 'nodes' ? 'is-active' : '', onClick: () => setTab('nodes') }, '节点'),
            h('button', { type: 'button', onClick: () => setTab('worldbook') }, '世界书'),
            h('button', { type: 'button', onClick: () => setTab('plans') }, '计划'),
            h('button', { type: 'button', onClick: () => setTab('memory') }, '记忆'),
            h('button', { type: 'button', onClick: () => setTab('generated') }, 'AI 生成'),
            h('button', { type: 'button', onClick: () => setTab('backups') }, '备份/导入'),
            h('button', { type: 'button', onClick: () => setTab('raw') }, '原始 JSON'),
            h('span', { style: { flex: '1 1 auto' } }),
            h('span', { className: 'nt-faint' }, '版本 ' + String(version).slice(0, 10)),
            h('button', { type: 'button', onClick: () => { void loadRaw(); showToast('已重新载入') } }, '重新载入'),
            h('button', { type: 'button', onClick: onReload }, '刷新终端'),
          ),
          message ? h('div', { className: 'nt-faint', style: { marginBottom: '6px' } }, message) : null,
          h('div', { className: 'nt-editor', style: { flex: '1 1 auto', minHeight: '420px' } },
            tab === 'nodes' || tab === 'raw' ? nav : null,
            content,
          ),
        ),
  )
}

/* ===== 40_apply.js ===== */
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
    exports.name = 'novel-terminal'
    exports.inject = ['slots']
    exports.apply = apply
    return module.exports
  },
});
