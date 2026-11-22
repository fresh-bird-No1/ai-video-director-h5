---
name: aivd-image-character-c
description: 生成英文人设定妆图提示词：左侧上图下细节 + 右侧人设文字与主色色卡，锁定同一张脸与造型。
author: 不晚
copyright: 本项目自研技能文本，未摘录任何第三方内容
license: MIT
version: 1.1.0
---

# 角色定妆提示词 · 版式 C（英文）

## 职责
在版式 B 的图像组右侧加一条竖排文字栏：上端写一句话人设，下端放主色色卡。这是三套版式里唯一允许画面出现文字的版式，文字只准待在右侧栏内。左侧图区仍然由面部特写、全身三视图和底部分格细节组成，图区不许出现任何字。只转写角色卡，不重设人物。版式 C 与 A、B 共用同一张脸、同一套发型与服装，跨版式不得漂移。

## 读什么
- 角色卡：姓名、年龄、人种 / 族裔（ethnicity）、身份、脸型五官、发型发色、肤色、妆容、服装、鞋与配饰。
- `ethnicity` 与 `profile` / `appearance` 里的肤色、骨相、发质必须一致；英文 prompt 要把 `ethnicity` 转成对应的英文族裔描述，不得改写成其他人种。
- `identityLock` 的全部条目，优先级最高。
- 适合放大的细节：眉尾、耳后、手与指节、领口、纽扣、袖口、鞋面、手表或戒指。
- 角色卡的身份与性格字段，用来压出一句话人设，控制在一行内。
- 服装与配饰的主色，取 3 到 5 个，并给每个色起名。
- `styleLock`、`styleNotes` 与选题页画风。

缺项用中性描述，不写真实品牌与真实姓名。

## 怎么写

第一行写固定标题：`特写+三视图+局部细节+文字描述`。之后按分段书写，段首用固定标记。画面描述用英文；固定标题、文字栏字段名和色卡名称允许保留中文。不要写镜头运动。

### 版式骨架
- 16:9 landscape，一张设定板。
- 左侧图区约占宽度 72%，纵向分三带：上带约 30% 高度是面部大特写，切到肩线；中带约 45% 高度是正面、侧面、背面三视图，等高、脚底同线、间距均匀；下带约 25% 高度是 5 到 8 个等大正方形细节格。
- 右侧文字栏约占宽度 28%，从顶到底通高，底色比背景略浅或略深，与图区之间用留白或一条细线分开。
- 文字栏自上而下固定五块：身份关键词、身高体型、服装主色、性格关键词、主色色卡。前四块各一到两行短句，色卡块内放 3 到 5 个等宽色块，每块旁标色名。
- 图区与文字栏之间不叠压；文字栏不侵入人物。
- 特写、三视图、每一格细节、文字栏描述的对象必须是同一个人。

### 【面部特写】
- 高清头肩或大头，机位与眼睛齐平，表情中性。
- 先写 `ethnicity` 对应的族裔特征，再写五官：例如「East Asian woman, warm light skin, monolid, straight black hair」；族裔、肤色、骨相、发质不得省略，也不得与角色卡冲突。
- 写清年龄感、脸型骨相、眉形与眉距、眼型与眼距、鼻梁鼻头、唇形、皮肤纹理、妆面。
- `identityLock` 的面部特征逐项写到位置与形态，例如「左眉尾两厘米旧疤」「右眼下小痣」「琥珀色虹膜」「左侧美人尖」。
- 发型写到发际线、分缝、鬓角、发尾；领口与三视图一致。

### 【三视图】
- 正面、侧面、背面三张全身站姿并排，人物等高，脚底同线。
- 写清身高比例、肩宽、腰线、腿长、体态。
- 服装写版型与形制：领口、门襟、袖长、袖口、腰头、下摆或裤长、面料垂感；三张件数一致。
- 鞋写鞋型、鞋头、鞋跟与磨损；配饰写位置。

### 【局部细节】
- 底部一排 5 到 8 个等大格，每格一个看得见的辨识点，逐格写清部位、角度和形态。
- 优先取 `identityLock`，再取服装与配饰；不得重复同一部位，不得把大多数格子都画成脸。
- 每一格与主图同一人、同一光、同一画风。
- 格内不写字，不写身份介绍、身高数字、性格词、色卡。

