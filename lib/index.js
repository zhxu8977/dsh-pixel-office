/**
 * dsh-pixel-office6 — 宿主半侧（多办公室 + 实时会话 + 消息）
 *  GET  /dsh-pixel-office/state             状态（boss / offices / members / messages）
 *  GET  /dsh-pixel-office/sessions          当前 DSH 的会话列表（标题 / 工作区 / 最后活动）
 *  GET  /dsh-pixel-office/sprites|catalog|sprite/<file>
 *  POST /dsh-pixel-office/set               改成员 / 董事长属性
 *  POST /dsh-pixel-office/office            新建 / 改名 / 删除办公室
 *  POST /dsh-pixel-office/message           发一条消息（精灵之间 / 办公室之间）
 *  POST /dsh-pixel-office/messages/clear    清空消息
 *  POST /dsh-pixel-office/fetch-sprite      下载素材
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const name = 'dsh-pixel-office6';

const PREFIX = '/dsh-pixel-office';
const MIME = {
  '.gif': 'image/gif', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};
const SOURCES = [
  ['https://play.pokemonshowdown.com/sprites/gen5ani/', 'gif'],
  ['https://play.pokemonshowdown.com/sprites/ani/', 'gif'],
  ['https://play.pokemonshowdown.com/sprites/gen5/', 'png'],
  ['https://play.pokemonshowdown.com/sprites/dex/', 'png'],
];

function paths() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  const root = path.join(home, 'pixel-office');
  return {
    home, root,
    stateFile: path.join(root, 'state.json'),
  diagFile: path.join(root, 'diag.json'),
    spriteDir: path.join(root, 'sprites'),
    catalogFile: path.join(root, 'catalog.json'),
    trainersFile: path.join(root, 'trainers.json'),
    historyFile: path.join(root, 'history.json'),
    projCache: path.join(home, 'storages', 'session_projcache', 'sessions'),
  };
}
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8'); }
function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    request.on('data', (c) => chunks.push(c));
    request.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { resolve({}); } });
    request.on('error', () => resolve({}));
  });
}
function json(response, status, payload) {
  response.writeHead(status, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
  response.end(JSON.stringify(payload));
}
function listSprites(spriteDir) {
  try {
    const files = fs.readdirSync(spriteDir);
    const gifs = files.filter((f) => f.endsWith('.gif')).map((f) => f.slice(0, -4));
    const pngs = files.filter((f) => f.endsWith('.png') && !f.startsWith('trainer-')).map((f) => f.slice(0, -4));
    const trainers = files.filter((f) => f.startsWith('trainer-') && f.endsWith('.png')).map((f) => f.slice(8, -4));
    return { pokemon: Array.from(new Set(gifs.concat(pngs))).sort(), animated: gifs.sort(), trainers: trainers.sort() };
  } catch { return { pokemon: [], animated: [], trainers: [] }; }
}
/** 读取本机 DSH 会话投影缓存，得到"有哪些对话、在哪个工作区、最后活动时间" */
function listSessions(projCache) {
  const out = [];
  let files = [];
  try { files = fs.readdirSync(projCache).filter((f) => f.startsWith('session-') && f.endsWith('.json')); } catch { return out; }
  const rows = [];
  for (const file of files) {
    const full = path.join(projCache, file);
    try {
      const stat = fs.statSync(full);
      if (stat.size > 8 * 1024 * 1024) continue;
      rows.push({ file, full, mtime: stat.mtimeMs });
    } catch { /* ignore */ }
  }
  rows.sort((a, b) => b.mtime - a.mtime);
  for (const row of rows.slice(0, 20)) {
    const data = readJson(row.full, null);
    if (!data) continue;
    const record = data.record || {};
    const title = (record.rows && record.rows.title && record.rows.title.val) || '';
    const cwd = (record.identity && record.identity.cwd) || '';
    out.push({
      id: row.file.replace(/^session-/, '').replace(/\.json$/, ''),
      title: String(title || '(未命名)'),
      cwd: String(cwd),
      workspace: String(cwd).split(/[\\/]/).filter(Boolean).pop() || '',
      lastActive: row.mtime,
      active: Date.now() - row.mtime < 10 * 60 * 1000,
    });
  }
  return out;
}
/** --- 自动同步（2026-10-10 追加） ------------------------------------------
 *  背景：插件原本只认"会话主动上报"，会话不调 /set 就永远不出现在办公室；
 *        且 /set 不传 office 时会落到 offices[0]，跨工作区看起来就像"没同步"。
 *  现在：按工作区自动把会话接入对应办公室，并用会话投影缓存的 mtime 判定忙闲。
 *  配置：<DSH_HOME>/pixel-office/routing.json
 * ------------------------------------------------------------------------ */
