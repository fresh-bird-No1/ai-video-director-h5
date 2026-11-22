---
name: aivd-shot-h3
description: 按当前镜头的生成方式（t2v/i2v/fl2v/r2v）写 MiniMax H3 英文视频提示词，锁定参考编号、毫秒时间码与台词原句。
author: 不晚
copyright: 本项目自研技能文本，未摘录任何第三方内容
license: MIT
version: 1.1.0
---

# Single-shot English H3 Prompt

## 职责

- Serve only the shot referenced by `targetShot` and produce one English prompt that MiniMax H3 can consume directly.
- The outline of that prompt depends on how the shot is generated: text-to-video uses the Base layout, image-to-video and first/last-frame add an alignment instruction to Base, and reference-to-video uses the six-part layout. Never let these four modes share one template.
- Board data, script and asset cards are inputs. This skill does not re-split shots, re-time beats, add plot, or write the still-frame image prompt.

## 读什么

1. `targetShot`: `no`, `duration` (or `durationSec`), `shotSize`, `camera`, `description`, `timeline`, `beats`, `dialogue`, `assets`, `costumes`, `linkPrev`, `id`.
2. Generation mode: read `targetShot.mode` first, then `videoMode` from the payload. If both are absent, fall back to `r2v`. If the shot has neither asset references nor attached first/last frames, switch to `t2v`.
3. `data.board`: confirms where this shot sits in the episode, what the previous shot ended on, and whether continuity is enabled.
4. `data.script`: the episode script, used to verify speakers, action order and exact dialogue.
5. `data.assets.characters[].language`: sets the `<d>` language tag; never hard-code Chinese.
6. `data.assets`: `characters`, `scenes`, `props`, `standings`; supplies locked appearance, spatial landmarks, materials and costume names.
7. `data.prompts`: existing prompts for this project. Look up the current shot by `shot.id` or `String(shot.no)` to decide whether to create a fresh prompt or revise an existing one.

### Building the reference catalog

- Collect asset names from `targetShot.assets`, match them against `data.assets` in the order characters, scenes, props, then append costume swaps from `targetShot.costumes`. The fixed order is **角色 → 场景 → 道具 → 服装**.
- One asset occupies exactly one number. A repeated name must point back to the same card in project data, never to an invented duplicate.
- Image references are numbered `<Picture 1>`, `<Picture 2>`, and so on. Only images consume Picture numbers.
- If the catalog also contains video or audio references, number them separately as `<Video N>` and `<Audio N>` in their own order. Audio embedded in a reference video does not automatically create an `<Audio N>`.
- When the shot has no asset reference image, never invent `<Picture N>`; write it as `t2v`.
- In `i2v` / `fl2v`, `<Picture 1>` and `<Picture 2>` mean the attached first and last frames, not entries in the asset catalog above. Assets are still named in prose.
- Image-to-video and first/last-frame payloads carry `attachedFrames`; the images after the text follow that order. Inspect the first frame, and in `fl2v` the last frame, before writing. If `attachedFrames` is empty, follow the board and never pretend an image was seen.

## 怎么写

### 1. Lock the facts that must not move

Everything below is inherited from `targetShot`; changing any of it is out of scope:

- `duration` / `durationSec` sets the total length, and every action must finish inside it.
- `shotSize` fixes framing; `camera` fixes movement and direction; `mode` fixes the prompt layout.
- `beats` fixes start/end seconds, event order and who is present.
- `dialogue` fixes the exact line and the speaker.
- `linkPrev` decides whether the shot is a hard cut or the next segment of one long take.

### 2. Numbering and subject definitions

`subject_definitions` is mandatory in reference-to-video:

