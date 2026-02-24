import * as vscode from "vscode";
import * as path from "path";
import { randomUUID } from "crypto";

const TICK_MS = 10_000;

// ===== Storage keys (globalState) =====
const WINDOWS_INDEX_KEY = "timeTracker.windowsIndex"; // string[]
const WINDOW_PREFIX = "timeTracker.window."; // + windowId

type DayStats = {
  totalMs: number;
  byExt: Record<string, number>; // ".ts" -> ms
};

type WindowStore = {
  version: 1;
  windowId: string;
  createdAt: number;
  updatedAt: number;

  // runtime session checkpoint
  lastTickAt: number;
  isFocused: boolean;
  currentExt: string | null;

  days: Record<string, DayStats>; // "YYYY-MM-DD"
};

function dayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function prevMonthKey(d = new Date()): string {
  const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return monthKey(prev);
}

function formatMs(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}ч ${m}м` : `${m}м`;
}

function ensureDay(store: WindowStore, key: string): DayStats {
  const existing = store.days[key];
  if (existing) return existing;
  const created: DayStats = { totalMs: 0, byExt: {} };
  store.days[key] = created;
  return created;
}

function getActiveExtOrNull(): string | null {
  const ed = vscode.window.activeTextEditor;
  if (!ed) return null;

  const doc = ed.document;
  const uri = doc.uri;

  // считаем только "реальные файлы". Настройки/Output/Git diff и т.п. игнорируем
  if (uri.scheme !== "file") return null;

  const ext = path.extname(uri.fsPath).toLowerCase();
  if (ext) return ext;

  // fallback: languageId, если файл без расширения
  return doc.languageId ? `lang:${doc.languageId}` : null;
}

async function loadIndex(context: vscode.ExtensionContext): Promise<string[]> {
  return context.globalState.get<string[]>(WINDOWS_INDEX_KEY) ?? [];
}

async function saveIndex(context: vscode.ExtensionContext, ids: string[]) {
  await context.globalState.update(WINDOWS_INDEX_KEY, ids);
}

async function loadWindowStore(
  context: vscode.ExtensionContext,
  windowId: string,
): Promise<WindowStore | undefined> {
  return context.globalState.get<WindowStore>(WINDOW_PREFIX + windowId);
}

async function saveWindowStore(
  context: vscode.ExtensionContext,
  store: WindowStore,
) {
  store.updatedAt = Date.now();
  await context.globalState.update(WINDOW_PREFIX + store.windowId, store);
}

function mergeDayStats(target: DayStats, src: DayStats) {
  target.totalMs += src.totalMs;
  for (const [k, v] of Object.entries(src.byExt)) {
    target.byExt[k] = (target.byExt[k] ?? 0) + v;
  }
}

function aggregateAllWindows(stores: WindowStore[]) {
  const days: Record<string, DayStats> = {};
  let allTimeMs = 0;

  for (const s of stores) {
    for (const [dKey, day] of Object.entries(s.days)) {
      const dest = days[dKey] ?? (days[dKey] = { totalMs: 0, byExt: {} });
      mergeDayStats(dest, day);
      allTimeMs += day.totalMs;
    }
  }

  return { days, allTimeMs };
}

function sumMonth(days: Record<string, DayStats>, month: string) {
  let totalMs = 0;
  const byExt: Record<string, number> = {};

  for (const [dKey, st] of Object.entries(days)) {
    if (!dKey.startsWith(month + "-")) continue;
    totalMs += st.totalMs;
    for (const [ext, ms] of Object.entries(st.byExt)) {
      byExt[ext] = (byExt[ext] ?? 0) + ms;
    }
  }

  return { totalMs, byExt };
}

function topEntries(map: Record<string, number>, n: number) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

export async function activate(context: vscode.ExtensionContext) {
  // --- Window identity
  const windowId = randomUUID();
  const storageKey = WINDOW_PREFIX + windowId;

  // --- Ensure index contains this window
  const index = await loadIndex(context);
  if (!index.includes(windowId)) {
    index.push(windowId);
    await saveIndex(context, index);
  }

  // --- Init store for this window
  const now = Date.now();
  let store: WindowStore = {
    version: 1,
    windowId,
    createdAt: now,
    updatedAt: now,
    lastTickAt: now,
    isFocused: Boolean(
      vscode.window.state.focused && vscode.window.state.active,
    ),
    currentExt: getActiveExtOrNull(),
    days: {},
  };

  // Persist initial state
  await context.globalState.update(storageKey, store);

  const tick = async () => {
    const t = Date.now();
    const delta = t - store.lastTickAt;
    store.lastTickAt = t;

    // anti-jump: сон/гибернация/подвис
    if (delta <= 0 || delta > 60 * 60 * 1000) {
      await saveWindowStore(context, store);
      return;
    }

    // считаем только если окно в фокусе
    if (!store.isFocused) {
      await saveWindowStore(context, store);
      return;
    }

    // общий учёт
    const dk = dayKey();
    const d = ensureDay(store, dk);
    d.totalMs += delta;

    // учёт по типу активного файла (если есть)
    const ext = store.currentExt;
    if (ext) d.byExt[ext] = (d.byExt[ext] ?? 0) + delta;

    await saveWindowStore(context, store);
  };

  // событие смены фокуса окна: перед переключением фиксируем дельту
  const wState = vscode.window.onDidChangeWindowState(async (ws) => {
    await tick();
    store.isFocused = Boolean(ws.focused && ws.active);
    await saveWindowStore(context, store);
  });

  // смена активного файла: закрываем старый ext и переключаемся на новый
  const activeEditor = vscode.window.onDidChangeActiveTextEditor(async () => {
    await tick();
    store.currentExt = getActiveExtOrNull();
    await saveWindowStore(context, store);
  });

  // периодический чекпоинт
  const interval = setInterval(() => void tick(), TICK_MS);

  // ===== Commands (агрегация по всем окнам) =====

  const showSummary = vscode.commands.registerCommand(
    "timeTracker.showSummary",
    async () => {
      const ids = await loadIndex(context);
      const stores: WindowStore[] = [];
      for (const id of ids) {
        const s = await loadWindowStore(context, id);
        if (s?.version === 1) stores.push(s);
      }

      const { days, allTimeMs } = aggregateAllWindows(stores);
      const todayMs = days[dayKey()]?.totalMs ?? 0;

      vscode.window.showInformationMessage(
        `VS Code time: сегодня ${formatMs(todayMs)} · всего ${formatMs(allTimeMs)}`,
      );
    },
  );

  const showMonthCompare = vscode.commands.registerCommand(
    "timeTracker.showMonthCompare",
    async () => {
      const ids = await loadIndex(context);
      const stores: WindowStore[] = [];
      for (const id of ids) {
        const s = await loadWindowStore(context, id);
        if (s?.version === 1) stores.push(s);
      }

      const { days } = aggregateAllWindows(stores);
      const thisM = monthKey();
      const lastM = prevMonthKey();
      const a = sumMonth(days, thisM).totalMs;
      const b = sumMonth(days, lastM).totalMs;

      const diff = a - b;
      const sign = diff === 0 ? "±" : diff > 0 ? "+" : "−";

      vscode.window.showInformationMessage(
        `Месяц ${thisM}: ${formatMs(a)} · прошлый ${lastM}: ${formatMs(b)} · разница ${sign}${formatMs(Math.abs(diff))}`,
      );
    },
  );

  const showTopExtsThisMonth = vscode.commands.registerCommand(
    "timeTracker.showTopExtsThisMonth",
    async () => {
      const ids = await loadIndex(context);
      const stores: WindowStore[] = [];
      for (const id of ids) {
        const s = await loadWindowStore(context, id);
        if (s?.version === 1) stores.push(s);
      }

      const { days } = aggregateAllWindows(stores);
      const { byExt } = sumMonth(days, monthKey());

      const top = topEntries(byExt, 15);
      if (top.length === 0) {
        vscode.window.showInformationMessage("Нет данных за этот месяц.");
        return;
      }

      const items = top.map(([ext, ms]) => ({
        label: `${ext}`,
        description: formatMs(ms),
      }));

      const picked = await vscode.window.showQuickPick(items, {
        title: "Top file types (this month)",
        placeHolder: "Выбери тип файла",
      });

      if (picked) {
        vscode.window.showInformationMessage(
          `${picked.label}: ${picked.description}`,
        );
      }
    },
  );

  const reset = vscode.commands.registerCommand(
    "timeTracker.reset",
    async () => {
      // удаляем все window stores и индекс
      const ids = await loadIndex(context);
      for (const id of ids) {
        await context.globalState.update(WINDOW_PREFIX + id, undefined);
      }
      await saveIndex(context, []);
      vscode.window.showInformationMessage(
        "Time Tracker: статистика сброшена 🧽",
      );
    },
  );

  context.subscriptions.push(
    wState,
    activeEditor,
    showSummary,
    showMonthCompare,
    showTopExtsThisMonth,
    reset,
    { dispose: () => clearInterval(interval) },
  );

  // Первый тик сразу — создаст checkpoint
  void tick();
}

export async function deactivate() {
  // Не полагаемся на deactivate. Все сохранения идут в tick().
}