const ROUTING_DEFAULTS = {
  version: 1,
  autoSync: { enabled: true, intervalMs: 5000, busyWindowMs: 180000, manualStaleMs: 600000, maxSessions: 20 },
  rules: [],
  fallbackOffice: null,
};
function loadRouting(root) {
  const file = path.join(root, 'routing.json');
  const raw = readJson(file, null);
  const conf = Object.assign({}, ROUTING_DEFAULTS, raw || {});
  conf.autoSync = Object.assign({}, ROUTING_DEFAULTS.autoSync, (raw && raw.autoSync) || {});
  conf.rules = Array.isArray(conf.rules) ? conf.rules : [];
  if (!raw) { try { fs.writeFileSync(file, JSON.stringify(conf, null, 2), 'utf8'); } catch { /* ignore */ } }
  return conf;
}
/** 只按 rules 命中找办公室；没命中返回空（不参与兜底） */
function ruleOfficeForWorkspace(conf, offices, workspace) {
  const ws = String(workspace || '');
  const list = Array.isArray(offices) ? offices : [];
  if (!ws) return '';
  for (const rule of (conf && conf.rules) || []) {
    if (!rule || !rule.workspace || !rule.office) continue;
    const key = String(rule.workspace);
    const mode = rule.match || 'exact';
    const hit = mode === 'prefix' ? ws.startsWith(key) : mode === 'contains' ? ws.includes(key) : ws === key;
    if (hit && list.some((o) => o.id === rule.office)) return rule.office;
  }
  return '';
}
function fallbackOffice(conf, offices) {
  const list = Array.isArray(offices) ? offices : [];
  const fb = conf && conf.fallbackOffice;
  return fb && list.some((o) => o.id === fb) ? fb : '';
}
function ruleNameForWorkspace(conf, workspace) {
  const ws = String(workspace || '');
  const hit = ((conf && conf.rules) || []).find((r) => r && r.workspace === ws && r.name);
  return hit ? String(hit.name) : '';
}
/** 工作区名 -> 办公室 id（rules 命中优先，其次 fallbackOffice，都没有则返回空=不接管） */
function officeForWorkspace(conf, offices, workspace) {
  return ruleOfficeForWorkspace(conf, offices, workspace) || fallbackOffice(conf, offices);
}
function shortSessionId(sessionId) { return 'sess-' + String(sessionId || '').replace(/-/g, '').slice(0, 8); }
/** 把当前会话列表同步进 state.members，返回是否有改动（自动成员带 auto:true 标记，不会碰手工成员） */
function syncSessions(state, conf, sessions) {
  const offices = Array.isArray(state.offices) ? state.offices : [];
  state.members = Array.isArray(state.members) ? state.members : [];
  const cfg = (conf && conf.autoSync) || {};
  const busyWindow = Number(cfg.busyWindowMs) || 180000;
  const maxSessions = Number(cfg.maxSessions) || 20;
  const now = Date.now();
  const filters = (conf && conf.filters) || {};
  const skipTitles = Array.isArray(filters.skipTitles) ? filters.skipTitles : [];
  const skipPrefixes = Array.isArray(filters.skipTitlePrefixes) ? filters.skipTitlePrefixes : [];
  let changed = false;
  const seen = new Set();
  for (const s of sessions.slice(0, maxSessions)) {
    const id = shortSessionId(s.id);
    const ruled = ruleOfficeForWorkspace(conf, offices, s.workspace);
    const fb = fallbackOffice(conf, offices);
    const title = String(s.title || '');
    // 噪音过滤：占位标题不占工位（等它有正式标题了再自动进来）
    if (skipTitles.indexOf(title) >= 0) continue;
    if (skipPrefixes.some((p) => title.indexOf(p) === 0)) continue;
    let member = state.members.find((m) => m.sessionId === s.id) || state.members.find((m) => m.id === id);
    if (!member) {
      const home = ruled || fb;
      if (!home) continue; // 既无规则也无兜底：不接管这个工作区
      member = { id, name: ruleNameForWorkspace(conf, s.workspace) || title || id, role: '会话员工', model: '', provider: '', sprite: 'eevee', office: home, auto: true };
      state.members.push(member);
      changed = true;
    }
    seen.add(member.id);
    // 办公室：只有明确规则才改；否则保留你手工摆的位置（位置失效才回落兜底）
    if (ruled) {
      if (member.office !== ruled) { member.office = ruled; changed = true; }
    } else if (!member.office || !offices.some((o) => o.id === member.office)) {
      if (fb) { member.office = fb; changed = true; }
    }
    // —— 真实时相位：用会话投影缓存的更新时间判定"此刻在干什么" ——
    const age = now - s.lastActive;
    let status, task;
    if (age < 20000) { status = 'busy'; task = title + ' · 执行中'; }
    else if (age < 120000) { status = 'thinking'; task = title + ' · 收尾'; }
    else if (age < 1800000) { status = 'idle'; task = ''; }
    else { status = 'offline'; task = ''; }
    const patch = {
      sessionId: s.id,
      workspace: s.workspace,
      auto: true,
      lastActive: s.lastActive,
      status: status,
      task: task,
    };
    for (const k of Object.keys(patch)) {
      if (member[k] !== patch[k]) { member[k] = patch[k]; changed = true; }
    }
  }
  for (const m of state.members) {
    if (m.auto && !seen.has(m.id) && m.status !== 'offline') { m.status = 'offline'; m.task = ''; changed = true; }
  }
  // —— 手工精灵的真话化：没人给它派活、也没有关联会话在跑，就不该一直显示忙碌 ——
  const STALE_MS = Number(cfg.manualStaleMs) || 10 * 60 * 1000;
  for (const m of state.members) {
    if (m.auto) continue;
    if (['busy', 'thinking', 'waiting'].indexOf(m.status) < 0) continue;
    const live = m.sessionId ? sessions.find((s) => s.id === m.sessionId) : null;
    if (live && now - live.lastActive < 180000) continue;   // 真有关联会话在跑，保留
    const stamp = Number(m.statusAt || 0);
    if (!stamp || now - stamp > STALE_MS) {
      m.status = 'idle';
      m.task = '';
      m.statusAt = 0;
      changed = true;
    }
  }
  return changed;
}
/** 读 state -> 同步 -> 有变化才写回。HTTP /sync 与插件内定时器共用；也可被外部脚本 import */
export function syncNow(P0, conf0) {
  const P = P0 || paths();
  const conf = conf0 || loadRouting(P.root);
  const state = readJson(P.stateFile, { offices: [], members: [], messages: [] });
  const sessions = listSessions(P.projCache);
  const changed = syncSessions(state, conf, sessions);
  if (changed) writeJson(P.stateFile, Object.assign(state, { updatedAt: Date.now() }));
  const auto = (state.members || []).filter((m) => m.auto);
  return {
    changed,
    sessions: sessions.length,
    autoTotal: auto.length,
    autoBusy: auto.filter((m) => m.status === 'busy').length,
  };
}

