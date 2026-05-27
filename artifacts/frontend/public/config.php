<?php
$proto = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'];
$apiBase = $proto . '://' . $host . '/api';
?>
<!DOCTYPE html>
<html lang="en" class="theme-glass">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>AFK Bot — Configuration</title>
<link rel="stylesheet" href="/assets/base.css">
<link rel="stylesheet" href="/assets/glass.css">
<script>window.API_BASE = '<?php echo $apiBase; ?>';</script>
</head>
<body>
<div class="app-container">
  <!-- Top Nav -->
  <nav class="top-nav">
    <a href="/dashboard.php" class="nav-back">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
    </a>
    <div class="nav-title">Configuration</div>
    <div style="width:36px;"></div>
  </nav>

  <div class="page-content">
    <!-- Toast notification -->
    <div id="toast" class="toast" style="display:none;"></div>

    <!-- Login Section -->
    <div class="section-card">
      <div class="section-header">
        <div class="section-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>
        </div>
        <div>
          <div class="section-title">Login Settings</div>
          <div class="section-sub">URLs and authentication</div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Login URL</label>
        <input type="url" id="loginUrl" class="form-input" placeholder="https://..." value="">
      </div>
      <div class="form-group">
        <label class="form-label">Target URL</label>
        <input type="url" id="targetUrl" class="form-input" placeholder="https://..." value="">
      </div>
      <div class="form-group">
        <label class="form-label">Username / Email</label>
        <input type="text" id="username" class="form-input" placeholder="your@email.com" value="" autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label">Password</label>
        <div class="input-pw-wrap">
          <input type="password" id="password" class="form-input" placeholder="••••••••" autocomplete="new-password">
          <button type="button" class="pw-toggle" id="pwToggle" aria-label="Toggle password">
            <svg id="pwEye" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
      </div>
      <button class="btn btn-primary btn-full" id="saveCredentials">Save Credentials</button>
    </div>

    <!-- Screenshot Interval -->
    <div class="section-card">
      <div class="section-header">
        <div class="section-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
        </div>
        <div>
          <div class="section-title">Screenshot Interval</div>
          <div class="section-sub">Live preview refresh rate</div>
        </div>
      </div>
      <div class="form-group">
        <div class="slider-header">
          <label class="form-label">Interval</label>
          <span class="slider-value" id="intervalDisplay">1000 ms</span>
        </div>
        <input type="range" id="screenshotInterval" class="form-slider" min="100" max="5000" step="100" value="1000">
        <div class="slider-labels">
          <span>100ms (fastest)</span>
          <span>5000ms</span>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Or enter exact value (ms)</label>
        <input type="number" id="intervalExact" class="form-input" min="100" max="60000" step="100" value="1000" placeholder="100–60000">
      </div>
      <button class="btn btn-secondary btn-full" id="saveConfig">Save Settings</button>
    </div>

  </div>

  <!-- Bottom Nav -->
  <nav class="bottom-nav">
    <a href="/dashboard.php" class="bottom-nav-item">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
      <span>Dashboard</span>
    </a>
    <a href="/config.php" class="bottom-nav-item active">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
      <span>Config</span>
    </a>
  </nav>
</div>

<script>
const API = window.API_BASE;

function showToast(msg, ok) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + (ok ? 'toast-ok' : 'toast-err');
  t.style.display = 'block';
  setTimeout(() => { t.style.display = 'none'; }, 2800);
}

async function loadCredentials() {
  try {
    const r = await fetch(API + '/credentials');
    const d = await r.json();
    document.getElementById('loginUrl').value = d.loginUrl || '';
    document.getElementById('targetUrl').value = d.targetUrl || '';
    document.getElementById('username').value = d.username || '';
    document.getElementById('password').value = d.password || '';
  } catch(e) {}
}

async function loadConfig() {
  try {
    const r = await fetch(API + '/config');
    const d = await r.json();
    const iv = d.screenshotInterval || 1000;
    document.getElementById('screenshotInterval').value = iv;
    document.getElementById('intervalExact').value = iv;
    document.getElementById('intervalDisplay').textContent = iv + ' ms';
  } catch(e) {}
}

document.getElementById('screenshotInterval').addEventListener('input', function() {
  const v = parseInt(this.value);
  document.getElementById('intervalDisplay').textContent = v + ' ms';
  document.getElementById('intervalExact').value = v;
});
document.getElementById('intervalExact').addEventListener('input', function() {
  const v = Math.max(100, parseInt(this.value) || 100);
  if (v <= 5000) document.getElementById('screenshotInterval').value = v;
  document.getElementById('intervalDisplay').textContent = v + ' ms';
});

document.getElementById('pwToggle').addEventListener('click', function() {
  const inp = document.getElementById('password');
  inp.type = inp.type === 'password' ? 'text' : 'password';
});

document.getElementById('saveCredentials').addEventListener('click', async function() {
  const btn = this;
  btn.disabled = true;
  btn.textContent = 'Saving...';
  try {
    const body = {
      loginUrl: document.getElementById('loginUrl').value,
      targetUrl: document.getElementById('targetUrl').value,
      username: document.getElementById('username').value,
      password: document.getElementById('password').value,
    };
    const r = await fetch(API + '/credentials', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const d = await r.json();
    if (d.ok) showToast('Credentials saved!', true);
    else showToast('Failed to save.', false);
  } catch(e) {
    showToast('Network error.', false);
  }
  btn.disabled = false;
  btn.textContent = 'Save Credentials';
});

document.getElementById('saveConfig').addEventListener('click', async function() {
  const btn = this;
  btn.disabled = true;
  btn.textContent = 'Saving...';
  try {
    const screenshotInterval = parseInt(document.getElementById('intervalExact').value) || 1000;
    const body = { screenshotInterval: Math.max(100, screenshotInterval) };
    const r = await fetch(API + '/config', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const d = await r.json();
    if (d.ok) showToast('Settings saved!', true);
    else showToast('Failed to save.', false);
  } catch(e) {
    showToast('Network error.', false);
  }
  btn.disabled = false;
  btn.textContent = 'Save Settings';
});

loadCredentials();
loadConfig();
</script>
</body>
</html>