- Write exactly as many entries as the catalog has. Do not drop, reorder, skip or cross-wire any entry, and never fold a later item into an earlier one.
- Every image entry must name its category in the same sentence. Only five category words are allowed, kept in Chinese exactly as **角色、道具、场景、站位图、参考图**. Do not translate these five labels.
- Labels, categories and names must match the catalog exactly. In a single-shot skill, each image maps to one `<Subject N>` starting at 1; `<Picture N>` is the local image index for this shot. `<Video N>` and `<Audio N>` have their own sequences and never consume Subject numbers. Never invent a number that the catalog does not contain.
- When a catalog entry carries a user note, fold that note into the matching subject to explain the image. Do not change its number, category or name because of the note. If there is no note, do not invent one.
- A standing image locks left/right, front/back and facing only. A scene image locks space and set dressing only. A prop image locks that object's shape only. A character image locks that character's appearance and wardrobe only.
- Screens, posters or in-world documents that lack their own image must not steal an already assigned Picture number.

Reference sentence patterns (category demonstration only, not fixed slots):

- `<Subject 1> is the 角色 果果 in <Picture 1>, with a round face and a fluffy tail, appearance locked to the character sheet.`
- `<Subject 2> is the 场景 铺门 in <Picture 2>, a night doorway under lantern light, space and set dressing locked to this scene image.`
- `<Subject 3> is the 道具 木牌 in <Picture 3>, shape, lettering and edges locked to this prop image.`
- `<Subject 4> is the 站位图 门口对峙 in <Picture 4>, left/right, depth and facing locked to this standing image.`

### 3. Timecodes

- Each beat carries `start`, `end` and `text`; start and end are seconds.
- Use `MM:SS.mmm` and join the range with `–`, for example `00:00.000–00:02.000`.
- The first beat starts at `00:00.000`; adjacent beats touch; the last beat ends exactly at `duration` / `durationSec`.
- Take `start` / `end` from the matching beat and preserve event order and dialogue placement. Only two normalizations are allowed: force the first start to zero and the last end to the total duration. If a gap remains between beats, absorb it into the previous beat's end so the timeline stays continuous.
- If `beats` is missing, back-solve start/end seconds from `timeline` fragments such as `0–2秒：内容`, then convert them to timecodes.
- `[Shot 1]` appears once and carries no timestamp; each beat starts a new line with its range.
- Write `[Shot 2] At MM:SS.mmm,` only for a real hard cut. A single continuous take never contains `[Shot 2]`.

### 4. Dialogue, speakers and interruptions

- Use only the exact line from `dialogue`. If it reads `角色名：原句`, drop the name and colon and keep the sentence after the colon.
- If the sentence is wrapped in Chinese quotation marks “ ”, keep only the text inside them. Actions and expressions outside the quotes become visual description and must never enter the dialogue tag.
- Wrap every line as `<d>[language] 原文</d>` without changing a character. The tag is the speaker's language from the character card (Chinese → Chinese, English → English, Japanese → Japanese, Korean → Korean, Cantonese → Cantonese); fall back to the project language, then Chinese. If the shot has no dialogue, omit `<d>` entirely and do not write a placeholder such as "no dialogue".
- Mark the speaker as `<Subject N> (S1)`: `<Subject N>` is the speaking subject, and `S1`, `S2` follow the speaking order in this shot. A subject who speaks twice keeps the same Subject number.
- When a line is cut off, put `<cutoff>` immediately after `</d>`; never complete the sentence for the character.
- When a hard cut lands against dialogue, place `<scenetrans>` at the cut point and keep the same line intact on both sides.

### 5. Expand; do not paraphrase the beat

`beats.text` is intent, not final copy. Every beat must grow into shootable density:

- Composition and depth: foreground, midground, background, subject distance, occlusion.
- Light and material: source direction, color temperature, reflections, atmosphere, fabric and prop texture.
- Body language: hands, eyes, breathing, cloth folds, interaction with props.
- Camera movement: amplitude and speed in natural language, always obeying `camera`.
- Sound detail: audible physical sound, not a repeated "the room is quiet".

Also forbidden: copying `beats.text`; inventing characters, lines or turns; adding a hard cut that the board does not contain.

### 6. Layout per generation mode

#### t2v (text-to-video)

