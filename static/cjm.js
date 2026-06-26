cytoscape.use(cytoscapeDagre);

const FETCH_OPTS = { credentials: "same-origin" };
const COUNTER_STORAGE_KEY = "cjm_counter_id";

const authBanner = document.getElementById("auth-banner");
const cjmAuthStatus = document.getElementById("cjm-auth-status");
const tokenHintEl = document.getElementById("token-hint");
const cjmControls = document.getElementById("cjm-controls");
const cjmMain = document.getElementById("cjm-main");
const counterSelect = document.getElementById("counter");
const deviceSelect = document.getElementById("device");
const utmMediumSelect = document.getElementById("utm-medium");
const minTransitionsInput = document.getElementById("minTransitions");
const minTransitionsValue = document.getElementById("minTransitionsValue");
const applyBtn = document.getElementById("apply-btn");
const refreshBtn = document.getElementById("refresh-btn");
const findUserBtn = document.getElementById("find-user-btn");
const userSearchBar = document.getElementById("user-search-bar");
const userIdTypeSelect = document.getElementById("user-id-type");
const userIdValueInput = document.getElementById("user-id-value");
const userSearchBtn = document.getElementById("user-search-btn");
const userSearchClear = document.getElementById("user-search-clear");
const cjmError = document.getElementById("cjm-error");
const cjmMeta = document.getElementById("cjm-meta");
const cjmEmpty = document.getElementById("cjm-empty");
const sidebar = document.getElementById("sidebar");
const tooltip = document.getElementById("tooltip");
const zoomInBtn = document.getElementById("zoom-in");
const zoomOutBtn = document.getElementById("zoom-out");
const zoomFitBtn = document.getElementById("zoom-fit");
const sidebarClose = document.getElementById("sidebar-close");
const topbarCounter = document.getElementById("topbar-counter");
const cjmAuthOffline = document.getElementById("cjm-auth-offline");

let cy = null;
let nodesData = [];
let edgesData = [];
let authorized = false;
let highlightedNode = null;
let activeUserFilter = null;

const NODE_TYPE_COLORS = {
  entry: { bg: "#2A3F6F", border: "#4F7CFF" },
  content: { bg: "#1C2030", border: "#2E3550" },
  funnel: { bg: "#3A2A1A", border: "#F5A623" },
  conversion: { bg: "#1A3A2A", border: "#34C97E" },
};

const USER_ID_PLACEHOLDERS = {
  counter_user_id_hash: "Введите хэш пользователя",
  user_id: "Введите UserID",
};

function getNodeType(label) {
  if (label === "/" || label === "") return "entry";
  if (/form_submitted|thank|success|booking_complete/.test(label)) return "conversion";
  if (/form_step|form_popup|checkout/.test(label)) return "funnel";
  return "content";
}

function showError(message) {
  cjmError.textContent = message;
  cjmError.hidden = !message;
}

function getSelectedCounterId() {
  const value = counterSelect.value;
  return value ? Number(value) : null;
}

function saveCounterId(counterId) {
  if (counterId) {
    localStorage.setItem(COUNTER_STORAGE_KEY, String(counterId));
  } else {
    localStorage.removeItem(COUNTER_STORAGE_KEY);
  }
}

function restoreCounterSelection() {
  const saved = localStorage.getItem(COUNTER_STORAGE_KEY);
  if (!saved) return;
  const option = counterSelect.querySelector(`option[value="${saved}"]`);
  if (option) {
    counterSelect.value = saved;
  }
}

function updateUserIdPlaceholder() {
  userIdValueInput.placeholder =
    USER_ID_PLACEHOLDERS[userIdTypeSelect.value] || "Введите значение";
}

function cjmQueryParams() {
  const params = new URLSearchParams({
    min_transitions: minTransitionsInput.value || "200",
    device: deviceSelect.value,
  });
  const counterId = getSelectedCounterId();
  if (counterId) {
    params.set("counter_id", String(counterId));
  }
  if (utmMediumSelect.value) {
    params.set("utm_medium", utmMediumSelect.value);
  }
  if (activeUserFilter) {
    params.set("user_id_type", activeUserFilter.type);
    params.set("user_id_value", activeUserFilter.value);
  }
  return params;
}

function updateTopbarCounter() {
  if (!topbarCounter) return;
  const opt = counterSelect.selectedOptions[0];
  topbarCounter.textContent = opt && opt.value ? opt.textContent : "";
}

