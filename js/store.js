const LS_KEY = 'dm_h5_v1';

export const STAGES = [
  { id: 'topic', label: '选题', hint: '剧名、题材、受众、调性、集数' },
  { id: 'outline', label: '大纲', hint: '故事线、三幕、分集与卡点' },
  { id: 'assets', label: '资产', hint: '角色、场景、道具、站位' },
  { id: 'script', label: '剧本', hint: '场次、对白、动作' },
  { id: 'board', label: '分镜', hint: '镜头表与时间轴' },
  { id: 'prompts', label: '提示词', hint: 'H3 视频与分镜图提示词' },
];

export const LLM_PROVIDERS = [
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'o4-mini'] },
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', models: ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-flash'] },
  { id: 'moonshot', label: 'Moonshot（Kimi）', baseUrl: 'https://api.moonshot.cn/v1', models: ['moonshot-v1-32k', 'moonshot-v1-128k', 'moonshot-v1-8k'] },
  { id: 'zhipu', label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4-plus', 'glm-4-air', 'glm-4-flash'] },
  { id: 'dashscope', label: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen-max', 'qwen-plus', 'qwen-turbo'] },
  { id: 'siliconflow', label: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', models: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct'] },
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet'] },
  { id: 'custom', label: '自定义（OpenAI 兼容）', baseUrl: '', models: [] },
];

const DEFAULT_COMFY = {
  server: 'http://127.0.0.1:8188',
  workflow: '',
  promptRef: '',
  negativeRef: '',
  outputNode: '',
  autoSeed: true,
  timeout: 180,
};

export const DEFAULT_SETTINGS = {
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  temperature: 0.4,
  maxTokens: 16384,
  characterPromptSkill: 'aivd-image-character-b-zh',
  scenePromptSkill: 'aivd-image-scene-master',
  skillDefaults: {},
  boardDetailed: false,
  image: { ...DEFAULT_COMFY },
  audio: { ...DEFAULT_COMFY },
};

export const state = {
  projects: [],
  currentId: '',
  settings: { ...DEFAULT_SETTINGS },
  ui: {
    stage: 'topic',
    assetTab: 'character',
    episode: 1,
    chatOpen: true,
    settingsOpen: false,
    settingsTab: 'agent',
    testResult: {},
    llmModels: [],
    assetOpen: {},
    serverOnline: false,
    workspace: '',
    workspaceSuggested: '',
    projectIndex: [],
    screen: '',
    welcome: false,
    chat: { messages: [], skillId: '', busy: false, proposals: [] },
    // 左栏的生图 / 音频生成状态：busy 为并发任务数，state 为最近一次结果
    genStatus: {
      image: { busy: 0, state: 'idle', title: '' },
      audio: { busy: 0, state: 'idle', title: '' },
    },
  },
};

export function uid(prefix = 'id') {
  return prefix + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

export function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data.projects)) {
      state.projects = data.projects;
      for (const p of state.projects) {
        for (const c of p.characters || []) {
          if (!Array.isArray(c.costumes)) c.costumes = [];
        }
        // 本镜服装旧格式「角色：服装」字符串，迁移为可选的 { character, costume }
        for (const [epKey, ep] of Object.entries(p.board || {})) {
          if (!Array.isArray(ep.transitions)) ep.transitions = [];
          (ep.shots || []).forEach((shot, i) => {
            if (!shot.id) shot.id = `shot_${epKey}_${i + 1}_${Math.random().toString(36).slice(2, 7)}`;
            if (!Array.isArray(shot.costumes)) shot.costumes = [];
            shot.costumes = shot.costumes.map((c) => {
              if (typeof c !== 'string') return c;
              const [a, b] = c.split(/[:：]/).map((x) => x.trim());
              return b ? { character: a, costume: b } : { character: '', costume: a || '' };
            }).filter((c) => c.character || c.costume);
          });
        }
      }
    }
    if (data.settings) {
      // 旧版只有 characterPromptSkill / scenePromptSkill 两个字段，迁移到 skillDefaults。
      const legacyDefaults = {};
      if (data.settings.characterPromptSkill) legacyDefaults.characterPrompt = data.settings.characterPromptSkill;
      if (data.settings.scenePromptSkill) legacyDefaults.scenePrompt = data.settings.scenePromptSkill;
      state.settings = {
        ...DEFAULT_SETTINGS,
        ...data.settings,
        skillDefaults: {
          ...DEFAULT_SETTINGS.skillDefaults,
          ...legacyDefaults,
          ...(data.settings.skillDefaults || {}),
        },
        image: { ...DEFAULT_SETTINGS.image, ...(data.settings.image || {}) },
        audio: { ...DEFAULT_SETTINGS.audio, ...(data.settings.audio || {}) },
      };
      if (state.settings.maxTokens === 8192) state.settings.maxTokens = DEFAULT_SETTINGS.maxTokens;
    }
    state.currentId = data.currentId || (state.projects[0] && state.projects[0].id) || '';
  } catch (e) {
    console.warn('读取本地数据失败', e);
  }
}

