/**
 * dsh-artifacts-panel — Browser half.
 *
 * Embeds the artifacts panel into the native right details column (`details`
 * slot, session scope, priority -1 so it shadows the shipped tool-details
 * panel), plus a small floating trigger in `shell.overlay` that reopens the
 * column via ctx.layout.openDetails() after it was collapsed or a session
 * switch closed it.
 *
 * The panel lets you pick a workspace directory, scans it through the host
 * route `POST /api/artifacts/scan`, and groups/sorts the artifact rows by
 * type, date, size, or line count — all client-side.
 */
window.__ModuleLoader__.load({
	id: "dsh-artifacts-panel",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region lib/types/client/locales.js
		/** Dictionary namespace owned by this plugin. */
		const NS = "artifacts";
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"panel.title": "产物面板",
			"panel.open": "打开产物面板",
			"panel.close": "关闭产物面板",
			"panel.empty": "没有扫描到产物文件",
			"panel.loading": "扫描中…",
			"panel.error": "扫描失败：{message}",
			"panel.refresh": "刷新",
			"panel.auto": "自动刷新",
			"panel.dir": "目录",
			"panel.files": "{count} 个文件",
			"panel.limitReached": "已达扫描上限，结果可能不完整",
			"panel.copy": "复制路径",
			"panel.copied": "已复制",
			"group.none": "不分组",
			"group.type": "按类型",
			"group.date": "按日期",
			"group.size": "按体积",
			"group.lines": "按行数",
			"sort.name": "名称",
			"sort.size": "体积",
			"sort.lines": "行数",
			"sort.mtime": "日期",
			"sort.asc": "升序",
			"sort.desc": "降序",
			"cat.code": "代码",
			"cat.docs": "文档",
			"cat.config": "配置",
			"cat.data": "数据",
			"cat.image": "图片",
			"cat.media": "媒体",
			"cat.web": "前端资源",
			"cat.archive": "归档",
			"cat.other": "其他",
			"date.today": "今天",
			"date.yesterday": "昨天",
			"date.week": "近 7 天",
			"date.month": "近 30 天",
			"date.older": "更早",
			"size.s1": "≤ 1 KB",
			"size.s2": "1–10 KB",
			"size.s3": "10–100 KB",
			"size.s4": "100 KB–1 MB",
			"size.s5": "> 1 MB",
			"lines.none": "无行数",
			"lines.l1": "≤ 10 行",
			"lines.l2": "11–100 行",
			"lines.l3": "101–1000 行",
			"lines.l4": "> 1000 行",
			"unit.b": "{n} B",
			"unit.kb": "{n} KB",
			"unit.mb": "{n} MB",
			"unit.gb": "{n} GB",
			"row.lines": "{n} 行"
		};
		/** English dictionary (same key set). */
		const en = {
			"panel.title": "Artifacts",
			"panel.open": "Open artifacts panel",
			"panel.close": "Close artifacts panel",
			"panel.empty": "No artifact files found",
			"panel.loading": "Scanning…",
			"panel.error": "Scan failed: {message}",
			"panel.refresh": "Refresh",
			"panel.auto": "Auto refresh",
			"panel.dir": "Directory",
			"panel.files": "{count} files",
			"panel.limitReached": "Scan limit reached; results may be incomplete",
			"panel.copy": "Copy path",
			"panel.copied": "Copied",
			"group.none": "No grouping",
			"group.type": "By type",
			"group.date": "By date",
			"group.size": "By size",
			"group.lines": "By lines",
			"sort.name": "Name",
			"sort.size": "Size",
			"sort.lines": "Lines",
			"sort.mtime": "Date",
			"sort.asc": "Ascending",
			"sort.desc": "Descending",
			"cat.code": "Code",
			"cat.docs": "Docs",
			"cat.config": "Config",
			"cat.data": "Data",
			"cat.image": "Image",
			"cat.media": "Media",
			"cat.web": "Web assets",
			"cat.archive": "Archive",
			"cat.other": "Other",
			"date.today": "Today",
			"date.yesterday": "Yesterday",
			"date.week": "Last 7 days",
			"date.month": "Last 30 days",
			"date.older": "Older",
			"size.s1": "≤ 1 KB",
			"size.s2": "1–10 KB",
			"size.s3": "10–100 KB",
			"size.s4": "100 KB–1 MB",
			"size.s5": "> 1 MB",
			"lines.none": "No lines",
			"lines.l1": "≤ 10 lines",
			"lines.l2": "11–100 lines",
			"lines.l3": "101–1000 lines",
			"lines.l4": "> 1000 lines",
			"unit.b": "{n} B",
			"unit.kb": "{n} KB",
			"unit.mb": "{n} MB",
			"unit.gb": "{n} GB",
			"row.lines": "{n} lines"
		};
		//#endregion
		//#region lib/types/client/format.js
		/** Human-readable byte size. */
		function formatSize(t, bytes) {
			if (bytes < 1024) return t("unit.b", { n: String(bytes) });
			if (bytes < 1024 * 1024) return t("unit.kb", { n: (bytes / 1024).toFixed(1) });
			if (bytes < 1024 * 1024 * 1024) return t("unit.mb", { n: (bytes / 1024 / 1024).toFixed(1) });
			return t("unit.gb", { n: (bytes / 1024 / 1024 / 1024).toFixed(2) });
		}
		/** Compact timestamp: MM-DD HH:mm. */
		function formatMtime(ms) {
			const d = new Date(ms);
			const p = (n) => String(n).padStart(2, "0");
			return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
		}
		/** Date bucket key for a millisecond timestamp. */
		function bucketOfDate(ms) {
			const now = new Date();
			const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
			const day = 24 * 60 * 60 * 1000;
			if (ms >= today) return "today";
			if (ms >= today - day) return "yesterday";
			if (ms >= today - 7 * day) return "week";
			if (ms >= today - 30 * day) return "month";
			return "older";
		}
		/** Size bucket key. */
		function bucketOfSize(size) {
			if (size <= 1024) return "s1";
			if (size <= 10 * 1024) return "s2";
			if (size <= 100 * 1024) return "s3";
			if (size <= 1024 * 1024) return "s4";
			return "s5";
		}
		/** Line-count bucket key; null lines (binary/huge) map to "none". */
		function bucketOfLines(lines) {
			if (lines === null) return "none";
			if (lines <= 10) return "l1";
			if (lines <= 100) return "l2";
			if (lines <= 1000) return "l3";
			return "l4";
		}
		//#endregion
		//#region lib/types/client/group.js
		/** Stable display order of type categories. */
		const CATEGORY_ORDER = ["code", "docs", "config", "data", "image", "media", "web", "archive", "other"];
		const DATE_ORDER = ["today", "yesterday", "week", "month", "older"];
		const SIZE_ORDER = ["s1", "s2", "s3", "s4", "s5"];
		const LINES_ORDER = ["none", "l1", "l2", "l3", "l4"];
		/**
		 * Group artifact rows by one dimension. Groups keep a stable order and
		 * carry a localized label plus aggregate totals.
		 * @param files - artifact rows.
		 * @param groupBy - grouping dimension.
		 * @param t - translate.
		 * @returns ordered groups of rows.
		 */
		function groupFiles(files, groupBy, t) {
			if (groupBy === "none" || files.length === 0) return [{
				key: "all",
				label: t("group.none"),
				items: files
			}];
			const groups = new Map();
			for (const file of files) {
				let key;
				if (groupBy === "type") key = CATEGORY_ORDER.includes(file.category) ? file.category : "other";
				else if (groupBy === "date") key = bucketOfDate(file.mtimeMs);
				else if (groupBy === "size") key = bucketOfSize(file.size);
				else if (groupBy === "lines") key = bucketOfLines(file.lines);
				else key = "all";
				let group = groups.get(key);
				if (group === void 0) {
					group = { key, items: [] };
					groups.set(key, group);
				}
				group.items.push(file);
			}
			const order = groupBy === "type" ? CATEGORY_ORDER : groupBy === "date" ? DATE_ORDER : groupBy === "size" ? SIZE_ORDER : LINES_ORDER;
			const prefix = groupBy === "type" ? "cat." : groupBy === "date" ? "date." : groupBy === "size" ? "size." : "lines.";
			const entries = [...groups.values()].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
			return entries.map((group) => ({
				key: group.key,
				label: t(prefix + group.key),
				items: group.items
			}));
		}
		/**
		 * Sort rows within a group by one dimension.
		 * @param items - rows.
		 * @param sortBy - sort key.
		 * @param sortDir - "asc" or "desc".
		 * @returns sorted rows (stable).
		 */
		function sortRows(items, sortBy, sortDir) {
			const sign = sortDir === "asc" ? 1 : -1;
			const sorted = [...items];
			sorted.sort((a, b) => {
				let cmp = 0;
				if (sortBy === "name") cmp = a.name.localeCompare(b.name);
				else if (sortBy === "size") cmp = a.size - b.size;
				else if (sortBy === "lines") cmp = (a.lines ?? -1) - (b.lines ?? -1);
				else if (sortBy === "mtime") cmp = a.mtimeMs - b.mtimeMs;
				if (cmp === 0) cmp = a.name.localeCompare(b.name);
				return sign * cmp;
			});
			return sorted;
		}
		//#endregion
		//#region \0dsh-css:artifacts-panel.module.css
		const css = [
			".dap-fab{position:fixed;right:16px;bottom:76px;z-index:30;display:flex;align-items:center;gap:6px;height:36px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2,#d8d8d8);border-radius:999px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#1a1a1a);font:inherit;font-size:13px;line-height:20px;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.14);pointer-events:auto}",
			".dap-fab:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}",
			".dap-root{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#1a1a1a)}",
			".dap-head{display:flex;flex-direction:column;gap:8px;padding:12px 14px;border-bottom:1px solid var(--dsw-alias-border-l1,#ececec);flex:none}",
			".dap-title{display:flex;align-items:center;justify-content:space-between;font-size:14px;font-weight:600;line-height:20px}",
			".dap-close{background:none;border:none;cursor:pointer;color:var(--dsw-alias-label-tertiary,#999);font-size:14px;line-height:20px;padding:0 2px}",
			".dap-close:hover{color:var(--dsw-alias-label-primary,#1a1a1a)}",
			".dap-controls{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center}",
			".dap-select{flex:1 1 120px;min-width:0;height:26px;padding:0 6px;border:1px solid var(--dsw-alias-border-l2,#d8d8d8);border-radius:6px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#1a1a1a);font:inherit;font-size:12px;line-height:24px}",
			".dap-button{height:26px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2,#d8d8d8);border-radius:6px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-secondary,#555);font:inherit;font-size:12px;line-height:24px;cursor:pointer;white-space:nowrap}",
			".dap-button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#1a1a1a)}",
			".dap-button[data-active]{border-color:var(--dsw-alias-state-business-primary,#4f7cff);color:var(--dsw-alias-state-business-primary,#4f7cff)}",
			".dap-meta{display:flex;align-items:center;gap:10px;color:var(--dsw-alias-label-tertiary,#999);font-size:12px;line-height:18px;flex-wrap:wrap}",
			".dap-limit{color:var(--dsw-alias-state-warning-primary,#c98a00)}",
			".dap-body{flex:1;overflow:auto;padding:4px 0;min-height:0}",
			".dap-state{padding:24px 16px;text-align:center;color:var(--dsw-alias-label-tertiary,#999);font-size:13px;line-height:20px}",
			".dap-group{border-bottom:1px solid var(--dsw-alias-border-l1,#ececec)}",
			".dap-group-head{display:flex;align-items:center;justify-content:space-between;padding:6px 14px 4px;color:var(--dsw-alias-label-secondary,#555);font-size:12px;font-weight:600;line-height:18px;position:sticky;top:0;background:var(--dsw-alias-bg-base,#fff)}",
			".dap-group-count{color:var(--dsw-alias-label-tertiary,#999);font-weight:400}",
			".dap-row{display:grid;grid-template-columns:8px minmax(0,1fr) auto auto auto;gap:8px;align-items:center;padding:4px 14px;cursor:pointer}",
			".dap-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}",
			".dap-dot{width:6px;height:6px;border-radius:50%;flex:none}",
			".dap-name{text-overflow:ellipsis;white-space:nowrap;overflow:hidden;color:var(--dsw-alias-label-primary,#1a1a1a);font-size:13px;line-height:22px}",
			".dap-cell{color:var(--dsw-alias-label-tertiary,#999);font-size:11px;line-height:22px;white-space:nowrap;font-variant-numeric:tabular-nums}",
			".dap-row[data-copied] .dap-name{color:var(--dsw-alias-state-success-primary,#2e9e5b)}",
			".dap-empty{padding:24px 16px;text-align:center;color:var(--dsw-alias-label-tertiary,#999);font-size:13px;line-height:20px}"
		].join("");
		const tagId = "dsh-artifacts-panel/style";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-artifacts-panel";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region lib/types/client/panel.js
		/** Category accent colors (fall back when the theme token is absent). */
		const CATEGORY_COLORS = {
			code: "#4f7cff",
			docs: "#2e9e5b",
			config: "#8a63d2",
			data: "#d09b2e",
			image: "#e05b8d",
			media: "#d95f3b",
			web: "#2ea8b8",
			archive: "#7a8699",
			other: "#9aa0a6"
		};
		/**
		 * The artifacts panel, embedded in the right details column.
		 * @param props - session standard props (sessionId, useSessions, useWorkspaces),
		 *   the injected closeDetails action, and the locale seat t.
		 * @returns the panel filling the details column.
		 */
		function ArtifactsPanel({ sessionId, useSessions, useWorkspaces, closeDetails, t }) {
			const [dir, setDir] = react.useState(null);
			const [data, setData] = react.useState(null);
			const [loading, setLoading] = react.useState(false);
			const [error, setError] = react.useState(null);
			const [groupBy, setGroupBy] = react.useState("type");
			const [sortBy, setSortBy] = react.useState("mtime");
			const [sortDir, setSortDir] = react.useState("desc");
			const [auto, setAuto] = react.useState(true);
			const [copiedPath, setCopiedPath] = react.useState(null);
			const cwd = useSessions((s) => sessionId === void 0 ? void 0 : s.byId[sessionId]?.cwd);
			const workspaces = useWorkspaces((s) => s.items);
			const effectiveDir = dir ?? cwd ?? (workspaces.length > 0 ? workspaces[0].path : null);
			react.useEffect(() => {
				if (effectiveDir === null) return;
				let cancelled = false;
				const controller = new AbortController();
				setData(null);
				setError(null);
				const run = async () => {
					setLoading(true);
					try {
						const response = await fetch("/api/artifacts/scan", {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({ dir: effectiveDir }),
							signal: controller.signal
						});
						const json = await response.json();
						if (!response.ok) throw new Error(json?.error ?? `HTTP ${response.status}`);
						if (!cancelled) setData(json);
					} catch (err) {
						if (!cancelled && err?.name !== "AbortError") setError(String(err?.message ?? err));
					} finally {
						if (!cancelled) setLoading(false);
					}
				};
				run();
				let timer = null;
				if (auto) timer = setInterval(run, 60000);
				return () => {
					cancelled = true;
					controller.abort();
					if (timer !== null) clearInterval(timer);
				};
			}, [effectiveDir, auto]);
			const files = data?.files ?? [];
			const groups = groupFiles(files, groupBy, t).map((group) => ({
				...group,
				items: sortRows(group.items, sortBy, sortDir)
			}));
			const totalSize = files.reduce((sum, file) => sum + (file.size ?? 0), 0);
			const onCopy = (path) => {
				navigator.clipboard?.writeText(path).catch(() => {});
				setCopiedPath(path);
				window.setTimeout(() => setCopiedPath((current) => current === path ? null : current), 1200);
			};
			return (0, react_jsx_runtime.jsxs)("div", {
				className: "dap-root",
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: "dap-head",
						children: [
							(0, react_jsx_runtime.jsxs)("div", {
								className: "dap-title",
								children: [
									(0, react_jsx_runtime.jsx)("span", { children: t("panel.title") }),
									closeDetails !== void 0 && (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "dap-close",
										"aria-label": t("panel.close"),
										onClick: () => {
											closeDetails();
										},
										children: "✕"
									})
								]
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								className: "dap-controls",
								children: [
									(0, react_jsx_runtime.jsx)("select", {
										className: "dap-select",
										value: effectiveDir ?? "",
										title: effectiveDir ?? "",
										onChange: (event) => {
											setDir(event.currentTarget.value || null);
										},
										children: [
											cwd !== void 0 && (0, react_jsx_runtime.jsx)("option", {
												value: cwd,
												children: t("panel.dir") + "：当前会话"
											}),
											workspaces.filter((workspace) => workspace.path !== cwd).map((workspace) => (0, react_jsx_runtime.jsx)("option", {
												value: workspace.path,
												children: `${workspace.title}（${workspace.path}）`
											}, workspace.path))
										]
									}),
									(0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "dap-button",
										disabled: loading,
										onClick: () => {
											setData(null);
											setLoading(true);
										},
										children: t("panel.refresh")
									}),
									(0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "dap-button",
										"data-active": auto || void 0,
										onClick: () => {
											setAuto((value) => !value);
										},
										children: t("panel.auto")
									})
								]
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								className: "dap-controls",
								children: [
									(0, react_jsx_runtime.jsx)("select", {
										className: "dap-select",
										value: groupBy,
										"aria-label": t("group.none"),
										onChange: (event) => {
											setGroupBy(event.currentTarget.value);
										},
										children: [
											(0, react_jsx_runtime.jsx)("option", { value: "none", children: t("group.none") }),
											(0, react_jsx_runtime.jsx)("option", { value: "type", children: t("group.type") }),
											(0, react_jsx_runtime.jsx)("option", { value: "date", children: t("group.date") }),
											(0, react_jsx_runtime.jsx)("option", { value: "size", children: t("group.size") }),
											(0, react_jsx_runtime.jsx)("option", { value: "lines", children: t("group.lines") })
										]
									}),
									(0, react_jsx_runtime.jsx)("select", {
										className: "dap-select",
										value: sortBy,
										"aria-label": "sort",
										onChange: (event) => {
											setSortBy(event.currentTarget.value);
										},
										children: [
											(0, react_jsx_runtime.jsx)("option", { value: "mtime", children: t("sort.mtime") }),
											(0, react_jsx_runtime.jsx)("option", { value: "name", children: t("sort.name") }),
											(0, react_jsx_runtime.jsx)("option", { value: "size", children: t("sort.size") }),
											(0, react_jsx_runtime.jsx)("option", { value: "lines", children: t("sort.lines") })
										]
									}),
									(0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "dap-button",
										onClick: () => {
											setSortDir((value) => value === "asc" ? "desc" : "asc");
										},
										children: sortDir === "asc" ? t("sort.asc") : t("sort.desc")
									})
								]
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								className: "dap-meta",
								children: [
									(0, react_jsx_runtime.jsx)("span", { children: t("panel.files", { count: String(files.length) }) }),
									(0, react_jsx_runtime.jsx)("span", { children: formatSize(t, totalSize) }),
									data?.limitReached === true && (0, react_jsx_runtime.jsx)("span", {
										className: "dap-limit",
										children: t("panel.limitReached")
									})
								]
							})
						]
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: "dap-body",
						children: loading && data === null ? (0, react_jsx_runtime.jsx)("div", {
							className: "dap-state",
							children: t("panel.loading")
						}) : error !== null ? (0, react_jsx_runtime.jsx)("div", {
							className: "dap-state",
							children: t("panel.error", { message: error })
						}) : files.length === 0 ? (0, react_jsx_runtime.jsx)("div", {
							className: "dap-empty",
							children: t("panel.empty")
						}) : groups.map((group) => (0, react_jsx_runtime.jsxs)("div", {
							className: "dap-group",
							children: [
								(0, react_jsx_runtime.jsxs)("div", {
									className: "dap-group-head",
									children: [
										(0, react_jsx_runtime.jsx)("span", { children: group.label }),
										(0, react_jsx_runtime.jsx)("span", {
											className: "dap-group-count",
											children: `${group.items.length} · ${formatSize(t, group.items.reduce((sum, file) => sum + (file.size ?? 0), 0))}`
										})
									]
								}),
								group.items.map((file) => {
									const color = CATEGORY_COLORS[file.category] ?? CATEGORY_COLORS.other;
									return (0, react_jsx_runtime.jsxs)("div", {
										className: "dap-row",
										title: file.path,
										"data-copied": copiedPath === file.path || void 0,
										onClick: () => {
											onCopy(file.path);
										},
										children: [
											(0, react_jsx_runtime.jsx)("span", {
												className: "dap-dot",
												style: { background: color }
											}),
											(0, react_jsx_runtime.jsx)("span", {
												className: "dap-name",
												children: copiedPath === file.path ? t("panel.copied") : file.name
											}),
											(0, react_jsx_runtime.jsx)("span", {
												className: "dap-cell",
												children: file.lines === null ? t("lines.none") : t("row.lines", { n: String(file.lines) })
											}),
											(0, react_jsx_runtime.jsx)("span", {
												className: "dap-cell",
												children: formatSize(t, file.size)
											}),
											(0, react_jsx_runtime.jsx)("span", {
												className: "dap-cell",
												children: formatMtime(file.mtimeMs)
											})
										]
									}, file.path);
								})
							]
						}, group.key))
					})
				]
			});
		}
		/**
		 * Floating trigger that reopens the details column.
		 * @param props - the injected openDetails action and the locale seat t.
		 * @returns a small floating button.
		 */
		function ArtifactsTrigger({ openDetails, t }) {
			return (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: "dap-fab",
				"aria-label": t("panel.open"),
				title: t("panel.title"),
				onClick: () => {
					openDetails();
				},
				children: [
					(0, react_jsx_runtime.jsx)("span", { children: "📦" }),
					(0, react_jsx_runtime.jsx)("span", { children: t("panel.title") })
				]
			});
		}
		//#endregion
		//#region lib/types/client/index.js
		/** Required services: the slot registry, the locale seat, and the layout panel actions. */
		const inject = ["slots", "locale", "layout"];
		/**
		 * Client plugin body: register dictionaries, the details-column panel, and
		 * the floating reopen trigger.
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "artifacts-panel: dictionaries");
			ctx.slots.inject("details", () => ctx.slots.register({
				name: "details",
				priority: -1,
				locale: NS,
				inject: () => ({
					closeDetails: () => {
						ctx.layout.closeDetails();
					}
				})
			}, ArtifactsPanel));
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "dsh-artifacts-panel-trigger",
				locale: NS,
				inject: () => ({
					openDetails: () => {
						ctx.layout.openDetails();
					}
				})
			}, ArtifactsTrigger));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.ArtifactsPanel = ArtifactsPanel;
		exports.ArtifactsTrigger = ArtifactsTrigger;
		exports.groupFiles = groupFiles;
		exports.sortRows = sortRows;
		exports.formatSize = formatSize;
		exports.bucketOfDate = bucketOfDate;
		exports.bucketOfSize = bucketOfSize;
		exports.bucketOfLines = bucketOfLines;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
