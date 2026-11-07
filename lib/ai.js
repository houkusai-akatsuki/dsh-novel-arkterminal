/**
 * dsh-novel-arkterminal / AI continuation engine.
 *
 * Uses the Host `llm` service (streaming) with the profile's default model
 * (or an explicit override), validates the structured continuation, and only
 * then appends it to `generated/` + memory/plans. Authored story text is never
 * rewritten here.
 */
import {
  ApiError,
  clampString,
  nowIso,
  randomId,
} from './util.js'
import { validatePlans } from './story.js'

const JOB_TIMEOUT_MS = 600000
const MAX_JOBS = 20
const DEFAULT_MAX_TOKENS = 2400
// DeepSeek V4.1-Flash advertises a 1M context; its Messages adapter defaults the
// per-request completion cap to 256k, so accept up to that instead of 4k.
const MAX_MAX_TOKENS = 256000
const DEFAULT_CHAPTER_WORDS = 800
const MIN_CHAPTER_WORDS = 200
const MAX_CHAPTER_WORDS = 20000
const MAX_BLOCKS = 32
const MAX_CHOICES = 4
const MIN_CHOICES = 2
const DEFAULT_TRANSPORT_RETRY_DELAYS = [1500, 4000, 8000]

const TRANSPORT_ERROR_PATTERN = /transport failed|fetch failed|network|ECONNRESET|ECONNREFUSED|ETIMEDOUT|socket hang up|connection reset|temporarily unavailable|bad gateway|service unavailable|gateway timeout|\b(502|503|504)\b/i

