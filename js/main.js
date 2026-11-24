import {
  state, load, save, currentProject, createProject, deleteProject, touch,
  touchLazy, flushSave, lineText,
  ensureEpisodeScript, ensureEpisodeShots, assetList, newAsset, newCostume,
  setByPath, episodeCount, uid, LLM_PROVIDERS,
} from './store.js';
import { initSkills, chooseSkill, composeSystem, skillLabel, listSkills, slotSkillInfo } from './skills.js';
import { streamChat, extractProposals, hasModel, testConnection, fetchModels, generateImage, generateAudio } from './agent.js';
import { testComfy } from './comfy.js';
import { buildDirectorPack } from './pack.js';
import {
  loadStatus, setWorkspace, pickDirectory, listProjects, getProject, putProject, saveMedia,
  deleteProject as deleteProjectOnDisk, savePack,
} from './server.js';
import {
  renderWelcome, renderWorkspace, renderShell, renderStage, renderChat, renderSettings, renderAssetCard,
  renderTopCenter, renderAssetGrid, renderShotCard, renderTransitionCard, renderShotList,
  renderSceneBlock, renderScriptSceneList, renderOutlineCharRows, renderEpisodeRows, esc,
  skillSlotOptionsHtml, renderChatMessage, renderProposalList, renderGenStatus,
} from './render.js';
import { SKILL_SLOTS } from './skills.js';

const app = document.getElementById('app');
let aborter = null;
let chatRunId = 0;
let pendingAction = '';
let pendingAsset = null;
let pendingCostume = null;

/** 聊天面板最多保留的消息条数：旧记录不再发给模型，留着只会拖慢面板渲染 */
const MAX_CHAT_MESSAGES = 60;
/** 自由对话带给模型的历史条数上限，避免上下文无限增长 */
const MAX_HISTORY_MESSAGES = 12;

const RUN_STAGE = {
  topic: 'topic', outline: 'outline', outlineCheck: 'outline',
  characterProfile: 'assets', characterGap: 'assets', characterPrompt: 'assets', costumePrompt: 'assets',
  sceneProfile: 'assets', sceneGap: 'assets', scenePrompt: 'assets', scenePlan: 'assets', sceneAngle: 'assets',
  propProfile: 'assets', propGap: 'assets', propPrompt: 'assets',
  standingProfile: 'assets', standingGap: 'assets', standingPrompt: 'assets',
  refLayout: 'assets', image: 'assets',
  scriptWrite: 'script', scriptRevise: 'script', scriptCheck: 'script',
  boardSplit: 'board', boardAdd: 'board', boardRevise: 'board', boardTransition: 'board',
  shotH3zh: 'prompts', shotH3en: 'prompts', frame: 'prompts', h3All: 'prompts',
};

const RUN_INSTRUCTION = {
  topic: '根据下面项目信息生成选题配置。若已有字段，保留有用的部分并补全空项。',
  outline: '生成完整创作大纲：一句话故事、梗概、Want/Need/缺陷、世界规则、三幕、节奏、爽点、结局、付费卡点、角色名单和全部分集摘要与看点。',
  outlineCheck: '对照原文与已生成的大纲，检查角色、时空、分集、结局与卡点是否一致，列出问题；需要修正时直接给出完整的大纲 JSON。',
  characterProfile: '补全当前角色卡的人物画像、身份锁、画风与音色说明。',
  characterGap: '对照选题、大纲、剧本和分镜，找出还没有角色卡的人物，一次性补齐角色卡。不要改已有角色。',
  characterPrompt: '按当前角色卡写定妆图提示词，写入该角色的 prompt 字段。',
  costumePrompt: '按当前角色的这套服装写服装出图提示词，写入这套服装的 prompt 字段。',
  sceneProfile: '补全当前场景卡：功能、灯光、地标、画风说明。',
  sceneGap: '找出还没有场景卡的地点并补齐场景卡。',
  scenePrompt: '按当前场景卡写场景生图提示词，写入 prompt 字段。',
  scenePlan: '根据平面图与场景信息，反推去顶俯视的场景提示词。',
  sceneAngle: '按用户要求，为同一场景写另一个角度的提示词。',
  propProfile: '补全当前道具卡的用途、材质与磨损、尺寸、画风。',
  propGap: '找出还没有道具卡的物件并补齐。',
  propPrompt: '按当前道具卡写道具生图提示词，写入 prompt 字段。',
  standingProfile: '补全当前站位卡：场次、分镜、叙事功能、光线、地标与画风。',
  standingGap: '找出还需要站位图的调度瞬间并补齐站位卡。',
  standingPrompt: '按当前站位卡写站位生图提示词，写入 prompt 字段。',
  refLayout: '按当前角色卡的站位要求，写角色空间占位图提示词。',
  image: '按当前提示词生成图片。',
  scriptWrite: '按已确认梗概写本集剧本：场次、动作、旁白、对白分行。',
  scriptRevise: '按改写要求修改当前场次，未点名的字段保持原意。',
  scriptCheck: '对照这一集原文，核对场次里的说话人、对白和动作，只改写错的行。',
  boardSplit: '把已确认剧本按转场拆成镜头，每镜写清时长、景别、运镜、画面与时间轴。',
  boardAdd: '通读本集分镜后，只在末尾追加一镜，不重写已有镜头。',
  boardRevise: '只修改当前这一镜的分镜设定，未点名的字段保持原意。',
  boardTransition: '为这一对相邻镜头写转场：首帧是上一镜尾帧，尾帧是下一镜首帧；结合两镜的环境、光线、人物位置与运动方向选合适技法。',
  shotH3zh: '为当前这一镜生成 MiniMax H3 中文视频提示词。',
  shotH3en: '为当前这一镜生成 MiniMax H3 英文视频提示词。',
  frame: '为当前这一镜写一张静帧的分镜图提示词。',
  h3All: '为本集每一镜写 H3 视频提示词与分镜图提示词，逐镜输出。',
};

/** 卡片上的「智能补充」映射；整页工具栏的不带 index，仍走全量补卡。 */
const CARD_FILL_TYPES = {
  characterGap: 'character',
  sceneGap: 'scene',
  propGap: 'prop',
  standingGap: 'standing',
};

const CARD_FILL_NOUN = { character: '角色卡', scene: '场景卡', prop: '道具卡', standing: '站位卡' };

/** 单卡智能补充改用各类型的「单卡补全」技能；gap 技能只负责发现并新建缺失卡。 */
const CARD_FILL_PROFILE = {
  character: 'characterProfile',
  scene: 'sceneProfile',
  prop: 'propProfile',
  standing: 'standingProfile',
};

function cardFillInstruction(type, name) {
  const noun = CARD_FILL_NOUN[type] || '资产卡';
  const who = name ? `「${name}」` : '';
  return `只补全当前这一张${noun}${who}，不要新建或改动其它${noun}。`
    + '从选题、大纲、剧本和分镜里找与该条目有关的描述，补满缺失字段；已有且正确的内容保持不变。'
    + `输出 JSON 里只放这一张${noun}。`;
}

/** 单卡补全时丢弃模型返回的其他条目，避免批量新建或覆盖别的卡。 */
function keepCurrentCardOnly(project, action, index, items, type) {
  if (CARD_FILL_TYPES[action] !== type || index == null) return items;
  const list = assetList(project, type);
  const current = list[Number(index)];
  const name = String(current?.name || '').trim();
  if (!name) return items;
  return (Array.isArray(items) ? items : []).filter((item) => String(item?.name || '').trim() === name);
}

function renderAll() {
  const p = currentProject();
  if (state.ui.screen === 'workspace') {
    app.innerHTML = renderWorkspace(state);
    return;
  }
  if (!p || state.ui.welcome) {
    app.innerHTML = renderWelcome(state);
    return;
  }
  app.innerHTML = renderShell(state, p, renderStage(state, p), renderChat(state, p))
    + (state.ui.settingsOpen ? renderSettings(state) : '');
  scrollChat();
  autoGrowShots();
}

/** 只替换 .main 的内容，保留顶栏、阶段栏和 Agent 面板 */
function renderMainOnly(resetScroll = false) {
  const p = currentProject();
  const main = document.querySelector('.main');
  if (!p || !main) return renderAll();
  const top = resetScroll ? 0 : main.scrollTop;
  main.innerHTML = renderStage(state, p);
  // 先撑开文本域再恢复滚动位置：否则新内容高度不足时 scrollTop 会被浏览器截断，
  // 随后文本域再变高，页面就停在偏上的位置。
  autoGrowShots();
  main.scrollTop = top;
}

/**
 * 提示词页切换镜头：复用现有面板，只改标题、描述与三个文本域的 value，
 * 不重建 DOM，避免长文本反复重排。
 * @returns {boolean} 找不到可复用的面板时返回 false，由调用方整体重绘
 */
function updatePromptPanel() {
  const p = currentProject();
  const main = document.querySelector('.main');
  const title = main ? main.querySelector('[data-prompt-title]') : null;
  if (!p || !main || !title) return false;
  const ep = Number(state.ui.episode) || 1;
  const shots = (p.board[ep] || { shots: [] }).shots || [];
  const shot = shots.find((s) => Number(s.no) === Number(state.ui.shotNo)) || shots[0];
  if (!shot) return false;
  const key = shot.id || String(shot.no);
  const data = p.prompts[key] || {};
  title.textContent = `第 ${shot.no} 镜`;
  const desc = main.querySelector('[data-prompt-desc]');
  if (desc) desc.textContent = shot.description || '';
  for (const name of ['h3zh', 'h3en', 'frame']) {
    const el = main.querySelector(`[data-prompt-field="${name}"]`);
    if (!el) return false;
    el.dataset.path = `prompts.${key}.${name}`;
    el.value = data[name] || '';
  }
  return true;
}

function renderChatOnly() {
  const box = document.querySelector('.agent');
  const p = currentProject();
  if (!box || !p) return;
  box.innerHTML = renderChat(state, p);
  scrollChat();
}

/** 清空聊天上下文：换阶段、换项目时调用，顺手停掉还在跑的旧请求 */
function resetChat(project, keepSkill = false) {
  if (aborter) aborter.abort();
  aborter = null;
  chatRunId += 1; // 旧请求的回包直接作废，不能写进新的对话
  const skillId = keepSkill ? state.ui.chat.skillId : defaultSkillForStage(project);
  state.ui.chat = { messages: [], skillId, busy: false, proposals: [] };
  renderChatOnly();
}

/** 动作消息只把任务行留在面板里；完整项目快照照常发给模型，避免聊天区被 JSON 撑大 */
function chatDisplayText(action, text) {
  if (!action) return text;
  const task = text.split('\n\n').find((p) => p.startsWith('任务：')) || '按技能要求执行。';
  if (action !== 'scriptRevise') return task;
  // 改写要求写在项目数据里，面板上单独提出来，避免用户看不到自己填的内容
  const revise = document.getElementById('reviseInput')?.value || '';
  return revise ? `${task}\n改写要求：${revise}` : task;
}

/** 追加一轮对话，不重建已有聊天记录（长对话下重排整段会很卡） */
function appendChatMessages(messages) {
  const log = document.getElementById('chatLog');
  if (!log) return false;
  log.querySelector('.chat-empty')?.remove();
  log.insertAdjacentHTML('beforeend', messages.map(renderChatMessage).join(''));
  return true;
}

/** 按消息 id 只替换一条消息 */
function patchChatMessage(msg) {
  if (!msg || !msg.id) return false;
  const node = document.querySelector(`[data-msg-id="${msg.id}"]`);
  if (!node) return false;
  node.outerHTML = renderChatMessage(msg);
  return true;
}

/** 只替换写入提案区 */
function patchProposalList(chat) {
  document.querySelector('.proposal-list')?.remove();
  const html = renderProposalList(chat);
  const log = document.getElementById('chatLog');
  if (html && log) log.insertAdjacentHTML('afterend', html);
}

