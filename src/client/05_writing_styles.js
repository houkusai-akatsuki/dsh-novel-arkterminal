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
