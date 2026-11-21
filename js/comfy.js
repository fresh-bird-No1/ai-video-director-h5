function join(base, path) {
  return String(base || '').replace(/\/+$/, '') + path;
}

export function parseWorkflow(text) {
  if (!text || !String(text).trim()) return null;
  try {
    const wf = JSON.parse(text);
    if (!wf || typeof wf !== 'object' || Array.isArray(wf)) return null;
    if (!Object.values(wf).some((n) => n && n.class_type)) return null;
    return wf;
  } catch (e) {
    return null;
  }
}

export function analyzeWorkflow(text) {
  const wf = parseWorkflow(text);
  if (!wf) return { nodes: [], textNodes: [], detected: {}, error: text ? '工作流不是合法的 ComfyUI API JSON' : '' };
  const nodes = Object.entries(wf).map(([id, node]) => ({
    id,
    class_type: node.class_type || '',
    title: node._meta?.title || '',
    inputs: node.inputs || {},
  }));
  const textNodes = [];
  for (const n of nodes) {
    for (const [key, value] of Object.entries(n.inputs)) {
      if (typeof value === 'string' && /text|prompt|caption|string|positive|negative/i.test(key)) {
        textNodes.push({ id: n.id, class_type: n.class_type, input: key, value });
      }
    }
  }
  const clip = nodes.filter((n) => /CLIPTextEncode/i.test(n.class_type));
  const pickBy = (re) => textNodes.find((t) => re.test(t.input) || re.test(nodes.find((n) => n.id === t.id)?.title || ''));
  // 别把负向文本节点当成正向：默认工作流两个 CLIPTextEncode 都叫 text，
  // 一旦识别错，正向提示词会被写进负向节点，出图看起来就像没用提示词。
  const looksNegative = (t) => {
    if (!t) return false;
    const label = `${t.input} ${nodes.find((n) => n.id === t.id)?.title || ''}`;
    return /negative|负向|反向/i.test(label)
      || /^(worst quality|low quality|lowres|low quality|blurry|bad anatomy|bad hands|watermark|nsfw|ugly|deformed)/i
        .test(String(t.value || '').trim());
  };
  const clipTexts = clip.map((c) => textNodes.find((t) => t.id === c.id)).filter(Boolean);
  const pos = pickBy(/positive/i)
    || clipTexts.find((t) => !looksNegative(t))
    || textNodes.find((t) => !looksNegative(t))
    || textNodes[0];
  const neg = pickBy(/negative/i)
    || clipTexts.find((t) => t !== pos && looksNegative(t))
    || null;
  const seedNode = nodes.find((n) => 'seed' in n.inputs) || nodes.find((n) => 'noise_seed' in n.inputs);
  const sizeNode = nodes.find((n) => 'width' in n.inputs && 'height' in n.inputs);
  const output = nodes.find((n) => /SaveImage|PreviewImage|SaveAudio|PreviewAudio|VHS_VideoCombine|SaveVideo/i.test(n.class_type))
    || nodes.find((n) => /Save|Preview/i.test(n.class_type));
  return {
    nodes,
    textNodes,
    wf,
    detected: {
      promptRef: pos ? `${pos.id}|${pos.input}` : '',
      negativeRef: neg ? `${neg.id}|${neg.input}` : '',
      outputNode: output ? output.id : '',
      seedNode: seedNode ? seedNode.id : '',
      sizeNode: sizeNode ? sizeNode.id : '',
    },
  };
}

function parseRef(ref) {
  const [node, input] = String(ref || '').split('|');
  return node && input ? { node, input } : null;
}

