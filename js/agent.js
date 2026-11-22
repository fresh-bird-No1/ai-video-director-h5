import { state } from './store.js';
import { runComfy, pickOutput, parseWorkflow } from './comfy.js';

export function hasModel() {
  return Boolean(state.settings.apiKey && state.settings.baseUrl && state.settings.model);
}

function joinUrl(base, path) {
  return String(base || '').replace(/\/+$/, '') + path;
}

export async function streamChat({ system, messages, onDelta, onReasoning, signal, maxTokens }) {
  const s = state.settings;
  if (!hasModel()) throw new Error('请先在「设置」里填写 API Key、Base URL 和模型名');
  const limit = Number(maxTokens || s.maxTokens);
  const body = {
    model: s.model,
    temperature: Number(s.temperature) || 0.4,
    stream: true,
    messages: [{ role: 'system', content: system }, ...messages],
  };
  // 留空则不传 max_tokens，交给服务端默认上限
  if (limit > 0) body.max_tokens = limit;
  const res = await fetch(joinUrl(s.baseUrl, '/chat/completions'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + s.apiKey,
    },
    signal,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`模型请求失败（${res.status}）${text ? '：' + text.slice(0, 300) : ''}`);
  }
  if (!res.body) {
    const data = await res.json();
    if (data?.error) throw new Error('模型返回错误：' + errorText(data.error));
    const msg = data?.choices?.[0]?.message || {};
    const think = msg.reasoning_content || msg.reasoning || '';
    if (think && onReasoning) onReasoning(think);
    const text = msg.content || '';
    if (!text.trim()) throw new Error(emptyReplyHint());
    onDelta(text);
    return text;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let finished = false;
  while (!finished) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n');
    buffer = parts.pop();
    for (const line of parts) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payload = t.slice(5).trim();
      if (payload === '[DONE]') {
        finished = true;
        break;
      }
      let json;
      try {
        json = JSON.parse(payload);
      } catch (e) {
        continue; // 忽略不完整的分片
      }
      if (json?.error) throw new Error('模型返回错误：' + errorText(json.error));
      const choice = json?.choices?.[0] || {};
      const d = choice.delta || {};
      const think = d.reasoning_content || d.reasoning || '';
      if (think && onReasoning) onReasoning(think);
      const delta = d.content || '';
      if (delta) {
        full += delta;
        onDelta(delta);
      }
      // 有的服务只给 finish_reason 不发 [DONE]，同样立即收尾
      if (choice.finish_reason) {
        finished = true;
        break;
      }
    }
  }
  if (finished) {
    // 服务端可能不主动断开，主动取消读流，让界面马上出现写入操作框
    try {
      await reader.cancel();
    } catch (e) {
      // 流已关闭时忽略
    }
  }
  if (!full.trim()) throw new Error(emptyReplyHint());
  return full;
}

function errorText(err) {
  if (typeof err === 'string') return err;
  return err.message || err.msg || JSON.stringify(err).slice(0, 300);
}

function emptyReplyHint() {
  return '模型没有返回任何内容。常见原因：max tokens 超过服务端上限、模型名不可用，或接口用 200 状态返回了错误。可在「设置」里把 max tokens 改小或留空后再试。';
}

export async function fetchModels() {
  const s = state.settings;
  if (!s.apiKey) throw new Error('请先填写 API Key');
  const res = await fetch(joinUrl(s.baseUrl, '/models'), {
    headers: { Authorization: 'Bearer ' + s.apiKey },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`拉取模型失败（${res.status}）${text ? '：' + text.slice(0, 200) : ''}`);
  }
  const data = await res.json();
  const list = (data.data || data.models || [])
    .map((m) => (typeof m === 'string' ? m : m.id || m.name || ''))
    .filter(Boolean);
  if (!list.length) throw new Error('接口没有返回模型列表');
  return [...new Set(list)].sort();
}

export async function testConnection() {
  const s = state.settings;
  const res = await fetch(joinUrl(s.baseUrl, '/models'), {
    headers: { Authorization: 'Bearer ' + s.apiKey },
  });
  if (!res.ok) throw new Error('连接失败：' + res.status);
  const data = await res.json();
  return Array.isArray(data.data) ? data.data.length : 0;
}

/**
 * 模型常把多行提示词直接写进 JSON 字符串，或留下尾逗号，导致 JSON.parse 失败。
 * 这里逐字符修复：字符串里的裸换行/制表符转义，对象末尾多余逗号去掉。
 */
function repairJson(raw) {
  let text = String(raw || '').replace(/^\uFEFF/, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  let out = '';
  let inStr = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inStr) {
      if (escaped) {
        out += ch;
        escaped = false;
      } else if (ch === '\\') {
        out += ch;
        escaped = true;
      } else if (ch === '"') {
        // 引号后若是逗号、括号等结构字符才算字符串结束；
        // 否则多半是提示词正文里没转义的引号（例如 说"你好"），补上转义
        let j = i + 1;
        while (j < text.length && /\s/.test(text[j])) j += 1;
        const next = text[j];
        if (j >= text.length || next === ':' || next === ',' || next === '}' || next === ']') {
          inStr = false;
          out += ch;
        } else {
          out += '\\"';
        }
      } else if (ch === '\n') {
        out += '\\n';
      } else if (ch === '\r') {
        out += '\\r';
      } else if (ch === '\t') {
        out += '\\t';
      } else {
        out += ch;
      }
      continue;
    }
    if (ch === '"') {
      inStr = true;
      out += ch;
      continue;
    }
    if (ch === ',') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j += 1;
      if (text[j] === '}' || text[j] === ']') continue;
    }
    out += ch;
  }
  return out;
}