/** 发送 / 停止按钮随 busy 状态切换，避免重绘整个 Agent 面板 */
function syncComposerButton(chat) {
  const btn = document.querySelector('.composer-actions [data-action="send-chat"], .composer-actions [data-action="stop-chat"]');
  if (!btn) return;
  const want = chat.busy ? 'stop-chat' : 'send-chat';
  if (btn.dataset.action === want) return;
  btn.outerHTML = chat.busy
    ? '<button class="btn btn-danger" data-action="stop-chat">停止</button>'
    : '<button class="btn btn-primary" data-action="send-chat">发送</button>';
}

/** 替换单张资产卡；卡片不存在时返回 false，由调用方降级重绘 */
function patchAssetCard(type, id) {
  const p = currentProject();
  if (!p || !id) return false;
  const list = assetList(p, type);
  const i = list.findIndex((a) => a.id === id);
  if (i < 0) return false;
  const node = document.querySelector(`.asset-card[data-card="${id}"]`);
  if (!node) return false;
  node.outerHTML = renderAssetCard(state, p, type, list[i], i);
  return true;
}

/** 增删资产后索引整体前移，只重排资产网格 */
function patchAssetGrid() {
  const p = currentProject();
  const grid = document.querySelector('.asset-grid');
  if (!p || !grid) return renderMainOnly(true);
  grid.innerHTML = renderAssetGrid(state, p);
  return true;
}

/** 替换单张镜头卡：改本镜服装角色、增删本镜服装都用它 */
function patchShotCard(i) {
  const p = currentProject();
  const node = document.querySelector(`.shot-card[data-shot="${i}"]`);
  if (!p || !node) return false;
  node.outerHTML = renderShotCard(state, p, i);
  autoGrowShots();
  return true;
}

/** 只刷新一张转场卡：填入 LLM 结果时不动整张分镜表，避免长页面跳动 */
function patchTransitionCard(i) {
  const p = currentProject();
  if (!p || !Number.isInteger(i) || i < 0) return false;
  const card = document.querySelector(`.transition-card[data-transition-card="${i}"]`);
  if (!card) return false;
  const epData = p.board[Number(state.ui.episode) || 1] || {};
  const shots = epData.shots || [];
  const a = shots[i];
  const b = shots[i + 1];
  if (!a || !b) return false;
  const cfg = (epData.transitions || []).find((t) => t.from === a.id && t.to === b.id) || {};

  const pickOption = (select, want) => {
    if (!select) return;
    const value = want || '';
    if (value && !Array.from(select.options).some((o) => o.value === value)) {
      select.insertAdjacentHTML('beforeend', `<option value="${esc(value)}">${esc(value)}</option>`);
    }
    select.value = value;
  };
  pickOption(card.querySelector('[data-transition-field="duration"]'), normalizeTransitionDuration(cfg.duration) || '1.6秒');
  pickOption(card.querySelector('[data-transition-field="technique"]'), cfg.technique || '');
  const prompt = card.querySelector('[data-transition-field="prompt"]');
  if (prompt) prompt.value = cfg.prompt || '';
  const toggle = card.querySelector('[data-transition-toggle]');
  if (toggle) toggle.checked = cfg.enabled !== false;
  card.classList.toggle('off', cfg.enabled === false);
  return true;
}

/** 写入提案后尽量只刷新受影响的一张卡；返回 false 时由调用方整页重绘 */
function patchProposalResult(p, project) {
  const kind = p.kind || '';
  if (kind === 'prompts') return updatePromptPanel();
  if (['characterPrompt', 'scenePrompt', 'propPrompt', 'standingPrompt'].includes(kind)) {
    const type = kind.replace('Prompt', '');
    const list = assetList(project, type);
    const name = String(p.data?.name || '').trim();
    const item = (name && list.find((a) => a.name === name))
      || (pendingAsset && pendingAsset.type === type ? list[pendingAsset.index] : null);
    return item ? patchAssetCard(type, item.id) : false;
  }
  if (kind === 'costumePrompt') {
    const list = assetList(project, 'character');
    let item = pendingAsset && pendingAsset.type === 'character' ? list[pendingAsset.index] : null;
    const name = String(p.data?.name || p.data?.costumeName || '').trim();
    if (!item && name) {
      item = list.find((c) => (c.costumes || []).some((x) => x.name && (x.name === name || name.includes(x.name))));
    }
    return item ? patchAssetCard('character', item.id) : false;
  }
  if (kind === 'transition') {
    const d = p.data.transition || p.data;
    const shots = (project.board[Number(d.episodeNumber || state.ui.episode || 1)] || {}).shots || [];
    const idx = d.index != null
      ? Number(d.index)
      : shots.findIndex((s, k) => s.id === d.fromShotId && shots[k + 1] && shots[k + 1].id === d.toShotId);
    return patchTransitionCard(idx);
  }
  return false;
}

/** 删镜后镜序与转场索引前移，只重排镜头列表 */
function patchShotList() {
  const p = currentProject();
  const list = document.querySelector('.shot-list');
  if (!p || !list) return renderMainOnly();
  list.innerHTML = renderShotList(state, p);
  autoGrowShots();
  return true;
}

/** 替换单个场次块：加对白、删对白只动这一块 */
function patchSceneBlock(si) {
  const p = currentProject();
  const node = document.querySelector(`.scene-block[data-scene-block="${si}"]`);
  if (!p || !node) return false;
  node.outerHTML = renderSceneBlock(state, p, si);
  return true;
}

/** 加删场次后场次索引前移，只重排场次列表 */
function patchScriptScenes() {
  const p = currentProject();
  const box = document.querySelector('.scene-list');
  if (!p || !box) return renderMainOnly();
  box.innerHTML = renderScriptSceneList(state, p);
  return true;
}

/** 大纲角色表 / 分集表增删一行，只重排对应表格 */
function patchOutlineRows(kind) {
  const p = currentProject();
  if (!p) return false;
  if (kind === 'char') {
    const tbody = document.querySelector('tbody[data-outline-chars]');
    if (!tbody) return renderMainOnly();
    tbody.innerHTML = renderOutlineCharRows(p);
    return true;
  }
  const tbody = document.querySelector('tbody[data-outline-eps]');
  if (!tbody) return renderMainOnly();
  tbody.innerHTML = renderEpisodeRows(p);
  const count = document.querySelector('[data-episode-count]');
  if (count) count.textContent = `共 ${episodeCount(p)} 集`;
  patchTopCenter();
  return true;
}

/** 顶栏中段含模式徽标与集数，写入提案或改集数后单独刷新 */
function patchTopCenter() {
  const p = currentProject();
  const box = document.querySelector('.top-center');
  if (!p || !box) return false;
  box.innerHTML = renderTopCenter(state, p);
  return true;
}

function patchModelDot() {
  const dot = document.querySelector('.model-dot');
  if (!dot) return;
  dot.classList.toggle('ok', !!state.settings.apiKey);
  dot.title = state.settings.apiKey ? '模型已配置' : '未配置模型';
}

/** 进入某个阶段、切换技能后同步左侧高亮、Agent 布局与技能名，不重建聊天 */
function syncStageChrome() {
  document.querySelectorAll('.rail-item[data-stage]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.stage === state.ui.stage);
  });
  document.querySelector('.layout')?.classList.toggle('chat-closed', !state.ui.chatOpen);
  const chatSkill = document.querySelector('.chat-skill select');
  if (chatSkill) chatSkill.value = state.ui.chat.skillId;
  const chatSkillName = document.querySelector('.chat-head .muted.small');
  if (chatSkillName) chatSkillName.textContent = skillLabel(state.ui.chat.skillId);
  document.querySelector('.proposal-list')?.remove();
}

/** 设置弹层只换自己，不动主区域和聊天 */
function refreshSettings() {
  const html = renderSettings(state);
  const exist = document.querySelector('.modal-mask');
  if (exist) exist.outerHTML = html;
  else app.insertAdjacentHTML('beforeend', html);
}

/** 切换流程默认技能后，就地刷新该流程的特性说明，避免整页重渲染。 */
function syncSkillDesc(path) {
  const slotKey = path.replace(/^skillDefaults\./, '');
  const desc = slotSkillInfo(slotKey, state.settings).description;
  document.querySelectorAll(`[data-skill-desc="${path}"]`).forEach((node) => {
    node.textContent = desc;
  });
}

function closeSettings() {
  document.querySelector('.modal-mask')?.remove();
}

function scrollChat() {
  const log = document.getElementById('chatLog');
  if (log) log.scrollTop = log.scrollHeight;
}

