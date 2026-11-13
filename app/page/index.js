import { BasePage } from "@zeppos/zml/base-page";
import { resetPageBrightTime, setPageBrightTime } from "@zos/display";
import { readFileSync, writeFileSync } from "@zos/fs";
import { KEY_DOWN, KEY_EVENT_CLICK, KEY_SELECT, KEY_UP, onKey } from "@zos/interaction";
import { LocalStorage } from "@zos/storage";
import { align, createWidget, event, prop, text_style, widget } from "@zos/ui";
import { formatMoney, formatTokens, RANGE_ORDER } from "../shared/usage-view-model.js";

const CACHE_KEY = "t3_usage_cache";
const CACHE_FILE = "t3_usage_cache.json";
let localStoreInstance = null;

function getLocalStore() {
  if (localStoreInstance === null) {
    try {
      localStoreInstance = new LocalStorage();
    } catch {
      localStoreInstance = false;
    }
  }
  return localStoreInstance || null;
}

function readLocalCache() {
  try {
    const store = getLocalStore();
    let text = null;
    if (store) {
      try { text = store.getItem(CACHE_KEY); } catch {}
    }
    if (!text) {
      try {
        text = readFileSync({ path: CACHE_FILE, options: { encoding: "utf8" } });
      } catch {}
    }
    if (!text) return null;
    const parsed = typeof text === "string" ? JSON.parse(text) : text;
    if (parsed && parsed.version === 2 && parsed.ranges) {
      return { ...parsed, stale: true };
    }
  } catch {
    // Ignore read errors
  }
  return null;
}

function writeLocalCache(data) {
  if (!data || data.version !== 2 || !data.ranges) return;
  try {
    const serialized = JSON.stringify(data);
    const store = getLocalStore();
    if (store) {
      try { store.setItem(CACHE_KEY, serialized); } catch {}
    }
    try {
      writeFileSync({
        path: CACHE_FILE,
        data: serialized,
        options: { encoding: "utf8" },
      });
    } catch {}
  } catch {
    // Ignore write errors
  }
}

const C = {
  bg: 0x000000,
  panel: 0x141416,
  panelMuted: 0x0d0d0f,
  active: 0x252529,
  border: 0x242428,
  white: 0xf4f4f5,
  muted: 0x96969d,
  blue: 0x5b82ff,
  chart: 0x8c7bea,
  grid: 0x26252c,
  other: 0x77777f,
};

const RANGE_LABELS = { "24h": "24H", "7d": "7D", "30d": "30D", "90d": "90D" };
const MODE_LABELS = { cost: "Cost", tokens: "Tokens", limits: "Limits" };
const CONTROL_RADIUS = 12;
const PAGE_BRIGHT_TIME_MS = 35_000;
const USAGE_REQUEST_TIMEOUT_MS = 30_000;
let activeContainer = null;

function makeWidget(type, params) {
  return activeContainer ? activeContainer.createWidget(type, params) : createWidget(type, params);
}

function setChildMore(target, params) {
  target.setProperty(prop.MORE, params);
}

function makeText(x, y, w, h, value, size, color, alignH = align.LEFT, style = text_style.ELLIPSIS) {
  return makeWidget(widget.TEXT, {
    x, y, w, h, text: value, text_size: size, color,
    align_h: alignH, align_v: align.CENTER_V, text_style: style,
  });
}

function row(title, value, detail = "") {
  return { title, value, detail };
}

function providerName(providers, driver) {
  return providers.find((provider) => provider.driver === driver)?.displayName || shortProviderName(driver);
}

function providerColor(driver) {
  const name = String(driver).toLowerCase();
  if (name.includes("codex")) return 0xe6e6e6;
  if (name.includes("open")) return 0x5b9bbd;
  if (name.includes("antigravity")) return 0x8c7bd1;
  if (name.includes("claude")) return 0xd97757;
  if (name.includes("cursor")) return 0x59b58b;
  if (name.includes("grok")) return 0xe4b455;
  if (name === "pi" || name.includes(" pi ")) return 0x4d9f8a;
  if (name.includes("muse")) return 0x0866ff;
  return 0x494949;
}

