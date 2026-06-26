const FETCH_OPTS = { credentials: "same-origin" };

const clientIdInput = document.getElementById("client-id");
const getTokenBtn = document.getElementById("get-token-btn");
const tokenInput = document.getElementById("token");
const connectBtn = document.getElementById("connect-btn");
const changeTokenBtn = document.getElementById("change-token-btn");
const authCard = document.getElementById("auth-card");
const authModal = document.getElementById("auth-modal");
const authModalBackdrop = document.getElementById("auth-modal-backdrop");
const authModalClose = document.getElementById("auth-modal-close");
const sidebarAuth = document.getElementById("sidebar-auth");
const counterSelect = document.getElementById("counterId");
const dateRangeDisplay = document.getElementById("dateRangeDisplay");
const dateRangeText = document.getElementById("dateRangeText");
const exportBtn = document.getElementById("export-btn");
const settingsError = document.getElementById("settings-error");
const topbarMeta = document.getElementById("topbar-meta");
const sidebarAuthDot = document.getElementById("sidebar-auth-dot");
const sidebarAuthText = document.getElementById("sidebar-auth-text");
const periodButtons = document.querySelectorAll(".period-btn");
const statsRefreshBtn = document.getElementById("stats-refresh-btn");
const statsUpdatedEl = document.getElementById("stats-updated");
const statsTbody = document.getElementById("stats-tbody");
const emptyCountersTbody = document.getElementById("emptyCounters");
const emptyCountersToggle = document.getElementById("emptyCountersToggle");
const toggleDataTableBtn = document.getElementById("toggleDataTable");

const dbPopup = document.getElementById("dbPopup");
const dbPopupClose = document.getElementById("dbPopupClose");
const dbCounterSelect = document.getElementById("dbCounterSelect");
const dbPopupStats = document.getElementById("dbPopupStats");
const dbTableWrap = document.getElementById("dbTableWrap");
const dbPrevPage = document.getElementById("dbPrevPage");
const dbNextPage = document.getElementById("dbNextPage");
const dbPageInfo = document.getElementById("dbPageInfo");
const dbTabButtons = document.querySelectorAll("#dbPopup .tab-btn");

const statusSection = document.getElementById("status-section");
const progressBar = document.getElementById("progress-bar");
const progressBarVisits = document.getElementById("progress-bar-visits");
const progressBarHits = document.getElementById("progress-bar-hits");
const progressVisitsText = document.getElementById("progress-visits-text");
const progressHitsText = document.getElementById("progress-hits-text");
const logWindow = document.getElementById("log-window");
const statusMessage = document.getElementById("status-message");
const statusMeta = document.getElementById("status-meta");
const previewVisitsBtn = document.getElementById("previewVisitsBtn");
const previewHitsBtn = document.getElementById("previewHitsBtn");
const refreshCjmBtn = document.getElementById("refreshCjmBtn");
const resultSection = document.getElementById("result-section");
const resultVisits = document.getElementById("result-visits");
const resultHits = document.getElementById("result-hits");

let pollTimer = null;
let authorized = false;
let countersList = [];
let statsByCounter = new Map();
let dbCurrentTable = "visits";
let dbCurrentPage = 0;
let dbCurrentCounter = "";
const DB_PAGE_SIZE = 25;
let dbSortCol = null;
let dbSortDir = "desc";
let dateFrom = "";
let dateTo = "";
let fpInstance;
let emptyCountersVisible = false;

function parseApiDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

function updateDateRangeText(start, end) {
  if (!dateRangeText) return;
  dateRangeText.textContent =
    `${start.toLocaleDateString("ru-RU")} — ${end.toLocaleDateString("ru-RU")}`;
}

function initFlatpickr() {
  const end = yesterday();
  const start = new Date(end);
  start.setDate(end.getDate() - 7);
  dateFrom = formatDate(start);
  dateTo = formatDate(end);
  updateDateRangeText(start, end);

  fpInstance = flatpickr("#dateRangeDisplay", {
    locale: "ru",
    mode: "range",
    dateFormat: "d.m.Y",
    defaultDate: [start, end],
    showMonths: 2,
    inline: false,
    disableMobile: true,
    onChange: (selectedDates) => {
      if (selectedDates.length === 2) {
        dateFrom = formatDate(selectedDates[0]);
        dateTo = formatDate(selectedDates[1]);
        updateDateRangeText(selectedDates[0], selectedDates[1]);
        periodButtons.forEach((btn) => btn.classList.remove("active"));
        updateExportButtonState();
        updateTopbarMeta();
      }
    },
  });
}