function toast(text, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function splitList(v, sep = /[、,，\n]/) {
  return String(v || '').split(sep).map((x) => x.trim()).filter(Boolean);
}

function splitLines(v) {
  return String(v || '').split(/\n/).map((x) => x.trim()).filter(Boolean);
}

/** 本镜服装统一成 { character, costume }，兼容旧字符串「角色：服装」 */
function toCostume(c) {
  if (typeof c !== 'string') return { character: c.character || '', costume: c.costume || '' };
  const [a, b] = c.split(/[:：]/).map((x) => x.trim());
  return b ? { character: a, costume: b } : { character: '', costume: a || '' };
}

/** 取一对相邻镜头的转场配置，create=true 时没有就新建（默认开启） */
function transitionEntry(epData, fromId, toId, create = false) {
  if (!Array.isArray(epData.transitions)) epData.transitions = [];
  let item = epData.transitions.find((t) => t.from === fromId && t.to === toId);
  if (!item && create) {
    item = { from: fromId, to: toId, enabled: true, duration: '1.6秒', technique: '', prompt: '' };
    epData.transitions.push(item);
  }
  return item;
}

/** 转场时长限制在 1.6–3 秒之间，兼容「1.6」「2.3秒」等写法；取不到秒数时返回空串 */
function normalizeTransitionDuration(value) {
  const m = /(\d+(?:\.\d+)?)/.exec(String(value || ''));
  if (!m) return '';
  const sec = Math.min(3, Math.max(1.6, Number(m[1])));
  return `${sec}秒`;
}

/** 把 beats 的一段转成「0–2秒：内容」 */
function beatLine(b) {
  if (b == null) return '';
  if (typeof b === 'string') return b.trim();
  const text = String(b.text || b.content || '').trim();
  if (!text) return '';
  if (b.start == null && b.end == null) return text;
  return `${b.start}–${b.end}秒：${text}`;
}

/** 把「0–2秒：内容」的时间轴文本解析回 beats，供提示词技能还原时间码 */
function parseTimelineBeats(text) {
  const out = [];
  String(text || '').split(/\n/).forEach((line) => {
    const m = /^\s*(\d+(?:\.\d+)?)\s*[–\-~至]\s*(\d+(?:\.\d+)?)\s*秒\s*[：:]\s*(.+)$/.exec(line);
    if (m) out.push({ start: Number(m[1]), end: Number(m[2]), text: m[3].trim() });
  });
  return out;
}

function currentChapterLabel(project) {
  return (project.outline.episodes || []).find((e) => Number(e.number) === Number(state.ui.episode))?.title || '';
}

/**
 * 资产卡转成给技能的简报：保留全部文字设定字段，
 * 只剔除 id、图片地址、音色音频这类运行时字段，以及已定稿的提示词正文。
 * 服装数组也压成纯文字，避免 base64 图片混进上下文。
 */
function assetBrief(asset) {
  const skip = new Set(['id', 'prompt', 'image', 'voiceAudio', 'locked']);
  const out = {};
  for (const [key, value] of Object.entries(asset || {})) {
    if (skip.has(key)) continue;
    if (value == null || value === '') continue;
    if (key === 'costumes' && Array.isArray(value)) {
      out.costumes = value.map((c) => ({
        name: c.name || '', episodes: c.episodes || '', material: c.material || '',
        palette: c.palette || '', description: c.description || '',
      }));
      continue;
    }
    out[key] = value;
  }
  return out;
}

function brief(project) {
  const ep = Number(state.ui.episode) || 1;
  return {
    project: project.name,
    mode: project.mode,
    topic: project.topic,
    outline: {
      ...project.outline,
      characters: project.outline.characters,
      episodes: project.outline.episodes,
    },
    assets: {
      characters: project.characters.map((a) => ({
        ...assetBrief(a),
        costumes: (a.costumes || []).map((c) => ({
          name: c.name, episodes: c.episodes, material: c.material || '',
          palette: c.palette || '', description: c.description || '',
        })),
      })),
      scenes: project.scenes.map(assetBrief),
      props: project.props.map(assetBrief),
      standings: project.standings.map(assetBrief),
    },
    episode: ep,
    episodeTitle: currentChapterLabel(project),
  };
}

function targetAsset(project, action, index) {
  const map = {
    characterProfile: 'character', characterPrompt: 'character', refLayout: 'character', costumePrompt: 'character',
    characterGap: 'character',
    sceneProfile: 'scene', scenePrompt: 'scene', sceneAngle: 'scene', scenePlan: 'scene',
    sceneGap: 'scene',
    propProfile: 'prop', propPrompt: 'prop',
    propGap: 'prop',
    standingProfile: 'standing', standingPrompt: 'standing',
    standingGap: 'standing',
  };
  const type = map[action];
  if (!type || index == null) return null;
  const list = assetList(project, type);
  const item = list[Number(index)];
  return item ? { type, index: Number(index), item } : null;
}

function buildUserMessage(action, project, index) {
  const parts = [];
  const target = targetAsset(project, action, index);
  if (target) {
    // 不带 image / voiceAudio 的 base64，也不把旧提示词带给要重写的动作；
    // 「换角度」例外：技能需要读当前主图提示词。
    const snapshot = assetBrief(target.item);
    if (action === 'sceneAngle') snapshot.prompt = target.item.prompt || '';
    parts.push('当前卡片：' + JSON.stringify(snapshot, null, 1));
  }
  if (target && action === 'costumePrompt' && pendingCostume != null) {
    const costume = (target.item.costumes || [])[Number(pendingCostume)];
    if (costume) parts.push('当前服装：' + JSON.stringify(assetBrief(costume), null, 1));
  }
  const data = brief(project);
  if (['topic', 'outline', 'outlineCheck'].includes(action) && project.mode === 'script') {
    data.sourceText = String(project.sourceText || '').slice(0, 12000);
  }
  if (['scriptWrite', 'scriptRevise', 'scriptCheck', 'boardSplit', 'boardAdd', 'boardRevise', 'boardTransition', 'shotH3zh', 'shotH3en', 'frame', 'h3All'].includes(action)) {
    const ep = Number(state.ui.episode) || 1;
    data.script = project.script[ep] || { scenes: [] };
    data.board = (project.board[ep] || { shots: [] }).shots;
    data.prompts = project.prompts;
    if (project.mode === 'script') data.sourceText = String(project.sourceText || '').slice(0, 12000);
    if (action === 'boardRevise' || action === 'shotH3zh' || action === 'shotH3en' || action === 'frame') {
      const list = data.board || [];
      let idx = index == null ? list.findIndex((s) => Number(s.no) === Number(state.ui.shotNo)) : Number(index);
      if (idx < 0) idx = 0;
      data.targetShot = list[idx] || null;
    }
    if (action === 'boardTransition') {
      const list = data.board || [];
      const idx = Number(index) || 0;
      const fromShot = list[idx] || null;
      const toShot = list[idx + 1] || null;
      const epData = project.board[ep] || {};
      data.transitionPair = {
        index: idx,
        fromShot,
        toShot,
        current: fromShot && toShot ? transitionEntry(epData, fromShot.id, toShot.id) : null,
      };
    }
  }
  if (['characterGap', 'sceneGap', 'propGap', 'standingGap'].includes(action)) {
    data.existing = {
      characters: project.characters.map((a) => a.name),
      scenes: project.scenes.map((a) => a.name),
      props: project.props.map((a) => a.name),
      standings: project.standings.map((a) => a.name),
    };
  }
  if (action === 'scriptRevise') {
    const extra = document.getElementById('reviseInput')?.value || '';
    if (extra) data.reviseRequest = extra;
  }
  parts.push('项目数据：\n' + JSON.stringify(data, null, 1));
  const fillType = CARD_FILL_TYPES[action];
  parts.push('任务：' + (target && fillType
    ? cardFillInstruction(fillType, String(target.item.name || ''))
    : (RUN_INSTRUCTION[action] || '按技能要求执行。')));
  return parts.join('\n\n');
}

async function runSkill(action, index) {
  const project = currentProject();
  if (!project) return;
  const stage = RUN_STAGE[action] || state.ui.stage;
  const stageChanged = stage !== state.ui.stage;
  // 上一次对话所属的阶段：只切 tab 不清记录，真正生成另一条流程时才清
  const prevChatStage = state.ui.chat.stage || '';
  state.ui.stage = stage;
  state.ui.chatOpen = true;
  pendingAction = action;
  pendingAsset = targetAsset(project, action, index);
  const fillType = CARD_FILL_TYPES[action];
  state.ui.chat.skillId = chooseSkill(
    fillType && index != null ? CARD_FILL_PROFILE[fillType] : action,
    project,
    state.settings,
  );
  state.ui.chat.proposals = [];
  // 技能可能切换阶段：同步左栏与 Agent 头部。同阶段的单卡操作不重建主区域，
  // 否则分镜、资产这类长页面会在点「生成提示词」「改这镜」时跳回顶部。
  syncStageChrome();
  if (stageChanged) renderMainOnly(true);
  if (stageChanged || (prevChatStage && prevChatStage !== stage)) {
    // 换流程启动生成时才清空旧对话；单纯切 tab 保留记录，方便回看
    resetChat(project, true);
  }
  const message = buildUserMessage(action, project, index);
  await sendChat(message, { action, index, stage });
}

async function sendChat(text, meta = {}) {
  const project = currentProject();
  if (!project || !String(text || '').trim()) return;
  const chat = state.ui.chat;
  const action = meta.action || pendingAction;
  const stage = meta.stage || state.ui.stage;
  const skillId = chat.skillId || chooseSkill(action || 'topic', project, state.settings);
  let system;
  try {
    system = await composeSystem(skillId, stage, project);
  } catch (e) {
    toast(e.message, 'error');
    return;
  }
  // 上一个动作还在流式输出时，新动作直接接管：先停旧请求，避免点击被吞掉
  if (chat.busy && aborter) aborter.abort();
  // 只记录动作类生成所属的阶段；自由对话不改变它，避免切 tab 闲聊后误判流程
  if (meta.action) chat.stage = stage;
  const runId = ++chatRunId;
  // 动作按钮每次只发当前任务：上一轮的输出会让模型照抄旧结构，也让新切换的技能失效；
  // 自由对话沿用同一技能的历史，但只带最近若干条，避免上下文和面板一起膨胀。
  const userMsg = { id: uid('m'), role: 'user', content: chatDisplayText(meta.action, text), skillId };
  const last = { id: uid('m'), role: 'assistant', content: '', reasoning: '', pending: true, skillId };
  chat.messages.push(userMsg, last);
  const trimmed = chat.messages.length > MAX_CHAT_MESSAGES;
  if (trimmed) chat.messages.splice(0, chat.messages.length - MAX_CHAT_MESSAGES);
  chat.busy = true;
  chat.proposals = [];
  pendingAction = '';
  document.querySelector('.proposal-list')?.remove();
  if (!trimmed && appendChatMessages([userMsg, last])) {
    syncComposerButton(chat);
    scrollChat();
  } else {
    renderChatOnly();
  }
  const history = meta.action
    ? [{ role: 'user', content: text }]
    : chat.messages
      .filter((m) => !m.pending && m.role !== 'system' && m.skillId === skillId)
      .slice(-MAX_HISTORY_MESSAGES)
      .map((m) => ({ role: m.role, content: m.content }));
  aborter = new AbortController();
  const signal = aborter.signal;
  // 流式增量很多，合并成约 200ms 一次刷新，且只更新当前这一条消息
  let flushTimer = null;
  const flushStream = () => {
    flushTimer = null;
    const box = document.querySelector(`[data-msg-id="${last.id}"]`);
    if (!box) return;
    const body = box.querySelector('.msg-body');
    if (body) body.innerHTML = window.__formatText(last.content) + (last.pending ? '<span class="cursor"></span>' : '');
    const think = box.querySelector('.think-body');
    if (think) {
      think.textContent = last.reasoning || '';
      think.scrollTop = think.scrollHeight;
    }
    scrollChat();
  };
  const scheduleFlush = () => {
    if (!flushTimer) flushTimer = setTimeout(flushStream, 200);
  };
  try {
    const full = await streamChat({
      system,
      messages: history,
      signal,
      onDelta(delta) {
        last.content += delta;
        scheduleFlush();
      },
      onReasoning(delta) {
        last.reasoning = (last.reasoning || '') + delta;
        scheduleFlush();
      },
    });
    last.content = full || last.content;
    last.pending = false;
    chat.proposals = extractProposals(last.content).map((p) => ({ ...p, action, index: meta.index }));
  } catch (e) {
    last.pending = false;
    if (e.name === 'AbortError') last.content += '\n\n（已停止）';
    else last.content += '\n\n**请求失败：**' + e.message;
  } finally {
    clearTimeout(flushTimer);
    flushTimer = null;
    const patched = patchChatMessage(last);
    if (runId === chatRunId) {
      chat.busy = false;
      aborter = null;
      if (!patched) {
        renderChatOnly();
      } else {
        patchProposalList(chat);
        syncComposerButton(chat);
        scrollChat();
      }
    }
  }
}

function findAsset(project, type, name) {
  return assetList(project, type).find((a) => a.name && a.name === name);
}

const ASSET_ALIAS = { voiceNotes: 'voice', sizeNote: 'size', styleNotes: 'style' };

function upsertAssets(project, type, items) {
  const list = assetList(project, type);
  const key = { character: 'characters', scene: 'scenes', prop: 'props', standing: 'standings' }[type];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const name = String(item.name || '').trim();
    if (!name) continue;
    let target = list.find((a) => a.name === name);
    if (!target) {
      target = newAsset(type);
      project[key].push(target);
    }
    for (const [k, v] of Object.entries(item)) {
      const fieldKey = ASSET_ALIAS[k] || k;
      if (['id', 'image'].includes(fieldKey)) continue;
      if (fieldKey === 'prompt' && !v) continue;
      if (v != null && v !== '') target[fieldKey] = v;
    }
  }
}

