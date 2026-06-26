async function loadProjectStatus() {
  const el = document.getElementById("statusText");
  if (!el) return;
  try {
    const res = await fetch("/api/project-status");
    const data = await res.json();
    el.textContent = data.content;
  } catch {
    el.textContent = "Ошибка загрузки статуса";
  }
}

function initProjectStatusToggle() {
  const toggle = document.getElementById("statusToggle");
  if (!toggle) return;

  toggle.addEventListener("click", () => {
    const content = document.getElementById("statusContent");
    const chevron = document.getElementById("statusChevron");
    const text = document.getElementById("statusText");
    const isOpen = content.classList.toggle("open");
    if (isOpen && text.textContent === "Загрузка...") {
      loadProjectStatus();
    }
    chevron.style.transform = isOpen ? "rotate(180deg)" : "";
  });
}

document.addEventListener("DOMContentLoaded", initProjectStatusToggle);
