const storageKey = "ngh-admin-token";

const loginPanel = document.querySelector("#login-panel");
const dashboardPanel = document.querySelector("#dashboard-panel");
const usernameInput = document.querySelector("#admin-username");
const passwordInput = document.querySelector("#admin-password");
const loginButton = document.querySelector("#login-button");
const logoutButton = document.querySelector("#logout-button");
const refreshButton = document.querySelector("#refresh-button");
const exportButton = document.querySelector("#export-button");
const resetStatsButton = document.querySelector("#reset-stats-button");
const authMessage = document.querySelector("#auth-message");
const dashboardMessage = document.querySelector("#dashboard-message");
const dashboardTitle = document.querySelector("#dashboard-title");
const searchCount = document.querySelector("#search-count");
const totalSearches = document.querySelector("#total-searches");
const trackedWords = document.querySelector("#tracked-words");
const updatedAt = document.querySelector("#updated-at");
const statsList = document.querySelector("#stats-list");
const chartCanvas = document.querySelector("#stats-chart");
const chartContext = chartCanvas.getContext("2d");

function getToken() {
  return sessionStorage.getItem(storageKey);
}

function setToken(token) {
  sessionStorage.setItem(storageKey, token);
}

function clearToken() {
  sessionStorage.removeItem(storageKey);
}

function setAuthMessage(message, tone = "default") {
  authMessage.textContent = message;
  authMessage.dataset.tone = tone;
}

function setDashboardMessage(message, tone = "default") {
  dashboardMessage.textContent = message;
  dashboardMessage.dataset.tone = tone;
}

function showDashboard() {
  loginPanel.classList.add("hidden");
  dashboardPanel.classList.remove("hidden");
}

function showLogin() {
  dashboardPanel.classList.add("hidden");
  loginPanel.classList.remove("hidden");
}

