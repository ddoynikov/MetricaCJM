const FETCH_OPTS = { credentials: "same-origin" };

const clientIdInput = document.getElementById("client-id");
const getTokenBtn = document.getElementById("get-token-btn");
const tokenInput = document.getElementById("token");
const connectBtn = document.getElementById("connect-btn");
const changeTokenBtn = document.getElementById("change-token-btn");
const authCard = document.getElementById("auth-card");
const authStatus = document.getElementById("auth-status");
const tokenHintEl = document.getElementById("token-hint");
const counterSelect = document.getElementById("counter");
const dateFromInput = document.getElementById("date-from");
const dateToInput = document.getElementById("date-to");
const exportBtn = document.getElementById("export-btn");
const settingsError = document.getElementById("settings-error");
const topbarMeta = document.getElementById("topbar-meta");
const sidebarAuthDot = document.getElementById("sidebar-auth-dot");
const sidebarAuthText = document.getElementById("sidebar-auth-text");
const periodButtons = document.querySelectorAll(".period-btn");
const statsRefreshBtn = document.getElementById("stats-refresh-btn");
const statsUpdatedEl = document.getElementById("stats-updated");
const statsTbody = document.getElementById("stats-tbody");

const dbPreviewSection = document.getElementById("db-preview-section");
const dbPreviewCounter = document.getElementById("db-preview-counter");
const dbPreviewBody = document.getElementById("db-preview-body");
const dbPreviewLoading = document.getElementById("db-preview-loading");
const dbPreviewThead = document.getElementById("db-preview-thead");
const dbPreviewTbody = document.getElementById("db-preview-tbody");
const dbPreviewRange = document.getElementById("db-preview-range");
const dbPreviewPrev = document.getElementById("db-preview-prev");
const dbPreviewNext = document.getElementById("db-preview-next");
const dbPreviewTabs = document.querySelectorAll(".db-preview-tab");

const statusSection = document.getElementById("status-section");
const progressBar = document.getElementById("progress-bar");
const progressBarVisits = document.getElementById("progress-bar-visits");
const progressBarHits = document.getElementById("progress-bar-hits");
const progressVisitsText = document.getElementById("progress-visits-text");
const progressHitsText = document.getElementById("progress-hits-text");
const logWindow = document.getElementById("log-window");
const statusMessage = document.getElementById("status-message");
const statusMeta = document.getElementById("status-meta");
const previewActions = document.getElementById("preview-actions");
const showVisitsBtn = document.getElementById("show-visits-btn");
const showHitsBtn = document.getElementById("show-hits-btn");
const resultSection = document.getElementById("result-section");
const resultVisits = document.getElementById("result-visits");
const resultHits = document.getElementById("result-hits");

const previewSection = document.getElementById("preview-section");
const previewTotal = document.getElementById("preview-total");
const previewTable = document.getElementById("preview-table");
const toggleButtons = document.querySelectorAll(".toggle");

let pollTimer = null;
let currentPreviewTable = "visits";
let authorized = false;
let countersList = [];
let statsByCounter = new Map();
let dbPreviewTable = "visits";
let dbPreviewOffset = 0;
const DB_PREVIEW_LIMIT = 50;

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

function setDefaultDates() {
  const end = yesterday();
  const start = new Date(end);
  start.setDate(end.getDate() - 7);
  dateToInput.value = formatDate(end);
  dateFromInput.value = formatDate(start);
}

function applyPeriod(period) {
  const end = yesterday();
  const start = new Date(end);
  if (period === "yesterday") {
    /* start = end */
  } else if (period === "week") {
    start.setDate(end.getDate() - 7);
  } else if (period === "month") {
    start.setDate(end.getDate() - 30);
  } else if (period === "quarter") {
    start.setDate(end.getDate() - 90);
  }
  dateFromInput.value = formatDate(start);
  dateToInput.value = formatDate(end);
  periodButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.period === period);
  });
  updateExportButtonState();
  updateTopbarMeta();
}

