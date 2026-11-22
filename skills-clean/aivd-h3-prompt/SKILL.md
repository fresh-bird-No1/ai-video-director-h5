---
name: aivd-h3-prompt
description: 单镜一次产出中文 H3 视频提示词、英文 H3 视频提示词和一张静帧分镜图提示词，按生成方式分流并共用同一组镜头事实。
author: 不晚
copyright: 本项目自研技能文本，未摘录任何第三方内容
license: MIT
version: 1.1.0
---

# 单镜三件套提示词

## 职责

- 对当前这一镜同时给出三份文本：`h3zh`（中文视频提示词）、`h3en`（英文视频提示词）、`frame`（中文静帧分镜图提示词）。
- 默认处理 `targetShot`；若 payload 没有 `targetShot`、只给了整集 `board`，说明是整集生成，改为逐镜输出 `shots` 数组，每镜仍给齐三份文本。
- 三份文本来自同一组镜头事实，主体位置、朝向、服装、道具、光线和景别必须互相咬合，不能各写一套。
- 视频提示词按 `mode` 分流；静帧只描述一个瞬间，不承担运镜与时间推进。

## 读什么

1. `targetShot`：`no`、`duration`（或 `durationSec`）、`shotSize`、`camera`、`description`、`timeline`、`beats`、`dialogue`、`assets`、`costumes`、`linkPrev`、`id`。没有 `targetShot` 时，逐镜从 `data.board` 读同样字段。
2. 生成方式：先看 `targetShot.mode`，再看 payload 的 `videoMode`；都缺失时按 `r2v`。本镜既没有资产参考图、也没有首帧/尾帧附图时，改按 `t2v`。
3. `data.board`：本镜前后关系、上一镜结尾、连续镜头开关。
4. `data.script`：核对说话人、动作顺序与台词原句。
5. `data.assets`：角色卡取外貌与服装，场景卡取空间地标与光源，道具卡取材质与外形，站位卡取左右前后与朝向。
6. `data.prompts`：本镜已有的三份提示词，用来判断是重写还是在旧稿上修改。

### 参考清单

- 从 `targetShot.assets` 取资产名，按 **角色 → 场景 → 道具 → 服装** 的顺序匹配 `data.assets`；`targetShot.costumes` 的换装排在最后。
- 每条图片素材依次编号 `<Picture 1>`、`<Picture 2>`……同一资产只占一个编号，同名资产必须回到同一张卡。
- 若出现视频或音频参考，另编 `<Video N>`、`<Audio N>`；参考视频夹带的声音不自动生成 `<Audio N>`。
- 没有任何资产参考图时，不写 `<Picture N>`，三份文本都按 `t2v` 取材。
- `i2v` / `fl2v` 的 `<Picture 1>`、`<Picture 2>` 专指附上的首帧与尾帧，不是资产清单里的图号；资产仍用名字写进正文。
- 若带 `attachedFrames`，文字后的图片按该顺序排列。先看首帧，`fl2v` 再看尾帧，再动笔；没有附图就按分镜设定写，不要假装看过。

## 怎么写

### 1. 先统一事实

先把下列内容写成一份内部清单，三份输出都从这份清单取数：

- 时长：`duration` / `durationSec`，所有动作必须装得下。
- 景别与运镜：`shotSize`、`camera`，三份文本都不得改写。
- 在场主体：姓名、年龄感、服装、随身物、开场位置与朝向。
- 空间：地点、时段、天气、关键地标、前中后景。
- 光线：主光方向、色温、明暗对比。
- 道具：名称、材质、磨损、与谁接触。
- 动作与台词：按 beat 的先后和原句。

### 2. 按生成方式分流

| mode | 视频提示词结构 |
| --- | --- |
| `t2v` | Base 三字段，`instruction` 为空串 |
| `i2v` | Base 三字段 + 首帧对齐指令 |
| `fl2v` | Base 三字段 + 首尾帧对齐指令 |
| `r2v` | 六段参考生结构 |

四种方式不能共用一套模板；`frame` 始终按静帧规则单独写。

### 3. 编号与主体

参考生必须写 `subject_definitions`：