function formatDate(value) {
  if (!value) {
    return "기록 없음";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function renderEmptyChart() {
  chartContext.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
  chartContext.fillStyle = "#6e6254";
  chartContext.font = "24px Noto Sans KR";
  chartContext.textAlign = "center";
  chartContext.fillText("아직 표시할 통계가 없습니다.", chartCanvas.width / 2, chartCanvas.height / 2);
}

function renderChart(words) {
  chartContext.clearRect(0, 0, chartCanvas.width, chartCanvas.height);

  if (!words.length) {
    renderEmptyChart();
    return;
  }

  const padding = { top: 32, right: 36, bottom: 80, left: 54 };
  const chartWidth = chartCanvas.width - padding.left - padding.right;
  const chartHeight = chartCanvas.height - padding.top - padding.bottom;
  const maxCount = Math.max(...words.map((item) => item.count), 1);
  const barWidth = chartWidth / words.length * 0.62;
  const gap = chartWidth / words.length * 0.38;

  chartContext.strokeStyle = "rgba(66, 50, 31, 0.18)";
  chartContext.lineWidth = 1;
  chartContext.beginPath();
  chartContext.moveTo(padding.left, padding.top);
  chartContext.lineTo(padding.left, padding.top + chartHeight);
  chartContext.lineTo(padding.left + chartWidth, padding.top + chartHeight);
  chartContext.stroke();

  chartContext.textAlign = "center";
  chartContext.font = "16px Space Grotesk";

  words.forEach((item, index) => {
    const step = chartWidth / words.length;
    const x = padding.left + step * index + gap / 2;
    const barHeight = chartHeight * (item.count / maxCount);
    const y = padding.top + chartHeight - barHeight;

    chartContext.fillStyle = "#c8643b";
    chartContext.fillRect(x, y, barWidth, barHeight);

    chartContext.fillStyle = "#8d4223";
    chartContext.fillText(String(item.count), x + barWidth / 2, y - 10);

    chartContext.save();
    chartContext.translate(x + barWidth / 2, padding.top + chartHeight + 28);
    chartContext.rotate(-0.28);
    chartContext.fillStyle = "#1f1a14";
    chartContext.fillText(item.word, 0, 0);
    chartContext.restore();
  });
}

function renderStatsList(words) {
  if (!words.length) {
    statsList.innerHTML = '<li class="empty-state">아직 저장된 단어 통계가 없습니다.</li>';
    return;
  }

  statsList.innerHTML = words
    .map(
      (item, index) => `
        <li class="admin-stats-item">
          <span class="word-index">${index + 1}</span>
          <div class="stats-copy">
            <p class="word-value">${item.word}</p>
            <p class="word-meta">조회 수 ${item.count}회 · 마지막 조회 ${formatDate(item.lastSearchedAt)}</p>
          </div>
        </li>
      `,
    )
    .join("");
}

async function fetchAdminStats() {
  const token = getToken();
  const response = await fetch("/api/admin/stats?limit=8", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401) {
    clearToken();
    throw new Error("unauthorized");
  }

  if (!response.ok) {
    throw new Error(`Failed to load stats: ${response.status}`);
  }

  return response.json();
}

async function downloadBackup() {
  const token = getToken();
  const response = await fetch("/api/admin/export", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401) {
    clearToken();
    throw new Error("unauthorized");
  }

  if (!response.ok) {
    throw new Error(`Failed to export stats: ${response.status}`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `word-stats-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function resetStats() {
  const token = getToken();
  const response = await fetch("/api/admin/reset", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401) {
    clearToken();
    throw new Error("unauthorized");
  }

  if (!response.ok) {
    throw new Error(`Failed to reset stats: ${response.status}`);
  }
}

function renderDashboard(data) {
  dashboardTitle.textContent = `${data.admin} 관리자 통계`;
  searchCount.textContent = `${data.totalSearches} searches`;
  totalSearches.textContent = String(data.totalSearches);
  trackedWords.textContent = String(data.trackedWords);
  updatedAt.textContent = formatDate(data.updatedAt);
  renderChart(data.words);
  renderStatsList(data.words);
  setDashboardMessage("통계를 최신 상태로 불러왔습니다.", "success");
}

async function loadDashboard() {
  try {
    dashboardTitle.textContent = "단어 통계를 불러오는 중입니다.";
    const data = await fetchAdminStats();
    renderDashboard(data);
  } catch (error) {
    if (error.message === "unauthorized") {
      showLogin();
      setAuthMessage("세션이 만료되었습니다. 다시 로그인해 주세요.", "warning");
      return;
    }

    dashboardTitle.textContent = "통계를 불러오지 못했습니다.";
    renderEmptyChart();
    statsList.innerHTML = '<li class="empty-state">통계를 불러오지 못했습니다.</li>';
    setDashboardMessage("통계 요청 중 오류가 발생했습니다.", "warning");
  }
}

loginButton.addEventListener("click", async () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username || !password) {
    setAuthMessage("아이디와 비밀번호를 모두 입력해 주세요.", "warning");
    return;
  }

  loginButton.disabled = true;
  setAuthMessage("관리자 로그인 중입니다.");

  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.message ?? "login_failed");
    }

    const data = await response.json();
    setToken(data.token);
    passwordInput.value = "";
    showDashboard();
    setDashboardMessage("로그인되었습니다. 관리자 통계를 불러옵니다.");
    await loadDashboard();
  } catch (error) {
    setAuthMessage(error.message === "login_failed" ? "관리자 로그인에 실패했습니다." : error.message, "warning");
  } finally {
    loginButton.disabled = false;
  }
});

logoutButton.addEventListener("click", async () => {
  const token = getToken();

  if (token) {
    await fetch("/api/admin/logout", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }).catch(() => {});
  }

  clearToken();
  showLogin();
  renderEmptyChart();
  setAuthMessage("로그아웃되었습니다.", "success");
  setDashboardMessage("로그아웃되어 통계 화면을 닫았습니다.");
});

refreshButton.addEventListener("click", async () => {
  refreshButton.disabled = true;
  await loadDashboard();
  refreshButton.disabled = false;
});

exportButton.addEventListener("click", async () => {
  exportButton.disabled = true;

  try {
    await downloadBackup();
    setDashboardMessage("통계 백업 파일을 다운로드했습니다.", "success");
  } catch (error) {
    if (error.message === "unauthorized") {
      showLogin();
      setAuthMessage("세션이 만료되었습니다. 다시 로그인해 주세요.", "warning");
      return;
    }

    setDashboardMessage("백업 파일 다운로드에 실패했습니다.", "warning");
  } finally {
    exportButton.disabled = false;
  }
});

resetStatsButton.addEventListener("click", async () => {
  const shouldReset = window.confirm("누적 통계를 모두 초기화할까요? 이 작업은 되돌릴 수 없습니다.");

  if (!shouldReset) {
    return;
  }

  resetStatsButton.disabled = true;

  try {
    await resetStats();
    await loadDashboard();
    setDashboardMessage("누적 통계를 초기화했습니다.", "success");
  } catch (error) {
    if (error.message === "unauthorized") {
      showLogin();
      setAuthMessage("세션이 만료되었습니다. 다시 로그인해 주세요.", "warning");
      return;
    }

    setDashboardMessage("통계 초기화에 실패했습니다.", "warning");
  } finally {
    resetStatsButton.disabled = false;
  }
});

if (getToken()) {
  showDashboard();
  setDashboardMessage("저장된 관리자 세션으로 통계를 불러옵니다.");
  loadDashboard();
} else {
  showLogin();
  renderEmptyChart();
  setDashboardMessage("관리자 로그인 후 통계를 볼 수 있습니다.");
}