function shortProviderName(provider) {
  const name = String(provider).toLowerCase();
  if (name === "__other__") return "Other";
  if (name.includes("antigravity")) return "Antigravity";
  if (name.includes("opencode")) return "OpenCode";
  if (name.includes("claude")) return "Claude";
  if (name.includes("codex")) return "Codex";
  if (name.includes("cursor")) return "Cursor";
  if (name.includes("grok")) return "Grok";
  if (name.includes("muse")) return "Muse";
  if (name === "pi" || name.includes(" pi ")) return "Pi";
  const label = String(provider);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatHeroMoney(value) {
  if (!Number.isFinite(value)) return "-";
  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (absolute >= 1_000_000) return `${sign}$${(absolute / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `${sign}$${(absolute / 1_000).toFixed(1)}K`;
  if (absolute > 0 && absolute < 0.01) return `${sign}<$0.01`;
  return formatMoney(value);
}

function quotaWindowTitle(window, accountName, driver) {
  const provider = shortProviderName(driver);
  const parts = String(window.label || "Quota").split(/\s*·\s*/).filter(Boolean);
  let periodIndex = parts.findIndex((part) => /monthly|weekly|5[- ]?hour|daily|session/i.test(part));
  if (periodIndex < 0 && parts.length > 1) periodIndex = parts.length - 1;
  const period = parts.length > 1 && periodIndex >= 0 ? parts[periodIndex] : String(window.label || "Quota");
  const embeddedAccount = parts.length > 1 ? parts.filter((_, index) => index !== periodIndex).join(" · ") : "";
  const account = [embeddedAccount, accountName]
    .flatMap((name) => String(name || "").split(/\s*·\s*/))
    .map((name) => name.trim())
    .filter((name, index, names) => name && name.toLowerCase() !== provider.toLowerCase()
      && names.findIndex((candidate) => candidate.toLowerCase() === name.toLowerCase()) === index);
  return [period, ...account, provider].join(" · ");
}

function collectLimitWindows(view) {
  const windows = [];
  const seen = new Set();
  const addWindow = (window, name, driver) => {
    const key = JSON.stringify([driver, name, window.id, window.label, window.usedPercent, window.resetsAt]);
    if (seen.has(key)) return;
    seen.add(key);
    const usedPercent = Math.max(0, Math.min(100, Number(window.usedPercent) || 0));
    windows.push({
      title: quotaWindowTitle(window, name, driver),
      usedPercent,
      leftPercent: 100 - usedPercent,
      color: providerColor(driver || name),
    });
  };
  for (const provider of view?.limits.providers || []) {
    const limits = provider.usageLimits;
    if (!limits) continue;
    const name = provider.displayName || provider.driver || "Provider";
    for (const window of limits.windows || []) {
      addWindow(window, name, provider.driver);
    }
  }
  for (const source of view?.limits.sources || []) {
    for (const account of source.accounts || []) {
      const accountName = account.displayName || account.label || account.id || source.label || "Account";
      const plan = account.plan && !accountName.toLowerCase().includes(String(account.plan).toLowerCase())
        ? ` (${account.plan})`
        : "";
      const name = `${accountName}${plan}`;
      for (const window of account.usageLimits?.windows || []) {
        addWindow(window, name, account.driver);
      }
    }
  }
  return windows;
}

function buildRows(view, mode) {
  if (!view) return [];
  const t = view.totals;
  const rows = [];

  if (mode === "limits") {
    const windows = collectLimitWindows(view);
    for (const limit of windows) {
      rows.push({ ...row(limit.title, `${Math.round(limit.leftPercent)}% left`), color: limit.color, fillPercent: limit.leftPercent });
    }
    return rows.length ? rows : [row("No supported quotas", "", "Refresh to check again")];
  }

  const models = mode === "tokens" ? view.modelsByTokens : view.modelsByCost;
  for (const model of models) {
    const costUnknown = model.records > 0 && model.unpricedRecords >= model.records;
    const mixedPricing = model.unpricedRecords > 0 && !costUnknown;
    const amount = mode === "tokens" ? formatTokens(model.tokens) : costUnknown ? "Unpriced" : formatHeroMoney(model.costUsd);
    const costDetail = costUnknown ? "no known rates" : formatMoney(model.costUsd);
    const unpricedDetail = mixedPricing ? ` · ${model.unpricedRecords} unpriced records` : "";
    const detail = `${providerName(view.limits.providers, model.provider)} · ${mode === "tokens" ? costDetail : formatTokens(model.tokens) + " tokens"}${unpricedDetail}`;
    rows.push({
      ...row(model.label, amount, detail),
      color: providerColor(model.provider),
      fillPercent: mode === "tokens"
        ? (t.tokens > 0 ? (model.tokens / t.tokens) * 100 : 0)
        : (t.costUsd > 0 ? (model.costUsd / t.costUsd) * 100 : 0),
      model: true,
    });
  }
  return rows.length ? rows : [row("No model usage", "", `${t.sessions} sessions`)];
}

function updateText(target, value) {
  target.setProperty(prop.TEXT, value);
}

function setVisible(target, visible) {
  target.setProperty(prop.VISIBLE, visible);
}

Page(
  BasePage({
    state: { range: "24h", viewRange: null, mode: "cost", view: null, busy: false, refreshFailed: false, errorMessage: "", limitWindows: [], snapshot: null, snapshotRequest: null, pendingRange: null },
    build() {
      setPageBrightTime({ brightTime: PAGE_BRIGHT_TIME_MS });
      createWidget(widget.FILL_RECT, { x: 0, y: 0, w: 480, h: 480, color: C.bg });
      this.state.content = createWidget(widget.VIEW_CONTAINER, { x: 0, y: 0, w: 480, h: 480, scroll_enable: 1 });
      activeContainer = this.state.content;
      makeWidget(widget.FILL_RECT, { x: 0, y: 0, w: 480, h: 176, color: C.bg });
      this.state.rangeBg = makeWidget(widget.FILL_RECT, { x: 84, y: 68, w: 132, h: 48, radius: CONTROL_RADIUS, color: C.panel });
      this.state.rangeButton = makeText(84, 68, 132, 48, "24H", 24, C.white, align.CENTER_H);
      this.state.rangeButton.addEventListener(event.CLICK_UP, () => this.cycleRange());
      this.state.refreshBg = makeWidget(widget.FILL_RECT, { x: 264, y: 68, w: 132, h: 48, radius: CONTROL_RADIUS, color: C.panel });
      this.state.refreshButton = makeText(264, 68, 132, 48, "REFRESH", 18, C.white, align.CENTER_H);
      this.state.refreshButton.addEventListener(event.CLICK_UP, () => this.refresh(this.state.range));

      this.state.modeGroup = this.makeSegmentGroup(60, 132, 360, 52, ["cost", "tokens", "limits"], MODE_LABELS, this.state.mode, (mode) => this.selectMode(mode));
      activeContainer = this.state.content;
      this.state.metricLabel = makeText(32, 200, 416, 32, "TOTAL COST", 23, C.muted, align.CENTER_H);
      this.state.metricValue = makeText(32, 234, 416, 82, "-", 76, C.white, align.CENTER_H);
      this.state.metricCaption = makeText(32, 304, 416, 64, "- sessions  ·  - tokens", 23, C.muted, align.CENTER_H, text_style.WRAP);

      this.state.chartTitle = makeText(72, 394, 160, 34, "COST TREND", 24, C.white);
      this.state.chartScale = makeText(236, 394, 172, 34, "PEAK", 18, C.muted, align.RIGHT);
      this.state.chartStart = makeText(58, 768, 160, 30, "24H AGO", 20, C.muted);
      this.state.chartEnd = makeText(262, 768, 160, 30, "NOW", 20, C.muted, align.RIGHT);
      this.state.chartCanvas = makeWidget(widget.CANVAS, { x: 40, y: 548, w: 400, h: 210 });
      this.state.chartLegend = Array.from({ length: 4 }, (_, index) => {
        const x = index % 2 === 0 ? 56 : 256;
        const y = 478 + Math.floor(index / 2) * 32;
        const dot = makeWidget(widget.FILL_RECT, { x, y: y + 8, w: 14, h: 14, radius: 7, color: C.other });
        const label = makeText(x + 22, y, 160, 30, "Other", 20, C.muted);
        return { dot, label, x, y };
      });

      this.state.rows = [];
      this.state.scrollPos = 0;
      this.state.contentHeight = 480;
      this.state.rowCards = [];
      this.state.rowsTitle = makeText(56, 826, 368, 44, "TOP MODELS", 30, C.white);
      activeContainer = null;

      updateText(this.state.rangeButton, RANGE_LABELS[this.state.range]);
      this.updateSegments(this.state.modeGroup, this.state.mode);
      this.updateMetrics();
      this.applyLayout();
      this.updateRows();
      onKey({
        callback: (key, keyEvent) => {
          if (keyEvent !== KEY_EVENT_CLICK) return false;
          if (key === KEY_SELECT) { this.refresh(this.state.range); return true; }
          if (key === KEY_UP) { this.scrollContent(-72); return true; }
          if (key === KEY_DOWN) { this.scrollContent(72); return true; }
          return false;
        },
      });
      const cached = readLocalCache();
      if (cached) {
        this.applyPayload(cached, this.state.range);
      }
      this.refresh(this.state.range);
    },
    makeSegmentGroup(x, y, w, h, keys, labels, selected, onSelect) {
      const track = makeWidget(widget.FILL_RECT, { x, y, w, h, radius: CONTROL_RADIUS, color: C.panelMuted });
      const active = makeWidget(widget.FILL_RECT, { x: x + 2, y: y + 2, w: Math.floor(w / keys.length) - 4, h: h - 4, radius: 10, color: C.active });
      const cells = keys.map((key, index) => {
        const cellWidth = w / keys.length;
        const text = makeText(x + index * cellWidth, y + 1, cellWidth, h - 2, labels[key], 24, C.muted, align.CENTER_H);
        text.addEventListener(event.CLICK_UP, () => onSelect(key));
        return { key, text };
      });
      return { x, y, w, h, keys, track, active, cells };
    },
    updateSegments(group, selected) {
      const index = group.keys.indexOf(selected);
      const cellWidth = group.w / group.keys.length;
      group.active.setProperty(prop.MORE, { x: group.x + index * cellWidth + 2, y: group.y + 2, w: cellWidth - 4, h: group.h - 4, color: C.active });
      for (const cell of group.cells) cell.text.setProperty(prop.COLOR, cell.key === selected ? C.white : C.muted);
    },
    makeRow(y) {
      const title = makeText(68, y, 344, 104, "", 26, C.white, align.LEFT, text_style.WRAP);
      const value = makeText(68, y + 80, 344, 46, "", 32, C.white);
      const detail = makeText(68, y + 132, 344, 56, "", 22, C.muted, align.LEFT, text_style.WRAP);
      const track = makeWidget(widget.FILL_RECT, { x: 68, y: y + 204, w: 344, h: 12, radius: 6, color: C.grid });
      const fill = makeWidget(widget.FILL_RECT, { x: 68, y: y + 204, w: 1, h: 12, radius: 6, color: C.chart });
      return { title, value, detail, track, fill };
    },
    async selectMode(mode) {
      if (mode === this.state.mode) return;
      this.state.mode = mode;
      this.state.scrollPos = 0;
      this.state.content.pos_y = 0;
      this.updateSegments(this.state.modeGroup, mode);
      this.updateMetrics();
      this.applyLayout();
      this.updateRows();
      this.updateChart();
    },
    async cycleRange() {
      const index = RANGE_ORDER.indexOf(this.state.range);
      const nextRange = RANGE_ORDER[(index + 1) % RANGE_ORDER.length];
      await this.selectRange(nextRange);
    },
    async selectRange(range) {
      if (range === this.state.range) return;
      this.state.range = range;
      updateText(this.state.rangeButton, RANGE_LABELS[range]);
      if (this.state.snapshot?.ranges?.[range]) {
        this.state.pendingRange = null;
        this.applyPayload(this.state.snapshot, range);
        return;
      }
      this.state.pendingRange = range;
      this.state.scrollPos = 0;
      this.state.content.pos_y = 0;
      this.updateMetrics();
      this.applyLayout();
      this.updateRowCards();
      try {
        const payload = await this.fetchSnapshot();
        if (this.state.range !== range) return;
        this.state.pendingRange = null;
        this.applyPayload(payload, range);
      } catch (error) {
        if (this.state.range !== range) return;
        this.state.pendingRange = null;
        this.state.range = this.state.viewRange || "24h";
        updateText(this.state.rangeButton, RANGE_LABELS[this.state.range]);
        this.state.refreshFailed = true;
        this.state.errorMessage = String(error?.message || "Refresh failed");
        updateText(this.state.refreshButton, this.state.errorMessage.toLowerCase().includes("key") ? "KEY?" : "ERROR");
        this.updateMetrics();
        this.applyLayout();
        this.updateRows();
        this.updateChart();
      }
    },
    loadCachedSnapshot() {
      this.request({ method: "GET_USAGE_CACHE" }).then((payload) => {
        if (payload?.version !== 2 || !payload.ranges) return;
        if (this.state.snapshot && !this.state.snapshot.stale) return;
        this.state.snapshot = payload;
        writeLocalCache(payload);
        if (!this.state.view || this.state.view.stale) this.applyPayload(payload, this.state.range);
      }).catch(() => {});
    },
    fetchSnapshot() {
      if (this.state.snapshotRequest) return this.state.snapshotRequest;
      setPageBrightTime({ brightTime: PAGE_BRIGHT_TIME_MS });
      let timeoutId;
      const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Phone request timed out. Check the Zepp app connection and retry.")), USAGE_REQUEST_TIMEOUT_MS);
      });
      const request = Promise.race([
        this.request({ method: "GET_USAGE" }),
        timeout,
      ])
        .then((payload) => {
          if (payload?.version !== 2 || !payload.ranges) throw new Error(payload?.error || "Worker returned no usage snapshot");
          this.state.snapshot = payload;
          if (payload.error) throw new Error(payload.error);
          return payload;
        })
        .finally(() => {
          clearTimeout(timeoutId);
          this.state.snapshotRequest = null;
          resetPageBrightTime();
        });
      this.state.snapshotRequest = request;
      return request;
    },
    applyPayload(snapshot, range) {
      const page = snapshot.ranges?.[range];
      if (!page) return;
      if (snapshot.stale && this.state.viewRange === range && this.state.view && !this.state.view.stale) return;
      this.state.snapshot = snapshot;
      this.state.range = range;
      this.state.viewRange = range;
      this.state.pendingRange = null;
      this.state.view = {
        ...page,
        limits: snapshot.limits || { providers: [], sources: [] },
        fetchedAt: snapshot.fetchedAt || null,
        stale: snapshot.stale === true,
      };
      if (!snapshot.stale) {
        this.state.refreshFailed = false;
        this.state.errorMessage = "";
        updateText(this.state.refreshButton, "REFRESH");
      }
      this.state.limitWindows = collectLimitWindows(this.state.view);
      updateText(this.state.rangeButton, RANGE_LABELS[range]);
      this.updateMetrics();
      this.applyLayout();
      this.updateRows();
      this.updateChart();
    },
    applyLayout() {
      const limits = this.state.mode === "limits";
      const hasView = Boolean(this.state.view);
      const hasChart = !limits && hasView && !this.state.pendingRange;
      const showSummary = !limits || !hasView || Boolean(this.state.pendingRange);
      const modeY = 132;
      const modeX = 44;
      const modeWidth = 392;
      this.state.modeGroup.x = modeX;
      this.state.modeGroup.w = modeWidth;
      this.state.modeGroup.y = modeY;
      setChildMore(this.state.modeGroup.track, { x: modeX, y: modeY, w: modeWidth, h: this.state.modeGroup.h });
      const cellWidth = this.state.modeGroup.w / this.state.modeGroup.keys.length;
      this.state.modeGroup.cells.forEach((cell, index) => {
        setChildMore(cell.text, { x: this.state.modeGroup.x + index * cellWidth, y: modeY + 1, w: cellWidth, h: this.state.modeGroup.h - 2 });
      });
      const selectedIndex = this.state.modeGroup.keys.indexOf(this.state.mode);
      setChildMore(this.state.modeGroup.active, { x: this.state.modeGroup.x + selectedIndex * cellWidth + 2, y: modeY + 2, w: cellWidth - 4, h: this.state.modeGroup.h - 4 });
      setVisible(this.state.chartTitle, hasChart);
      setVisible(this.state.chartScale, hasChart);
      setVisible(this.state.chartStart, hasChart);
      setVisible(this.state.chartEnd, hasChart);
      setVisible(this.state.chartCanvas, hasChart);
      for (const item of this.state.chartLegend) {
        setVisible(item.dot, hasChart);
        setVisible(item.label, hasChart);
      }
      setVisible(this.state.rowsTitle, !limits && hasView && !this.state.pendingRange && this.state.rows.some((item) => item.model));
      for (const target of [this.state.metricLabel, this.state.metricValue, this.state.metricCaption]) setVisible(target, showSummary);
      if (limits && hasView) this.state.chartCanvas.clear({ x: 0, y: 0, w: 400, h: 210 });
      if (!hasView) {
        setChildMore(this.state.metricLabel, { x: 32, y: 200, w: 416, h: 32, text_size: 22 });
        setChildMore(this.state.metricValue, { x: 32, y: 234, w: 416, h: 48, text_size: 34 });
        setChildMore(this.state.metricCaption, { x: 32, y: 290, w: 416, h: 74, text_size: 20, text_style: text_style.WRAP });
      } else if (!limits) {
        setChildMore(this.state.metricLabel, { x: 32, y: 200, w: 416, h: 32, text_size: 23 });
        setChildMore(this.state.metricValue, { x: 32, y: 234, w: 416, h: 82, text_size: 76 });
        setChildMore(this.state.metricCaption, { x: 32, y: 320, w: 416, h: 64, text_size: 19, text_style: text_style.WRAP });
      }
    },
    updateMetrics() {
      const view = this.state.view;
      updateText(this.state.rangeButton, RANGE_LABELS[this.state.range]);
      if (this.state.pendingRange) {
        updateText(this.state.metricLabel, `LOADING ${RANGE_LABELS[this.state.pendingRange]}`);
        updateText(this.state.metricValue, "Loading");
        updateText(this.state.metricCaption, "Preparing usage data");
        return;
      }
      if (!view) {
        updateText(this.state.metricLabel, this.state.busy ? "LOADING USAGE" : this.state.refreshFailed ? "REFRESH FAILED" : "PHONE LINK REQUIRED");
        updateText(this.state.metricValue, this.state.busy ? "Loading" : this.state.refreshFailed ? "Check connection" : "Open phone app");
        updateText(this.state.metricCaption, this.state.busy ? "Fetching usage data" : this.state.refreshFailed
          ? (this.state.errorMessage || "Check the phone link and Worker settings, then retry").slice(0, 70)
          : "Connect the phone app to the Worker, then refresh");
        return;
      }
      const freshness = view.stale ? "CACHED" : this.state.refreshFailed ? "SYNC ERR" : "";
      if (this.state.mode === "limits") return;
      const isCost = this.state.mode === "cost";
      const noUsage = view.totals.records === 0 && view.totals.sessions === 0 && view.totals.tokens === 0;
      updateText(this.state.metricLabel, isCost ? "TOTAL COST" : "TOKENS");
      updateText(this.state.metricValue, isCost ? formatHeroMoney(view.totals.costUsd) : formatTokens(view.totals.tokens));
      const status = this.state.busy ? (view.stale ? "SYNCING · CACHED" : "SYNCING") : freshness;
      const details = `${view.totals.sessions} sessions · ${isCost ? formatTokens(view.totals.tokens) + " tokens" : formatMoney(view.totals.costUsd)}`;
      updateText(this.state.metricCaption, noUsage
        ? `No usage in this period${freshness ? ` · ${freshness}` : ""}`
        : `${details}${status ? ` · ${status}` : ""}`);
      updateText(this.state.chartTitle, `${isCost ? "COST" : "TOKEN"} TREND`);
      updateText(this.state.chartStart, this.state.range === "24h" ? "24H AGO" : `${this.state.range.toUpperCase()} AGO`);
    },
    updateRows() {
      this.state.rows = buildRows(this.state.view, this.state.mode);
      if (this.state.rows.length > this.state.rowCards.length) {
        activeContainer = this.state.content;
        for (let index = this.state.rowCards.length; index < this.state.rows.length; index += 1) {
          this.state.rowCards.push(this.makeRow(0));
        }
        activeContainer = null;
      }
      this.state.scrollPos = 0;
      this.state.content.pos_y = 0;
      this.updateRowCards();
    },
    scrollContent(delta) {
      const max = Math.max(0, this.state.contentHeight - 480);
      const nativePosition = this.state.content.pos_y;
      if (typeof nativePosition === "number" && Number.isFinite(nativePosition)) this.state.scrollPos = nativePosition;
      this.state.scrollPos = Math.max(0, Math.min(max, (this.state.scrollPos || 0) + delta));
      this.state.content.pos_y = this.state.scrollPos;
    },
    updateRowCards() {
      const limits = this.state.mode === "limits";
      const hasChart = !limits && Boolean(this.state.view) && !this.state.pendingRange;
      const modelCount = this.state.rows.filter((item) => item.model).length;
      const rowStart = limits ? 204 : hasChart ? 882 : 446;
      updateText(this.state.rowsTitle, `TOP MODELS · ${modelCount}`);
      setChildMore(this.state.rowsTitle, { x: 56, y: 826, w: 368, h: 44, text_size: 30 });
      setVisible(this.state.rowsTitle, !limits && modelCount > 0 && !this.state.pendingRange);
      let cursorY = rowStart;
      let rowsEnd = rowStart;
      this.state.rowCards.forEach((card, index) => {
        const item = this.state.rows[index];
        const visible = Boolean(item) && !this.state.pendingRange;
        const y = visible ? cursorY : rowStart;
        const titleHeight = limits
          ? (item?.title?.length > 42 ? 86 : item?.title?.length > 22 ? 58 : 34)
          : (item?.title?.length > 40 ? 104 : item?.title?.length > 22 ? 78 : 48);
        const valueY = limits ? y + titleHeight + 2 : y + titleHeight + 6;
        const detailY = item?.value ? valueY + 52 : y + titleHeight + 12;
        const hasDetail = Boolean(item?.detail);
        const detailHeight = item?.detail?.length > 42 ? 80 : 56;
        const barY = limits ? valueY + 58 : detailY + (hasDetail ? detailHeight : 0) + 16;
        const hasFill = Number.isFinite(item?.fillPercent);
        const contentEnd = hasFill ? barY + 12 : hasDetail ? detailY + detailHeight : item?.value ? valueY + 46 : y + titleHeight;
        const rowHeight = contentEnd - y + (limits ? 24 : 28);
        setChildMore(card.title, { x: 68, y, w: 344, h: titleHeight, text_size: 26, text_style: text_style.WRAP });
        setChildMore(card.value, { x: 68, y: valueY, w: 344, h: 46, text_size: 32 });
        setChildMore(card.detail, { x: 68, y: detailY, w: 344, h: detailHeight, text_size: 22, text_style: text_style.WRAP });
        setChildMore(card.track, { x: 68, y: barY, w: 344, h: 12, radius: 6, color: C.grid });
        setVisible(card.title, visible);
        setVisible(card.value, visible && Boolean(item.value));
        setVisible(card.detail, visible && hasDetail);
        setVisible(card.track, visible && hasFill);
        setVisible(card.fill, visible && hasFill);
        if (!item) return;
        updateText(card.title, item.title);
        updateText(card.value, item.value || "");
        updateText(card.detail, item.detail || "");
        if (hasFill) {
          const fillPercent = Math.max(0, Math.min(100, item.fillPercent));
          setChildMore(card.fill, {
            x: 68,
            y: barY,
            w: Math.max(1, Math.round(344 * fillPercent / 100)),
            h: 12,
            radius: 6,
            color: item.color || C.chart,
          });
        }
        if (visible) {
          rowsEnd = y + rowHeight;
          cursorY = rowsEnd + 22;
        }
      });
      this.state.contentHeight = Math.max(hasChart ? 930 : 480, rowsEnd + 140);
    },
    updateChart() {
      const view = this.state.view;
      if (!view || this.state.mode === "limits") return;
      const chart = view.charts[this.state.mode];
      const series = chart?.series || [];
      const bucketCount = series[0]?.values.length || 24;
      const max = chart?.peak || 0;
      const scale = max > 0 ? max : 1;
      updateText(this.state.chartScale, `PEAK ${this.state.mode === "tokens" ? formatTokens(max) : formatMoney(max)}`);
      this.state.chartCanvas.clear({ x: 0, y: 0, w: 400, h: 210 });
      this.state.chartCanvas.setPaint({ color: C.grid, line_width: 1 });
      for (const y of [34, 84, 134, 184]) {
        this.state.chartCanvas.drawLine({ x1: 0, y1: y, x2: 399, y2: y });
      }
      if (series.length === 0) {
        this.state.chartCanvas.drawLine({ x1: 0, y1: 184, x2: 399, y2: 184 });
      }
      this.state.chartLegend.forEach((legend, index) => {
        const item = series[index];
        const color = item?.provider === "__other__" ? C.other : providerColor(item?.provider);
        const visible = Boolean(item);
        setVisible(legend.dot, visible);
        setVisible(legend.label, visible);
        const label = visible ? shortProviderName(item.provider) : "";
        const points = (item?.values || []).map((value, pointIndex) => ({
          x: Math.round(pointIndex * 399 / Math.max(1, bucketCount - 1)),
          y: 184 - Math.round((value / scale) * 150),
        }));
        setChildMore(legend.dot, { x: legend.x, y: legend.y + 8, w: 14, h: 14, radius: 7, color });
        updateText(legend.label, label);
        if (points.length < 2) return;
        this.state.chartCanvas.setPaint({ color, line_width: 3 });
        for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
          const start = points[pointIndex - 1];
          const end = points[pointIndex];
          this.state.chartCanvas.drawLine({ x1: start.x, y1: start.y, x2: end.x, y2: end.y });
        }
      });
    },
    async refresh() {
      if (this.state.busy) return;
      this.state.busy = true;
      updateText(this.state.refreshButton, "LOADING");
      this.updateMetrics();
      try {
        const payload = await this.fetchSnapshot();
        this.applyPayload(payload, this.state.range);
        writeLocalCache(payload);
        updateText(this.state.refreshButton, "REFRESH");
      } catch (error) {
        const errorMessage = String(error?.message || "Refresh failed");
        updateText(this.state.refreshButton, errorMessage.toLowerCase().includes("key") ? "KEY?" : "ERROR");
        this.state.refreshFailed = true;
        this.state.errorMessage = errorMessage;
        if (this.state.snapshot?.ranges?.[this.state.range]) this.applyPayload(this.state.snapshot, this.state.range);
        else this.applyLayout();
        this.updateChart();
      } finally {
        this.state.busy = false;
        this.updateMetrics();
      }
    },
  }),
);
