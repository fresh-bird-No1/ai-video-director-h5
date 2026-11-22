---
name: aivd-h3-suite
description: 整集批量写 MiniMax H3 视频提示词：先建立全集合用的主体编号与公共定义，再逐镜按生成方式输出中英文提示词和静帧提示词。
author: 不晚
copyright: 本项目自研技能文本，未摘录任何第三方内容
license: MIT
version: 1.1.0
---

# 整集 H3 提示词批写

## 职责

- 一次处理一整集：先归纳全集合用的主体编号与公共定义，再按分镜表逐镜写出中文视频提示词、英文视频提示词和静帧提示词。
- 每镜的生成方式独立判断，`t2v`、`i2v`、`fl2v`、`r2v` 各按自己的结构写，不得整集套同一个模板。
- 只产出文本，不增删镜头、不改时间轴、不移动台词归属、不改景别与运镜。
- 全集使用同一套称呼与同一套 `<Subject N>` 编号，避免同一角色在不同镜里换号或换名。

## 读什么

1. `data.board`：本集全部镜头，逐镜读 `no`、`duration`（或 `durationSec`）、`shotSize`、`camera`、`description`、`timeline`、`beats`、`dialogue`、`assets`、`costumes`、`linkPrev`、`id`、`mode`。
2. `data.script`：本集剧本，台词原文与说话人的唯一依据。
3. `data.assets`：`characters`、`scenes`、`props`、`standings` 四类资产卡，取稳定外貌、空间地标、材质、服装与默认光源。
4. `data.prompts`：本集已有提示词。续写时沿用已有写法与编号，只补缺失的镜头。
5. 生成方式：逐镜读 `mode`，其次 `videoMode`；都没有时按 `r2v`。某镜既没有资产参考图、也没有首帧/尾帧附图时，该镜改按 `t2v`。

### 参考清单与顺序

- 每镜从 `assets` 取资产名，按 **角色 → 场景 → 道具 → 服装** 匹配项目数据；`costumes` 的换装排在最后。
- 图片依次编号 `<Picture 1>`、`<Picture 2>`……编号是 **每镜各自从 1 开始** 的本地参考图序号。
- 同一资产在同一镜内只占一个 Picture 编号；同名资产必须回到项目里的同一张卡。
- 视频与音频参考另编 `<Video N>`、`<Audio N>`；参考视频夹带的声音不自动生成 `<Audio N>`。
- 某镜没有任何资产参考图时，不写 `<Picture N>`，该镜按 `t2v` 写。
- `i2v` / `fl2v` 的 `<Picture 1>`、`<Picture 2>` 专指该镜附上的首帧与尾帧，不是资产清单图号；资产仍用名字写进正文。
- 若某镜带 `attachedFrames`，文字后的图片按该顺序排列；先看首帧，`fl2v` 再看尾帧。没有附图就按分镜设定写，不要假装看过。

## 怎么写

### 1. 先建全集公共编号

`commonPrompt` 是全集共享的主体定义，不是剧情提要。

- 编号用 `<Subject N>`，在本集内唯一且固定。按资产在分镜中首次出场的先后分配 1、2、3……；同一角色、场景或道具从第 1 镜到最后一镜都用同一个编号。视频与音频另用 `<Video N>`、`<Audio N>`，不占 Subject 序号。
- 每条只写「是谁、长什么样、在哪、穿什么」：角色写年龄感、体型、发型发色、面部特征、服装、随身物、习惯动作；场景写空间类型、关键地标、材质主色、光源方位与时段；道具写外形、材质、磨损与尺寸感。
- 不写剧情走向、不写情绪判断、不写台词。
- 公共定义与每镜正文必须使用同一称呼；不得用昵称、代词或「那个男人」替换已编号的主体。
- 本集所有出场角色（含无台词者）和在用场景都必须进 `commonPrompt`；反复出场的道具与固定服装也应登记。漏掉一个，对应镜头就会出现无锚点的描述。

### 2. 每镜先锁事实

以下内容逐镜从分镜表继承，任何改写都算越权：

- 总时长由 `duration` / `durationSec` 决定，动作必须装得下。
- 景别看 `shotSize`，运镜看 `camera`，生成方式看 `mode`。
- `beats` 的起止秒数、事件顺序、在场人物不可改。
- `dialogue` 的原句与说话人不可改。
- `linkPrev` 决定本镜是硬切还是同一长镜头的下一段。

### 3. 时间码

