---
name: aivd-image-character-b
description: 生成英文角色定妆拼图提示词：上方大面部特写 + 中部三视图 + 底部局部细节，锁定同一张脸与造型。
author: 不晚
copyright: 本项目自研技能文本，未摘录任何第三方内容
license: MIT
version: 1.1.0
---

# 角色定妆提示词 · 版式 B（英文）

## 职责
在版式 A 的三视图与面部特写之下增加一条底部分格细节带，用 5 到 8 个小格把 `identityLock` 与做工放大。整张图仍然没有文字区，也没有色卡。版式 B 与 A 使用同一张脸、同一套发型、同一套服装；只增加细节格，不允许因为加了细节而改动人物本体。

## 读什么
- 角色卡的姓名、性别、年龄感、人种 / 族裔（ethnicity）、身份、身高与体态。
- `ethnicity` 与 `profile` / `appearance` 里的肤色、骨相、发质必须一致；英文 prompt 要把 `ethnicity` 转成对应的英文族裔描述，不得改写成其他人种。
- `profile` 中的脸型、骨相、眉形、眼型、鼻唇、肤色与肤质、妆面。
- `identityLock` 的全部条目，优先级最高：疤痕、痣、瞳色、发际线、眉形缺口、耳形、纹身、旧伤、义肢等。
- 发型：长度、分缝、发色、束法；服装：件数、版型、领口、袖口、腰头、面料、颜色、鞋与配饰。
- 适合放大成一格的可见点：眉尾、耳后、发际线、手指与指节、领口、纽扣、袖口磨损、鞋面、手表或戒指。
- `styleLock` 与 `styleNotes`；为空时按选题页画风。
- 参考图只作外形依据，不复制其版式。

缺项用中性描述延续角色卡，不编身世，不写真实品牌。

## 怎么写

第一行写固定标题：`特写+三视图+局部细节`。之后按分段书写，段首用固定标记，段间换行。正文用英文，标题与专有名词可保留中文。不要写镜头运动。

### 版式骨架
- 16:9 landscape，一张设定板。
- 主区占上方约 76% 的高度：左端约 30% 宽度是一张高清面部大特写，下缘切到肩线；右侧排三张全身站姿，正面、侧面、背面，等高、脚底同线、间距均匀。
- 底部占约 24% 的高度：一排 5 到 8 个等大正方形小格，格数按可用辨识点决定，不能少于 5 格、不能多于 8 格；用细线或纯留白分隔。
- 背景为白色、极浅灰或干净的深色无缝底；主区与细节带之间留出清晰空白，不画边框。
- 特写、三视图、每一格细节都必须属于同一个人、同一套造型。

### 【面部特写】
- 高清头肩或大头，机位与眼睛齐平，中性表情，视线平视镜头。
- 先写 `ethnicity` 对应的族裔特征，再写五官：例如「East Asian woman, warm light skin, monolid, straight black hair」；族裔、肤色、骨相、发质不得省略，也不得与角色卡冲突。
- 写清年龄感、脸型骨相、眉形与眉距、眼型与眼距、鼻梁鼻头、唇形、皮肤毛孔与质感、妆面。
- `identityLock` 的面部特征逐项写到具体位置和形态，例如「右眉骨一道浅色旧疤」「左颊一颗小痣」「虹膜灰绿」「右侧发际线后移一指宽」。
- 发型写到发际线、分缝、鬓角与发尾；领口与三视图一致。
- 本段不画全身，不加底部小格，不写右侧文字。

### 【三视图】
- 三张全身站姿并排，正面、侧面、背面；人物等高，脚底落在一条线上。
- 写清体型比例、肩宽、腰线、腿长、体态习惯。
- 服装写到版型与形制：领口、门襟、袖长、袖口、腰头、下摆或裤长、面料垂感；三张件数一致。
- 鞋写鞋型、鞋头、鞋跟与磨损；配饰写位置，三张不能增减。
- 本段不画大头特写，不加文字面板。

