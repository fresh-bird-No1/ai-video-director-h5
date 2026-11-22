import { STAGES, episodeCount, assetList, LLM_PROVIDERS, lineText } from './store.js';
import {
  skillLabel, skillMeta, listSkills, SKILL_SLOTS, slotCandidates,
  defaultSkillFor, skillShortLabel, slotSkillInfo, MODE_DRIVEN_DESC, skillsApiAvailable,
} from './skills.js';
import { proposalLabel } from './agent.js';
import { analyzeWorkflow } from './comfy.js';

export function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function val(v) { return esc(v == null ? '' : v); }

/** 固定枚举：与技能里的取值保持一致，历史项目的自定义值会保留在选项末尾 */
const SHOT_SIZES = ['大远景', '远景', '全景', '中景', '近景', '特写', '大特写'];
const CAMERA_MOVES = ['固定', '摇', '移', '跟', '推', '拉', '升降', '手持'];
const CHARACTER_ROLES = ['女主', '男主', '反派', '配角', '功能角色'];
const SCENE_TIMES = ['日', '夜', '清晨', '上午', '午后', '傍晚', '黄昏', '深夜'];
const TRANSITION_TECHS = [
  '动作衔接', '同向运镜', '轻微虚焦', '甩镜', '前景遮挡', '相似构图匹配',
  '光线渐变', '天色变化', '溶解', '黑场', '白闪', '快速推近', '失焦', '色温突变',
];
const TRANSITION_DURATIONS = ['1.6秒', '2.3秒', '3秒'];

/** 旧项目里可能还存着 0.8–1.5 秒的转场，按新下限归一，避免卡片显示与导出一致性不符 */
function normalizeTransitionDuration(value) {
  const m = /(\d+(?:\.\d+)?)/.exec(String(value || ''));
  if (!m) return '1.6秒';
  return `${Math.min(3, Math.max(1.6, Number(m[1])))}秒`;
}