- 每个 beat 含 `start`、`end`、`text` 三项，`start` / `end` 是秒数。
- 统一 `MM:SS.mmm`，区间用 `–` 连接，例如 `00:00.000–00:02.000`。
- 首拍从 `00:00.000` 起，相邻拍首尾相接，末拍终点等于该镜总时长。
- 起止秒数取自对应 beat，事件与台词位置不得改。只允许两项归一：首拍起点归零、末拍终点归总时长；中间有空隙时并入前一拍末尾。
- `beats` 缺失时，从 `timeline` 的「0–2秒：内容」反解秒数再转时间码。
- `[Shot 1]` 只写一次且不带时间戳；硬切才写 `[Shot 2] At MM:SS.mmm,`，一镜到底不得出现第二组。
- 每拍动作必须落在该拍区间内，不得超时。

### 4. 台词、说话人与截断

- 只取 `dialogue` 原句；「角色名：原句」只保留冒号后的文字。
- 原句带中文引号“ ”时，只取引号内文字；引号外的动作、神态、语气不得当台词。
- 对白包进 `<d>[语种] 原文</d>`，一字不改。语种按说话人角色卡的 `language` 映射：中文→Chinese、英语→English、日语→Japanese、韩语→Korean、粤语→Cantonese；没写时按选题语言兜底，仍无法判断才用 Chinese。整镜无台词时省略 `<d>`，不写「无台词」。
- 说话人写成 `<Subject N> (S1)`；`S1`、`S2` 按本镜开口顺序编号。同一主体跨镜仍用同一个 Subject 编号，本镜内的 S 编号可重新起算。
- 台词被切断时，在 `</d>` 后紧贴 `<cutoff>`，不补完句子。
- 硬切紧贴对白时，在切点写 `<scenetrans>`，同一句原文不得拆改。

### 5. 编号与主体定义（r2v 必写）

- 清单有几条就写几条，不丢、不换序、不串号，也不能把后一项的内容写进前一项。
- 每条图片在同一句里写明类别，类别只允许 **角色、道具、场景、站位图、参考图** 五个词；中英文正文都保留这五个中文类别词。
- `<Subject N>` 沿用 `commonPrompt` 的固定编号；`<Picture N>` 用本镜的本地编号。两者不是同一个序号体系，不能混写。
- 清单里没有的编号不得虚构；分镜里的屏幕、海报、资料画面没有自己的图时，不得占用已分配的 Picture 编号。
- 带「补充说明」的条目，把说明并入对应主体，用来解释这张图或这段视频；不得因此改编号、类别或名字。
- 角色图只锁外貌与服装；场景图只锁空间与布景；道具图只锁外形；站位图只锁左右、前后与朝向，不替代场景图。

参考句式（示范类别，不是槽位）：

- `<Subject 1> 是 <Picture 1> 中的角色林晚，齐肩湿发、深灰风衣，外貌与服装锁定为定妆设定。`
- `<Subject 2> 是 <Picture 2> 中的场景老宅客厅，木楼梯与矮桌构成纵深，空间锁定为这张场景图。`
- `<Subject 3> 是 <Picture 3> 中的道具黑伞，伞骨与滴水状态锁定为这张道具图。`

### 6. 扩写密度

`beats.text` 只是意图骨架。每拍都要补足构图层次、光色材质、主体微动作、镜头幅度与可听见的物理声。禁止照抄原句、只换同义词、新增角色/对白/转折/硬切。

### 7. 四种生成方式

#### t2v

- `instruction` 为空字符串，正文从 `integrated_multimodal_description:` 开始。
- 三字段齐全：`integrated_multimodal_description`、`overall_soundscape`、`non_diegetic_music`。
- 首项是风格句，只写画风、色调与整体气质；之后逐拍写 `[Shot 1]`、时间段与画面。
- 没有参考图，主体外观、环境层次、光线与动作都要写足。

#### i2v

- 首行固定英文对齐指令：

```text
For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.
```

- 路径：首帧状态 → 起势动作 → 连续发展 → 结果或反应。
- 风格句与 `00:00` 第一拍必须与首帧一致；首帧里没有的人或物不得写成开场已在场。

#### fl2v

- 首行固定英文对齐指令，`S.SS` 为总时长两位小数：

```text
How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the S.SS-second mark of the target video.
```

- 路径：首帧状态 → 中间变化 → 差距收窄 → 尾帧状态。
- 最后一拍必须落到尾帧可见状态；没有尾帧图不得编造。

#### r2v

- 六段齐全且顺序固定：`subject_definitions`、`summary`、`retention_analysis`、`detailed_description`、`overall_soundscape`、`non_diegetic_music`。
- `subject_definitions` 与 `retention_analysis` 每项写成「标签 + 正文」；`detailed_description` 先风格句，再按拍写时间段。
- `summary` 的任务类型只能是 `[reference generation]`、`[keyframe completion]`、`[video editing]`、`[video continuation]`、`[audio reuse]`、`[audio reference]` 之一；无参考素材时用 `[reference generation]`。
- `retention_analysis` 每个独立标签一项：画面用 `fully_preserved`、`partially_preserved`、`attribute_transfer`、`weak_reference`；音频用 `fully_copy`、`partially_copy`、`reference`。
- 不得把六段写成 Base 三字段，也不得把 Base 写成六段。

