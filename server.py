#!/usr/bin/env python3
"""AI视频导演助手 H5 本地服务。

职责：
  1. 托管当前目录下的静态文件；
  2. 把项目与导演包写到用户选定的本地目录，清浏览器缓存不会丢。

用法：
  python3 server.py [--port 8787]

接口：
  GET    /api/status              返回是否在线、当前工作目录、建议目录
  GET    /api/pick-dir            弹出系统目录选择框，返回所选路径
  POST   /api/workspace           {"path": "..."} 设置或创建工作目录
  GET    /api/projects            列出工作目录下的项目（仅元信息）
  GET    /api/projects/<id>       读取完整项目
  PUT    /api/projects/<id>       写入完整项目（不存在则创建）
  DELETE /api/projects/<id>       删除项目
  POST   /api/media               {"projectId","url"} 把 ComfyUI 结果转存到项目目录
  GET    /api/media/<id>/<file>   读取项目媒体（支持 Range，音频可拖动）
  POST   /api/packs/<name>        保存导演包（*.mmxpack.zip）
  GET    /api/skills              列出 skills-clean 下的技能
  POST   /api/skills              新建自定义技能（写 SKILL.md 并重建 manifest）
  POST   /api/skills/import       导入 SKILL.md 文本
  PUT    /api/skills/<id>         编辑自定义技能
  DELETE /api/skills/<id>         删除自定义技能
  GET    /api/skills/<id>/file    读取技能原文（用于导出）

目录结构：
  <workspace>/projects/<id>/project.json
  <workspace>/packs/E01.mmxpack.zip
"""

from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
import re
import shutil
import subprocess
import sys
import urllib.request
import uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, unquote, parse_qs

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / ".workspace.json"
SKILLS_DIR = ROOT / "skills-clean"
DEFAULT_WORKSPACE = Path.home() / "AI视频导演助手项目"

ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
SKILL_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
CUSTOM_ID_RE = re.compile(r"^custom-[a-z0-9][a-z0-9-]{0,55}$")
PACK_RE = re.compile(r"^[A-Za-z0-9._-]{1,120}\.mmxpack\.zip$")
MEDIA_FILE_RE = re.compile(r"^[A-Za-z0-9_-]{1,80}\.[A-Za-z0-9]{1,8}$")
MAX_BODY = 512 * 1024 * 1024
MAX_MEDIA_BYTES = 64 * 1024 * 1024
# Python 的 mimetypes 会把 .flac 识别成 audio/x-flac，部分浏览器不认；统一成标准类型
MEDIA_MIME = {
    ".flac": "audio/flac",
    ".opus": "audio/ogg",
    ".m4a": "audio/mp4",
    ".webp": "image/webp",
}
MAX_SKILL_BODY = 64 * 1024
SKILL_META_KEYS = ("name", "description", "slot", "stage", "origin", "version", "author", "license")


def read_config() -> dict:
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data
    except (OSError, ValueError):
        pass
    return {}


def write_config(data: dict) -> None:
    tmp = CONFIG_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, CONFIG_PATH)


def workspace_path() -> Path | None:
    raw = read_config().get("workspace") or ""
    if not raw:
        return None
    path = Path(os.path.expanduser(str(raw))).resolve()
    return path if path.is_dir() else None


def ensure_workspace(path: Path) -> Path:
    path = path.expanduser().resolve()
    path.mkdir(parents=True, exist_ok=True)
    (path / "projects").mkdir(exist_ok=True)
    (path / "packs").mkdir(exist_ok=True)
    probe = path / ".write-test"
    probe.write_text("ok", encoding="utf-8")
    probe.unlink()
    return path


def parse_skill_md(text: str) -> tuple[dict, str]:
    """解析 SKILL.md 的 frontmatter；只有 key: value，不引入 YAML 依赖。"""
    lines = str(text or "").splitlines()
    if not lines or lines[0].strip() != "---":
        return {}, str(text or "")
    meta: dict[str, str] = {}
    for i in range(1, len(lines)):
        line = lines[i]
        if line.strip() == "---":
            return meta, "\n".join(lines[i + 1:]).strip("\n")
        if ":" in line:
            key, value = line.split(":", 1)
            meta[key.strip()] = value.strip()
    return {}, str(text or "")


