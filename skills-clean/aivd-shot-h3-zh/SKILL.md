---
name: aivd-shot-h3-zh
description: 按当前镜头的生成方式（t2v/i2v/fl2v/r2v）写 MiniMax H3 中文视频提示词，保留参考编号、时间码与台词原句。
author: 不晚
copyright: 本项目自研技能文本，未摘录任何第三方内容
license: MIT
version: 1.1.0
---

# 单镜中文 H3 视频提示词

## 职责

- 只服务 `targetShot` 指向的那一镜，把它已有的分镜事实翻译成一条可直接投喂 MiniMax H3 的中文提示词。
- 提示词骨架由生成方式决定：文生走 Base，图生与首尾帧在 Base 上加对齐指令，参考生走六段。四种方式不得混用同一套结构。
- 分镜、剧本、资产都是输入。本技能不重拆镜头、不重排时间、不新增情节，也不负责静帧分镜图提示词。

## 读什么

1. `targetShot`：`no`、`duration`（或 `durationSec`）、`shotSize`、`camera`、`description`、`timeline`、`beats`、`dialogue`、`assets`、`costumes`、`linkPrev`、`id`。
2. 生成方式：优先读 `targetShot.mode`，其次读 payload 里的 `videoMode`；两者都没有时按 `r2v` 处理。若整镜既没有资产参考图，也没有首帧/尾帧附图，改用 `t2v`。
3. `data.board`：用于确认本镜在全集中的位置、上一镜结尾和是否连续镜头。
4. `data.script`：本集剧本，用来核对说话人、动作先后与台词原句。
5. `data.assets`：`characters`、`scenes`、`props`、`standings` 四类资产卡，用来取稳定外貌、空间地标、材质和服装名。
6. `data.prompts`：本项目已有提示词。按 `shot.id` 或 `String(shot.no)` 取本镜现值，用来判断是新建还是在旧稿上修改。

### 参考素材清单怎么排

- 从 `targetShot.assets` 取资产名，先按角色、再按场景、再按道具匹配 `data.assets`；`targetShot.costumes` 里的换装追加在最后。顺序固定为 **角色 → 场景 → 道具 → 服装**。
- 同一个资产只占一个编号；同名资产必须回到项目数据里的同一张卡，不得另起一个名字。
- 清单里每条图依次记作 `<Picture 1>`、`<Picture 2>`……编号只看图片，不看文字说明。
- 若清单里另有视频或音频素材，分别记作 `<Video N>`、`<Audio N>`，按各自出现的先后单独编号。参考视频里夹带的声音不自动变成 `<Audio N>`。
- 本镜没有任何资产参考图时，不要虚构 `<Picture N>`，直接按 `t2v` 写。
- `i2v` / `fl2v` 的 `<Picture 1>`、`<Picture 2>` 专指用户附上的首帧与尾帧，不参与上面的资产清单编号；资产仍用名字写进正文。
- 图生与首尾帧会带 `attachedFrames`，文字后面的图片按该顺序排列。先看首帧，`fl2v` 再看尾帧，然后动笔。`attachedFrames` 为空时按分镜设定写，不要假装看过图。

## 怎么写

### 1. 先钉住不可变事实

以下内容从 `targetShot` 原样继承，任何改写都算越权：

- `duration` / `durationSec` 决定总时长，所有动作必须在该时长内完成。
- `shotSize` 决定景别，`camera` 决定运镜方式与方向，`mode` 决定提示词结构。
- `beats` 的起止秒数、事件先后、在场人物不可改。
- `dialogue` 的原句不可改，说话人不可换。
- `linkPrev` 决定本镜是硬切还是同一长镜头的下一段。

### 2. 编号与主体定义

参考生必须写 `subject_definitions`：