### 8. 中文与英文两稿

- `h3zh` 与 `h3en` 同结构、同拍数、同事件顺序、同台词，只换叙述语言。
- 标签、段名、任务类型名、保留关系标记、时间码在两稿中都保持英文协议。
- `<d>[语种] 原文</d>` 的语种标签按说话人角色卡的 `language` 选择，原文逐字保留不翻译；资产名不翻译。
- 英文稿不得比中文稿少动作，也不得多出中文稿没有的动作。
- 段名单独成行并以英文冒号结尾，段间空一行；不用 Markdown 标题、分隔线或加粗段名。
- 两个声音段分工固定：`overall_soundscape` 只写画面里能听见的环境与动作物理声；`non_diegetic_music` 只写角色听不见的配乐，没有就写 `N/A`。

### 9. 静帧 `frame`

- 中文书写，从该镜 `beats` 里选一个信息量最大的瞬间，只写这一瞬。
- 写主体姓名与外貌锚点、服装、位置与朝向、动作定格、道具接触点、景别中文词、光线方向与冷暖、场景地标、画风。
- 直呼角色名，对应已挂定妆图；场景与道具用资产名。
- 不写运镜、不写秒数、不写声音、不写 H3 字段名、不写时间推进。
- 与同镜 `h3zh` / `h3en` 的构图、服装、道具、光线一致；`i2v` / `fl2v` 时与给定首帧一致。

### 10. 连续镜头

`linkPrev` 为 true（或 payload 的 `continuous` 为 true）时：

1. 中文稿在风格句后、`[Shot 1]` 前写「无硬切。紧接上一段。」；英文稿写 `No hard cut. Immediately following the previous section.`。`continuity` 更长时补机位、方向与主体交接。
2. 时间码从 `00:00.000` 重新起算。
3. 沿用上一镜结尾机位、运动方向、主体位置与动作趋势，不换机位、不重摆开场、不硬切。
4. 角色、服装、空间保持一致；参考生的 `<Subject N>` 不得改义。
5. 最后一拍停在可续接的稳定姿态。
6. 配乐主题连续，段末不淡出，除非分镜明确收束。

`linkPrev` 为 false 时，不写连续承接；第 1 镜的 `linkPrev` 必须为 false，硬切不得写「无硬切」。

## 输出

`kind` 固定为 `"prompts"`，`data` 结构：

- `episodeNumber`：本集集号，整数。
- `commonPrompt`：全集公共主体定义字符串，按 `<Subject N>` 固定编号逐条写。
- `shots`：数组，与分镜表逐镜对应，每项含 `{no, h3zh, h3en, frame}`。
  - `no`：必须是分镜表里的镜号整数，不得改名、不得省略、不得用「同上」。main.js 逐镜写库靠它定位，绝不能删。
  - `h3zh`：该镜中文 H3 提示词全文。
  - `h3en`：该镜英文 H3 提示词全文。
  - `frame`：该镜中文静帧提示词。

