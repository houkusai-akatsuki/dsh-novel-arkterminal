# 方舟终端（dsh-novel-arkterminal）

可交互小说终端插件：在 Harness Web GUI 左侧新增「方舟终端」图标，点开是占满主区域的 CRT 科幻终端页面。

**本插件只提供终端能力与数据协议，不内置任何小说剧情。** 剧情由你自己提供的 Markdown/JSON 决定。

## 功能

- 侧边栏入口 + 全屏主面板（`sidebar.panellist` + `main`）
- CRT 视觉：黑底磷光、扫描线、暗角、等宽字、状态栏、微发光
- 章节阅读 + 打字机/跳过；选项分支与效果；自由输入
- AI 续写：调用宿主 `llm` 服务，自动/手动模式，校验 JSON 后写入 `generated/`
- 当前计划/未完成目标面板、AI 记忆区（`memory.md`，AI 可读写；侧栏「记忆」页可查看/编辑/追加/重新读取）
- 叙事模板：文风 / 语言逻辑 / 思维链 / 记忆区格式 四类，内置多套 + 自定义 + JSON 导入导出；选择后注入 AI 续写的 system prompt
- 思维链：隐藏思考链写入 `reasoning` 字段，不进入正文；侧栏「思维链」可查看最近记录
- 角色对话着色：正文支持 `<user-dialogue>` / `<partner-dialogue>` / `<npc-dialogue>` 标签，按角色配色
- 人物对话气泡：对话块以头像 + 角色名 + 气泡显示，玩家角色（爱丽丝）与 NPC 左右分栏
- 对话历史：顶栏「对话历史」把已走过的**所有章节对话按剧情顺序连成一条记录**（章节间隔用分隔线标出），并回看你做过的选择；可配合「设置 → 显示 → 对话字号」单独缩放气泡/历史字号
- 世界书图鉴（搜索、正文 `[[id|文字]]` 跳转）；支持 JSON / SillyTavern / Markdown 导入与导出
- 存档/读档/回退/导出导入（存于 `$DSH_HOME/novel-terminal/saves.json`）
- 选择历史、分支状态、打字音效（WebAudio 合成）、全屏沉浸
- 剧情编辑器：节点/选项/世界书/计划/记忆、原始 JSON、备份恢复、Markdown 导入
- 终端内设置面板（显示/音效/AI/剧情源/存档），localStorage 持久化
- Host 工具 `novel_terminal`：让聊天中的 AI 读取状态/记忆、追加记忆、触发续写

## 安装

让 DSH 安装本目录（插件管理器 `install_bundle`，target 为本目录绝对路径），确认返回 `application: applied`，然后刷新 Web 页面。

## 剧情数据目录

默认读取工作区 `asi-1939/terminal/`（也可用环境变量 `DSH_NOVEL_TERMINAL_ROOT` 指定）：

```
asi-1939/terminal/
  story.json         剧情图（节点/选项/角色，编辑器可写）
  worldbook.json     世界书条目
  memory.md          AI 记忆区（AI 可读写；终端内可编辑）
  plans.json         当前计划/未完成目标
  styles.json        导入/自定义叙事模板（同一文件按 kind 区分四类；内置模板在客户端代码里）
  manuscript/*.md    Markdown 稿件（导入源；README.md 会被忽略）
  inbox.jsonl        终端事件（选择/输入）
  generated/         AI 续写记录（append-only）
  backups/           自动备份
```

找不到工作区故事时回退到包内 `story/` 演示空壳（只读）。

## 剧情数据格式（story.json）

```json
{
  "schema": 1,
  "id": "story-id",
  "title": "标题",
  "subtitle": "副标题",
  "language": "zh",
  "start": "node-id",
  "characters": [{ "id": "c1", "name": "角色" }],
  "nodes": {
    "node-id": {
      "chapter": "章节",
      "title": "节点标题",
      "blocks": [
        { "type": "narration", "text": "正文" },
        { "type": "dialogue", "speaker": "角色", "text": "台词" },
        { "type": "system", "text": "系统提示" }
      ],
      "choices": [
        { "id": "c", "label": "选项", "next": "下一节点" },
        { "id": "ai", "label": "让 AI 继续", "next": null, "ai": true }
      ],
      "input": { "enabled": true, "placeholder": "自由输入…", "continueWithAI": true },
      "worldbook": ["worldbook-id"]
    }
  }
}
```

- `choices[].next = null` 或 `ai: true`：点击后调用 AI 续写。
- `requires`（可选）：`[{ "flag": "x" }]`，配合 `effects.set` 做条件分支。
- 正文支持 `[[worldbook-id|显示文字]]` 链接。

## Markdown 导入

```
node scripts/import-manuscript.mjs
```

或在终端「设置 → 剧情与编辑 → 从 Markdown 导入」。格式见 `asi-1939/terminal/manuscript/README.md`：`#/##` 标题分章、空行分段、`> ` 行作为选项。导入前自动备份旧 `story.json`。**导入新故事时默认同时清空计划、记忆区、存档与 AI 生成记录**（设置里可取消勾选；编辑器内导入始终重置），避免旧故事的进度混进新世界。

