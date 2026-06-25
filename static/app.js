const tokenInput = document.getElementById("token");
const connectBtn = document.getElementById("connect-btn");
const counterSelect = document.getElementById("counter");
const dateFromInput = document.getElementById("date-from");
const dateToInput = document.getElementById("date-to");
const exportBtn = document.getElementById("export-btn");
const settingsError = document.getElementById("settings-error");

const statusSection = document.getElementById("status-section");
const progressBar = document.getElementById("progress-bar");
const statusMessage = document.getElementById("status-message");
const statusMeta = document.getElementById("status-meta");
const previewActions = document.getElementById("preview-actions");
const showVisitsBtn = document.getElementById("show-visits-btn");
const showHitsBtn = document.getElementById("show-hits-btn");

const previewSection = document.getElementById("preview-section");
const previewTotal = document.getElementById("preview-total");
const previewTable = document.getElementById("preview-table");
const toggleButtons = document.querySelectorAll(".toggle");

let pollTimer = null;
let currentPreviewTable = "visits";
let connected = false;

function setDefaultDates() {
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);
  dateToInput.value = formatDate(today);
  dateFromInput.value = formatDate(weekAgo);
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function showError(message) {
  settingsError.textContent = message;
  settingsError.hidden = !message;
}

function updateExportButtonState() {
  const ready =
    connected &&
    counterSelect.value &&
    dateFromInput.value &&
    dateToInput.value &&
    dateFromInput.value <= dateToInput.value;
  exportBtn.disabled = !ready;
}

function renderCounters(counters) {
  counterSelect.innerHTML = '<option value="">— выберите счётчик —</option>';
  counters.forEach((counter) => {
    const option = document.createElement("option");
    option.value = counter.id;
    option.textContent = `${counter.name} (${counter.site || counter.id})`;
    counterSelect.appendChild(option);
  });
  counterSelect.disabled = false;
  connected = true;
  updateExportButtonState();
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
    const response = await fetch(`/api/counters?token=${encodeURIComponent(token)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || "Не удалось получить список счётчиков");
    }
    if (!data.length) {
      throw new Error("У токена нет доступных счётчиков");
    }
    renderCounters(data);
  } catch (error) {
    showError(error.message);
    connected = false;
    counterSelect.disabled = true;
    updateExportButtonState();
  } finally {
    connectBtn.disabled = false;
    connectBtn.textContent = "Подключить";
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
    const response = await fetch(`/api/status/${jobId}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || "Ошибка статуса");
    }

    progressBar.style.width = `${data.progress || 0}%`;
    statusMessage.textContent = data.message || "";
    statusMeta.textContent = `Визиты: ${data.rows_visits || 0} · События: ${data.rows_hits || 0}`;

    if (data.status === "done") {
      stopPolling();
      previewActions.classList.remove("hidden");
      statusMessage.textContent = data.message;
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
  const token = tokenInput.value.trim();
  const counterId = Number(counterSelect.value);
  const dateFrom = dateFromInput.value;
  const dateTo = dateToInput.value;

  if (!token || !counterId || !dateFrom || !dateTo) {
    showError("Заполните все поля");
    return;
  }

  showError("");
  exportBtn.disabled = true;
  statusSection.classList.remove("hidden");
  previewSection.classList.add("hidden");
  previewActions.classList.add("hidden");
  statusMessage.style.color = "";
  progressBar.style.width = "0%";
  statusMessage.textContent = "Запуск выгрузки…";
  statusMeta.textContent = "";

  try {
    const response = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
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

  const response = await fetch(`/api/preview?${params}`);
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

connectBtn.addEventListener("click", connect);
exportBtn.addEventListener("click", startExport);
dateFromInput.addEventListener("change", updateExportButtonState);
dateToInput.addEventListener("change", updateExportButtonState);
counterSelect.addEventListener("change", updateExportButtonState);
showVisitsBtn.addEventListener("click", () => loadPreview("visits"));
showHitsBtn.addEventListener("click", () => loadPreview("hits"));

toggleButtons.forEach((btn) => {
  btn.addEventListener("click", () => loadPreview(btn.dataset.table));
});

setDefaultDates();
updateExportButtonState();
