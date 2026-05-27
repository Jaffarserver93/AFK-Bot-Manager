<?php
$apiBase = '/api';
?>
<!DOCTYPE html>
<html lang="en" class="theme-glass">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>AFK Bot — Dashboard</title>
<link rel="stylesheet" href="/assets/base.css">
<link rel="stylesheet" href="/assets/glass.css">
<script>window.API_BASE = '<?php echo $apiBase; ?>';</script>
</head>
<body>
<div class="app-container">
  <!-- Top Nav -->
  <nav class="top-nav">
    <div class="nav-logo">
      <div class="status-dot" id="statusDot"></div>
      <span class="nav-title">AFK Bot</span>
    </div>
    <div class="uptime-display" id="uptimeDisplay">00:00:00</div>
  </nav>

  <div class="page-content">
    <!-- Status Card -->
    <div class="section-card status-card">
      <div class="status-row">
        <div class="status-info">
          <div class="status-label">Status</div>
          <div class="status-value" id="statusText">Idle</div>
        </div>
        <div class="status-indicator" id="statusIndicator">
          <div class="status-dot-lg" id="statusDotLg"></div>
        </div>
      </div>
      <div class="action-buttons">
        <button class="btn btn-action" id="toggleBtn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" id="toggleIcon"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          <span id="toggleLabel">Start Bot</span>
        </button>
        <button class="btn btn-restart" id="restartBtn" disabled>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
          <span>Restart</span>
        </button>
      </div>
    </div>

    <!-- Live Preview -->
    <div class="section-card preview-card">
      <div class="section-header">
        <div class="section-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
        </div>
        <div class="section-title">Live Preview</div>
        <div class="preview-interval" id="intervalBadge">1000ms</div>
      </div>
      <div class="preview-frame" id="previewFrame">
        <div class="preview-placeholder" id="previewPlaceholder">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
          <p>Bot not running</p>
          <span>Start the bot to see live preview</span>
        </div>
        <img id="screenshotImg" src="" alt="Live Screenshot" style="display:none; width:100%; border-radius:8px;" loading="eager">
        <div class="preview-overlay" id="previewOverlay" style="display:none;">
          <div class="preview-loading">Loading...</div>
        </div>
      </div>
    </div>

    <!-- Audit Log Terminal -->
    <div class="section-card log-card">
      <div class="section-header">
        <div class="section-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
        </div>
        <div class="section-title">Audit Logs</div>
        <button class="clear-logs-btn" id="clearLogsBtn" title="Clear logs">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
        </button>
      </div>
      <div class="log-terminal" id="logTerminal">
        <div class="log-empty" id="logEmpty">No logs yet. Start the bot to begin.</div>
      </div>
    </div>
  </div>

  <!-- Bottom Nav -->
  <nav class="bottom-nav">
    <a href="/dashboard.php" class="bottom-nav-item active">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
      <span>Dashboard</span>
    </a>
    <a href="/config.php" class="bottom-nav-item">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
      <span>Config</span>
    </a>
  </nav>
</div>

<script>
const API = window.API_BASE;
let botStatus = 'idle';
let screenshotInterval = 1000;
let screenshotTimer = null;
let uptimeInterval = null;
let sseSource = null;
let uptimeSeconds = 0;

// ===== Status polling =====
async function pollStatus() {
  try {
    const r = await fetch(API + '/bot/status');
    const d = await r.json();
    updateUI(d.status, d.uptimeSeconds || 0);
  } catch(e) {}
}

function updateUI(status, uptime) {
  botStatus = status;
  uptimeSeconds = uptime;
  const dot = document.getElementById('statusDot');
  const dotLg = document.getElementById('statusDotLg');
  const statusText = document.getElementById('statusText');
  const toggleBtn = document.getElementById('toggleBtn');
  const toggleIcon = document.getElementById('toggleIcon');
  const toggleLabel = document.getElementById('toggleLabel');
  const restartBtn = document.getElementById('restartBtn');

  if (status === 'running') {
    dot.className = 'status-dot running';
    dotLg.className = 'status-dot-lg running';
    statusText.textContent = 'Running';
    toggleIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    toggleLabel.textContent = 'Stop Bot';
    toggleBtn.className = 'btn btn-action btn-stop';
    restartBtn.disabled = false;
    startScreenshotUpdates();
  } else if (status === 'starting') {
    dot.className = 'status-dot starting';
    dotLg.className = 'status-dot-lg starting';
    statusText.textContent = 'Starting...';
    toggleBtn.disabled = true;
    restartBtn.disabled = true;
    startScreenshotUpdates();
  } else if (status === 'stopping') {
    dot.className = 'status-dot stopping';
    dotLg.className = 'status-dot-lg stopping';
    statusText.textContent = 'Stopping...';
    toggleBtn.disabled = true;
    restartBtn.disabled = true;
  } else {
    dot.className = 'status-dot';
    dotLg.className = 'status-dot-lg';
    statusText.textContent = 'Idle';
    toggleIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
    toggleLabel.textContent = 'Start Bot';
    toggleBtn.className = 'btn btn-action';
    toggleBtn.disabled = false;
    restartBtn.disabled = true;
    stopScreenshotUpdates();
    document.getElementById('screenshotImg').style.display = 'none';
    document.getElementById('previewPlaceholder').style.display = 'flex';
  }
  updateUptimeDisplay(uptime);
}

