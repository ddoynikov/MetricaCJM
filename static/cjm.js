if (typeof cytoscapeDagre !== "undefined") cytoscape.use(cytoscapeDagre);
if (typeof cytoscapeFcose !== "undefined") cytoscape.use(cytoscapeFcose);
if (typeof cytoscapeCola !== "undefined") cytoscape.use(cytoscapeCola);

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
const minTransitionsNum = document.getElementById("minTransitionsNum");
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
let currentLayout = "fcose";

const cyStyles = [
  {
    selector: "node",
    style: {
      shape: "round-rectangle",
      label: "data(label)",
      "text-valign": "center",
      "text-halign": "center",
      "font-size": "13px",
      "font-family": '"JetBrains Mono", monospace',
      color: "#E8EAF0",
      "background-color": "#1C2030",
      "border-width": 1.5,
      "border-color": "#2E3550",
      padding: "6px 20px",
      width: "label",
      height: "32px",
      "text-background-opacity": 0,
    },
  },
  {
    selector: 'node[type="entry"]',
    style: {
      "background-color": "#2A3F6F",
      "border-color": "#4F7CFF",
    },
  },
  {
    selector: 'node[type="funnel"]',
    style: {
      "background-color": "#3A2A1A",
      "border-color": "#F5A623",
    },
  },
  {
    selector: 'node[type="conversion"]',
    style: {
      "background-color": "#1A3A2A",
      "border-color": "#34C97E",
    },
  },
  {
    selector: "node.highlighted",
    style: {
      "border-width": 3,
      "border-color": "#4F7CFF",
    },
  },
  {
    selector: "node.faded",
    style: {
      opacity: 0.2,
    },
  },
  {
    selector: "edge",
    style: {
      width: 1,
      "line-color": "#2E3550",
      "target-arrow-color": "#2E3550",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      opacity: 0.7,
    },
  },
  {
    selector: "edge.highlighted",
    style: {
      "line-color": "#4F7CFF",
      "target-arrow-color": "#4F7CFF",
      opacity: 1,
    },
  },
  {
    selector: "edge.faded",
    style: {
      opacity: 0.05,
    },
  },
];

const LAYOUT_CONFIGS = {
  dagre: {
    name: "dagre",
    rankDir: "TB",
    nodeSep: 80,
    rankSep: 140,
    fit: false,
    padding: 60,
    animate: false,
  },
  fcose: {
    name: "fcose",
    quality: "default",
    randomize: false,
    animate: false,
    fit: false,
    padding: 60,
    nodeSeparation: 120,
    idealEdgeLength: 150,
    edgeElasticity: 0.45,
    gravity: 0.25,
    numIter: 2500,
    tile: false,
  },
  cola: {
    name: "cola",
    animate: false,
    fit: false,
    padding: 60,
    nodeSpacing: 60,
    edgeLength: 180,
    maxSimulationTime: 3000,
    randomize: false,
    avoidOverlap: true,
    handleDisconnected: true,
  },
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
  cy.elements().removeClass("faded highlighted");
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
    cy.elements().addClass("faded");
    node.removeClass("faded").addClass("highlighted");
    node.connectedEdges().removeClass("faded").addClass("highlighted");
    node.neighborhood().nodes().removeClass("faded");
    showSidebar(node.data());
  });

  cy.on("tap", (event) => {
    if (event.target === cy) {
      resetHighlight();
      sidebar.classList.add("hidden");
    }
  });
}

function applyLayout() {
  if (!cy) return;
  const config = LAYOUT_CONFIGS[currentLayout];
  const layout = cy.layout(config);
  layout.on("layoutstop", () => {
    cy.fit(undefined, 60);
    if (cy.zoom() > 0.85) cy.zoom(0.85);
    cy.center();
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

  const nodeIds = new Set(data.nodes.map((n) => n.id));

  const elements = [];

  data.nodes.forEach((node) => {
    const label = node.id;
    elements.push({
      data: {
        id: node.id,
        label,
        type: getNodeType(label),
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
    style: cyStyles,
    wheelSensitivity: 0.2,
  });

  const maxVisits = Math.max(...cy.nodes().map((n) => n.data("visit_count") || 1));
  const maxCount = Math.max(...cy.edges().map((e) => e.data("count") || 1));

  cy.nodes().forEach((node) => {
    const ratio = (node.data("visit_count") || 1) / maxVisits;
    node.style("border-width", 1 + ratio * 3);
  });

  cy.edges().forEach((edge) => {
    const ratio = (edge.data("count") || 1) / maxCount;
    edge.style("width", 1 + ratio * 5);
  });

  bindGraphControls();
  bindGraphInteractions();
  applyLayout();

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
  counterSelect.dispatchEvent(new CustomEvent("countersLoaded"));
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
  const counterId = getSelectedCounterId();
  if (!counterId) {
    showError("Выберите счётчик для пересчёта");
    return;
  }
  if (!confirm("Пересчитать таблицы CJM из сырых данных? Это может занять время.")) {
    return;
  }

  showError("");
  refreshBtn.disabled = true;
  refreshBtn.textContent = "Пересчёт…";

  try {
    const url = `/api/cjm/refresh?counter_id=${encodeURIComponent(counterId)}`;
    const response = await fetch(url, { ...FETCH_OPTS, method: "POST" });
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

    const urlParams = new URLSearchParams(window.location.search);
    const prefilledHash = urlParams.get("user_hash");
    const prefilledCounterId = urlParams.get("counter_id");

    const waitForCounters = () => {
      if (!prefilledCounterId) return;
      const option = [...counterSelect.options].find((o) => o.value === prefilledCounterId);
      if (option) {
        counterSelect.value = prefilledCounterId;
        saveCounterId(Number(prefilledCounterId));
        updateTopbarCounter();
        counterSelect.dispatchEvent(new Event("change"));
      }
    };

    if (prefilledCounterId) {
      waitForCounters();
      setTimeout(waitForCounters, 500);
    }

    if (prefilledHash) {
      setTimeout(() => {
        userSearchBar.classList.remove("hidden");
        userIdTypeSelect.value = "counter_user_id_hash";
        userIdValueInput.value = prefilledHash;
        updateUserIdPlaceholder();
        applyUserSearch();
      }, 800);
      return;
    }

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
  if (minTransitionsNum) minTransitionsNum.value = minTransitionsInput.value;
});

minTransitionsNum?.addEventListener("change", () => {
  const val = Math.max(1, parseInt(minTransitionsNum.value, 10) || 1);
  minTransitionsNum.value = val;
  minTransitionsInput.value = Math.min(val, 2000);
  minTransitionsInput.dispatchEvent(new Event("change"));
});

minTransitionsNum?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") minTransitionsNum.dispatchEvent(new Event("change"));
});

minTransitionsInput.addEventListener("change", loadCjm);

document.querySelectorAll(".layout-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".layout-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentLayout = btn.dataset.layout;
    applyLayout();
  });
});

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