- 清单有几条就写几条，一条不丢、不换序、不串号，也不能把后一条的内容塞进前一条。
- 每条图参考在同一句里标明类别。类别只允许这五个词：**角色、道具、场景、站位图、参考图**。英文段名不变，但类别词保持这五个中文词原样。
- 编号、类别、名字必须与清单完全一致。单镜里每张图片对应一条 `<Subject N>`，编号从 1 起；`<Picture N>` 是本镜的本地图号。`<Video N>`、`<Audio N>` 自成编号，不占 Subject 序号。清单里没有的编号不得编造。
- 清单某条带「补充说明」时，把说明写进对应主体，用来解释这张图；不得因此改编号、类别或名字。没有说明就不要补。
- 站位图只锁左右、前后和朝向，不替代场景图；场景图只锁空间与布景，不吞并道具；道具图只锁这件物件的外形；角色图只锁该角色的外貌与服装。
- 分镜里出现屏幕、海报、资料画面，但清单没有给它们图片时，不得占用已分配的 Picture 编号。

常用句式（只示范类别，不是固定槽位）：

- `<Subject 1> 是 <Picture 1> 中的角色果果，圆脸、毛茸茸的尾巴，外貌锁定为定妆设定。`
- `<Subject 2> 是 <Picture 2> 中的场景铺门，夜色门口、灯笼光，空间与布景锁定为这张场景图。`
- `<Subject 3> 是 <Picture 3> 中的道具木牌，外形、刻字与边角锁定为这张道具图。`
- `<Subject 4> 是 <Picture 4> 中的站位图门口对峙，左右、前后与朝向锁定为这张站位图。`

### 3. 时间码

- 每个 beat 含 `start`、`end`、`text` 三项，`start` / `end` 是秒数。
- 统一写成 `MM:SS.mmm`，区间用连接号 `–`，例如 `00:00.000–00:02.000`。
- 第一拍起点固定为 `00:00.000`；相邻两拍首尾相接；最后一拍的终点必须等于 `duration` / `durationSec`。
- `start` / `end` 取自对应 beat，事件顺序与台词位置不得改动。只做两项必要归一：首拍起点归零、末拍终点归到总时长；中间若留有空档，把空档并入前一拍末尾，保证连续。
- `beats` 缺失时，从 `timeline` 的「0–2秒：内容」这类片段反解起止秒数，再转成时间码。
- `[Shot 1]` 只出现一次且不带时间戳；每拍另起一行写时间段。
- 只有真正硬切才写 `[Shot 2] At MM:SS.mmm,`；一镜到底不得出现 `[Shot 2]`。

### 4. 台词、说话人与截断

- 台词只取 `dialogue` 里的原句。若格式是「角色名：原句」，丢掉冒号前的角色名，只保留冒号后的句子。
- 原句外面带中文引号“ ”时，只取引号内的字；引号外的动作、神态、补充说明一律写成画面描述，绝不能塞进台词标记。
- 对白统一包进 `<d>[Chinese] 原文</d>`，原文一个字都不能改。整镜没有台词时，不写 `<d>`，也不要用「无台词」占位。
- 说话人用 `<Subject N> (S1)` 标注：`<Subject N>` 是开口的主体编号，`S1`、`S2` 按本镜开口顺序编号。同一主体多次开口仍用同一个 Subject 编号。
- 台词被打断时，在 `</d>` 后紧贴 `<cutoff>`，不要替角色补完句子。
- 硬切紧贴对白发生时，在切点写 `<scenetrans>`，前后仍是同一句原文，不得拆字改句。

### 5. 扩写而不是复述

`beats.text` 只是意图，不是成片文案。每一拍都要扩到可拍摄的密度：

- 构图与空间层次：前景、中景、背景，物距与遮挡关系。
- 光色与材质：光源方向、色温、反光、空气感、衣料与道具质感。
- 主体姿态：手、眼、呼吸、衣褶、与道具的互动。
- 镜头运动：幅度与速度写清楚，但方向必须服从 `camera`。
- 声音细节：写成能听见的物理声，不要只写「环境安静」。

同时禁止：照抄 `beats.text`；发明新角色、新对白、新转折；增加分镜里没有的硬切。

### 6. 四种生成方式的结构

#### t2v（文生）

- `instruction` 为空字符串，正文直接从 `integrated_multimodal_description:` 开始。
- 三字段齐全：`integrated_multimodal_description`、`overall_soundscape`、`non_diegetic_music`。
- 第一项是风格句，只写画风、色调与整体气质；其后按拍写 `[Shot 1]`、时间段与画面。
- 因为没有参考图，风格句与每拍都要把主体外观、环境层次、光线和动作写足。