## AI 续写

- 默认模型：宿主 `agentDefaultModel.currentSelection()`；可在设置 → AI 续写 → 模型路由里切换宿主提供的任意 provider/model。
- 采样参数：温度、Top_P、存在惩罚、频率惩罚会随请求传给宿主 `llm.stream`；Top_K 目前不在宿主 `llm` 接口的通用参数里，无法透传（截图里的 Top_K 只在直接调用该 provider 的客户端里才有）。
- 若要把模型换成 Gemini / Claude / 其他 OpenAI-compatible 模型，需要在 DSH 里配置对应 provider 路由（插件会调用宿主 `llm` 服务并自动列出它）；本插件本身不直连第三方 API。配置后「模型路由」下拉会出现新的 `provider / model`，选中即对该故事生效。
- 叙事模板：设置 → 叙事模板里分别选择 文风 / 语言逻辑 / 思维链 / 记忆区格式；对应 prompt 会追加到续写的 system prompt。
- 调用链：`ctx.llm.stream({ provider, model, system, messages, temperature, maxTokens })`。
- 模型必须返回结构化 JSON（blocks + choices + 可选 reasoning/plans/memoryAppend）；校验失败会修复重试一次，仍失败则报错且不写盘。
- **最大 token 默认 2400，上限 256000**（V4.1-Flash 上下文 1M；DeepSeek Messages 适配器默认单次完成上限 256k）。输出被 token 上限截断时（`finish: max-tokens`）会自动把预算翻倍重试一次；仍失败则报 `ai_truncated`，提示调大「最大 token」或缩短文风/思维链模板。旧版本地设置里的 1200 会自动迁移到 2400，越界值收敛到 400–256000。
- **传输错误自动重试**：遇到 `DeepSeek Messages transport failed` 等网络/上游错误，会以 1.5s、4s、8s 退避自动重试 3 次（共 4 次尝试）；仍失败报 `ai_transport` 并提示检查网络/代理。任务超时为 600s。
- **玩家角色**：世界书中 id 为 `wb-player`（或标题含「玩家角色」）的条目会始终注入 AI 提示词，并标注【玩家角色】；续写视角、叙述信息范围与选项都以该角色为准。当前 1939 故事里玩家操控的是**爱丽丝（A11CE）**，毛泽东为主要 NPC。
- **单章字数**：设置 → AI 续写 → 单章字数（默认 800，范围 200–20000）。该目标会写进 prompt 的【本次篇幅】并决定分段提示（最多 32 段）；token 预算按 `字数 × 2 + 800` 自动估算，最终取它与「最大 token」中的较大值（上限 256000）。
- 成功的结果写入 `generated/continuations.jsonl`，同时追加 `memory.md`、可选更新 `plans.json`；不修改 `story.json`。
- 单故事同时只运行一个续写任务，可取消，超时 600s。

## 叙事模板

四类模板共用 `styles.json`（客户端代码 `src/client/05_writing_styles.js` 定义内置项），每类都可单选、新建自定义、导入/导出 JSON。

### 文风（style）

| id | 名称 | 取向 |
|---|---|---|
| literary-restrained | 克制文学 | 留白、动作与细节驱动，少形容词与直接抒情 |
| classical-baihua | 古典白话 | 民国白话为底，掺少量文言节奏，用词雅正 |
| cold-realist | 冷硬纪实 | 新闻纪实笔法：短句、精确时空与数字 |
| lyrical | 诗意抒情 | 意象丰富、节奏舒缓，允许环境与心理描写 |
| suspense-cold | 悬疑冷峻 | 信息差与压迫感，短段落，结尾留钩子 |
| five-senses | 五感细描 | 动作三段、句式多变、五感反馈具体化 |
| grounded-dialogue | 生活化对白 | 符合中国人日常口语与身份年龄，反翻译腔 |

### 语言逻辑（logic）

- `kui-logic`：第三人称、中文小说笔法、定语/状语/补语与从句、动作三段、五感反馈、生活化对白。
- `dialogue-tags`：用 `<user-dialogue>` / `<partner-dialogue>` / `<npc-dialogue>` 包裹对话，终端按角色配色。

### 思维链（cot）

- `hidden-chain`（默认启用）：单行箭头链，只写入 JSON `reasoning`，不进入正文。
- `ten-step`：解析指令→角色→人设→画面→剧情→利弊→矛盾→文风→记忆→对话归属。
- `rule-v3`：高权重 RULE 自检（不省略、不缩减、记忆客观、格式完整）。

思维链记录可在侧栏「思维链」页查看；`reasoning` 同时写入 generated 记录，不会展示在阅读区。

### 记忆区格式（memory）

- `work-history`（光湖·工作记忆+历史档案）：工作记忆最多 4 条，满 4 条合成为一条历史档案并清空。
- `star-corridor`（星记忆回廊）：LTM / STM 双表格，短期 7 条触发固化。
- `v3-reduced`（陈师傅·3.0 缩减）：短期 ≤7 条、长期无上限、总结规则、客观不省略。

