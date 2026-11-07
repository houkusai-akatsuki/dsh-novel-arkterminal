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