function updateUptimeDisplay(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  document.getElementById('uptimeDisplay').textContent =
    String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(sec).padStart(2,'0');
}

// Local uptime tick
setInterval(() => {
  if (botStatus === 'running') {
    uptimeSeconds++;
    updateUptimeDisplay(uptimeSeconds);
  }
}, 1000);

// ===== Screenshot =====
function startScreenshotUpdates() {
  if (screenshotTimer) return;
  screenshotTimer = setInterval(fetchScreenshot, screenshotInterval);
  fetchScreenshot();
}

function stopScreenshotUpdates() {
  if (screenshotTimer) { clearInterval(screenshotTimer); screenshotTimer = null; }
}

function fetchScreenshot() {
  if (botStatus !== 'running' && botStatus !== 'starting') return;
  const img = document.getElementById('screenshotImg');
  const ph = document.getElementById('previewPlaceholder');
  const ts = Date.now();
  const newImg = new Image();
  newImg.onload = function() {
    img.src = this.src;
    img.style.display = 'block';
    ph.style.display = 'none';
  };
  newImg.onerror = function() {};
  newImg.src = API + '/bot/screenshot?t=' + ts;
}

// ===== SSE Logs =====
function startSSE() {
  if (sseSource) return;
  const logTerminal = document.getElementById('logTerminal');
  const logEmpty = document.getElementById('logEmpty');
  sseSource = new EventSource(API + '/bot/logs/stream');
  sseSource.onmessage = function(e) {
    try {
      const entry = JSON.parse(e.data);
      logEmpty.style.display = 'none';
      const line = document.createElement('div');
      line.className = 'log-line log-' + (entry.level || 'info');
      const t = new Date(entry.time);
      const ts = t.toLocaleTimeString('en-US', {hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit'});
      line.innerHTML = '<span class="log-ts">[' + ts + ']</span><span class="log-msg">' + escHtml(entry.message) + '</span>';
      logTerminal.appendChild(line);
      if (logTerminal.children.length > 200) logTerminal.removeChild(logTerminal.children[1]);
      logTerminal.scrollTop = logTerminal.scrollHeight;
    } catch(err) {}
  };
  sseSource.onerror = function() {
    if (sseSource) { sseSource.close(); sseSource = null; }
    setTimeout(startSSE, 3000);
  };
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== Controls =====
document.getElementById('toggleBtn').addEventListener('click', async function() {
  const btn = this;
  btn.disabled = true;
  const action = botStatus === 'running' ? 'stop' : 'start';
  try {
    await fetch(API + '/bot/' + action, { method: 'POST' });
    if (action === 'start') {
      updateUI('starting', 0);
    } else {
      updateUI('stopping', 0);
    }
    setTimeout(pollStatus, 1000);
  } catch(e) {}
  setTimeout(() => { btn.disabled = false; }, 2000);
});

document.getElementById('restartBtn').addEventListener('click', async function() {
  const btn = this;
  btn.disabled = true;
  try {
    await fetch(API + '/bot/restart', { method: 'POST' });
    updateUI('starting', 0);
    addLog({time: new Date().toISOString(), message: 'Restart requested...', level: 'info'});
    setTimeout(pollStatus, 2000);
  } catch(e) {}
  setTimeout(() => { btn.disabled = false; }, 3000);
});

document.getElementById('clearLogsBtn').addEventListener('click', function() {
  const lt = document.getElementById('logTerminal');
  while (lt.children.length > 1) lt.removeChild(lt.lastChild);
  document.getElementById('logEmpty').style.display = 'block';
});

function addLog(entry) {
  const logTerminal = document.getElementById('logTerminal');
  const logEmpty = document.getElementById('logEmpty');
  logEmpty.style.display = 'none';
  const line = document.createElement('div');
  line.className = 'log-line log-' + (entry.level || 'info');
  const t = new Date(entry.time);
  const ts = t.toLocaleTimeString('en-US', {hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit'});
  line.innerHTML = '<span class="log-ts">[' + ts + ']</span><span class="log-msg">' + escHtml(entry.message) + '</span>';
  logTerminal.appendChild(line);
  logTerminal.scrollTop = logTerminal.scrollHeight;
}

// ===== Load config for interval =====
async function loadInterval() {
  try {
    const r = await fetch(API + '/config');
    const d = await r.json();
    screenshotInterval = Math.max(100, d.screenshotInterval || 1000);
    document.getElementById('intervalBadge').textContent = screenshotInterval + 'ms';
    if (screenshotTimer) {
      clearInterval(screenshotTimer);
      screenshotTimer = null;
      if (botStatus === 'running') startScreenshotUpdates();
    }
  } catch(e) {}
}

// ===== Init =====
pollStatus();
setInterval(pollStatus, 5000);
startSSE();
loadInterval();
</script>
</body>
</html>
