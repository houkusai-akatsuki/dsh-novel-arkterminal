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
