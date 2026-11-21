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
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n');
    buffer = parts.pop();
    for (const line of parts) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payload = t.slice(5).trim();
      if (payload === '[DONE]') continue;
      let json;
      try {
        json = JSON.parse(payload);
      } catch (e) {
        continue; // 忽略不完整的分片
      }
      if (json?.error) throw new Error('模型返回错误：' + errorText(json.error));
      const d = json?.choices?.[0]?.delta || {};
      const think = d.reasoning_content || d.reasoning || '';
      if (think && onReasoning) onReasoning(think);
      const delta = d.content || '';
      if (delta) {
        full += delta;
        onDelta(delta);
      }
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

export function extractProposals(text) {
  const out = [];
  const re = /```json\s*([\s\S]*?)```/gi;
  let m;
  while ((m = re.exec(text))) {
    const raw = m[1].trim();
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.kind) out.push({ kind: parsed.kind, data: parsed.data ?? parsed, raw });
      else if (parsed && typeof parsed === 'object') out.push({ kind: '', data: parsed, raw });
    } catch (e) {
      out.push({ kind: '', data: null, raw, error: 'JSON 解析失败' });
    }
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