function parseProposalJson(raw) {
  try {
    return JSON.parse(raw);
  } catch (e) {
    // 继续尝试修复后再解析
  }
  try {
    return JSON.parse(repairJson(raw));
  } catch (e) {
    return null;
  }
}

/** 从代码块正文里读出提案；带 json 标记的块允许前方有说明文字 */
function pushProposal(out, seen, raw, jsonLabel) {
  let text = String(raw || '').trim();
  if (!text || !/"kind"\s*:/.test(text)) return;
  if (!/^\s*[\[{]/.test(text)) {
    if (!jsonLabel) return;
    const at = text.indexOf('{');
    if (at < 0) return;
    text = text.slice(at).trim();
  }
  if (seen.has(text)) return;
  seen.add(text);
  const parsed = parseProposalJson(text);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.kind) {
    out.push({ kind: parsed.kind, data: parsed.data ?? parsed, raw: JSON.stringify(parsed, null, 2) });
  } else if (parsed && typeof parsed === 'object') {
    out.push({ kind: '', data: parsed, raw: JSON.stringify(parsed, null, 2) });
  } else if (!out.some((item) => item.data)) {
    // 输出被截断或结构损坏时也保留一条；已有可用提案时不再追加噪音
    out.push({ kind: '', data: null, raw: text, error: 'JSON 解析失败，可能被截断，请重试' });
  }
}

/** 没有围栏时，从整段回复里扫出最外层的 JSON 对象 */
function scanJsonObjects(text) {
  const found = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '{') continue;
    let depth = 0;
    let inStr = false;
    let escaped = false;
    let end = -1;
    for (let j = i; j < text.length; j += 1) {
      const ch = text[j];
      if (inStr) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') {
        inStr = true;
      } else if (ch === '{') {
        depth += 1;
      } else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end < 0) continue;
    const raw = text.slice(i, end + 1);
    if (/"kind"\s*:/.test(raw)) {
      found.push(raw);
      i = end;
    }
  }
  return found;
}

export function extractProposals(text) {
  const src = String(text || '');
  const out = [];
  const seen = new Set();
  // 先扫无围栏 / 围栏内夹着说明文字的完整 JSON，再处理代码块，避免重复与噪音
  for (const raw of scanJsonObjects(src)) pushProposal(out, seen, raw, true);
  // 允许末尾没有闭合围栏：输出超长被截断时仍能提示用户
  const fence = /```[ \t]*([A-Za-z]*)[ \t]*\r?\n?([\s\S]*?)(?:```|$)/g;
  let m;
  while ((m = fence.exec(src))) {
    const lang = String(m[1] || '').toLowerCase();
    if (!lang || lang === 'json') pushProposal(out, seen, m[2], lang === 'json');
    if (m.index === fence.lastIndex) fence.lastIndex += 1;
  }
  // 全文被截断、又没有闭合围栏时，至少把残片放进提案区，让用户看到「写入」框和失败原因
  if (!out.length && /"kind"\s*:/.test(src)) {
    const kindAt = src.search(/"kind"\s*:/);
    const at = kindAt > 0 ? src.lastIndexOf('{', kindAt) : -1;
    if (at >= 0) pushProposal(out, seen, src.slice(at), true);
  }
  return out;
}

export function proposalLabel(kind) {
  const map = {
    topic: '选题配置',
    outline: '创作大纲',
    characters: '角色卡',
    scenes: '场景卡',
    props: '道具卡',
    standings: '站位卡',
    characterPrompt: '角色定妆提示词',
    costumePrompt: '服装出图提示词',
    scenePrompt: '场景生图提示词',
    propPrompt: '道具生图提示词',
    standingPrompt: '站位生图提示词',
    script: '分集剧本',
    board: '分镜表',
    prompts: '镜头提示词',
  };
  return map[kind] || '可写入数据';
}

export function hasComfyImage() {
  return Boolean(state.settings.image?.server && parseWorkflow(state.settings.image?.workflow));
}

export function hasComfyAudio() {
  return Boolean(state.settings.audio?.server && parseWorkflow(state.settings.audio?.workflow));
}

export async function generateImage(prompt, opts = {}) {
  if (!state.settings.image?.workflow) throw new Error('请先在「设置 → 生图模型」导入 ComfyUI 工作流');
  const files = await runComfy(state.settings.image, { prompt, ...opts });
  const url = pickOutput(files, ['images', 'gifs', 'videos']);
  if (!url) throw new Error('ComfyUI 工作流没有返回图片，请检查输出节点');
  return url;
}

export async function generateAudio(text, opts = {}) {
  if (!state.settings.audio?.workflow) throw new Error('请先在「设置 → 音频模型」导入 ComfyUI 工作流');
  const files = await runComfy(state.settings.audio, { prompt: text, ...opts });
  const url = pickOutput(files, ['audio', 'gifs', 'videos']);
  if (!url) throw new Error('ComfyUI 工作流没有返回音频，请检查输出节点');
  return url;
}
