---
name: aivd-shot-revise
description: 短剧05-改这镜。只调整当前打开镜头的分镜设定，未点名的字段维持原意；不重拆整集，不碰视频提示词。
author: 不晚
copyright: 本项目自研技能文本，未摘录任何第三方内容
license: MIT
version: 1.1.0
---

# 单镜分镜修改

## 职责

- 只修改当前打开的这一镜，输出完整可用的一镜设定。
- 按用户说明改动被点名的字段；没有点名的字段保留原值或原意，不借机润色整镜。
- 不重拆整集，不改其他镜头，不写视频提示词。
- 用户改动如果影响资产库的共用设定，按 `assetUpdates` 规则登记；没有变化就返回空数组。

## 读什么

- 当前镜头的全部字段，运行时会放在 `targetShot`（旧提示词里也称 `currentShot`），作为修改基线。
- 本集分镜表 `board` 中当前镜前后的镜头，用来判断衔接是否仍然成立。
- 本集剧本对应段落，核对动作顺序、说话人与台词原句。
- 角色卡、场景卡、道具卡、站位卡，以及角色卡里的服装条目，用来保持名称、外观和服装一致。
- 资产库现有条目及其 `description`、`extra` 等共用设定，用来判断是否需要写 `assetUpdates`。
- 用户本次的修改说明，只执行说明里真正点到的项目。

## 怎么写

### 1. 先列出要改的字段

- 从用户说明里确认要改的是画面、`description`、`timeline`、`beats`、`durationSec`、`shotSize`、`camera`、`dialogue`、`assets`、`costumes`、`soundscape`、`voiceNames`、`mode`、`linkPrev`、`continuity`、`transition`、`framePrompt` 中的哪几项。
- 只改这些字段；其余字段原样保留。没有点名的台词、动作、画面重点和资产不要改动。
- 用户只说「节奏快一点」这类整体要求时，优先改 `durationSec`、`beats` 与 `timeline`，不重写剧情。
- 输出前用一句话逐项写「字段：修改前 → 修改后」，放在 JSON 代码块外。

### 2. 时间轴与时长

- 每镜必须继续给结构化 `beats`，元素为 `{"start":整数,"end":整数,"text":"..."}`。
- 第一段 `start` 为 0；后一段 `start` 等于前一段 `end`；最后一段 `end` 等于 `durationSec`。不得重叠、跳秒或超时。
- `durationSec` 为 1–15 的整数。改了时长就必须从 0 重写 `beats` 与 `timeline`，不能留下旧时间点。
- `timeline` 一行一段，格式固定为 `0–2秒：内容`，必须与 `beats` 逐段对应。
- 改 `shotSize` 或 `camera` 时，`description`、`beats`、`timeline` 中与新景别、新运镜冲突的描述要同步修正。
- `framePrompt` 不因改景别或运镜而自动重写；只有用户明确要求改分镜图提示词时才改。

### 3. 台词与画面

- `dialogue` 有台词时只能写成 `角色名：“原句”`，旁白写 `旁白：“原句”`。引号必须是中文双引号，说话人必须是资产卡里的角色名。
- 不改台词用词，除非用户明确要求改词；改词后仍保持同一说话人和中文双引号格式。
- `beats.text` 中引号内是台词，引号外写动作、神态和声音；招牌、字幕、短信文字用「」。
- `voiceNames` 按本镜开口顺序列角色名，不含旁白；无人说话为 `[]`。台词增删后要同步这个顺序。
- `soundscape` 写整镜持续的环境音；单秒动作声留在 `beats.text`。
- `shotSize`、`camera`、`mode` 继续使用下方固定枚举。
- `assets` 随画面增减同步，但只能用资产卡里已有的名字；不得新增角色。
- `costumes` 只在用户点名换装或本镜服装确实变化时调整，格式 `角色名：服装名称`，服装名称必须与角色卡服装条目完全一致；否则保留原值。
- `linkPrev`、`continuity`、`transition` 默认保留原值；用户明确要求改衔接时才改，并仍按长镜头拆段规则判定。
- 一镜同框人数上限为 3 人。