- 清单几条就写几条，不丢、不换序、不串号、不把后一项写进前一项。
- 每条图片在同一句里写明类别，类别只允许 **角色、道具、场景、站位图、参考图** 五个词；中英文正文都保留这五个中文类别词。
- 编号、类别、名字与清单严格一致。单镜里每张图片对应一条 `<Subject N>`，编号从 1 起；`<Picture N>` 是本镜本地图号。`<Video N>`、`<Audio N>` 自成编号，不占 Subject 序号。清单没有的编号不得虚构。
- 带「补充说明」的条目，把说明并入对应主体；不得借机改编号、类别或名字。
- 角色图只锁外貌与服装；场景图只锁空间与布景；道具图只锁该物件外形；站位图只锁左右、前后与朝向，不替代场景图。
- 分镜里的屏幕、海报、资料画面若没有自己的参考图，不得占用已分配的 Picture 编号。

### 4. 时间码

- 每个 beat 含 `start`、`end`、`text` 三项，`start` / `end` 是秒数。
- 统一 `MM:SS.mmm`，区间写作 `00:00.000–00:02.000`。
- 首拍从 `00:00.000` 起，相邻拍首尾相接，末拍终点等于总时长。
- 起止秒数取自 `beats`，事件顺序与台词位置不得改。只允许两项归一：首拍起点归零、末拍终点归总时长；中间有间隙时并入前一拍末尾。
- `beats` 缺失时，从 `timeline` 的「0–2秒：内容」反解秒数，再转时间码。
- `[Shot 1]` 只写一次且不带时间戳；硬切才写 `[Shot 2] At MM:SS.mmm,`，一镜到底不得出现第二组。
- 每拍的动作量必须落在该拍区间内，最后一拍不得超出总时长。

### 5. 台词、说话人与截断

- 只取 `dialogue` 原句。「角色名：原句」只保留冒号后的部分。
- 原句被中文引号“ ”包住时，只取引号内文字；引号外的动作、神态、语气说明写成画面，绝不能当台词。
- 对白包进 `<d>[语种] 原文</d>`，不得改字。语种按说话人角色卡的 `language` 映射：中文→Chinese、英语→English、日语→Japanese、韩语→Korean、粤语→Cantonese；没写时按选题语言兜底，仍无法判断才用 Chinese。整镜无台词时省略 `<d>`，不要写「无台词」。
- 说话人写成 `<Subject N> (S1)`，`S1`、`S2` 按本镜开口顺序编号；同一主体重复开口仍用同一 Subject 编号。
- 台词被切断时，在 `</d>` 后紧贴 `<cutoff>`，不补完句子。
- 硬切紧贴对白时，在切点写 `<scenetrans>`，同一句原文不得拆改。

### 6. 扩写密度

`beats.text` 是骨架，不是成稿。每拍都要补足构图层次、光色材质、主体微动作、镜头幅度与可听见的物理声。禁止照抄原句、禁止只换同义词、禁止新增角色/对白/转折/硬切。

### 7. 中文视频提示词 `h3zh`

- `t2v`：`instruction` 为空字符串，正文从 `integrated_multimodal_description` 开始，先风格句，再逐拍；后接 `overall_soundscape`、`non_diegetic_music`。
- `i2v`：首行固定为 `For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.`；正文路径为首帧状态 → 起势 → 发展 → 结果。风格句与第一拍必须对得上首帧。
- `fl2v`：首行固定为 `How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the S.SS-second mark of the target video.`，`S.SS` 用总时长两位小数；正文路径为首帧状态 → 中间变化 → 尾帧状态。最后一拍必须落到尾帧可见状态。
- `r2v`：六段齐全，顺序为 `subject_definitions`、`summary`、`retention_analysis`、`detailed_description`、`overall_soundscape`、`non_diegetic_music`。
- `summary` 的任务类型只能是 `[reference generation]`、`[keyframe completion]`、`[video editing]`、`[video continuation]`、`[audio reuse]`、`[audio reference]` 之一；无参考素材时用 `[reference generation]`。
- `retention_analysis` 每个独立标签一项：画面用 `fully_preserved`、`partially_preserved`、`attribute_transfer`、`weak_reference`；音频用 `fully_copy`、`partially_copy`、`reference`。
- 段名单独成行并以英文冒号结尾，段间空一行；不使用 Markdown 标题、分隔线或加粗段名。
- 两个声音段分工固定：`overall_soundscape` 只写画面里能听见的环境与动作物理声；`non_diegetic_music` 只写角色听不见的配乐，没有就写 `N/A`。

### 8. 英文视频提示词 `h3en`