记忆格式只约束 AI 的 `memoryAppend` 写法；`memory.md` 本身仍是纯文本，可在侧栏直接编辑。

### 导入格式

```json
{"schema":1,"styles":[
  {"name":"名称","prompt":"提示词","description":"可选","kind":"style|logic|cot|memory"}
]}
```

也接受直接是数组。在某一类模板的导入入口导入时，未写 `kind` 的条目会归入当前类别；写入剧情目录 `styles.json`，可导出备份。内置模板不可删除；导入/自定义模板可删除。

> 说明：`非文风ai语言逻辑分享-Kui.txt` 里的成人向内容模块未内置，只采纳了视角、句式、五感与对白等通用语言逻辑。

## 世界书导入

三个入口（功能相同）：

1. 侧栏「世界书」页顶部：合并/覆盖 + 导入 + 导出。
2. 设置 → 剧情与编辑 → 世界书导入。
3. 编辑模式 → 编辑 → 世界书页：导入（合并）/ 导出。

支持的文件：

- JSON 数组：`[{ "id": "可选", "type": "person|place|tech|event|org|other", "title": "标题", "summary": "摘要", "body": "正文" }]`
- `{ "worldbook": [...] }` 或 `{ "entries": [...] }`
- SillyTavern 世界书：`{ "entries": { "0": { "uid": 1, "key": ["关键词"], "comment": "标题", "content": "正文", "disable": false } } }`（`disable:true` 会跳过）
- id → 条目对象：`{ "we-a": { "title": "...", "body": "..." } }`
- Markdown：按 `#` / `##` / `###` 标题分节，标题即条目名，正文即内容；类型按标题关键词猜测。

模式：**合并**（同 id 覆盖、其余保留）或 **覆盖**（替换现有全部世界书）。导入由 Host 统一规范化与校验，成功后可一键导出 `worldbook.json`。空结果或非法条目会报错且不落盘。

**换世界时重置旧状态**：导入框里有「同时清空计划/记忆/存档/生成记录」选项；选「覆盖」模式时默认勾选，选「合并」时默认不勾选。勾选后会清空 `plans.json`、`memory.md`、本机存档与 `generated/` 记录（生成记录会先改名备份）。**任何重置/带重置的导入都会先把计划、记忆、存档快照到 `backups/<时间戳>-runtime.json`**，需要时可以从该文件手工恢复。设置页另有「清空计划与记忆」「清空全部状态（含存档）」按钮，对应 `POST /api/reset`。

## Host API（同源）

```
GET  /dsh-novel-arkterminal/api/health
GET  /dsh-novel-arkterminal/api/bootstrap
GET  /dsh-novel-arkterminal/api/refresh
POST /dsh-novel-arkterminal/api/event            # choice/input/enter → inbox.jsonl，可 autoContinue
GET  /dsh-novel-arkterminal/api/saves
GET/POST /dsh-novel-arkterminal/api/save
POST /dsh-novel-arkterminal/api/save/delete
POST /dsh-novel-arkterminal/api/save/import
GET  /dsh-novel-arkterminal/api/save/export
GET  /dsh-novel-arkterminal/api/ai/config
POST /dsh-novel-arkterminal/api/ai/continue
GET  /dsh-novel-arkterminal/api/ai/job?id=
POST /dsh-novel-arkterminal/api/ai/cancel
GET  /dsh-novel-arkterminal/api/story/raw
PUT  /dsh-novel-arkterminal/api/story
POST /dsh-novel-arkterminal/api/story/import
POST /dsh-novel-arkterminal/api/story/adopt
GET  /dsh-novel-arkterminal/api/story/backups
POST /dsh-novel-arkterminal/api/story/backup/revert
GET/PUT /dsh-novel-arkterminal/api/worldbook
POST /dsh-novel-arkterminal/api/worldbook/import
POST /dsh-novel-arkterminal/api/reset            # reset: { plans, memory, saves, generated }
GET/PUT /dsh-novel-arkterminal/api/plans
GET/PUT /dsh-novel-arkterminal/api/memory
GET/PUT /dsh-novel-arkterminal/api/styles
GET  /dsh-novel-arkterminal/api/manuscript
```

统一响应 `{ ok, data }` / `{ ok: false, error: { code, message } }`。

## 开发

```bash
node scripts/build-client.mjs   # src/client/*.js → lib/client.js
npm run check                   # node --check 所有 host/client/scripts
npm test                        # 单元测试（story/store/ai/importer）
```

Client 半边是手写的 `window.__ModuleLoader__.load(...)` 模块，无打包依赖；修改 `src/client/` 后需重新 build。

## 备注

- 存档在 `$DSH_HOME/novel-terminal/`（端口无关，重启保留）；换端口不会丢。
- 工作区故事目录不可写时（离开工作区回退到包内故事）终端为只读模式。
- 插件不采集、不上传任何数据；AI 调用只通过宿主 `llm` 服务。