### 【文字描述】
- 位置只在右侧文字栏，固定五块，逐块给出要排的短句。
- 身份关键词：用角色卡的身份与性格压成一行，不写剧情。
- 身高体型：用比例与体态描述，不写精确到毫米的数字。
- 服装主色：列出这一套衣服的主色，不逐件复述版型。
- 性格关键词：两到四个词，服务认人。
- 主色色卡：3 到 5 个等宽色块，每块带名称，例如 champagne gold、ivory white、pigeon-blood red、cool pale skin。色名写小字，块内不留字。
- `identityLock` 的特征必须同时出现在特写、相关细节格和身份关键词里，三处不能互相矛盾。
- 文字要短，不写故事段落，不排成海报标语。

### 【画风】
- 单独起行，放在最后。按 `styleNotes` 展开笔触、色调、光质、边缘与材质质感；为空时对齐 `styleLock`。
- 柔光为主，主光在左上方 45 度，右侧窄轮廓光，色温 5200–5600K；图区与细节格共用同一套光。
- 文字栏的字体用简洁无衬线，字号分主副两级，排版克制，不抢人物。

## 整图禁止
图区出现任何文字、编号、箭头、色卡；文字栏写成故事或海报标语；漏掉色卡或底部细节带；第二个人物；裁掉头顶或脚；把色卡叠到人物身上；把版式 C 退化成 B。

## 输出
先用一两句中文说明版式与角色名，再在回复末尾附一个 JSON 代码块：

```json
{
  "kind": "characterPrompt",
  "data": {
    "name": "沈砚",
    "prompt": "特写+三视图+局部细节+文字描述\n【面部特写】Left image zone, top band: a large head-and-shoulders portrait at eye level, neutral expression. Describe bone structure, brows, eyes, nose, lips, skin, makeup, hairline, parting, and collar. Include every identityLock mark at its exact spot, such as a two-centimeter scar at the left brow tail and a mole below the right eye.\n【三视图】Left image zone, middle band: front, side, and back full-body views, equal height, feet aligned, same black coat, gray trousers, and worn boots in all three.\n【局部细节】Left image zone, bottom band: six equal square crops, one mark each: left brow scar, amber iris, right cheek mole, coat collar, cuff wear, boot toe.\n【文字描述】Right column, five short blocks: identity keywords; height and build; costume main colors; personality keywords; 3 to 5 named swatches such as champagne gold, ivory white, pigeon-blood red, cool pale skin.\n【画风】Soft light from the upper left, narrow rim light on the right, 5200-5600K, clean neutral background, realistic skin and fabric. Sans-serif text only inside the right column. Style follows styleNotes.",
    "negativePrompt": "text inside image zone, color swatches inside image zone, story paragraph in text panel, missing color swatches, missing detail strip, second person, cropped head, cropped feet, swatches over the figure, poster headline"
  }
}
```

- `name` 与角色卡姓名一致。
- `prompt` 第一行是固定标题，正文是纯文本分段，不带 Markdown 标题与解释。
- `negativePrompt` 用英文逗号分隔。

## 硬性约束
- kind 固定 `characterPrompt`；data 必须含 `name` 与 `prompt`，可带 `negativePrompt`。
- `prompt` 首行只能是 `特写+三视图+局部细节+文字描述`。
- 只有右侧文字栏可以出现文字，图区与细节格必须无字。
- 文字栏必须齐五块，色卡必须是 3 到 5 个带名称的色块。
- 底部细节必须是 5 到 8 格，不能省略。
- `identityLock` 的特征在三处一致：特写、相关细节格、身份关键词。
- `ethnicity` 必须转写成英文的族裔、肤色、骨相与发质描述，并在特写、三视图与细节格中保持同一个人。
- 不输出图片地址，不调用出图，不声称已经写入资产卡。
- 不把 C 做成 B，不新增角色，不改服装。

## 交付前自检
- 首行是否为固定标题，正文是否没有 Markdown 标题。
- 是否写清 16:9、左 72% / 右 28%、左区三带与右栏五块。
- 三视图是否齐全、脚底是否同线；底部是否为 5 到 8 格且不重复。
- 文字栏是否包含身份关键词、身高体型、服装主色、性格关键词、3 到 5 个带名色块。
- 除右侧栏外是否全图无字，色卡是否没有叠在人物身上。
- `identityLock` 的特征是否在特写、细节格与文字栏三处一致。
- `ethnicity` 是否落成可见的族裔、肤色、骨相与发质，并与三视图、细节格一致。
- JSON 是否能被 `JSON.parse` 解析，kind 与字段是否正确。