export function isTransportError(error) {
  if (!error) return false
  if (error.name === 'AbortError' || error.code === 'cancelled') return false
  return TRANSPORT_ERROR_PATTERN.test(String(error.message || error))
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

const SYSTEM_PROMPT = `你是《一九三九 · 方舟》的叙事引擎。这是一部以 1938—1939 年中国为舞台的架空历史互动小说，围绕毛泽东与来自未来的超级人工智能 A11CE（爱丽丝）展开。
写作与输出规则：
1. 只输出一个 JSON 对象，不要输出 JSON 之外的任何文字，不要使用 Markdown 代码围栏。
2. 严格遵守给定世界书、记忆区与当前剧情；不要复活已死人物，不要改写已发生事件，不要引入与设定冲突的现代科技。
3. 【玩家角色】条目定义了玩家操控的角色：续写必须站在该角色一侧，只写该角色能看到、听到、知道的信息，不提前揭示其他角色的内心，也不替玩家角色做决定或写死其内心倾向。
4. 文风：中文第三人称，克制、有生活质感与时代细节；对话自然；避免网络流行语。
5. 篇幅与分段见【本次篇幅】要求；宁可写精，不要为凑字数注水。可用 "narration"（叙述）、"dialogue"（对话，需 speaker）、"system"（系统提示）三种 type。
6. choices 为 2-4 个下一步选项，必须是玩家角色可以采取的行动或可以说出口的话，彼此差异明显（稳妥、冒险、情报、情感、政治等），每个选项一句话、不超过 40 字；不要替玩家决定结果。
7. 思维链：若系统给出了思维链模板，先在 reasoning 字段输出单行箭头链（例如 "[解析] -> [规划] -> [执行] -> [审查]"），reasoning 尽量控制在 80 字以内；它只用于记录，不会展示给读者，禁止在正文里重复它。
8. 记忆：需要记录记忆时给出 memoryAppend；若系统给出了记忆区格式模板，memoryAppend 必须按该格式书写。
9. 需要更新计划时可给出 plans（完整替换当前计划数组）。
10. 输出 JSON 结构（必须严格符合）：
{"title":"本段小标题","chapter":"可选章节名","reasoning":"[解析] -> [规划] -> [执行]","blocks":[{"type":"narration","text":"..."},{"type":"dialogue","speaker":"爱丽丝","text":"..."}],"choices":[{"id":"a","label":"..."}],"plans":[{"id":"p1","label":"...","kind":"plan","status":"open"}],"memoryAppend":"..."}`

export function extractJson(text) {
  if (typeof text !== 'string') return null
  let candidate = text.trim()
  const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) candidate = fence[1].trim()
  try {
    return JSON.parse(candidate)
  } catch {
    // fall through to balanced-brace scan
  }
  const start = candidate.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < candidate.length; i += 1) {
    const ch = candidate[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(candidate.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

export function validateContinuation(payload) {
  const errors = []
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return ['续写必须是 JSON 对象']
  if (payload.title !== undefined && typeof payload.title !== 'string') errors.push('title 必须是字符串')
  if (payload.chapter !== undefined && typeof payload.chapter !== 'string') errors.push('chapter 必须是字符串')
  if (payload.reasoning !== undefined) {
    if (typeof payload.reasoning !== 'string') errors.push('reasoning 必须是字符串')
    else if (payload.reasoning.length > 4000) errors.push('reasoning 最多 4000 字')
  }
  if (!Array.isArray(payload.blocks) || payload.blocks.length === 0) {
    errors.push('blocks 必须是非空数组')
  } else if (payload.blocks.length > MAX_BLOCKS) {
    errors.push(`blocks 最多 ${MAX_BLOCKS} 段`)
  } else {
    payload.blocks.forEach((block, index) => {
      if (!block || typeof block !== 'object') {
        errors.push(`blocks[${index}] 必须是对象`)
        return
      }
      if (!['narration', 'dialogue', 'system'].includes(block.type)) errors.push(`blocks[${index}] 未知 type`)
      if (typeof block.text !== 'string' || !block.text.trim()) errors.push(`blocks[${index}] 缺少 text`)
      else if (block.text.length > 3000) errors.push(`blocks[${index}] text 过长`)
      if (block.speaker !== undefined && typeof block.speaker !== 'string') errors.push(`blocks[${index}] speaker 必须是字符串`)
    })
  }
  if (!Array.isArray(payload.choices) || payload.choices.length < MIN_CHOICES) {
    errors.push(`choices 至少 ${MIN_CHOICES} 个`)
  } else if (payload.choices.length > MAX_CHOICES) {
    errors.push(`choices 最多 ${MAX_CHOICES} 个`)
  } else {
    const ids = new Set()
    payload.choices.forEach((choice, index) => {
      if (!choice || typeof choice !== 'object') {
        errors.push(`choices[${index}] 必须是对象`)
        return
      }
      if (typeof choice.id !== 'string' || !choice.id) errors.push(`choices[${index}] 缺少 id`)
      else if (ids.has(choice.id)) errors.push(`choices[${index}] id 重复`)
      else ids.add(choice.id)
      if (typeof choice.label !== 'string' || !choice.label.trim()) errors.push(`choices[${index}] 缺少 label`)
      else if (choice.label.length > 80) errors.push(`choices[${index}] label 过长`)
    })
  }
  if (payload.plans !== undefined) {
    errors.push(...validatePlans(payload.plans).map((error) => `plans: ${error}`))
  }
  if (payload.memoryAppend !== undefined) {
    if (typeof payload.memoryAppend !== 'string') errors.push('memoryAppend 必须是字符串')
    else if (payload.memoryAppend.length > 2000) errors.push('memoryAppend 过长')
  }
  if (payload.flags !== undefined && (typeof payload.flags !== 'object' || Array.isArray(payload.flags))) {
    errors.push('flags 必须是对象')
  }
  return errors
}

/** Normalize an optional per-continuation chapter word target. */
export function sanitizeChapterWords(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return DEFAULT_CHAPTER_WORDS
  return Math.max(MIN_CHAPTER_WORDS, Math.min(MAX_CHAPTER_WORDS, Math.round(number)))
}

/** Normalize an optional writing-style payload from the browser. */
export function sanitizeStyle(style) {
  if (!style || typeof style !== 'object' || Array.isArray(style)) return null
  const prompt = clampString(typeof style.prompt === 'string' ? style.prompt : '', 2000).trim()
  if (!prompt) return null
  return {
    id: clampString(typeof style.id === 'string' ? style.id : '', 64).trim() || 'custom',
    name: clampString(typeof style.name === 'string' ? style.name : '', 80).trim() || '自定义文风',
    prompt,
  }
}

function summarizeBlocks(blocks, max = 6) {
  if (!Array.isArray(blocks)) return ''
  return blocks
    .slice(-max)
    .map((block) => (block.speaker ? `${block.speaker}：${block.text}` : block.text))
    .join('\n')
    .slice(0, 6000)
}

function relevantWorldbook(worldbook, text) {
  const source = String(text || '')
  const hits = []
  for (const entry of worldbook || []) {
    const title = entry.title || ''
    const id = entry.id || ''
    if ((title && source.includes(title)) || (id && source.includes(`[[${id}`))) hits.push(entry)
  }
  return (hits.length > 0 ? hits : (worldbook || []).slice(0, 8)).slice(0, 10)
}

export class AiRunner {
  constructor(ctx, deps) {
    this.ctx = ctx
    this.deps = deps // { getStore, transportRetryDelays }
    this.jobs = new Map()
    this.currentJobId = null
    this.modelsCache = null
    this.modelsCacheAt = 0
    this.transportRetryDelays = Array.isArray(deps && deps.transportRetryDelays) && deps.transportRetryDelays.length > 0
      ? deps.transportRetryDelays
      : DEFAULT_TRANSPORT_RETRY_DELAYS
  }

  llm() {
    try {
      return this.ctx.get('llm') || null
    } catch {
      return null
    }
  }

  defaultSelection() {
    try {
      const service = this.ctx.get('agentDefaultModel')
      const selection = service && service.currentSelection ? service.currentSelection() : null
      if (!selection) return null
      const provider = selection.provider || selection.providerId || selection.route && selection.route.provider
      const model = selection.model || selection.modelId || selection.route && selection.route.model
      if (!provider || !model) return null
      return {
        provider,
        model,
        reasoningEffort: selection.reasoningEffort,
      }
    } catch {
      return null
    }
  }

  async resolveConfig(prefs = {}) {
    const llm = this.llm()
    if (!llm) return { available: false, reason: '宿主未提供 llm 服务', provider: null, model: null, providers: [], models: [] }
    let providers = []
    try {
      providers = llm.listProviders ? llm.listProviders() : []
    } catch {
      providers = []
    }
    const fallback = this.defaultSelection()
    const provider = prefs.provider || (fallback && fallback.provider) || (providers[0] && providers[0].id) || null
    let model = prefs.model || (fallback && fallback.model) || null
    let models = []
    if (provider) models = await this.listModelsFor(llm, provider)
    if (!model && models.length > 0) model = models[0].id
    return {
      available: Boolean(provider && model),
      reason: provider && model ? null : '未找到可用的模型路由',
      provider,
      model,
      reasoningEffort: prefs.reasoningEffort || (fallback && fallback.reasoningEffort),
      providers,
      models,
    }
  }

  async listModelsFor(llm, provider) {
    const cacheValid = this.modelsCache && this.modelsCacheAt && Date.now() - this.modelsCacheAt < 60000
    if (cacheValid && this.modelsCache[provider]) return this.modelsCache[provider]
    try {
      const models = await llm.listModels(provider)
      const list = (models || []).map((model) => ({
        provider: model.provider || provider,
        id: model.id,
        name: model.name || model.id,
      }))
      this.modelsCache = { ...(this.modelsCache || {}), [provider]: list }
      this.modelsCacheAt = Date.now()
      return list
    } catch {
      return []
    }
  }

  async status() {
    const config = await this.resolveConfig({})
    return config
  }

  /** Build the model prompt from the current story state. */
  async buildPrompt({ parentId, action, recent, style, logic, cot, memoryFormat, targetWords }) {
    const store = await this.deps.getStore()
    const { story } = await store.loadRawStory()
    const worldbook = await store.loadWorldbook(story)
    const memory = await store.loadMemory()
    const plans = await store.loadPlans()
    const generatedRecords = await store.loadGeneratedRecords()

    let contextBlocks = []
    let contextTitle = ''
    if (typeof parentId === 'string' && parentId.startsWith('gen:')) {
      const record = generatedRecords.find((item) => item.id === parentId.slice(4))
      if (record && record.payload) {
        contextBlocks = record.payload.blocks || []
        contextTitle = record.payload.title || 'AI 续写'
      }
    } else if (story.nodes[parentId]) {
      contextBlocks = story.nodes[parentId].blocks || []
      contextTitle = story.nodes[parentId].title || story.nodes[parentId].chapter || parentId
    }

    const contextText = summarizeBlocks(contextBlocks)
    const playerEntry = worldbook.find((entry) => entry.id === 'wb-player') ||
      worldbook.find((entry) => /玩家角色/.test(entry.title || ''))
    const playerText = playerEntry ? clampString(playerEntry.body || playerEntry.summary || '', 1200) : ''
    const playerName = playerEntry && playerEntry.title
      ? String(playerEntry.title).replace(/^玩家角色\s*[·:：-]\s*/, '').trim()
      : ''
    const worldbookText = relevantWorldbook(worldbook, contextText + ' ' + (action && action.text ? action.text : ''))
      .map((entry) => `- ${entry.title}（${entry.type || 'other'}）：${clampString(entry.summary || entry.body || '', 300)}`)
      .join('\n')
    const plansText = (plans || [])
      .map((plan) => `- [${plan.status || 'open'}] ${plan.label}${plan.detail ? '：' + plan.detail : ''}`)
      .join('\n')
    const recentText = (Array.isArray(recent) ? recent : [])
      .slice(-3)
      .map((item) => {
        const head = item.title ? `【${item.title}】` : ''
        const body = clampString(item.text || '', 600)
        const pick = item.choiceLabel ? `\n玩家选择：${item.choiceLabel}` : ''
        return head + body + pick
      })
      .join('\n---\n')

    const actionText = action && action.type === 'choice'
      ? `玩家选择：${clampString(action.choiceLabel || action.label || '', 200)}`
      : action && action.type === 'input'
        ? `玩家自由输入：${clampString(action.text || '', 500)}`
        : '玩家选择：继续'

    const words = sanitizeChapterWords(targetWords)
    const blockHint = words <= 500 ? '3-5' : words <= 1200 ? '4-8' : words <= 2000 ? '6-12' : words <= 6000 ? '10-20' : '16-32'

    const user = [
      `【作品】${story.title}（${story.id}）`,
      `【当前节点】${contextTitle}`,
      playerText ? `【玩家角色】${playerName ? '玩家操控「' + playerName + '」' : ''}\n${playerText}` : '',
      `【当前正文】\n${contextText || '（无）'}`,
      recentText ? `【最近剧情】\n${recentText}` : '',
      `【玩家动作】${actionText}`,
      `【本次篇幅】正文目标约 ${words} 字（±20%），分 ${blockHint} 段左右。`,
      plansText ? `【计划与未完成目标】\n${plansText}` : '',
      memory ? `【记忆区】\n${clampString(memory, 32000)}` : '',
      worldbookText ? `【本次相关世界书】\n${worldbookText}` : '',
      '【要求】从玩家动作之后继续写。只输出符合规则的 JSON。',
    ].filter(Boolean).join('\n\n')

    const systemParts = [SYSTEM_PROMPT]
    if (playerText) {
      systemParts.push('\n\n【玩家角色】\n' + playerText + '\n续写时站在该角色一侧，只写其可感知的信息；choices 必须是该角色可采取的行动或可说出口的话；不要替该角色做决定。')
    }
    systemParts.push(`\n\n【本次篇幅】正文目标约 ${words} 字（允许 ±20%），分 ${blockHint} 段；不要为凑字数注水，也不要遗漏关键情节。`)
    if (logic && logic.prompt) systemParts.push('\n\n【语言逻辑：' + logic.name + '】\n' + logic.prompt)
    if (style && style.prompt) systemParts.push('\n\n【文风要求：' + style.name + '】\n' + style.prompt)
    if (cot && cot.prompt) {
      systemParts.push('\n\n【思维链：' + cot.name + '】\n' + cot.prompt + '\n思维链只写入 JSON 的 reasoning 字段，禁止出现在 blocks 正文与 choices 里。')
    }
    if (memoryFormat && memoryFormat.prompt) {
      systemParts.push('\n\n【记忆区格式：' + memoryFormat.name + '】\n' + memoryFormat.prompt + '\n需要写入记忆时，memoryAppend 必须遵循以上格式。')
    }
    return {
      system: systemParts.join(''),
      user,
      storyId: story.id,
      style: style || null,
      logic: logic || null,
      cot: cot || null,
      memoryFormat: memoryFormat || null,
    }
  }

  async runStream({ provider, model, temperature, maxTokens, topP, presencePenalty, frequencyPenalty, prompt, signal }) {
    const llm = this.llm()
    if (!llm) throw Object.assign(new Error('宿主未提供 llm 服务'), { code: 'ai_unavailable' })
    let text = ''
    let usage = null
    let finish = null
    const options = {
      provider,
      model,
      system: prompt.system,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: prompt.user }],
        },
      ],
      temperature,
      maxTokens,
      signal,
    }
    if (Number.isFinite(topP)) options.topP = topP
    if (Number.isFinite(presencePenalty)) options.presencePenalty = presencePenalty
    if (Number.isFinite(frequencyPenalty)) options.frequencyPenalty = frequencyPenalty
    const stream = llm.stream(options)
    for await (const chunk of stream) {
      if (!chunk || typeof chunk !== 'object') continue
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
      else if (chunk.type === 'usage') usage = chunk.usage || usage
      else if (chunk.type === 'finish') finish = chunk.reason || null
    }
    if (finish && finish.kind === 'error') {
      throw Object.assign(new Error(finish.failure && finish.failure.message ? finish.failure.message : '模型调用失败'), {
        code: 'ai_error',
      })
    }
    if (finish && finish.kind === 'aborted') {
      throw Object.assign(new Error('模型调用已取消'), { code: 'cancelled' })
    }
    return { text, usage, finish }
  }

  /**
   * Wrap one streaming call with retries for transient provider/network errors.
   * User cancellation and validation errors are never retried.
   */
  async runStreamWithRetry(options, job) {
    let attempt = 0
    for (;;) {
      try {
        return await this.runStream(options)
      } catch (error) {
        if (!isTransportError(error) || attempt >= this.transportRetryDelays.length) throw error
        if (options.signal && options.signal.aborted) throw error
        const delay = this.transportRetryDelays[attempt]
        attempt += 1
        if (job) {
          job.transportRetries = (job.transportRetries || 0) + 1
          job.lastTransportError = String((error && error.message) || error)
        }
        console.warn(`[dsh-novel-arkterminal] transport error, retry ${attempt}/${this.transportRetryDelays.length} in ${delay}ms:`, error && error.message)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  async continueStory({ parentId, action, prefs = {}, recent = [] }) {
    const running = this.currentJobId && this.jobs.get(this.currentJobId)
    if (running && running.status === 'running') throw new ApiError('busy', '已有一段续写正在进行', 409)
    const config = await this.resolveConfig({
      provider: prefs.provider,
      model: prefs.model,
      reasoningEffort: prefs.reasoningEffort,
    })
    if (!config.available) throw new ApiError('ai_unavailable', config.reason || 'AI 不可用', 409)
    const templates = {
      style: sanitizeStyle(prefs.style),
      logic: sanitizeStyle(prefs.logic),
      cot: sanitizeStyle(prefs.cot),
      memoryFormat: sanitizeStyle(prefs.memoryFormat),
    }
    const chapterWords = sanitizeChapterWords(prefs.chapterWords)
    const job = {
      id: randomId('job-'),
      status: 'running',
      startedAt: nowIso(),
      doneAt: null,
      parentId,
      action: action || { type: 'enter' },
      provider: config.provider,
      model: config.model,
      templates,
      style: templates.style,
      chapterWords,
      transportRetries: 0,
      payload: null,
      raw: null,
      error: null,
      usage: null,
      abort: new AbortController(),
    }
    this.jobs.set(job.id, job)
    this.currentJobId = job.id
    this.pruneJobs()
    void this.executeJob(job, { prefs, recent }).catch((error) => {
      job.status = job.status === 'running' ? 'error' : job.status
      job.doneAt = job.doneAt || nowIso()
      job.error = { code: error.code || 'ai_error', message: error.message || String(error) }
      job.abort = null
      console.error('[dsh-novel-arkterminal] ai job failed:', error)
    })
    return { jobId: job.id, provider: config.provider, model: config.model }
  }

  pruneJobs() {
    const entries = [...this.jobs.entries()]
    while (entries.length > MAX_JOBS) {
      const [id] = entries.shift()
      this.jobs.delete(id)
    }
  }

  async executeJob(job, { prefs, recent }) {
    const temperature = Math.max(0, Math.min(1.5, Number(prefs.temperature) || 0.8))
    const topP = clampNumber(prefs.topP, 0, 1, 1)
    const presencePenalty = clampNumber(prefs.presencePenalty, -2, 2, 0)
    const frequencyPenalty = clampNumber(prefs.frequencyPenalty, -2, 2, 0)
    const chapterWords = sanitizeChapterWords(job.chapterWords)
    // Chinese continuation JSON needs roughly 2 tokens per target character plus structure overhead;
    // the provider allows a much larger cap now that long chapters are supported.
    const estimatedTokens = Math.min(MAX_MAX_TOKENS, Math.ceil(chapterWords * 2) + 800)
    const maxTokens = Math.max(200, Math.min(MAX_MAX_TOKENS, Math.max(Number(prefs.maxTokens) || DEFAULT_MAX_TOKENS, estimatedTokens)))
    const timeout = setTimeout(() => job.abort && job.abort.abort(), JOB_TIMEOUT_MS)
    const runStream = async (options) => {
      try {
        return await this.runStreamWithRetry(options, job)
      } catch (error) {
        if (isTransportError(error)) {
          throw new ApiError(
            'ai_transport',
            `DeepSeek 连接中断（已自动重试 ${job.transportRetries || 0} 次）：${error.message}。请检查网络/代理后重试。`,
            502,
          )
        }
        throw error
      }
    }
    try {
      const prompt = await this.buildPrompt({
        parentId: job.parentId,
        action: job.action,
        recent,
        style: job.templates ? job.templates.style : null,
        logic: job.templates ? job.templates.logic : null,
        cot: job.templates ? job.templates.cot : null,
        memoryFormat: job.templates ? job.templates.memoryFormat : null,
        targetWords: chapterWords,
      })
      let result = await runStream({
        provider: job.provider,
        model: job.model,
        temperature,
        maxTokens,
        topP,
        presencePenalty,
        frequencyPenalty,
        prompt,
        signal: job.abort.signal,
      })
      let payload = extractJson(result.text)
      let errors = validateContinuation(payload)
      let finishKind = result.finish ? result.finish.kind : null
      if (errors.length > 0) {
        // One repair attempt, feeding the model its own output and the validation errors.
        job.repairAttempt = true
        const truncated = finishKind === 'max-tokens'
        const retryMaxTokens = truncated ? Math.min(MAX_MAX_TOKENS, Math.max(2400, maxTokens * 2)) : maxTokens
        job.retryMaxTokens = retryMaxTokens
        const concise = truncated
          ? '\n【注意】上一次输出因 max tokens 被截断：请把 reasoning 压到 80 字以内、正文压到 400 字以内，并确保 JSON 完整闭合。'
          : ''
        result = await runStream({
          provider: job.provider,
          model: job.model,
          temperature: 0.2,
          maxTokens: retryMaxTokens,
          topP,
          presencePenalty,
          frequencyPenalty,
          prompt: {
            system: prompt.system,
            user: `${prompt.user}${concise}\n\n【上一次输出不合格】\n${clampString(result.text, 6000)}\n【问题】${errors.slice(0, 6).join('；')}\n请重新只输出合格 JSON。`,
          },
          signal: job.abort.signal,
        })
        finishKind = result.finish ? result.finish.kind : null
        payload = extractJson(result.text)
        errors = validateContinuation(payload)
      }
      if (errors.length > 0) {
        job.raw = clampString(result.text, 12000)
        if (finishKind === 'max-tokens') {
          throw new ApiError('ai_truncated', '模型输出被 token 上限截断：请把设置里的「最大 token」调大（最高 256000），或缩短文风/思维链模板。', 422)
        }
        throw new ApiError('ai_invalid_output', `模型输出无法采用：${errors.slice(0, 4).join('；')}`, 422)
      }
      job.finishReason = finishKind
      const storyId = (await (await this.deps.getStore()).bootstrap()).meta.storyId
      const record = {
        v: 1,
        id: randomId('c-'),
        parentId: job.parentId,
        createdAt: nowIso(),
        provider: job.provider,
        model: job.model,
        style: job.style || null,
        templates: job.templates
          ? {
            style: job.templates.style ? job.templates.style.name : null,
            logic: job.templates.logic ? job.templates.logic.name : null,
            cot: job.templates.cot ? job.templates.cot.name : null,
            memoryFormat: job.templates.memoryFormat ? job.templates.memoryFormat.name : null,
          }
          : null,
        action: job.action,
        usage: result.usage || null,
        payload: {
          title: clampString(payload.title || '', 80) || '续写',
          chapter: clampString(payload.chapter || '', 80) || undefined,
          reasoning: clampString(typeof payload.reasoning === 'string' ? payload.reasoning : '', 4000) || undefined,
          blocks: payload.blocks,
          choices: payload.choices,
        },
      }
      const store = await this.deps.getStore()
      await store.appendContinuation(record)
      const memoryAppend = payload.memoryAppend
      if (typeof memoryAppend === 'string' && memoryAppend.trim()) {
        const line = `- ${nowIso()} · ${storyId} · ${job.action && job.action.type === 'input' ? '玩家输入' : '玩家选择'}：${clampString(job.action.choiceLabel || job.action.text || '继续', 160)}\n  ${markdownQuote(memoryAppend)}`
        await store.appendMemory('## AI 记忆追加\n' + line)
      }
      if (Array.isArray(payload.plans)) {
        try {
          await store.updatePlans(payload.plans)
        } catch (error) {
          console.warn('[dsh-novel-arkterminal] plans update rejected:', error.message)
        }
      }
      job.status = 'done'
      job.doneAt = nowIso()
      job.payload = record.payload
      job.nodeId = 'gen:' + record.id
      job.recordId = record.id
      job.usage = result.usage || null
      job.maxTokens = maxTokens
      job.sampling = { temperature, topP, presencePenalty, frequencyPenalty }
      job.memoryAppended = typeof memoryAppend === 'string' && memoryAppend.trim() ? true : false
    } catch (error) {
      job.status = error && error.code === 'cancelled' ? 'cancelled' : 'error'
      job.doneAt = nowIso()
      job.error = { code: (error && error.code) || 'ai_error', message: (error && error.message) || String(error) }
      if (error && error.raw) job.raw = error.raw
    } finally {
      clearTimeout(timeout)
      job.abort = null
      if (this.currentJobId === job.id) this.currentJobId = null
    }
  }

  getJob(id) {
    const job = this.jobs.get(id)
    if (!job) return null
    return {
      id: job.id,
      status: job.status,
      startedAt: job.startedAt,
      doneAt: job.doneAt,
      parentId: job.parentId,
      provider: job.provider,
      model: job.model,
      styleName: job.style ? job.style.name : null,
      chapterWords: job.chapterWords || null,
      maxTokens: job.maxTokens || null,
      sampling: job.sampling || null,
      logicName: job.templates && job.templates.logic ? job.templates.logic.name : null,
      cotName: job.templates && job.templates.cot ? job.templates.cot.name : null,
      memoryFormatName: job.templates && job.templates.memoryFormat ? job.templates.memoryFormat.name : null,
      payload: job.payload,
      nodeId: job.nodeId || null,
      recordId: job.recordId || null,
      raw: job.raw || null,
      error: job.error,
      usage: job.usage,
      repairAttempt: Boolean(job.repairAttempt),
      retryMaxTokens: job.retryMaxTokens || null,
      finishReason: job.finishReason || null,
      transportRetries: job.transportRetries || 0,
      lastTransportError: job.lastTransportError || null,
      memoryAppended: Boolean(job.memoryAppended),
    }
  }

  cancel(id) {
    const job = this.jobs.get(id)
    if (!job) throw new ApiError('not_found', '找不到该续写任务', 404)
    if (job.status !== 'running') return { id, cancelled: false, status: job.status }
    if (job.abort) job.abort.abort()
    job.status = 'cancelled'
    job.doneAt = nowIso()
    return { id, cancelled: true, status: 'cancelled' }
  }
}

function markdownQuote(text) {
  return String(text)
    .split('\n')
    .map((line) => '  ' + line)
    .join('\n')
}