const periods = {
  yesterday: () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return [d, d];
  },
  week: () => {
    const e = new Date();
    e.setDate(e.getDate() - 1);
    const s = new Date();
    s.setDate(s.getDate() - 7);
    return [s, e];
  },
  month: () => {
    const e = new Date();
    e.setDate(e.getDate() - 1);
    const s = new Date();
    s.setDate(s.getDate() - 30);
    return [s, e];
  },
  quarter: () => {
    const e = new Date();
    e.setDate(e.getDate() - 1);
    const s = new Date();
    s.setDate(s.getDate() - 90);
    return [s, e];
  },
  year: () => {
    const e = new Date();
    e.setDate(e.getDate() - 1);
    const s = new Date();
    s.setFullYear(s.getFullYear() - 1);
    return [s, e];
  },
};

function applyPeriod(period) {
  const fn = periods[period];
  if (!fn) return;
  const [s, e] = fn();
  if (fpInstance) fpInstance.setDate([s, e]);
  dateFrom = formatDate(s);
  dateTo = formatDate(e);
  updateDateRangeText(s, e);
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

function showAuthModal() {
  if (!authModal) return;
  authModal.classList.remove("hidden");
  authModal.setAttribute("aria-hidden", "false");
}

function hideAuthModal() {
  if (!authModal) return;
  authModal.classList.add("hidden");
  authModal.setAttribute("aria-hidden", "true");
}

function updateSidebarAuth(connected, tokenHint = "") {
  if (sidebarAuthDot) {
    sidebarAuthDot.classList.toggle("connected", connected);
  }
  if (sidebarAuthText) {
    sidebarAuthText.textContent = connected
      ? `Метрика подключена (${tokenHint || "…"})`
      : "Войти";
  }
  if (changeTokenBtn) {
    changeTokenBtn.classList.toggle("hidden", !connected);
  }
  if (sidebarAuth) {
    sidebarAuth.classList.toggle("sidebar-auth--clickable", !connected);
  }
}

function updateTopbarMeta() {
  if (!topbarMeta) return;
  const counter = counterSelect.selectedOptions[0]?.textContent || "";
  if (counter && counter !== "— выберите счётчик —" && dateFrom && dateTo) {
    topbarMeta.textContent = `${counter} · ${dateFrom} — ${dateTo}`;
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
  if (dateRangeDisplay) {
    dateRangeDisplay.classList.toggle("is-disabled", !enabled);
  }
  if (fpInstance) fpInstance.set("clickOpens", enabled);
  updateExportButtonState();
}

function updateExportButtonState() {
  const ready =
    authorized &&
    counterSelect.value &&
    dateFrom &&
    dateTo &&
    dateFrom <= dateTo;
  exportBtn.disabled = !ready;
}

function showLoginForm() {
  authorized = false;
  tokenInput.value = "";
  counterSelect.innerHTML = '<option value="">— выберите счётчик —</option>';
  setFormEnabled(false);
  updateSidebarAuth(false);
  updateTopbarMeta();
  showAuthModal();
}

function showTokenChangeForm() {
  tokenInput.value = "";
  showError("");
  showAuthModal();
}

function showAuthorizedUi(tokenHint) {
  authorized = true;
  hideAuthModal();
  updateSidebarAuth(true, tokenHint);
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

function counterHasData(stats) {
  if (!stats) return false;
  const v = stats.visits?.total_rows || 0;
  const h = stats.hits?.total_rows || 0;
  return v > 0 || h > 0;
}

function showMissingDatesPopover(anchor, dates) {
  document.querySelector(".missing-popover")?.remove();

  const pop = document.createElement("div");
  pop.className = "missing-popover";
  pop.addEventListener("click", (e) => e.stopPropagation());

  pop.innerHTML = `
    <div class="missing-popover-title">Пропущено дней: ${dates.length}</div>
    ${dates.map((d) => `<div class="missing-date">${new Date(d).toLocaleDateString("ru-RU")}</div>`).join("")}
  `;

  const btn = document.createElement("button");
  btn.className = "btn-accent btn-sm";
  btn.style.marginTop = "8px";
  btn.style.width = "100%";
  btn.textContent = "↓ Догрузить пропуски";
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const sorted = [...dates].sort();
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    pop.remove();

    const startDate = parseApiDate(first);
    const endDate = parseApiDate(last);
    if (fpInstance) fpInstance.setDate([startDate, endDate]);
    dateFrom = first;
    dateTo = last;
    const rangeTextEl = document.getElementById("dateRangeText");
    if (rangeTextEl) {
      rangeTextEl.textContent =
        startDate.toLocaleDateString("ru-RU") + " — " + endDate.toLocaleDateString("ru-RU");
    }
    periodButtons.forEach((b) => b.classList.remove("active"));
    updateExportButtonState();
    updateTopbarMeta();

    document.getElementById("exportForm")?.scrollIntoView({ behavior: "smooth" });
  });
  pop.appendChild(btn);

  const rect = anchor.getBoundingClientRect();
  pop.style.cssText = `
    position:fixed;
    top:${Math.min(rect.bottom + 4, window.innerHeight - 300)}px;
    left:${rect.left}px;
    z-index:1000;
    max-height:280px;
    overflow-y:auto;
  `;
  document.body.appendChild(pop);

  setTimeout(() => {
    document.addEventListener(
      "click",
      () => pop.remove(),
      { once: true }
    );
  }, 0);
}

function renderMissingCell(td, missingDays) {
  if (!missingDays || missingDays.length === 0) {
    td.innerHTML = '<span class="stats-ok"><i data-lucide="check"></i> Нет</span>';
    return;
  }
  td.innerHTML = `<span class="missing-badge">⚠ ${missingDays.length} дн.</span>`;
  td.querySelector(".missing-badge").addEventListener("click", (e) => {
    e.stopPropagation();
    showMissingDatesPopover(e.target, missingDays);
  });
}

function renderStatsRow(counter, stats) {
  const tr = document.createElement("tr");
  const visits = stats.visits || {};
  const hits = stats.hits || {};
  const visitsText =
    visits.total_rows != null ? visits.total_rows.toLocaleString("ru-RU") : "—";
  const hitsText =
    hits.total_rows != null ? hits.total_rows.toLocaleString("ru-RU") : "—";
  const period = combinedPeriod(visits, hits);
  const missing = combinedMissingDays(visits, hits);

  const nameTd = document.createElement("td");
  nameTd.textContent = counterDisplayName(counter);
  tr.appendChild(nameTd);

  const visitsTd = document.createElement("td");
  visitsTd.className = "stats-num";
  visitsTd.textContent = visitsText;
  tr.appendChild(visitsTd);

  const hitsTd = document.createElement("td");
  hitsTd.className = "stats-num";
  hitsTd.textContent = hitsText;
  tr.appendChild(hitsTd);

  const periodTd = document.createElement("td");
  periodTd.textContent = period;
  tr.appendChild(periodTd);

  const missingTd = document.createElement("td");
  renderMissingCell(missingTd, missing);
  tr.appendChild(missingTd);

  return tr;
}

function renderEmptyCounterRow(counter) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${counterDisplayName(counter)}</td>
    <td class="stats-num">—</td>
    <td class="stats-num">—</td>
    <td colspan="2" class="stats-no-data">Данные не загружены</td>
  `;
  return tr;
}

function updateEmptyCountersToggle(count) {
  if (!emptyCountersToggle) return;
  if (count === 0) {
    emptyCountersToggle.hidden = true;
    emptyCountersToggle.innerHTML = "";
    return;
  }

  emptyCountersToggle.hidden = false;
  const label = emptyCountersVisible
    ? `Скрыть незагруженные (${count})`
    : `Показать незагруженные (${count})`;
  emptyCountersToggle.innerHTML =
    `<button type="button" class="empty-counters-btn" id="showEmptyCountersBtn">${label}</button>`;

  document.getElementById("showEmptyCountersBtn").addEventListener("click", () => {
    emptyCountersVisible = !emptyCountersVisible;
    if (emptyCountersTbody) {
      emptyCountersTbody.style.display = emptyCountersVisible ? "" : "none";
    }
    updateEmptyCountersToggle(count);
  });
}

function renderStatsTable() {
  if (!statsTbody) return;

  const withData = [];
  const withoutData = [];
  const seenIds = new Set();

  countersList.forEach((counter) => {
    const stats = statsByCounter.get(String(counter.id));
    seenIds.add(String(counter.id));
    if (counterHasData(stats)) {
      withData.push({ counter, stats });
    } else {
      withoutData.push(counter);
    }
  });

  statsByCounter.forEach((stats, id) => {
    if (!seenIds.has(id) && counterHasData(stats)) {
      withData.push({
        counter: { id: Number(id), name: String(id), site: "" },
        stats,
      });
    }
  });

  statsTbody.innerHTML = "";
  if (emptyCountersTbody) {
    emptyCountersTbody.innerHTML = "";
    emptyCountersTbody.style.display = emptyCountersVisible ? "" : "none";
  }

  if (!withData.length && !withoutData.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="5" class="stats-no-data">Нет данных в БД</td>';
    statsTbody.appendChild(tr);
    updateEmptyCountersToggle(0);
    return;
  }

  withData.forEach(({ counter, stats }) => {
    statsTbody.appendChild(renderStatsRow(counter, stats));
  });

  withoutData.forEach((counter) => {
    if (emptyCountersTbody) {
      emptyCountersTbody.appendChild(renderEmptyCounterRow(counter));
    }
  });

  updateEmptyCountersToggle(withoutData.length);
  lucide.createIcons({ nodes: statsTbody.querySelectorAll("[data-lucide]") });
  populateDbCounterSelect();
}

function populateDbCounterSelect() {
  if (!dbCounterSelect) return;
  const selected = dbCounterSelect.value;
  dbCounterSelect.innerHTML = '<option value="">Все счётчики</option>';

  const ids = new Set(statsByCounter.keys());
  countersList.forEach((counter) => ids.add(String(counter.id)));

  [...ids].sort((a, b) => Number(a) - Number(b)).forEach((counterId) => {
    const counter = countersList.find((item) => String(item.id) === counterId);
    const option = document.createElement("option");
    option.value = counterId;
    option.textContent = counter ? counterDisplayName(counter) : `Счётчик ${counterId}`;
    dbCounterSelect.appendChild(option);
  });

  if (selected && dbCounterSelect.querySelector(`option[value="${selected}"]`)) {
    dbCounterSelect.value = selected;
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

function formatColumnHeader(column) {
  return column.replace(/^ym:[a-z]+:/, "");
}

function isClientIdColumn(col) {
  const lower = col.toLowerCase();
  return (
    lower.includes("counteruserid") ||
    lower.includes("client_id") ||
    lower.includes("clientid") ||
    lower.includes("user_id_hash")
  );
}

const ALWAYS_SHOW_COLS = [
  "visit_id",
  "counter_id",
  "date",
  "date_time",
  "counter_user_id_hash",
  "client_id",
  "clientid",
  "watch_id",
  "watch_ids",
  "user_id",
  "start_url",
  "end_url",
  "utm_source",
  "utm_medium",
  "utm_campaign",
];

function normalizedColName(col) {
  return col.replace(/^ym:[a-z]+:/i, "").toLowerCase();
}

function filterJunkColumns(columns, rows) {
  const junkValues = new Set(['["0"]', '[""]', '["-1"]', "", "[]", "null", "[0]"]);
  const usefulColIndices = columns
    .map((col, i) => {
      const colLower = normalizedColName(col);
      if (ALWAYS_SHOW_COLS.some((w) => colLower.includes(w))) return i;
      const hasRealData = rows.some((row) => {
        const v = formatDbCell(row[i]).trim();
        return v !== "" && !junkValues.has(v);
      });
      return hasRealData ? i : null;
    })
    .filter((i) => i !== null);

  return {
    columns: usefulColIndices.map((i) => columns[i]),
    rows: rows.map((row) => usefulColIndices.map((i) => row[i])),
  };
}

function reorderClientIdColumn(columns, rows) {
  const clientIdCol = columns.findIndex(isClientIdColumn);
  if (clientIdCol <= 1) return { columns, rows };

  const cols = [...columns];
  const colName = cols.splice(clientIdCol, 1)[0];
  cols.splice(1, 0, colName);

  const newRows = rows.map((row) => {
    const r = [...row];
    const val = r.splice(clientIdCol, 1)[0];
    r.splice(1, 0, val);
    return r;
  });

  return { columns: cols, rows: newRows };
}

function attachDbTableSort(table, tbody) {
  const headers = table.querySelectorAll("th");
  headers.forEach((th, i) => {
    th.addEventListener("click", () => {
      if (dbSortCol === i) {
        dbSortDir = dbSortDir === "asc" ? "desc" : "asc";
      } else {
        dbSortCol = i;
        dbSortDir = "desc";
      }

      headers.forEach((h) => h.classList.remove("sort-asc", "sort-desc"));
      th.classList.add(dbSortDir === "asc" ? "sort-asc" : "sort-desc");

      const trs = [...tbody.querySelectorAll("tr")];
      trs.sort((a, b) => {
        const av = a.cells[i]?.textContent || "";
        const bv = b.cells[i]?.textContent || "";
        const n = (v) => (isNaN(Number(v)) || v === "" ? v : Number(v));
        if (dbSortDir === "asc") {
          return n(av) > n(bv) ? 1 : n(av) < n(bv) ? -1 : 0;
        }
        return n(av) < n(bv) ? 1 : n(av) > n(bv) ? -1 : 0;
      });
      trs.forEach((tr) => tbody.appendChild(tr));
    });
  });
}

async function loadDbTable() {
  if (!dbTableWrap) return;

  dbTableWrap.innerHTML = '<div class="loading-state">Загрузка...</div>';
  dbSortCol = null;
  dbSortDir = "desc";

  const params = new URLSearchParams({
    table: dbCurrentTable,
    limit: String(DB_PAGE_SIZE),
    offset: String(dbCurrentPage * DB_PAGE_SIZE),
  });
  if (dbCurrentCounter) params.append("counter_id", dbCurrentCounter);

  try {
    const res = await fetch(`/api/table-preview?${params}`, FETCH_OPTS);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "Не удалось загрузить данные");
    }

    const total = data.total || 0;
    let columns = data.columns || [];
    let rows = data.rows || [];
    ({ columns, rows } = filterJunkColumns(columns, rows));
    ({ columns, rows } = reorderClientIdColumn(columns, rows));

    const from = total ? dbCurrentPage * DB_PAGE_SIZE + 1 : 0;
    const to = Math.min((dbCurrentPage + 1) * DB_PAGE_SIZE, total);

    if (dbPopupStats) {
      dbPopupStats.textContent =
        `Показано ${from}–${to} из ${total.toLocaleString("ru-RU")} строк · ${columns.length} колонок с данными`;
    }

    const table = document.createElement("table");
    table.className = "data-table";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    columns.forEach((c) => {
      const th = document.createElement("th");
      th.textContent = formatColumnHeader(c);
      th.title = c;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      row.forEach((cell, colIndex) => {
        const td = document.createElement("td");
        const text = formatDbCell(cell);
        td.textContent = text;
        td.title = text;

        if (colIndex === 1 && isClientIdColumn(columns[colIndex])) {
          td.style.cursor = "pointer";
          td.title = "Нажмите чтобы исследовать в CJM";
          td.style.color = "var(--accent)";
          td.style.textDecoration = "underline";
          td.addEventListener("click", () => {
            const hash = td.textContent.trim();
            if (!hash) return;
            if (dbPopup) dbPopup.style.display = "none";
            window.location.href = `/cjm?user_hash=${encodeURIComponent(hash)}`;
          });
        }

        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    attachDbTableSort(table, tbody);

    dbTableWrap.innerHTML = "";
    dbTableWrap.appendChild(table);

    const totalPages = Math.max(1, Math.ceil(total / DB_PAGE_SIZE));
    if (dbPageInfo) {
      dbPageInfo.textContent = `Страница ${dbCurrentPage + 1} из ${totalPages}`;
    }
    if (dbPrevPage) dbPrevPage.disabled = dbCurrentPage === 0;
    if (dbNextPage) {
      dbNextPage.disabled = (dbCurrentPage + 1) * DB_PAGE_SIZE >= total;
    }
  } catch (error) {
    dbTableWrap.innerHTML = `<div class="loading-state">${error.message}</div>`;
    if (dbPopupStats) dbPopupStats.textContent = "";
    if (dbPageInfo) dbPageInfo.textContent = "";
    if (dbPrevPage) dbPrevPage.disabled = true;
    if (dbNextPage) dbNextPage.disabled = true;
  }
}

function openDbPreview(table) {
  dbTabButtons.forEach((b) => {
    b.classList.toggle("active", b.dataset.table === table);
  });
  dbCurrentTable = table;
  dbCurrentPage = 0;
  const counterId = counterSelect?.value || "";
  dbCurrentCounter = counterId;
  populateDbCounterSelect();
  if (dbCounterSelect) dbCounterSelect.value = counterId;
  if (dbPopup) dbPopup.style.display = "flex";
  loadDbTable();
  lucide.createIcons({ nodes: dbPopup?.querySelectorAll("[data-lucide]") || [] });
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

  if (!authorized || !counterId || !dateFrom || !dateTo) {
    showError("Заполните все поля");
    return;
  }

  showError("");
  exportBtn.disabled = true;
  statusSection.classList.remove("hidden");
  resultSection.classList.add("hidden");
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
counterSelect.addEventListener("change", () => {
  updateExportButtonState();
  updateTopbarMeta();
});
previewVisitsBtn?.addEventListener("click", () => openDbPreview("visits"));
previewHitsBtn?.addEventListener("click", () => openDbPreview("hits"));
refreshCjmBtn?.addEventListener("click", async () => {
  const counterId = document.getElementById("counterId")?.value || "";
  const btn = refreshCjmBtn;
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader" style="width:14px;height:14px"></i> Пересчёт...';
  lucide.createIcons();
  try {
    const url = counterId
      ? `/api/cjm/refresh?counter_id=${encodeURIComponent(counterId)}`
      : "/api/cjm/refresh";
    const res = await fetch(url, { method: "POST", ...FETCH_OPTS });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || "Ошибка пересчёта");
    }
    btn.textContent = "✓ CJM пересчитан";
    btn.style.color = "var(--success)";
  } catch {
    btn.textContent = "Ошибка пересчёта";
    btn.disabled = false;
  }
});

document.getElementById("goToCjmBtn")?.addEventListener("click", () => {
  const counterId = document.getElementById("counterId")?.value || "";
  window.location.href = counterId ? `/cjm?counter_id=${encodeURIComponent(counterId)}` : "/cjm";
});

statsRefreshBtn.addEventListener("click", loadStats);

if (sidebarAuth) {
  sidebarAuth.addEventListener("click", () => {
    if (!authorized) showAuthModal();
  });
  sidebarAuth.addEventListener("keydown", (event) => {
    if (!authorized && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      showAuthModal();
    }
  });
}

if (authModalBackdrop) {
  authModalBackdrop.addEventListener("click", hideAuthModal);
}
if (authModalClose) {
  authModalClose.addEventListener("click", hideAuthModal);
}

const toggleBtn = document.getElementById("toggleDataTable");
if (toggleBtn && dbPopup) {
  toggleBtn.addEventListener("click", () => {
    dbPopup.style.display = "flex";
    populateDbCounterSelect();
    loadDbTable();
    lucide.createIcons({ nodes: dbPopup.querySelectorAll("[data-lucide]") });
  });
}

if (dbPopupClose) {
  dbPopupClose.addEventListener("click", () => {
    dbPopup.style.display = "none";
  });
}

if (dbPopup) {
  dbPopup.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) e.currentTarget.style.display = "none";
  });
}

dbTabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    dbTabButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    dbCurrentTable = btn.dataset.table;
    dbCurrentPage = 0;
    loadDbTable();
  });
});

if (dbCounterSelect) {
  dbCounterSelect.addEventListener("change", (e) => {
    dbCurrentCounter = e.target.value;
    dbCurrentPage = 0;
    loadDbTable();
  });
}

if (dbPrevPage) {
  dbPrevPage.addEventListener("click", () => {
    dbCurrentPage--;
    loadDbTable();
  });
}

if (dbNextPage) {
  dbNextPage.addEventListener("click", () => {
    dbCurrentPage++;
    loadDbTable();
  });
}

periodButtons.forEach((btn) => {
  btn.addEventListener("click", () => applyPeriod(btn.dataset.period));
});

initFlatpickr();
setFormEnabled(false);
initAuth();
