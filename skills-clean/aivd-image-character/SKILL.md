---
name: aivd-image-character
description: 生成英文角色定妆拼图提示词：左侧全身三视图 + 右侧大面部特写，锁定同一张脸与造型。
author: 不晚
copyright: 本项目自研技能文本，未摘录任何第三方内容
license: MIT
version: 1.1.0
---

# 角色定妆提示词 · 版式 A（英文）

## 职责
把一张角色卡转成可直接投喂图像模型的英文定妆拼图文本。版式锁定为 16:9 横版：画面左侧是同一角色的全身三视图，右侧是一张头肩大特写。不设底部细节条，不排任何人设文字，也不放色卡。任务只做外观转写与版式固定，不重新设计人物，不改角色卡里已经确定的年龄、身份与服装。这张图同时是版式 B、C 与后续分镜的角色基准，脸、发型、服装一旦落定，就不得在别的版式里漂移。

## 读什么
- 角色卡的姓名、性别、年龄感、人种 / 族裔（ethnicity）、身份、身高与体态。
- `ethnicity` 与 `profile` / `appearance` 里的肤色、骨相、发质必须一致；英文 prompt 要把 `ethnicity` 转成对应的英文族裔描述，不得改写成其他人种。
- `profile` 里的脸型、骨相、眉形、眼型、鼻唇、肤色与肤质、妆面。
- `identityLock` 的全部条目：疤痕、痣、瞳色、发际线、眉形缺口、耳形、纹身、义肢等。它的优先级高于 `profile`、`description` 与任何参考图描述，冲突时以 `identityLock` 为准。
- 发型：长度、层次、分缝位置、发色、是否束起。
- 服装与配饰：件数、版型、领口、袖长、腰头、裙裤长度、面料、颜色、鞋型，以及每件配饰在身上的位置。
- `styleLock` 与 `styleNotes`；两者都空时用选题页的画风与色调兜底。
- 角色卡附带的参考图只提供外观依据，不沿用它的构图与排版。

缺项按角色卡其余信息做中性延展，不编造身世，不写真实品牌与真人姓名。

## 怎么写

第一行只放固定标题：`特写+角色设定三视图`。第二行起按下面分段书写，段首用固定标记，段与段之间换行，不要压成整段。正文用英文；标题、专有名词与角色名可保留中文。不要写镜头运动。

### 版式骨架
- 画布 16:9 landscape，一张拼图，不拆成多张。
- 左区约占宽度 56%，三张全身站姿并排，从左到右为正面、侧面、背面；三人等高，脚底落在同一条水平线上，间距均匀。
- 右区约占宽度 44%，一张头肩大特写，肩线以下渐隐；头顶与下巴外侧留白，不裁发梢、不裁耳朵。
- 背景用白色或极浅灰无缝底，人物边缘干净；左右两区靠留白分开，不画分割线、边框、页码或任何标签。
- 三个视图与特写必须共用同一张脸、同一套发型、同一套服装与配饰。

### 【三视图】
- 三张均为自然站姿，双臂略微离开躯干，手掌放松，脚尖朝前或微微外八。
- 逐项写清身高比例、肩宽、腰线高低、腿身比、体态习惯（含胸、挺拔、微驼等）。
- 服装写到形制：领口形状、门襟方式、袖长与袖口、腰头、下摆或裤长、面料垂坠感；三张的件数与穿法完全一致。
- 鞋写鞋型、鞋头、鞋跟高度与磨损。
- 允许手持一件与角色绑定的标志性小道具；不持道具时写空手。
- 本段不写头肩大特写、不写底部小格、不写任何文字说明。

### 【面部特写】
- 机位与人物眼睛齐平，中性表情，视线平视镜头。
- 先写 `ethnicity` 对应的族裔特征，再写五官：例如「East Asian woman, warm light skin, monolid, straight black hair」；族裔、肤色、骨相、发质不得省略，也不得与角色卡冲突。
- 写清年龄感、脸型轮廓、颧骨与下颌、眉形与眉距、眼型与眼距、鼻梁与鼻头、唇形、皮肤毛孔与质感、妆面浓淡。
- `identityLock` 里的每一项都要落到具体位置和形态，例如「左眉尾一道两厘米旧疤」「右眼下方一颗小痣」「虹膜偏琥珀」「发际线左侧有美人尖」。不能只用「有疤」这类笼统说法。
- 发型写到发际线、分缝方向、鬓角、发尾长度；领口与三视图完全一致。
- 本段不画全身、不加局部小格、不写身份文字。