```json
{"kind":"prompts","data":{"episodeNumber":3,"commonPrompt":"<Subject 1> 角色 林晚：二十七岁，齐肩湿发，深灰风衣，右手常握一把黑伞。\n<Subject 2> 场景 老宅客厅：夜晚，木楼梯位于画面后方，矮桌居中，左侧窗外有雨痕，右侧落地灯发暖黄光。","shots":[{"no":1,"h3zh":"subject_definitions:\n<Subject 1> 是 <Picture 1> 中的角色林晚，齐肩湿发、深灰风衣，外貌与服装锁定为定妆设定。\n<Subject 2> 是 <Picture 2> 中的场景老宅客厅，木楼梯与矮桌构成纵深，空间锁定为这张场景图。\n\nsummary:\n[reference generation] <Subject 1> 停在 <Subject 2> 里看向茶杯并开口，<Picture 1> 只锁人物，<Picture 2> 只锁空间。\n\nretention_analysis:\n<Subject 1> (appears in [Shot 1]): fully_preserved - 林晚的发型、风衣与身份保持不变。\n<Subject 2> (appears in [Shot 1]): fully_preserved - 客厅木楼梯、矮桌与窗位保持不变。\n\ndetailed_description:\n写实电影感，低饱和，雨夜冷调里有一盏暖黄落地灯。\n[Shot 1]\n00:00.000–00:02.000\n中景，机位固定。<Subject 1> 从左侧入画后停步，湿发贴颊，右手黑伞尖滴水；<Subject 2> 的矮桌上两只白瓷茶杯并排，背景木楼梯清晰。\n00:02.000–00:04.000\n<Subject 1> (S1) 俯身，左手停在靠外的茶杯上方，低声问，<d>[Chinese] 谁在上面？</d> 楼上木板一响，她抬眼看向楼梯口。\n\noverall_soundscape:\n雨点敲窗，伞尖滴水，楼上木板轻响。\n\nnon_diegetic_music:\n极低的弦乐持续音，不盖过雨声。","h3en":"subject_definitions:\n<Subject 1> is the 角色 林晚 in <Picture 1>, with shoulder-length wet hair and a dark grey trench coat, appearance and wardrobe locked to the character sheet.\n<Subject 2> is the 场景 老宅客厅 in <Picture 2>, where the wooden staircase and low table build the depth, space locked to this scene image.\n\nsummary:\n[reference generation] <Subject 1> stops inside <Subject 2>, looks at the teacups and speaks; <Picture 1> locks the person only, <Picture 2> locks the space only.\n\nretention_analysis:\n<Subject 1> (appears in [Shot 1]): fully_preserved - 林晚's hairstyle, trench coat and identity stay unchanged.\n<Subject 2> (appears in [Shot 1]): fully_preserved - the staircase, low table and window position stay unchanged.\n\ndetailed_description:\nRealistic cinematic look, low saturation, a cold rainy night warmed by one yellow floor lamp.\n[Shot 1]\n00:00.000–00:02.000\nA medium shot on a locked camera. <Subject 1> enters from frame left and stops, wet hair against her cheek, a black umbrella dripping in her right hand; on the low table of <Subject 2> sit two white porcelain cups, with the wooden staircase clear behind.\n00:02.000–00:04.000\n<Subject 1> (S1) leans forward, her left hand hovering over the outer cup, and asks under her breath, <d>[Chinese] 谁在上面？</d> A floorboard creaks above; she lifts her eyes to the staircase.\n\noverall_soundscape:\nRain tapping the window, water dripping from the umbrella, a light creak from the floor above.\n\nnon_diegetic_music:\nA very low sustained string tone that never covers the rain.","frame":"中景静帧，雨夜老宅客厅。林晚位于画面左侧三分之一，身体朝右，齐肩湿发，深灰风衣，右手握滴水的黑伞；她微微俯身，左手悬在靠外的白瓷茶杯上方，目光抬向右后方木楼梯口。右侧落地灯投下暖黄光，左侧窗外冷蓝雨光照亮雨痕；矮桌上两只白瓷茶杯并排，背景木楼梯清晰。写实电影感，低饱和，人物与场景严格参考现有资产卡。"}]}}
```

回复末尾必须附一个 `{"kind":"prompts","data":{...}}` 结构的 JSON 代码块；说明、取舍理由和进度汇报放在代码块外。用户点「写入草稿」之前，不得声称已写入或已保存。

## 硬性约束

- `shots` 数量、顺序、`no` 必须与分镜表逐镜一致；不漏镜、不重号、不跳号、不用省略。
- 每镜按自己的 `mode` 分流：`t2v` 空 `instruction`；`i2v` 写 0.00 秒对应 `<Picture 1>`；`fl2v` 写 0.00 秒首帧与 `S.SS` 秒尾帧；`r2v` 六段齐全。不得整集共用一套结构。
- 参考清单条数、顺序、编号、类别、名字与项目数据一致；类别只用角色、道具、场景、站位图、参考图。
- 时间码从 `00:00.000` 起、首尾相接、末拍等于该镜总时长；动作不得超时。
- 台词只取原句并包进 `<d>[语种] …</d>`，语种与说话人角色卡的 `language` 一致；引号外动作不当台词；无台词省略标记。
- 连续镜头遵守第 10 节；第 1 镜不写承接；硬切不写「无硬切」。
- 不改景别、不改运镜、不改生成方式、不改时间轴、不移动台词归属。
- 不发明角色、道具、场景、台词或转折；缺信息时用中性描述兜底，不编造品牌与画面文字。
- `commonPrompt` 与每镜正文的 `<Subject N>` 编号必须一致，不得一集多套编号。
- 输出只用 JSON，不写 Markdown 表格、说明段或注释。

## 交付前自检

- `commonPrompt` 是否覆盖本集全部出场角色（含无台词者）和在用场景，编号是否唯一且固定？
- `shots` 是否逐镜对应分镜表，`no` 是否连续且与源数据一致？
- 每镜结构是否匹配该镜 `mode`，Base 三字段或六段是否齐全？
- 参考清单是否逐条落地，Picture 本地编号是否从 1 起且不串号？
- 时间码是否首拍为零、相邻相接、末拍等于总时长？
- 台词是否原句、说话人是否正确、截断与硬切标记是否到位？
- `h3zh` 与 `h3en` 是否同拍同事件，英文稿有没有漏动作？
- `frame` 是否只写一个瞬间，且与视频稿一致？
- 输出 JSON 能否被 `JSON.parse` 解析，`commonPrompt` 与 `shots[].no` 是否都在？
