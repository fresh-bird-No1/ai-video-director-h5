/** 本地服务接口：项目与导演包落盘到用户选定的目录 */

async function request(path, opts = {}) {
  const init = { method: opts.method || 'GET', headers: {} };
  if (opts.json !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(opts.json);
  } else if (opts.body !== undefined) {
    init.body = opts.body;
    if (opts.type) init.headers['Content-Type'] = opts.type;
  }
  const res = await fetch(path, init);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) throw new Error((data && data.error) || `服务返回 ${res.status}`);
  return data;
}

export async function loadStatus() {
  try {
    return await request('/api/status');
  } catch {
    return null;
  }
}

export function setWorkspace(path) {
  return request('/api/workspace', { method: 'POST', json: { path } });
}

export function pickDirectory() {
  return request('/api/pick-dir');
}

export async function listProjects() {
  const data = await request('/api/projects');
  return data.projects || [];
}

export function getProject(id) {
  return request('/api/projects/' + encodeURIComponent(id));
}

export function putProject(project) {
  return request('/api/projects/' + encodeURIComponent(project.id), {
    method: 'PUT',
    json: project,
  });
}

export function deleteProject(id) {
  return request('/api/projects/' + encodeURIComponent(id), { method: 'DELETE' });
}

export async function savePack(name, blob) {
  const data = await request('/api/packs/' + encodeURIComponent(name), {
    method: 'POST',
    body: blob,
    type: 'application/zip',
  });
  return data.path;
}