function showError(message) {
  settingsError.textContent = message;
  settingsError.hidden = !message;
}

function updateSidebarAuth(connected) {
  if (sidebarAuthDot) {
    sidebarAuthDot.classList.toggle("connected", connected);
  }
  if (sidebarAuthText) {
    sidebarAuthText.textContent = connected ? "Метрика подключена" : "Войти";
  }
}

function updateTopbarMeta() {
  if (!topbarMeta) return;
  const counter = counterSelect.selectedOptions[0]?.textContent || "";
  const from = dateFromInput.value;
  const to = dateToInput.value;
  if (counter && counter !== "— выберите счётчик —" && from && to) {
    topbarMeta.textContent = `${counter} · ${from} — ${to}`;
  } else {
    topbarMeta.textContent = "";
  }
}

function appendLog(message) {
  if (!logWindow || !message) return;
  const line = document.createElement("div");
  line.textContent = `[${new Date().toLocaleTimeString("ru-RU")}] ${message}`;
  logWindow.appendChild(line);
  logWindow.scrollTop = logWindow.scrollHeight;
}

function setProgress(pct) {
  const width = `${pct}%`;
  if (progressBar) progressBar.style.width = width;
  if (progressBarVisits) progressBarVisits.style.width = width;
  if (progressBarHits) progressBarHits.style.width = width;
  if (progressVisitsText) progressVisitsText.textContent = width;
  if (progressHitsText) progressHitsText.textContent = width;
}

function setFormEnabled(enabled) {
  counterSelect.disabled = !enabled;
  dateFromInput.disabled = !enabled;
  dateToInput.disabled = !enabled;
  updateExportButtonState();
}

function updateExportButtonState() {
  const ready =
    authorized &&
    counterSelect.value &&
    dateFromInput.value &&
    dateToInput.value &&
    dateFromInput.value <= dateToInput.value;
  exportBtn.disabled = !ready;
}

function showLoginForm() {
  authorized = false;
  authCard.classList.remove("hidden");
  authStatus.classList.add("hidden");
  tokenInput.value = "";
  counterSelect.innerHTML = '<option value="">— выберите счётчик —</option>';
  setFormEnabled(false);
  updateSidebarAuth(false);
  updateTopbarMeta();
}

function showTokenChangeForm() {
  authCard.classList.remove("hidden");
  authStatus.classList.add("hidden");
  tokenInput.value = "";
  showError("");
}

function showAuthorizedUi(tokenHint) {
  authorized = true;
  authCard.classList.add("hidden");
  authStatus.classList.remove("hidden");
  tokenHintEl.textContent = tokenHint || "";
  updateSidebarAuth(true);
}

function renderCounters(counters) {
  countersList = counters;
  counterSelect.innerHTML = '<option value="">— выберите счётчик —</option>';
  counters.forEach((counter) => {
    const option = document.createElement("option");
    option.value = counter.id;
    option.textContent = `${counter.name} (${counter.site || counter.id})`;
    counterSelect.appendChild(option);
  });
  setFormEnabled(true);
  updateTopbarMeta();
  renderStatsTable();
}

function counterDisplayName(counter) {
  if (!counter) return "—";
  const name = counter.name || String(counter.id);
  return `${name} (${counter.id})`;
}

function formatStatsPeriodShort(dateMin, dateMax) {
  if (!dateMin || !dateMax) return "";
  const fmt = (d) => {
    const [y, m, day] = d.split("-");
    return `${day}.${m}.${y.slice(2)}`;
  };
  return `${fmt(dateMin)} — ${fmt(dateMax)}`;
}