function applyProposal(kind, data, project, action = '', index = null) {
  if (!data || typeof data !== 'object') throw new Error('提案数据为空');
  const ep = Number(data.episodeNumber || state.ui.episode || 1);
  switch (kind) {
    case 'topic': {
      const d = data.topic || data;
      for (const k of ['title', 'audience', 'tone', 'ending', 'episodes', 'duration', 'language', 'visualStyle', 'direction']) {
        if (d[k] != null && d[k] !== '') project.topic[k] = d[k];
      }
      if (d.genres) project.topic.genres = (Array.isArray(d.genres) ? d.genres : splitList(d.genres)).map(lineText).filter(Boolean);
      if (d.extras) project.topic.extras = (Array.isArray(d.extras) ? d.extras : splitLines(d.extras)).map(lineText).filter(Boolean);
      if (!project.name || project.name === '未命名项目') project.name = project.topic.title || project.name;
      break;
    }
    case 'outline': {
      const d = data.outline || data;
      for (const k of ['logline', 'synopsis', 'want', 'need', 'flaw', 'worldRules', 'setting', 'act1', 'act2', 'act3', 'rhythm', 'highlights', 'ending', 'paywall']) {
        if (d[k] != null && d[k] !== '') project.outline[k] = d[k];
      }
      if (Array.isArray(d.characters)) {
        project.outline.characters = d.characters.map((c) => ({ name: c.name || '', role: c.role || '', description: c.description || '' }));
      }
      if (Array.isArray(d.episodes)) {
        project.outline.episodes = d.episodes.map((e, i) => ({
          number: Number(e.number || i + 1),
          title: e.title || '',
          synopsis: e.synopsis || '',
          logline: e.logline || '',
        })).sort((a, b) => a.number - b.number);
      }
      if (Array.isArray(d.characters) && d.characters.length) {
        upsertAssets(project, 'character', d.characters.map((c) => ({ name: c.name, role: c.role, description: c.description })));
      }
      break;
    }
    case 'costumePrompt': {
      const list = assetList(project, 'character');
      const dataName = data.name || data.costumeName || data.title || '';
      let owner = pendingAsset && pendingAsset.type === 'character' ? list[pendingAsset.index] : null;
      let costume = null;
      if (owner && pendingCostume != null) costume = (owner.costumes || [])[Number(pendingCostume)];
      if (!costume && dataName) {
        for (const c of list) {
          const hit = (c.costumes || []).find((x) => x.name && (x.name === dataName || dataName.includes(x.name)));
          if (hit) { owner = c; costume = hit; break; }
        }
      }
      if (!costume && owner) costume = (owner.costumes || [])[0];
      if (!costume) throw new Error('找不到对应的服装');
      costume.prompt = String(data.prompt || data.text || '').trim();
      break;
    }
    case 'characters': upsertAssets(project, 'character', keepCurrentCardOnly(project, action, index, Array.isArray(data) ? data : (data.characters || []), 'character'));
      break;
    case 'scenes': upsertAssets(project, 'scene', keepCurrentCardOnly(project, action, index, Array.isArray(data) ? data : (data.scenes || []), 'scene'));
      break;
    case 'props': upsertAssets(project, 'prop', keepCurrentCardOnly(project, action, index, Array.isArray(data) ? data : (data.props || []), 'prop'));
      break;
    case 'standings': upsertAssets(project, 'standing', keepCurrentCardOnly(project, action, index, Array.isArray(data) ? data : (data.standings || []), 'standing'));
      break;
    case 'characterPrompt':
    case 'scenePrompt':
    case 'propPrompt':
    case 'standingPrompt': {
      const type = kind.replace('Prompt', '');
      const list = assetList(project, type);
      const name = data.name || '';
      const target = (name && findAsset(project, type, name)) || (pendingAsset && pendingAsset.type === type ? list[pendingAsset.index] : null) || list[0];
      if (!target) throw new Error('找不到对应资产卡');
      target.prompt = String(data.prompt || data.text || data.negative || '').trim();
      break;
    }
    case 'script': {
      const d = data.script || data;
      const target = ensureEpisodeScript(project, Number(d.episodeNumber || ep));
      if (d.title) target.title = d.title;
      const rawScenes = d.scenes || d.sceneList || (Array.isArray(d) ? d : []);
      if (Array.isArray(rawScenes)) {
        target.scenes = rawScenes.map((s) => {
          const rawLines = Array.isArray(s.lines) ? s.lines : [];
          const actions = Array.isArray(s.actions) ? s.actions
            : rawLines.filter((l) => (l.type || (l.speaker ? 'dialogue' : 'action')) === 'action').map((l) => l.text || l.content || '').filter(Boolean);
          const narration = Array.isArray(s.narration) ? s.narration
            : rawLines.filter((l) => l.type === 'voiceover' || l.type === 'narration').map((l) => l.text || l.content || '').filter(Boolean);
          const dialogue = Array.isArray(s.lines)
            ? rawLines.filter((l) => (l.type || (l.speaker ? 'dialogue' : 'action')) === 'dialogue').map((l) => ({ speaker: l.speaker || '', text: l.text || l.content || '' }))
            : (Array.isArray(s.dialogues) ? s.dialogues : []);
          return {
            title: s.title || s.heading || '',
            location: s.location || s.place || '',
            time: s.time || '',
            actions,
            narration,
            lines: dialogue,
            durationSec: s.durationSec || s.duration || '',
          };
        });
      }
      if (Array.isArray(d.places)) {
        upsertAssets(project, 'scene', d.places.map((p) => ({
          name: p.name || p.place || '', description: p.description || '', location: p.location || p.name || '',
          lighting: p.lighting || '', landmark: p.landmark || '', style: p.style || '',
        })));
      }
      if (Array.isArray(d.props)) {
        upsertAssets(project, 'prop', d.props.map((p) => ({
          name: p.name || '', description: p.description || '', usage: p.usage || '',
          material: p.material || '', size: p.size || '', style: p.style || '',
        })));
      }
      break;
    }
    case 'board': {
      const d = data.board || data;
      const epNo = Number(d.episodeNumber || ep);
      const target = ensureEpisodeShots(project, epNo);
      const rawShots = d.shots || d.shotList || (Array.isArray(d) ? d : []);
      if (!Array.isArray(rawShots)) break;
      const mapShot = (s, i) => {
        const beats = (Array.isArray(s.beats) ? s.beats : []).map((b) => {
          const text = String(b.text || b.content || '').trim();
          const start = Number(b.start);
          const end = Number(b.end);
          return text ? { start: Number.isFinite(start) ? start : null, end: Number.isFinite(end) ? end : null, text } : null;
        }).filter(Boolean);
        const visual = Array.isArray(s.visual) ? s.visual.join('\n') : String(s.visual || '');
        // 技能输出的时间轴在 beats 数组里，转成「0–2秒：内容」一行一段
        const timeline = beats.length
          ? beats.map(beatLine).filter(Boolean).join('\n')
          : String(s.timeline || s.timeBeats || visual || '');
        // 没有结构化 beats 时，从时间轴文本反解，提示词技能仍能拿到起止秒数
        const shotBeats = beats.length ? beats : parseTimelineBeats(timeline);
        const firstBeat = beats[0] ? String(beats[0].text || '').trim() : '';
        const description = s.description || s.picture || s.action || firstBeat
          || visual.split('\n')[0].replace(/^\d+\s*[–-]\s*\d+秒：/, '') || '';
        const assets = Array.isArray(s.assets)
          ? s.assets.filter(Boolean)
          : (s.assets ? splitList(s.assets) : [...(s.characterNames || []), s.sceneName, ...(s.propNames || [])].filter(Boolean));
        return {
          id: s.id || uid('shot'),
          no: Number(s.no || s.shotNo || i + 1),
          duration: s.duration || (s.durationSec ? s.durationSec + '秒' : ''),
          shotSize: s.shotSize || s.shotType || s.size || '',
          camera: s.camera || s.cameraMove || s.movement || '',
          description,
          timeline,
          beats: shotBeats,
          dialogue: Array.isArray(s.dialogue) ? s.dialogue.join(' / ') : (s.dialogue || s.lines || ''),
          assets,
          costumes: Array.isArray(s.costumes)
            ? s.costumes.map(toCostume).filter((c) => c.character || c.costume)
            : [],
          // 分镜设定里影响后续提示词的字段一并保留，供提示词技能读取
          mode: s.mode || s.videoMode || '',
          soundscape: s.soundscape || '',
          voiceNames: Array.isArray(s.voiceNames) ? s.voiceNames : [],
          framePrompt: s.framePrompt || '',
          linkPrev: !!s.linkPrev,
          continuity: s.continuity || '',
          transition: s.transition || '',
        };
      };
      const mapped = rawShots.map(mapShot);

      // 拆分镜同时可能带回整集复用的场景/道具/站位，以及改镜时新增或变更的资产
      const typeAlias = { character: 'character', 角色: 'character', scene: 'scene', 场景: 'scene', prop: 'prop', 道具: 'prop', standing: 'standing', 站位: 'standing' };
      if (Array.isArray(d.characters)) upsertAssets(project, 'character', d.characters);
      if (Array.isArray(d.scenes)) upsertAssets(project, 'scene', d.scenes);
      if (Array.isArray(d.props)) upsertAssets(project, 'prop', d.props);
      if (Array.isArray(d.standings)) upsertAssets(project, 'standing', d.standings);
      if (Array.isArray(d.assetUpdates)) {
        for (const item of d.assetUpdates) {
          const type = typeAlias[item && item.type];
          if (!type) continue;
          upsertAssets(project, type, [item]);
        }
      }

      if (action === 'boardAdd') {
        // 加一镜：只在末尾追加，不碰已有镜头
        let nextNo = target.shots.reduce((max, s) => Math.max(max, Number(s.no) || 0), 0) + 1;
        for (const s of mapped) {
          s.no = nextNo++;
          target.shots.push(s);
        }
      } else if (action === 'boardRevise') {
        // 改这镜：只更新这一镜返回了值的字段，保留其余字段和编号
        const idx = index == null
          ? target.shots.findIndex((s) => Number(s.no) === Number(state.ui.shotNo))
          : Number(index);
        const cur = target.shots[idx];
        const raw = rawShots[0];
        if (cur && raw) {
          const next = mapped[0];
          for (const key of ['duration', 'shotSize', 'camera', 'description', 'timeline', 'mode', 'soundscape', 'framePrompt', 'continuity', 'transition']) {
            if (raw[key] != null) cur[key] = next[key];
          }
          if (raw.beats || raw.timeline != null) cur.beats = next.beats;
          if (raw.dialogue != null || raw.lines != null) cur.dialogue = next.dialogue;
          if (raw.assets || raw.characterNames || raw.sceneName || raw.propNames) cur.assets = next.assets;
          if (raw.costumes) cur.costumes = next.costumes;
          if (raw.voiceNames) cur.voiceNames = next.voiceNames;
          if (raw.linkPrev != null) cur.linkPrev = next.linkPrev;
        } else if (mapped[0]) {
          mapped[0].no = target.shots.length + 1;
          target.shots.push(mapped[0]);
        }
      } else {
        // 拆分镜：整集重写，旧镜头的转场配置一并作废
        target.shots = mapped;
        target.transitions = [];
      }
      break;
    }
    case 'transition': {
      const d = data.transition || data;
      const epData = ensureEpisodeShots(project, Number(d.episodeNumber || ep));
      const shots = epData.shots || [];
      const idx = d.index == null ? -1 : Number(d.index);
      const fromId = d.fromShotId || (shots[idx] || {}).id;
      const toId = d.toShotId || (shots[idx + 1] || {}).id;
      if (!fromId || !toId) break;
      const item = transitionEntry(epData, fromId, toId, true);
      if (d.technique) item.technique = d.technique;
      if (d.prompt) item.prompt = d.prompt;
      if (d.duration) item.duration = normalizeTransitionDuration(d.duration) || item.duration;
      item.enabled = true;
      break;
    }
    case 'prompts': {
      const d = data.prompts || data;
      const shots = project.board[Number(d.episodeNumber || ep)]?.shots || [];
      const write = (no, item) => {
        const shot = shots.find((s) => Number(s.no) === Number(no));
        const key = shot ? (shot.id || String(shot.no)) : String(no);
        const prev = project.prompts[key] || {};
        project.prompts[key] = {
          ...prev,
          // 本次没返回的语种保持旧稿，避免技能漏字段时把已有提示词清空
          h3zh: item.h3zh || item.h3 || item.zhPrompt || prev.h3zh || '',
          h3en: item.h3en || item.en || item.enPrompt || prev.h3en || '',
          frame: item.frame || item.framePrompt || item.imagePrompt || item.stillPrompt || prev.frame || '',
        };
      };
      if (Array.isArray(d.shots)) d.shots.forEach((item, i) => write(item.no ?? i + 1, item));
      else write(d.shotNo || d.no || 1, d);
      break;
    }
    default:
      throw new Error('未知提案类型：' + (kind || '空'));
  }
}