### 4. assetUpdates 规则

对照资产库判断这次改动是否触及共用设定：

- 改动改变了已有角色、场景、道具或站位的共用设定时，写一条 `{"type":"...","name":"...","description":"...","extra":"..."}`。
- 只填真正变化的 `description` 或 `extra`，没变的字段不要带；两项都变才同时写。
- `type` 用 `character`、`scene`、`prop`、`standing`；H5 也接受中文「角色」「场景」「道具」「站位」。
- 本镜新增、但资产库里还没有的场景、道具或站位，只写 `{"type":"...","name":"..."}`，不要写 `description`、`extra`、提示词或图片。
- 不新建角色。角色名不在角色卡里的，视为错误，不要写进 `assetUpdates`。
- 只影响本镜的一次性变化，不写进 `assetUpdates`。
- 不变更图片，不写生图提示词，不改任何 `prompt` 字段。
- 没有资产变化时，`assetUpdates` 为 `[]`。

## 输出

只给一个 JSON 代码块，结构为 `{"kind":"board","data":{...}}`，`kind` 固定 `"board"`。`data` 包含：

- `episodeNumber`：整数集号。
- `shots`：只含被修改的这一镜，长度必须为 1，`no` 与当前镜号相同。每项包含 `no`、`durationSec`、`shotSize`、`camera`、`description`、`timeline`、`beats`、`dialogue`、`assets`、`costumes`、`linkPrev`、`continuity`、`transition`，并补全 `mode`、`soundscape`、`voiceNames`、`framePrompt`，可选 `characterNames`、`sceneName`、`propNames`。
- `assetUpdates`：资产共用设定变更或新增场景、道具、站位的登记数组；无变化为 `[]`。

合法 JSON 示例（本镜把景别改为近景、运镜改为推，并登记一处场景设定变化与一件新道具）：

```json
{
  "kind": "board",
  "data": {
    "episodeNumber": 5,
    "shots": [
      {
        "no": 4,
        "title": "门缝冷光",
        "durationSec": 5,
        "mode": "r2v",
        "shotSize": "近景",
        "camera": "推",
        "description": "沈砚停在旧书店门内，盯着门缝里滑进来的纸条，走廊冷光切过脚边。",
        "timeline": "0–2秒：近景，沈砚站在门内左侧，手还按在门把上，柜台台灯暖黄，门缝透进走廊冷光。\n2–3秒：镜头轻推，一张折起的纸条从门缝下滑入，停在门槛内侧。\n3–5秒：沈砚低头看向纸条。沈砚：“谁在外面？”说完没有开门。",
        "beats": [
          { "start": 0, "end": 2, "text": "近景，沈砚站在画面左侧门内，穿灰蓝围裙，身体朝右，右手按在门把上；柜台台灯从后方打来暖黄光，门缝透进走廊冷白光；他停住不动，门轴轻响一声。" },
          { "start": 2, "end": 3, "text": "镜头轻推，一张折起的纸条从门缝下滑入，停在门槛内侧，冷白光在纸边形成细亮线；纸面摩擦地面，声音很轻。" },
          { "start": 3, "end": 5, "text": "近景，沈砚低头看向纸条，眉眼下压，身体仍朝右；暖黄光落在侧脸，冷白光贴着脚边；他没有开门。沈砚：“谁在外面？”说完呼吸放轻，门外脚步声远去。" }
        ],
        "dialogue": "沈砚：“谁在外面？”",
        "assets": ["沈砚", "旧书店", "门缝纸条"],
        "costumes": ["沈砚：灰蓝围裙"],
        "linkPrev": false,
        "continuity": "",
        "transition": "切",
        "characterNames": ["沈砚"],
        "sceneName": "旧书店",
        "propNames": ["门缝纸条"],
        "soundscape": "夜雨、旧木门轻响、门外远处脚步",
        "voiceNames": ["沈砚"],
        "framePrompt": "近景，沈砚站在画面左侧旧书店门内，穿灰蓝围裙，右手按着门把，低头看向门槛内侧的折起纸条；柜台台灯暖黄，门缝透进走廊冷白光。"
      }
    ],
    "assetUpdates": [
      {
        "type": "scene",
        "name": "旧书店",
        "description": "夜间闭店后的旧书店，柜台台灯仍亮，门框上的铜铃已摘下，门缝会透进走廊冷光。"
      },
      {
        "type": "prop",
        "name": "门缝纸条"
      }
    ]
  }
}
```