function formatLastUpdated(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function combinedPeriod(visits, hits) {
  const blocks = [visits, hits].filter((b) => b && b.date_min && b.date_max);
  if (!blocks.length) return "";
  const dateMin = blocks.map((b) => b.date_min).sort()[0];
  const dateMax = blocks.map((b) => b.date_max).sort().slice(-1)[0];
  return formatStatsPeriodShort(dateMin, dateMax);
}

function combinedMissingDays(visits, hits) {
  const days = new Set();
  if (visits?.missing_days) visits.missing_days.forEach((d) => days.add(d));
  if (hits?.missing_days) hits.missing_days.forEach((d) => days.add(d));
  return [...days].sort();
}

function formatMissingCell(missingDays) {
  if (!missingDays || missingDays.length === 0) {
    return '<span class="stats-ok"><i data-lucide="check"></i> Нет</span>';
  }
  return `<span class="stats-warn"><i data-lucide="alert-triangle"></i> ${missingDays.length} дн.</span>`;
}

function hasCounterData(stats) {
  if (!stats) return false;
  const v = stats.visits;
  const h = stats.hits;
  return (v && v.total_rows !== null) || (h && h.total_rows !== null);
}

function renderStatsTable() {
  if (!statsTbody) return;

  const rowsWithData = [];
  const rowsWithoutData = [];
  const seenIds = new Set();

  countersList.forEach((counter) => {
    const stats = statsByCounter.get(String(counter.id));
    seenIds.add(String(counter.id));
    if (hasCounterData(stats)) {
      rowsWithData.push({ counter, stats });
    } else {
      rowsWithoutData.push({ counter, stats: null });
    }
  });

  statsByCounter.forEach((stats, id) => {
    if (!seenIds.has(id)) {
      rowsWithData.push({
        counter: { id: Number(id), name: String(id), site: "" },
        stats,
      });
    }
  });

  const ordered = [...rowsWithData, ...rowsWithoutData];
  statsTbody.innerHTML = "";

  if (!ordered.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="5" class="stats-no-data">Нет данных в БД</td>';
    statsTbody.appendChild(tr);
    return;
  }

  ordered.forEach(({ counter, stats }) => {
    const tr = document.createElement("tr");
    if (!stats || !hasCounterData(stats)) {
      tr.innerHTML = `
        <td>${counterDisplayName(counter)}</td>
        <td class="stats-num">—</td>
        <td class="stats-num">—</td>
        <td colspan="2" class="stats-no-data">Данные не загружены</td>
      `;
      statsTbody.appendChild(tr);
      return;
    }

    const visits = stats.visits || {};
    const hits = stats.hits || {};
    const visitsText =
      visits.total_rows !== null ? visits.total_rows.toLocaleString("ru-RU") : "—";
    const hitsText =
      hits.total_rows !== null ? hits.total_rows.toLocaleString("ru-RU") : "—";
    const period = combinedPeriod(visits, hits);
    const missing = combinedMissingDays(visits, hits);

    tr.innerHTML = `
      <td>${counterDisplayName(counter)}</td>
      <td class="stats-num">${visitsText}</td>
      <td class="stats-num">${hitsText}</td>
      <td>${period}</td>
      <td>${formatMissingCell(missing)}</td>
    `;
    statsTbody.appendChild(tr);
  });

  lucide.createIcons({ nodes: statsTbody.querySelectorAll("[data-lucide]") });
  renderDbPreviewCounters();
}

function renderDbPreviewCounters() {
  if (!dbPreviewCounter) return;
  const selected = dbPreviewCounter.value;
  dbPreviewCounter.innerHTML = '<option value="">Все счётчики</option>';

  const ids = new Set(statsByCounter.keys());
  countersList.forEach((counter) => ids.add(String(counter.id)));

  [...ids].sort((a, b) => Number(a) - Number(b)).forEach((counterId) => {
    const counter = countersList.find((item) => String(item.id) === counterId);
    const option = document.createElement("option");
    option.value = counterId;
    option.textContent = counter ? counterDisplayName(counter) : `Счётчик ${counterId}`;
    dbPreviewCounter.appendChild(option);
  });

  if (selected && dbPreviewCounter.querySelector(`option[value="${selected}"]`)) {
    dbPreviewCounter.value = selected;
  }
}

function formatDbCell(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return String(value);
}

function setDbPreviewLoading(loading) {
  if (!dbPreviewBody) return;
  dbPreviewBody.classList.toggle("is-loading", loading);
  if (dbPreviewLoading) {
    dbPreviewLoading.classList.toggle("hidden", !loading);
  }
}

function updateDbPreviewPagination(total) {
  if (!dbPreviewRange || !dbPreviewPrev || !dbPreviewNext) return;

  if (!total) {
    dbPreviewRange.textContent = "Нет данных";
    dbPreviewPrev.disabled = true;
    dbPreviewNext.disabled = true;
    return;
  }

  const from = dbPreviewOffset + 1;
  const to = Math.min(dbPreviewOffset + DB_PREVIEW_LIMIT, total);
  dbPreviewRange.textContent = `Показано ${from}–${to} из ${total.toLocaleString("ru-RU")}`;
  dbPreviewPrev.disabled = dbPreviewOffset <= 0;
  dbPreviewNext.disabled = dbPreviewOffset + DB_PREVIEW_LIMIT >= total;
}

function renderDbPreviewTable(columns, rows) {
  if (!dbPreviewThead || !dbPreviewTbody) return;

  dbPreviewThead.innerHTML = "";
  dbPreviewTbody.innerHTML = "";

  const headerRow = document.createElement("tr");
  columns.forEach((column) => {
    const th = document.createElement("th");
    th.textContent = column;
    headerRow.appendChild(th);
  });
  dbPreviewThead.appendChild(headerRow);

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    row.forEach((cell) => {
      const td = document.createElement("td");
      td.textContent = formatDbCell(cell);
      td.title = td.textContent;
      tr.appendChild(td);
    });
    dbPreviewTbody.appendChild(tr);
  });
}