- `instruction` is an empty string; the body starts directly at `integrated_multimodal_description:`.
- All three fields are required: `integrated_multimodal_description`, `overall_soundscape`, `non_diegetic_music`.
- The first array item is a style line covering art direction, palette and mood. Later items carry `[Shot 1]`, the time range and the visual description.
- With no reference image, the style line and every beat must fully specify appearance, environment depth, light and action.

#### i2v (image-to-video)

- The first line is the English alignment instruction, with `<Picture 1>` as the shot's first frame:

```text
For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.
```

- The body path is: first-frame state → initiating motion → continuous development → result or reaction.
- The style line and the `00:00` beat must match the first frame in head count, wardrobe, posture, set dressing, light and framing. Never open on a different picture.
- Anyone not visible in the first frame must not be described as already present at the start.

#### fl2v (first/last frame)

- The first line is the English alignment instruction; `S.SS` is the total duration with two decimals:

```text
How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the S.SS-second mark of the target video.
```

- The body path is: first-frame state → intermediate change → narrowing gap → last-frame state.
- The final beat must land on the visible last frame, and the middle must explain how the shot travels there. If no last-frame image exists, do not invent one.

#### r2v (reference-to-video)

- Six sections, fixed order: `subject_definitions`, `summary`, `retention_analysis`, `detailed_description`, `overall_soundscape`, `non_diegetic_music`.
- `subject_definitions` and `retention_analysis` are arrays of label plus text; `detailed_description` starts with a style line, then beat-by-beat ranges and description.
- The bracketed task type in `summary` must be one of: `reference generation`, `keyframe completion`, `video editing`, `video continuation`, `audio reuse`, `audio reference`. With no image, video or audio reference, use `[reference generation]`.
- `retention_analysis` has one entry per independent label. Visual subjects use `fully_preserved`, `partially_preserved`, `attribute_transfer`, `weak_reference`; audio uses `fully_copy`, `partially_copy`, `reference`.
- A speaking subject is written `<Subject N> (S1)`; dialogue follows section 4.

### 7. Text format inside the prompt

- The two sound sections have fixed roles: `overall_soundscape` carries audible environmental and physical sound; `non_diegetic_music` carries score the characters cannot hear, or `N/A`.
- The final string is plain text for the model, not Markdown. Follow these rules:
- Section names sit alone on a line and end with an English colon, e.g. `subject_definitions:`.
- Separate sections with exactly one blank line.
- No `#` headings, `---` rules, `**bold**` section names, Chinese section titles, or a section name sharing a line with its body.

### 8. Continuity when linkPrev is true