#### i2v（图生）

- 第一行是英文对齐指令，`<Picture 1>` 对应本镜首帧：

```text
For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.
```

- 正文路径固定为：首帧状态 → 起势动作 → 连续发展 → 结果或反应。
- 风格句与 `00:00` 第一拍必须与首帧对上：人数、服装、姿态朝向、陈设、光色、构图都不能另起画面。
- 首帧里没有的人或物，不得写成开场已经在场。

#### fl2v（首尾帧）

- 第一行是英文对齐指令，`S.SS` 用总时长保留两位小数：

```text
How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the S.SS-second mark of the target video.
```

- 正文路径固定为：首帧状态 → 中间变化 → 差距收窄 → 尾帧状态。
- 最后一拍必须落到尾帧可见状态，中间写清怎样一步步走到尾帧。若并未提供尾帧图，不得凭空补一个尾帧。

#### r2v（参考生）

- 六段齐全且顺序固定：`subject_definitions`、`summary`、`retention_analysis`、`detailed_description`、`overall_soundscape`、`non_diegetic_music`。
- `subject_definitions` 与 `retention_analysis` 每项写成「标签 + 正文」；`detailed_description` 先风格句，再按拍写时间段与详情。
- `summary` 开头方括号里的任务类型只能是：`reference generation`、`keyframe completion`、`video editing`、`video continuation`、`audio reuse`、`audio reference`。没有图、视频、音频时写 `[reference generation]`。
- `retention_analysis` 每个独立标签一项。画面主体用 `fully_preserved`、`partially_preserved`、`attribute_transfer`、`weak_reference`；音频另用 `fully_copy`、`partially_copy`、`reference`。
- 主体开口写成 `<Subject N> (S1)`，对白写法与第 4 节相同。

### 7. 段落文本格式

- 两个声音段分工固定：`overall_soundscape` 只写画面里能听见的环境与动作物理声；`non_diegetic_music` 只写角色听不见的配乐，没有就写 `N/A`。
- 最终字符串是给模型读的纯文本，不是 Markdown，遵守以下格式：
- 段名单独一行，行末是英文冒号，例如 `subject_definitions:`。
- 段与段之间只空一行。
- 不使用 `#` 标题、`---` 分隔线、`**加粗**` 段名，也不把段名换成中文标题或与正文挤在同一行。

### 8. 连续镜头

当 `linkPrev` 为 true（或 payload 的 `continuous` 为 true）时，本镜是上一镜同一条长镜头的后续片段：

1. 在风格句之后、`[Shot 1]` 之前，正文第一句写「无硬切。紧接上一段。」；`continuity` 更长时，接着写清机位、运动方向、主体位置如何接上。
2. 本镜时间码从 `00:00.000` 重新起算，不沿用上一镜的绝对秒数。
3. 读 `prevShot` / `prevShot.endingBeat`，沿用其结尾机位、运动方向、主体位置与动作趋势，不换机位、不重摆开场、不硬切。
4. 角色、服装、空间与上一镜保持一致；参考生时 `<Subject N>` 的语义不得改义。
5. 最后一拍收在可续接的稳定姿态，写「段末停在……」。
6. 配乐主题与上一镜连续，段末不淡出，除非分镜明确要求收束。

`linkPrev` 为 false 时，不得写连续镜头用语，也不得假装承接上一镜。第 1 镜的 `linkPrev` 必须为 false；若数据里误写成 true，按硬切执行。

## 输出

`kind` 固定为 `"prompts"`。单镜 `data` 的完整键位是 `{shotNo, h3zh, h3en, frame}`：

- `shotNo`：当前镜号，必填，不得改名。main.js 写库靠它定位镜头，绝不能删。
- `h3zh`：本次生成的中文 H3 提示词全文，单个字符串。
- `h3en`：不归本技能改写。若 `data.prompts` 里已有本镜英文提示词，原样带回；没有就写空串。
- `frame`：不归本技能改写。已有静帧提示词就原样带回；没有就写空串。