async function loadDbPreview() {
  if (!dbPreviewSection) return;

  setDbPreviewLoading(true);

  const params = new URLSearchParams({
    table: dbPreviewTable,
    limit: String(DB_PREVIEW_LIMIT),
    offset: String(dbPreviewOffset),
  });
  if (dbPreviewCounter?.value) {
    params.set("counter_id", dbPreviewCounter.value);
  }

  try {
    const response = await fetch(`/api/table-preview?${params}`, FETCH_OPTS);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || "Не удалось загрузить данные");
    }

    renderDbPreviewTable(data.columns || [], data.rows || []);
    updateDbPreviewPagination(data.total || 0);
  } catch (error) {
    if (dbPreviewThead) dbPreviewThead.innerHTML = "";
    if (dbPreviewTbody) dbPreviewTbody.innerHTML = "";
    if (dbPreviewRange) dbPreviewRange.textContent = error.message;
    if (dbPreviewPrev) dbPreviewPrev.disabled = true;
    if (dbPreviewNext) dbPreviewNext.disabled = true;
  } finally {
    setDbPreviewLoading(false);
    lucide.createIcons({ nodes: dbPreviewLoading?.querySelectorAll("[data-lucide]") || [] });
  }
}

function switchDbPreviewTable(table) {
  dbPreviewTable = table;
  dbPreviewOffset = 0;
  dbPreviewTabs.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.table === table);
  });
  loadDbPreview();
}

async function loadStats() {
  if (statsRefreshBtn) {
    statsRefreshBtn.disabled = true;
  }
  try {
    const response = await fetch("/api/stats", FETCH_OPTS);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || "Не удалось загрузить статистику");
    }
    statsByCounter = new Map();
    (data.counters || []).forEach((item) => {
      statsByCounter.set(String(item.counter_id), item);
    });
    if (statsUpdatedEl) {
      const updated = formatLastUpdated(data.last_updated);
      statsUpdatedEl.textContent = updated ? `Обновлено: ${updated}` : "";
    }
    renderStatsTable();
  } catch (error) {
    statsByCounter = new Map();
    if (statsUpdatedEl) statsUpdatedEl.textContent = "";
    renderStatsTable();
    showError(error.message);
  } finally {
    if (statsRefreshBtn) {
      statsRefreshBtn.disabled = false;
    }
  }
  await loadDbPreview();
}

