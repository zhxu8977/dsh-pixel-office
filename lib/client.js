window.__ModuleLoader__.load({
	id: "dsh-pixel-office6",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const react = require("react");
		const h = react.createElement;

		const inject = ["slots"];
		let hostCtx = null;
		const API = "/dsh-pixel-office";
		const CDN = "https://play.pokemonshowdown.com/sprites/";
		const T = 40, COLS = 22, ROWS = 16;
		/** 每个办公室一套地图主题（地面/墙/主色/装饰） */
		const THEMES = {
			research: { floor: "#8ea0b8", wall: "#3c4859", accent: "#6ea8fe", decor: "📚", tag: "实验室" },
			media: { floor: "#c9a978", wall: "#5b4a3a", accent: "#e0a458", decor: "☕", tag: "编辑部" },
			video: { floor: "#8d7cae", wall: "#3d3352", accent: "#c77dff", decor: "🎬", tag: "摄影棚" },
			daily: { floor: "#cfbc98", wall: "#5a5245", accent: "#f0c674", decor: "🪴", tag: "居家" },
			jiaxin: { floor: "#d6a75f", wall: "#6b4f2a", accent: "#ffb347", decor: "🧸", tag: "教室" },
			main: { floor: "#c79a63", wall: "#41556b", accent: "#5ac8fa", decor: "🏢", tag: "通用" },
		};
		const themeOf = (id) => THEMES[id] || THEMES.main;
		const W = COLS * T, H = ROWS * T;
		const tile = (n) => n * T;

		const TYPE_ZH = { Normal: "一般", Fire: "火", Water: "水", Electric: "电", Grass: "草", Ice: "冰", Fighting: "格斗", Poison: "毒", Ground: "地面", Flying: "飞行", Psychic: "超能力", Bug: "虫", Rock: "岩石", Ghost: "幽灵", Dragon: "龙", Dark: "恶", Steel: "钢", Fairy: "妖精" };
		const TYPE_C = { Normal: "#9fa19f", Fire: "#e62829", Water: "#2980ef", Electric: "#fac000", Grass: "#3fa129", Ice: "#3dcef3", Fighting: "#ff8000", Poison: "#9141cb", Ground: "#915121", Flying: "#81b9ef", Psychic: "#ef4179", Bug: "#91a119", Rock: "#afa981", Ghost: "#704170", Dragon: "#5060e1", Dark: "#50413f", Steel: "#60a1b8", Fairy: "#ef70ef" };
		const STATUS = { busy: "忙碌", thinking: "思考中", idle: "空闲", waiting: "等待", error: "出错", offline: "离线" };

		// ---------------- store ----------------
		let state = {
			open: false, data: null, catalog: [], sprites: { pokemon: [], animated: [], trainers: [] },
			sel: null, active: null, note: null, error: null, fetchedAt: 0,
			view: { x: 0, y: 0, z: 1 }, q: "", typeFilter: "", renameOnPick: true, showForms: false, bossSize: 96, viewMode: null, splitRatio: 0.5, flights: [], sessions: [], showSessions: false, msgTo: "*", msgText: "", trainers: { male: [], female: [] }, standup: null, gender: "male",
		};
		const listeners = new Set();
		const emit = () => { for (const l of Array.from(listeners)) l(); };
		const subscribe = (cb) => { listeners.add(cb); return () => listeners.delete(cb); };
		const snapOf = () => state;
		const setState = (patch) => { state = Object.assign({}, state, patch); emit(); };
		const useOffice = () => react.useSyncExternalStore(subscribe, snapOf, snapOf);

		let timer = null;
		async function refresh() {
			try {
				const prev = state.data;
				const r = await fetch(API + "/state", { cache: "no-store" }); const data = await r.json();
				const offices = Array.isArray(data.offices) && data.offices.length ? data.offices : [{ id: "main", name: "办公室", icon: "🏢", purpose: "" }];
				const active = state.active === "__meeting" ? "__meeting" : (state.active && offices.some((o) => o.id === state.active) ? state.active : offices[0].id);
				setState({ data: Object.assign({}, data, { offices }), active, error: null, fetchedAt: Date.now() });
				detectInteractions(prev, data);
			} catch (e) { setState({ error: String(e && e.message ? e.message : e) }); }
		}
		async function loadSprites() { try { const r = await fetch(API + "/sprites", { cache: "no-store" }); setState({ sprites: await r.json() }); } catch { /* ignore */ } }
		async function loadSessions() { try { const r = await fetch(API + "/sessions", { cache: "no-store" }); const payload = await r.json(); setState({ sessions: payload.sessions || [] }); } catch { /* ignore */ } }
		async function loadTrainers() { try { const r = await fetch(API + "/trainers", { cache: "no-store" }); setState({ trainers: await r.json() }); } catch { /* ignore */ } }
		async function loadModels() { try { const r = await fetch(API + "/models", { cache: "no-store" }); setState({ modelsData: await r.json() }); } catch (e) { /* 忽略 */ } }
		async function loadStandup() { try { const r = await fetch(API + "/standup", { cache: "no-store" }); setState({ standup: await r.json() }); } catch { /* ignore */ } }
		async function loadCatalog() { try { const r = await fetch(API + "/catalog", { cache: "no-store" }); setState({ catalog: await r.json() }); } catch { /* ignore */ } }
		function startPolling() { if (timer) return; refresh(); loadSprites(); loadSessions(); loadTrainers(); loadStandup(); loadModels(); if (!state.catalog.length) loadCatalog(); timer = setInterval(refresh, 3000); }
		function stopPolling() { if (timer) { clearInterval(timer); timer = null; } }
		function toggle(open) { const next = open === undefined ? !state.open : open; setState({ open: next, sel: next ? state.sel : null }); if (next) startPolling(); else stopPolling(); }
		async function post(path, body) {
			try {
				const r = await fetch(API + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
				const payload = await r.json();
				setState({ note: payload && payload.ok ? "已保存" : ("失败：" + ((payload && payload.error) || r.status)) });
				await refresh();
				return payload;
			} catch (e) { setState({ note: "请求失败：" + String(e && e.message ? e.message : e) }); return null; }
		}
		const setMember = (id, patch) => post("/set", Object.assign({ id }, patch));
		const setBoss = (patch) => post("/set", Object.assign({ boss: true }, patch));
		async function fetchSprite(name) {
			setState({ note: "正在获取 " + name + " …" });
			const payload = await post("/fetch-sprite", { name });
			if (payload && payload.ok) setState({ sprites: payload.sprites, note: "素材就绪：" + payload.name });
			else if (payload) setState({ note: "没找到：" + name });
			return payload;
		}
		const spriteUrl = (name) => {
			if (!name) return null;
			if (String(name).startsWith("trainer-")) return API + "/sprite/" + encodeURIComponent(name) + ".png";
			const animated = (state.sprites.animated || []).indexOf(name) >= 0;
			return API + "/sprite/" + encodeURIComponent(name) + (animated ? ".gif" : ".png");
		};
		/** 取图候选链：本地 gif / 本地 png / CDN 动图 / CDN 静态 —— 任一可用即可，避免"灰块" */
		const spriteSources = (name) => {
			if (!name) return [];
			const n = encodeURIComponent(name);
			const out = [API + "/sprite/" + n + ".gif", API + "/sprite/" + n + ".png"];
			if (!String(name).startsWith("trainer-")) {
				out.push(CDN + "gen5ani/" + name + ".gif", CDN + "ani/" + name + ".gif", CDN + "gen5/" + name + ".png");
			}
			return out;
		};
		const thumbUrl = (entry) => CDN + (entry.num <= 649 ? "gen5/" : "dex/") + entry.id + ".png";
		const nameOf = (id) => {
			if (!id) return "?";
			if (id === "boss") return (state.data && state.data.boss && state.data.boss.name) || "董事长";
			if (id === "*") return "全员";
			const m = ((state.data && state.data.members) || []).find((x) => x.id === id);
			return m ? m.name : id;
		};
		const recentMessages = (ms) => (((state.data && state.data.messages) || []).filter((m) => Date.now() - m.ts < (ms || 60000)));
		const digitalOf = () => (state.data && state.data.digitalSelf) || null;
		const slotPos = (officeId, memberId, members) => {
			const list = (members || []).filter((m) => (m.office || "") === officeId);
			const i = list.findIndex((m) => m.id === memberId);
			if (i < 0) return null;
			const col = DESK_COLS[i % DESK_COLS.length];
			const row = DESK_ROWS[Math.floor(i / DESK_COLS.length)] || DESK_ROWS[DESK_ROWS.length - 1];
			return { x: (col + 0.42) * T + 19, y: row * T + 19 };
		};
		let flightSeq = 0;
		function pushFlight(from, to, icon, label) {
			const id = "f" + (++flightSeq);
			const slow = (typeof location !== "undefined" && location.search.indexOf("slowflight") >= 0);
			setState({ flights: (state.flights || []).concat([{ id, from, to, icon, label, slow }]) });
			setTimeout(() => { setState({ flights: (state.flights || []).filter((f) => f.id !== id) }); }, slow ? 9000 : 1700);
		}
		/** 差分：谁把活交给了谁（上下游交接）+ 谁给谁发了消息 */
		function detectInteractions(prev, next) {
			if (!prev || !next) return;
			try {
				const members = next.members || [];
				const pm = {}; for (const m of prev.members || []) pm[m.id] = m;
				// 1) 交接：某人开始忙 / 任务变化，而同室另一人刚从忙转闲（或有任务变更）
				for (const m of members) {
					const p = pm[m.id]; if (!p) continue;
					const started = p.status !== "busy" && m.status === "busy";
					const taskChanged = (p.task || "") !== (m.task || "");
					if (!started && !taskChanged) continue;
					const up = members.find((x) => x.id !== m.id && (x.office || "") === (m.office || "") && pm[x.id] && pm[x.id].status === "busy" && x.status !== "busy");
					if (!up) continue;
					const a = slotPos(m.office, up.id, members), b = slotPos(m.office, m.id, members);
					if (a && b) pushFlight(a, b, "📄", "交接 · " + String(m.task || "任务").slice(0, 8));
				}
				// 2) 消息：新出现的消息，从发件人飞向收件人
				const seen = {}; for (const msg of prev.messages || []) seen[msg.id] = 1;
				for (const msg of (next.messages || []).slice(-4)) {
					if (seen[msg.id]) continue;
					const sender = members.find((x) => x.id === msg.from);
					const target = members.find((x) => x.id === msg.to);
					if (!sender || !target || sender.office !== target.office) continue;
					const a = slotPos(sender.office, sender.id, members), b = slotPos(target.office, target.id, members);
					if (a && b) pushFlight(a, b, "✉️", String(msg.text || "消息").slice(0, 10));
				}
			} catch (e) { /* 忽略 */ }
		}

		const PHRASES = {
			busy: ["奋笔疾书", "埋头苦干", "火力全开", "码字中", "赶工中"],
			thinking: ["头脑风暴", "冥思苦想", "推演中", "梳理思路", "查资料"],
			waiting: ["等素材", "等回复", "排队中", "待命中"],
			idle: ["摸鱼中", "喝咖啡", "随时待命", "发呆中"],
			error: ["卡住了", "出错了", "需要支援"],
			offline: ["已离岗", "休息中", "下线了"],
		};
		const pickPhrase = (m) => {
			const arr = PHRASES[statusOf(m)] || PHRASES.idle;
			const s = String((m && (m.id + (m.task || ""))) || "");
			let h = 0;
			for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
			return arr[h % arr.length];
		};
		const MODEL_DEFAULTS = ["deepseek-flash", "deepseek-chat", "deepseek-reasoner", "GLM-4.6", "GLM-4.5", "codex", "codex-mini", "claude-sonnet-4.5", "gpt-5"];
		const liveModelList = () => {
			const a = state.data && state.data.models;
			if (a && Array.isArray(a.models) && a.models.length) return a.models;
			const b = state.modelsData;
			if (b && Array.isArray(b.models) && b.models.length) return b.models;
			return [];
		};
		const modelOptions = (members) => {
			const set = [];
			for (const m of liveModelList()) if (m.id && set.indexOf(m.id) < 0) set.push(m.id);
			for (const m of members || []) if (m.model && set.indexOf(m.model) < 0) set.push(m.model);
			for (const d of MODEL_DEFAULTS) if (set.indexOf(d) < 0) set.push(d);
			return set;
		};
		const modelLabel = (id) => {
			const hit = liveModelList().find((x) => x.id === id);
			return hit && hit.providers && hit.providers.length ? id + "  ·  " + hit.providers.join("/") : id;
		};
		const officeTypeLabel = (members, officeId) => {
			const cat = state.catalog || [];
			const set = [];
			for (const m of members) {
				if (m.office !== officeId) continue;
				const e = cat.find((x) => x.id === m.sprite);
				for (const t of (e && e.types) || []) if (set.indexOf(t) < 0) set.push(t);
			}
			return set.map((t) => TYPE_ZH[t] || t).join(" / ");
		};
		const leaderOf = (officeId) => {
			const office = ((state.data && state.data.offices) || []).find((o) => o.id === officeId);
			return office ? office.leader : null;
		};
		const assignSession = (s) => post("/set", {
			create: true, id: "sess-" + String(s.id).slice(0, 8),
			name: String(s.title || "新任务").slice(0, 12), role: "会话员工",
			office: state.active, sessionId: s.id, workspace: s.cwd,
			sprite: "eevee", status: s.active ? "busy" : "idle", task: String(s.title || ""),
		});
		const sendMsg = () => {
			const text = String(state.msgText || "").trim();
			if (!text) return;
			post("/message", { from: "boss", to: state.msgTo || "*", text });
			setState({ msgText: "" });
		};

		// ---------------- css ----------------
		const CSS = `
.po3-btn { display:flex; align-items:center; gap:6px; width:100%; padding:6px 8px; border:none; border-radius:8px; background:transparent; color:inherit; font:inherit; font-size:13px; cursor:pointer; opacity:.85; }
.po3-btn:hover { background:rgba(127,127,127,.14); opacity:1; }
.po3-btn i { width:7px; height:7px; border-radius:50%; background:#3fb950; box-shadow:0 0 6px #3fb950; animation:po3p 1.6s infinite; }
@keyframes po3p { 0%,100%{opacity:1} 50%{opacity:.35} }
.po3-pane { width:100%; height:100%; display:flex; flex-direction:column; background:#101820; color:#e8eef6; font-family:ui-monospace,Menlo,Consolas,monospace; overflow:hidden; }
.po3-pane .po3-top { padding:6px 8px; gap:5px; }
.po3-pane .po3-tab { font-size:11px; padding:3px 6px; }
.po3-pane .po3-side { flex:0 0 236px; padding:9px; }
.po3-tb.on { background:#3d6cff; color:#fff; }
.po3-split { flex:1; display:flex; min-height:0; min-width:0; }
.po3-split.horz { flex-direction:row; }
.po3-split.vert { flex-direction:column; }
.po3-split-a { display:flex; position:relative; min-width:0; min-height:0; overflow:hidden; }
.po3-split-b { flex:1 1 auto; min-width:0; min-height:0; overflow:auto; }
.po3-split-b .po3-side { flex:1 1 auto; width:auto; border-left:none; background:transparent; }
.po3-gutter { flex:0 0 7px; background:rgba(255,255,255,.10); position:relative; }
.po3-gutter:before { content:""; position:absolute; left:50%; top:50%; width:22px; height:3px; margin:-1px 0 0 -11px; border-radius:2px; background:rgba(255,255,255,.35); }
.po3-split.horz > .po3-gutter { cursor:col-resize; }
.po3-split.vert > .po3-gutter { cursor:row-resize; }
.po3-split.vert > .po3-gutter:before { width:3px; height:22px; margin:-11px 0 0 -1px; }
.po3-gutter:hover { background:#3d6cff; }
.po3-vtabs { display:flex; gap:4px; }
.po3-drawer { position:absolute; right:0; top:0; bottom:0; width:min(330px,88%); background:#141d27; border-left:1px solid rgba(255,255,255,.12); overflow:auto; z-index:30; box-shadow:-14px 0 30px rgba(0,0,0,.5); padding:10px; box-sizing:border-box; }
.po3-drawer .po3-side { border:none; background:transparent; padding:0; width:auto; }
.po3-list { flex:1; overflow:auto; padding:10px 12px; background:#101a24; }
.po3-lrow { display:flex; align-items:center; gap:6px; padding:3px 7px; border-radius:6px; border:1px solid rgba(255,255,255,.07); background:rgba(255,255,255,.03); margin-bottom:5px; cursor:pointer; }
.po3-lrow:hover { border-color:rgba(120,160,255,.5); background:rgba(120,160,255,.08); }
.po3-lrow img { width:15px; height:15px; image-rendering:pixelated; flex:0 0 15px; opacity:.95; }
.po3-lname { font-size:11.5px; font-weight:700; }
.po3-lrole { font-size:10.5px; opacity:.72; }
.po3-ltask { font-size:10.5px; color:#9fc4ff; margin-top:1px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.po3-ldot { width:6px; height:6px; border-radius:50%; flex:0 0 6px; }
.po3-lsec { font-size:11px; opacity:.6; margin:12px 0 5px; }
.po3-back { position:fixed; inset:0; z-index:60; background:rgba(0,0,0,.62); display:flex; align-items:center; justify-content:center; padding:10px; }
.po3-win { width:min(1560px,97vw); height:min(960px,95vh); display:flex; flex-direction:column; border-radius:12px; overflow:hidden; background:#101820; color:#e8eef6; border:1px solid rgba(255,255,255,.14); box-shadow:0 26px 70px rgba(0,0,0,.6); font-family:ui-monospace,Menlo,Consolas,monospace; }
.po3-top { display:flex; align-items:center; gap:8px; padding:7px 11px; background:linear-gradient(180deg,#1b2733,#141d27); border-bottom:1px solid rgba(255,255,255,.1); flex:0 0 auto; flex-wrap:wrap; }
.po3-top h2 { margin:0 6px 0 0; font-size:14px; }
.po3-tab { border:1px solid rgba(255,255,255,.16); background:rgba(255,255,255,.05); color:inherit; border-radius:7px; padding:4px 9px; font:inherit; font-size:12px; cursor:pointer; }
.po3-tab:hover { background:rgba(255,255,255,.14); }
.po3-tab.on { background:#3d6cff; border-color:#3d6cff; }
.po3-tb { border:none; background:rgba(255,255,255,.09); color:inherit; border-radius:7px; padding:4px 9px; cursor:pointer; font:inherit; font-size:12px; }
.po3-tb:hover { background:rgba(255,255,255,.2); }
.po3-meta { font-size:11.5px; opacity:.65; }
.po3-note { font-size:11.5px; color:#7ee787; }
.po3-sp { flex:1; }
.po3-main { flex:1; display:flex; min-height:0; }
.po3-view { position:relative; flex:1; overflow:hidden; background:#0b1118; cursor:grab; touch-action:none; }
.po3-world { position:absolute; left:0; top:0; transform-origin:0 0; }
.po3-floor { position:absolute; inset:0; background-color:#c79a63;
  background-image:linear-gradient(0deg, rgba(0,0,0,.055) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.055) 1px, transparent 1px);
  background-size:${T}px ${T}px; }
.po3-wall { position:absolute; background:#41556b; box-shadow:inset 0 -4px 0 rgba(0,0,0,.28), inset 0 3px 0 rgba(255,255,255,.12); }
.po3-carpet { position:absolute; background:rgba(120,150,190,.15); border:2px solid rgba(255,255,255,.12); border-radius:6px; }
.po3-sign { position:absolute; background:#20304a; color:#dbe8ff; border:1px solid #5d84b8; border-radius:4px; padding:2px 8px; font-size:11px; white-space:nowrap; transform:translateX(-50%); box-shadow:0 2px 0 rgba(0,0,0,.35); z-index:6; }
.po3-plant { position:absolute; }
.po3-plant b { position:absolute; left:6px; top:0; width:12px; height:13px; background:#4f9c41; border-radius:3px 3px 0 0; box-shadow:inset -3px 0 0 #3d7c33, inset 3px 0 0 #61b350; }
.po3-plant i { position:absolute; left:4px; bottom:0; width:16px; height:8px; background:#b06a3b; border-radius:0 0 3px 3px; box-shadow:inset 0 2px 0 #8d5229; }
.po3-board { position:absolute; background:#eef2f5; border:2px solid #93a1ae; border-radius:2px; box-shadow:0 2px 0 rgba(0,0,0,.2); }
.po3-board s { position:absolute; height:2px; background:#8fa6bd; }
.po3-shelf { position:absolute; background:#8b5a2b; border:2px solid #5d3c1c; border-radius:2px; overflow:hidden; }
.po3-shelf s { position:absolute; bottom:2px; width:4px; border-radius:1px 1px 0 0; }
.po3-cooler { position:absolute; background:#6fc7e3; border:2px solid #3f8ba5; border-radius:3px; box-shadow:inset 0 4px 0 rgba(255,255,255,.5); }
/* 桌子在精灵前面（z-index 更高） */
.po3-desk { position:absolute; z-index:4; background:#dcb45f; border:2px solid #8a6b2c; border-radius:3px; box-shadow:inset 0 -4px 0 rgba(0,0,0,.14), 0 3px 0 rgba(0,0,0,.25); }
.po3-mon { position:absolute; z-index:5; background:#243040; border:1px solid #0d1620; border-radius:2px; }
.po3-scr { position:absolute; inset:1px; border-radius:1px; overflow:hidden; background:#132539; }
.po3-scr.busy { background:#123049; } .po3-scr.thinking { background:#3a2f18; } .po3-scr.error { background:#4a1f1d; }
.po3-t1 { position:absolute; left:1px; right:1px; top:1px; height:1.5px; background:#7ee787; animation:po3t 1.1s steps(6) infinite; }
.po3-t2 { position:absolute; left:1px; width:60%; top:4px; height:1.5px; background:#5ac8fa; animation:po3t 1.1s steps(6) .25s infinite; }
@keyframes po3t { 0%{transform:scaleX(.2);transform-origin:left} 100%{transform:scaleX(1);transform-origin:left} }
.po3-spin { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:#f5c86a; font-size:8px; animation:po3r 1.3s linear infinite; }
@keyframes po3r { 0%{transform:rotate(0)} 100%{transform:rotate(360deg)} }
.po3-saver { position:absolute; width:3px; height:3px; background:#4d6bfe; animation:po3sv 5s ease-in-out infinite; }
@keyframes po3sv { 0%{left:1px;top:1px} 25%{left:70%;top:1px} 50%{left:70%;top:65%} 75%{left:1px;top:65%} 100%{left:1px;top:1px} }
.po3-red { position:absolute; inset:0; background:rgba(248,81,73,.55); animation:po3bl .6s steps(2) infinite; }
@keyframes po3bl { 0%,100%{opacity:.2} 50%{opacity:.9} }
.po3-kb { position:absolute; z-index:5; background:#3a4757; border:1px solid #26313d; border-radius:2px; }
.po3-kb.busy { animation:po3kb .3s steps(2) infinite; }
@keyframes po3kb { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-1px)} }
.po3-who { position:absolute; z-index:2; cursor:pointer; }
.po3-who img, .po3-who .fb { width:${T + 6}px; height:${T + 6}px; image-rendering:pixelated; display:block; }
.po3-who.busy img, .po3-who.busy .fb { animation:po3work .85s ease-in-out infinite; }
.po3-who.thinking img, .po3-who.thinking .fb { animation:po3think 2.2s ease-in-out infinite; }
.po3-who.idle img, .po3-who.idle .fb { animation:po3rest 3.6s ease-in-out infinite; }
.po3-who.waiting img, .po3-who.waiting .fb { animation:po3wait 5s ease-in-out infinite; }
@keyframes po3work { 0%,100%{transform:translate(0,0)} 25%{transform:translate(-1px,-3px)} 50%{transform:translate(0,-1px)} 75%{transform:translate(1px,-3px)} }
@keyframes po3think { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-2px) rotate(-2.5deg)} }
@keyframes po3rest { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-2px) scale(1.025)} }
@keyframes po3wait { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-1px)} }
/* 桌面状态条：避开显示器，占据桌面剩余空间的中间；字号小、绝不换行 */
/* 桌面状态条：字号够大看得清，无灰色，按状态换配色与字体 */
.po3-say2 { position:absolute; left:21px; right:1px; bottom:2px; text-align:center; white-space:nowrap; overflow:hidden;
  text-overflow:clip; font-size:9px; line-height:12px; letter-spacing:.2px; border-radius:4px; padding:0 3px; z-index:8;
  text-shadow:0 1px 1px rgba(0,0,0,.65); font-family:"Microsoft YaHei",ui-sans-serif,system-ui,sans-serif; }
.po3-say2.busy { background:linear-gradient(180deg,#1f6b32,#124d22); color:#c8ffd6; border:1px solid #57e07c;
  font-weight:800; box-shadow:0 0 7px rgba(87,224,124,.7), inset 0 1px 0 rgba(255,255,255,.18); }
.po3-say2.thinking { background:linear-gradient(180deg,#6b5210,#4a380a); color:#ffe08a; border:1px solid #ffc53d;
  font-weight:700; font-style:italic; box-shadow:0 0 6px rgba(255,197,61,.55); }
.po3-say2.waiting { background:linear-gradient(180deg,#14527a,#0d3a58); color:#bfe9ff; border:1px solid #4fc3f7;
  font-weight:700; letter-spacing:.8px; box-shadow:0 0 6px rgba(79,195,247,.5); }
.po3-say2.idle { background:linear-gradient(180deg,#7a4a12,#5a350b); color:#ffd9a0; border:1px solid #f0a848;
  font-weight:700; box-shadow:0 0 5px rgba(240,168,72,.45); }
.po3-say2.offline { background:linear-gradient(180deg,#4a3a7a,#33265a); color:#dcd0ff; border:1px solid #a78bfa;
  font-weight:700; box-shadow:0 0 5px rgba(167,139,250,.45); }
.po3-say2.error { background:linear-gradient(180deg,#7a2020,#521414); color:#ffc2bb; border:1px solid #ff6b60;
  font-weight:800; box-shadow:0 0 7px rgba(255,107,96,.6); }
.po3-say { position:absolute; left:50%; transform:translateX(-50%); bottom:calc(100% + 44px); white-space:nowrap; font-size:9px; padding:1px 6px; border-radius:8px 8px 8px 2px; z-index:9; border:1px solid rgba(255,255,255,.25); background:#22314a; color:#dbe8ff; box-shadow:0 2px 6px rgba(0,0,0,.35); }
.po3-say.busy { background:#1e3a24; color:#a8f0b4; border-color:#3fb950; }
.po3-say.thinking { background:#3a2f18; color:#ffd98a; border-color:#f5c86a; }
.po3-say.waiting { background:#17303f; color:#9fdcff; border-color:#5ac8fa; }
.po3-say.idle { background:#242b33; color:#b9c4cf; border-color:#5b6672; }
.po3-say.error { background:#3a1d1d; color:#ffb3ad; border-color:#f85149; }
.po3-tab-hot { border-color:#3fb950 !important; box-shadow:0 0 0 1px #3fb95055, 0 0 10px #3fb95044; }
.po3-tab-warm { border-color:#f5c86a88 !important; }
.po3-hot { position:absolute; left:50%; transform:translateX(-50%); bottom:calc(100% + 60px); font-size:15px; z-index:11; animation:po3hot 1.4s ease-in-out infinite; filter:drop-shadow(0 0 4px rgba(255,140,0,.7)); }
@keyframes po3hot { 0%,100%{transform:translateX(-50%) scale(1); opacity:1} 50%{transform:translateX(-50%) scale(1.25); opacity:.75} }
.po3-flight { position:absolute; z-index:12; font-size:14px; pointer-events:none; animation:po3fly 1.5s cubic-bezier(.4,0,.6,1) forwards; }
@keyframes po3fly { 0%{transform:translate(0,0) scale(.7); opacity:0} 15%{opacity:1; transform:translate(0,-6px) scale(1)} 85%{opacity:1} 100%{transform:translate(var(--dx),var(--dy)) scale(.9); opacity:0} }
.po3-flight b { position:absolute; left:15px; top:-9px; font-size:8.5px; padding:0 5px; border-radius:7px; background:#20304a; color:#dbe8ff; border:1px solid #5d84b8; white-space:nowrap; }
.po3-who.busy img, .po3-who.busy .fb { animation-duration:1.05s; }
.po3-who.thinking img, .po3-who.thinking .fb { animation-duration:1.7s; }
.po3-who.waiting img, .po3-who.waiting .fb { animation-duration:4s; }
.po3-who.error img { animation:none; filter:grayscale(.85) brightness(.85); }
@keyframes po3idle { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px)} }
.po3-who .fb { display:flex; align-items:center; justify-content:center; font-size:18px; background:rgba(0,0,0,.25); border-radius:4px; }
.po3-who.on { z-index:3; }
.po3-who.on:after { content:""; position:absolute; inset:-2px -2px 0 -2px; border:2px solid #5b8cff; border-radius:6px; pointer-events:none; z-index:7; }
.po3-plate { position:absolute; left:50%; transform:translateX(-50%); bottom:calc(100% + 1px); background:#1e3a5f; color:#eaf2ff; border:1px solid #5d84b8; border-radius:3px; padding:1px 5px; text-align:center; white-space:nowrap; box-shadow:0 2px 0 rgba(0,0,0,.35); z-index:8; }
.po3-plate b { display:block; font-size:9.5px; line-height:1.25; }
.po3-plate span { display:block; font-size:8px; line-height:1.2; opacity:.82; }
.po3-task { position:absolute; left:50%; transform:translateX(-50%); bottom:calc(100% + 29px); max-width:150px; overflow:hidden; text-overflow:ellipsis; background:#0f2033; color:#bfe0ff; border:1px solid #3d6c9c; border-radius:3px; padding:1px 5px; font-size:8.5px; white-space:nowrap; z-index:8; }
.po3-fx { position:absolute; left:calc(100% - 8px); bottom:calc(100% + 13px); font-size:11px; animation:po3fl 1.6s ease-in-out infinite; z-index:8; }
@keyframes po3fl { 0%{transform:translateY(3px);opacity:0} 30%{opacity:1} 100%{transform:translateY(-9px);opacity:0} }
.po3-ctrl { position:absolute; left:10px; top:10px; display:flex; flex-direction:column; gap:4px; z-index:20; }
.po3-ctrl button { width:26px; height:26px; border-radius:5px; border:1px solid rgba(255,255,255,.2); background:rgba(16,24,32,.86); color:#e8eef6; cursor:pointer; font:inherit; font-size:13px; }
.po3-ctrl button:hover { background:rgba(60,90,130,.95); }
.po3-ctrl .row { display:flex; gap:4px; }
.po3-legend { position:absolute; right:10px; bottom:10px; z-index:20; background:rgba(16,24,32,.86); border:1px solid rgba(255,255,255,.16); border-radius:7px; padding:6px 9px; font-size:10.5px; line-height:1.7; }
.po3-legend i { display:inline-block; width:7px; height:7px; border-radius:50%; margin-right:5px; vertical-align:middle; }
.po3-side { flex:0 0 286px; border-left:1px solid rgba(255,255,255,.1); background:#141d27; padding:11px; overflow:auto; }
.po3-side h3 { margin:0 0 3px; font-size:13.5px; }
.po3-side .lbl { font-size:10.5px; opacity:.6; margin:9px 0 4px; }
.po3-side input, .po3-side select { width:100%; box-sizing:border-box; background:#0d141c; border:1px solid rgba(255,255,255,.16); color:inherit; border-radius:6px; padding:4px 6px; font:inherit; font-size:11.5px; }
.po3-side textarea { width:100%; box-sizing:border-box; min-height:52px; background:#0d141c; border:1px solid rgba(255,255,255,.16); color:inherit; border-radius:6px; padding:5px 7px; font:inherit; font-size:11.5px; resize:vertical; }
.po3-plan { margin-top:6px; padding:6px 8px; border-radius:6px; background:rgba(77,107,254,.14); border:1px solid rgba(120,160,255,.35); font-size:10.5px; line-height:1.65; white-space:pre-wrap; }
.po3-sm { padding:3px 8px; font-size:11px; border-radius:6px; border:1px solid rgba(255,255,255,.16); background:rgba(255,255,255,.05); color:inherit; cursor:pointer; font:inherit; }
.po3-sm:hover { background:rgba(255,255,255,.14); }
.po3-sm.on { background:#3d6cff; border-color:#3d6cff; }
.po3-row { display:flex; gap:5px; flex-wrap:wrap; align-items:center; }
.po3-chips { display:flex; flex-wrap:wrap; gap:3px; margin-top:5px; }
.po3-chip { font-size:9.5px; padding:1px 6px; border-radius:999px; border:1px solid rgba(255,255,255,.18); background:rgba(255,255,255,.05); cursor:pointer; color:#dbe8ff; }
.po3-chip.on { background:#3d6cff; border-color:#3d6cff; color:#fff; }
.po3-pick { display:grid; grid-template-columns:repeat(auto-fill,minmax(56px,1fr)); gap:4px; margin-top:6px; max-height:262px; overflow:auto; }
.po3-pickname { display:block; font-size:8.5px; text-align:center; opacity:.85; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:1px; }
.po3-pick div { background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.12); border-radius:5px; padding:2px; cursor:pointer; }
.po3-pick div:hover { border-color:#3d6cff; }
.po3-pick img { width:100%; height:30px; object-fit:contain; image-rendering:pixelated; display:block; }
.po3-hint { font-size:10.5px; opacity:.55; line-height:1.6; }
.po3-sessbar { display:flex; align-items:center; gap:6px; padding:5px 11px; background:#0e1620; border-bottom:1px solid rgba(255,255,255,.08); flex-wrap:wrap; flex:0 0 auto; }
.po3-msglist { margin-top:5px; max-height:150px; overflow:auto; display:flex; flex-direction:column; gap:3px; }
.po3-msg { font-size:10.5px; background:rgba(255,255,255,.045); border:1px solid rgba(255,255,255,.08); border-radius:5px; padding:3px 6px; }
.po3-msg b { color:#9fc4ff; font-weight:600; }
.po3-crown { display:inline-block; margin-right:3px; }
.po3-meet-table { position:absolute; z-index:4; background:#7d5a34; border:3px solid #4f3a20; border-radius:10px; box-shadow:inset 0 -6px 0 rgba(0,0,0,.16), 0 4px 0 rgba(0,0,0,.28); }
.po3-report { font-size:10.5px; line-height:1.55; }
.po3-report .off { background:rgba(255,255,255,.045); border:1px solid rgba(255,255,255,.09); border-radius:6px; padding:5px 7px; margin-bottom:6px; }
.po3-report .off b { color:#cfe0ff; }
.po3-report .tk { color:#9fe8b0; }
.po3-report .tk.dim { color:#9fb3c8; }
.po3-chair { position:absolute; width:22px; height:13px; background:#4a3a2a; border:2px solid #2f2418; border-radius:4px; z-index:3; }
.po3-coffee { position:absolute; width:30px; height:40px; background:#3b4757; border:2px solid #232c38; border-radius:4px; z-index:5; }
.po3-coffee i { position:absolute; left:9px; top:14px; width:9px; height:8px; background:#c98a4b; border-radius:2px; }
.po3-coffee b { position:absolute; left:6px; top:3px; width:15px; height:8px; background:#8fa3b8; border-radius:2px; }
.po3-projector { position:absolute; background:#f4f7fa; border:3px solid #9aa8b6; border-radius:4px; z-index:5; padding:7px 9px; box-shadow:0 4px 12px rgba(0,0,0,.4); }
.po3-proj-title { font-size:11px; color:#152535; font-weight:700; }
.po3-proj-line { font-size:9.5px; color:#3b4a5a; margin-top:3px; }
.po3-proj-line.dim { color:#7e8d9d; }
.po3-boardreport { position:absolute; background:#1d2c44; border:2px solid #5d84b8; border-radius:5px; z-index:5; padding:6px 7px; box-shadow:0 3px 9px rgba(0,0,0,.35); }
.po3-br-title { font-size:10.5px; color:#dbe8ff; margin-bottom:5px; font-weight:700; }
.po3-br-row { display:flex; align-items:center; gap:4px; margin-bottom:4px; }
.po3-br-name { font-size:8.5px; color:#cfe0ff; width:44px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.po3-br-bar { height:6px; background:linear-gradient(90deg,#3fb950,#7ee787); border-radius:2px; }
.po3-br-num { font-size:8px; color:#9fb3c8; }
.po3-env { position:absolute; left:-6px; bottom:calc(100% + 12px); font-size:12px; animation:po3env 1.1s ease-in-out infinite; z-index:9; }
@keyframes po3env { 0%,100%{transform:translateY(0) rotate(-6deg)} 50%{transform:translateY(-5px) rotate(6deg)} }
`;

		function useStyle() {
			react.useEffect(() => {
				if (document.getElementById("dsh-pixel-office4-style")) return;
				const el = document.createElement("style");
				el.id = "dsh-pixel-office4-style";
				el.textContent = CSS;
				document.head.appendChild(el);
			}, []);
		}

		const statusOf = (o) => { const s = String((o && o.status) || "idle").toLowerCase(); return STATUS[s] ? s : "idle"; };

		function furniture() {
			const out = [];
			const push = (kind, x, y, w, h, key) => out.push({ kind, x, y, w: w || 1, h: h || 1, key: key || (kind + x + "-" + y) });
			for (let c = 0; c < COLS; c++) { push("wall", c, 0); push("wall", c, 1); }
			push("board", 3.4, 2.05, 3.6, 1.15, "b1"); push("board", 14.2, 2.05, 3.6, 1.15, "b2");
			push("shelf", 1.15, 5.6, 1.4, 1.5, "s1"); push("shelf", 1.15, 10.4, 1.4, 1.5, "s2");
			push("shelf", 19.35, 5.6, 1.4, 1.5, "s3"); push("shelf", 19.35, 10.4, 1.4, 1.5, "s4");
			push("cooler", 19.5, 13.3, 1, 1, "c1");
			for (let c = 8.4; c < 14; c += 2.6) push("plant", c, 2.15, 1, 1, "pt" + c);
			for (let r = 4.6; r < 13.4; r += 3) { push("plant", 0.9, r, 1, 1, "pl" + r); push("plant", 20.1, r, 1, 1, "pr" + r); }
			push("plant", 2.2, 14.3, 1, 1, "pb1"); push("plant", 4.4, 14.3, 1, 1, "pb2"); push("plant", 18.9, 14.3, 1, 1, "pb3");
			return out;
		}
		const DESK_COLS = [3.7, 7.7, 11.7, 15.7];
		const DESK_ROWS = [7.5, 11.1];
		const DESK_SLOTS = DESK_COLS.length * DESK_ROWS.length;
		function EmptyDesk(props) {
			const x = props.x, y = props.y;
			return h("div", { className: "po3-desk", style: { left: tile(x), top: tile(y + 0.78), width: tile(2.3), height: tile(0.95), opacity: 0.82 } },
				h("div", { className: "po3-mon", style: { left: 4, top: -11, width: 20, height: 14 } }, h("div", { className: "po3-scr" }, h("div", { className: "po3-saver" }))),
				h("div", { className: "po3-kb", style: { right: 6, top: 6, width: 18, height: 5 } }),
			);
		}

		function Furniture(props) {
			const f = props.item;
			const style = { left: tile(f.x), top: tile(f.y), width: tile(f.w), height: tile(f.h) };
			if (f.kind === "wall") return h("div", { className: "po3-wall", style: Object.assign({}, style, { height: T }) });
			if (f.kind === "plant") return h("div", { className: "po3-plant", style: Object.assign({}, style, { width: 24, height: 24 }) }, h("b"), h("i"));
			if (f.kind === "board") return h("div", { className: "po3-board", style }, h("s", { style: { left: "8%", top: "26%", width: "44%" } }), h("s", { style: { left: "8%", top: "52%", width: "62%" } }));
			if (f.kind === "shelf") return h("div", { className: "po3-shelf", style },
				h("s", { style: { left: "8%", height: "60%", background: "#d9534f" } }), h("s", { style: { left: "24%", height: "70%", background: "#5bc0de" } }),
				h("s", { style: { left: "40%", height: "55%", background: "#f0ad4e" } }), h("s", { style: { left: "56%", height: "68%", background: "#5cb85c" } }));
			if (f.kind === "cooler") return h("div", { className: "po3-cooler", style });
			if (f.kind === "mon-stand") return h("div", { className: "po3-mon", style: Object.assign({}, style, { zIndex: 6 }) }, h("div", { className: "po3-scr" }));
			return null;
		}
		function Screen(status) {
			if (status === "busy") return h("div", { className: "po3-scr busy" }, h("div", { className: "po3-t1" }), h("div", { className: "po3-t2" }));
			if (status === "thinking") return h("div", { className: "po3-scr thinking" }, h("div", { className: "po3-spin" }, "◐"));
			if (status === "error") return h("div", { className: "po3-scr error" }, h("div", { className: "po3-red" }));
			if (status === "waiting") return h("div", { className: "po3-scr" }, h("div", { className: "po3-spin", style: { animationDuration: "3s" } }, "…"));
			return h("div", { className: "po3-scr" }, h("div", { className: "po3-saver" }));
		}
		function Person(props) {
			const who = props.who, kind = props.kind;
			const status = statusOf(who);
			const snap = useOffice();
			const selId = kind === "boss" ? "boss" : who.id;
			const selected = snap.sel && snap.sel.kind === kind && snap.sel.id === selId;
			const [broken, setBroken] = react.useState(false);
			const [srcIdx, setSrcIdx] = react.useState(0);
			const srcList = spriteSources(who.sprite || who.id);
			const src = broken ? null : srcList[srcIdx];
			const url = spriteUrl(who.sprite || who.id);
			const task = who.task && status !== "idle" ? who.task : "";
			const size = props.big ? (snap.bossSize || 64) : T + 6;
			const lift = props.big ? Math.round((size - 38) * 0.55) : 9;
			return h("div", {
				className: "po3-who " + status + (selected ? " on" : ""),
				style: { left: tile(props.x), top: tile(props.y) - lift, width: size, height: size },
				onClick: (e) => { e.stopPropagation(); setState({ sel: { kind, id: selId }, note: null }); },
			},
				task ? h("div", { className: "po3-task" }, task) : null,
				h("div", { className: "po3-plate" }, h("b", null, (kind !== "boss" && leaderOf(who.office) === who.id ? "👑 " : "") + (who.name || who.id || "") + (status === "busy" ? " 🔥" : (status === "thinking" ? " ✳" : ""))), h("span", null, kind === "boss" ? (who.title || "董事长") : (who.role || ""))),
				recentMessages(60000).some((m) => m.to === "*" || m.to === (kind === "boss" ? "boss" : who.id)) ? h("div", { className: "po3-env" }, "✉") : null,
				status === "thinking" ? h("div", { className: "po3-fx" }, "?") : null,
				status === "busy" ? h("div", { className: "po3-fx" }, "!") : null,
				status === "waiting" ? h("div", { className: "po3-fx" }, "z") : null,
				src ? h("img", { src: src, alt: who.name || "", style: { width: size, height: size }, onError: () => { const nx = srcIdx + 1; if (nx < srcList.length) setSrcIdx(nx); else setBroken(true); } }) : h("div", { className: "fb", style: { width: size, height: size } }, (who.name || "?").slice(0, 1)),
			);
		}
		// 精灵 z-index 2 < 桌子 z-index 4 → 桌子挡在身前
		function Workstation(props) {
			const m = props.member, x = props.x, y = props.y;
			const status = statusOf(m);
			return h("div", null,
				h(Person, { kind: "member", who: m, x: x + 0.42, y: y }),
				h("div", { className: "po3-desk", style: { left: tile(x), top: tile(y + 0.78), width: tile(2.3), height: tile(0.95) } },
					h("div", { className: "po3-mon", style: { left: 4, top: -11, width: 20, height: 14 } }, h(Screen, status)),
					h("div", { className: "po3-kb" + (status === "busy" ? " busy" : ""), style: { right: 6, top: 6, width: 18, height: 5 } }),
					h("div", { className: "po3-say2 " + status }, pickPhrase(m)),
				),
			);
		}
		function MeetingRoom() {
			const snap = useOffice();
			const report = snap.standup || { offices: [] };
			const boss = (snap.data && snap.data.boss) || { name: "董事长", sprite: "trainer-red" };
			const seats = [[8.7, 7.7], [13.3, 7.7], [8.7, 11.7], [13.3, 11.7], [6.1, 9.7]];
			const list = (report.offices || []).slice(0, 6);
			return h("div", { className: "po3-world", style: { width: W, height: H } },
				h("div", { className: "po3-floor" }),
				furniture().filter((f) => f.kind === "wall" || f.kind === "plant" || f.kind === "board").map((f) => h(Furniture, { key: f.key, item: f })),
				h("div", { className: "po3-sign", style: { left: tile(11), top: tile(1.5) } }, "📋 会议室 · 早会 " + (report.day || "")),
				h("div", { className: "po3-projector", style: { left: tile(7.3), top: tile(2.2), width: tile(7.4), height: tile(3.2) } },
					h("div", { className: "po3-proj-title" }, "📽 今日早会 · " + (report.day || "")),
					h("div", { className: "po3-proj-line" }, "办公室 " + list.length + " 个 · 员工 " + list.reduce(function (a, o) { return a + (o.headcount || 0); }, 0) + " 人 · 在忙 " + list.reduce(function (a, o) { return a + (o.busy || 0); }, 0) + " 人"),
					h("div", { className: "po3-proj-line dim" }, "议题：各室昨日进展 → 今日计划 → 跨室协作申请（需董事长批准）"),
				),
				h("div", { className: "po3-boardreport", style: { left: tile(1.3), top: tile(5.4), width: tile(3.3), height: tile(7.4) } },
					h("div", { className: "po3-br-title" }, "📊 昨日战报"),
					list.map((o) => h("div", { key: "br" + o.id, className: "po3-br-row" },
						h("span", { className: "po3-br-name", title: o.name }, (o.icon || "") + " " + o.name),
						h("span", { className: "po3-br-bar", style: { width: Math.min(42, 6 + (o.yesterday || []).length * 9) } }),
						h("span", { className: "po3-br-num" }, (o.yesterday || []).length + "项"),
					)),
				),
				h("div", { className: "po3-coffee", style: { left: tile(19.2), top: tile(5.2) } }, h("b"), h("i")),
				h("div", { className: "po3-meet-table", style: { left: tile(7.4), top: tile(8.5), width: tile(9.6), height: tile(3.5) } },
					h("div", { style: { position: "absolute", left: 12, top: 12, fontSize: 11, opacity: .45 } }, "每日早会 · 议题板"),
				),
				h(Person, { kind: "boss", who: boss, x: 21.0, y: 10.5, big: true }),
				list.map((o, i) => o.leader ? h(Person, {
					key: o.id, kind: "member", x: seats[i][0], y: seats[i][1],
					who: Object.assign({}, o.leader, { office: o.id, role: (o.icon || "") + (o.name || "") + " 负责人", task: (o.today && o.today[0]) || (o.yesterday && o.yesterday[0]) || "" }),
				}) : null),
			);
		}

		function DigitalCard() {
			const ds = digitalOf();
			if (!ds) return null;
			const chans = ds.channels || [];
			const recent = ds.recent || [];
			return h("div", null,
				h("div", { className: "lbl" }, "形象大小"),
				h("div", { className: "po3-row" }, [[46, "中"], [64, "大"], [80, "特大"], [96, "超大"]].map((opt) =>
					h("button", { key: opt[0], className: "po3-sm" + ((state.bossSize || 64) === opt[0] ? " on" : ""), onClick: () => setState({ bossSize: opt[0] }) }, opt[1] + " " + opt[0]))),
				h("div", { className: "lbl" }, "数字形象 · 身份"),
				h("div", { className: "po3-hint" }, (ds.note || "我是本人的代表") + "　|　对外身份：代表本人"),
				h("div", { className: "lbl" }, "对外通道"),
				h("div", { className: "po3-msglist" }, chans.map((c) => h("div", { key: c.id, className: "po3-msg" },
					h("b", null, (c.ok === false ? "⚠ " : "● ") + c.label + " → " + (c.lastTarget || c.target || "")),
					h("span", null, "　" + (c.lastAt ? "最近 " + c.lastAt.replace("T", " ").slice(5, 16) : "尚未发送"))))),
				h("div", { className: "lbl" }, "最近替你在外面发的消息（自动记录）"),
				recent.length
					? h("div", { className: "po3-msglist" }, recent.map((m) => h("div", { key: m.ts + m.channel, className: "po3-msg" },
						h("b", null, (m.channel === "wechat" ? "微信" : "邮箱") + (m.status === "OK" ? " ✓ " : " ✗ ") + m.ts.replace("T", " ").slice(5, 16)),
						h("span", null, "　" + (m.summary || "")))))
					: h("div", { className: "po3-hint" }, "（还没有对外发送记录）"),
				h("div", { className: "po3-hint" }, "完整证据：C:\\Users\\admin\\.dsh\\digital-self\\outbox.log（含微信截图）"),
			);
		}

		function Room() {
			const snap = useOffice();
			if (snap.active === "__meeting") return h(MeetingRoom);
			const data = snap.data || {};
			const boss = data.boss || { name: "董事长", title: "总指挥", sprite: "trainer-red" };
			const office = (data.offices || []).find((o) => o.id === snap.active) || { name: "办公室", icon: "🏢", purpose: "" };
			const firstOffice = (data.offices || [])[0] || { id: "main" };
			const th = themeOf(office.id);
			const members = (data.members || []).filter((m) => (m.office || firstOffice.id) === office.id).slice(0, 12);
			return h("div", { className: "po3-world", style: { width: W, height: H } },
				h("div", { className: "po3-floor", style: { background: "linear-gradient(160deg," + th.floor + " 0%," + th.floor + " 55%,rgba(0,0,0,.12) 100%)" } }),
				furniture().map((f) => h(Furniture, { key: f.key, item: f, theme: th })),
				h("div", { className: "po3-decor", style: { position: "absolute", left: tile(17.2), top: tile(2.35), fontSize: 34, lineHeight: 1, zIndex: 6, filter: "drop-shadow(0 2px 3px rgba(0,0,0,.35))" } }, th.decor),
				h("div", { className: "po3-chip", style: { position: "absolute", left: tile(19.6), top: tile(2.4), fontSize: 9, borderColor: th.accent } }, th.tag),
				(snap.flights || []).map((f) => h("div", {
					key: f.id, className: "po3-flight",
					style: { left: f.from.x, top: f.from.y, "--dx": (f.to.x - f.from.x) + "px", "--dy": (f.to.y - f.from.y) + "px", animationDuration: f.slow ? "6s" : "1.5s" },
				}, f.icon, h("b", null, f.label))),
				h("div", { className: "po3-sign", style: { left: tile(11), top: tile(0.55), borderColor: th.accent } }, (office.icon || "🏢") + " " + (office.name || "办公室") + (office.purpose ? " · " + office.purpose : "")),
				h("div", { className: "po3-carpet", style: { left: tile(7.4), top: tile(2.7), width: tile(7.2), height: tile(3.5), background: th.accent + "22", borderColor: th.accent + "55" } }),
				h("div", { className: "po3-desk", style: { left: tile(9.3), top: tile(4.75), width: tile(3.4), height: tile(0.95) } },
					h("div", { className: "po3-mon", style: { left: 6, top: -12, width: 24, height: 16 } }, h(Screen, statusOf(boss))),
					h("div", { className: "po3-kb", style: { right: 8, top: 6, width: 22, height: 5 } }),
					h("div", { className: "po3-say2 " + statusOf(boss), style: { fontSize: 9, bottom: 4 } }, "主持中"),
				),
				h(Person, { kind: "boss", who: boss, x: 10.25, y: 3.8, big: true }),
				(function () {
					const ds = digitalOf();
					if (!ds) return null;
					return h("div", { style: { position: "absolute", left: tile(14.6), top: tile(0.75), width: tile(7), zIndex: 9, display: "flex", flexWrap: "nowrap", gap: 4, justifyContent: "flex-start", alignItems: "center" } },
						(ds.channels || []).map((c) => h("span", {
							key: c.id, className: "po3-chip",
							style: { borderColor: c.ok === false ? "#f85149" : "#3fb950", whiteSpace: "nowrap", fontSize: 9 },
							title: c.label + " → " + (c.lastTarget || c.target || "") + (c.lastAt ? "（最近 " + c.lastAt.replace("T", " ") + "）" : "（尚未发送）"),
						}, (c.ok === false ? "⚠ " : "● ") + c.label + (c.lastAt ? " 已用" : " 待用"))),
						h("span", { className: "po3-chip", style: { borderColor: "#5d84b8", whiteSpace: "nowrap", fontSize: 9 }, title: (ds.note || "我是本人的代表，不是 AI 角色") + (ds.channels || []).map(function (c) { return "\n" + c.label + "：" + (c.lastAt ? c.lastAt.replace("T", " ") : "尚未发送"); }).join("") }, "代表本人"));
				})(),
				(function () {
					const ds = digitalOf();
					if (!ds || !ds.recent || !ds.recent.length) return null;
					const t = Date.parse(ds.recent[0].ts);
					if (!t || Date.now() - t > 180000) return null;
					return h("div", { className: "po3-fx", style: { left: tile(17.4), bottom: tile(4.4), fontSize: 15 } }, "📤");
				})(),
				members.length === 0 ? h("div", { className: "po3-hint", style: { position: "absolute", left: tile(11), top: tile(9), color: "#26313d", fontSize: 13 } }, "这个办公室还没有员工") : null,
				h("div", { className: "po3-carpet", style: { left: tile(2.2), top: tile(6.4), width: tile(17.6), height: tile(8.0), borderRadius: 14, opacity: 0.5 } }),
				(function () {
					const items = [];
					for (let i = 0; i < DESK_SLOTS; i++) {
						const col = DESK_COLS[i % DESK_COLS.length];
						const row = DESK_ROWS[Math.floor(i / DESK_COLS.length)];
						const m = members[i];
						items.push(m ? h(Workstation, { key: m.id, member: m, x: col, y: row }) : h(EmptyDesk, { key: "empty" + i, x: col, y: row }));
					}
					return items;
				})(),
			);
		}

		function Viewport() {
			const snap = useOffice();
			const ref = react.useRef(null);
			const drag = react.useRef(null);
			const view = snap.view;
			const fit = () => {
				const el = ref.current; if (!el) return;
				const rect = el.getBoundingClientRect();
				if (rect.width < 60 || rect.height < 60) { setTimeout(() => { try { fit(); } catch (e) {} }, 260); return; }
				const narrow = rect.width < 780;
				const z = narrow ? Math.min(1.15, rect.width / W) : Math.min(rect.width / W, rect.height / H) * 0.96;
				const x = narrow ? Math.max(0, (rect.width - W * z) / 2) : (rect.width - W * z) / 2;
				const y = narrow ? 0 : (rect.height - H * z) / 2;
				setState({ view: { x, y, z } });
			};
			react.useEffect(() => {
				fit();
				const t1 = setTimeout(fit, 350), t2 = setTimeout(fit, 1200);
				const onResize = () => fit();
				window.addEventListener("resize", onResize);
				let ro = null;
				try { const el = ref.current; if (el && window.ResizeObserver) { ro = new ResizeObserver(() => fit()); ro.observe(el); } } catch (e) { /* 忽略 */ }
				return () => { clearTimeout(t1); clearTimeout(t2); window.removeEventListener("resize", onResize); if (ro) ro.disconnect(); };
			}, [snap.open, snap.active, snap.viewMode]);
			react.useEffect(() => {
				const el = ref.current; if (!el) return;
				const onWheel = (e) => {
					e.preventDefault();
					const rect = el.getBoundingClientRect();
					const mx = e.clientX - rect.left, my = e.clientY - rect.top;
					const cur = state.view;
					const z = Math.max(0.25, Math.min(3, cur.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
					const k = z / cur.z;
					setState({ view: { x: mx - (mx - cur.x) * k, y: my - (my - cur.y) * k, z } });
				};
				el.addEventListener("wheel", onWheel, { passive: false });
				return () => el.removeEventListener("wheel", onWheel);
			}, []);
			const zoom = (f) => {
				const el = ref.current; const rect = el.getBoundingClientRect();
				const mx = rect.width / 2, my = rect.height / 2, cur = state.view;
				const z = Math.max(0.25, Math.min(3, cur.z * f)), k = z / cur.z;
				setState({ view: { x: mx - (mx - cur.x) * k, y: my - (my - cur.y) * k, z } });
			};
			const pan = (dx, dy) => setState({ view: Object.assign({}, state.view, { x: state.view.x + dx, y: state.view.y + dy }) });
			return h("div", {
				className: "po3-view", ref,
				onMouseDown: (e) => { drag.current = { sx: e.clientX, sy: e.clientY, vx: state.view.x, vy: state.view.y }; },
				onMouseMove: (e) => { const d = drag.current; if (!d) return; setState({ view: Object.assign({}, state.view, { x: d.vx + (e.clientX - d.sx), y: d.vy + (e.clientY - d.sy) }) }); },
				onMouseUp: () => { drag.current = null; }, onMouseLeave: () => { drag.current = null; },
				onClick: (e) => { if (e.target === e.currentTarget) setState({ sel: null }); },
			},
				h("div", { className: "po3-world", style: { transform: "translate(" + view.x + "px," + view.y + "px) scale(" + view.z + ")", width: W, height: H } }, h(Room)),
				h("div", { className: "po3-ctrl" },
					h("div", { className: "row" }, h("button", { onClick: (e) => { e.stopPropagation(); zoom(1.15); } }, "+"), h("button", { onClick: (e) => { e.stopPropagation(); zoom(1 / 1.15); } }, "−")),
					h("div", { className: "row" }, h("button", { onClick: (e) => { e.stopPropagation(); pan(0, 90); } }, "↓")),
					h("div", { className: "row" }, h("button", { onClick: (e) => { e.stopPropagation(); pan(-90, 0); } }, "←"), h("button", { onClick: (e) => { e.stopPropagation(); fit(); } }, "⤢"), h("button", { onClick: (e) => { e.stopPropagation(); pan(90, 0); } }, "→")),
					h("div", { className: "row" }, h("button", { onClick: (e) => { e.stopPropagation(); pan(0, -90); } }, "↑")),
				),
			);
		}

		function Thumb(props) {
			const [i, setI] = react.useState(0);
			const sources = props.sources || [];
			if (i >= sources.length) return h("div", { style: { width: "100%", height: 30, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: props.tint || "#7f97b0" } }, props.label ? String(props.label).slice(0, 1) : "?");
			return h("img", { src: sources[i], alt: props.label || "", loading: "lazy", onError: () => setI(i + 1) });
		}

		function Picker(props) {
			const snap = useOffice();
			const list = snap.catalog;
			const q = snap.q.trim().toLowerCase();
			const tf = snap.typeFilter;
			const match = (e) => (snap.showForms || e.base !== false) && (!tf || (e.types || []).indexOf(tf) >= 0) && (!q || e.id.indexOf(q) >= 0 || (e.zh || "").indexOf(q) >= 0);
			const filtered = list.filter(match).slice(0, 200);
			const types = ["", "Grass", "Fire", "Water", "Electric", "Psychic", "Dragon", "Dark", "Fairy", "Steel", "Ghost", "Fighting", "Normal", "Flying", "Bug", "Rock", "Ground", "Ice", "Poison"];
			if (props.trainers) {
				return h("div", null,
					h("div", { className: "lbl" }, "我的形象库（" + ((snap.trainers.male || []).length) + " 男 / " + ((snap.trainers.female || []).length) + " 女）"),
					h("div", { className: "po3-chips" }, ["male", "female"].map((g) =>
						h("span", { key: g, className: "po3-chip" + (snap.gender === g ? " on" : ""), onClick: () => setState({ gender: g }) }, g === "male" ? "男性" : "女性"))),
					h("div", { className: "po3-pick" }, ((snap.gender === "female" ? snap.trainers.female : snap.trainers.male) || []).map((name) =>
						h("div", { key: name, title: name, onClick: () => props.onPick({ id: name, trainer: true }) },
							h("img", { src: API + "/sprite/trainer-" + name + ".png", alt: name }),
							h("span", { className: "po3-pickname" }, name)))));
			}
			return h("div", null,
				h("div", { className: "lbl" }, "全部宝可梦（" + list.length + " 种 · 中英文可搜）"),
				h("input", { placeholder: "搜中文或英文：皮卡丘 / char / 妙蛙", value: snap.q, onChange: (e) => setState({ q: e.target.value }) }),
				h("div", { className: "po3-chips" }, types.map((t) =>
					h("span", { key: t || "all", className: "po3-chip" + (tf === t ? " on" : ""), style: t ? { borderColor: TYPE_C[t] } : null, onClick: () => setState({ typeFilter: t }) }, t ? TYPE_ZH[t] : "全部"))),
				h("label", { className: "po3-hint", style: { display: "flex", alignItems: "center", gap: 5, marginTop: 6, cursor: "pointer" } },
					h("input", { type: "checkbox", checked: snap.renameOnPick, onChange: (e) => setState({ renameOnPick: e.target.checked }), style: { width: "auto" } }),
					"换形象时同时把名字改成这只宝可梦"),
				h("label", { className: "po3-hint", style: { display: "flex", alignItems: "center", gap: 5, marginTop: 4, cursor: "pointer" } },
					h("input", { type: "checkbox", checked: snap.showForms, onChange: (e) => setState({ showForms: e.target.checked }), style: { width: "auto" } }),
					"显示特殊形态（143 个，多数没有现成像素图）"),
				h("div", { className: "po3-pick" }, filtered.map((e) =>
					h("div", { key: e.id, title: e.id + " · " + (e.types || []).map((t) => TYPE_ZH[t] || t).join("/"), onClick: async () => {
						const payload = await fetchSprite(e.id);
						if (payload && payload.ok && props.onPick) props.onPick(e);
					} },
						h(Thumb, { sources: [CDN + "gen5/" + e.id + ".png", CDN + "ani/" + e.id + ".gif", CDN + "dex/" + e.id + ".png"], label: e.zh || e.id, tint: TYPE_C[(e.types || [])[0]] }),
						h("span", { className: "po3-pickname" }, e.zh || e.id)))),
				filtered.length < list.filter(match).length
					? h("div", { className: "po3-hint" }, "结果太多，只显示前 160 个 —— 输入关键词缩小范围")
					: null,
			);
		}

		function Side() {
			const snap = useOffice();
			const [draft, setDraft] = react.useState({});
			const sel = snap.sel;
			react.useEffect(() => { setDraft({}); }, [sel && (sel.kind + ":" + sel.id)]);
			const data = snap.data || {};
			const offices = data.offices || [];
			const office = offices.find((o) => o.id === snap.active) || offices[0] || {};

			if (!sel && snap.active === "__meeting") {
				const report = snap.standup || { offices: [] };
				return h("div", { className: "po3-side" },
					h("h3", null, "📋 早会汇报 · " + (report.day || "")),
					h("div", { className: "po3-hint" }, "各办公室负责人汇报昨天 / 今天在做的事（跨办公室只共享任务标题）"),
					h("div", { className: "po3-report", style: { marginTop: 8 } }, (report.offices || []).map((o) => h("div", { key: o.id, className: "off" },
						h("b", null, (o.icon || "") + " " + o.name + "　👑 " + ((o.leader && o.leader.name) || "未指定")),
						h("div", { className: "po3-hint" }, o.headcount + " 人 · " + o.busy + " 人在忙"),
						h("div", { className: "tk dim" }, "昨天：" + ((o.yesterday || []).join("；") || "（无记录）")),
						h("div", { className: "tk" }, "今天：" + ((o.today || []).join("；") || "（暂无）")),
					))),
					h("div", { className: "po3-row", style: { marginTop: 6 } }, h("button", { className: "po3-sm", onClick: () => loadStandup() }, "刷新汇报")),
					h("div", { className: "po3-hint", style: { marginTop: 8 } }, "🔒 保密规则：办公室之间只共享任务标题；未经董事长许可，任何办公室不得调用或复用其他办公室的工作内容。"),
				);
			}
			if (!sel) {
				return h("div", { className: "po3-side" },
					h("h3", null, (office.icon || "🏢") + " " + (office.name || "办公室")),
					h("div", { className: "po3-hint" }, office.purpose || "（没有描述）"),
					h("div", { className: "lbl" }, "办公室名称 / 用途"),
					h("input", { placeholder: "名称", value: draft.officeName !== undefined ? draft.officeName : (office.name || ""), onChange: (e) => setDraft(Object.assign({}, draft, { officeName: e.target.value })) }),
					h("input", { style: { marginTop: 5 }, placeholder: "用途，如：论文与实验", value: draft.officePurpose !== undefined ? draft.officePurpose : (office.purpose || ""), onChange: (e) => setDraft(Object.assign({}, draft, { officePurpose: e.target.value })) }),
					h("div", { className: "po3-row", style: { marginTop: 6 } },
						h("button", { className: "po3-sm", onClick: () => post("/office", { action: "update", id: office.id, name: draft.officeName !== undefined ? draft.officeName : office.name, purpose: draft.officePurpose !== undefined ? draft.officePurpose : office.purpose }) }, "保存"),
						h("button", { className: "po3-sm", onClick: () => { if (window.confirm("删除办公室「" + (office.name || "") + "」？成员会转到第一个办公室。")) post("/office", { action: "delete", id: office.id }); } }, "删除办公室")),
					h("div", { className: "lbl" }, "负责人（👑 显示在名牌上，早会代表本室汇报）"),
					h("select", { value: office.leader || "", onChange: (e) => post("/office", { action: "update", id: office.id, leader: e.target.value }) },
						[h("option", { key: "", value: "" }, "（未指定）")].concat((data.members || []).filter((m) => m.office === office.id).map((m) => h("option", { key: m.id, value: m.id }, m.name)))),
					h("div", { className: "lbl" }, "本室属性（由成员自动汇总）"),
					h("div", { className: "po3-hint" }, officeTypeLabel(data.members || [], office.id) || "（还没有成员）"),
					h("div", { className: "lbl" }, "🪄 发布任务 · 自动安排精灵与人数"),
					h("textarea", { placeholder: "把任务写在这里，例如：写一份关于固态电池的专利交底书，要全面", value: draft.brief || "", onChange: (e) => setDraft(Object.assign({}, draft, { brief: e.target.value })) }),
					h("div", { className: "po3-row", style: { marginTop: 5 } },
						h("select", { value: String(draft.count || 0), onChange: (e) => setDraft(Object.assign({}, draft, { count: Number(e.target.value) })) },
							[0, 1, 2, 3, 4, 5, 6].map((n) => h("option", { key: n, value: String(n) }, n === 0 ? "人数：自动判断" : "人数：" + n))),
						h("button", {
							className: "po3-sm",
							onClick: async () => {
								const brief = String(draft.brief || "").trim();
								if (!brief) return;
								const payload = await post("/plan", { office: office.id, brief: brief, count: Number(draft.count || 0) });
								if (payload && payload.ok) setDraft(Object.assign({}, draft, { planResult: "✅ 已安排 " + payload.count + " 人：" + payload.hired.map((m) => m.role + "·" + m.name).join(" / ") + String.fromCharCode(10) + payload.reasons.map((r) => "· " + r).join(String.fromCharCode(10)) }));
								else if (payload) setDraft(Object.assign({}, draft, { planResult: "❌ " + (payload.error || "安排失败") }));
							},
						}, "安排精灵")),
					draft.planResult ? h("div", { className: "po3-plan" }, draft.planResult) : null,
					h("div", { className: "lbl" }, "＋ 新增单个精灵（指定它负责某项任务）"),
					h("input", { placeholder: "宝可梦英文名，如 pikachu（自动下载素材）", value: draft.hireSprite || "", onChange: (e) => setDraft(Object.assign({}, draft, { hireSprite: e.target.value })) }),
					h("input", { style: { marginTop: 5 }, placeholder: "岗位，如 主笔 / 资料检索 / 校对", value: draft.hireRole || "", onChange: (e) => setDraft(Object.assign({}, draft, { hireRole: e.target.value })) }),
					h("input", { style: { marginTop: 5 }, placeholder: "任务，如 写第三章", value: draft.hireTask || "", onChange: (e) => setDraft(Object.assign({}, draft, { hireTask: e.target.value })) }),
					h("div", { className: "po3-row", style: { marginTop: 5 } },
						h("button", {
							className: "po3-sm",
							onClick: async () => {
								const sprite = String(draft.hireSprite || "").trim().toLowerCase();
								if (!sprite) return;
								const payload = await post("/hire", { office: office.id, sprite: sprite, role: String(draft.hireRole || "执行").trim() || "执行", task: String(draft.hireTask || "").trim() });
								if (payload && payload.ok) setDraft(Object.assign({}, draft, { hireSprite: "", hireRole: "", hireTask: "", planResult: "✅ 已新增 " + payload.member.name + "（" + payload.member.role + "）" + (payload.spriteReady ? "" : " · ⚠ 素材没下到") }));
								else if (payload) setDraft(Object.assign({}, draft, { planResult: "❌ " + (payload.error || "新增失败") }));
							},
						}, "新增精灵")),
					h("div", { className: "lbl" }, "新建办公室"),
					h("input", { placeholder: "新办公室名称，如：论文工厂", value: draft.newName || "", onChange: (e) => setDraft(Object.assign({}, draft, { newName: e.target.value })) }),
					h("input", { style: { marginTop: 5 }, placeholder: "用途（可选）", value: draft.newPurpose || "", onChange: (e) => setDraft(Object.assign({}, draft, { newPurpose: e.target.value })) }),
					h("div", { className: "po3-row", style: { marginTop: 6 } },
						h("button", { className: "po3-sm", onClick: async () => { const name = (draft.newName || "").trim(); if (!name) return; await post("/office", { action: "create", name, purpose: (draft.newPurpose || "").trim() }); setDraft({}); } }, "创建")),
					h("div", { className: "lbl" }, "消息（精灵之间 / 办公室之间）"),
					h("div", { className: "po3-msglist" }, (data.messages || []).slice(-8).reverse().map((m) => h("div", { key: m.id, className: "po3-msg" },
						h("b", null, nameOf(m.from) + " → " + nameOf(m.to)),
						h("span", null, "　" + m.text)))),
					h("div", { className: "po3-row", style: { marginTop: 5 } },
						h("select", { value: state.msgTo || "*", onChange: (e) => setState({ msgTo: e.target.value }) },
							[h("option", { key: "*", value: "*" }, "全员广播")].concat((data.members || []).map((m) => h("option", { key: m.id, value: m.id }, m.name + "（" + ((offices.find((o) => o.id === m.office) || {}).name || "") + "）"))))),
					h("input", { style: { marginTop: 5 }, placeholder: "说点什么，回车发送", value: state.msgText || "", onChange: (e) => setState({ msgText: e.target.value }), onKeyDown: (e) => { if (e.key === "Enter") sendMsg(); } }),
					h("div", { className: "po3-row", style: { marginTop: 5 } },
						h("button", { className: "po3-sm", onClick: () => sendMsg() }, "发送"),
						h("button", { className: "po3-sm", onClick: () => post("/messages/clear", {}) }, "清空")),
					h("div", { className: "lbl" }, "操作"),
					h("div", { className: "po3-hint" }, "滚轮缩放 · 拖动平移 · 点角色改设置 · 点董事长换你的形象"),
				);
			}
			const isBoss = sel.kind === "boss";
			const who = isBoss ? (data.boss || {}) : ((data.members || []).find((m) => m.id === sel.id) || {});
			const status = statusOf(who);
			const apply = (patch) => { const merged = Object.assign({}, draft, patch); setDraft(merged); (isBoss ? setBoss : (p) => setMember(sel.id, p))(merged); };
			return h("div", { className: "po3-side" },
				h("h3", null, (isBoss ? "👑 " : "🧑‍💻 ") + (who.name || sel.id)),
				h("div", { className: "po3-hint" }, (isBoss ? (who.title || "董事长") : (who.role || "")) + " · " + STATUS[status] + (who.model ? " · " + who.model : "")),
				h("div", { className: "lbl" }, "状态"),
				h("div", { className: "po3-row" }, ["busy", "thinking", "idle", "waiting", "error"].map((s) =>
					h("button", { key: s, className: "po3-sm" + (status === s ? " on" : ""), onClick: () => apply({ status: s, task: s === "idle" ? "" : (who.task || "") }) }, STATUS[s]))),
				h("div", { className: "lbl" }, "当前任务"),
				h("input", { value: draft.task !== undefined ? draft.task : (who.task || ""), placeholder: "他在干什么", onChange: (e) => setDraft(Object.assign({}, draft, { task: e.target.value })), onKeyDown: (e) => { if (e.key === "Enter") apply({ task: e.target.value }); } }),
				h("div", { className: "po3-row", style: { marginTop: 5 } }, h("button", { className: "po3-sm", onClick: () => apply({ task: (draft.task !== undefined ? draft.task : who.task) || "" }) }, "保存任务")),
				h("div", { className: "lbl" }, "名字"),
				h("input", { value: draft.name !== undefined ? draft.name : (who.name || ""), onChange: (e) => setDraft(Object.assign({}, draft, { name: e.target.value })), onKeyDown: (e) => { if (e.key === "Enter") apply({ name: e.target.value }); } }),
				h("div", { className: "po3-row", style: { marginTop: 5 } }, h("button", { className: "po3-sm", onClick: () => apply({ name: draft.name !== undefined ? draft.name : who.name }) }, "改名")),
				!isBoss ? h("div", null,
					h("div", { className: "lbl" }, "所属办公室"),
					h("select", { value: who.office || office.id, onChange: (e) => setMember(sel.id, { office: e.target.value }) }, offices.map((o) => h("option", { key: o.id, value: o.id }, (o.icon || "") + " " + o.name))),
					h("div", { className: "lbl" }, "岗位"),
					h("input", { placeholder: "岗位，如 主笔 / 校对", value: draft.role !== undefined ? draft.role : (who.role || ""), onChange: (e) => setDraft(Object.assign({}, draft, { role: e.target.value })) }),
					h("div", { className: "lbl" }, "大模型（选中立即生效）· 可选 " + modelOptions(data.members).length + " 个"),
					(() => {
						const list = modelOptions(data.members);
						const fallback = who.model ? (list.indexOf(who.model) >= 0 ? who.model : "__custom") : "";
						const selValue = draft.modelSel !== undefined ? draft.modelSel : fallback;
						return [
							h("select", {
								key: "modelSel",
								value: selValue,
								onChange: (e) => {
									const v = e.target.value;
									if (v === "__custom") { setDraft(Object.assign({}, draft, { modelSel: "__custom", model: who.model || "" })); return; }
									setDraft(Object.assign({}, draft, { modelSel: v, model: v }));
									setMember(sel.id, { model: v });
								},
							}, [h("option", { key: "", value: "" }, "（未设置）")]
								.concat(list.map((m) => h("option", { key: m, value: m }, modelLabel(m))))
								.concat([h("option", { key: "__custom", value: "__custom" }, "✏️ 自定义模型名…")])),
							selValue === "__custom"
								? h("div", { key: "hint", style: { fontSize: 9.5, color: "#8ab4f8", marginTop: 4 } }, "↓ 在下面填写模型名，回车或点「保存岗位/模型」生效")
								: null,
							h("input", { key: "custom", autoFocus: selValue === "__custom", style: { marginTop: 5 }, placeholder: "自定义模型名，如 glm-4.6 / claude-sonnet-4.5", value: draft.model !== undefined ? draft.model : (who.model || ""), onChange: (e) => setDraft(Object.assign({}, draft, { model: e.target.value })), onKeyDown: (e) => { if (e.key === "Enter") setMember(sel.id, { model: e.target.value }); } }),
						];
					})(),
					h("div", { className: "po3-row", style: { marginTop: 5 } },
						h("button", { className: "po3-sm", onClick: () => apply({ role: draft.role, model: draft.model }) }, "保存岗位/模型"),
						h("button", { className: "po3-sm", onClick: () => { setDraft(Object.assign({}, draft, { model: "" })); setMember(sel.id, { model: "" }); } }, "清空模型"))) : null,
				isBoss ? h(DigitalCard) : null,
				isBoss
					? h(Picker, { trainers: true, onPick: (entry) => setBoss({ sprite: "trainer-" + entry.id }) })
					: h(Picker, { onPick: (entry) => setMember(sel.id, state.renameOnPick && entry.zh ? { sprite: entry.id, name: entry.zh } : { sprite: entry.id }) }),
			);
		}

		function SplitView() {
			const snap = useOffice();
			const box = react.useRef(null);
			const [vertical, setVertical] = react.useState(false);
			const ratio = snap.splitRatio || 0.5;
			react.useEffect(() => {
				const el = box.current; if (!el) return;
				const measure = () => {
					const r = el.getBoundingClientRect();
					if (r.width < 60 || r.height < 60) return;
					setVertical(r.width < 720);
				};
				measure();
				const t = setTimeout(measure, 300);
				let ro = null;
				try { if (window.ResizeObserver) { ro = new ResizeObserver(measure); ro.observe(el); } } catch (e) { /* 忽略 */ }
				window.addEventListener("resize", measure);
				return () => { clearTimeout(t); window.removeEventListener("resize", measure); if (ro) ro.disconnect(); };
			}, []);
			const drag = (e) => {
				const el = box.current; if (!el) return;
				e.preventDefault();
				const r = el.getBoundingClientRect();
				const move = (ev) => {
					const v = vertical ? (ev.clientY - r.top) / r.height : (ev.clientX - r.left) / r.width;
					setState({ splitRatio: Math.max(0.12, Math.min(0.88, v)) });
				};
				const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
				window.addEventListener("mousemove", move);
				window.addEventListener("mouseup", up);
			};
			return h("div", { className: "po3-split " + (vertical ? "vert" : "horz"), ref: box },
				h("div", { className: "po3-split-a", style: vertical ? { height: (ratio * 100) + "%" } : { width: (ratio * 100) + "%" } }, h(Viewport)),
				h("div", { className: "po3-gutter", onMouseDown: drag, onDoubleClick: () => setState({ splitRatio: 0.5 }), title: "拖动调整动画区大小 · 双击复位" }),
				h("div", { className: "po3-split-b" }, h(Side)),
			);
		}

		function RosterView() {
			const snap = useOffice();
			const data = snap.data || {};
			const offices = data.offices || [];
			const members = data.members || [];
			if (snap.active === "__meeting") {
				const report = snap.standup || { offices: [] };
				return h("div", { className: "po3-list" },
					h("h3", { style: { margin: "0 0 4px", fontSize: 13 } }, "📋 早会汇报 · " + (report.day || "")),
					h("div", { className: "po3-hint" }, "各办公室负责人汇报昨天 / 今天在做的事（跨办公室只共享任务标题）"),
					(report.offices || []).map((o) => h("div", { key: o.id, className: "po3-lrow", style: { display: "block", cursor: "default" } },
						h("div", { className: "po3-lname" }, (o.icon || "") + " " + o.name + "　", h("span", { className: "po3-lrole" }, "👑 " + ((o.leader && o.leader.name) || "未指定") + " · " + o.headcount + " 人 · " + o.busy + " 在忙")),
						h("div", { className: "po3-ltask" }, "昨天：" + ((o.yesterday || []).join("；") || "（无记录）")),
						h("div", { className: "po3-ltask", style: { color: "#9fe8b0" } }, "今天：" + ((o.today || []).join("；") || "（暂无）")),
					)),
					h("div", { className: "po3-row", style: { marginTop: 8 } }, h("button", { className: "po3-sm", onClick: () => loadStandup() }, "刷新汇报")),
					h("div", { className: "po3-hint", style: { marginTop: 8 } }, "🔒 办公室之间只共享任务标题；未经你许可不得调用其他办公室的工作内容"),
				);
			}
			const office = offices.find((o) => o.id === snap.active) || offices[0] || {};
			const RANK = { busy: 0, thinking: 1, waiting: 2, error: 3, idle: 4, offline: 5 };
			const list = members.filter((m) => m.office === office.id).sort((a, b) => (RANK[statusOf(a)] === undefined ? 9 : RANK[statusOf(a)]) - (RANK[statusOf(b)] === undefined ? 9 : RANK[statusOf(b)]));
			const color = { busy: "#3fb950", thinking: "#f5c86a", idle: "#8b98a5", waiting: "#8fd8ff", error: "#f85149" };
			const memberName = (arr, id) => { const m = (arr || []).find((x) => x.id === id); return m ? m.name : (id || ""); };
			const ds = digitalOf();
			return h("div", { className: "po3-list" },
				h("div", { className: "po3-hint" }, (office.icon || "") + " " + (office.name || "") + " · " + list.length + " 人 · 属性 " + (officeTypeLabel(members, office.id) || "—") + " · 负责人 " + (memberName(list, office.leader) || "—")),
				h("div", { className: "po3-lsec" }, "成员（点一下可改设置 / 换形象 / 调办公室）"),
				list.map((m) => h("div", { key: m.id, className: "po3-lrow", onClick: () => setState({ sel: { kind: "member", id: m.id } }) },
					h("span", { className: "po3-ldot", style: { background: color[m.status] || "#8b98a5", boxShadow: statusOf(m) === "busy" ? "0 0 7px " + color.busy : "none" } }),
					h("span", { style: { fontSize: 11, width: 14, textAlign: "center" } }, statusOf(m) === "busy" ? "🔥" : (statusOf(m) === "thinking" ? "✳" : (statusOf(m) === "error" ? "⚠" : ""))),
					h("img", { src: spriteUrl(m.sprite || m.id), alt: "" }),
					h("div", { style: { flex: 1, minWidth: 0 } },
						h("div", { className: "po3-lname" }, (office.leader === m.id ? "👑 " : "") + m.name + "　", h("span", { className: "po3-lrole" }, m.role || "")),
						h("div", { className: "po3-ltask" }, (statusOf(m) === "busy" ? "🔥 忙碌中 · " : "") + (m.task || STATUS[statusOf(m)]))),
					h("span", { className: "po3-lrole" }, m.model || ""))),
				h("div", { className: "po3-lsec" }, "其他办公室（点一下切过去）"),
				offices.filter((o) => o.id !== office.id).map((o) => {
					const ms = members.filter((m) => m.office === o.id);
					return h("div", { key: o.id, className: "po3-lrow", onClick: () => setState({ active: o.id, sel: null }) },
						h("span", { className: "po3-lname" }, (o.icon || "") + " " + o.name),
						h("span", { className: "po3-lrole" }, "　" + ms.length + " 人 · " + ms.filter((m) => m.status === "busy").length + " 在忙 · 负责人 " + (memberName(ms, o.leader) || "—")));
				}),
				(data.messages || []).length ? h("div", null,
					h("div", { className: "po3-lsec" }, "最近消息"),
					(data.messages || []).slice(-4).reverse().map((msg) => h("div", { key: msg.id, className: "po3-msg" }, h("b", null, nameOf(msg.from) + " → " + nameOf(msg.to)), h("span", null, "　" + msg.text)))) : null,
				ds && (ds.recent || []).length ? h("div", null,
					h("div", { className: "po3-lsec" }, "数字形象最近替你发出去的"),
					ds.recent.slice(0, 4).map((m) => h("div", { key: m.ts + m.channel, className: "po3-msg" }, h("b", null, (m.channel === "wechat" ? "微信" : "邮箱") + " " + String(m.ts).slice(11, 16)), h("span", null, "　" + m.summary)))) : null,
			);
		}

		function OfficeBody(props) {
			const pane = !!props.pane;
			const snap = useOffice();
			const data = snap.data || {};
			const offices = data.offices || [];
			const members = data.members || [];
			const activeMembers = members.filter((m) => m.office === snap.active);
			const busy = activeMembers.filter((m) => statusOf(m) === "busy").length;
			const shell = h("div", { className: pane ? "po3-pane" : "po3-win" },
					h("div", { className: "po3-top" },
						h("h2", null, "🏢 数字公司"), h(DisplayToggle, null),
						h("button", { key: "__meeting", className: "po3-tab" + (snap.active === "__meeting" ? " on" : ""), onClick: () => setState({ active: "__meeting", sel: null }) }, "📋 会议室"),
						offices.map((o) => {
							const ms = members.filter((m) => m.office === o.id);
							const b = ms.filter((m) => statusOf(m) === "busy").length;
							const t = ms.filter((m) => statusOf(m) === "thinking").length;
							return h("button", {
								key: o.id,
								className: "po3-tab" + (snap.active === o.id ? " on" : "") + (b ? " po3-tab-hot" : (t ? " po3-tab-warm" : "")),
								title: b ? (b + " 人在忙" + (t ? "，" + t + " 人在思考" : "")) : (t ? (t + " 人在思考") : "全部空闲"),
								onClick: () => setState({ active: o.id, sel: null }),
							}, (o.icon || "🏢") + " " + o.name + "（" + ms.length + "）" + (b ? " 🔥" + b : (t ? " ✳" + t : "")));
						}),
						h("button", { className: "po3-tab", onClick: () => setState({ sel: null, note: "在右侧新建办公室" }) }, "＋ 新建"),
						h("span", { className: "po3-sp" }),
						h("span", { className: "po3-meta" }, activeMembers.length + " 人 · " + busy + " 在忙"),
						h("span", { className: "po3-meta" }, h("i", { style: { display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#3fb950", marginRight: 4 } }), "忙碌", h("span", { style: { opacity: .4 } }, "  "), h("i", { style: { display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#f5c86a", marginRight: 4 } }), "思考", h("span", { style: { opacity: .4 } }, "  "), h("i", { style: { display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#8fd8ff", marginRight: 4 } }), "等待", h("span", { style: { opacity: .4 } }, "  "), h("i", { style: { display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#c9d1d9", marginRight: 4 } }), "空闲"),
						snap.note ? h("span", { className: "po3-note" }, snap.note) : null,
						h("button", { className: "po3-tb", onClick: () => setState({ showSessions: !state.showSessions }) }, "🔴 实时会话 " + (snap.sessions || []).length),
						h("span", { className: "po3-vtabs" }, [["map", "🎬 动画"], ["list", "📋 文字"], ["split", "⿻ 分栏"]].map((m) =>
							h("button", { key: m[0], className: "po3-tb" + ((snap.viewMode || (pane ? "map" : "split")) === m[0] ? " on" : ""), onClick: () => setState({ viewMode: m[0] }) }, m[1]))),
						h("button", { className: "po3-tb", onClick: () => { refresh(); loadSprites(); loadCatalog(); loadSessions(); } }, "刷新"),
						pane
							? h("button", { className: "po3-tb", onClick: () => toggle(true) }, "⛶ 全屏")
							: h("button", { className: "po3-tb", onClick: () => toggle(false) }, "关闭"),
					),
					snap.error ? h("div", { style: { color: "#ff9a92", padding: "5px 12px", fontSize: 11.5 } }, "读取失败：" + snap.error) : null,
					snap.showSessions ? h("div", { className: "po3-sessbar" },
						h("span", { className: "po3-meta" }, "本机所有对话（点一下 = 把这个任务指派到当前办公室）："),
						(snap.sessions || []).slice(0, 10).map((s) => h("button", {
							key: s.id, className: "po3-tab" + (s.active ? " on" : ""),
							title: (s.cwd || "") + String.fromCharCode(10) + "最后活动：" + new Date(s.lastActive).toLocaleString(),
							onClick: () => assignSession(s),
						}, (s.active ? "🟢 " : "⚪ ") + String(s.title || s.id).slice(0, 16) + (s.workspace ? " · " + s.workspace : ""))),
					) : null,
					h("div", { className: "po3-main", style: { position: "relative" } },
						(function () {
							const mode = snap.viewMode || (pane ? "map" : "split");
							if (mode === "list") return h(RosterView);
							if (mode === "map") return [h(Viewport, { key: "vp" }), snap.sel ? h("div", { className: "po3-drawer", key: "drawer" },
								h("div", { className: "po3-row", style: { marginBottom: 8 } }, h("button", { className: "po3-sm", onClick: () => setState({ sel: null }) }, "✕ 关闭详情")),
								h(Side)) : null];
							return h(SplitView);
						})()),
				);
			return pane ? shell : h("div", { className: "po3-back" }, shell);
		}

		function Office() {
			useStyle();
			const snap = useOffice();
			react.useEffect(() => {
				const onKey = (e) => { if (e.key === "Escape" && state.open) toggle(false); };
				window.addEventListener("keydown", onKey);
				return () => window.removeEventListener("keydown", onKey);
			}, []);
			if (!snap.open) return null;
			return h(OfficeBody, { pane: false });
		}

		/* 独立窗口页面直接挂这一套 UI（绕开 displayMode 占位逻辑） */
		if (typeof window !== "undefined") {
			/* 独立窗口用的挂载点：必须走 useStyle()，否则整页没有样式（地图会塌成黑的）。 */
			window.__pixelOfficePane = function PixelOfficeWindow() { useStyle(); return h(OfficeBody, { pane: true }); };
		}
		function OfficePane() {
			useStyle();
			const snap = useOffice();
			if (snap.displayMode === "window") {
				return h("div", { className: "po3-pane", style: { padding: "14px 12px", display: "flex", flexDirection: "column", gap: 8 } },
					h("div", { style: { fontSize: 13 } }, "🗔 像素办公室正在独立窗口中显示"),
					h("div", { style: { fontSize: 11, opacity: .7 } }, "独立窗口是普通窗口：点别处会被盖住；内容仍与对话联动。"),
					h(DisplayToggle, null));
			}
			return h(OfficeBody, { pane: true });
		}

		function reportDiag(extra) {
			try {
				const sr = (hostCtx && (hostCtx.get ? hostCtx.get("sidebarRight") : null)) || (hostCtx && hostCtx.sidebarRight) || null;
				const tb = (hostCtx && (hostCtx.get ? hostCtx.get("sidebarRightTabs") : null)) || (hostCtx && hostCtx.sidebarRightTabs) || null;
				const rep = Object.assign({
					ua: (typeof navigator !== "undefined" && navigator.userAgent || "").slice(0, 120),
					href: (typeof location !== "undefined" && location.href || "").slice(0, 120),
					hasSidebarRight: !!sr,
					hasOpenTab: !!(sr && typeof sr.openTab === "function"),
					sidebarRightKeys: sr ? Object.keys(sr).slice(0, 20) : [],
					hasSidebarRightTabs: !!tb,
					hasTabsRegister: !!(tb && typeof tb.register === "function"),
					slotsAvailable: !!(hostCtx && hostCtx.slots),
				}, extra || {});
				fetch(API + "/diag", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(rep) });
			} catch (e) { /* 忽略 */ }
		}

		function openOffice() {
			try {
				const face = (hostCtx && (hostCtx.get ? hostCtx.get("sidebarRight") : null)) || (hostCtx && hostCtx.sidebarRight) || null;
				if (face && typeof face.openTab === "function") {
					try { face.openTab("pixel-office"); reportDiag({ opened: "openTab" }); return true; }
					catch (err) { reportDiag({ opened: "openTab-failed", openTabError: String(err && err.message || err) }); return false; }
				}
				reportDiag({ opened: "no-sidebarRight", faceType: typeof face });
			} catch (e) { reportDiag({ opened: "threw", err: String(e && e.message || e) }); }
			return false;
		}

		function DisplayToggle() {
    const [info, setInfo] = react.useState({ mode: "sidebar", open: false, busy: false, note: "" });
    const load = react.useCallback(async () => {
      try {
        const r = await fetch(API + "/window", { cache: "no-store" });
        if (!r.ok) throw new Error("HTTP " + r.status);
        const j = await r.json();
        const mode = j.mode === "window" ? "window" : "sidebar";
        setInfo((s) => ({ ...s, mode, open: !!j.open, note: "" }));
        setState({ displayMode: mode });
      } catch (e) { setInfo((s) => ({ ...s, note: "窗口服务未就绪（重启 DSH 后可用）" })); }
    }, []);
    react.useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);
    const act = react.useCallback(async (mode, action) => {
      setInfo((s) => ({ ...s, busy: true, mode }));
      try {
        await fetch(API + "/display", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode }) });
        if (action) {
          const r = await fetch(API + "/window", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
          if (!r.ok) throw new Error("HTTP " + r.status);
        }
        setState({ displayMode: mode });
        setInfo((s) => ({ ...s, note: "" }));
      } catch (e) { setInfo((s) => ({ ...s, note: "切换失败：" + String(e && e.message ? e.message : e) })); }
      setInfo((s) => ({ ...s, busy: false }));
      setTimeout(load, 500);
    }, [load]);
    const btn = (label, active, onClick, title) => h("button", {
      className: "po3-tab" + (active ? " on" : ""),
      style: { padding: "1px 7px", fontSize: 11, marginLeft: 4 },
      title, disabled: info.busy, onClick,
    }, label);
    return h("span", { style: { display: "inline-flex", alignItems: "center", flexWrap: "wrap" } },
      btn("侧栏", info.mode === "sidebar", () => act("sidebar", "close"), "在右侧栏显示（跟着聊天窗口走）"),
      btn("窗口", info.mode === "window", () => act("window", info.open ? undefined : "open"), "弹成独立窗口：普通窗口、可被其他窗口盖住，内容仍与对话联动"),
      info.mode === "window" ? btn(info.open ? "收回窗口" : "打开窗口", false, () => act("window", info.open ? "close" : "open"), "打开 / 关闭独立窗口") : null,
      info.note ? h("span", { style: { fontSize: 10, color: "#d29922", marginLeft: 6 } }, info.note) : null,
    );
  }
function OfficeButton() {
			const snap = useOffice();
			react.useEffect(() => { reportDiag({ phase: "button-rendered", modelCount: (snap.data && snap.data.models && snap.data.models.total) || 0 }); }, []);
			const count = snap.data && Array.isArray(snap.data.members) ? snap.data.members.length : 0;
			return h("button", { className: "po3-btn", title: "像素办公室（停靠右侧栏，不挡聊天）", onClick: () => { if (!openOffice()) toggle(); } }, h("i"), h("span", null, "办公室" + (count ? " · " + count : "")));
		}

		function OfficeGlyph() {
			return h("span", { style: { fontSize: 13, lineHeight: 1 } }, "🏢");
		}

		function apply(ctx) {
			hostCtx = ctx;
			startPolling();
			ctx.effect(() => () => stopPolling(), "pixel-office: polling");
			try {
				/* 右栏 tab 类型必须在 sidebarRightTabs 服务就绪之后再注册。
				   以前是 apply() 里同步取服务：服务晚到就取到 null，注册被静默跳过，
				   于是 openTab("pixel-office") 报 "no tab type is registered"，
				   底部按钮退化成全屏浮层。改用动态注入，服务就绪即注册。 */
				ctx.inject(["sidebarRightTabs"], (scope) => {
					scope.effect(() => scope.sidebarRightTabs.register({
						id: "pixel-office",
						kind: "pixel-office",
						title: () => "办公室",
						guide: [{ order: 30, title: () => "像素办公室", description: () => "看数字员工在忙什么，可布置任务、换形象", icon: OfficeGlyph }],
					}), "pixel-office: 右侧栏 tab 类型");
				});
			} catch (e) { /* 老宿主无右栏服务 */ }
			ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({ name: "sidebar.right.pane.tab", key: "pixel-office" }, OfficePane));
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({ name: "sidebar.footer.action", id: "pixel-office", order: 15 }, OfficeButton));
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({ name: "shell.overlay", id: "pixel-office", order: 15 }, Office));
			setTimeout(() => reportDiag({ phase: "applied" }), 1200);
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});