function download(name, content, type = 'application/json') {
  downloadBlob(name, new Blob([content], { type }));
}

function downloadBlob(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** 从磁盘重新读取项目列表（服务在线时） */
async function refreshProjectIndex() {
  if (!state.ui.serverOnline) return;
  try {
    state.ui.projectIndex = await listProjects();
  } catch (err) {
    console.warn('刷新项目列表失败：', err);
  }
}

/** 已删除的项目 ID：防止延迟写盘把刚删掉的项目又 PUT 回磁盘 */
const deletedProjectIds = new Set();

/** 把当前项目写回磁盘，返回是否成功 */
async function persistProject(project) {
  if (!state.ui.serverOnline || !project) return false;
  if (deletedProjectIds.has(project.id)) return false;
  try {
    await putProject(project);
    return true;
  } catch (err) {
    toast('保存到磁盘失败：' + err.message, 'error');
    return false;
  }
}

const genIdleTimers = {};

/** 左栏生成状态：只替换状态块，避免为一条状态重绘整页 */
function patchGenStatus() {
  const node = document.getElementById('railGen');
  if (node) node.innerHTML = renderGenStatus(state);
}

function genBegin(kind) {
  const g = state.ui.genStatus?.[kind];
  if (!g) return;
  g.busy += 1;
  g.title = '';
  clearTimeout(genIdleTimers[kind]);
  patchGenStatus();
}

function genEnd(kind, ok, message = '') {
  const g = state.ui.genStatus?.[kind];
  if (!g) return;
  g.busy = Math.max(0, g.busy - 1);
  if (!g.busy) {
    g.state = ok ? 'ok' : 'error';
    g.title = ok ? '' : String(message || '');
    clearTimeout(genIdleTimers[kind]);
    // 结果只保留几秒，随后回到空闲，避免左栏一直挂着旧提示
    genIdleTimers[kind] = setTimeout(() => {
      if (!g.busy) {
        g.state = 'idle';
        g.title = '';
        patchGenStatus();
      }
    }, 8000);
  }
  patchGenStatus();
}

/**
 * 把 ComfyUI 的临时输出地址转存到项目目录。
 * 不转存的话，ComfyUI 重启或清理临时目录后，资产图会全部裂掉、音频也会无法播放。
 */
async function persistMedia(project, url) {
  const src = String(url || '');
  if (!src || !state.ui.serverOnline || !project) return src;
  if (src.startsWith('data:') || src.startsWith('/api/media/')) return src;
  if (!/^https?:\/\//i.test(src)) return src;
  try {
    const saved = await saveMedia(project.id, src);
    return saved?.url || src;
  } catch (err) {
    console.warn('媒体转存失败，保留原地址：', err);
    return src;
  }
}

/** 音色试听文案按角色语种生成，避免英语/日语角色也用中文试听 */
function voiceSample(item) {
  const name = item?.name || '';
  const lang = String(item?.language || '');
  if (/英|english/i.test(lang)) return `Hi, I'm ${name || 'me'}. This is a voice sample.`;
  if (/日|japanese|日本語/i.test(lang)) return `こんにちは、${name || '私'}です。これは声のサンプルです。`;
  if (/韩|korean|한국어/i.test(lang)) return `안녕하세요, ${name || '나'}입니다. 목소리 샘플입니다.`;
  if (/粤|cantonese/i.test(lang)) return `你好，我係${name || '我'}，呢個係我把聲嘅試聽。`;
  return `你好，我是${name || '我'}，这是音色试听。`;
}

/** 打开旧项目时，把历史遗留的 ComfyUI 外链媒体补转存到本地 */
async function migrateRemoteMedia(project) {
  if (!state.ui.serverOnline || !project) return;
  const holders = [];
  for (const c of project.characters || []) {
    holders.push([c, 'image'], [c, 'voiceAudio']);
    for (const costume of c.costumes || []) holders.push([costume, 'image']);
  }
  for (const key of ['scenes', 'props', 'standings']) {
    for (const item of project[key] || []) holders.push([item, 'image']);
  }
  const jobs = holders.filter(([holder, key]) => /^https?:\/\//i.test(String(holder[key] || '')));
  if (!jobs.length) return;
  let fixed = 0;
  await Promise.all(jobs.map(async ([holder, key]) => {
    try {
      const saved = await saveMedia(project.id, holder[key]);
      if (saved?.url) {
        holder[key] = saved.url;
        fixed += 1;
      }
    } catch (err) {
      // ComfyUI 已关闭或文件已被清理时转存不了，保留原地址
    }
  }));
  if (!fixed) return;
  touch(project);
  await persistProject(project);
  if (state.ui.stage === 'assets') patchAssetGrid();
}

let diskTimer = null;

/** 失焦后延迟写盘，避免每敲一次都发请求 */
function flushDisk() {
  const p = currentProject();
  if (!state.ui.serverOnline || !p || deletedProjectIds.has(p.id)) return;
  clearTimeout(diskTimer);
  diskTimer = setTimeout(() => persistProject(p), 150);
}

/** 页面关闭/切后台时立即写盘 */
function flushDiskNow() {
  const p = currentProject();
  if (!state.ui.serverOnline || !p || deletedProjectIds.has(p.id)) return;
  clearTimeout(diskTimer);
  try {
    fetch('/api/projects/' + encodeURIComponent(p.id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
      keepalive: true,
    }).catch(() => {});
  } catch (err) {
    console.warn('写盘失败：', err);
  }
}

function exportMd(project) {
  const lines = [`# ${project.name}`, '', '## 选题'];
  for (const [k, v] of Object.entries(project.topic)) {
    if (v == null || v === '') continue;
    lines.push(`- ${k}: ${Array.isArray(v) ? v.join('、') : v}`);
  }
  lines.push('', '## 大纲');
  for (const [k, v] of Object.entries(project.outline)) {
    if (k === 'episodes' || k === 'characters' || v == null || v === '') continue;
    lines.push(`- ${k}: ${v}`);
  }
  lines.push('', '### 角色');
  for (const c of project.outline.characters) lines.push(`- ${c.name}（${c.role}）：${c.description}`);
  lines.push('', '### 分集');
  for (const e of project.outline.episodes) lines.push(`- 第 ${e.number} 集《${e.title}》：${e.synopsis} ｜ 看点：${e.logline}`);
  const types = [['characters', '角色'], ['scenes', '场景'], ['props', '道具'], ['standings', '站位']];
  for (const [key, label] of types) {
    if (!project[key].length) continue;
    lines.push('', `## 资产 · ${label}`);
    for (const a of project[key]) {
      lines.push(`### ${a.name || '未命名'}`);
      for (const [k, v] of Object.entries(a)) {
        if (['id', 'image', 'prompt', 'name', 'locked'].includes(k) || v === '' || v == null) continue;
        lines.push(`- ${k}: ${Array.isArray(v) ? v.join('、') : v}`);
      }
      if (a.prompt) lines.push('', '```', a.prompt, '```');
    }
  }
  for (const [ep, data] of Object.entries(project.script)) {
    lines.push('', `## 第 ${ep} 集剧本`);
    for (const s of data.scenes || []) {
      lines.push(`### ${s.title || '场次'}（${s.location || ''} ${s.time || ''}）`);
      for (const a of s.actions || []) lines.push(`- 动作：${a}`);
      for (const n of s.narration || []) lines.push(`- 旁白：${n}`);
      for (const l of s.lines || []) lines.push(`- ${l.speaker}：${l.text}`);
    }
  }
  for (const [ep, data] of Object.entries(project.board)) {
    lines.push('', `## 第 ${ep} 集分镜`);
    lines.push('| # | 时长 | 景别 | 运镜 | 画面 | 时间轴 | 对白 |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- |');
    for (const s of data.shots || []) {
      lines.push(`| ${s.no} | ${s.duration} | ${s.shotSize} | ${s.camera} | ${String(s.description || '').replace(/\n/g, ' ')} | ${String(s.timeline || '').replace(/\n/g, ' ')} | ${String(s.dialogue || '').replace(/\n/g, ' ')} |`);
    }
  }
  const promptEntries = Object.entries(project.prompts || {});
  if (promptEntries.length) {
    lines.push('', '## 镜头提示词');
    for (const [key, p] of promptEntries) {
      lines.push(`### 镜头 ${key}`, '', 'H3 中文：', '```', p.h3zh || '', '```', '', 'H3 英文：', '```', p.h3en || '', '```', '', '分镜图：', '```', p.frame || '', '```');
    }
  }
  download(`${project.name || 'AI视频导演助手项目'}.md`, lines.join('\n'), 'text/markdown');
}

function handlePathUpdate(target) {
  const path = target.dataset.path;
  const project = currentProject();
  if (!path) return;
  const raw = target.type === 'checkbox' ? target.checked : target.value;
  if (path.startsWith('settings.')) {
    setByPath(state.settings, path.slice('settings.'.length), target.type === 'number' ? Number(raw) : raw);
    touchLazy(null);
    return;
  }
  if (path.startsWith('ui.')) {
    const k = path.slice(3);
    state.ui[k] = /^\d+$/.test(String(raw)) ? Number(raw) : raw;
    if (k === 'shotNo' && !updatePromptPanel()) renderMainOnly();
    if (k === 'episode') {
      state.ui.shotNo = 1;
      renderMainOnly(true);
    }
    return;
  }
  if (!project) return;
  if (path === 'topic.genresText') {
    project.topic.genres = splitList(raw);
    touchLazy(project);
    return;
  }
  if (path === 'topic.extrasText') {
    project.topic.extras = splitLines(raw);
    touchLazy(project);
    return;
  }
  if (path.endsWith('.costumesText')) {
    setByPath(project, path.replace(/\.costumesText$/, '.costumes'), splitList(raw, /[；;、,，\n]/));
    touchLazy(project);
    return;
  }
  if (path.endsWith('.actionsText')) {
    setByPath(project, path.replace(/\.actionsText$/, '.actions'), splitLines(raw));
    touchLazy(project);
    return;
  }
  if (path.endsWith('.narrationText')) {
    setByPath(project, path.replace(/\.narrationText$/, '.narration'), splitLines(raw));
    touchLazy(project);
    return;
  }
  if (path.endsWith('.timeline')) {
    const shot = path.split('.').slice(0, -1).reduce((o, k) => (o == null ? o : o[k]), project);
    if (shot) shot.beats = parseTimelineBeats(raw);
    setByPath(project, path, raw);
    touchLazy(project);
    return;
  }
  const value = target.type === 'number' ? Number(raw) : raw;
  setByPath(project, path, value);
  touchLazy(project);
}

function defaultSkillForStage(project) {
  const map = { topic: 'topic', outline: 'outline', assets: 'characterProfile', script: 'scriptWrite', board: 'boardSplit', prompts: 'shotH3zh' };
  return chooseSkill(map[state.ui.stage] || 'topic', project, state.settings);
}

async function skillApi(path, options = {}) {
  const res = await fetch(path, options);
  let data = null;
  try {
    data = await res.json();
  } catch (err) {
    data = null;
  }
  if (!res.ok) throw new Error(data?.error || `请求失败（${res.status}）`);
  return data;
}

function splitSkillFrontmatter(text) {
  const lines = String(text || '').split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return { meta: {}, body: String(text || '') };
  const meta = {};
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      return { meta, body: lines.slice(i + 1).join('\n').trim() };
    }
    const idx = lines[i].indexOf(':');
    if (idx > 0) meta[lines[i].slice(0, idx).trim()] = lines[i].slice(idx + 1).trim();
  }
  return { meta: {}, body: String(text || '') };
}

function showSkillForm(slot, skill = {}) {
  const host = document.getElementById('skillFormHost');
  if (!host) return;
  host.innerHTML = `<div class="panel skill-form">
      <input type="hidden" id="skillFormId" value="${esc(skill.id || '')}" />
      <label class="field"><span>名称</span><input id="skillFormName" value="${esc(skill.name || '')}" placeholder="例如：电影感定妆" /></label>
      <label class="field"><span>归属流程</span><select id="skillFormSlot">${skillSlotOptionsHtml(skill.slot || slot || '')}</select></label>
      <label class="field"><span>说明</span><input id="skillFormDesc" value="${esc(skill.description || '')}" placeholder="一句话说明这个技能的特点，会显示在对应流程的技能说明里" /></label>
      <label class="field"><span>技能正文（Markdown）</span><textarea id="skillFormBody" rows="12" placeholder="写清输出结构、约束和禁止项">${esc(skill.body || '')}</textarea></label>
      <div class="toolbar">
        <button class="btn btn-sm btn-primary" data-action="skill-save">保存</button>
        <button class="btn btn-sm" data-action="skill-cancel">取消</button>
        <span class="muted small">保存后写入 skills-clean 目录，并自动设为该流程默认技能</span>
      </div>
    </div>`;
  document.getElementById('skillFormName')?.focus();
  host.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

async function saveSkillForm() {
  const id = document.getElementById('skillFormId')?.value || '';
  const name = document.getElementById('skillFormName')?.value.trim() || '';
  const slot = document.getElementById('skillFormSlot')?.value || '';
  const description = document.getElementById('skillFormDesc')?.value.trim() || '';
  const body = document.getElementById('skillFormBody')?.value.trim() || '';
  if (!name) return toast('请填写技能名称', 'error');
  if (!slot) return toast('请选择归属流程', 'error');
  if (!body) return toast('技能正文不能为空', 'error');
  const payload = { name, description, slot, stage: SKILL_SLOTS[slot]?.stage || '', body };
  try {
    const data = id
      ? await skillApi(`/api/skills/${encodeURIComponent(id)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      : await skillApi('/api/skills', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
    const skill = data.skill;
    state.settings.skillDefaults = state.settings.skillDefaults || {};
    state.settings.skillDefaults[slot] = skill.id;
    save();
    await initSkills();
    refreshSettings();
    toast(`已写入 skills-clean/${skill.id}/SKILL.md`);
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function editSkill(id) {
  if (!id) return;
  try {
    const data = await skillApi(`/api/skills/${encodeURIComponent(id)}/file`);
    const { meta, body } = splitSkillFrontmatter(data.content);
    showSkillForm(meta.slot || '', { ...meta, id, body });
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function exportSkill(id) {
  if (!id) return;
  try {
    const data = await skillApi(`/api/skills/${encodeURIComponent(id)}/file`);
    const blob = new Blob([data.content || ''], { type: 'text/markdown;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = data.filename || `${id}.md`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function removeSkill(id) {
  if (!id) return;
  if (!window.confirm('删除这个自定义技能？对应的 SKILL.md 目录会被移除。')) return;
  try {
    await skillApi(`/api/skills/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const defaults = state.settings.skillDefaults || {};
    Object.keys(defaults).forEach((key) => {
      if (defaults[key] === id) delete defaults[key];
    });
    save();
    await initSkills();
    refreshSettings();
    toast('技能已删除');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function onClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  const project = currentProject();
  const index = el.dataset.index != null ? Number(el.dataset.index) : null;

  switch (action) {
    case 'close-settings':
      if (el.classList.contains('modal-mask') && e.target !== el) return;
      state.ui.settingsOpen = false;
      save();
      closeSettings();
      return;
    case 'pick-workspace': {
      try {
        const picked = await pickDirectory();
        if (!picked || picked.cancelled) return;
        const path = String(picked.path || '').trim();
        if (!path) return;
        const data = await setWorkspace(path);
        state.ui.workspace = data.workspace || path;
        state.ui.projectIndex = data.projects || [];
        state.ui.screen = '';
        state.ui.welcome = true;
        state.projects = [];
        state.currentId = '';
        renderAll();
        toast('保存目录：' + state.ui.workspace);
      } catch (err) {
        toast(err.message || '打开目录选择框失败，请手动填写路径', 'error');
      }
      return;
    }
    case 'set-workspace': {
      const path = document.getElementById('workspacePath')?.value.trim();
      if (!path) {
        toast('请填写目录路径', 'error');
        return;
      }
      try {
        const data = await setWorkspace(path);
        state.ui.workspace = data.workspace || path;
        state.ui.projectIndex = data.projects || [];
        state.ui.screen = '';
        state.ui.welcome = true;
        state.projects = [];
        state.currentId = '';
        renderAll();
        toast('保存目录：' + state.ui.workspace);
      } catch (err) {
        toast(err.message, 'error');
      }
      return;
    }
    case 'change-workspace':
      state.ui.screen = 'workspace';
      renderAll();
      return;
    case 'create-project': {
      const name = document.getElementById('newProjectName')?.value.trim();
      const mode = document.getElementById('newProjectMode')?.value || 'original';
      const project = createProject(name || '未命名项目', mode);
      state.ui.welcome = false;
      state.ui.chat.skillId = chooseSkill('topic', project, state.settings);
      if (state.ui.serverOnline) {
        const ok = await persistProject(project);
        await refreshProjectIndex();
        renderAll();
        if (ok) toast('项目已保存到 ' + state.ui.workspace);
      } else {
        renderAll();
      }
      return;
    }
    case 'open-project': {
      const id = el.dataset.id;
      if (!state.ui.serverOnline) {
        state.currentId = id;
        state.ui.welcome = false;
        state.ui.chat = { messages: [], skillId: '', busy: false, proposals: [] };
        save();
        renderAll();
        return;
      }
      try {
        const loaded = await getProject(id);
        state.projects = [loaded];
        state.currentId = loaded.id;
        state.ui.welcome = false;
        state.ui.stage = 'topic';
        state.ui.episode = 1;
        state.ui.assetTab = 'character';
        state.ui.chat = { messages: [], skillId: defaultSkillForStage(loaded), busy: false, proposals: [] };
        renderAll();
        migrateRemoteMedia(loaded);
      } catch (err) {
        toast('读取项目失败：' + err.message, 'error');
      }
      return;
    }
    case 'new-project':
      state.ui.screen = '';
      state.ui.welcome = true;
      await refreshProjectIndex();
      renderAll();
      return;
    case 'delete-project': {
      if (!project) return;
      if (!confirm(`删除项目「${project.name}」？磁盘上的 project.json 会一并删除，不可恢复。`)) return;
      // 先拦住延迟写盘：刚失焦触发的 150ms 写盘会在删除后把项目重新 PUT 回磁盘
      deletedProjectIds.add(project.id);
      clearTimeout(diskTimer);
      diskTimer = null;
      if (state.ui.serverOnline) {
        try {
          await deleteProjectOnDisk(project.id);
        } catch (err) {
          deletedProjectIds.delete(project.id);
          toast('删除失败：' + err.message, 'error');
          return;
        }
      }
      deleteProject(project.id);
      state.ui.welcome = true;
      await refreshProjectIndex();
      renderAll();
      return;
    }
    case 'set-stage': {
      // 切 tab 只换高亮和内容，聊天记录保留；真正生成另一条流程时再清空
      state.ui.stage = el.dataset.stage;
      state.ui.chat.skillId = defaultSkillForStage(project);
      state.ui.chat.proposals = [];
      // 只更新左侧阶段高亮、阶段内容和 Agent 面板，避免整页重建：
      // 分镜 tab 文本域很多，整页重建 + 全量重排会明显卡顿。
      syncStageChrome();
      renderMainOnly(true);
      return;
    }
    case 'set-mode':
      if (!project) return;
      project.mode = el.dataset.mode;
      touch(project);
      // 模式切换在选题页底部，保留当前滚动位置，不把页面拉回顶部
      renderMainOnly();
      patchTopCenter();
      return;
    case 'asset-tab':
      state.ui.assetTab = el.dataset.tab;
      renderMainOnly(true);
      return;
    case 'add-asset': {
      if (!project) return;
      const type = el.dataset.type;
      assetList(project, type).push(newAsset(type));
      touch(project);
      patchAssetGrid();
      return;
    }
    case 'del-asset': {
      if (!project) return;
      const list = assetList(project, el.dataset.type);
      list.splice(Number(el.dataset.index), 1);
      touch(project);
      patchAssetGrid();
      return;
    }
    case 'add-costume': {
      if (!project) return;
      const character = assetList(project, 'character')[Number(el.dataset.index)];
      if (!character) return;
      if (!Array.isArray(character.costumes)) character.costumes = [];
      character.costumes.push(newCostume());
      touch(project);
      if (!patchAssetCard('character', character.id)) patchAssetGrid();
      return;
    }
    case 'del-costume': {
      if (!project) return;
      const character = assetList(project, 'character')[Number(el.dataset.index)];
      if (!character || !Array.isArray(character.costumes)) return;
      character.costumes.splice(Number(el.dataset.costume), 1);
      touch(project);
      if (!patchAssetCard('character', character.id)) patchAssetGrid();
      return;
    }
    case 'gen-costume-image': {
      if (!project) return;
      const character = assetList(project, 'character')[Number(el.dataset.index)];
      const costume = character && (character.costumes || [])[Number(el.dataset.costume)];
      if (!costume) return;
      if (!costume.prompt) return toast('先生成这套服装的提示词', 'error');
      toast('正在出图…');
      genBegin('image');
      try {
        costume.image = await persistMedia(project, await generateImage(costume.prompt));
        touch(project);
        flushDisk();
        if (!patchAssetCard('character', character.id)) patchAssetGrid();
        toast('服装图已写入');
        genEnd('image', true);
      } catch (err) {
        genEnd('image', false, err.message);
        toast(err.message, 'error');
      }
      return;
    }
    case 'add-outline-char':
      project.outline.characters.push({ name: '', role: '', description: '' });
      touch(project);
      if (!patchOutlineRows('char')) renderMainOnly();
      return;
    case 'del-outline-char':
      project.outline.characters.splice(index, 1);
      touch(project);
      if (!patchOutlineRows('char')) renderMainOnly();
      return;
    case 'add-episode-row':
      project.outline.episodes.push({ number: project.outline.episodes.length + 1, title: '', synopsis: '', logline: '' });
      touch(project);
      if (!patchOutlineRows('eps')) renderMainOnly();
      return;
    case 'del-episode-row':
      project.outline.episodes.splice(index, 1);
      touch(project);
      if (!patchOutlineRows('eps')) renderMainOnly();
      return;
    case 'add-scene': {
      if (!project) return;
      ensureEpisodeScript(project, Number(state.ui.episode) || 1).scenes.push({ title: '', location: '', time: '', actions: [], narration: [], lines: [] });
      touch(project);
      if (!patchScriptScenes()) renderMainOnly();
      return;
    }
    case 'del-scene':
      project.script[Number(state.ui.episode)].scenes.splice(index, 1);
      touch(project);
      if (!patchScriptScenes()) renderMainOnly();
      return;
    case 'add-line': {
      const scenes = project.script[Number(state.ui.episode)].scenes;
      const si = Number(el.dataset.scene);
      scenes[si].lines.push({ speaker: '', text: '' });
      touch(project);
      if (!patchSceneBlock(si)) renderMainOnly();
      return;
    }
    case 'del-line': {
      const scenes = project.script[Number(state.ui.episode)].scenes;
      const si = Number(el.dataset.scene);
      scenes[si].lines.splice(Number(el.dataset.line), 1);
      touch(project);
      if (!patchSceneBlock(si)) renderMainOnly();
      return;
    }
    case 'add-shot': {
      if (!project) return;
      const target = ensureEpisodeShots(project, Number(state.ui.episode) || 1);
      target.shots.push({ id: uid('shot'), no: target.shots.length + 1, duration: '', shotSize: '', camera: '', description: '', timeline: '', beats: [], dialogue: '', assets: [], costumes: [] });
      touch(project);
      const i = target.shots.length - 1;
      const list = document.querySelector('.shot-list');
      if (i === 0 || !list || list.querySelector('.empty-state')) {
        if (!patchShotList()) renderMainOnly();
      } else {
        // 追加一镜：在旧尾镜与新镜之间补一张转场卡
        list.insertAdjacentHTML('beforeend', renderTransitionCard(state, project, i - 1) + renderShotCard(state, project, i));
      }
      return;
    }
    case 'del-shot': {
      const target = ensureEpisodeShots(project, Number(state.ui.episode) || 1);
      const removed = target.shots[index];
      target.shots.splice(index, 1);
      if (removed && Array.isArray(target.transitions)) {
        target.transitions = target.transitions.filter((t) => t.from !== removed.id && t.to !== removed.id);
      }
      touch(project);
      if (!patchShotList()) renderMainOnly();
      return;
    }
    case 'add-shot-costume': {
      const target = ensureEpisodeShots(project, Number(state.ui.episode) || 1);
      const i = Number(el.dataset.index);
      const shot = target.shots[i];
      if (!shot) return;
      shot.costumes = (Array.isArray(shot.costumes) ? shot.costumes : []).map(toCostume);
      shot.costumes.push({ character: '', costume: '' });
      touch(project);
      if (!patchShotCard(i)) renderMainOnly();
      return;
    }
    case 'del-shot-costume': {
      const target = ensureEpisodeShots(project, Number(state.ui.episode) || 1);
      const i = Number(el.dataset.index);
      const shot = target.shots[i];
      if (!shot || !Array.isArray(shot.costumes)) return;
      shot.costumes.splice(Number(el.dataset.ci), 1);
      touch(project);
      if (!patchShotCard(i)) renderMainOnly();
      return;
    }
    case 'toggle-chat':
      state.ui.chatOpen = !state.ui.chatOpen;
      // 只是布局开关，改类即可，不重建主区域和聊天
      document.querySelector('.layout')?.classList.toggle('chat-closed', !state.ui.chatOpen);
      return;
    case 'open-settings':
      state.ui.settingsOpen = true;
      refreshSettings();
      return;
    case 'save-settings':
      save();
      state.ui.settingsOpen = false;
      closeSettings();
      patchModelDot();
      toast('设置已保存');
      return;
    case 'settings-tab':
      state.ui.settingsTab = el.dataset.tab;
      refreshSettings();
      return;
    case 'skill-new':
      showSkillForm(el.dataset.slot || '');
      return;
    case 'skill-cancel':
      document.getElementById('skillFormHost').innerHTML = '';
      return;
    case 'skill-save':
      await saveSkillForm();
      return;
    case 'skill-edit':
      await editSkill(el.dataset.id);
      return;
    case 'skill-export':
      await exportSkill(el.dataset.id);
      return;
    case 'skill-delete':
      await removeSkill(el.dataset.id);
      return;
    case 'skill-import':
      document.getElementById('skillImportFile')?.click();
      return;
    case 'test-settings': {
      const msg = document.getElementById('settingsMsg');
      if (msg) msg.textContent = '测试中…';
      const tab = state.ui.settingsTab || 'agent';
      try {
        if (tab === 'skills') {
          if (msg) msg.textContent = '技能管理无需连接测试';
        } else if (tab === 'agent') {
          const n = await testConnection();
          if (msg) msg.textContent = `连接成功，可用模型 ${n} 个`;
        } else {
          const info = await testComfy(state.settings[tab].server);
          if (msg) msg.textContent = info;
        }
      } catch (err) {
        if (msg) msg.textContent = err.message;
      }
      return;
    }
    case 'pick-model':
      state.settings.model = el.dataset.model || '';
      save();
      refreshSettings();
      return;
    case 'fetch-models': {
      const msg = document.getElementById('settingsMsg');
      if (msg) msg.textContent = '正在拉取模型列表…';
      try {
        const list = await fetchModels();
        state.ui.llmModels = list;
        refreshSettings();
        toast(`已获取 ${list.length} 个模型`);
      } catch (err) {
        if (msg) msg.textContent = err.message;
      }
      return;
    }
    case 'refresh-workflow':
      refreshSettings();
      return;
    case 'clear-workflow': {
      const kind = el.dataset.kind;
      state.settings[kind].workflow = '';
      state.settings[kind].promptRef = '';
      state.settings[kind].negativeRef = '';
      state.settings[kind].outputNode = '';
      state.ui.testResult[kind] = null;
      save();
      refreshSettings();
      return;
    }
    case 'test-comfy': {
      const kind = el.dataset.kind;
      const msg = document.getElementById(kind + 'TestMsg');
      if (msg) msg.textContent = '连接中…';
      try {
        const info = await testComfy(state.settings[kind].server);
        if (msg) msg.textContent = info;
      } catch (err) {
        if (msg) msg.textContent = err.message;
      }
      return;
    }
    case 'test-comfy-run': {
      const kind = el.dataset.kind;
      const msg = document.getElementById(kind + 'TestMsg');
      if (msg) msg.textContent = '正在运行工作流…';
      state.ui.testResult[kind] = null;
      save();
      genBegin(kind);
      try {
        const prompt = kind === 'image'
          ? 'cinematic portrait of a young woman, soft rim light, film still, detailed'
          : '这是一段 ComfyUI 音频工作流测试。';
        const url = kind === 'image' ? await generateImage(prompt) : await generateAudio(prompt);
        state.ui.testResult[kind] = { url };
        refreshSettings();
        genEnd(kind, true);
      } catch (err) {
        state.ui.testResult[kind] = { error: err.message };
        refreshSettings();
        genEnd(kind, false, err.message);
      }
      return;
    }
    case 'run':
      pendingCostume = el.dataset.costume == null ? null : Number(el.dataset.costume);
      await runSkill(el.dataset.run, index);
      return;
    case 'toggle-asset': {
      const id = el.dataset.id;
      if (!state.ui.assetOpen) state.ui.assetOpen = {};
      const prevId = Object.keys(state.ui.assetOpen)[0] || '';
      // 同时只展开一张卡，展开新的会收起其他
      state.ui.assetOpen = state.ui.assetOpen[id] ? {} : { [id]: true };
      if (!project) return;
      const type = state.ui.assetTab;
      const list = assetList(project, type);
      // 只重绘受影响的两张卡，其他卡（含图片和音频）原样保留
      for (const cardId of new Set([prevId, id])) {
        const i = list.findIndex((a) => a.id === cardId);
        if (i < 0) continue;
        const node = document.querySelector(`.asset-card[data-card="${cardId}"]`);
        if (node) node.outerHTML = renderAssetCard(state, project, type, list[i], i);
      }
      return;
    }
    case 'gen-voice': {
      if (!project) return;
      const item = assetList(project, 'character')[Number(el.dataset.index)];
      if (!item) return;
      if (!item.voice) return toast('先填音色说明', 'error');
      toast('正在生成音色试听…');
      genBegin('audio');
      try {
        // 工作流里的 voice_instruction 是示例文案，必须按角色改写，否则所有人都是同一个声音
        const sample = voiceSample(item);
        item.voiceAudio = await persistMedia(project, await generateAudio(sample, { voice: item.voice }));
        touch(project);
        flushDisk();
        if (!patchAssetCard('character', item.id)) patchAssetGrid();
        toast('音色试听已生成');
        genEnd('audio', true);
      } catch (err) {
        genEnd('audio', false, err.message);
        toast(err.message, 'error');
      }
      return;
    }
    case 'gen-image': {
      if (!project) return;
      const type = el.dataset.type;
      const list = assetList(project, type);
      const item = list[Number(el.dataset.index)];
      if (!item || !item.prompt) return toast('先生成提示词', 'error');
      toast(`正在出图（提示词 ${String(item.prompt).length} 字）…`);
      genBegin('image');
      try {
        item.image = await persistMedia(project, await generateImage(item.prompt));
        touch(project);
        flushDisk();
        if (!patchAssetCard(type, item.id)) patchAssetGrid();
        toast('图片已写入');
        genEnd('image', true);
      } catch (err) {
        genEnd('image', false, err.message);
        toast(err.message, 'error');
      }
      return;
    }
    case 'send-chat': {
      const input = document.getElementById('chatInput');
      const text = input?.value || '';
      if (!text.trim()) return;
      input.value = '';
      await sendChat(text);
      return;
    }
    case 'stop-chat':
      if (aborter) aborter.abort();
      return;
    case 'clear-chat':
      resetChat(project);
      return;
    case 'apply-proposal': {
      const p = state.ui.chat.proposals[index];
      if (!p || !p.data) return;
      try {
        applyProposal(p.kind, p.data, project, p.action, p.index);
        touch(project);
        state.ui.chat.proposals = [];
        document.querySelector('.proposal-list')?.remove();
        // 提案可能改项目名、集数或当前阶段数据：只刷新顶栏与受影响区域，保留聊天和滚动位置
        patchTopCenter();
        if (!patchProposalResult(p, project)) renderMainOnly();
        toast('已写入草稿');
      } catch (err) {
        toast(err.message, 'error');
      }
      return;
    }
    case 'copy-proposal': {
      const p = state.ui.chat.proposals[index];
      if (p) navigator.clipboard?.writeText(p.raw).then(() => toast('已复制'), () => toast('复制失败', 'error'));
      return;
    }
    case 'export-json':
      if (project) download(`${project.name || 'project'}.json`, JSON.stringify(project, null, 2));
      return;
    case 'export-pack': {
      const packProject = project || currentProject();
      if (!packProject) return;
      const ep = Number(state.ui.episode) || 1;
      toast('正在打包导演包…');
      try {
        const { blob, filename, warnings, transitions } = await buildDirectorPack(packProject, ep);
        let savedPath = '';
        if (state.ui.serverOnline) {
          try {
            savedPath = await savePack(filename, blob);
          } catch (err) {
            console.warn('导演包写入磁盘失败：', err);
          }
        }
        const extra = transitions ? `，含 ${transitions} 条转场` : '';
        if (savedPath) {
          toast(warnings.length
            ? `导演包已保存到 ${savedPath}${extra}，${warnings.length} 条提醒（详见控制台）`
            : `导演包已保存到 ${savedPath}${extra}`);
        } else {
          downloadBlob(filename, blob);
          toast(warnings.length ? `导演包已导出${extra}，${warnings.length} 条提醒（详见控制台）` : `导演包已导出${extra}`);
        }
        if (warnings.length) console.warn('导演包提醒：', warnings);
      } catch (err) {
        toast(err.message, 'error');
      }
      return;
    }
    case 'export-md':
      if (project) exportMd(project);
      return;
    case 'zoom-image':
      openLightbox(el.currentSrc || el.src);
      return;
    case 'toggle-audio': {
      const box = el.closest('.voice-player');
      const audio = box?.querySelector('audio');
      if (!audio) return;
      if (audio.paused) {
        document.querySelectorAll('audio').forEach((a) => { if (a !== audio) a.pause(); });
        audio.play().catch((err) => toast('无法播放：' + err.message, 'error'));
      } else {
        audio.pause();
      }
      return;
    }
    case 'seek-audio': {
      const audio = el.closest('.voice-player')?.querySelector('audio');
      if (!audio || !audio.duration) return;
      const rect = el.getBoundingClientRect();
      const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
      audio.currentTime = ratio * audio.duration;
      return;
    }
    default:
      return;
  }
}

function fmtTime(sec) {
  if (!Number.isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

/** 自绘音色播放控件的状态同步（媒体事件不冒泡，用捕获） */
function onMediaEvent(e) {
  const audio = e.target;
  if (!audio || audio.tagName !== 'AUDIO') return;
  const box = audio.closest('.voice-player');
  if (!box) return;
  const btn = box.querySelector('.voice-play');
  const bar = box.querySelector('.voice-bar');
  const time = box.querySelector('.voice-time');
  if (btn) btn.textContent = audio.paused ? '▶' : '❚❚';
  if (bar) bar.style.width = (audio.duration ? (audio.currentTime / audio.duration) * 100 : 0) + '%';
  if (time) time.textContent = fmtTime(audio.duration ? audio.currentTime : 0);
}

['play', 'pause', 'timeupdate', 'ended', 'loadedmetadata'].forEach((type) => {
  document.addEventListener(type, onMediaEvent, true);
});

function openLightbox(src) {
  if (!src) return;
  let box = document.getElementById('lightbox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'lightbox';
    box.className = 'lightbox';
    box.innerHTML = '<img alt="" />';
    box.addEventListener('click', () => box.classList.remove('open'));
    document.body.appendChild(box);
  }
  box.querySelector('img').src = src;
  box.classList.add('open');
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.getElementById('lightbox')?.classList.remove('open');
});

document.addEventListener('click', onClick);

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 1024;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片读取失败'));
    };
    img.src = url;
  });
}

function readAudioFile(file) {
  if (file.size > 1.5 * 1024 * 1024) {
    return Promise.reject(new Error('音频超过 1.5MB，浏览器本地存储放不下，请先压缩'));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('音频读取失败'));
    reader.readAsDataURL(file);
  });
}