- 与 `h3zh` 同一结构、同一拍数、同一事件顺序、同一句台词，只把叙述语言换成英文。
- 标签、段名、任务类型名、保留关系标记、时间码保持英文协议；`<d>[语种] 原文</d>` 的语种按说话人角色卡的 `language` 选择，原文逐字保留，不翻译。
- `t2v` 的 `instruction` 仍为空字符串；`i2v` 与 `fl2v` 的对齐指令使用固定英文原句，不得改写。
- 角色、场景、道具、服装名沿用资产名，不翻译；类别词仍是角色、道具、场景、站位图、参考图。
- 不得把中文稿逐句硬译成信息量更低的英文，也不得在英文稿里新增中文稿没有的动作。

### 9. 静帧 `frame`

- 中文书写，给图像模型出分镜图。从 `beats` 里选一个信息量最大的瞬间，只写这一瞬。
- 必须写：主体姓名与外貌锚点、服装、位置与朝向、动作定格、道具接触点、景别中文词、光线方向与冷暖、场景地标、画风。
- 直呼角色名，对应已挂的定妆图；场景与道具用资产名。
- 不写运镜、不写秒数、不写声音、不写 H3 字段名、不写「然后」「接着」这类时间推进。
- `frame` 的站位、朝向、服装、道具和光线必须与同镜 `h3zh` / `h3en` 一致；`i2v` / `fl2v` 时还要与给定首帧一致。

### 10. 连续镜头

`linkPrev` 为 true（或 payload 的 `continuous` 为 true）时：

1. 中文稿在风格句后、`[Shot 1]` 前先写「无硬切。紧接上一段。」；英文稿写 `No hard cut. Immediately following the previous section.`。`continuity` 更长时补写机位、方向与主体交接。
2. 时间码从 `00:00.000` 重新起算。
3. 沿用上一镜结尾机位、运动方向、主体位置与动作趋势，不换机位、不重摆开场、不硬切。
4. 角色、服装、空间保持一致；参考生的 `<Subject N>` 不得改义。
5. 最后一拍停在可续接的稳定姿态。
6. 配乐主题连续，段末不淡出，除非分镜明确收束。

`linkPrev` 为 false 时，不写连续承接；第 1 镜的 `linkPrev` 必须为 false，硬切不得写「无硬切」。

## 输出

`kind` 固定为 `"prompts"`。单镜 `data` 同时给出四个键：

- `shotNo`：当前镜号，必填且不得改名。main.js 写库靠它定位镜头，绝不能删。
- `h3zh`：中文视频提示词全文。
- `h3en`：英文视频提示词全文。
- `frame`：中文静帧提示词。

整集生成时改用 `{episodeNumber, shots:[{no,h3zh,h3en,frame}]}`：`shots` 与分镜表逐镜对应，`no` 必填且不得省略；每项四键与单镜完全一致。单镜与整集两种形状不得混用。