function renderTransitionsList(container, items, direction) {
  container.innerHTML = "";
  if (!items.length) {
    const li = document.createElement("li");
    li.textContent = "—";
    li.style.color = "var(--text-muted)";
    container.appendChild(li);
    return;
  }
  items
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .forEach((edge) => {
      const li = document.createElement("li");
      const path = document.createElement("span");
      path.className = "path";
      path.textContent = direction === "in" ? edge.from : edge.to;
      const count = document.createElement("span");
      count.className = "count";
      count.textContent = edge.count.toLocaleString("ru-RU");
      li.appendChild(path);
      li.appendChild(count);
      container.appendChild(li);
    });
}

function resetHighlight() {
  if (!cy) return;
  cy.elements().style("opacity", 1);
  highlightedNode = null;
}

function bindGraphControls() {
  zoomInBtn.onclick = () => {
    if (cy) cy.zoom(cy.zoom() * 1.2);
  };
  zoomOutBtn.onclick = () => {
    if (cy) cy.zoom(cy.zoom() / 1.2);
  };
  zoomFitBtn.onclick = () => {
    if (cy) cy.fit(undefined, 40);
  };
}

function bindGraphInteractions() {
  cy.on("mouseover", "node", (event) => {
    const data = event.target.data();
    tooltip.innerHTML = `${data.label}<br>Визиты: ${data.visits.toLocaleString("ru-RU")}<br>Уходы: ${data.exits.toLocaleString("ru-RU")}`;
    tooltip.hidden = false;
  });

  cy.on("mousemove", "node", (event) => {
    const evt = event.originalEvent;
    tooltip.style.left = `${evt.clientX + 12}px`;
    tooltip.style.top = `${evt.clientY + 12}px`;
  });

  cy.on("mouseout", "node", () => {
    tooltip.hidden = true;
  });

  cy.on("tap", "node", (event) => {
    const node = event.target;
    if (highlightedNode === node) {
      resetHighlight();
      sidebar.classList.add("hidden");
      return;
    }

    highlightedNode = node;
    cy.elements().style("opacity", 0.2);
    node.style("opacity", 1);
    node.connectedEdges().style("opacity", 1);
    node.connectedEdges().connectedNodes().style("opacity", 1);
    showSidebar(node.data());
  });

  cy.on("tap", (event) => {
    if (event.target === cy) {
      resetHighlight();
      sidebar.classList.add("hidden");
    }
  });
}

function applyNodeBorderWidths(maxVisits) {
  if (!cy) return;
  cy.nodes().forEach((node) => {
    const visits = node.data("visit_count") || 0;
    const borderWidth = 1 + (visits / maxVisits) * 3;
    node.style("border-width", borderWidth);
  });
}

function applyEdgeWidths(maxCount) {
  if (!cy) return;
  const minWidth = 1;
  const maxWidth = 8;
  cy.edges().forEach((edge) => {
    const count = edge.data("count") || 0;
    const width = minWidth + (count / maxCount) * (maxWidth - minWidth);
    edge.style("width", width);
  });
}

function applyNodeColors() {
  if (!cy) return;
  cy.nodes().forEach((node) => {
    const label = node.data("label") || node.data("id") || "";
    const type = getNodeType(label);
    const colors = NODE_TYPE_COLORS[type];
    node.style("background-color", colors.bg);
    node.style("border-color", colors.border);
  });
}

const layoutConfig = {
  name: "dagre",
  rankDir: "TB",
  nodeSep: 80,
  rankSep: 120,
  fit: true,
  padding: 40,
};

function runLayoutAndFit() {
  if (!cy) return;
  const layout = cy.layout(layoutConfig);
  layout.on("layoutstop", function () {
    cy.fit(undefined, 40);
  });
  layout.run();
}

function updateSliderMax(edges) {
  const maxCount = Math.max(...edges.map((e) => e.count), 500);
  minTransitionsInput.max = String(maxCount);
}