def dump_skill_md(meta: dict, body: str) -> str:
    lines = ["---"]
    for key in SKILL_META_KEYS:
        value = meta.get(key)
        if value not in (None, ""):
            lines.append(f"{key}: {value}")
    for key, value in meta.items():
        if key not in SKILL_META_KEYS and value not in (None, ""):
            lines.append(f"{key}: {value}")
    lines.extend(["---", "", str(body or "").strip(), ""])
    return "\n".join(lines)


def skill_folder(skill_id: str) -> Path:
    if not SKILL_ID_RE.match(skill_id):
        raise ValueError("技能 ID 非法")
    folder = (SKILLS_DIR / skill_id).resolve()
    if SKILLS_DIR.resolve() not in folder.parents:
        raise ValueError("技能路径非法")
    return folder


def skill_item(folder: Path) -> dict | None:
    md = folder / "SKILL.md"
    if not md.is_file() or not SKILL_ID_RE.match(folder.name):
        return None
    try:
        meta, _ = parse_skill_md(md.read_text(encoding="utf-8"))
    except OSError:
        return None
    origin = meta.get("origin") or ("custom" if folder.name.startswith("custom-") else "builtin")
    return {
        "id": folder.name,
        "name": meta.get("name") or folder.name,
        "description": meta.get("description") or "",
        "slot": meta.get("slot") or "",
        "stage": meta.get("stage") or "",
        "origin": "custom" if origin == "custom" else "builtin",
        "file": f"skills-clean/{folder.name}/SKILL.md",
    }


def list_skills() -> list[dict]:
    items: list[dict] = []
    if not SKILLS_DIR.is_dir():
        return items
    for folder in sorted(SKILLS_DIR.iterdir(), key=lambda p: p.name):
        item = skill_item(folder)
        if item:
            items.append(item)
    return items


def rebuild_manifest(items: list[dict]) -> None:
    """按目录重扫后重建 manifest，保留旧条目顺序，新技能追加。"""
    path = SKILLS_DIR / "manifest.json"
    try:
        old = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        old = []
    old_order = [str(it.get("id")) for it in old if isinstance(it, dict)] if isinstance(old, list) else []
    by_id = {it["id"]: it for it in items}
    ordered = [by_id[i] for i in old_order if i in by_id]
    ordered.extend(it for it in items if it["id"] not in old_order)
    payload = []
    for it in ordered:
        row = {
            "id": it["id"],
            "name": it["name"],
            "description": it["description"],
            "file": it["file"],
            "origin": it["origin"],
        }
        if it.get("slot"):
            row["slot"] = it["slot"]
        if it.get("stage"):
            row["stage"] = it["stage"]
        payload.append(row)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, path)


def write_skill(skill_id: str, meta: dict, body: str) -> dict:
    folder = skill_folder(skill_id)
    folder.mkdir(parents=True, exist_ok=True)
    tmp = folder / "SKILL.md.tmp"
    tmp.write_text(dump_skill_md(meta, body), encoding="utf-8")
    os.replace(tmp, folder / "SKILL.md")
    rebuild_manifest(list_skills())
    item = skill_item(folder)
    if not item:
        raise ValueError("技能写入后无法读取")
    return item


def create_custom_skill(data: dict) -> dict:
    body = str(data.get("body") or "").strip()
    if not body:
        raise ValueError("技能正文不能为空")
    if len(body.encode("utf-8")) > MAX_SKILL_BODY:
        raise ValueError("技能正文超过 64KB")
    name = str(data.get("name") or "").strip() or "未命名技能"
    slot = str(data.get("slot") or "").strip()
    if not slot:
        raise ValueError("请选择技能所属流程")
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40]
    base = "custom-" + (slug or uuid.uuid4().hex[:8])
    skill_id = base
    n = 2
    while skill_folder(skill_id).exists():
        skill_id = f"{base}-{n}"
        n += 1
    meta = {
        "name": name,
        "description": str(data.get("description") or "").strip(),
        "slot": slot,
        "stage": str(data.get("stage") or "").strip(),
        "origin": "custom",
        "version": str(data.get("version") or "1.0.0").strip(),
    }
    return write_skill(skill_id, meta, body)