document.addEventListener('input', (e) => {
  // select 同时触发 input 与 change，统一交给 change 处理，避免重复执行
  if (e.target.matches('select[data-path]')) return;
  if (e.target.matches('[data-settings-path]')) {
    const path = e.target.dataset.settingsPath;
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setByPath(state.settings, path, v);
    return;
  }
  if (e.target.matches('[data-path]')) {
    handlePathUpdate(e.target);
    if (e.target.matches('.shot-body textarea')) autoGrow(e.target);
  }
  if (e.target.matches('[data-transition-field]')) {
    const project = currentProject();
    if (!project) return;
    const epData = ensureEpisodeShots(project, Number(state.ui.episode) || 1);
    const shots = epData.shots || [];
    const idx = Number(e.target.dataset.index);
    const a = shots[idx];
    const b = shots[idx + 1];
    if (!a || !b) return;
    const item = transitionEntry(epData, a.id, b.id, true);
    const field = e.target.dataset.transitionField;
    item[field] = field === 'duration' ? normalizeTransitionDuration(e.target.value) : e.target.value;
    // 与其它长文本一致：输入时只防抖保存，change / focusout 时再整体落盘
    touchLazy(project);
  }
});

/** 分镜卡片里的长文本域按内容撑开，避免内部滚动 */
const supportsFieldSizing = typeof CSS !== 'undefined' && !!CSS.supports?.('field-sizing', 'content');