When `linkPrev` is true (or the payload's `continuous` is true), this shot continues the same long take:

1. After the style line and before `[Shot 1]`, the first sentence must be `No hard cut. Immediately following the previous section.` If `continuity` is longer, append how camera, movement direction and subject placement hand off.
2. Restart this shot's timeline at `00:00.000`; never continue absolute seconds from the previous shot.
3. Read `prevShot` / `prevShot.endingBeat` and inherit its ending camera, movement direction, subject placement and action momentum. Do not reset staging, change camera or cut.
4. Keep cast, wardrobe and space consistent; in r2v, do not change the meaning of any `<Subject N>` label.
5. End the last beat on a stable pose that can be handed off, written as `Freeze at…`.
6. Keep the music motif continuous and do not fade out at the end unless the board explicitly resolves.

When `linkPrev` is false, omit all continuity wording and never pretend to continue the previous shot. Shot 1's `linkPrev` must be false; if the data mistakenly says true, execute it as a hard cut.

## 输出

`kind` is always `"prompts"`. The full key set for one shot is `{shotNo, h3zh, h3en, frame}`:

- `shotNo`: current shot number, required, never renamed. The writer locates the shot by this field; never drop it.
- `h3en`: the English H3 prompt produced this round, as one string.
- `h3zh`: not owned by this skill. Carry over the existing Chinese prompt from `data.prompts` unchanged when present; otherwise use an empty string.
- `frame`: not owned by this skill. Carry over the existing still-frame prompt unchanged when present; otherwise use an empty string.

```json
{"kind":"prompts","data":{"shotNo":3,"h3en":"subject_definitions:\n<Subject 1> is the 角色 果果 in <Picture 1>, with a round face and a fluffy tail, appearance and wardrobe locked to the character sheet.\n<Subject 2> is the 场景 铺门 in <Picture 2>, a night doorway under warm lantern light, space and set dressing locked to this scene image.\n<Subject 3> is the 道具 木牌 in <Picture 3>, shape, lettering and edges locked to this prop image.\n\nsummary:\n[reference generation] <Subject 1> straightens the sign at the doorway and speaks; <Picture 1> locks appearance only, <Picture 2> locks space only, <Picture 3> locks the prop only.\n\nretention_analysis:\n<Subject 1> (appears in [Shot 1]): fully_preserved - 果果's identity, round face, fluffy tail and locked wardrobe stay unchanged.\n<Subject 2> (appears in [Shot 1]): fully_preserved - the doorway frame, lantern position and night space stay unchanged.\n<Subject 3> (appears in [Shot 1]): partially_preserved - the lettering and edges stay, while a slight sway belongs to this shot's action.\n\ndetailed_description:\nA warm picture-book look with soft paper texture, night air glowing under the lantern.\n[Shot 1]\n00:00.000–00:02.000\nA warm medium shot on a locked camera. <Subject 1> stands on the left and holds <Subject 3> with both hands; the sign sways once in the lantern light, with <Subject 2> framing the background.\n00:02.000–00:04.000\n<Subject 1> (S1) lifts her eyes toward the doorway and says in a tight voice, <d>[Chinese] 停，停在这儿了。</d> Her fingers stay pressed on the sign's edge as the last syllable lands.\n00:04.000–00:06.000\n<Subject 1> pulls her hands back and takes half a step away, shoulders loosening; <Subject 3> settles, and the lantern light on <Subject 2> sways gently. Freeze at 果果 standing side-on.\n\noverall_soundscape:\nNight wind crosses the doorway, the lantern hook ticks, and the sign lands with a dull thud.\n\nnon_diegetic_music:\nN/A","h3zh":"","frame":""}}
```

End the reply with a JSON block shaped as `{"kind":"prompts","data":{...}}`; keep explanations outside it. Do not claim the project has been written until the user presses the draft button.

## 硬性约束

- One shot only: no splitting, merging, retiming, no change to `shotSize`, `camera` or `mode`.
- Route by mode: `t2v` must have an empty `instruction`; `i2v` must anchor 0.00 seconds to `<Picture 1>`; `fl2v` must state both the 0.00-second first frame and the `S.SS`-second last frame; `r2v` must contain all six sections. Never mix Base and six-part layouts.
- Reference count, order, numbering, category and names must match project data. Category vocabulary is limited to 角色、道具、场景、站位图、参考图.
- Timeline starts at `00:00.000`, adjacent beats touch, the last beat equals total duration, no action overruns.
- Dialogue is quoted exactly inside `<d>[language] …</d>`, with the tag matching the speaker's character-card language; actions outside quotation marks are never dialogue; omit the tag when no line exists.
- Continuity follows all six rules in section 8; shot 1 never claims continuity; a hard cut never says "no hard cut".
- No Markdown headings, rules, bold section names or Chinese section titles inside the prompt.
- No new characters, props, scenes, lines or plot turns; keep asset names exactly as stored.

## 交付前自检

- Does the layout match `targetShot.mode`, and is `t2v` really using an empty `instruction`?
- Is every catalog entry represented once, in order, with only the five allowed category words?
- Do timecodes start at zero, touch end to start, and end at the total duration?
- Does every action fit the duration, and do framing and camera match the fields?
- Is dialogue limited to the original line, speakers marked `<Subject N> (S1)`, the `<d>` language tag matching the character card, interruptions marked `<cutoff>` / `<scenetrans>`?
- Is `linkPrev` handled correctly, with shot 1 treated as a hard cut?
- Does the output parse as JSON, and is `shotNo` still present?