def update_custom_skill(skill_id: str, data: dict) -> dict:
    if not CUSTOM_ID_RE.match(skill_id):
        raise ValueError("只能编辑自定义技能")
    folder = skill_folder(skill_id)
    md = folder / "SKILL.md"
    if not md.is_file():
        raise ValueError("技能不存在")
    meta, old_body = parse_skill_md(md.read_text(encoding="utf-8"))
    origin = meta.get("origin") or ("custom" if folder.name.startswith("custom-") else "builtin")
    if origin != "custom":
        raise ValueError("内置技能只读")
    if "body" in data:
        body = str(data.get("body") or "").strip()
        if not body:
            raise ValueError("技能正文不能为空")
        if len(body.encode("utf-8")) > MAX_SKILL_BODY:
            raise ValueError("技能正文超过 64KB")
    else:
        body = old_body
    if data.get("name"):
        meta["name"] = str(data["name"]).strip()
    if "description" in data:
        meta["description"] = str(data.get("description") or "").strip()
    if data.get("slot"):
        meta["slot"] = str(data["slot"]).strip()
    if "stage" in data:
        meta["stage"] = str(data.get("stage") or "").strip()
    meta["origin"] = "custom"
    return write_skill(skill_id, meta, body)


def delete_custom_skill(skill_id: str) -> None:
    if not CUSTOM_ID_RE.match(skill_id):
        raise ValueError("只能删除自定义技能")
    folder = skill_folder(skill_id)
    md = folder / "SKILL.md"
    if not md.is_file():
        raise ValueError("技能不存在")
    meta, _ = parse_skill_md(md.read_text(encoding="utf-8"))
    origin = meta.get("origin") or ("custom" if folder.name.startswith("custom-") else "builtin")
    if origin != "custom":
        raise ValueError("内置技能只读")
    shutil.rmtree(folder)
    rebuild_manifest(list_skills())


def import_custom_skill(data: dict) -> dict:
    content = str(data.get("content") or "")
    if not content.strip():
        raise ValueError("SKILL.md 内容为空")
    meta, body = parse_skill_md(content)
    body = body.strip() or content.strip()
    slot = str(data.get("slot") or meta.get("slot") or "").strip()
    if not slot:
        raise ValueError("请选择技能所属流程")
    return create_custom_skill({
        "name": str(data.get("name") or meta.get("name") or "").strip() or "导入技能",
        "description": str(data.get("description") or meta.get("description") or "").strip(),
        "slot": slot,
        "stage": str(data.get("stage") or meta.get("stage") or "").strip(),
        "body": body,
        "version": meta.get("version") or "1.0.0",
    })


def read_skill_file(skill_id: str) -> dict:
    folder = skill_folder(skill_id)
    md = folder / "SKILL.md"
    if not md.is_file():
        raise ValueError("技能不存在")
    return {
        "id": skill_id,
        "filename": f"{skill_id}.md",
        "content": md.read_text(encoding="utf-8"),
    }