export function save() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      projects: state.projects,
      settings: state.settings,
      currentId: state.currentId,
    }));
    dirty = false;
  } catch (e) {
    console.warn('保存失败，本地存储可能已满', e);
  }
}

let dirty = false;

/** 只改内存并标记待保存，等用户离开编辑框时再落盘 */
export function touchLazy(project) {
  if (project) project.updatedAt = Date.now();
  dirty = true;
}

/** 把待保存的改动写进 localStorage */
export function flushSave() {
  if (dirty) save();
}

export function currentProject() {
  return state.projects.find((p) => p.id === state.currentId) || null;
}

export function touch(project) {
  if (!project) return;
  project.updatedAt = Date.now();
  save();
}

export function blankTopic(name) {
  return {
    title: name || '',
    genres: [],
    audience: '',
    tone: '',
    ending: 'HE',
    episodes: 12,
    duration: '60秒',
    language: '中文',
    visualStyle: '',
    direction: '',
    extras: [],
  };
}

export function blankOutline() {
  return {
    logline: '', synopsis: '', want: '', need: '', flaw: '', worldRules: '',
    setting: '', act1: '', act2: '', act3: '', rhythm: '', highlights: '',
    ending: '', paywall: '', characters: [], episodes: [],
  };
}

export function createProject(name, mode = 'original') {
  const project = {
    id: uid('p'),
    name: name || '未命名项目',
    mode,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sourceText: '',
    topic: blankTopic(name),
    outline: blankOutline(),
    characters: [],
    scenes: [],
    props: [],
    standings: [],
    script: {},
    board: {},
    prompts: {},
  };
  state.projects.unshift(project);
  state.currentId = project.id;
  state.ui.stage = 'topic';
  state.ui.episode = 1;
  state.ui.chat = { messages: [], skillId: '', busy: false, proposals: [] };
  save();
  return project;
}

export function deleteProject(id) {
  const i = state.projects.findIndex((p) => p.id === id);
  if (i < 0) return;
  state.projects.splice(i, 1);
  if (state.currentId === id) {
    state.currentId = state.projects[0] ? state.projects[0].id : '';
    state.ui.chat = { messages: [], skillId: '', busy: false, proposals: [] };
  }
  save();
}

export function episodeCount(project) {
  const n = Number(project?.topic?.episodes);
  if (Number.isFinite(n) && n > 0) return Math.min(Math.round(n), 200);
  const listed = project?.outline?.episodes?.length || 0;
  return Math.max(listed, 1);
}

export function ensureEpisodeScript(project, ep) {
  if (!project.script[ep]) project.script[ep] = { title: '', scenes: [] };
  return project.script[ep];
}

/** 把任意条目转成一行文本：模型偶尔把 extras 输出成 {title, detail} 这类对象 */
export function lineText(item) {
  if (item == null) return '';
  if (typeof item === 'string' || typeof item === 'number') return String(item).trim();
  if (typeof item !== 'object') return String(item);
  const heads = ['title', 'label', 'name', 'key', 'heading'];
  const bodies = ['detail', 'description', 'desc', 'value', 'content', 'text', 'note'];
  const pick = (keys) => keys
    .map((k) => item[k])
    .find((v) => typeof v === 'string' && v.trim());
  const head = pick(heads);
  const body = pick(bodies);
  if (head && body) return `${head.trim()}：${body.trim()}`;
  if (head) return head.trim();
  const values = Object.values(item)
    .filter((v) => v != null && v !== '')
    .map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v).trim()))
    .filter(Boolean);
  return values.join(' · ');
}

export function ensureEpisodeShots(project, ep) {
  if (!project.board[ep]) project.board[ep] = { shots: [] };
  return project.board[ep];
}

export function assetList(project, type) {
  const map = { character: 'characters', scene: 'scenes', prop: 'props', standing: 'standings' };
  return project[map[type]] || [];
}

export function newCostume() {
  return {
    id: uid('cos'), name: '', episodes: '', material: '', palette: '',
    description: '', prompt: '', image: '',
  };
}

export function newAsset(type) {
  const base = { id: uid(type), name: '', description: '', prompt: '', image: '', locked: false };
  if (type === 'character') return { ...base, role: '', profile: '', ethnicity: '', language: '', voice: '', voiceAudio: '', costumes: [] };
  if (type === 'scene') return { ...base, location: '', lighting: '', landmark: '', style: '' };
  if (type === 'prop') return { ...base, usage: '', material: '', size: '', style: '' };
  return { ...base, episode: 1, shot: '', function: '', lighting: '', landmark: '', style: '' };
}

export function getByPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setByPath(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (cur[k] == null) cur[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
}