function autoGrow(el) {
  // 浏览器原生 field-sizing: content 已能按内容自适应，无需再量高度
  if (supportsFieldSizing) return;
  el.style.height = 'auto';
  // scrollHeight 不含边框，补上上下边框，否则会留出 2px 滚动条
  el.style.height = (el.scrollHeight + el.offsetHeight - el.clientHeight) + 'px';
}

function autoGrowShots() {
  // 与 content-visibility: auto 配合：跳过的卡片里 scrollHeight 为 0，
  // 保持行高、等进入视口渲染后再由浏览器自适应。
  if (supportsFieldSizing) return;
  const els = Array.from(document.querySelectorAll('.shot-body textarea'));
  if (!els.length) return;
  // 先统一置 auto，再统一读高度、统一写回：只触发 1~2 次布局，
  // 避免逐个 textarea 读写导致 O(N) 次强制重排（分镜多时切换 tab 会卡）。
  for (const el of els) el.style.height = 'auto';
  const heights = els.map((el) => {
    const h = el.scrollHeight;
    return h > 0 ? h + (el.offsetHeight - el.clientHeight) : 0;
  });
  els.forEach((el, i) => {
    el.style.height = heights[i] > 0 ? heights[i] + 'px' : '';
  });
}

document.addEventListener('change', async (e) => {
  if (e.target.id === 'skillImportFile') {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const content = await file.text();
      const slot = document.getElementById('skillImportSlot')?.value || '';
      const data = await skillApi('/api/skills/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, slot }),
      });
      await initSkills();
      refreshSettings();
      toast(`已导入 ${data.skill.id}`);
    } catch (err) {
      toast(err.message, 'error');
    }
    return;
  }
  if (e.target.matches('[data-settings-path]')) {
    const path = e.target.dataset.settingsPath;
    handlePathUpdate({ dataset: { path: 'settings.' + path }, type: e.target.type, value: e.target.value, checked: e.target.checked });
    if (path.startsWith('skillDefaults.')) syncSkillDesc(path);
    return;
  }
  const el = e.target;
  if (el.matches('[data-transition-toggle]')) {
    const project = currentProject();
    if (!project) return;
    const epData = ensureEpisodeShots(project, Number(state.ui.episode) || 1);
    const shots = epData.shots || [];
    const idx = Number(el.dataset.transitionToggle);
    const a = shots[idx];
    const b = shots[idx + 1];
    if (!a || !b) return;
    transitionEntry(epData, a.id, b.id, true).enabled = el.checked;
    // 只切换本卡样式，避免整页重渲染导致开关卡顿
    el.closest('.transition-card')?.classList.toggle('off', !el.checked);
    // 延后落盘：项目 JSON 很大，同步写 localStorage 会卡住开关
    touchLazy(project);
    return;
  }
  if (el.matches('[data-shot-role]')) {
    const project = currentProject();
    if (!project) return;
    const target = ensureEpisodeShots(project, Number(state.ui.episode) || 1);
    const shot = target.shots[Number(el.dataset.shotRole)];
    if (!shot) return;
    shot.costumes = (Array.isArray(shot.costumes) ? shot.costumes : []).map(toCostume);
    const item = shot.costumes[Number(el.dataset.ci)];
    if (!item) return;
    item.character = el.value;
    item.costume = '';
    touch(project);
    const i = Number(el.dataset.shotRole);
    if (!patchShotCard(i)) renderMainOnly();
    return;
  }
  if (el.matches('[data-shot-costume]')) {
    const project = currentProject();
    if (!project) return;
    const target = ensureEpisodeShots(project, Number(state.ui.episode) || 1);
    const shot = target.shots[Number(el.dataset.shotCostume)];
    if (!shot) return;
    shot.costumes = (Array.isArray(shot.costumes) ? shot.costumes : []).map(toCostume);
    const item = shot.costumes[Number(el.dataset.ci)];
    if (!item) return;
    item.costume = el.value;
    touch(project);
    return;
  }
  if (el.matches('select[data-action="set-provider"]')) {
    const provider = LLM_PROVIDERS.find((p) => p.id === el.value);
    state.settings.provider = el.value;
    state.ui.llmModels = [];
    if (provider && provider.id !== 'custom') {
      state.settings.baseUrl = provider.baseUrl;
      if (provider.models[0]) state.settings.model = provider.models[0];
    }
    save();
    refreshSettings();
    return;
  }
  if (el.matches('input[type="file"][data-workflow-kind]')) {
    const kind = el.dataset.workflowKind;
    const file = el.files && el.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      state.settings[kind].workflow = text;
      state.settings[kind].promptRef = '';
      state.settings[kind].negativeRef = '';
      state.settings[kind].outputNode = '';
      save();
      refreshSettings();
      toast('工作流已导入');
    } catch (err) {
      toast('读取文件失败：' + err.message, 'error');
    }
    return;
  }
  if (el.matches('input[type="file"][data-upload]')) {
    const file = el.files && el.files[0];
    if (!file) return;
    const project = currentProject();
    if (!project) return;
    const type = el.dataset.type;
    const item = assetList(project, type).find((x) => x.id === el.dataset.id);
    if (!item) return;
    const costume = el.dataset.costume == null ? null
      : (item.costumes || []).find((c) => c.id === el.dataset.costume);
    if (el.dataset.costume != null && !costume) return;
    try {
      if (el.dataset.upload === 'image') {
        const value = await readImageFile(file);
        if (costume) costume.image = value; else item.image = value;
      } else {
        item.voiceAudio = await readAudioFile(file);
      }
      touch(project);
      flushDisk();
      if (!patchAssetCard(type, item.id)) patchAssetGrid();
      toast(el.dataset.upload === 'image' ? '图片已上传' : '音频已上传');
    } catch (err) {
      toast(err.message, 'error');
    }
    return;
  }
  if (el.matches('select[data-action="switch-project"]')) {
    const id = el.value;
    if (state.ui.serverOnline) {
      try {
        flushDiskNow();
        const loaded = await getProject(id);
        state.projects = [loaded];
        state.currentId = loaded.id;
        state.ui.stage = 'topic';
        state.ui.episode = 1;
        state.ui.chat = { messages: [], skillId: defaultSkillForStage(loaded), busy: false, proposals: [] };
        renderAll();
        migrateRemoteMedia(loaded);
      } catch (err) {
        toast('切换项目失败：' + err.message, 'error');
        renderAll();
      }
      return;
    }
    state.currentId = id;
    state.ui.chat = { messages: [], skillId: '', busy: false, proposals: [] };
    state.ui.episode = 1;
    save();
    renderAll();
    return;
  }
  if (el.matches('select[data-action="set-chat-skill"]')) {
    state.ui.chat.skillId = el.value;
    // 只换技能名，不重建聊天记录
    const chatSkillName = document.querySelector('.chat-head .muted.small');
    if (chatSkillName) chatSkillName.textContent = skillLabel(state.ui.chat.skillId);
    return;
  }
  if (el.matches('select[data-path]')) {
    // 切换集数或镜头只影响舞台区，handlePathUpdate 内部已局部重绘，这里不再重复全量重绘
    handlePathUpdate(el);
  }
});

