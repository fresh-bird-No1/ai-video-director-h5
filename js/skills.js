let manifest = [];
let skillsApi = false;
const bodyCache = new Map();

/** 是否连上了本地服务的技能接口（支持写入/导入/导出）。 */
export function skillsApiAvailable() {
  return skillsApi;
}

export async function initSkills() {
  try {
    const res = await fetch('/api/skills', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.skills;
      if (Array.isArray(list) && list.length) {
        manifest = list;
        skillsApi = true;
        bodyCache.clear();
        return manifest;
      }
    }
  } catch (err) {
    // 纯静态托管没有接口，继续走 manifest.json。
  }
  const res = await fetch('skills-clean/manifest.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('技能清单加载失败：' + res.status);
  manifest = await res.json();
  skillsApi = false;
  bodyCache.clear();
  return manifest;
}

export function listSkills() {
  return manifest;
}

export function skillMeta(id) {
  return manifest.find((s) => s.id === id) || null;
}

export function skillLabel(id) {
  const m = skillMeta(id);
  return m ? `${m.name}（${m.id}）` : id || '未选择';
}

/** 下拉用的短标签：只放名称，特性统一用 description 展示。 */
export function skillShortLabel(id, slotKey) {
  const override = slotKey ? SKILL_SLOTS[slotKey]?.optionLabels?.[id] : '';
  if (override) return override;
  const m = skillMeta(id);
  if (!m) return id || '未选择';
  const prefix = m.origin === 'custom' ? '自定义 · ' : '';
  const desc = String(m.description || '').replace(/\s+/g, ' ').trim();
  const head = desc.split(/[：:。；;，,]/)[0] || desc || id;
  const text = head.length > 40 ? head.slice(0, 40) + '…' : head;
  return prefix + (text || m.name || id);
}

/**
 * 流程槽位表：每个槽位对应 UI 上的一个动作入口。
 * quickPick 的槽位会在资产页显示快捷下拉。
 */
export const SKILL_SLOTS = {
  topic: {
    stage: 'topic', group: '选题', label: '选题生成', modeDriven: true,
    originalFallback: 'aivd-topic', scriptFallback: 'aivd-topic-script',
    candidates: ['aivd-topic', 'aivd-topic-script'],
  },
  outline: {
    stage: 'outline', group: '大纲', label: '大纲生成', modeDriven: true,
    originalFallback: 'aivd-outline', scriptFallback: 'aivd-outline-script',
    candidates: ['aivd-outline', 'aivd-outline-script'],
  },
  outlineCheck: {
    stage: 'outline', group: '大纲', label: '大纲检查',
    fallback: 'aivd-outline-check', candidates: ['aivd-outline-check'],
  },

  characterProfile: {
    stage: 'assets', group: '角色', label: '角色补卡',
    fallback: 'aivd-character', candidates: ['aivd-character'],
  },
  characterGap: {
    stage: 'assets', group: '角色', label: '角色补缺',
    fallback: 'aivd-character-gap', candidates: ['aivd-character-gap'],
  },
  characterPrompt: {
    stage: 'assets', group: '角色', label: '角色定妆提示词', quickPick: true,
    fallback: 'aivd-image-character-b-zh', legacyKey: 'characterPromptSkill',
    candidates: [
      'aivd-image-character-zh', 'aivd-image-character',
      'aivd-image-character-b-zh', 'aivd-image-character-b',
      'aivd-image-character-c-zh', 'aivd-image-character-c',
    ],
    optionLabels: {
      'aivd-image-character-zh': '中文三视图特写版',
      'aivd-image-character': '英文三视图特写版',
      'aivd-image-character-b-zh': '中文三视图细节版',
      'aivd-image-character-b': '英文三视图细节版',
      'aivd-image-character-c-zh': '中文人设色卡版',
      'aivd-image-character-c': '英文人设色卡版',
    },
  },
  costumePrompt: {
    stage: 'assets', group: '服装', label: '服装提示词',
    fallback: 'aivd-image-costume', candidates: ['aivd-image-costume'],
  },
  sceneProfile: {
    stage: 'assets', group: '场景', label: '场景补卡',
    fallback: 'aivd-scene', candidates: ['aivd-scene'],
  },
  sceneGap: {
    stage: 'assets', group: '场景', label: '场景补缺',
    fallback: 'aivd-scene-gap', candidates: ['aivd-scene-gap'],
  },
  scenePrompt: {
    stage: 'assets', group: '场景', label: '场景生图提示词', quickPick: true,
    fallback: 'aivd-image-scene-master', legacyKey: 'scenePromptSkill',
    candidates: ['aivd-image-scene-master', 'aivd-image-scene', 'aivd-image-scene-plan'],
    optionLabels: {
      'aivd-image-scene-master': '单张主图',
      'aivd-image-scene': '主图 + 四机位',
      'aivd-image-scene-plan': '平面图俯视',
    },
  },
  sceneAngle: {
    stage: 'assets', group: '场景', label: '场景换角度',
    fallback: 'aivd-scene-angle', candidates: ['aivd-scene-angle'],
  },
  propProfile: {
    stage: 'assets', group: '道具', label: '道具补卡',
    fallback: 'aivd-prop', candidates: ['aivd-prop'],
  },
  propGap: {
    stage: 'assets', group: '道具', label: '道具补缺',
    fallback: 'aivd-prop-gap', candidates: ['aivd-prop-gap'],
  },
  propPrompt: {
    stage: 'assets', group: '道具', label: '道具生图提示词', quickPick: true,
    fallback: 'aivd-image-prop', candidates: ['aivd-image-prop'],
  },
  standingProfile: {
    stage: 'assets', group: '站位', label: '站位补卡',
    fallback: 'aivd-standing', candidates: ['aivd-standing'],
  },
  standingGap: {
    stage: 'assets', group: '站位', label: '站位补缺',
    fallback: 'aivd-standing-gap', candidates: ['aivd-standing-gap'],
  },
  standingPrompt: {
    stage: 'assets', group: '站位', label: '站位生图提示词', quickPick: true,
    fallback: 'aivd-image-standing', candidates: ['aivd-image-standing'],
  },

  scriptWrite: {
    stage: 'script', group: '剧本', label: '写本集', modeDriven: true,
    originalFallback: 'aivd-script', scriptFallback: 'aivd-script-adapt',
    candidates: ['aivd-script', 'aivd-script-adapt'],
  },
  scriptRevise: {
    stage: 'script', group: '剧本', label: '按说明改写',
    fallback: 'aivd-script', candidates: ['aivd-script'],
  },
  scriptCheck: {
    stage: 'script', group: '剧本', label: '剧本检查',
    fallback: 'aivd-script-check', candidates: ['aivd-script-check'],
  },

  boardSplit: {
    stage: 'board', group: '分镜', label: '拆分镜',
    fallback: 'aivd-board', legacyBool: 'boardDetailed',
    legacyBoolTrue: 'aivd-board-h3', legacyBoolFalse: 'aivd-board',
    candidates: ['aivd-board', 'aivd-board-h3'],
    optionLabels: { 'aivd-board': '常规拆分', 'aivd-board-h3': '详细拆分' },
  },
  boardAdd: {
    stage: 'board', group: '分镜', label: '加镜',
    fallback: 'aivd-shot-add', candidates: ['aivd-shot-add'],
  },
  boardRevise: {
    stage: 'board', group: '分镜', label: '改镜',
    fallback: 'aivd-shot-revise', candidates: ['aivd-shot-revise'],
  },
  boardTransition: {
    stage: 'board', group: '分镜', label: '转场设计',
    fallback: 'aivd-transition', candidates: ['aivd-transition'],
  },
  refLayout: {
    stage: 'board', group: '分镜', label: '占位润色',
    fallback: 'aivd-layout-polish', candidates: ['aivd-layout-polish'],
  },

  shotH3zh: {
    stage: 'prompts', group: '提示词', label: '中文 H3 提示词',
    fallback: 'aivd-shot-h3-zh', candidates: ['aivd-shot-h3-zh'],
  },
  shotH3en: {
    stage: 'prompts', group: '提示词', label: '英文 H3 提示词',
    fallback: 'aivd-shot-h3', candidates: ['aivd-shot-h3'],
  },
  h3All: {
    stage: 'prompts', group: '提示词', label: '整集生成',
    fallback: 'aivd-h3-prompt', candidates: ['aivd-h3-prompt', 'aivd-h3-suite'],
    optionLabels: { 'aivd-h3-prompt': '单镜三合一', 'aivd-h3-suite': '整集批量' },
  },
  frame: {
    stage: 'prompts', group: '提示词', label: '分镜图提示词',
    fallback: 'aivd-frame-prompt', candidates: ['aivd-frame-prompt'],
  },

  image: {
    stage: 'image', group: '图片', label: '出图（未接入）',
    fallback: 'aivd-image-gpt2', candidates: ['aivd-image-gpt2'],
  },
};

/** 槽位候选 = 内置技能 + 归入该槽位的自定义技能。 */
export function slotCandidates(slotKey) {
  const slot = SKILL_SLOTS[slotKey];
  if (!slot) return [];
  const declared = slot.candidates || [];
  const builtin = manifest.length ? declared.filter((id) => skillMeta(id)) : declared;
  const custom = manifest
    .filter((s) => s && s.origin === 'custom' && s.slot === slotKey)
    .map((s) => s.id)
    .filter((id) => !builtin.includes(id));
  const list = [...builtin, ...custom];
  return list.length ? list : declared;
}

/** 某个槽位当前生效的技能。 */
export function resolveSlotSkill(slotKey, settings) {
  const slot = SKILL_SLOTS[slotKey];
  if (!slot) return '';
  const options = slotCandidates(slotKey);
  const saved = String(settings?.skillDefaults?.[slotKey] || '');
  if (saved && options.includes(saved)) return saved;
  if (slot.legacyKey) {
    const legacy = String(settings?.[slot.legacyKey] || '');
    if (legacy && options.includes(legacy)) return legacy;
  }
  if (slot.legacyBool) {
    return settings?.[slot.legacyBool] ? slot.legacyBoolTrue : slot.legacyBoolFalse;
  }
  return slot.fallback || options[0] || '';
}

/** 管理页使用：modeDriven 槽位返回空字符串表示“跟随项目模式”。 */
export function defaultSkillFor(slotKey, settings) {
  const slot = SKILL_SLOTS[slotKey];
  if (!slot) return '';
  if (slot.modeDriven) {
    const options = slotCandidates(slotKey);
    const saved = String(settings?.skillDefaults?.[slotKey] || '');
    return options.includes(saved) ? saved : '';
  }
  return resolveSlotSkill(slotKey, settings);
}

/** modeDriven 槽位未指定技能时的说明。 */
export const MODE_DRIVEN_DESC = '由项目模式自动选择：原创项目用原创技能，从剧本开始的项目用改编技能。';

/** 流程当前默认技能的名称与完整特性说明，供设置页和资产页统一展示。 */
export function slotSkillInfo(slotKey, settings) {
  const slot = SKILL_SLOTS[slotKey];
  if (!slot) return { name: '', description: '' };
  const current = defaultSkillFor(slotKey, settings);
  if (!current) {
    return { name: '跟随项目模式', description: MODE_DRIVEN_DESC };
  }
  return {
    name: skillShortLabel(current, slotKey),
    description: skillMeta(current)?.description || '',
  };
}

export async function loadSkillBody(id) {
  if (!id) throw new Error('未选择技能');
  if (bodyCache.has(id)) return bodyCache.get(id);
  const meta = skillMeta(id);
  if (!meta) throw new Error('技能不存在：' + id);
  const res = await fetch(meta.file, { cache: 'no-store' });
  if (!res.ok) throw new Error('技能读取失败：' + id);
  const text = await res.text();
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const front = m ? m[1] : '';
  const body = m ? text.slice(m[0].length) : text;
  const field = (k) => {
    const r = front.match(new RegExp('^' + k + ':\\s*(.+)$', 'm'));
    return r ? r[1].trim() : '';
  };
  const notice = [
    field('author') ? `作者：${field('author')}` : '',
    field('copyright') ? field('copyright') : '',
    field('license') ? `license: ${field('license')}` : '',
    field('redistribution') ? `redistribution: ${field('redistribution')}` : '',
  ].filter(Boolean).join('；');
  const payload = { body, notice };
  bodyCache.set(id, payload);
  return payload;
}

export function chooseSkill(action, project, settings = {}) {
  const fromScript = project?.mode === 'script';
  const slot = SKILL_SLOTS[action];
  if (!slot) return fromScript ? 'aivd-topic-script' : 'aivd-topic';
  if (slot.modeDriven) {
    const picked = defaultSkillFor(action, settings);
    if (picked) return picked;
    return fromScript ? slot.scriptFallback : slot.originalFallback;
  }
  return resolveSlotSkill(action, settings);
}

const STAGE_CONTRACTS = {
  topic: `当前阶段：选题。把信息整理成选题配置。输出 JSON 形状：
{"kind":"topic","data":{"title":"","genres":["题材"],"audience":"","tone":"","ending":"HE|BE|OE","episodes":12,"duration":"","language":"","visualStyle":"","direction":"","extras":["每条一行纯文本，不要输出对象"]}}`,
  outline: `当前阶段：创作大纲。输出 JSON 形状：
{"kind":"outline","data":{"logline":"","synopsis":"","want":"","need":"","flaw":"","worldRules":"","setting":"","act1":"","act2":"","act3":"","rhythm":"","highlights":"","ending":"","paywall":"","characters":[{"name":"","role":"","description":""}],"episodes":[{"number":1,"title":"","synopsis":"","logline":""}]}}`,
  assets: `当前阶段：资产设计。根据子类型输出 JSON 形状：
角色 {"kind":"characters","data":{"characters":[{"name":"","role":"","description":"","profile":"","voiceNotes":""}]}}
场景 {"kind":"scenes","data":{"scenes":[{"name":"","description":"","location":"","lighting":"","landmark":"","style":""}]}}
道具 {"kind":"props","data":{"props":[{"name":"","description":"","usage":"","material":"","size":"","style":""}]}}
站位 {"kind":"standings","data":{"standings":[{"name":"","episode":1,"shot":"","function":"","lighting":"","landmark":"","style":""}]}}
写提示词时，把提示词写入对应项目的 prompt 字段，例如 {"kind":"characterPrompt","data":{"name":"角色名","prompt":"..."}}。
服装提示词 {"kind":"costumePrompt","data":{"name":"服装名称","prompt":"..."}}。`,
  script: `当前阶段：分集剧本。输出 JSON 形状：
{"kind":"script","data":{"episodeNumber":1,"title":"","scenes":[{"title":"","location":"","time":"","actions":["动作/画面"],"narration":["旁白"],"lines":[{"speaker":"角色名","text":"对白"}]}]}}`,
  board: `当前阶段：分镜。输出 JSON 形状：
{"kind":"board","data":{"episodeNumber":1,"shots":[{"no":1,"duration":"4秒","shotSize":"中景","camera":"固定","description":"画面","timeline":"0-2秒……","dialogue":"","assets":[],"costumes":["角色名：服装名称"]}]}}
costumes 只写本镜需要换装的角色，格式固定为「角色名：服装名称」，服装名称必须与角色卡里的服装名称一致；角色没有服装卡或本镜穿默认造型时不要写该角色，UI 会默认使用定妆图。
转场 {"kind":"transition","data":{"episodeNumber":1,"index":0,"fromShotId":"","toShotId":"","technique":"","duration":"1.6秒","prompt":""}}，index 是上一镜在 shots 里的下标。
duration 只能取 1.6秒、2.3秒、3秒 三档：同场动作或同向运镜用 1.6秒，跨场、跨时间或情绪过渡用 1.6–2.3秒，大跨度场景或需要情绪停顿用 2.3–3秒。
转场片段成片一律静音：先读两镜的环境、光线与剧情关系再选最不容易被察觉的技法；prompt 只写画面、动作与运镜，不写对白、旁白、音乐、音效或环境声，也不要用靠声音完成的过渡。`,
  prompts: `当前阶段：镜头提示词。输出 JSON 形状：
{"kind":"prompts","data":{"episodeNumber":1,"shots":[{"no":1,"h3en":"","h3zh":"","frame":""}]}}
单镜也可输出 {"kind":"prompts","data":{"shotNo":1,"h3en":"","h3zh":"","frame":""}}`,
};

export function buildSystemPrompt(skillId, stage, project, notice) {
  const meta = skillMeta(skillId);
  const contract = STAGE_CONTRACTS[stage] || '';
  const mode = project?.mode === 'script' ? '从剧本开始' : '原创';
  return [
    '你是「AI视频导演助手 H5」的创作 Agent，负责短剧创作流水线中的一个阶段。',
    '严格遵守当前技能文档里的规则、字段与禁止项。',
    '产出要可直接写入项目数据，不要空字段，不要编造与用户素材冲突的内容。',
    '每次回复末尾必须附一个 ```json 代码块，结构为 {"kind":"类型","data":{...}}，不要把说明文字放进 JSON。',
    '在用户点击「写入草稿」之前，不要声称已经写入项目。',
    contract,
    `当前项目：${project?.name || '未命名'}；模式：${mode}；当前阶段：${stage}；当前技能：${skillId}${meta ? '（' + meta.name + '）' : ''}。`,
    notice ? `技能版权声明：${notice}` : '',
  ].filter(Boolean).join('\n\n');
}

export async function composeSystem(skillId, stage, project) {
  const { body, notice } = await loadSkillBody(skillId);
  return buildSystemPrompt(skillId, stage, project, notice) + '\n\n===== 技能正文开始 =====\n\n' + body;
}