function renderGraph(data, warning) {
  nodesData = data.nodes;
  edgesData = data.edges;
  highlightedNode = null;
  tooltip.hidden = true;
  updateSliderMax(data.edges);

  const maxVisits = Math.max(...data.nodes.map((n) => n.visits), 1);
  const maxCount = Math.max(...data.edges.map((e) => e.count), 1);
  const nodeIds = new Set(data.nodes.map((n) => n.id));

  const elements = [];

  data.nodes.forEach((node) => {
    elements.push({
      data: {
        id: node.id,
        label: node.id,
        visits: node.visits,
        visit_count: node.visits,
        entries: node.entries,
        exits: node.exits,
        exit_rate: node.exit_rate,
      },
    });
  });

  data.edges.forEach((edge, idx) => {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) return;
    elements.push({
      data: {
        id: `e${idx}`,
        source: edge.from,
        target: edge.to,
        count: edge.count,
        unique_visits: edge.unique_visits,
      },
    });
  });

  if (cy) {
    cy.destroy();
    cy = null;
  }

  const hasElements = elements.length > 0;
  const showWarningOnly = warning && !hasElements;

  if (showWarningOnly) {
    cjmEmpty.textContent = warning;
    cjmEmpty.classList.remove("hidden");
    cjmMeta.textContent = "0 узлов · 0 переходов";
    sidebar.classList.add("hidden");
    return;
  }

  cjmEmpty.classList.toggle("hidden", hasElements);
  if (!hasElements) {
    cjmEmpty.textContent = "Нет данных для отображения";
    cjmMeta.textContent = "0 узлов · 0 переходов";
    sidebar.classList.add("hidden");
    return;
  }

  cy = cytoscape({
    container: document.getElementById("cy"),
    elements,
    userZoomingEnabled: true,
    userPanningEnabled: true,
    minZoom: 0.3,
    maxZoom: 3,
    style: [
      {
        selector: "node",
        style: {
          shape: "round-rectangle",
          width: "label",
          height: 32,
          padding: "6px 20px",
          label: "data(label)",
          "text-valign": "center",
          "text-halign": "center",
          "font-size": "13px",
          "font-family": "JetBrains Mono, monospace",
          color: "#E8EAF0",
          "text-background-opacity": 0,
          "border-width": 1.5,
        },
      },
      {
        selector: "edge",
        style: {
          "line-color": "#555C78",
          "target-arrow-color": "#555C78",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          opacity: 0.85,
        },
      },
      {
        selector: "node:selected",
        style: {
          "border-width": 3,
        },
      },
    ],
    wheelSensitivity: 0.2,
  });

  applyNodeColors();
  applyNodeBorderWidths(maxVisits);
  applyEdgeWidths(maxCount);
  bindGraphControls();
  bindGraphInteractions();
  runLayoutAndFit();

  cjmMeta.textContent = `${data.nodes.length} узлов · ${data.edges.length} переходов`;
}

function updateNodePageLink(nodeLabel) {
  const linkEl = document.getElementById("nodePageLink");
  if (!linkEl) return;

  const counterName = counterSelect.selectedOptions[0]?.textContent || "";
  const domainMatch = counterName.match(/\(([^)]+)\)/);
  const domain = domainMatch ? domainMatch[1] : null;

  if (domain && nodeLabel && nodeLabel !== "/tilda/product/*") {
    const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    linkEl.href = `https://${cleanDomain}${nodeLabel}`;
    linkEl.style.display = "block";
  } else {
    linkEl.style.display = "none";
  }
}

function showSidebar(node) {
  document.getElementById("sb-page").textContent = node.id;
  updateNodePageLink(node.id);
  document.getElementById("sb-visits").textContent = node.visits.toLocaleString("ru-RU");
  document.getElementById("sb-entries").textContent = node.entries.toLocaleString("ru-RU");
  document.getElementById("sb-exits").textContent = node.exits.toLocaleString("ru-RU");
  document.getElementById("sb-exit-rate").textContent = `${node.exit_rate}%`;
  renderTransitionsList(
    document.getElementById("sb-incoming"),
    edgesData.filter((e) => e.to === node.id),
    "in"
  );
  renderTransitionsList(
    document.getElementById("sb-outgoing"),
    edgesData.filter((e) => e.from === node.id),
    "out"
  );
  sidebar.classList.remove("hidden");
}

async function loadCounters() {
  const response = await fetch("/api/counters", FETCH_OPTS);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || "Не удалось загрузить счётчики");
  }

  counterSelect.innerHTML = '<option value="">— выберите счётчик —</option>';
  data.forEach((counter) => {
    const option = document.createElement("option");
    option.value = counter.id;
    option.textContent = `${counter.name} (${counter.site || counter.id})`;
    counterSelect.appendChild(option);
  });
  restoreCounterSelection();
  updateTopbarCounter();
}

async function loadChannels() {
  try {
    const response = await fetch(`/api/cjm/channels?${cjmQueryParams()}`, FETCH_OPTS);
    const data = await response.json();
    if (!response.ok) return;

    const current = utmMediumSelect.value;
    utmMediumSelect.innerHTML = '<option value="">Все каналы</option>';
    (data.channels || []).forEach((channel) => {
      const option = document.createElement("option");
      option.value = channel;
      option.textContent = channel;
      utmMediumSelect.appendChild(option);
    });
    if (current && [...utmMediumSelect.options].some((opt) => opt.value === current)) {
      utmMediumSelect.value = current;
    }
  } catch {
    /* channels are optional */
  }
}

