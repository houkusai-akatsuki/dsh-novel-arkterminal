/**
 * dsh-novel-arkterminal / host entry.
 *
 * Mounts the same-origin HTTP API used by the browser terminal half, plus an
 * optional `novel_terminal` tool so the chat agent can read the AI memory area
 * and drive continuations.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SaveStore } from './store.js'
import { StoryStore } from './story.js'
import { AiRunner } from './ai.js'
import { buildRoutes } from './routes.js'
import { ApiError, sendError } from './util.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgDir = path.resolve(here, '..')

export const name = 'novel-terminal'

function makeTool(deps) {
  return {
    name: 'novel_terminal',
    description:
      '方舟终端（互动小说）：读取当前故事状态与 AI 记忆区、追加/覆盖记忆、查看计划，或为当前节点触发一段 AI 续写。动作：state / memory_read / memory_write / plans / continue。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['state', 'memory_read', 'memory_write', 'plans', 'continue'] },
        text: { type: 'string', description: 'memory_write 时：替换后的记忆全文' },
        append: { type: 'string', description: 'memory_write 时：追加到记忆末尾的段落' },
        parentId: { type: 'string', description: 'continue 时：从哪个节点继续' },
        instruction: { type: 'string', description: 'continue 时：给 AI 的额外指令' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render(_args, value) {
        return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
      },
    },
    async execute(args) {
      const store = await deps.getStore()
      const action = args && args.action
      if (action === 'state') {
        const boot = await store.bootstrap()
        const saves = await deps.saves.list()
        return {
          ok: true,
          story: { id: boot.meta.storyId, title: boot.meta.storyTitle, nodes: boot.meta.counts.nodes },
          generated: boot.meta.counts.generated,
          plans: boot.plans,
          memoryBytes: Buffer.byteLength(boot.memory, 'utf8'),
          saves: saves.slots.map((slot) => ({ slot: slot.slot, nodeId: slot.nodeId, updatedAt: slot.updatedAt })),
          paths: boot.paths,
        }
      }
      if (action === 'memory_read') {
        return { ok: true, memory: await store.loadMemory() }
      }
      if (action === 'memory_write') {
        if (typeof args.append === 'string' && args.append.trim()) {
          await store.appendMemory(args.append)
        } else if (typeof args.text === 'string') {
          await store.updateMemory(args.text)
        } else {
          throw new ApiError('invalid_payload', 'memory_write 需要 text 或 append', 422)
        }
        const memory = await store.loadMemory()
        return { ok: true, memoryBytes: Buffer.byteLength(memory, 'utf8') }
      }
      if (action === 'plans') {
        return { ok: true, plans: await store.loadPlans() }
      }
      if (action === 'continue') {
        const boot = await store.bootstrap()
        let parentId = typeof args.parentId === 'string' && args.parentId ? args.parentId : null
        if (!parentId) {
          const saves = await deps.saves.list()
          const auto = saves.slots.find((slot) => slot.slot === 'auto')
          parentId = auto && auto.nodeId ? auto.nodeId : boot.story.start
        }
        const job = await deps.ai.continueStory({
          parentId,
          action: {
            type: 'input',
            text: typeof args.instruction === 'string' && args.instruction ? args.instruction : '让故事继续发展',
          },
        })
        return { ok: true, ...job }
      }
      throw new ApiError('invalid_payload', `未知 action：${String(action)}`, 422)
    },
  }
}

export function apply(ctx) {
  const saves = new SaveStore()
  let storePromise = null
  const deps = {
    ctx,
    saves,
    getStore: async () => {
      if (!storePromise) storePromise = StoryStore.resolve(ctx, pkgDir)
      return await storePromise
    },
  }
  deps.ai = new AiRunner(ctx, deps)

  ctx.inject(['webServer'], (webCtx) => {
    const routes = buildRoutes(deps)
    for (const route of routes) {
      webCtx.effect(
        () =>
          webCtx.webServer.register({
            kind: 'exact',
            path: route.path,
            handler: (req, res) => {
              Promise.resolve()
                .then(() => route.handler(req, res))
                .catch((error) => {
                  try {
                    sendError(res, error)
                  } catch (sendFailure) {
                    console.error('[dsh-novel-arkterminal] failed to send error', sendFailure)
                  }
                })
            },
          }),
        `novel-terminal: ${route.path}`,
      )
    }
  })

  try {
    ctx.inject(['tools'], (toolCtx) => {
      toolCtx.effect(() => toolCtx.tools.register(makeTool(deps)), 'novel-terminal: tool')
    })
  } catch (error) {
    console.warn('[dsh-novel-arkterminal] novel_terminal tool unavailable:', error && error.message)
  }
}