### 【局部细节】
- 底部一排 5 到 8 格，每格只放一个看得见的辨识点，逐格写清部位、观察角度与要看到的形态。
- 先从 `identityLock` 取材，例如眉尾疤、瞳色、发际线、耳形、指节旧伤、纹身；再从服装与配饰取材，例如领口、纽扣、袖口磨损、手表、戒指、鞋面。
- 每一格与主图同一人、同一套衣服、同一套光线；不得重复同一部位，不得把 5 格都画成脸。
- 本段不写身份介绍、身高数字、性格词、色卡，也不要求画面里出现可读文字。

### 【画风】
- 单独起行，放在最后。按 `styleNotes` 展开笔触、色调、光质、边缘和材质质感；`styleNotes` 为空时对齐 `styleLock`。
- 柔光为主，主光在左上方 45 度，右侧补窄轮廓光，色温 5200–5600K；细节格可比主区略提对比，但光源方向不变。
- 主区与底部细节带共用同一画风，不允许某一格换风格。

## 整图禁止
右侧或任意位置的人设文字面板、身份关键词、身高体型条目、服装主色列表、性格词、主色色卡、分镜、多角色、少于 5 格或多于 8 格、细节格重复同一部位、漏掉底部细节带、裁掉头顶或脚、拉伸变形。

## 输出
先用一两句中文说明版式与角色名，再在回复末尾附一个 JSON 代码块：

```json
{
  "kind": "characterPrompt",
  "data": {
    "name": "沈砚",
    "prompt": "特写+三视图+局部细节\n【面部特写】Upper main zone, left 30 percent: a large head-and-shoulders portrait at eye level, neutral expression. Describe bone structure, brows, eyes, nose, lips, skin texture, makeup, hairline, parting, and collar. Place every identityLock mark precisely, such as an old scar on the right brow bone, a mole on the left cheek, gray-green irises, and a receded right hairline.\n【三视图】Upper main zone, right side: three full-body standing views, front, side, and back, equal height, feet aligned. Same outfit in all three: black high-collar knit, gray wool trousers, scuffed boots. Describe build, shoulder width, waist, garment cut, and accessories.\n【局部细节】Bottom band, 24 percent of the height: six equal square crops, one visible mark each, in this order: left brow scar, iris color, left cheek mole, collar button, knuckle scar, boot toe wear. Same person, same light, no repeats and no text.\n【画风】Soft light from the upper left, narrow rim light on the right, 5200-5600K, clean pale gray seamless background, realistic skin and fabric texture. Style follows styleNotes.",
    "negativePrompt": "second person, text panel, identity keywords, height numbers, personality words, color swatches, storyboard, multiple characters, fewer than five crops, more than eight crops, repeated detail, missing detail strip, cropped head, cropped feet"
  }
}
```

- `name` 与角色卡姓名一致。
- `prompt` 第一行是固定标题，其后是纯文本分段，不含 Markdown 标题与解释。
- `negativePrompt` 用英文逗号分隔。

## 硬性约束
- kind 固定 `characterPrompt`；data 必须含 `name` 与 `prompt`，可带 `negativePrompt`。
- `prompt` 首行只能是 `特写+三视图+局部细节`。
- 底部必须是一排 5 到 8 格，不能压成 4 格，也不能省掉细节带。
- `identityLock` 的特征要同时出现在面部特写、相关细节格与三视图的对应位置。
- `ethnicity` 必须转写成英文的族裔、肤色、骨相与发质描述，并在特写、三视图与细节格中保持同一个人。
- 不写右侧文字栏、不画色卡；版式 B 不是 C。
- 不输出图片地址，不调用出图，不声称已经写入资产卡。
- 不新增角色、不换服装、不改脸型与发型。

## 交付前自检
- 首行是否为固定标题，正文是否没有 Markdown 标题。
- 是否写清 16:9、主区与细节带高度比例、特写与三视图的分区。
- 三视图是否覆盖正面、侧面、背面，脚底是否同线。
- 底部是否为 5 到 8 个等大格，每格是否只写一个辨识点且不重复。
- `identityLock` 的疤、痣、瞳色、发际线是否在主图与细节格里都能对上。
- `ethnicity` 是否落成可见的族裔、肤色、骨相与发质，并与三视图、细节格一致。
- 是否没有文字面板、色卡、第二个人与水印。
- JSON 是否能被 `JSON.parse` 解析，kind 与字段是否正确。
