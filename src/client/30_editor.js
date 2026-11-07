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