def _pick_windows_dir(base: str) -> str:
    """Windows 原生目录选择框（PowerShell + WinForms）；取消返回空字符串。

    用一个置顶的透明所有者窗口承载对话框，避免从浏览器或后台服务拉起时
    选择框落在其它窗口后面。
    """
    exe = shutil.which("powershell") or shutil.which("pwsh")
    if not exe:
        raise RuntimeError("找不到 PowerShell，无法打开目录选择框，请手动填写路径")
    safe = str(base).replace("'", "''")
    script = "\n".join([
        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;",
        "Add-Type -AssemblyName System.Windows.Forms;",
        "Add-Type -AssemblyName System.Drawing;",
        "$owner = New-Object System.Windows.Forms.Form;",
        "$owner.Text = '选择项目保存目录';",
        "$owner.ShowInTaskbar = $false;",
        "$owner.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None;",
        "$owner.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen;",
        "$owner.Size = New-Object System.Drawing.Size(1, 1);",
        "$owner.TopMost = $true;",
        "$owner.Opacity = 0;",
        "$owner.Show();",
        "$owner.Activate();",
        "$d = New-Object System.Windows.Forms.FolderBrowserDialog;",
        "$d.Description = '选择项目保存目录';",
        "$d.ShowNewFolderButton = $true;",
        f"if (Test-Path -LiteralPath '{safe}') {{ $d.SelectedPath = '{safe}' }};",
        "$ok = $d.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK;",
        "$owner.Close();",
        "$owner.Dispose();",
        "if ($ok) { [Console]::Out.Write($d.SelectedPath) }",
    ])
    try:
        proc = subprocess.run(
            [exe, "-NoProfile", "-STA", "-Command", script],
            capture_output=True,
            encoding="utf-8",
            errors="replace",
            timeout=600,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RuntimeError(f"打开目录选择框失败：{exc}") from exc
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or "打开目录选择框失败").strip())
    return proc.stdout.strip()


def _pick_mac_dir(base: str) -> str:
    """macOS 原生目录选择框（osascript）；取消返回空字符串。"""
    exe = shutil.which("osascript")
    if not exe:
        raise RuntimeError("找不到 osascript，无法打开目录选择框，请手动填写路径")
    safe = str(base).replace("\\", "\\\\").replace('"', '\\"')
    script = (
        'POSIX path of (choose folder with prompt "选择项目保存目录" '
        f'default location POSIX file "{safe}")'
    )
    try:
        proc = subprocess.run(
            [exe, "-e", script],
            capture_output=True,
            encoding="utf-8",
            errors="replace",
            timeout=600,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RuntimeError(f"打开目录选择框失败：{exc}") from exc
    if proc.returncode != 0:
        return ""  # 用户取消
    return proc.stdout.strip().rstrip("/") or "/"


def pick_directory(start: Path | None = None) -> str:
    """弹出系统目录选择框，返回绝对路径；用户取消返回空字符串。"""
    base = str(start or workspace_path() or Path.home())

    if sys.platform.startswith("win"):
        return _pick_windows_dir(base)
    if sys.platform == "darwin":
        return _pick_mac_dir(base)

    env = dict(os.environ)
    env.setdefault("DISPLAY", ":0")
    backends = [
        ["zenity", "--file-selection", "--directory", "--title=选择项目保存目录", f"--filename={base}/"],
        ["kdialog", "--getexistingdirectory", base],
    ]
    for cmd in backends:
        if not shutil.which(cmd[0]):
            continue
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300, env=env)
        except (OSError, subprocess.TimeoutExpired):
            continue
        if proc.returncode == 0:
            return proc.stdout.strip()
        return ""  # 用户取消
    raise RuntimeError("系统里没有可用的目录选择框（zenity / kdialog），请手动填写路径")


def project_dir(ws: Path, project_id: str) -> Path:
    return ws / "projects" / project_id