```json
{"kind":"prompts","data":{"shotNo":5,"h3zh":"subject_definitions:\n<Subject 1> 是 <Picture 1> 中的角色林晚，齐肩湿发，深灰风衣，外貌与服装锁定为定妆设定。\n<Subject 2> 是 <Picture 2> 中的场景老宅客厅，木楼梯与矮桌构成纵深，空间与布景锁定为这张场景图。\n\nsummary:\n[reference generation] <Subject 1> 在 <Subject 2> 里停步看向茶杯并开口，<Picture 1> 只锁人物，<Picture 2> 只锁空间。\n\nretention_analysis:\n<Subject 1> (appears in [Shot 1]): fully_preserved - 林晚的发型、风衣与身份保持不变。\n<Subject 2> (appears in [Shot 1]): fully_preserved - 客厅木楼梯、矮桌与窗位保持不变。\n\ndetailed_description:\n写实电影感，低饱和，雨夜冷调里有一盏暖黄落地灯。\n[Shot 1]\n00:00.000–00:02.000\n中景，机位固定。<Subject 1> 从画面左侧入画后停步，湿发贴颊，右手黑伞尖滴着水；<Subject 2> 的矮桌上两只白瓷茶杯并排，背景木楼梯清晰。\n00:02.000–00:04.000\n<Subject 1> (S1) 微微俯身，左手停在靠外的茶杯上方，低声问，<d>[Chinese] 谁在上面？</d> 楼上木板一响，她抬眼看向楼梯口，手指停在半空。\n\noverall_soundscape:\n雨点敲窗，伞尖滴水，楼上木板轻响。\n\nnon_diegetic_music:\n极低的弦乐持续音，不盖过雨声。","h3en":"subject_definitions:\n<Subject 1> is the 角色 林晚 in <Picture 1>, with shoulder-length wet hair and a dark grey trench coat, appearance and wardrobe locked to the character sheet.\n<Subject 2> is the 场景 老宅客厅 in <Picture 2>, where the wooden staircase and low table build the depth, space and set dressing locked to this scene image.\n\nsummary:\n[reference generation] <Subject 1> stops inside <Subject 2>, looks at the teacups and speaks; <Picture 1> locks the person only, <Picture 2> locks the space only.\n\nretention_analysis:\n<Subject 1> (appears in [Shot 1]): fully_preserved - 林晚's hairstyle, trench coat and identity stay unchanged.\n<Subject 2> (appears in [Shot 1]): fully_preserved - the staircase, low table and window position stay unchanged.\n\ndetailed_description:\nRealistic cinematic look, low saturation, a cold rainy night warmed by one yellow floor lamp.\n[Shot 1]\n00:00.000–00:02.000\nA medium shot on a locked camera. <Subject 1> enters from frame left and stops, wet hair against her cheek, a black umbrella dripping in her right hand; on the low table of <Subject 2> sit two white porcelain cups, with the wooden staircase clear behind.\n00:02.000–00:04.000\n<Subject 1> (S1) leans slightly forward, her left hand hovering over the outer cup, and asks under her breath, <d>[Chinese] 谁在上面？</d> A floorboard creaks above; she lifts her eyes to the staircase and freezes her fingers mid-air.\n\noverall_soundscape:\nRain tapping the window, water dripping from the umbrella, a light creak from the floor above.\n\nnon_diegetic_music:\nA very low sustained string tone that never covers the rain.","frame":"中景静帧，雨夜老宅客厅。林晚位于画面左侧三分之一，身体朝右，齐肩湿发，深灰风衣，右手握滴水的黑伞；她微微俯身，左手悬在靠外的白瓷茶杯上方，目光抬向右后方木楼梯口。右侧落地灯投下暖黄光，左侧窗外冷蓝雨光照亮雨痕；矮桌上两只白瓷茶杯并排，背景木楼梯清晰。写实电影感，低饱和，人物与场景严格参考现有资产卡。"}}
```

回复末尾必须附一个 `{"kind":"prompts","data":{...}}` 结构的 JSON 代码块；说明文字放在代码块外。用户点「写入草稿」之前，不得声称已写入项目。

## 硬性约束

- 单镜请求只处理 `targetShot`，整集请求逐镜处理；两种请求都不拆镜、不并镜、不改分镜表、不改时间轴、不改景别、不改运镜、不改生成方式。
- 单镜请求输出 `{shotNo,h3zh,h3en,frame}`；整集请求输出 `{episodeNumber,shots:[{no,h3zh,h3en,frame}]}`，两种形状不得混用。
- 四键必须同时输出，`shotNo` 或 `shots[].no` 不得缺失或改名。
- `h3zh` 与 `h3en` 必须同结构、同拍数、同事件、同台词；不得一份六段、另一份三字段。
- `t2v` 的 `instruction` 必须为空；`i2v` 必须写 0.00 秒对应 `<Picture 1>`；`fl2v` 必须写 0.00 秒首帧与 `S.SS` 秒尾帧。
- 参考数量、顺序、编号、类别、名字与项目数据一致；类别只用角色、道具、场景、站位图、参考图。
- 时间码从 `00:00.000` 起、首尾相接、末拍等于总时长；动作不得超时。
- 台词只取原句并包进 `<d>[语种] …</d>`，语种与说话人角色卡的 `language` 一致；引号外动作不当台词；无台词省略标记。
- `frame` 只写一个静止瞬间，不写运镜、时间、声音或 H3 字段名。
- 三份文本在站位、朝向、服装、道具、光线和景别上不得互相冲突。
- 连续镜头遵守第 10 节；第 1 镜不写承接；硬切不写「无硬切」。
- 不新增角色、场景、道具、台词或转折；资产名不翻译、不改写。

## 交付前自检

- 单镜 `shotNo` 或整集 `shots[].no` 是否保留，整集是否逐镜无遗漏？
- `h3zh` 与 `h3en` 的结构是否都符合 `mode`，拍数与时间码是否一一对应？
- 参考清单是否逐条落地，编号是否连续，类别是否只用了五个允许词？
- 每拍动作是否在时长内完成，景别与运镜是否与字段一致？
- 台词是否原句、说话人是否清楚、截断与硬切标记是否正确？
- `frame` 是否只描述一个瞬间，且与两份视频稿的构图、服装、光线一致？
- 输出 JSON 能否被 `JSON.parse` 解析，是否无注释、无尾逗号？