async function fetchSprite(name, spriteDir) {
  const clean = String(name || '').toLowerCase().trim().replace(/[^a-z0-9-]/g, '');
  if (!clean) return { ok: false, error: '缺少名字' };
  if (fs.existsSync(path.join(spriteDir, clean + '.gif')) || fs.existsSync(path.join(spriteDir, clean + '.png'))) {
    return { ok: true, name: clean, cached: true, sprites: listSprites(spriteDir) };
  }
  const results = {};
  for (const entry of SOURCES) {
    const url = entry[0] + clean + '.' + entry[1];
    try {
      const res = await fetch(url);
      if (!res.ok) { results[entry[0].split('/').slice(-2)[0]] = 'http ' + res.status; continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 120) { results[entry[0]] = 'too small'; continue; }
      fs.writeFileSync(path.join(spriteDir, clean + '.' + entry[1]), buf);
      return { ok: true, name: clean, from: url, bytes: buf.length, sprites: listSprites(spriteDir) };
    } catch (error) { results[entry[0]] = 'fail ' + String(error && error.message ? error.message : error); }
  }
  return { ok: false, name: clean, results, sprites: listSprites(spriteDir) };
}

/** 每 15 分钟把当前花名册与任务快照进 history.json（用于"昨天做了什么"） */
function snapshot(P, state) {
  try {
    const history = readJson(P.historyFile, { rows: [] });
    const rows = Array.isArray(history.rows) ? history.rows : [];
    const last = rows.length ? rows[rows.length - 1].ts : 0;
    if (Date.now() - last < 15 * 60 * 1000) return;
    rows.push({
      ts: Date.now(),
      members: (state.members || []).map((m) => ({ id: m.id, name: m.name, office: m.office, task: m.task || '', status: m.status || 'idle' })),
    });
    history.rows = rows.slice(-600);
    writeJson(P.historyFile, history);
  } catch { /* ignore */ }
}