### 【画风】
- 单独起行，放在最后。依据 `styleNotes` 扩写成可执行的笔触、色调、光质、边缘处理与材质质感；`styleNotes` 为空时对齐 `styleLock`。
- 光线用均匀柔和的摄影棚布光：主光在左上方约 45 度，右侧补一道窄轮廓光，色温 5200–5600K，不偏冷也不偏暖；皮肤保留真实纹理，布料看得出织纹与褶皱。
- 主图与三视图共用这一套光与画风，不允许某个视图单独换光。

## 整图禁止
第二个人物、局部细节条、人设文字、身份关键词、身高数字、性格词、主色色卡、箭头、网格、裁切框、水印、logo、分镜格、多角色合影、杂乱背景、裁掉头顶或脚部、夸张拉伸与变形。

## 输出
先用一两句中文说明版式与角色名，然后在回复末尾给一个 JSON 代码块：

```json
{
  "kind": "characterPrompt",
  "data": {
    "name": "沈砚",
    "prompt": "特写+角色设定三视图\n【三视图】Left zone, 56 percent of the frame: three full-body standing views in a row, front, side, and back, equal height, feet on one baseline, even spacing. Same person in the same outfit throughout: charcoal wool overcoat over an ivory shirt, dark trousers, worn leather boots. Describe height impression, shoulder width, waist line, posture, garment cut, shoe shape, and one signature prop if held. No close-up and no small crops in this zone.\n【面部特写】Right zone, 44 percent of the frame: a large head-and-shoulders portrait, eye-level camera, neutral expression. Describe age impression, bone structure, brow shape, eye shape, nose, lips, skin texture, makeup, hairline, parting, and collar. Include every identityLock mark at its exact location, such as a two-centimeter old scar at the left brow tail, a small mole below the right eye, amber irises, and a widow's peak on the left hairline. Same face, same hair, same collar as the three views.\n【画风】Soft even studio light from the upper left, a narrow rim light on the right, 5200-5600K, clean white seamless background, realistic skin texture and visible fabric weave. Style follows styleNotes.",
    "negativePrompt": "second person, detail strip, text panel, identity keywords, height numbers, personality words, color swatches, arrows, grid, crop marks, watermark, logo, storyboard, multiple characters, busy background, cropped head, cropped feet"
  }
}
```

- `name` 与角色卡姓名完全一致。
- `prompt` 是直接写入资产卡 prompt 字段的纯文本，第一行就是固定标题，不含 Markdown 标题、项目符号或解释。
- `negativePrompt` 只放需要排除的画面，用英文逗号分隔。

## 硬性约束
- kind 固定 `characterPrompt`；data 必须含 `name` 与 `prompt`，可带 `negativePrompt`。
- `prompt` 首行只能是 `特写+角色设定三视图`，不得改字、不得加前后缀。
- 英文版正文不写中文长句；人名、地名、品牌等专有名词可保留原文。
- `ethnicity` 必须转写成英文的族裔、肤色、骨相与发质描述，并在特写与三视图中保持同一个人。
- `identityLock` 的特征在特写与三视图中都要能对上，不得为了好看而删改。
- 不输出图片地址，不调用出图，不声称已经写入资产卡；写入只能由用户点「写入草稿」触发。
- 不新增角色、不换服装方案、不把版式 A 改成 B 或 C。

## 交付前自检
- 首行是否为固定标题，`prompt` 内是否没有 Markdown 标题。
- 是否写明 16:9、左 56% / 右 44%、三视图顺序与脚底同线、头顶留白。
- 三视图是否覆盖正面、侧面、背面，服装件数与鞋是否三张一致。
- `identityLock` 的疤、痣、瞳色、发际线等是否逐项落到特写，并在三视图里保持。
- `ethnicity` 是否落成可见的族裔、肤色、骨相与发质，并与三视图一致。
- 是否只出现一个人，是否没有文字、色卡、局部细节条与水印。
- JSON 是否能被 `JSON.parse` 解析，kind 与字段是否正确。
