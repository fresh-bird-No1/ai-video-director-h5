/**
 * 导演包（*.mmxpack.zip）导出。
 *
 * 目录结构与 ComfyUI_MiniMaxH3_Director 的 pack.py 对齐：
 *   pack.json                      转场任务写在 transitions 字段
 *   shared_params/shared_params.json
 *   asset_groups/NN/group.json
 *   asset_groups/NN/PictureN.<ext> / AudioN.<ext>
 *   transitions/NN.json            fl2v 转场任务，首帧取上一组尾帧、尾帧取下一组首帧
 *
 * 不写 timeline.json，导入端会用 _assemble_timeline 从 group.json 重新组装。
 * pack.json 的 sequence 给出最终拼接顺序：正常镜头组与转场交替排列。
 */

const PACK_FORMAT = 'minimax-h3-director-pack';
const PACK_VERSION = 1;

const T2V_LABEL = 't2v — 文生视频(Text to Video)';
const R2V_LABEL = 'r2v — 参考主体生视频(Reference to Video)';
const FL2V_LABEL = 'fl2v — 首尾帧生视频(First & Last Frame to Video)';
const MIXED_LABEL = 'mixed — 混合模式(Mixed Segments)';

const EXT_BY_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/wave': '.wav',
  'audio/flac': '.flac',
  'audio/x-flac': '.flac',
  'audio/ogg': '.ogg',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/aac': '.aac',
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosStamp(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** 生成 store 方式（不压缩）的 zip，媒体文件本来已压缩，再压收益很小 */
function buildZip(files) {
  const encoder = new TextEncoder();
  const { time, date } = dosStamp(new Date());
  const parts = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.path);
    const data = file.data;
    const crc = crc32(data);

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    parts.push(local, data);

    const cen = new Uint8Array(46 + name.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    cen.set(name, 46);
    central.push(cen);

    offset += local.length + data.length;
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function extFromMime(mime, fallback) {
  const key = String(mime || '').split(';')[0].trim().toLowerCase();
  return EXT_BY_MIME[key] || fallback;
}

/** data URL 或 http URL 都读成字节，读不到就抛错由上层记警告 */
async function loadMedia(src) {
  if (!src || typeof src !== 'string') throw new Error('空资源');
  if (src.startsWith('data:')) {
    const m = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(src);
    if (!m) throw new Error('无法解析 data URL');
    return {
      mime: m[1] || '',
      bytes: m[2] ? base64ToBytes(m[3]) : new TextEncoder().encode(decodeURIComponent(m[3])),
    };
  }
  const res = await fetch(src);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { mime: res.headers.get('content-type') || '', bytes: new Uint8Array(await res.arrayBuffer()) };
}

function parseDuration(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  const m = /(\d+(?:\.\d+)?)/.exec(String(value || ''));
  return m ? Number(m[1]) : 0;
}

/** MiniMax H3 只接受 17k+5 帧（5, 22, 39, 56, 73…），导出前先向上对齐，避免实际时长与所选不一致 */
function alignH3Frames(seconds, fps) {
  let n = Math.max(5, Math.round(seconds * fps));
  while (n % 17 !== 5) n += 1;
  return n;
}

/** 画面/时间轴里引号包住的内容通常是台词，导出兜底时剔掉，避免被模型当台词念出 */
function dropSpokenSentences(text) {
  return String(text || '')
    .replace(/[，,、：:]?\s*(?:她|他|它|对方|众人|两人)?\s*(?:说|喊|叫|问|答|念|道|嚷|吼|嘟囔|低语|开口|回复|回答|笑道|哭道|骂道)?\s*[“「『][^”」』]*[”」』]/g, '')
    .replace(/"[^"]*"/g, '')
    .replace(/[，,、]\s*([。；;])/g, '$1')
    .replace(/[，,、；;]\s*$/, '')
    .replace(/\s*([。；;])/g, '$1')
    .trim();
}

/** 秒转 H3 时间码：2.5 → 00:02.500 */
function timecode(sec) {
  const v = Number(sec);
  if (!Number.isFinite(v) || v < 0) return '';
  const mm = String(Math.floor(v / 60)).padStart(2, '0');
  const ss = String(Math.floor(v % 60)).padStart(2, '0');
  const ms = String(Math.round((v % 1) * 1000)).padStart(3, '0');
  return `${mm}:${ss}.${ms}`;
}

/** 取本镜的分段：优先结构化 beats，旧项目没有 beats 时从时间轴文本反解 */
function timelineBeats(shot) {
  const beats = (Array.isArray(shot.beats) ? shot.beats : []).filter((b) => b && String(b.text || '').trim());
  if (beats.length) return beats;
  const out = [];
  for (const line of String(shot.timeline || '').split(/\n/)) {
    const m = /^\s*(\d+(?:\.\d+)?)\s*[–\-~至]\s*(\d+(?:\.\d+)?)\s*秒\s*[：:]\s*(.+)$/.exec(line);
    if (m) out.push({ start: Number(m[1]), end: Number(m[2]), text: m[3].trim() });
  }
  return out;
}

/** 台词格式化成 H3 对白标记：按行或斜杠拆句，只包引号内的原句 */
function dialogueTags(dialogue) {
  const raw = String(dialogue || '').trim();
  if (!raw) return '';
  return raw.split(/\s*(?:\/|\n)\s*/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    const m = /^([^：:“”「」『』]{1,20})[：:]\s*([\s\S]*)$/.exec(trimmed);
    const who = m ? m[1].trim() : '';
    const body = (m ? m[2] : trimmed).trim();
    const quoted = /^[“「『]?([\s\S]*?)[”」』]?$/.exec(body);
    const text = (quoted ? quoted[1] : body).trim();
    if (!text) return '';
    return who ? `${who}说：<d>[Chinese] ${text}</d>` : `<d>[Chinese] ${text}</d>`;
  }).filter(Boolean).join('\n');
}

/** 没有 H3 提示词时的兜底：画面按分段还原时间码，台词单独成段，明确不念叙述 */
function fallbackPrompt(shot) {
  const beats = timelineBeats(shot);
  const blocks = [];
  for (const b of beats) {
    const text = dropSpokenSentences(b.text);
    if (!text) continue;
    const stamp = Number.isFinite(Number(b.start)) && Number.isFinite(Number(b.end))
      ? `${timecode(b.start)}–${timecode(b.end)}\n`
      : '';
    blocks.push(stamp + text);
  }
  const visual = blocks.length
    ? blocks.join('\n')
    : [shot.description, shot.timeline].map(dropSpokenSentences).filter(Boolean).join('\n');
  const lines = dialogueTags(shot.dialogue);
  const parts = [];
  if (visual) parts.push(`画面与表演：\n${visual}`);
  parts.push(lines ? `声音与台词：\n${lines}` : '声音与台词：无台词，只有环境声与动作声。');
  return parts.join('\n\n');
}

function fileNameExt(src, mime, fallback) {
  const fromMime = extFromMime(mime, '');
  if (fromMime) return fromMime;
  const m = /\.([A-Za-z0-9]{1,5})(?:[?#]|$)/.exec(String(src || ''));
  return m ? '.' + m[1].toLowerCase() : fallback;
}

function shotAssets(shot, characters, scenes, props) {
  const names = (shot.assets || []).map((n) => String(n).trim()).filter(Boolean);
  const hay = [shot.description, shot.timeline, shot.dialogue].filter(Boolean).join(' ');
  const hit = (item) => {
    if (!item.name) return false;
    if (names.includes(item.name)) return true;
    if (names.some((n) => n.includes(item.name) || item.name.includes(n))) return true;
    return hay.includes(item.name);
  };
  const chars = characters.filter(hit);
  const costumes = [];
  const links = Array.isArray(shot.costumes) ? shot.costumes : [];
  for (const raw of links) {
    const item = typeof raw === 'string'
      ? (([a, b]) => (b ? { character: a, costume: b } : { character: '', costume: a || '' }))(String(raw).split(/[:：]/).map((x) => x.trim()))
      : { character: raw.character || '', costume: raw.costume || '' };
    const owner = characters.find((c) => (item.character ? c.name === item.character : !!(item.costume && (c.costumes || []).some((x) => x.name === item.costume))));
    if (!owner) continue;
    const cos = item.costume ? (owner.costumes || []).find((x) => x.name === item.costume) : null;
    if (cos && cos.image) costumes.push({ name: `${owner.name}·${cos.name}`, image: cos.image });
    // 没有选具体服装，或该服装没图时，用角色定妆图当默认造型
    else if (owner.image) costumes.push({ name: `${owner.name}·默认造型`, image: owner.image });
  }
  // 旧数据没有 costumes 字段时，仍按服装名出现在资产或画面里兜底
  if (!links.length) {
    for (const c of chars) {
      for (const cos of (c.costumes || [])) {
        if (!cos.image || !cos.name) continue;
        if (!names.includes(cos.name) && !hay.includes(cos.name)) continue;
        costumes.push({ name: `${c.name}·${cos.name}`, image: cos.image });
      }
    }
  }
  return {
    chars,
    scenes: scenes.filter(hit),
    props: props.filter(hit),
    costumes,
  };
}

/**
 * 把一集导出成导演包。
 * @returns {Promise<{blob: Blob, filename: string, warnings: string[], groups: number}>}
 */
export async function buildDirectorPack(project, ep, opts = {}) {
  const fps = Number(opts.fps) || 24;
  const width = Number(opts.width) || 1280;
  const height = Number(opts.height) || 720;

  const shots = (project.board && project.board[Number(ep)] && project.board[Number(ep)].shots) || [];
  if (!shots.length) throw new Error(`第 ${ep} 集还没有分镜，无法导出导演包`);
  const epData = project.board[Number(ep)] || {};
  const transitionCfg = Array.isArray(epData.transitions) ? epData.transitions : [];

  const characters = project.characters || [];
  const scenes = project.scenes || [];
  const props = project.props || [];
  const prompts = project.prompts || {};

  const files = [];
  const warnings = [];
  let cursor = 0;
  let anyRefs = false;
  let fallbackCount = 0;

  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    const folder = `asset_groups/${String(i + 1).padStart(2, '0')}`;
    const picked = shotAssets(shot, characters, scenes, props);
    // 角色在前、场景居中、道具在后，服装图追加在末尾，避免打乱已有 <Picture N> 的编号
    const ordered = [...picked.chars, ...picked.scenes, ...picked.props, ...picked.costumes];

    const refs = [];
    const refAudios = [];
    const usedImages = new Set();

    for (const asset of ordered) {
      if (asset.image) {
        // 同一张图（如定妆图被当作默认服装）只导一次
        if (usedImages.has(asset.image)) continue;
        usedImages.add(asset.image);
        try {
          const media = await loadMedia(asset.image);
          const ext = fileNameExt(asset.image, media.mime, '.png');
          const fileName = `Picture${refs.length + 1}${ext}`;
          files.push({ path: `${folder}/${fileName}`, data: media.bytes });
          refs.push({
            index: refs.length,
            fileName,
            type: 'input',
            subfolder: folder,
            imageFile: `${folder}/${fileName}`,
          });
        } catch (err) {
          warnings.push(`${asset.name} 的图片读取失败（${err.message}）`);
        }
      } else if (asset.name) {
        warnings.push(`${asset.name} 还没有图片`);
      }

      if (asset.voiceAudio) {
        try {
          const media = await loadMedia(asset.voiceAudio);
          const ext = fileNameExt(asset.voiceAudio, media.mime, '.mp3');
          const fileName = `Audio${refAudios.length + 1}${ext}`;
          files.push({ path: `${folder}/${fileName}`, data: media.bytes });
          refAudios.push({
            index: refAudios.length,
            fileName,
            type: 'input',
            subfolder: folder,
            audioFile: `${folder}/${fileName}`,
          });
        } catch (err) {
          warnings.push(`${asset.name} 的音色读取失败（${err.message}）`);
        }
      }
    }

    if (refs.length) anyRefs = true;

    const prompt = prompts[shot.id] || prompts[String(shot.no)] || {};
    let text = prompt.h3en || prompt.h3zh || '';
    if (!text) {
      text = fallbackPrompt(shot);
      fallbackCount += 1;
    }
    const duration = parseDuration(shot.duration) || 5;
    const frameCount = Math.max(24, Math.round(duration * fps));

    const group = {
      id: shot.id || `sh_${i + 1}`,
      shotNo: shot.no ?? i + 1,
      folder,
      prompt: text,
      negativePrompt: prompt.negative || '',
      durationSec: duration,
      frameCount,
      length: frameCount,
      start: cursor,
      taskType: refs.length ? R2V_LABEL : T2V_LABEL,
      refs,
      refAudios,
      refVideos: [],
      continuityFromPrev: false,
    };

    files.push({
      path: `${folder}/group.json`,
      data: new TextEncoder().encode(JSON.stringify(group, null, 2)),
    });

    cursor += frameCount;
  }

  if (fallbackCount) {
    warnings.push(`${fallbackCount} 个镜头没有视频提示词，已按画面与台词生成基础提示词；建议先在分镜阶段逐镜生成提示词`);
  }

  // 转场任务：按相邻镜头对，导出 fl2v；首帧引用上一组尾帧，尾帧引用下一组首帧
  const transitions = [];
  const sequence = [];
  for (let i = 0; i < shots.length; i++) {
    const folder = `asset_groups/${String(i + 1).padStart(2, '0')}`;
    sequence.push({ type: 'shot', group: folder, shotNo: shots[i].no ?? i + 1 });
    if (i >= shots.length - 1) continue;
    const a = shots[i];
    const b = shots[i + 1];
    const cfg = transitionCfg.find((t) => t.from === a.id && t.to === b.id) || {};
    if (cfg.enabled === false) continue;
    const nextFolder = `asset_groups/${String(i + 2).padStart(2, '0')}`;
    const durationSec = Math.min(3, Math.max(1.6, parseDuration(cfg.duration) || 1.6));
    const frameCount = alignH3Frames(durationSec, fps);
    const spec = {
      id: `tr_${String(i + 1).padStart(2, '0')}`,
      taskType: FL2V_LABEL,
      afterGroup: folder,
      beforeGroup: nextFolder,
      fromShotId: a.id || `sh_${i + 1}`,
      toShotId: b.id || `sh_${i + 2}`,
      fromShotNo: a.no ?? i + 1,
      toShotNo: b.no ?? i + 2,
      durationSec: frameCount / fps,
      frameCount,
      technique: cfg.technique || '',
      prompt: cfg.prompt || '',
      firstFrame: { sourceGroup: folder, frame: 'last' },
      lastFrame: { sourceGroup: nextFolder, frame: 'first' },
    };
    transitions.push(spec);
    sequence.push({ type: 'transition', id: spec.id });
    files.push({
      path: `transitions/${spec.id.slice(3)}.json`,
      data: new TextEncoder().encode(JSON.stringify(spec, null, 2)),
    });
  }

  const taskLabel = anyRefs ? MIXED_LABEL : T2V_LABEL;
  const packMeta = {
    format: PACK_FORMAT,
    formatVersion: PACK_VERSION,
    taskType: anyRefs ? 'mixed' : 't2v',
    widgets: { task_type: taskLabel },
    output: { width, height, fps, frameRate: fps },
    transitions,
    sequence,
  };
  const shared = {
    commonEnabled: false,
    commonCollapsed: false,
    prompt: '',
    refs: [],
    refAudios: [],
    refVideos: [],
  };

  files.unshift(
    { path: 'pack.json', data: new TextEncoder().encode(JSON.stringify(packMeta, null, 2)) },
    {
      path: 'shared_params/shared_params.json',
      data: new TextEncoder().encode(JSON.stringify(shared, null, 2)),
    },
  );

  return {
    blob: buildZip(files),
    filename: `E${String(ep).padStart(2, '0')}.mmxpack.zip`,
    warnings,
    groups: shots.length,
    transitions: transitions.length,
  };
}