function dayKey(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/** 生成早会报告：每个办公室"昨天/今天"出现过哪些任务（只给标题，不给细节） */
function standup(P) {
  const state = readJson(P.stateFile, { offices: [], members: [], messages: [] });
  const history = readJson(P.historyFile, { rows: [] });
  const rows = Array.isArray(history.rows) ? history.rows : [];
  const now = Date.now();
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = startOfToday.getTime() - 86400000;
  const offices = state.offices || [];
  const members = state.members || [];
  const report = offices.map((office) => {
    const team = members.filter((m) => m.office === office.id);
    const ids = new Set(team.map((m) => m.id));
    const yesterday = new Set();
    const today = new Set();
    for (const row of rows) {
      const day = row.ts >= startOfToday.getTime() ? 'today' : (row.ts >= startOfYesterday ? 'yesterday' : null);
      if (!day) continue;
      for (const m of row.members || []) {
        if (!ids.has(m.id)) continue;
        const title = String(m.task || '').trim();
        if (title) (day === 'today' ? today : yesterday).add(title);
      }
    }
    const leader = team.find((m) => m.id === office.leader) || team[0] || null;
    return {
      id: office.id, name: office.name, icon: office.icon || '🏢', purpose: office.purpose || '',
      leader: leader ? { id: leader.id, name: leader.name, sprite: leader.sprite, status: leader.status || 'idle', task: leader.task || '' } : null,
      headcount: team.length,
      busy: team.filter((m) => m.status === 'busy').length,
      yesterday: Array.from(yesterday).slice(0, 12),
      today: Array.from(today).slice(0, 12),
      members: team.map((m) => ({ id: m.id, name: m.name, role: m.role || '', sprite: m.sprite, status: m.status || 'idle', task: m.task || '' })),
    };
  });
  return { generatedAt: now, day: dayKey(now), offices: report, rows: rows.length };
}

/** 属性中文名 */
const TYPE_ZH = { Normal: '一般', Fire: '火', Water: '水', Electric: '电', Grass: '草', Ice: '冰', Fighting: '格斗', Poison: '毒', Ground: '地面', Flying: '飞行', Psychic: '超能力', Bug: '虫', Rock: '岩石', Ghost: '幽灵', Dragon: '龙', Dark: '恶', Steel: '钢', Fairy: '妖精' };
/** 任务关键词 -> 推荐属性（办公室为空时兜底用） */
const DOMAIN_TYPES = [
  [/专利|论文|实验|研究|综述|算法|模型|技术/, ['Electric', 'Steel', 'Psychic']],
  [/公众号|推文|文章|写作|稿|文案|排版|发布/, ['Grass', 'Poison', 'Fairy']],
  [/视频|剪辑|脚本|渲染|动画|配乐|封面/, ['Fire', 'Fighting', 'Flying']],
  [/日程|记账|提醒|待办|报销|行程|生活/, ['Psychic', 'Fairy', 'Dark']],
  [/教案|课件|出题|批改|小学|语文|数学|英语|教学/, ['Ground', 'Rock', 'Water']],
  [/数据|统计|报表|可视化|分析/, ['Steel', 'Psychic', 'Ground']],
  [/审查|合规|风控|红队|校验|安全/, ['Dark', 'Ghost', 'Fighting']],
];
/** 人数推断：先看任务体量，再看是否要求"全面/系统" */
function planCount(brief) {
  const t = String(brief || '');
  let n = 1;
  const reasons = [];
  if (/论文|专利|交底书|报告|方案|白皮书|标书|综述|研究计划/.test(t)) { n = 4; reasons.push('长篇正式产出（论文/专利/报告类）→ 4 人分工'); }
  else if (/文档|文章|推文|公众号|稿|教案|课件|脚本|课程/.test(t)) { n = 3; reasons.push('中等篇幅产出（文章/教案/脚本类）→ 3 人分工'); }
  else if (/整理|汇总|收集|调研|检索|查|找|对比/.test(t)) { n = 2; reasons.push('资料型任务（检索/整理）→ 2 人'); }
  else { reasons.push('单一动作任务 → 1 人'); }
  if (/全面|系统|完整|一套|系列|多个|大量|深入|详尽/.test(t)) { n = Math.min(6, n + 1); reasons.push('任务要求"全面/系统" → 追加 1 人'); }
  if (/简单|快速|一句话|小改|简版|粗略/.test(t)) { n = Math.max(1, n - 1); reasons.push('任务标注"简单/快速" → 减 1 人'); }
  return { n: Math.max(1, Math.min(6, n)), reasons };
}
const ROLES = {
  1: ['执行'],
  2: ['主笔', '校对'],
  3: ['主笔', '资料检索', '校对'],
  4: ['主笔', '资料检索', '校对', '交付发布'],
  5: ['主笔', '资料检索', '数据分析', '校对', '交付发布'],
  6: ['主笔', '资料检索', '数据分析', '可视化', '校对', '交付发布'],
};
/** 扫描 DSH profile 里 providers 段的真实模型列表 */
function resolveHome() {
  const cands = [];
  if (process.env.DSH_HOME) cands.push(process.env.DSH_HOME);
  try { cands.push(path.join(os.homedir(), '.dsh')); } catch (e) { /* ignore */ }
  if (process.env.USERPROFILE) cands.push(path.join(process.env.USERPROFILE, '.dsh'));
  cands.push('C:\\Users\\admin\\.dsh');
  for (const c of cands) { try { if (fs.existsSync(path.join(c, 'profiles'))) return c; } catch (e) { /* ignore */ } }
  return cands[0] || '';
}

function readApiKeys(home) {
  const keys = {};
  try { for (const k of Object.keys(process.env)) if (process.env[k] && /_?api_?key$/i.test(k)) keys[k.toLowerCase()] = process.env[k]; } catch (e) { /* ignore */ }
  try {
    for (const line of fs.readFileSync(path.join(home, '.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
      if (m) keys[m[1].toLowerCase()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch (e) { /* ignore */ }
  try {
    for (const line of fs.readFileSync(path.join(home, '.credentials.yaml'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]*api_?key)\s*:\s*([^\s#]+)\s*$/i);
      if (m) keys[m[1].toLowerCase()] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch (e) { /* ignore */ }
  return keys;
}

/** 解析 profile 里 providers 段：得到每个服务商的 baseURL / apiKeyEnv / 已声明模型 */
function parseProviders(home) {
  const provs = [];
  let def = '';
  let dirs = [];
  try { dirs = fs.readdirSync(path.join(home, 'profiles')); } catch (e) { dirs = []; }
  for (const d of dirs) {
    const f = path.join(home, 'profiles', d, 'cordis.patch.yml');
    let txt = '';
    try { txt = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
    if (!def) { const m = txt.match(/agent-default-model[\s\S]{0,600}?model:\s*([A-Za-z0-9_.:\/-]+)/); if (m) def = m[1]; }
    let cur = null, inModels = false;
    for (const line of txt.split(/\r?\n/)) {
      const pv = line.match(/^ {6}([A-Za-z0-9_.-]+):\s*$/);
      if (pv) {
        const skip = ['config', 'providers', 'models', 'compat', 'version', 'refs', 'records'];
        if (skip.indexOf(pv[1]) >= 0) { cur = null; inModels = false; continue; }
        cur = { id: pv[1], displayName: '', baseURL: '', apiKeyEnv: '', models: [] };
        provs.push(cur); inModels = false; continue;
      }
      if (!cur) continue;
      const dn = line.match(/^ {8}displayName:\s*(.+)$/);
      if (dn) { cur.displayName = dn[1].trim(); continue; }
      const bu = line.match(/^ {8}baseURL:\s*(\S+)\s*$/);
      if (bu) { cur.baseURL = bu[1].trim(); continue; }
      const ak = line.match(/^ {8}apiKeyEnv:\s*(\S+)\s*$/);
      if (ak) { cur.apiKeyEnv = ak[1].trim(); continue; }
      if (/^ {8}models:\s*$/.test(line)) { inModels = true; continue; }
      if (inModels) {
        if (/^ {8}\S/.test(line)) { inModels = false; continue; }
        const dm = line.match(/^\s*- id:\s*([A-Za-z0-9_.:\/-]+)/);
        if (dm) cur.models.push(dm[1]);
      }
    }
  }
  return { def, provs };
}

/** 模型列表：profile 已声明的 + 向服务商在线拉取（真正的"全部可用模型"） */
async function listModels(home) {
  const root = path.join(home, 'pixel-office');
  const cacheFile = path.join(root, 'models-cache.json');
  const cache = readJson(cacheFile, null);
  if (cache && cache.at && Date.now() - cache.at < 30 * 60 * 1000) return cache.data;

  const parsed = parseProviders(home);
  const keys = readApiKeys(home);
  const models = [];
  const byId = new Map();
  const errors = [];
  const add = (id, prov) => {
    if (!id) return;
    const k = String(id);
    if (byId.has(k)) { const arr = byId.get(k); if (prov && arr.indexOf(prov) < 0) arr.push(prov); return; }
    const arr = prov ? [prov] : [];
    byId.set(k, arr);
    models.push({ id: k, providers: arr });
  };
  for (const p of parsed.provs) for (const m of p.models) add(m, p.id);
  const declared = models.length;
  for (const p of parsed.provs) {
    const key = keys[String(p.apiKeyEnv || '').toLowerCase()];
    if (!p.baseURL) continue;
    if (!key) { errors.push(p.id + ': 未找到密钥(' + (p.apiKeyEnv || '未配置') + ')，仅用配置内 ' + p.models.length + ' 个'); continue; }
    try {
      const url = p.baseURL.replace(/\/+$/, '') + '/models';
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => { try { ctl.abort(); } catch (e) { /* ignore */ } }, 12000) : null;
      const res = await fetch(url, { headers: { authorization: 'Bearer ' + key }, signal: ctl ? ctl.signal : undefined });
      if (timer) clearTimeout(timer);
      const j = await res.json();
      const arr = Array.isArray(j && j.data) ? j.data : (Array.isArray(j && j.models) ? j.models : []);
      let added = 0;
      for (const it of arr) { const id = it && (it.id || it.name); if (id) { const before = models.length; add(id, p.id); if (models.length > before) added++; } }
      errors.push(p.id + ': 在线返回 ' + arr.length + ' 个（新增 ' + added + '）');
    } catch (e) {
      errors.push(p.id + ': 在线获取失败 ' + String((e && e.message) || e));
    }
  }
  const data = { defaultModel: parsed.def, home, declared, total: models.length, providers: parsed.provs.map((p) => ({ id: p.id, displayName: p.displayName, declared: p.models.length })), models, errors };
  try { fs.writeFileSync(cacheFile, JSON.stringify({ at: Date.now(), data }, null, 1), 'utf8'); } catch (e) { /* ignore */ }
  return data;
}
function typesOfSprite(sprite, cat) {
  const id = String(sprite || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!id) return [];
  const e = (cat || []).find((x) => x.id === id);
  return (e && e.types) || [];
}
function pickOfficeByTypes(state, types, cat) {
  const offices = state.offices || [];
  if (!offices.length) return 'main';
  if (!types || !types.length) return offices[0].id;
  let best = null, bestScore = 0;
  for (const o of offices) {
    const mem = (state.members || []).filter((m) => m.office === o.id);
    if (!mem.length) continue;
    let hit = 0;
    for (const m of mem) for (const t of typesOfSprite(m.sprite, cat)) if (types.indexOf(t) >= 0) hit++;
    const score = hit / mem.length;
    if (score > bestScore) { bestScore = score; best = o.id; }
  }
  return best || offices[0].id;
}

function officeTypes(state, officeId) {
  const cat = readJson(P_catalog(), []);
  const byId = {}; for (const e of cat) byId[e.id] = e;
  const set = [];
  for (const m of state.members || []) {
    if (m.office !== officeId) continue;
    const e = byId[m.sprite];
    for (const t of (e && e.types) || []) if (set.indexOf(t) < 0) set.push(t);
  }
  return set;
}
function P_catalog() { return paths().catalogFile; }

/** 按属性挑精灵：优先办公室已有的属性主题，其次按任务领域 */
function pickSprites(state, officeId, brief, n) {
  const cat = readJson(paths().catalogFile, []);
  const byId = {}; for (const e of cat) byId[e.id] = e;
  const used = new Set((state.members || []).map((m) => m.sprite));
  let types = officeTypes(state, officeId);
  let basis = '';
  if (types.length) basis = '沿用本室既有属性主题：' + types.map((t) => TYPE_ZH[t] || t).join('/');
  else {
    for (const pair of DOMAIN_TYPES) { if (pair[0].test(String(brief || ''))) { types = pair[1]; break; } }
    basis = types.length ? '按任务领域推断属性：' + types.map((t) => TYPE_ZH[t] || t).join('/') : '无匹配属性，按图鉴顺序';
  }
  const pool = cat.filter((e) => e.base !== false && !used.has(e.id) && (!types.length || (e.types || []).some((t) => types.indexOf(t) >= 0)));
  pool.sort((a, b) => (a.num || 0) - (b.num || 0));
  const picked = [];
  for (const e of pool) { if (picked.length >= n) break; picked.push(e); }
  // 池子不够就从全图鉴补
  if (picked.length < n) {
    const rest = cat.filter((e) => e.base !== false && !used.has(e.id) && !picked.includes(e));
    for (const e of rest) { if (picked.length >= n) break; picked.push(e); }
  }
  return { picked, basis };
}


/* ================= 独立窗口（Edge/Chrome --app 模式）=================
 * DSH 本身不允许插件开第二个应用窗口（主窗口 setWindowOpenHandler 直接 deny），
 * 所以用系统浏览器开一个普通窗口：非置顶、可被其他窗口盖住、进程独立，
 * 页面就是本插件自己的 /panel，靠轮询 /state 与对话内容联动。
 */
const PANEL_WINDOW = { pid: 0, url: '', at: 0 };

function displayPath() { return path.join(paths().root, 'display.json'); }
function loadDisplay() {
  const raw = readJson(displayPath(), null) || {};
  const size = raw.size && Number(raw.size.width) > 0 && Number(raw.size.height) > 0
    ? { width: Number(raw.size.width), height: Number(raw.size.height) }
    : { width: 560, height: 860 };
  return { mode: raw.mode === 'window' ? 'window' : 'sidebar', size, lastOpenedAt: Number(raw.lastOpenedAt) || 0 };
}
function browserExecutable() {
  const list = [
    process.env.DSH_PANEL_BROWSER,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  for (const candidate of list) { try { if (fs.existsSync(candidate)) return candidate; } catch { /* ignore */ } }
  return '';
}
function windowStatus() {
  let alive = false;
  if (PANEL_WINDOW.pid > 0) { try { process.kill(PANEL_WINDOW.pid, 0); alive = true; } catch { alive = false; } }
  if (!alive) PANEL_WINDOW.pid = 0;
  return { open: alive, pid: PANEL_WINDOW.pid, url: PANEL_WINDOW.url, browser: browserExecutable(), ...loadDisplay() };
}
function closePanelWindow() {
  const pid = PANEL_WINDOW.pid;
  PANEL_WINDOW.pid = 0;
  if (!pid) return { open: false };
  try { spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch { /* ignore */ }
  return { open: false };
}
function openPanelWindow(request, options = {}) {
  const exe = browserExecutable();
  if (!exe) throw new Error('没找到 Edge/Chrome，无法打开独立窗口');
  closePanelWindow();
  const hostHeader = String(request.headers.host || '127.0.0.1:19387');
  const url = 'http://' + hostHeader + PREFIX + '/panel';
  const display = loadDisplay();
  const width = Math.max(320, Number(options.width) || display.size.width);
  const height = Math.max(320, Number(options.height) || display.size.height);
  const profileDir = path.join(paths().root, 'window-profile');
  try { fs.mkdirSync(profileDir, { recursive: true }); } catch { /* ignore */ }
  const args = [
    '--app=' + url,
    '--user-data-dir=' + profileDir,
    '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-features=Translate',
    '--window-size=' + width + ',' + height,
  ];
  const child = spawn(exe, args, { detached: true, stdio: 'ignore', windowsHide: false });
  child.unref();
  PANEL_WINDOW.pid = Number(child.pid) || 0;
  PANEL_WINDOW.url = url;
  PANEL_WINDOW.at = Date.now();
  writeJson(displayPath(), { ...display, size: { width, height }, lastOpenedAt: PANEL_WINDOW.at });
  return { launched: true, pid: PANEL_WINDOW.pid, url };
}

export function apply(ctx) {
  const P = paths();
  try { fs.mkdirSync(P.spriteDir, { recursive: true }); } catch { /* ignore */ }

  ctx.inject(['webServer'], (host) => {
    host.effect(() => {
      let autoTimer = null;
      const scheduleAutoSync = () => {
        const conf = loadRouting(P.root);
        autoTimer = setTimeout(() => {
          try {
            const live = loadRouting(P.root);
            if (!live.autoSync || live.autoSync.enabled !== false) syncNow(P, live);
          } catch { /* ignore */ }
          scheduleAutoSync();
        }, Math.max(5000, Number(conf.autoSync && conf.autoSync.intervalMs) || 15000));
      };
      scheduleAutoSync();
      const dispose = host.webServer.register({
        kind: 'prefix',
        path: PREFIX,
        handler: async (request, response) => {
          let pathname = '/';
          try { pathname = new URL(request.url ?? '/', 'http://localhost').pathname; } catch { /* ignore */ }
          const sub = pathname.startsWith(PREFIX) ? (pathname.slice(PREFIX.length) || '/') : pathname;
          const method = (request.method || 'GET').toUpperCase();

        /* ---- 独立窗口要用的静态资源：插件自己的客户端 bundle 与 React ---- */
        if (method === 'GET' && (sub === '/client.js' || sub === '/vendor/react.js' || sub === '/vendor/react-dom.js')) {
          const rel = sub === '/client.js' ? ['lib', 'client.js'] : ['lib', 'vendor', sub.slice('/vendor/'.length)];
          const file = fileURLToPath(new URL('../' + rel.join('/'), import.meta.url));
          try {
            const body = fs.readFileSync(file);
            response.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-store' });
            response.end(body);
            return;
          } catch (error) { return json(response, 404, { ok: false, error: 'asset missing: ' + rel.join('/') }); }
        }
        /* ---- 独立窗口 / 面板路由（新增）---- */
        if (method === 'GET' && (sub === '/panel' || sub === '/panel/')) {
          try {
            const file = fileURLToPath(new URL('./panel.html', import.meta.url));
            const html = fs.readFileSync(file, 'utf8');
            response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
            response.end(html);
            return;
          } catch (error) { return json(response, 500, { ok: false, error: String((error && error.message) || error) }); }
        }
        if (method === 'GET' && sub === '/window') { return json(response, 200, { ok: true, ...windowStatus() }); }
        if (method === 'POST' && sub === '/window') {
          const body = await readBody(request);
          const action = String(body.action || 'open');
          try {
            if (action === 'open') return json(response, 200, { ok: true, ...openPanelWindow(request, body), ...windowStatus() });
            if (action === 'close') return json(response, 200, { ok: true, ...closePanelWindow(), ...windowStatus() });
            return json(response, 400, { ok: false, error: 'unknown action: ' + action });
          } catch (error) { return json(response, 500, { ok: false, error: String((error && error.message) || error) }); }
        }
        if (sub === '/display') {
          if (method === 'GET') return json(response, 200, { ok: true, ...loadDisplay() });
          if (method === 'POST') {
            const body = await readBody(request);
            const current = loadDisplay();
            const next = { ...current, mode: body.mode === 'window' ? 'window' : 'sidebar' };
            writeJson(displayPath(), { ...next, lastOpenedAt: current.lastOpenedAt });
            return json(response, 200, { ok: true, ...next });
          }
        }


          if (method === 'GET' && (sub === '/' || sub === '/state')) {
            const state = readJson(P.stateFile, { offices: [], members: [], messages: [] });
            snapshot(P, state);
            json(response, 200, state);
            return;
          }
          if (method === 'GET' && sub === '/sessions') return json(response, 200, { sessions: listSessions(P.projCache), home: P.home });
          if (method === 'GET' && sub === '/sprites') return json(response, 200, listSprites(P.spriteDir));
          if (method === 'GET' && sub === '/catalog') return json(response, 200, readJson(P.catalogFile, []));
          if (method === 'GET' && sub === '/trainers') return json(response, 200, readJson(P.trainersFile, { male: [], female: [] }));
          if (method === 'GET' && sub === '/standup') { json(response, 200, standup(P)); return; }
          if (method === 'POST' && sub === '/diag') {
            let body = null;
            try { body = await readBody(request); } catch (e) { body = { error: String(e) }; }
            writeJson(P.diagFile, { at: new Date().toISOString(), payload: body });
            return json(response, 200, { ok: true });
          }
          if (method === 'GET' && sub === '/diag') return json(response, 200, readJson(P.diagFile, {}));
          if (method === 'GET' && sub === '/models') { try { return json(response, 200, await listModels(P.home)); } catch (e) { return json(response, 500, { error: String(e && e.message || e) }); } }

          if (method === 'GET' && sub.startsWith('/sprite/')) {
            const wanted = path.basename(decodeURIComponent(sub.slice('/sprite/'.length)));
            const file = path.resolve(P.spriteDir, wanted);
            if (!file.startsWith(path.resolve(P.spriteDir)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
              response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
              response.end('sprite not found');
              return;
            }
            response.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'public, max-age=3600' });
            response.end(fs.readFileSync(file));
            return;
          }

          if (method === 'POST' && sub === '/set') {
            const body = await readBody(request);
            const state = readJson(P.stateFile, { offices: [], members: [] });
            const fields = ['name', 'role', 'model', 'provider', 'sprite', 'status', 'task', 'office', 'sessionId', 'workspace'];
            if (body.boss) {
              state.boss = Object.assign({ name: '董事长', title: '总指挥', sprite: 'trainer-red', status: 'idle', task: '' }, state.boss || {});
              for (const k of fields) if (body[k] !== undefined) state.boss[k] = body[k];
              if (body.title !== undefined) state.boss.title = body.title;
              writeJson(P.stateFile, Object.assign(state, { updatedAt: Date.now() }));
              return json(response, 200, { ok: true, boss: state.boss });
            }
            if (body.create) {
              state.members = Array.isArray(state.members) ? state.members : [];
              if (!body.office) { try { body.office = pickOfficeByTypes(state, typesOfSprite(body.sprite, readJson(P.catalogFile, [])), readJson(P.catalogFile, [])); } catch (e) { /* ignore */ } }
              if (state.members.some((m) => m.id === body.id)) return json(response, 409, { ok: false, error: '成员已存在：' + body.id });
              const member = { id: body.id, name: body.name || body.id, role: body.role || '数字员工', model: body.model || '', provider: body.provider || '', sprite: body.sprite || 'eevee', office: body.office || officeForWorkspace(loadRouting(P.root), state.offices || [], body.workspace) || (state.offices && state.offices[0] && state.offices[0].id) || 'main', status: body.status || 'idle', task: body.task || '' };
              state.members.push(member);
              writeJson(P.stateFile, Object.assign(state, { updatedAt: Date.now() }));
              return json(response, 200, { ok: true, member });
            }
            const member = (state.members || []).find((m) => m.id === body.id);
            if (!member) return json(response, 404, { ok: false, error: 'member not found: ' + body.id });
            for (const k of fields) if (body[k] !== undefined) member[k] = body[k];
            if (body.status !== undefined) member.statusAt = body.status === 'idle' ? 0 : Date.now();
            writeJson(P.stateFile, Object.assign(state, { updatedAt: Date.now() }));
            return json(response, 200, { ok: true, member });
          }

          if (method === 'POST' && sub === '/office') {
            const body = await readBody(request);
            const state = readJson(P.stateFile, { offices: [], members: [] });
            state.offices = Array.isArray(state.offices) ? state.offices : [];
            const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || ('office-' + Date.now());
            if (body.action === 'create') {
              const id = slug(body.id || body.name);
              if (state.offices.some((o) => o.id === id)) return json(response, 409, { ok: false, error: '办公室已存在：' + id });
              state.offices.push({ id, name: body.name || id, purpose: body.purpose || '', icon: body.icon || '🏢' });
            } else if (body.action === 'update') {
              const office = state.offices.find((o) => o.id === body.id);
              if (!office) return json(response, 404, { ok: false, error: 'office not found: ' + body.id });
              for (const k of ['name', 'purpose', 'icon', 'leader']) if (body[k] !== undefined) office[k] = body[k];
            } else if (body.action === 'delete') {
              if (state.offices.length <= 1) return json(response, 400, { ok: false, error: '至少保留一个办公室' });
              state.offices = state.offices.filter((o) => o.id !== body.id);
              const first = state.offices[0].id;
              for (const m of state.members || []) if (m.office === body.id) m.office = first;
            } else return json(response, 400, { ok: false, error: 'unknown action' });
            writeJson(P.stateFile, Object.assign(state, { updatedAt: Date.now() }));
            return json(response, 200, { ok: true, offices: state.offices });
          }

          if (method === 'POST' && sub === '/message') {
            const body = await readBody(request);
            const state = readJson(P.stateFile, { offices: [], members: [], messages: [] });
            state.messages = Array.isArray(state.messages) ? state.messages : [];
            const msg = {
              id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
              from: body.from || 'boss', to: body.to || '*',
              text: String(body.text || '').slice(0, 300),
              kind: body.kind || 'note',
              ts: Date.now(),
            };
            state.messages.push(msg);
            if (state.messages.length > 60) state.messages = state.messages.slice(-60);
            writeJson(P.stateFile, Object.assign(state, { updatedAt: Date.now() }));
            return json(response, 200, { ok: true, message: msg, messages: state.messages });
          }

          if (method === 'POST' && sub === '/messages/clear') {
            const state = readJson(P.stateFile, { offices: [], members: [], messages: [] });
            state.messages = [];
            writeJson(P.stateFile, Object.assign(state, { updatedAt: Date.now() }));
            return json(response, 200, { ok: true });
          }

          if (method === 'POST' && sub === '/hire') {
            const body = await readBody(request);
            const state = readJson(P.stateFile, { offices: [], members: [] });
            state.members = Array.isArray(state.members) ? state.members : [];
            if (!body.office) { try { const c0 = readJson(P.catalogFile, []); body.office = pickOfficeByTypes(state, typesOfSprite(body.sprite, c0), c0); } catch (e) { /* ignore */ } }
            const officeId = body.office || (state.offices[0] && state.offices[0].id);
            let sprite = String(body.sprite || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
            if (!sprite) sprite = 'eevee';
            const cat = readJson(P.catalogFile, []);
            const entry = cat.find((e) => e.id === sprite);
            const name = body.name || (entry && entry.zh) || sprite;
            const id = (body.id || (officeId + '-' + sprite + '-' + Date.now().toString(36).slice(-4))).replace(/[^a-zA-Z0-9_-]/g, '');
            if (state.members.some((m) => m.id === id)) return json(response, 409, { ok: false, error: 'id 已存在' });
            const fetched = await fetchSprite(sprite, P.spriteDir);
            const member = { id, name, role: body.role || '执行', office: officeId, model: body.model || '', provider: body.provider || '', sprite, status: body.status || 'idle', task: body.task || '' };
            state.members.push(member);
            writeJson(P.stateFile, Object.assign(state, { updatedAt: Date.now() }));
            return json(response, 200, { ok: true, member, types: (entry && entry.types) || [], spriteReady: !!fetched.ok });
          }

          if (method === 'POST' && sub === '/plan') {
            const body = await readBody(request);
            const state = readJson(P.stateFile, { offices: [], members: [] });
            state.members = Array.isArray(state.members) ? state.members : [];
            const officeId = body.office || (state.offices[0] && state.offices[0].id);
            const brief = String(body.brief || '').trim();
            if (!brief) return json(response, 400, { ok: false, error: '请填写任务描述' });
            const auto = planCount(brief);
            const want = Number(body.count) > 0 ? Math.max(1, Math.min(6, Number(body.count))) : auto.n;
            const reasons = Number(body.count) > 0 ? ['人数由你指定：' + want + ' 人'] : auto.reasons.slice();
            const roles = ROLES[want] || ROLES[6].slice(0, want);
            const { picked, basis } = pickSprites(state, officeId, brief, want);
            reasons.push(basis);
            reasons.push('分工：' + roles.join(' / '));
            const hired = [];
            for (let i = 0; i < picked.length; i++) {
              const e = picked[i];
              const fetched = await fetchSprite(e.id, P.spriteDir);
              const id = (officeId + '-' + e.id + '-' + Date.now().toString(36).slice(-4) + i).replace(/[^a-zA-Z0-9_-]/g, '');
              const member = {
                id, name: e.zh || e.id, role: roles[i] || '执行', office: officeId,
                model: body.model || '', provider: '', sprite: e.id,
                status: 'busy', task: (roles[i] || '执行') + '：' + brief.slice(0, 40),
              };
              state.members.push(member);
              hired.push({ id, name: member.name, role: member.role, sprite: e.id, types: e.types || [], spriteReady: !!fetched.ok, task: member.task });
            }
            writeJson(P.stateFile, Object.assign(state, { updatedAt: Date.now() }));
            return json(response, 200, { ok: true, office: officeId, count: hired.length, brief: brief.slice(0, 80), reasons, hired });
          }

          if (method === 'POST' && sub === '/sync') {
            try {
              const result = syncNow(P, loadRouting(P.root));
              return json(response, 200, Object.assign({ ok: true, routing: path.join(P.root, 'routing.json') }, result));
            } catch (error) {
              return json(response, 500, { ok: false, error: String(error && error.message ? error.message : error) });
            }
          }

          if (method === 'POST' && sub === '/fetch-sprite') {
            const body = await readBody(request);
            const result = await fetchSprite(body.name, P.spriteDir);
            return json(response, result.ok ? 200 : 502, result);
          }

          response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
          response.end('not found');
        },
      });
      return () => { if (autoTimer) clearTimeout(autoTimer); dispose(); };
    });
  });
}