async function loadCjm() {
  if (!getSelectedCounterId()) {
    showError("Выберите счётчик");
    return;
  }

  showError("");
  applyBtn.disabled = true;
  applyBtn.textContent = "Загрузка…";
  cjmMeta.textContent = "Загрузка данных…";

  try {
    const response = await fetch(`/api/cjm?${cjmQueryParams()}`, FETCH_OPTS);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || "Не удалось загрузить CJM");
    }
    renderGraph(data, data.warning);
  } catch (error) {
    showError(error.message);
    cjmMeta.textContent = "";
    if (cy) {
      cy.destroy();
      cy = null;
    }
    cjmEmpty.classList.remove("hidden");
    cjmEmpty.textContent = "Нет данных для отображения";
  } finally {
    applyBtn.disabled = false;
    applyBtn.textContent = "Обновить граф";
  }
}

async function refreshCjm() {
  if (!confirm("Пересчитать таблицы CJM из сырых данных? Это может занять время.")) {
    return;
  }

  showError("");
  refreshBtn.disabled = true;
  refreshBtn.textContent = "Пересчёт…";

  try {
    const response = await fetch("/api/cjm/refresh", { ...FETCH_OPTS, method: "POST" });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || "Ошибка пересчёта");
    }
    await loadChannels();
    await loadCjm();
  } catch (error) {
    showError(error.message);
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "Пересчитать CJM";
  }
}

function showUnauthorized() {
  authorized = false;
  authBanner.classList.remove("hidden");
  cjmAuthStatus.classList.add("hidden");
  if (cjmAuthOffline) cjmAuthOffline.classList.remove("hidden");
  cjmControls.classList.add("hidden");
  userSearchBar.classList.add("hidden");
  cjmMain.classList.add("hidden");
}

function showAuthorized(tokenHint) {
  authorized = true;
  authBanner.classList.add("hidden");
  cjmAuthStatus.classList.remove("hidden");
  if (cjmAuthOffline) cjmAuthOffline.classList.add("hidden");
  cjmControls.classList.remove("hidden");
  cjmMain.classList.remove("hidden");
  tokenHintEl.textContent = tokenHint || "";
}

function applyUserSearch() {
  const value = userIdValueInput.value.trim();
  if (!value) {
    showError("Введите идентификатор пользователя");
    return;
  }
  activeUserFilter = {
    type: userIdTypeSelect.value,
    value,
  };
  showError("");
  loadCjm();
}

function clearUserSearch() {
  activeUserFilter = null;
  userIdValueInput.value = "";
  userSearchBar.classList.add("hidden");
  showError("");
  loadCjm();
}

async function initPage() {
  try {
    const response = await fetch("/api/auth/status", FETCH_OPTS);
    const data = await response.json();
    if (!response.ok || !data.authorized) {
      showUnauthorized();
      return;
    }

    showAuthorized(data.token_hint);
    await loadCounters();
    await loadChannels();
    if (getSelectedCounterId()) {
      await loadCjm();
    } else {
      cjmMeta.textContent = "Выберите счётчик для построения графа";
    }
  } catch (error) {
    showUnauthorized();
    showError(error.message);
  }
}

applyBtn.addEventListener("click", loadCjm);
refreshBtn.addEventListener("click", refreshCjm);
findUserBtn.addEventListener("click", () => {
  userSearchBar.classList.toggle("hidden");
  if (!userSearchBar.classList.contains("hidden")) {
    userIdValueInput.focus();
  }
});
userSearchBtn.addEventListener("click", applyUserSearch);
userSearchClear.addEventListener("click", clearUserSearch);
userIdTypeSelect.addEventListener("change", updateUserIdPlaceholder);

minTransitionsInput.addEventListener("input", () => {
  minTransitionsValue.textContent = minTransitionsInput.value;
});
minTransitionsInput.addEventListener("change", loadCjm);

counterSelect.addEventListener("change", async () => {
  saveCounterId(getSelectedCounterId());
  updateTopbarCounter();
  await loadChannels();
  if (getSelectedCounterId()) {
    await loadCjm();
  }
});
deviceSelect.addEventListener("change", async () => {
  await loadChannels();
});

if (sidebarClose) {
  sidebarClose.addEventListener("click", () => {
    resetHighlight();
    sidebar.classList.add("hidden");
  });
}

updateUserIdPlaceholder();
initPage();