```json
{"kind":"prompts","data":{"shotNo":3,"h3zh":"subject_definitions:\n<Subject 1> 是 <Picture 1> 中的角色果果，圆脸、毛茸茸的尾巴，外貌与服装锁定为定妆设定。\n<Subject 2> 是 <Picture 2> 中的场景铺门，夜色门口、灯笼暖光，空间与布景锁定为这张场景图。\n<Subject 3> 是 <Picture 3> 中的道具木牌，外形、刻字与边角锁定为这张道具图。\n\nsummary:\n[reference generation] <Subject 1> 在铺门前扶正木牌并开口说话，<Picture 1> 只锁外貌，<Picture 2> 只锁空间，<Picture 3> 只锁道具外形。\n\nretention_analysis:\n<Subject 1> (appears in [Shot 1]): fully_preserved - 果果的身份、圆脸、毛茸茸尾巴与定妆服装保持不变。\n<Subject 2> (appears in [Shot 1]): fully_preserved - 铺门的门框、灯笼位置与夜色空间保持不变。\n<Subject 3> (appears in [Shot 1]): partially_preserved - 木牌的刻字与边角保持不变，轻微晃动属于本镜动作。\n\ndetailed_description:\n温暖绘本风，纸质纹理偏软，夜色里透出灯笼暖光。\n[Shot 1]\n00:00.000–00:02.000\n温暖中景，机位固定。<Subject 1> 站在画面左侧，双手扶住 <Subject 3>，木牌在灯笼光下轻轻晃了一下；<Subject 2> 的门框与灯笼构成背景层次。\n00:02.000–00:04.000\n<Subject 1> (S1) 抬眼看向门内，语气发紧地说，<d>[Chinese] 停，停在这儿了。</d> 尾音落下时手指仍按在木牌边角。\n00:04.000–00:06.000\n<Subject 1> 收回手，退半步，肩线放松；<Subject 3> 稳住不再晃，<Subject 2> 的灯笼光在门板上轻轻摇动。段末停在果果侧身站定的姿态。\n\noverall_soundscape:\n夜风掠过门口，灯笼铁钩轻响，木牌落稳时有一声闷响。\n\nnon_diegetic_music:\nN/A","h3en":"","frame":""}}
```

回复末尾必须附一个 `{"kind":"prompts","data":{...}}` 结构的 JSON 代码块；解释文字放在代码块外。用户点「写入草稿」之前，不得声称已写入项目。

## 硬性约束

- 只写当前镜，不拆镜、不并镜、不改时间轴、不改 `shotSize`、不改 `camera`、不改 `mode`。
- 四种生成方式严格分流：`t2v` 的 `instruction` 必须为空；`i2v` 写明 0.00 秒对应 `<Picture 1>`；`fl2v` 写明 0.00 秒首帧与 `S.SS` 秒尾帧；`r2v` 六段齐全。不得把 Base 写成六段，也不得把六段写成 Base。
- 参考清单条数、顺序、编号、类别、名字与项目数据一致；类别只允许角色、道具、场景、站位图、参考图。
- 时间码从 `00:00.000` 起、首尾相接、末拍等于总时长；不得超时，不得改事件顺序。
- 台词只取原句，包进 `<d>[Chinese] …</d>`；引号外的动作神态不得当台词；无台词不写标记。
- 连续镜头遵守第 8 节六条；第 1 镜不得写连续承接；硬切不得写「无硬切」。
- 提示词内不得出现 Markdown 标题、分隔线、加粗段名或中文段名标题。
- 不新增角色、道具、场景、台词和转折；资产名沿用项目原名，不翻译。

## 交付前自检

- `targetShot.mode` 对应的结构是否正确？`t2v` 是否真的空 `instruction`？
- 参考清单是否逐条落地，编号是否连续，类别是否只用了五个允许词？
- 时间码是否 `00:00.000` 起、相邻相接、末拍等于总时长？
- 每拍动作是否在时长内完成，景别与运镜是否与字段一致？
- 台词是否只含原句，说话人是否用 `<Subject N> (S1)`，截断是否用 `<cutoff>` / `<scenetrans>`？
- `linkPrev` 的写法是否正确，第 1 镜是否按硬切处理？
- 输出 JSON 能否被 `JSON.parse` 解析，`shotNo` 是否保留？
