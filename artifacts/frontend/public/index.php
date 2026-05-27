<?php
if (isset($_GET['theme'])) {
    $theme = in_array($_GET['theme'], ['cyberpunk', 'glass', 'neumorphic']) ? $_GET['theme'] : 'cyberpunk';
    setcookie('afk_theme', $theme, time() + 60*60*24*365, '/');
    header('Location: /dashboard.php');
    exit;
}
$theme = isset($_COOKIE['afk_theme']) ? $_COOKIE['afk_theme'] : 'cyberpunk';
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>AFK Bot — Choose Theme</title>
<link rel="stylesheet" href="/assets/base.css">
<style>
  :root {
    --page-bg: #0a0a12;
    --text: #e0e0f0;
    --sub: #888aaa;
    --card-bg: #12121e;
    --border: #2a2a3a;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { min-height: 100vh; background: var(--page-bg); color: var(--text); font-family: 'Segoe UI', system-ui, sans-serif; }
  .page { padding: 24px 16px 40px; max-width: 480px; margin: 0 auto; }
  .header { text-align: center; margin-bottom: 32px; padding-top: 16px; }
  .header h1 { font-size: 1.6rem; font-weight: 700; letter-spacing: 0.05em; color: #c0c8ff; }
  .header p { margin-top: 8px; font-size: 0.85rem; color: var(--sub); }
  .badge { display: inline-block; background: #1e1e3a; border: 1px solid #3a3a6a; border-radius: 20px; padding: 3px 12px; font-size: 0.7rem; color: #7878cc; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 10px; }
  .theme-grid { display: flex; flex-direction: column; gap: 16px; }
  .theme-card { display: block; text-decoration: none; border-radius: 16px; overflow: hidden; border: 2px solid transparent; transition: transform 0.2s, border-color 0.2s; cursor: pointer; }
  .theme-card:active { transform: scale(0.97); }
  .card-preview { height: 140px; position: relative; overflow: hidden; }
  .card-info { padding: 14px 16px; }
  .card-name { font-size: 1rem; font-weight: 700; margin-bottom: 4px; }
  .card-desc { font-size: 0.78rem; opacity: 0.7; line-height: 1.4; }
  .card-btn { display: block; text-align: center; padding: 10px; font-size: 0.82rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; margin-top: 10px; border-radius: 8px; }

  /* Cyberpunk card */
  .theme-card.cyberpunk { background: #0d0d1a; border-color: #7c3aed44; }
  .theme-card.cyberpunk:active, .theme-card.cyberpunk:hover { border-color: #7c3aed; }
  .theme-card.cyberpunk .card-preview {
    background: #0d0d1a;
    background-image:
      repeating-linear-gradient(0deg, transparent, transparent 30px, rgba(0,255,136,0.03) 30px, rgba(0,255,136,0.03) 31px),
      repeating-linear-gradient(90deg, transparent, transparent 30px, rgba(124,58,237,0.03) 30px, rgba(124,58,237,0.03) 31px);
  }
  .cyber-ui { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: space-between; padding: 12px; }
  .cyber-bar { height: 6px; border-radius: 3px; background: linear-gradient(90deg, #7c3aed, #00ff88); opacity: 0.8; }
  .cyber-dots { display: flex; gap: 6px; align-items: center; }
  .cyber-dot { width: 8px; height: 8px; border-radius: 50%; box-shadow: 0 0 8px currentColor; }
  .cyber-dot.on { color: #00ff88; background: #00ff88; }
  .cyber-dot.off { color: #7c3aed; background: #7c3aed; }
  .cyber-lines { flex: 1; display: flex; flex-direction: column; gap: 4px; justify-content: center; padding: 8px 0; }
  .cyber-line { height: 2px; border-radius: 1px; }
  .cyber-line.g { background: rgba(0,255,136,0.5); }
  .cyber-line.p { background: rgba(124,58,237,0.5); }
  .cyber-line.short { width: 60%; }
  .cyber-line.shorter { width: 40%; }
  .theme-card.cyberpunk .card-info { background: #0d0d1a; }
  .theme-card.cyberpunk .card-name { color: #00ff88; text-shadow: 0 0 10px #00ff8866; }
  .theme-card.cyberpunk .card-desc { color: #888aaa; }
  .theme-card.cyberpunk .card-btn { background: linear-gradient(135deg, #7c3aed22, #00ff8822); border: 1px solid #00ff8855; color: #00ff88; }

  /* Glass card */
  .theme-card.glass { background: rgba(30,30,60,0.4); border-color: rgba(255,255,255,0.08); backdrop-filter: blur(12px); }
  .theme-card.glass:hover { border-color: rgba(255,255,255,0.2); }
  .theme-card.glass .card-preview {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 40%, #f64f59 100%);
  }
  .glass-ui { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 12px; }
  .glass-card-sm { background: rgba(255,255,255,0.15); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; width: 70px; height: 70px; display: flex; align-items: center; justify-content: center; }
  .glass-circle { width: 30px; height: 30px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.6); }
  .glass-rect { width: 40px; height: 4px; background: rgba(255,255,255,0.6); border-radius: 2px; }
  .theme-card.glass .card-info { background: rgba(20,20,40,0.8); backdrop-filter: blur(10px); }
  .theme-card.glass .card-name { color: #e8eaff; }
  .theme-card.glass .card-desc { color: rgba(220,222,255,0.6); }
  .theme-card.glass .card-btn { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: rgba(255,255,255,0.85); }

  /* Neumorphic card */
  .theme-card.neumorphic { background: #e0e5ec; border-color: transparent; box-shadow: 6px 6px 12px #b8bec9, -6px -6px 12px #ffffff; }
  .theme-card.neumorphic:hover { box-shadow: 8px 8px 16px #b0b8c5, -8px -8px 16px #ffffff; }
  .theme-card.neumorphic .card-preview { background: #e0e5ec; }
  .neu-ui { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 14px; }
  .neu-btn { width: 64px; height: 64px; border-radius: 16px; background: #e0e5ec; box-shadow: 5px 5px 10px #b8bec9, -5px -5px 10px #ffffff; display: flex; align-items: center; justify-content: center; }
  .neu-btn-sm { width: 44px; height: 44px; border-radius: 12px; background: #e0e5ec; box-shadow: 4px 4px 8px #b8bec9, -4px -4px 8px #ffffff; }
  .neu-btn-inner { width: 24px; height: 24px; border-radius: 50%; background: linear-gradient(135deg, #d0d5dc, #ecf0f7); box-shadow: inset 2px 2px 4px #b0b8c4, inset -2px -2px 4px #ffffff; }
  .theme-card.neumorphic .card-info { background: #e0e5ec; }
  .theme-card.neumorphic .card-name { color: #4a5568; }
  .theme-card.neumorphic .card-desc { color: #718096; }
  .theme-card.neumorphic .card-btn { background: #e0e5ec; box-shadow: 3px 3px 6px #b8bec9, -3px -3px 6px #ffffff; color: #4a5568; font-size: 0.78rem; }

  .footer { text-align: center; margin-top: 32px; font-size: 0.75rem; color: var(--sub); }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="badge">AFK Bot Runner</div>
    <h1>Choose Your Theme</h1>
    <p>Select an interface style to get started</p>
  </div>
  <div class="theme-grid">
    <!-- Cyberpunk -->
    <a class="theme-card cyberpunk" href="/?theme=cyberpunk">
      <div class="card-preview">
        <div class="cyber-ui">
          <div class="cyber-dots">
            <div class="cyber-dot on"></div>
            <div class="cyber-dot off"></div>
            <div class="cyber-dot on"></div>
          </div>
          <div class="cyber-bar"></div>
          <div class="cyber-lines">
            <div class="cyber-line g"></div>
            <div class="cyber-line p short"></div>
            <div class="cyber-line g shorter"></div>
            <div class="cyber-line p"></div>
            <div class="cyber-line g short"></div>
          </div>
        </div>
      </div>
      <div class="card-info">
        <div class="card-name">Cyberpunk Dark</div>
        <div class="card-desc">High contrast dark theme with neon purple and green accents, terminal-style logs.</div>
        <div class="card-btn">Select This Theme →</div>
      </div>
    </a>
    <!-- Glassmorphism -->
    <a class="theme-card glass" href="/?theme=glass">
      <div class="card-preview">
        <div class="glass-ui">
          <div class="glass-card-sm">
            <div class="glass-circle"></div>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <div class="glass-rect"></div>
            <div class="glass-rect" style="width:28px;opacity:0.5;"></div>
            <div class="glass-rect" style="width:36px;opacity:0.7;"></div>
          </div>
          <div class="glass-card-sm">
            <div class="glass-circle" style="width:20px;height:20px;"></div>
          </div>
        </div>
      </div>
      <div class="card-info">
        <div class="card-name">Glassmorphism</div>
        <div class="card-desc">Translucent blurry cards over a smooth gradient, thin elegant typography.</div>
        <div class="card-btn">Select This Theme →</div>
      </div>
    </a>
    <!-- Neumorphic -->
    <a class="theme-card neumorphic" href="/?theme=neumorphic">
      <div class="card-preview">
        <div class="neu-ui">
          <div class="neu-btn">
            <div class="neu-btn-inner"></div>
          </div>
          <div class="neu-btn-sm"></div>
          <div class="neu-btn-sm" style="border-radius:50%;"></div>
        </div>
      </div>
      <div class="card-info">
        <div class="card-name">Neumorphic Dashboard</div>
        <div class="card-desc">Monochromatic soft shadow design mimicking physical buttons, easy on eyes.</div>
        <div class="card-btn">Select This Theme →</div>
      </div>
    </a>
  </div>
  <div class="footer">AFK Bot Runner v1.0 &bull; Mobile-First Interface</div>
</div>
</body>
</html>