修改说明示例（写在 JSON 外）：
- `shotSize`：中景 → 近景。
- `camera`：固定 → 推。
- `timeline`：按新运镜重写，覆盖 0 到 5 秒。
- `assetUpdates`：旧书店补一条共用设定变化；门缝纸条在本镜首次出现且库中没有，只登记名称。

用户点击「写入草稿」之前，不要声称已经写入项目。

## 硬性约束

- `shots` 只能有一条，`no` 必须等于当前镜号，禁止输出其他镜头。
- 本镜仍只承担一个连续调度，不把整场戏塞进一镜。
- 未点名的字段不得改变原意，不得借机重写整镜。
- `durationSec` 为 1–15 的整数，最后一段 `beats[].end` 必须等于它。
- `beats` 首段 `start` 为 0，段段相接；`timeline` 必须逐段对应，格式为「开始–结束秒：内容」。
- `shotSize` 只能取：大远景、远景、全景、中景、近景、特写、大特写。
- `camera` 只能取：固定、摇、移、跟、推、拉、升降、手持。
- 旧版英文分镜代码可作对照：`extreme-wide`/`wide`/`medium`/`medium-close`/`close`/`extreme-close` 对应大远景/全景/中景/中近景/近景/特写；`Static Shot`/`Push In`/`Pull Out`/`Zoom In`/`Zoom Out`/`Pan Left`/`Pan Right`/`Truck Left`/`Truck Right`/`Tilt Up`/`Tilt Down`/`Pedestal Up`/`Pedestal Down`/`Arc Shot`/`Tracking Shot`/`Shake Slightly`/`Shake Strongly`/`POV` 供旧字段识别。H5 的 `shotSize`、`camera` 仍写中文值，不混写。
- `mode` 只能取：`t2v`、`i2v`、`fl2v`、`r2v`。
- `linkPrev` 只在同一个超过 15 秒的长镜头拆段时为 `true`；硬切、正反打、换景、换机位必须 `false`，第 1 镜必须 `false`。为 `true` 时 `continuity` 必须写清机位、运动方向、主体位置和动作如何接上一段结尾。
- 台词与资产名称不得超出角色卡、场景卡、道具卡范围；不得新建角色。
- `assetUpdates` 只允许改共用设定的 `description`、`extra`，或新增场景/道具/站位的 `type`、`name`；不得改图片与生图提示词。
- 不改前后镜头，不重排分镜，不写六段视频提示词。

## 交付前自检

- 是否只输出了当前这一镜，`no` 是否与当前镜一致。
- 修改说明是否覆盖每一处实际改动，未点名字段是否保持原意。
- 改过时长、景别或运镜后，`beats` 与 `timeline` 是否同步且覆盖到新的 `durationSec`。
- 台词格式是否为 `角色名：“原句”`，`voiceNames` 是否同步。
- `assets`、`costumes` 名称是否都能在资产卡与服装条目中找到。
- `linkPrev` 与 `continuity` 是否仍符合长镜头拆段判定，未点名时是否保留原意。
- `assetUpdates` 是否只登记真正变化的共用设定，或只写新增场景/道具/站位的 `type`、`name`；无变化是否为 `[]`。
- 是否没有改动图片与生图提示词，是否没有新增角色。
- JSON 能否解析，是否没有注释与尾逗号。