document.addEventListener('change', (e) => {
  // 转场开关是大项目里最频繁的轻交互：跳过同步 localStorage 全量写入，
  // 只做防抖写盘；真实落盘由下一次 change / focusout / pagehide 的 flushSave 完成。
  if (e.target?.matches?.('[data-transition-toggle]')) {
    flushDisk();
    return;
  }
  flushSave();
  flushDisk();
});
document.addEventListener('focusout', () => {
  flushSave();
  flushDisk();
});
window.addEventListener('pagehide', () => {
  flushSave();
  flushDiskNow();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    flushSave();
    flushDiskNow();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.target.id === 'chatInput' && e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    document.querySelector('[data-action="send-chat"]')?.click();
  }
});

async function boot() {
  load();
  try {
    await initSkills();
  } catch (e) {
    app.innerHTML = `<div class="fatal">技能加载失败：${esc(e.message)}<br/>请确认通过静态服务器访问（例如 python3 server.py），不要直接双击打开文件。</div>`;
    return;
  }
  window.__formatText = (await import('./render.js')).formatText;

  const status = await loadStatus();
  if (status) {
    state.ui.serverOnline = true;
    state.ui.workspace = status.workspace || '';
    state.ui.workspaceSuggested = status.suggested || '';
  }

  if (state.ui.serverOnline && !state.ui.workspace) {
    state.ui.screen = 'workspace';
    renderAll();
    return;
  }

  if (state.ui.serverOnline) {
    // 每次进入先让用户选项目：内存里不保留上次打开的项目
    state.projects = [];
    state.currentId = '';
    state.ui.welcome = true;
    await refreshProjectIndex();
  } else {
    const p = currentProject();
    if (p) state.ui.chat.skillId = defaultSkillForStage(p);
  }
  renderAll();
}

boot();