def media_dir(ws: Path, project_id: str) -> Path:
    folder = project_dir(ws, project_id) / "media"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def save_remote_media(ws: Path, project_id: str, url: str) -> dict:
    """把 ComfyUI 的 /view 地址转存进项目目录。

    ComfyUI 的临时输出会在重启后失效，直接存外部地址会让图片和音频全部裂掉；
    转存后项目自带媒体，换机器、重启服务都不受影响。
    """
    raw = str(url or "").strip()
    if not re.match(r"^https?://", raw, re.I):
        raise ValueError("只支持 http/https 媒体地址")
    if not (project_dir(ws, project_id) / "project.json").is_file():
        raise ValueError("项目不存在")
    req = urllib.request.Request(raw, headers={"User-Agent": "DirectorMasterH5/1.0"})
    with urllib.request.urlopen(req, timeout=15) as res:
        mime = (res.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        data = res.read(MAX_MEDIA_BYTES + 1)
    if not data:
        raise ValueError("下载到的媒体文件为空")
    if len(data) > MAX_MEDIA_BYTES:
        raise ValueError("媒体文件超过 64MB")
    ext = mimetypes.guess_extension(mime) if mime.startswith(("image/", "audio/", "video/")) else ""
    if not ext:
        # ComfyUI 的地址形如 /view?filename=xxx.png，按 query 里的文件名补扩展名
        query = parse_qs(urlparse(raw).query)
        candidates = [(query.get("filename") or [""])[0], urlparse(raw).path]
        ext = next((Path(c).suffix.lower() for c in candidates if re.match(r"^\.[a-z0-9]{1,8}$", Path(c).suffix.lower() or "")), "")
    if not re.match(r"^\.[a-z0-9]{1,8}$", ext or ""):
        ext = ".bin"
    name = hashlib.sha1(data).hexdigest()[:16] + ext
    target = media_dir(ws, project_id) / name
    if not target.is_file():
        tmp = target.with_name(target.name + "." + uuid.uuid4().hex[:6] + ".tmp")
        tmp.write_bytes(data)
        os.replace(tmp, target)
    return {"url": f"/api/media/{project_id}/{name}", "mime": mime, "size": len(data)}


def list_projects(ws: Path) -> list[dict]:
    items: list[dict] = []
    root = ws / "projects"
    if not root.is_dir():
        return items
    for folder in sorted(root.iterdir()):
        if not folder.is_dir() or not ID_RE.match(folder.name):
            continue
        data_file = folder / "project.json"
        if not data_file.is_file():
            continue
        try:
            data = json.loads(data_file.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        items.append({
            "id": data.get("id") or folder.name,
            "name": data.get("name") or "未命名项目",
            "mode": data.get("mode") or "original",
            "episodes": int((data.get("topic") or {}).get("episodes") or 1),
            "updatedAt": data.get("updatedAt") or int(data_file.stat().st_mtime * 1000),
        })
    items.sort(key=lambda it: it.get("updatedAt") or 0, reverse=True)
    return items


class Handler(SimpleHTTPRequestHandler):
    server_version = "DirectorMasterH5/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    # ---------- 基础 ----------

    def log_message(self, fmt, *args):
        if self.path.startswith("/api/"):
            super().log_message(fmt, *args)

    def end_headers(self):
        path = urlparse(self.path).path
        if path.startswith("/api/media/"):
            # 媒体文件名是内容哈希，可以长期缓存
            pass
        elif path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        elif path in ("", "/") or path.endswith((".js", ".mjs", ".css", ".html")):
            # 代码和样式不走缓存，避免改完刷新还是旧版本
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, payload, code: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            raise ValueError("请求体为空或过大")
        raw = self.rfile.read(length)
        data = json.loads(raw.decode("utf-8"))
        if not isinstance(data, dict):
            raise ValueError("请求体必须是 JSON 对象")
        return data

    def api_path(self) -> str:
        return urlparse(self.path).path

    def send_media(self, target: Path) -> None:
        """按 Range 返回媒体文件，让音频可以拖动进度。"""
        size = target.stat().st_size
        mime = MEDIA_MIME.get(target.suffix.lower()) or mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        start, end, status = 0, max(size - 1, 0), 200
        m = re.match(r"^bytes=(\d*)-(\d*)$", (self.headers.get("Range") or "").strip())
        if m and size > 0:
            a, b = m.group(1), m.group(2)
            if a:
                start = int(a)
                end = min(int(b), size - 1) if b else size - 1
            elif b:
                start = max(0, size - int(b))
            if start > end or start >= size:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            status = 206
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        self.end_headers()
        with open(target, "rb") as fh:
            fh.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                chunk = fh.read(min(1024 * 256, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)

    # ---------- 路由 ----------

    def do_GET(self):
        path = self.api_path()
        if path == "/api/skills":
            return self.send_json({"skills": list_skills()})
        if path.startswith("/api/skills/") and path.endswith("/file"):
            skill_id = unquote(path[len("/api/skills/"):-len("/file")])
            try:
                return self.send_json(read_skill_file(skill_id))
            except ValueError as exc:
                return self.send_json({"error": str(exc)}, 404)
        if path == "/api/status":
            ws = workspace_path()
            return self.send_json({
                "online": True,
                "workspace": str(ws) if ws else "",
                "suggested": str(DEFAULT_WORKSPACE),
            })
        if path.startswith("/api/media/"):
            ws = workspace_path()
            if not ws:
                return self.send_json({"error": "尚未设置工作目录"}, 409)
            parts = unquote(path[len("/api/media/"):]).split("/")
            if len(parts) != 2 or not ID_RE.match(parts[0]) or not MEDIA_FILE_RE.match(parts[1]):
                return self.send_json({"error": "媒体路径非法"}, 400)
            folder = media_dir(ws, parts[0]).resolve()
            target = (folder / parts[1]).resolve()
            if not target.is_file() or folder not in target.parents:
                return self.send_json({"error": "媒体不存在"}, 404)
            return self.send_media(target)
        if path == "/api/pick-dir":
            try:
                chosen = pick_directory()
            except RuntimeError as exc:
                return self.send_json({"error": str(exc)}, 501)
            if not chosen:
                return self.send_json({"cancelled": True})
            return self.send_json({"path": chosen})
        if path == "/api/projects":
            ws = workspace_path()
            if not ws:
                return self.send_json({"error": "尚未设置工作目录"}, 409)
            return self.send_json({"workspace": str(ws), "projects": list_projects(ws)})
        if path.startswith("/api/projects/"):
            ws = workspace_path()
            if not ws:
                return self.send_json({"error": "尚未设置工作目录"}, 409)
            project_id = unquote(path[len("/api/projects/"):])
            if not ID_RE.match(project_id):
                return self.send_json({"error": "项目 ID 非法"}, 400)
            data_file = project_dir(ws, project_id) / "project.json"
            if not data_file.is_file():
                return self.send_json({"error": "项目不存在"}, 404)
            try:
                return self.send_json(json.loads(data_file.read_text(encoding="utf-8")))
            except (OSError, ValueError) as exc:
                return self.send_json({"error": f"读取项目失败：{exc}"}, 500)
        return super().do_GET()

    def do_POST(self):
        path = self.api_path()
        try:
            if path == "/api/skills/import":
                data = self.read_json()
                return self.send_json({"skill": import_custom_skill(data)}, 201)
            if path == "/api/skills":
                data = self.read_json()
                return self.send_json({"skill": create_custom_skill(data)}, 201)
            if path == "/api/workspace":
                data = self.read_json()
                raw = str(data.get("path") or "").strip()
                if not raw:
                    return self.send_json({"error": "请填写目录路径"}, 400)
                ws = ensure_workspace(Path(raw))
                config = read_config()
                config["workspace"] = str(ws)
                write_config(config)
                return self.send_json({"workspace": str(ws), "projects": list_projects(ws)})
            if path == "/api/media":
                data = self.read_json()
                ws = workspace_path()
                if not ws:
                    return self.send_json({"error": "尚未设置工作目录"}, 409)
                project_id = str(data.get("projectId") or "").strip()
                if not ID_RE.match(project_id):
                    return self.send_json({"error": "项目 ID 非法"}, 400)
                return self.send_json(save_remote_media(ws, project_id, data.get("url")))
            if path.startswith("/api/packs/"):
                ws = workspace_path()
                if not ws:
                    return self.send_json({"error": "尚未设置工作目录"}, 409)
                name = unquote(path[len("/api/packs/"):])
                if not PACK_RE.match(name):
                    return self.send_json({"error": "导演包文件名非法"}, 400)
                length = int(self.headers.get("Content-Length") or 0)
                if length <= 0 or length > MAX_BODY:
                    return self.send_json({"error": "文件为空或过大"}, 400)
                target = (ws / "packs" / name).resolve()
                if ws.resolve() not in target.parents:
                    return self.send_json({"error": "路径非法"}, 400)
                tmp = target.with_suffix(".tmp")
                remaining = length
                with open(tmp, "wb") as out:
                    while remaining > 0:
                        chunk = self.rfile.read(min(1024 * 1024, remaining))
                        if not chunk:
                            break
                        out.write(chunk)
                        remaining -= len(chunk)
                os.replace(tmp, target)
                return self.send_json({"path": str(target), "size": target.stat().st_size})
        except ValueError as exc:
            return self.send_json({"error": str(exc)}, 400)
        except OSError as exc:
            return self.send_json({"error": f"写入失败：{exc}"}, 500)
        return self.send_json({"error": "未知接口"}, 404)

    def do_PUT(self):
        path = self.api_path()
        if path.startswith("/api/skills/"):
            skill_id = unquote(path[len("/api/skills/"):])
            try:
                data = self.read_json()
                return self.send_json({"skill": update_custom_skill(skill_id, data)})
            except ValueError as exc:
                return self.send_json({"error": str(exc)}, 400)
            except OSError as exc:
                return self.send_json({"error": f"写入失败：{exc}"}, 500)
        if not path.startswith("/api/projects/"):
            return self.send_json({"error": "未知接口"}, 404)
        ws = workspace_path()
        if not ws:
            return self.send_json({"error": "尚未设置工作目录"}, 409)
        project_id = unquote(path[len("/api/projects/"):])
        if not ID_RE.match(project_id):
            return self.send_json({"error": "项目 ID 非法"}, 400)
        try:
            data = self.read_json()
        except ValueError as exc:
            return self.send_json({"error": str(exc)}, 400)
        if str(data.get("id") or "") != project_id:
            return self.send_json({"error": "项目 ID 不匹配"}, 400)
        folder = project_dir(ws, project_id)
        try:
            folder.mkdir(parents=True, exist_ok=True)
            tmp = folder / "project.json.tmp"
            tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            os.replace(tmp, folder / "project.json")
        except OSError as exc:
            return self.send_json({"error": f"写入失败：{exc}"}, 500)
        return self.send_json({"ok": True, "path": str(folder / "project.json")})

    def do_DELETE(self):
        path = self.api_path()
        if path.startswith("/api/skills/"):
            skill_id = unquote(path[len("/api/skills/"):])
            try:
                delete_custom_skill(skill_id)
                return self.send_json({"ok": True})
            except ValueError as exc:
                return self.send_json({"error": str(exc)}, 400)
            except OSError as exc:
                return self.send_json({"error": f"删除失败：{exc}"}, 500)
        if not path.startswith("/api/projects/"):
            return self.send_json({"error": "未知接口"}, 404)
        ws = workspace_path()
        if not ws:
            return self.send_json({"error": "尚未设置工作目录"}, 409)
        project_id = unquote(path[len("/api/projects/"):])
        if not ID_RE.match(project_id):
            return self.send_json({"error": "项目 ID 非法"}, 400)
        folder = project_dir(ws, project_id)
        if not folder.is_dir():
            return self.send_json({"error": "项目不存在"}, 404)
        try:
            shutil.rmtree(folder)
        except OSError as exc:
            return self.send_json({"error": f"删除失败：{exc}"}, 500)
        return self.send_json({"ok": True})


def main() -> None:
    parser = argparse.ArgumentParser(description="AI视频导演助手 H5 本地服务")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    ws = workspace_path()
    print(f"AI视频导演助手 H5 已启动：http://{args.host}:{args.port}/")
    print(f"工作目录：{ws if ws else '未设置（打开页面后选择）'}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