/** 选项列表；value 不在列表里时补在末尾，避免旧项目的自定义写法被清空 */
function optionsHtml(list, value, placeholder) {
  const cur = String(value == null ? '' : value);
  const items = cur && !list.includes(cur) ? [...list, cur] : list;
  const head = placeholder != null
    ? `<option value="" ${cur ? '' : 'selected'}>${esc(placeholder)}</option>`
    : '';
  return head + items.map((v) => `<option value="${val(v)}" ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('');
}

export function field(label, path, value, opts = {}) {
  const type = opts.type || 'text';
  const labelHtml = `${esc(label)}${opts.hint ? ` <i class="hint" tabindex="0" data-tip="${val(opts.hint)}" aria-label="${val(opts.hint)}">!</i>` : ''}`;
  if (type === 'textarea') {
    return `<label class="field ${opts.wide ? 'wide' : ''}"><span>${labelHtml}</span>
      <textarea data-path="${path}"${opts.name ? ` data-prompt-field="${val(opts.name)}"` : ''} rows="${opts.rows || 3}" placeholder="${val(opts.placeholder)}">${val(value)}</textarea></label>`;
  }
  if (type === 'select') {
    return `<label class="field ${opts.wide ? 'wide' : ''}"><span>${labelHtml}</span>
      <select data-path="${path}">${optionsHtml(opts.options || [], value, opts.placeholder)}</select></label>`;
  }
  return `<label class="field ${opts.wide ? 'wide' : ''}"><span>${labelHtml}</span>
    <input type="${type}" data-path="${path}" value="${val(value)}" placeholder="${val(opts.placeholder)}" ${opts.list ? `list="${opts.list}"` : ''} ${opts.min != null ? `min="${opts.min}"` : ''} /></label>`;
}

export function stageHead(title, desc, actions = '') {
  return `<div class="stage-head"><div><h1>${esc(title)}</h1><p>${esc(desc)}</p></div>
    <div class="stage-actions">${actions}</div></div>`;
}

function modeBadge(project) {
  return project.mode === 'script'
    ? '<span class="badge badge-blue">从剧本开始</span>'
    : '<span class="badge">原创项目</span>';
}

/** 顶栏中段：切项目、模式徽标、集数。写入提案后只需替换这一段 */
export function renderTopCenter(state, project) {
  const optsSource = state.ui.serverOnline ? state.ui.projectIndex : state.projects;
  const options = optsSource.map((p) => `<option value="${p.id}" ${p.id === project.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  return `<select class="project-select" data-action="switch-project">${options}</select>
    ${modeBadge(project)}
    <span class="muted small">${episodeCount(project)} 集</span>`;
}

export function renderWorkspace(state) {
  const value = state.ui.workspace || state.ui.workspaceSuggested || '';
  return `<div class="welcome">
    <div class="welcome-card">
      <div class="brand-lg">AI视频导演助手 <em>H5</em></div>
      <p class="muted">先选一个本地目录。项目和导演包都保存在这里，清浏览器缓存不会丢。</p>
      <div class="welcome-form ws-form">
        <input id="workspacePath" value="${val(value)}" placeholder="点「浏览」选择，或直接粘贴路径" />
        ${state.ui.serverOnline ? '<button class="btn" data-action="pick-workspace">浏览…</button>' : ''}
        <button class="btn btn-primary" data-action="set-workspace">使用此目录</button>
      </div>
      <p class="muted small">目录不存在会自动创建，结构为 <span class="mono">projects/&lt;项目&gt;/project.json</span> 与 <span class="mono">packs/</span>。${state.ui.serverOnline ? '' : ' 通过 server.py 启动后才能打开系统目录选择框。'}</p>
    </div>
  </div>`;
}

export function renderWelcome(state) {
  const online = state.ui.serverOnline;
  const list = online
    ? state.ui.projectIndex || []
    : state.projects.map((p) => ({ id: p.id, name: p.name, mode: p.mode, episodes: episodeCount(p) }));
  const projects = list.map((p) => `
    <button class="project-card" data-action="open-project" data-id="${p.id}">
      <strong>${esc(p.name)}</strong>
      <span>${p.mode === 'script' ? '从剧本' : '原创'} · ${p.episodes || 1} 集</span>
    </button>`).join('');
  const workspaceLine = online
    ? `<p class="muted small">保存目录：<span class="mono">${esc(state.ui.workspace)}</span>
        <button class="btn btn-sm" data-action="change-workspace">更换目录</button></p>`
    : '<p class="muted small">未通过 server.py 启动，数据只存在浏览器，清站点数据会丢。</p>';
  return `<div class="welcome">
    <div class="welcome-card">
      <div class="brand-lg">AI视频导演助手 <em>H5</em></div>
      <p class="muted">选题 → 大纲 → 资产 → 剧本 → 分镜 → 提示词。</p>
      ${workspaceLine}
      <div class="welcome-section">
        <h3>历史项目</h3>
        ${projects ? `<div class="project-grid">${projects}</div>`
          : `<p class="muted small">${online ? '这个目录下还没有项目，在下面新建一个。' : '还没有项目。新建一个开始创作。'}</p>`}
      </div>
      <div class="welcome-section">
        <h3>新建项目</h3>
        <div class="welcome-form">
          <input id="newProjectName" placeholder="项目名，例如：闪婚后她摊牌了" />
          <select id="newProjectMode">
            <option value="original">原创：从选题开始</option>
            <option value="script">从剧本：上传全文开始</option>
          </select>
          <button class="btn btn-primary" data-action="create-project">新建项目</button>
        </div>
      </div>
    </div>
  </div>`;
}

export function renderShell(state, project, stageHtml, chatHtml) {
  const stageTabs = STAGES.map((s, i) => `
    <button class="rail-item ${state.ui.stage === s.id ? 'active' : ''}" data-action="set-stage" data-stage="${s.id}">
      <span class="rail-no">${i + 1}</span>
      <span><b>${s.label}</b><small>${s.hint}</small></span>
    </button>`).join('');
  return `<header class="topbar">
    <div class="brand">AI视频导演助手 <em>H5</em></div>
    <div class="top-center">${renderTopCenter(state, project)}</div>
    <div class="top-actions">
      <span class="model-dot ${state.settings.apiKey ? 'ok' : ''}" title="${state.settings.apiKey ? '模型已配置' : '未配置模型'}"></span>
      <button class="btn btn-ghost" data-action="toggle-chat">Agent</button>
      <button class="btn btn-ghost" data-action="open-settings">设置</button>
      <button class="btn btn-ghost" data-action="export-pack">导出导演包</button>
      <button class="btn btn-ghost" data-action="export-json">导出 JSON</button>
      <button class="btn btn-ghost" data-action="export-md">导出 MD</button>
    </div>
  </header>
  <div class="layout ${state.ui.chatOpen ? '' : 'chat-closed'}">
    <aside class="rail">${stageTabs}<div class="rail-foot">
      <button class="btn btn-ghost btn-block" data-action="new-project">新建项目</button>
      <button class="btn btn-ghost btn-block danger" data-action="delete-project">删除当前项目</button>
    </div></aside>
    <main class="main">${stageHtml}</main>
    <aside class="agent">${chatHtml}</aside>
  </div>`;
}

export function renderStage(state, project) {
  switch (state.ui.stage) {
    case 'topic': return renderTopic(state, project);
    case 'outline': return renderOutline(state, project);
    case 'assets': return renderAssets(state, project);
    case 'script': return renderScript(state, project);
    case 'board': return renderBoard(state, project);
    case 'prompts': return renderPrompts(state, project);
    default: return renderTopic(state, project);
  }
}

function renderTopic(state, project) {
  const t = project.topic;
  const genres = Array.isArray(t.genres) ? t.genres.map(lineText).join('、') : t.genres || '';
  const extras = Array.isArray(t.extras) ? t.extras.map(lineText).join('\n') : t.extras || '';
  return `${stageHead('选题立项', '确定剧名、题材、受众、调性与集数，后续阶段都以此为准。', `
      <button class="btn" data-action="run" data-run="topic">生成选题</button>
      <button class="btn btn-primary" data-action="run" data-run="topic">让 Agent 完善</button>`)}
    <div class="grid-4">
      ${field('剧名', 'topic.title', t.title)}
      ${field('集数', 'topic.episodes', t.episodes, { type: 'number', min: 1 })}
      ${field('每集时长', 'topic.duration', t.duration, { placeholder: '60秒' })}
      ${field('结局', 'topic.ending', t.ending, { type: 'select', options: ['HE', 'BE', 'OE'] })}
    </div>
    <div class="grid-3">
      ${field('题材（顿号分隔）', 'topic.genresText', genres, { placeholder: '都市、甜宠、复仇' })}
      ${field('受众', 'topic.audience', t.audience, { placeholder: '女频 · 18-35' })}
      ${field('调性', 'topic.tone', t.tone, { placeholder: '爽感、强反转' })}
      ${field('语言', 'topic.language', t.language, { placeholder: '中文' })}
      ${field('画风', 'topic.visualStyle', t.visualStyle, { placeholder: '写实电影感' })}
    </div>
    ${field('创作方向（卖点、禁止项，可多行）', 'topic.direction', t.direction, { type: 'textarea', wide: true, rows: 3 })}
    ${field('补充条目（每行一条）', 'topic.extrasText', extras, { type: 'textarea', wide: true, rows: 5 })}
    <div class="panel">
      <div class="panel-head"><b>项目来源</b><span class="muted small">从剧本开始时，选题 / 大纲 / 剧本会自动使用对应技能</span></div>
      <div class="seg">
        <button class="seg-btn ${project.mode === 'original' ? 'active' : ''}" data-action="set-mode" data-mode="original">原创</button>
        <button class="seg-btn ${project.mode === 'script' ? 'active' : ''}" data-action="set-mode" data-mode="script">从剧本开始</button>
      </div>
      ${project.mode === 'script' ? field('原文全文（会作为从剧本技能的依据）', 'sourceText', project.sourceText, { type: 'textarea', wide: true, rows: 20, placeholder: '粘贴小说 / 剧本全文' }) : ''}
    </div>`;
}

/** 大纲角色表：增删一行只重排这张表 */
export function renderOutlineCharRows(project) {
  const chars = project.outline.characters || [];
  return chars.length ? chars.map((c, i) => `<tr>
      <td><input data-path="outline.characters.${i}.name" value="${val(c.name)}" placeholder="角色名" /></td>
      <td><select data-path="outline.characters.${i}.role">${optionsHtml(CHARACTER_ROLES, c.role, '定位')}</select></td>
      <td><input data-path="outline.characters.${i}.description" value="${val(c.description)}" placeholder="一句话定位" /></td>
      <td class="row-actions"><button class="icon-btn" data-action="del-outline-char" data-index="${i}" title="删除">×</button></td>
    </tr>`).join('') : '<tr><td colspan="4" class="muted">暂无角色</td></tr>';
}

/** 大纲分集表：增删一行只重排这张表 */
export function renderEpisodeRows(project) {
  const eps = project.outline.episodes || [];
  return eps.length ? eps.map((e, i) => `<tr>
      <td class="w-60"><input type="number" data-path="outline.episodes.${i}.number" value="${val(e.number)}" /></td>
      <td><input data-path="outline.episodes.${i}.title" value="${val(e.title)}" placeholder="短标题" /></td>
      <td><input data-path="outline.episodes.${i}.synopsis" value="${val(e.synopsis)}" placeholder="本集摘要 ≤40 字" /></td>
      <td><input data-path="outline.episodes.${i}.logline" value="${val(e.logline)}" placeholder="本集看点 ≤30 字" /></td>
      <td class="row-actions"><button class="icon-btn" data-action="del-episode-row" data-index="${i}" title="删除">×</button></td>
    </tr>`).join('') : '<tr><td colspan="5" class="muted">暂无分集，点击「生成大纲」或手动添加</td></tr>';
}

function renderOutline(state, project) {
  const o = project.outline;
  const chars = renderOutlineCharRows(project);
  const eps = renderEpisodeRows(project);
  return `${stageHead('创作大纲', '故事线、三幕、人物名单与分集目录。确认后角色会写入资产页。', `
      <button class="btn" data-action="run" data-run="outline">生成大纲</button>
      <button class="btn" data-action="run" data-run="outlineCheck">检查大纲</button>
      <button class="btn btn-primary" data-action="run" data-run="outline">让 Agent 完善</button>`)}
    ${field('一句话故事', 'outline.logline', o.logline, { wide: true, placeholder: '一句话说清谁、要什么、被什么挡住' })}
    ${field('全文梗概', 'outline.synopsis', o.synopsis, { type: 'textarea', wide: true, rows: 8 })}
    <div class="grid-4">
      ${field('主角想要（Want）', 'outline.want', o.want)}
      ${field('真正需要（Need）', 'outline.need', o.need)}
      ${field('主角缺陷', 'outline.flaw', o.flaw)}
      ${field('节奏', 'outline.rhythm', o.rhythm, { placeholder: '起势 15% → 攀升 30% …' })}
    </div>
    <div class="grid-2">
      ${field('世界规则', 'outline.worldRules', o.worldRules, { type: 'textarea', rows: 3 })}
      ${field('时空背景', 'outline.setting', o.setting, { type: 'textarea', rows: 3 })}
    </div>
    <div class="grid-3">
      ${field('第一幕', 'outline.act1', o.act1, { type: 'textarea', rows: 5 })}
      ${field('第二幕', 'outline.act2', o.act2, { type: 'textarea', rows: 5 })}
      ${field('第三幕', 'outline.act3', o.act3, { type: 'textarea', rows: 5 })}
    </div>
    <div class="grid-3">
      ${field('爽点矩阵', 'outline.highlights', o.highlights, { type: 'textarea', rows: 4 })}
      ${field('结局', 'outline.ending', o.ending, { type: 'textarea', rows: 4 })}
      ${field('付费卡点', 'outline.paywall', o.paywall, { type: 'textarea', rows: 4 })}
    </div>
    <div class="panel">
      <div class="panel-head"><b>角色名单</b><button class="btn btn-ghost" data-action="add-outline-char">添加角色</button></div>
      <table class="table"><thead><tr><th>角色</th><th>定位</th><th>一句话</th><th></th></tr></thead><tbody data-outline-chars>${chars}</tbody></table>
    </div>
    <div class="panel">
      <div class="panel-head"><b>分集目录</b><span class="muted small" data-episode-count>共 ${episodeCount(project)} 集</span><button class="btn btn-ghost" data-action="add-episode-row">添加一集</button></div>
      <table class="table"><thead><tr><th>#</th><th>标题</th><th>摘要</th><th>看点</th><th></th></tr></thead><tbody data-outline-eps>${eps}</tbody></table>
    </div>`;
}

function assetTabs(state) {
  return `<div class="tabs">${[
    ['character', '角色'], ['scene', '场景'], ['prop', '道具'], ['standing', '站位'],
  ].map(([id, label]) => `<button class="tab ${state.ui.assetTab === id ? 'active' : ''}" data-action="asset-tab" data-tab="${id}">${label}</button>`).join('')}</div>`;
}

const ASSET_PROMPT_GROUP = {
  character: 'characterPrompt',
  scene: 'scenePrompt',
  prop: 'propPrompt',
  standing: 'standingPrompt',
};

/** 资产页顶部的默认技能入口：随当前 tab 切换，多技能组才显示。 */
function assetSkillPicker(state) {
  const slotKey = ASSET_PROMPT_GROUP[state.ui.assetTab];
  if (!slotKey) return '';
  const def = SKILL_SLOTS[slotKey];
  const options = slotCandidates(slotKey);
  if (!def || options.length <= 1) return '';
  const current = defaultSkillFor(slotKey, state.settings);
  const info = slotSkillInfo(slotKey, state.settings);
  return `<div class="toolbar asset-skill-bar">
      <label class="inline-field">${esc(def.label)}
        <select data-settings-path="skillDefaults.${slotKey}" title="点「生成提示词」时使用的技能">
          ${options.map((id) => `<option value="${val(id)}" title="${esc(skillMeta(id)?.description || '')}" ${id === current ? 'selected' : ''}>${esc(skillShortLabel(id, slotKey))}</option>`).join('')}
        </select>
      </label>
      <span class="muted small">默认技能，下次点「生成提示词」生效</span>
    </div>
    <div class="muted small skill-desc">技能说明：<span data-skill-desc="skillDefaults.${slotKey}">${esc(info.description)}</span></div>`;
}

function audioPlayer(src) {
  return `<div class="voice-player">
      <audio preload="metadata" src="${val(src)}"></audio>
      <button class="voice-play" data-action="toggle-audio" title="播放 / 暂停">▶</button>
      <div class="voice-track" data-action="seek-audio"><span class="voice-bar"></span></div>
      <span class="voice-time">0:00</span>
    </div>`;
}

export function renderAssetCard(state, project, type, a, i) {
  const key = { character: 'characters', scene: 'scenes', prop: 'props', standing: 'standings' }[type];
  const p = `${key}.${i}`;
  const namePlaceholder = { character: '角色名', scene: '场景名', prop: '道具名', standing: '站位名' }[type];
  const open = Boolean(state.ui.assetOpen && state.ui.assetOpen[a.id]);
  const common = `<div class="asset-head">
      <div class="asset-id">
        <input class="card-title" data-path="${p}.name" value="${val(a.name)}" placeholder="${namePlaceholder}" />
      </div>
      <div class="card-tools">
        <button class="btn btn-sm caret-btn" data-action="toggle-asset" data-id="${a.id}" title="${open ? '收起' : '展开'}">${open ? '收起' : '展开'}</button>
        <label class="check"><input type="checkbox" data-path="${p}.locked" ${a.locked ? 'checked' : ''}/> 锁定</label>
        <button class="icon-btn" data-action="del-asset" data-type="${type}" data-index="${i}" title="删除">×</button>
      </div>
    </div>
    ${type === 'character'
      ? `<div class="asset-sub">
          <select class="role-input" data-path="${p}.role" title="角色定位">${optionsHtml(CHARACTER_ROLES, a.role, '定位')}</select>
          <input class="desc-input" data-path="${p}.description" value="${val(a.description)}" placeholder="一句话描述" />
        </div>`
      : (open ? '' : `<span class="asset-desc">${esc(a.description || '未填写一句话描述')}</span>`)}`;
  let fields = '';
  if (type === 'character') {
    fields = `<div class="grid-2 tight">
      ${field('人种 / 族裔', p + '.ethnicity', a.ethnicity, { hint: '会写入定妆提示词，保证出图时肤色、骨相、发质与族裔一致', placeholder: '例如：东亚、北欧白人、非裔、南亚、拉丁裔' })}
      ${field('台词语种', p + '.language', a.language, { hint: '剧本台词、分镜台词与音色试听都按这个语种生成', placeholder: '例如：中文、英语、日语、韩语、粤语' })}
      ${field('人物画像', p + '.profile', a.profile, { type: 'textarea', wide: true, rows: 5 })}
      ${field('音色说明', p + '.voice', a.voice, { type: 'textarea', wide: true, rows: 2, placeholder: '年龄段、音域、质感、语速，例如：25 岁女声，中低音，微沙，语速偏慢' })}
    </div>`;
  } else if (type === 'scene') {
    fields = `<div class="grid-2 tight">
      ${field('地点', p + '.location', a.location)}
      ${field('灯光', p + '.lighting', a.lighting)}
      ${field('地标', p + '.landmark', a.landmark)}
      ${field('画风', p + '.style', a.style)}
      ${field('场景说明', p + '.description', a.description, { type: 'textarea', wide: true, rows: 4 })}
    </div>`;
  } else if (type === 'prop') {
    fields = `<div class="grid-2 tight">
      ${field('用途', p + '.usage', a.usage)}
      ${field('材质与磨损', p + '.material', a.material)}
      ${field('尺寸', p + '.size', a.size)}
      ${field('画风', p + '.style', a.style)}
      ${field('说明', p + '.description', a.description, { type: 'textarea', wide: true, rows: 4 })}
    </div>`;
  } else {
    fields = `<div class="grid-2 tight">
      ${field('场次', p + '.episode', a.episode, { type: 'number', min: 1 })}
      ${field('分镜', p + '.shot', a.shot)}
      ${field('叙事功能', p + '.function', a.function)}
      ${field('光线', p + '.lighting', a.lighting)}
      ${field('地标/站位点', p + '.landmark', a.landmark)}
      ${field('画风', p + '.style', a.style)}
    </div>`;
  }
  const promptAction = type === 'character' ? 'characterPrompt' : type === 'scene' ? 'scenePrompt' : type === 'prop' ? 'propPrompt' : 'standingPrompt';
  const profileAction = type === 'character' ? 'characterProfile' : type === 'scene' ? 'sceneProfile' : type === 'prop' ? 'propProfile' : 'standingProfile';
  const gapAction = type === 'character' ? 'characterGap' : type === 'scene' ? 'sceneGap' : type === 'prop' ? 'propGap' : 'standingGap';
  const costumes = Array.isArray(a.costumes) ? a.costumes : [];
  const costumeBlock = type === 'character' ? `<div class="costume-panel">
      <div class="panel-head"><b>服装</b>
        <span class="muted small">一整套搭配单独出图，不露脸；分镜「本镜服装」写了这套名称时才作为该角色参考图导出</span>
        <button class="btn btn-sm" data-action="add-costume" data-index="${i}">添加服装</button></div>
      ${costumes.length ? `<div class="costume-grid">${costumes.map((c, ci) => {
        const cp = `${p}.costumes.${ci}`;
        return `<div class="costume-card">
          <div class="costume-thumb">
            ${c.image
              ? `<img class="zoomable" src="${val(c.image)}" alt="${val(c.name)}" title="点击放大" loading="lazy" decoding="async" data-action="zoom-image" />`
              : '<span class="muted small">无图</span>'}
            <label class="btn btn-sm upload-overlay">${c.image ? '换图' : '上传'}
              <input type="file" accept="image/*" data-upload="image" data-type="character" data-id="${a.id}" data-costume="${c.id}" hidden />
            </label>
          </div>
          <div class="costume-body">
            <div class="costume-top">
              <input class="costume-title" data-path="${cp}.name" value="${val(c.name)}" placeholder="服装名称，如 婚礼西装" />
              <input data-path="${cp}.episodes" value="${val(c.episodes)}" placeholder="适用集数，如 1-4" />
              <input data-path="${cp}.material" value="${val(c.material)}" placeholder="材质" />
              <input data-path="${cp}.palette" value="${val(c.palette)}" placeholder="主色" />
            </div>
            <div class="costume-bottom">
              <textarea data-path="${cp}.description" rows="2" placeholder="款式与细节">${val(c.description)}</textarea>
              <textarea data-path="${cp}.prompt" rows="2" placeholder="服装出图提示词，可点「生成提示词」">${val(c.prompt)}</textarea>
            </div>
          </div>
          <div class="costume-actions">
            <button class="btn btn-sm" data-action="run" data-run="costumePrompt" data-index="${i}" data-costume="${ci}">生成提示词</button>
            <button class="btn btn-sm" data-action="gen-costume-image" data-index="${i}" data-costume="${ci}">出图</button>
            <button class="icon-btn" data-action="del-costume" data-index="${i}" data-costume="${ci}" title="删除这套服装">×</button>
          </div>
        </div>`;
      }).join('')}</div>`
        : '<p class="media-empty">还没有服装。点「添加服装」按角色建立服装卡。</p>'}
    </div>` : '';
  const upload = (kind, accept, label, cls = 'upload-btn') => `<label class="btn btn-sm ${cls}">${label}
      <input type="file" accept="${accept}" data-upload="${kind}" data-id="${a.id}" data-type="${type}" hidden />
    </label>`;
  return `<div class="asset-card ${open ? 'open' : ''}" data-card="${a.id}">
    <div class="asset-visual">
      ${a.image
        ? `<img class="asset-img zoomable" src="${val(a.image)}" alt="${val(a.name)}" title="点击放大" loading="lazy" decoding="async" data-action="zoom-image" />`
        : `<div class="asset-img-empty">无${type === 'character' ? '定妆图' : '图'}</div>`}
      ${upload('image', 'image/*', a.image ? '换图' : '上传图片', 'upload-overlay')}
    </div>
    <div class="asset-content">
      ${common}
      ${type === 'character' ? `<div class="media-box media-audio">
        <div class="panel-head"><b>音色</b></div>
        ${a.voiceAudio
          ? audioPlayer(a.voiceAudio)
          : '<p class="media-empty">还没有音色，可上传音频或点「生成音色」。</p>'}
        <div class="audio-actions">${upload('voice', 'audio/*', a.voiceAudio ? '换音频' : '上传音频')}
          <button class="btn btn-sm" data-action="gen-voice" data-index="${i}">生成音色</button></div>
      </div>` : ''}
    </div>
    ${open ? `<div class="asset-body">
      ${fields}
      <div class="field"><span>生图提示词</span>
        <textarea data-path="${p}.prompt" rows="4" placeholder="点「生成提示词」由 Agent 写入，也可直接粘贴">${val(a.prompt)}</textarea>
      </div>
      <div class="card-actions">
        <button class="btn btn-sm" data-action="run" data-run="${profileAction}" data-index="${i}">补全信息</button>
        <button class="btn btn-sm" data-action="run" data-run="${gapAction}" data-index="${i}">智能补充</button>
        <button class="btn btn-sm" data-action="run" data-run="${promptAction}" data-index="${i}">生成提示词</button>
        <button class="btn btn-sm" data-action="gen-image" data-type="${type}" data-index="${i}">出图</button>
        ${type === 'character' ? `<button class="btn btn-sm" data-action="run" data-run="refLayout" data-index="${i}">占位润色</button>` : ''}
        ${type === 'scene' ? `<button class="btn btn-sm" data-action="run" data-run="sceneAngle" data-index="${i}">换角度</button>` : ''}
      </div>
      ${costumeBlock}
    </div>` : ''}
  </div>`;
}

/** 资产网格：增删卡片后索引前移，整块重排；出图、上传等单卡操作不调用它 */
export function renderAssetGrid(state, project) {
  const type = state.ui.assetTab;
  const list = assetList(project, type);
  const empty = { character: '还没有角色卡，点「添加角色」或让 Agent 从大纲补齐。', scene: '还没有场景卡。', prop: '还没有道具卡。', standing: '还没有站位卡。' }[type];
  return list.length
    ? list.map((a, i) => renderAssetCard(state, project, type, a, i)).join('')
    : `<div class="empty-state">${empty}</div>`;
}

function renderAssets(state, project) {
  const type = state.ui.assetTab;
  return `${stageHead('资产设计', '角色、场景、道具、站位。信息卡负责设定，提示词卡负责出图。', `
      <button class="btn" data-action="run" data-run="${type === 'character' ? 'characterGap' : type === 'scene' ? 'sceneGap' : type === 'prop' ? 'propGap' : 'standingGap'}">智能补充</button>
      <button class="btn btn-primary" data-action="add-asset" data-type="${type}">添加${type === 'character' ? '角色' : type === 'scene' ? '场景' : type === 'prop' ? '道具' : '站位'}</button>`)}
    ${assetTabs(state)}
    ${assetSkillPicker(state)}
    <div class="asset-grid">${renderAssetGrid(state, project)}</div>`;
}

/** 单个场次块：加对白、删对白只替换这一块 */
export function renderSceneBlock(state, project, si) {
  const ep = Number(state.ui.episode) || 1;
  const data = project.script[ep] || { scenes: [] };
  const s = (data.scenes || [])[si];
  if (!s) return '';
  const speakerNames = (project.characters || []).map((c) => c.name).filter(Boolean);
  if (!speakerNames.includes('旁白')) speakerNames.push('旁白');
  const lines = (s.lines || []).map((l, li) => `<tr>
      <td class="w-140"><select data-path="script.${ep}.scenes.${si}.lines.${li}.speaker">${optionsHtml(speakerNames, l.speaker, '说话人')}</select></td>
      <td><input data-path="script.${ep}.scenes.${si}.lines.${li}.text" value="${val(l.text)}" placeholder="对白" /></td>
      <td class="row-actions"><button class="icon-btn" data-action="del-line" data-scene="${si}" data-line="${li}">×</button></td>
    </tr>`).join('');
  return `<div class="scene-block" data-scene-block="${si}">
    <div class="panel-head"><b>第 ${si + 1} 场</b>
      <div class="row-actions">
        <button class="btn btn-sm" data-action="add-line" data-scene="${si}">加对白</button>
        <button class="icon-btn" data-action="del-scene" data-scene="${si}">×</button>
      </div>
    </div>
    <div class="grid-3 tight">
      ${field('场次标题', `script.${ep}.scenes.${si}.title`, s.title)}
      ${field('地点', `script.${ep}.scenes.${si}.location`, s.location)}
      ${field('时间', `script.${ep}.scenes.${si}.time`, s.time, { type: 'select', options: SCENE_TIMES, placeholder: '日 / 夜 / 黄昏' })}
    </div>
    ${field('动作 / 画面（每行一条）', `script.${ep}.scenes.${si}.actionsText`, (s.actions || []).join('\n'), { type: 'textarea', wide: true, rows: 3 })}
    ${field('旁白（每行一条）', `script.${ep}.scenes.${si}.narrationText`, (s.narration || []).join('\n'), { type: 'textarea', wide: true, rows: 2 })}
    <table class="table"><thead><tr><th>说话人</th><th>对白</th><th></th></tr></thead><tbody>${lines || '<tr><td colspan="3" class="muted">暂无对白</td></tr>'}</tbody></table>
  </div>`;
}

/** 整集场次列表：删场次后索引前移，整块重排 */
export function renderScriptSceneList(state, project) {
  const ep = Number(state.ui.episode) || 1;
  const scenes = (project.script[ep] || {}).scenes || [];
  return scenes.length
    ? scenes.map((_, si) => renderSceneBlock(state, project, si)).join('')
    : '<div class="empty-state">这一集还没有场次。点「写本集」让 Agent 生成。</div>';
}

function renderScript(state, project) {
  const ep = Number(state.ui.episode) || 1;
  const data = project.script[ep] || { title: '', scenes: [] };
  const epTitle = (project.outline.episodes || []).find((e) => Number(e.number) === ep)?.title || data.title || '';
  const epOptions = Array.from({ length: episodeCount(project) }, (_, i) => i + 1);
  return `${stageHead('分集剧本', '把梗概写成可拍摄的场次：动作、旁白、对白分行。', `
      <button class="btn" data-action="run" data-run="scriptWrite">写本集</button>
      <button class="btn" data-action="run" data-run="scriptRevise">按说明改写</button>
      <button class="btn" data-action="run" data-run="scriptCheck">检查本集</button>`)}
    <div class="toolbar">
      <label class="inline-field">集数
        <select data-path="ui.episode">${epOptions.map((n) => `<option value="${n}" ${n === ep ? 'selected' : ''}>第 ${n} 集${(project.outline.episodes || []).find((e) => Number(e.number) === n)?.title ? ' · ' + esc((project.outline.episodes || []).find((e) => Number(e.number) === n).title) : ''}</option>`).join('')}</select>
      </label>
      <span class="muted small">${esc(epTitle)}</span>
      <button class="btn btn-ghost" data-action="add-scene">加一场</button>
    </div>
    <div class="field"><span>改写要求（点「按说明改写」时使用）</span>
      <textarea id="reviseInput" rows="2" placeholder="例如：把第 2 场对白改短，情绪更克制"></textarea>
    </div>
    <div class="scene-list">${renderScriptSceneList(state, project)}</div>`;
}

/** 本镜服装统一成 { character, costume }，兼容旧字符串「角色：服装」 */
const normalizeCostume = (c) => {
  if (typeof c !== 'string') return { character: c.character || '', costume: c.costume || '' };
  const [a, b] = c.split(/[:：]/).map((x) => x.trim());
  return b ? { character: a, costume: b } : { character: '', costume: a || '' };
};

/** 单张镜头卡：切角色、增删本镜服装只替换这一张 */
export function renderShotCard(state, project, i) {
  const ep = Number(state.ui.episode) || 1;
  const shots = (project.board[ep] || {}).shots || [];
  const s = shots[i];
  if (!s) return '';
  const characters = project.characters || [];
  const costumeRows = (Array.isArray(s.costumes) ? s.costumes : []).map((raw, ci) => {
    const item = normalizeCostume(raw);
    const owner = characters.find((ch) => ch.name === item.character);
    const costumes = (owner && owner.costumes) || [];
    return `<div class="costume-line">
      <select data-shot-role="${i}" data-ci="${ci}">
        <option value="">选择角色</option>
        ${characters.map((ch) => `<option value="${val(ch.name)}" ${ch.name === item.character ? 'selected' : ''}>${esc(ch.name)}</option>`).join('')}
      </select>
      <select data-shot-costume="${i}" data-ci="${ci}" ${owner ? '' : 'disabled'}>
        <option value="">默认造型（定妆图）</option>
        ${costumes.filter((c) => c.name).map((c) => `<option value="${val(c.name)}" ${c.name === item.costume ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select>
      <button class="icon-btn" data-action="del-shot-costume" data-index="${i}" data-ci="${ci}" title="删除这条服装">×</button>
    </div>`;
  }).join('');
  return `<div class="shot-card" data-shot="${i}">
    <div class="shot-head">
      <label class="shot-no">镜号 <input type="number" data-path="board.${ep}.shots.${i}.no" value="${val(s.no ?? i + 1)}" /></label>
      <label>时长 <input class="w-70" data-path="board.${ep}.shots.${i}.duration" value="${val(s.duration)}" placeholder="4秒" /></label>
      <label>景别 <select class="w-80" data-path="board.${ep}.shots.${i}.shotSize">${optionsHtml(SHOT_SIZES, s.shotSize, '选择景别')}</select></label>
      <label>运镜 <select class="w-80" data-path="board.${ep}.shots.${i}.camera">${optionsHtml(CAMERA_MOVES, s.camera, '选择运镜')}</select></label>
      <div class="shot-actions">
        <button class="btn btn-sm" data-action="run" data-run="boardRevise" data-index="${i}">改这镜</button>
        <button class="icon-btn" data-action="del-shot" data-index="${i}">×</button>
      </div>
    </div>
    <div class="shot-costumes">
      <div class="shot-costumes-head">
        <span>本镜服装</span>
        <button class="btn btn-sm" data-action="add-shot-costume" data-index="${i}">+ 添加</button>
      </div>
      ${costumeRows || '<span class="muted small">未设置，默认使用角色定妆图。</span>'}
    </div>
    <div class="shot-body">
      <label><span>画面</span><textarea data-path="board.${ep}.shots.${i}.description" rows="2" placeholder="画面内容">${val(s.description)}</textarea></label>
      <label><span>时间轴</span><textarea data-path="board.${ep}.shots.${i}.timeline" rows="3" placeholder="0-2秒……">${val(s.timeline)}</textarea></label>
      <label><span>对白</span><textarea data-path="board.${ep}.shots.${i}.dialogue" rows="2" placeholder="对白 / 旁白">${val(s.dialogue)}</textarea></label>
    </div>
  </div>`;
}

/** 相邻两镜之间的转场卡：首帧取上一镜尾帧，尾帧取下一镜首帧 */
export function renderTransitionCard(state, project, i) {
  const ep = Number(state.ui.episode) || 1;
  const data = project.board[ep] || { shots: [] };
  const shots = data.shots || [];
  const a = shots[i];
  const b = shots[i + 1];
  if (!a || !b) return '';
  const transitions = Array.isArray(data.transitions) ? data.transitions : [];
  const cfg = transitions.find((t) => t.from === a.id && t.to === b.id) || {};
  const enabled = cfg.enabled !== false;
  return `<div class="transition-card ${enabled ? '' : 'off'}" data-transition-card="${i}">
    <div class="transition-head">
      <label class="check"><input type="checkbox" data-transition-toggle="${i}" ${enabled ? 'checked' : ''}/> 转场</label>
      <span class="muted small">镜 ${esc(a.no ?? i + 1)} → 镜 ${esc(b.no ?? i + 2)}</span>
      <select class="w-70" data-transition-field="duration" data-index="${i}" title="转场时长，1.6–3 秒（对应 H3 的 39/56/73 帧）">${optionsHtml(TRANSITION_DURATIONS, normalizeTransitionDuration(cfg.duration))}</select>
      <select class="w-140" data-transition-field="technique" data-index="${i}" title="转场技法">${optionsHtml(TRANSITION_TECHS, cfg.technique || '', '选择技法')}</select>
      <button class="btn btn-sm" data-action="run" data-run="boardTransition" data-index="${i}">生成提示词</button>
    </div>
    <textarea data-transition-field="prompt" data-index="${i}" rows="2" placeholder="转场提示词（首帧=上一镜尾帧，尾帧=下一镜首帧）">${val(cfg.prompt || '')}</textarea>
  </div>`;
}

/** 整集镜头流：删镜后镜序与转场索引都会前移，整块重排 */
export function renderShotList(state, project) {
  const ep = Number(state.ui.episode) || 1;
  const shots = (project.board[ep] || {}).shots || [];
  if (!shots.length) return '<div class="empty-state">这一集还没有镜头。点「拆分镜」生成。</div>';
  return shots.map((_, i) => renderShotCard(state, project, i) + (i < shots.length - 1 ? renderTransitionCard(state, project, i) : '')).join('');
}

function renderBoard(state, project) {
  const ep = Number(state.ui.episode) || 1;
  const epOptions = Array.from({ length: episodeCount(project) }, (_, i) => i + 1);
  const boardSkill = slotSkillInfo('boardSplit', state.settings);

  return `${stageHead('分镜表', '按转场把已确认剧本拆成镜头，写清时长、景别、运镜与时间轴。', `
      <button class="btn" data-action="run" data-run="boardSplit">拆分镜</button>
      <button class="btn" data-action="run" data-run="boardAdd">加一镜</button>`)}
    <div class="toolbar">
      <label class="inline-field">集数
        <select data-path="ui.episode">${epOptions.map((n) => `<option value="${n}" ${n === ep ? 'selected' : ''}>第 ${n} 集</option>`).join('')}</select>
      </label>
      <span class="muted small">拆分镜技能：${esc(boardSkill.name)} · ${esc(boardSkill.description)}（在「设置 → 技能管理」中切换）</span>
      <button class="btn btn-ghost" data-action="add-shot">添加空镜</button>
    </div>
    <div class="shot-list">${renderShotList(state, project)}</div>
    <p class="muted small">转场默认全部开启；导出导演包时每对相邻镜头会生成一个 fl2v 转场任务，首帧取上一镜尾帧、尾帧取下一镜首帧。</p>`;
}

function renderPrompts(state, project) {
  const ep = Number(state.ui.episode) || 1;
  const data = project.board[ep] || { shots: [] };
  const shots = data.shots || [];
  const currentNo = Number(state.ui.shotNo) || 1;
  const shot = shots.find((s) => Number(s.no) === currentNo) || shots[0] || null;
  const key = shot ? (shot.id || String(shot.no)) : '';
  const p = shot ? (project.prompts[key] || {}) : {};
  const epOptions = Array.from({ length: episodeCount(project) }, (_, i) => i + 1);
  const shotOptions = shots.map((s) => `<option value="${val(s.no)}" ${Number(s.no) === Number(shot?.no) ? 'selected' : ''}>第 ${esc(s.no)} 镜${s.description ? ' · ' + esc(String(s.description).slice(0, 16)) : ''}</option>`).join('');
  return `${stageHead('镜头提示词', '单镜 H3 视频提示词与分镜图提示词；整集可一次生成。', `
      <button class="btn" data-action="run" data-run="shotH3zh">生成中文 H3</button>
      <button class="btn" data-action="run" data-run="shotH3en">生成英文 H3</button>
      <button class="btn" data-action="run" data-run="frame">生成分镜图提示词</button>
      <button class="btn btn-primary" data-action="run" data-run="h3All">整集生成</button>`)}
    <div class="toolbar">
      <label class="inline-field">集数
        <select data-path="ui.episode">${epOptions.map((n) => `<option value="${n}" ${n === ep ? 'selected' : ''}>第 ${n} 集</option>`).join('')}</select>
      </label>
      <label class="inline-field">镜头
        <select data-path="ui.shotNo">${shotOptions || '<option value="1">暂无镜头</option>'}</select>
      </label>
    </div>
    ${shot ? `<div class="panel">
      <div class="panel-head"><b data-prompt-title>第 ${esc(shot.no)} 镜</b><span class="muted small" data-prompt-desc>${esc(shot.description || '')}</span></div>
      ${field('H3 中文视频提示词', `prompts.${key}.h3zh`, p.h3zh, { type: 'textarea', wide: true, rows: 6, name: 'h3zh' })}
      ${field('H3 英文视频提示词', `prompts.${key}.h3en`, p.h3en, { type: 'textarea', wide: true, rows: 6, name: 'h3en' })}
      ${field('分镜图提示词', `prompts.${key}.frame`, p.frame, { type: 'textarea', wide: true, rows: 5, name: 'frame' })}
    </div>` : '<div class="empty-state">先到「分镜」阶段生成镜头。</div>'}`;
}

/** 单条聊天消息：流式输出时按 data-msg-id 局部替换，不重建整段对话 */
export function renderChatMessage(m) {
  const idAttr = m.id ? ` data-msg-id="${val(m.id)}"` : '';
  if (m.role === 'user') {
    return `<div class="msg msg-user"${idAttr}><div class="msg-body">${formatText(m.content)}</div></div>`;
  }
  const think = (m.pending || m.reasoning)
    ? `<details class="msg-think" ${m.pending ? 'open' : ''}>
        <summary>${m.pending ? '思考中…' : '思考过程'}</summary>
        <div class="think-body">${esc(m.reasoning || '等待模型响应…')}</div>
      </details>`
    : '';
  return `<div class="msg msg-assistant"${idAttr}>${think}<div class="msg-body">${formatText(m.content || '')}${m.pending ? '<span class="cursor"></span>' : ''}</div></div>`;
}

/** 写入提案区：生成完成后只替换这一块 */
export function renderProposalList(chat) {
  const proposals = (chat.proposals || []).map((p, i) => `<div class="proposal">
      <div><b>${proposalLabel(p.kind)}</b>${p.error ? `<span class="badge badge-red">${esc(p.error)}</span>` : ''}</div>
      <pre>${esc(p.raw.slice(0, 1500))}</pre>
      <div class="proposal-actions">
        <button class="btn btn-sm btn-primary" data-action="apply-proposal" data-index="${i}" ${p.error || !p.data ? 'disabled' : ''}>写入草稿</button>
        <button class="btn btn-sm" data-action="copy-proposal" data-index="${i}">复制 JSON</button>
      </div>
    </div>`).join('');
  return proposals ? `<div class="proposal-list">${proposals}</div>` : '';
}

export function renderChat(state, project) {
  const chat = state.ui.chat;
  const msgs = chat.messages.map(renderChatMessage).join('');
  const stageSkills = listSkills();
  const skillOptions = stageSkills.map((s) => `<option value="${s.id}" ${chat.skillId === s.id ? 'selected' : ''}>${esc(s.name)} · ${esc(s.id)}</option>`).join('');
  return `<div class="chat-head">
      <div><b>创作 Agent</b><div class="muted small">${esc(skillLabel(chat.skillId))}</div></div>
      <button class="btn btn-ghost btn-sm" data-action="clear-chat">清空</button>
    </div>
    <div class="chat-skill">
      <select data-action="set-chat-skill" title="本次对话使用的技能">${skillOptions || '<option>技能加载中…</option>'}</select>
    </div>
    <div class="chat-log" id="chatLog">${msgs || '<div class="chat-empty">选一个阶段动作，或直接描述你要做什么。<br/><span class="muted small">技能正文会原样拼进 system prompt，版权声明保留。</span></div>'}</div>
    ${renderProposalList(chat)}
    <div class="composer">
      <textarea id="chatInput" rows="3" placeholder="${project ? '例如：把第 2 场对白改短，情绪更克制…' : '先新建项目'}" ${project ? '' : 'disabled'}></textarea>
      <div class="composer-actions">
        <span class="muted small">Enter 发送 · Shift+Enter 换行</span>
        ${chat.busy
          ? '<button class="btn btn-danger" data-action="stop-chat">停止</button>'
          : '<button class="btn btn-primary" data-action="send-chat">发送</button>'}
      </div>
    </div>`;
}

export function formatText(text) {
  let s = esc(text || '');
  const blocks = [];
  s = s.replace(/```(\w*)\n([\s\S]*?)```/g, (m, lang, code) => {
    const i = blocks.push(`<pre class="code"><code>${code}</code></pre>`) - 1;
    return `\u0000${i}\u0000`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\n/g, '<br/>');
  s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => blocks[Number(i)]);
  return s;
}

function agentSettings(state) {
  const s = state.settings;
  const provider = LLM_PROVIDERS.find((p) => p.id === s.provider) || LLM_PROVIDERS[0];
  const providerOptions = LLM_PROVIDERS.map((p) => `<option value="${p.id}" ${p.id === provider.id ? 'selected' : ''}>${esc(p.label)}</option>`).join('');
  const fetched = state.ui.llmModels || [];
  const models = [...new Set([...fetched, ...provider.models])]
    .map((m) => `<option value="${val(m)}"></option>`).join('');
  return `<div class="grid-2">
      <label class="field"><span>LLM 提供商</span>
        <select data-action="set-provider">${providerOptions}</select>
      </label>
      ${field('模型', 'settings.model', s.model, { placeholder: provider.models[0] || '模型名', list: 'llmModels' })}
      <label class="field wide"><span>API Key（选择提供商后只需填这一项）</span>
        <input type="password" data-path="settings.apiKey" value="${val(s.apiKey)}" placeholder="sk-..." />
      </label>
      ${field('Base URL（自动带出，可改）', 'settings.baseUrl', s.baseUrl, { wide: true, placeholder: 'https://api.openai.com/v1' })}
      ${field('temperature', 'settings.temperature', s.temperature, { type: 'number', hint: '控制输出的随机性，范围 0–2。越低越稳定、越保守，适合分镜和提示词这类要求格式固定的任务；越高越发散，适合选题、剧名等需要创意的场景。默认 0.4。' })}
      ${field('max tokens', 'settings.maxTokens', s.maxTokens || '', { type: 'number', placeholder: '留空则不传，用服务端默认上限', hint: '单次回复最多生成多少 token。留空则不发送该参数，由服务端的默认上限决定。长分镜或长提示词被截断时，可把它调大；服务端上限更低时会报参数超限。' })}
    </div>
    <div class="toolbar">
      <button class="btn btn-sm" data-action="fetch-models">拉取模型列表</button>
      <span class="muted small">从当前提供商的 /models 接口读取；模型框也可直接手填任意 ID</span>
    </div>
    ${fetched.length ? `<div class="model-list">
      <span class="muted small">已拉取 ${fetched.length} 个，点一个直接选用：</span>
      ${fetched.map((m) => `<button class="model-chip ${m === s.model ? 'active' : ''}" data-action="pick-model" data-model="${val(m)}">${esc(m)}</button>`).join('')}
    </div>` : ''}
    <datalist id="llmModels">${models}</datalist>
    <p class="muted small">选择提供商后会写入对应的 Base URL 与默认模型，接口按 OpenAI 兼容格式调用。</p>
    <p class="muted small">模型与连接参数只影响文本生成；技能默认项、自定义技能与导入导出已移到「技能管理」。</p>`;
}

const SKILL_STAGE_ORDER = [
  ['topic', '选题'], ['outline', '大纲'], ['assets', '资产'],
  ['script', '剧本'], ['board', '分镜'], ['prompts', '提示词'], ['image', '图片'],
];

/** 供技能表单复用的流程下拉选项。 */
export function skillSlotOptionsHtml(selected = '') {
  return SKILL_STAGE_ORDER.map(([stage, stageLabel]) => {
    const rows = Object.entries(SKILL_SLOTS)
      .filter(([, def]) => def.stage === stage)
      .map(([key, def]) => `<option value="${val(key)}" ${key === selected ? 'selected' : ''}>${esc(stageLabel + ' · ' + def.label)}</option>`)
      .join('');
    return rows ? `<optgroup label="${esc(stageLabel)}">${rows}</optgroup>` : '';
  }).join('');
}

function skillManager(state) {
  const s = state.settings || {};
  const editable = skillsApiAvailable();
  const stageSections = SKILL_STAGE_ORDER.map(([stage, stageLabel]) => {
    const rows = Object.entries(SKILL_SLOTS)
      .filter(([, def]) => def.stage === stage)
      .map(([key, def]) => {
        const options = slotCandidates(key);
        const current = defaultSkillFor(key, s);
        const info = slotSkillInfo(key, s);
        const values = def.modeDriven ? ['', ...options] : options;
        const labelFor = (id) => (id ? skillShortLabel(id, key) : '跟随项目模式');
        const descFor = (id) => (id ? (skillMeta(id)?.description || '') : MODE_DRIVEN_DESC);
        return `<div class="skill-slot">
            <div class="skill-slot-head"><b>${esc(def.label)}</b><span class="muted small">${esc(def.group)}</span></div>
            <div class="toolbar">
              <select data-settings-path="skillDefaults.${key}">${values.map((id) => `<option value="${val(id)}" title="${esc(descFor(id))}" ${id === current ? 'selected' : ''}>${esc(labelFor(id))}</option>`).join('')}</select>
              ${editable ? `<button class="btn btn-sm" data-action="skill-new" data-slot="${val(key)}">+ 自定义</button>` : ''}
            </div>
            <div class="muted small skill-desc">技能说明：<span data-skill-desc="skillDefaults.${key}">${esc(info.description)}</span></div>
          </div>`;
      }).join('');
    return rows ? `<div class="panel"><div class="panel-head"><b>${esc(stageLabel)}</b></div>${rows}</div>` : '';
  }).join('');

  const customs = listSkills().filter((x) => x.origin === 'custom');
  const customRows = customs.map((x) => `<div class="skill-slot">
      <div class="skill-slot-head"><b>${esc(x.name)}</b><span class="muted small">${esc(SKILL_SLOTS[x.slot]?.label || x.slot || '未归类')}</span></div>
      <div class="muted small">${esc(x.id)} · ${esc(x.description || '无说明')}</div>
      <div class="toolbar">
        <button class="btn btn-sm" data-action="skill-edit" data-id="${val(x.id)}">编辑</button>
        <button class="btn btn-sm" data-action="skill-export" data-id="${val(x.id)}">导出</button>
        <button class="btn btn-sm btn-danger" data-action="skill-delete" data-id="${val(x.id)}">删除</button>
      </div>
    </div>`).join('');

  return `<div class="panel">
      <div class="panel-head"><b>技能管理</b></div>
      <p class="muted small">每个流程可选择默认技能。自定义技能会写入 <code>skills-clean/&lt;id&gt;/SKILL.md</code>，并自动重建 manifest。</p>
      ${editable ? `<div class="toolbar">
          <button class="btn btn-sm btn-primary" data-action="skill-new">+ 新建自定义技能</button>
          <select id="skillImportSlot" title="导入时归入的流程">
            <option value="">导入时按文件内的 slot</option>
            ${skillSlotOptionsHtml('')}
          </select>
          <button class="btn btn-sm" data-action="skill-import">导入 SKILL.md</button>
          <input type="file" id="skillImportFile" accept=".md,.markdown,text/markdown" hidden />
          <span id="skillManagerMsg" class="muted small"></span>
        </div>` : '<p class="muted small">未连接本地服务，只能选择内置技能；启动 server.py 后可新建、导入、导出和删除自定义技能。</p>'}
      <div id="skillFormHost"></div>
    </div>
    ${stageSections}
    <div class="panel">
      <div class="panel-head"><b>自定义技能</b></div>
      ${customRows || '<p class="muted small">还没有自定义技能。</p>'}
    </div>`;
}

function comfySettings(state, kind) {
  const cfg = state.settings[kind];
  const label = kind === 'image' ? '生图' : '音频';
  const info = analyzeWorkflow(cfg.workflow);
  const promptRef = cfg.promptRef || info.detected.promptRef || '';
  const negativeRef = cfg.negativeRef || info.detected.negativeRef || '';
  const outputNode = cfg.outputNode || info.detected.outputNode || '';
  const nodeOptions = info.nodes.map((n) => `<option value="${val(n.id)}" ${n.id === outputNode ? 'selected' : ''}>${val(n.id)} · ${esc(n.class_type)}${n.title ? ' · ' + esc(n.title) : ''}</option>`).join('');
  const textOptions = info.textNodes.map((t) => `<option value="${val(t.id + '|' + t.input)}" ${t.id + '|' + t.input === promptRef ? 'selected' : ''}>${val(t.id)} · ${esc(t.class_type)} · ${esc(t.input)}</option>`).join('');
  const negOptions = info.textNodes.map((t) => `<option value="${val(t.id + '|' + t.input)}" ${t.id + '|' + t.input === negativeRef ? 'selected' : ''}>${val(t.id)} · ${esc(t.class_type)} · ${esc(t.input)}</option>`).join('');
  const result = state.ui.testResult?.[kind];
  const resultHtml = result?.error
    ? `<div class="badge badge-red">${esc(result.error)}</div>`
    : result?.url
      ? (kind === 'image'
        ? `<img class="asset-img test-media" src="${esc(result.url)}" alt="测试出图" />`
        : `<div class="test-media">${audioPlayer(result.url)}</div>`)
      : '';
  return `<div class="grid-2">
      ${field('ComfyUI Server', `settings.${kind}.server`, cfg.server, { wide: true, placeholder: 'http://127.0.0.1:8188' })}
      <label class="field wide"><span>工作流 JSON（ComfyUI 菜单里的 Save (API Format)）</span>
        <textarea class="mono" data-path="settings.${kind}.workflow" rows="8" placeholder="粘贴 API 格式工作流 JSON">${val(cfg.workflow)}</textarea>
      </label>
    </div>
    <div class="toolbar">
      <input type="file" accept=".json,application/json" data-workflow-kind="${kind}" />
      <button class="btn btn-sm" data-action="refresh-workflow" data-kind="${kind}">解析节点</button>
      <button class="btn btn-sm" data-action="clear-workflow" data-kind="${kind}">清空</button>
      ${info.error ? `<span class="badge badge-red">${esc(info.error)}</span>` : info.nodes.length ? `<span class="badge badge-blue">已识别 ${info.nodes.length} 个节点</span>` : '<span class="muted small">尚未导入工作流</span>'}
    </div>
    <div class="grid-2">
      <label class="field"><span>正向提示词节点</span>
        <select data-path="settings.${kind}.promptRef"><option value="">自动识别</option>${textOptions}</select>
      </label>
      <label class="field"><span>负向提示词节点（可选）</span>
        <select data-path="settings.${kind}.negativeRef"><option value="">不注入</option>${negOptions}</select>
      </label>
      <label class="field"><span>输出节点</span>
        <select data-path="settings.${kind}.outputNode"><option value="">自动收集全部输出</option>${nodeOptions}</select>
      </label>
      ${field('超时（秒）', `settings.${kind}.timeout`, cfg.timeout, { type: 'number' })}
      <label class="check wide"><input type="checkbox" data-settings-path="${kind}.autoSeed" ${cfg.autoSeed ? 'checked' : ''}/> 每次运行自动写入随机种子（并尽量自动写入尺寸）</label>
    </div>
    <div class="panel">
      <div class="panel-head"><b>连接与测试</b><span class="muted small">ComfyUI 需允许跨域：启动时加 --enable-cors-header</span></div>
      <div class="toolbar">
        <button class="btn" data-action="test-comfy" data-kind="${kind}">测试连接</button>
        <button class="btn" data-action="test-comfy-run" data-kind="${kind}">跑一次测试${label}</button>
      </div>
      <div id="${kind}TestMsg" class="muted small"></div>
      ${resultHtml}
    </div>`;
}

export function renderSettings(state) {
  const tab = state.ui.settingsTab || 'agent';
  const tabs = [['agent', 'Agent 设置'], ['image', '生图模型'], ['audio', '音频模型'], ['skills', '技能管理']];
  return `<div class="modal-mask" data-action="close-settings">
    <div class="modal" data-stop="1">
      <div class="modal-head"><b>设置</b><button class="icon-btn" data-action="close-settings" aria-label="关闭" title="关闭">×</button></div>
      <div class="modal-body">
        <div class="tabs modal-tabs">${tabs.map(([id, label]) => `<button class="tab ${tab === id ? 'active' : ''}" data-action="settings-tab" data-tab="${id}">${label}</button>`).join('')}</div>
        ${tab === 'skills' ? skillManager(state) : tab === 'agent' ? agentSettings(state) : comfySettings(state, tab)}
      </div>
      <div class="modal-foot">
        <button class="btn" data-action="test-settings">测试连接</button>
        <span id="settingsMsg" class="muted small"></span>
        <button class="btn btn-primary" data-action="save-settings">保存</button>
      </div>
    </div>
  </div>`;
}