export async function testComfy(server) {
  if (!server) throw new Error('请先填写 ComfyUI Server 地址');
  const res = await fetch(join(server, '/system_stats'), { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error('ComfyUI 连接失败：' + res.status);
  const data = await res.json();
  const dev = data?.devices?.[0];
  return dev ? `${dev.name || 'ComfyUI'} · VRAM ${Math.round((dev.vram_total || 0) / 1024 / 1024)}MB` : 'ComfyUI 已连接';
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runComfy(config, payload = {}) {
  if (!config?.server) throw new Error('请先在设置中填写 ComfyUI Server');
  const wf = parseWorkflow(config.workflow);
  if (!wf) throw new Error('请先在设置中导入 ComfyUI API 格式的工作流 JSON');
  const info = analyzeWorkflow(config.workflow);
  const ref = parseRef(config.promptRef) || parseRef(info.detected.promptRef);
  if (!ref) throw new Error('未找到提示词节点，请在设置中选择正向提示词节点');
  if (!wf[ref.node] || !wf[ref.node].inputs) throw new Error('提示词节点不存在，请重新解析工作流');
  const promptText = String(payload.prompt || '');
  wf[ref.node].inputs[ref.input] = promptText;
  // 出图/音频的实际输入可直接在控制台核对，方便确认用的是卡片里的提示词
  console.info(
    `[ComfyUI] 提示词 → ${ref.node}.${ref.input}（${promptText.length} 字）`,
    promptText,
  );

  // TTS 类工作流通常把音色描述写在 voice_instruction 里，示例值是固定人声，必须按角色覆盖
  if (payload.voice) {
    for (const node of Object.values(wf)) {
      for (const key of Object.keys(node?.inputs || {})) {
        if (/^(voice_instruction|voice_prompt|voice_desc|voice|timbre|instruct|instruction)$/i.test(key)
          && typeof node.inputs[key] === 'string') {
          node.inputs[key] = String(payload.voice);
        }
      }
    }
  }

  const negRef = parseRef(config.negativeRef) || parseRef(info.detected.negativeRef);
  if (negRef && payload.negative && wf[negRef.node]?.inputs) {
    wf[negRef.node].inputs[negRef.input] = String(payload.negative);
  }
  if (config.autoSeed !== false) {
    const seedId = info.detected.seedNode;
    if (seedId && wf[seedId]?.inputs) {
      const inputs = wf[seedId].inputs;
      const seed = Number(payload.seed) || Math.floor(Math.random() * 1e9);
      if ('seed' in inputs) inputs.seed = seed;
      if ('noise_seed' in inputs) inputs.noise_seed = seed;
    }
  }
  if (payload.width || payload.height) {
    const sizeId = info.detected.sizeNode;
    if (sizeId && wf[sizeId]?.inputs) {
      if (payload.width) wf[sizeId].inputs.width = Number(payload.width);
      if (payload.height) wf[sizeId].inputs.height = Number(payload.height);
    }
  }

  const clientId = 'dm_h5_' + Date.now();
  const res = await fetch(join(config.server, '/prompt'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: wf, client_id: clientId }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`提交工作流失败（${res.status}）${text ? '：' + text.slice(0, 300) : ''}`);
  }
  const queued = await res.json();
  const promptId = queued.prompt_id;
  if (!promptId) throw new Error('ComfyUI 未返回 prompt_id');

  const timeout = Math.max(30, Number(config.timeout) || 180) * 1000;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await sleep(1000);
    let hist;
    try {
      const r = await fetch(join(config.server, `/history/${encodeURIComponent(promptId)}`));
      if (!r.ok) continue;
      hist = await r.json();
    } catch (e) {
      continue;
    }
    const entry = hist[promptId];
    if (!entry) continue;
    const status = entry.status || {};
    if (status.status_str === 'error') {
      const msg = status.messages?.find?.((m) => m[0] === 'execution_error');
      throw new Error('工作流执行失败' + (msg ? '：' + JSON.stringify(msg[1]).slice(0, 200) : ''));
    }
    const outputs = entry.outputs || {};
    const ids = config.outputNode ? [config.outputNode] : Object.keys(outputs);
    const files = [];
    for (const id of ids) {
      const out = outputs[id] || {};
      for (const kind of ['images', 'audio', 'gifs', 'videos']) {
        for (const f of out[kind] || []) {
          if (!f || !f.filename) continue;
          files.push({
            kind,
            filename: f.filename,
            url: join(config.server, `/view?filename=${encodeURIComponent(f.filename)}&subfolder=${encodeURIComponent(f.subfolder || '')}&type=${encodeURIComponent(f.type || 'output')}`),
          });
        }
      }
    }
    if (files.length) return files;
    if (status.completed) return [];
  }
  throw new Error(`等待 ComfyUI 结果超时（${Math.round(timeout / 1000)} 秒）`);
}

export function pickOutput(files, kinds) {
  const hit = (files || []).find((f) => kinds.includes(f.kind));
  return hit ? hit.url : '';
}