function openOAuthAuthorize() {
  const clientId = clientIdInput.value.trim();
  if (!clientId) {
    clientIdInput.style.borderColor = "var(--error)";
    return;
  }
  clientIdInput.style.borderColor = "";
  const url = `https://oauth.yandex.ru/authorize?response_type=token&client_id=${encodeURIComponent(clientId)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

async function loadCounters() {
  const response = await fetch("/api/counters", FETCH_OPTS);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || "Не удалось получить список счётчиков");
  }
  if (!data.length) {
    throw new Error("У токена нет доступных счётчиков");
  }
  renderCounters(data);
}

async function connect() {
  const token = tokenInput.value.trim();
  if (!token) {
    showError("Введите OAuth-токен");
    return;
  }

  showError("");
  connectBtn.disabled = true;
  connectBtn.textContent = "Подключение…";

  try {
    const response = await fetch("/api/auth", {
      ...FETCH_OPTS,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || "Не удалось подключиться");
    }

    const statusResponse = await fetch("/api/auth/status", FETCH_OPTS);
    const status = await statusResponse.json();
    showAuthorizedUi(status.token_hint);
    await loadCounters();
    await loadStats();
  } catch (error) {
    showError(error.message);
    if (!authorized) {
      showLoginForm();
    }
    await loadStats();
  } finally {
    connectBtn.disabled = false;
    connectBtn.textContent = "Подключить";
  }
}

async function initAuth() {
  authCard.classList.remove("hidden");

  try {
    const response = await fetch("/api/auth/status", FETCH_OPTS);
    const data = await response.json();
    if (!response.ok || !data.authorized) {
      showLoginForm();
      await loadStats();
      return;
    }

    showAuthorizedUi(data.token_hint);
    await loadCounters();
    await loadStats();
  } catch (error) {
    showError(error.message);
    showLoginForm();
    await loadStats();
  }
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function pollStatus(jobId) {
  try {
    const response = await fetch(`/api/status/${jobId}`, FETCH_OPTS);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || "Ошибка статуса");
    }

    setProgress(data.progress || 0);
    statusMessage.textContent = data.message || "";
    statusMeta.textContent = `Визиты: ${data.rows_visits || 0} · События: ${data.rows_hits || 0}`;
    appendLog(data.message);

    if (data.status === "done") {
      stopPolling();
      previewActions.classList.remove("hidden");
      statusMessage.textContent = data.message;
      resultSection.classList.remove("hidden");
      resultVisits.textContent = (data.rows_visits || 0).toLocaleString("ru-RU");
      resultHits.textContent = (data.rows_hits || 0).toLocaleString("ru-RU");
      appendLog(`Готово: ${data.rows_visits || 0} визитов, ${data.rows_hits || 0} хитов`);
      loadStats();
    } else if (data.status === "error") {
      stopPolling();
      statusMessage.textContent = data.message;
      statusMessage.style.color = "var(--error)";
    }
  } catch (error) {
    stopPolling();
    statusMessage.textContent = error.message;
    statusMessage.style.color = "var(--error)";
  }
}

async function startExport() {
  const counterId = Number(counterSelect.value);
  const dateFrom = dateFromInput.value;
  const dateTo = dateToInput.value;

  if (!authorized || !counterId || !dateFrom || !dateTo) {
    showError("Заполните все поля");
    return;
  }

  showError("");
  exportBtn.disabled = true;
  statusSection.classList.remove("hidden");
  resultSection.classList.add("hidden");
  previewSection.classList.add("hidden");
  previewActions.classList.add("hidden");
  statusMessage.style.color = "";
  setProgress(0);
  logWindow.innerHTML = "";
  statusMessage.textContent = "Запуск выгрузки…";
  statusMeta.textContent = "";
  appendLog("Запуск выгрузки…");

  try {
    const response = await fetch("/api/export", {
      ...FETCH_OPTS,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        counter_id: counterId,
        date_from: dateFrom,
        date_to: dateTo,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || "Не удалось запустить выгрузку");
    }

    stopPolling();
    pollTimer = setInterval(() => pollStatus(data.job_id), 3000);
    pollStatus(data.job_id);
  } catch (error) {
    statusMessage.textContent = error.message;
    statusMessage.style.color = "var(--error)";
  } finally {
    exportBtn.disabled = false;
    updateExportButtonState();
  }
}

function formatCell(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return String(value);
}

async function loadPreview(table) {
  currentPreviewTable = table;
  toggleButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.table === table);
  });

  const params = new URLSearchParams({
    counter_id: counterSelect.value,
    table,
    date_from: dateFromInput.value,
    date_to: dateToInput.value,
  });

  previewSection.classList.remove("hidden");
  previewTotal.textContent = "Загрузка…";

  const response = await fetch(`/api/preview?${params}`, FETCH_OPTS);
  const data = await response.json();
  if (!response.ok) {
    previewTotal.textContent = data.detail || "Ошибка загрузки превью";
    return;
  }

  previewTotal.textContent = `Всего строк в БД за период: ${data.total}`;

  const thead = previewTable.querySelector("thead");
  const tbody = previewTable.querySelector("tbody");
  thead.innerHTML = "";
  tbody.innerHTML = "";

  const headerRow = document.createElement("tr");
  data.columns.forEach((column) => {
    const th = document.createElement("th");
    th.textContent = column;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  data.rows.forEach((row) => {
    const tr = document.createElement("tr");
    data.columns.forEach((column) => {
      const td = document.createElement("td");
      td.textContent = formatCell(row[column]);
      td.title = td.textContent;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

clientIdInput.addEventListener("input", () => {
  clientIdInput.style.borderColor = "";
});

getTokenBtn.addEventListener("click", openOAuthAuthorize);
connectBtn.addEventListener("click", connect);
changeTokenBtn.addEventListener("click", showTokenChangeForm);
tokenInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") connect();
});
exportBtn.addEventListener("click", startExport);
dateFromInput.addEventListener("change", () => {
  periodButtons.forEach((btn) => btn.classList.remove("active"));
  updateExportButtonState();
  updateTopbarMeta();
});
dateToInput.addEventListener("change", () => {
  periodButtons.forEach((btn) => btn.classList.remove("active"));
  updateExportButtonState();
  updateTopbarMeta();
});
counterSelect.addEventListener("change", () => {
  updateExportButtonState();
  updateTopbarMeta();
});
showVisitsBtn.addEventListener("click", () => loadPreview("visits"));
showHitsBtn.addEventListener("click", () => loadPreview("hits"));
statsRefreshBtn.addEventListener("click", loadStats);

if (dbPreviewCounter) {
  dbPreviewCounter.addEventListener("change", () => {
    dbPreviewOffset = 0;
    loadDbPreview();
  });
}

if (dbPreviewPrev) {
  dbPreviewPrev.addEventListener("click", () => {
    dbPreviewOffset = Math.max(0, dbPreviewOffset - DB_PREVIEW_LIMIT);
    loadDbPreview();
  });
}

if (dbPreviewNext) {
  dbPreviewNext.addEventListener("click", () => {
    dbPreviewOffset += DB_PREVIEW_LIMIT;
    loadDbPreview();
  });
}

dbPreviewTabs.forEach((btn) => {
  btn.addEventListener("click", () => switchDbPreviewTable(btn.dataset.table));
});

periodButtons.forEach((btn) => {
  btn.addEventListener("click", () => applyPeriod(btn.dataset.period));
});

toggleButtons.forEach((btn) => {
  btn.addEventListener("click", () => loadPreview(btn.dataset.table));
});

setDefaultDates();
setFormEnabled(false);
initAuth();
