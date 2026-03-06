import os

html_content = """<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>P.A.T.H - Command Center</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>

    <!-- UI Overlay Layer -->
    <div id="ui-layer">
        
        <!-- Header: Profile & Status -->
        <header id="hud-header">
            <div class="hud-group left">
                <div class="profile-badge" id="badge-char">U</div>
                <div class="profile-meta">
                    <div class="univ-name" id="hud-univ">YONSEI UNIV.</div>
                    <div class="rank-stat" id="hud-pct">TOP 0.00%</div>
                </div>
            </div>

            <!-- Central Command / Search -->
            <div class="hud-group center">
                <div class="search-wrapper">
                    <span class="search-icon">⌕</span>
                    <input type="text" id="global-search" placeholder="SEARCH UNIVERSITY / USER" oninput="onSearch(this.value)">
                </div>
            </div>

            <div class="hud-group right">
                <div class="resource-pill">
                    <span class="label">GOLD</span>
                    <span class="value" id="hud-gold">0</span>
                </div>
                <div class="resource-pill">
                    <span class="label">TIME</span>
                    <span class="value" id="hud-hours">00:00</span>
                </div>
                <!-- <div class="resource-pill">
                    <span class="label">TICKET</span>
                    <span class="value" id="hud-tickets">0</span>
                </div> -->
                
                <div class="action-group">
                    <button class="btn-icon" onclick="togglePanel('panel-notif')" title="NOTIFICATIONS">
                        NOTIF <span class="badge-dot hidden" id="notif-badge"></span>
                    </button>
                    <button class="btn-icon" onclick="doLogout()" title="SETTINGS">
                        SYS
                    </button>
                </div>
            </div>
        </header>

        <!-- Navigation / Map Controls (Floating) -->
        <div id="hud-controls">
            <div class="d-pad">
                <button onclick="panMap(0, 150)">▲</button>
                <div class="d-pad-mid">
                    <button onclick="panMap(150, 0)">◀</button>
                    <button onclick="panMap(-150, 0)">▶</button>
                </div>
                <button onclick="panMap(0, -150)">▼</button>
            </div>
            <button class="location-reset" onclick="centerMap()">◎</button>
        </div>

    </div>

    <!-- World Map Container -->
    <div id="world-container">
        <div id="map-grid"></div> <!-- Decorative Grid -->
        <div id="map-layer">
            <!-- Buildings are dynamically placed here -->
            <div class="building" id="my-castle" onclick="openEstate()">
                <div class="building-marker"></div>
                <div class="building-icon">
                    <img id="my-castle-img" src="/assets/castle_main.png" alt="Estate">
                </div>
                <div class="building-info">
                    <span class="b-type">ESTATE</span>
                    <span class="b-name" id="my-castle-label">MY DOMAIN</span>
                </div>
            </div>
        </div>
    </div>

    <!-- Modals & Panels (Hidden by default) -->
    <div id="overlay-root"></div>

    <script src="main.js"></script>
</body>
</html>"""

css_content = """/* Modern Tactical Dark UI */
:root {
    --bg-color: #050505;
    --surface-color: rgba(20, 20, 20, 0.85);
    --surface-hover: rgba(30, 30, 30, 0.95);
    --border-color: rgba(255, 255, 255, 0.1);
    --accent-gold: #D4AF37;
    --accent-red: #FF3B30;
    --text-primary: #F5F5F7;
    --text-secondary: #86868B;
    --font-ui: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    --font-mono: "SF Mono", "Monaco", "Inconsolata", "Fira Mono", "Droid Sans Mono", "Source Code Pro", monospace;
    
    --header-height: 60px;
    --blur-amt: 20px;
}

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    -webkit-font-smoothing: antialiased;
}

html, body {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    background-color: var(--bg-color);
    color: var(--text-primary);
    font-family: var(--font-ui);
    user-select: none;
}

/* --- UI Layer (HUD) --- */
#ui-layer {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 100;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
}

#ui-layer > * {
    pointer-events: auto;
}

/* Header */
#hud-header {
    width: 100%;
    height: var(--header-height);
    background: rgba(5, 5, 5, 0.7);
    backdrop-filter: blur(var(--blur-amt));
    -webkit-backdrop-filter: blur(var(--blur-amt));
    border-bottom: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
}

.hud-group {
    display: flex;
    align-items: center;
    gap: 16px;
}

.hud-group.left { flex: 1; justify-content: flex-start; }
.hud-group.center { flex: 2; justify-content: center; }
.hud-group.right { flex: 1; justify-content: flex-end; }

/* Profile Area */
.profile-badge {
    width: 32px;
    height: 32px;
    background: #222;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 700;
    color: var(--text-secondary);
}

.profile-meta {
    display: flex;
    flex-direction: column;
    justify-content: center;
    line-height: 1.2;
}

.univ-name {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.5px;
    color: var(--text-primary);
    text-transform: uppercase;
}

.rank-stat {
    font-size: 11px;
    color: var(--accent-gold);
    font-family: var(--font-mono);
}

/* Search Area */
.search-wrapper {
    position: relative;
    width: 100%;
    max-width: 400px;
}

.search-icon {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-secondary);
    font-size: 14px;
}

#global-search {
    width: 100%;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 10px 12px 10px 36px;
    color: var(--text-primary);
    font-size: 12px;
    font-family: var(--font-mono);
    text-transform: uppercase;
    transition: all 0.2s ease;
}

#global-search:focus {
    background: rgba(255, 255, 255, 0.08);
    border-color: var(--accent-gold);
    outline: none;
}

#global-search::placeholder {
    color: #444;
}

/* Resources & Actions */
.resource-pill {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border-color);
    border-radius: 4px;
}

.resource-pill .label {
    font-size: 10px;
    color: var(--text-secondary);
    font-weight: 700;
    letter-spacing: 1px;
}

.resource-pill .value {
    font-size: 12px;
    font-family: var(--font-mono);
    color: var(--accent-gold);
}

.action-group {
    display: flex;
    gap: 8px;
    margin-left: 16px;
    padding-left: 16px;
    border-left: 1px solid var(--border-color);
}

.btn-icon {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    padding: 6px 8px;
    transition: color 0.2s;
    position: relative;
}

.btn-icon:hover {
    color: var(--text-primary);
}

.badge-dot {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 6px;
    height: 6px;
    background-color: var(--accent-red);
    border-radius: 50%;
}

.hidden { display: none; }

/* --- Map Controls --- */
#hud-controls {
    position: absolute;
    bottom: 32px;
    right: 32px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
}

.d-pad {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    background: rgba(5,5,5,0.5);
    padding: 8px;
    border-radius: 50%;
    backdrop-filter: blur(10px);
    border: 1px solid var(--border-color);
}

.d-pad button {
    width: 32px;
    height: 32px;
    background: rgba(255,255,255,0.05);
    border: 1px solid var(--border-color);
    color: var(--text-secondary);
    border-radius: 4px;
    cursor: pointer;
    font-size: 10px;
    display: flex; align-items: center; justify-content: center;
}

.d-pad button:hover {
    background: rgba(255,255,255,0.1);
    color: var(--text-primary);
}

.d-pad-mid { display: flex; gap: 4px; }

.location-reset {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--surface-color);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    font-size: 16px;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.2s;
}

.location-reset:hover {
    border-color: var(--accent-gold);
    color: var(--accent-gold);
}

/* --- World Map --- */
#world-container {
    width: 100vw;
    height: 100vh;
    position: fixed;
    top: 0; left: 0;
    z-index: 1;
    background-color: #080808;
    background-image: 
        linear-gradient(var(--border-color) 1px, transparent 1px),
        linear-gradient(90deg, var(--border-color) 1px, transparent 1px);
    background-size: 100px 100px;
}

#map-layer {
    position: absolute;
    width: 4000px;
    height: 4000px;
    top: -1500px;
    left: -1500px;
}

/* Buildings */
.building {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    cursor: pointer;
    transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    z-index: 10;
}

.building:hover {
    transform: scale(1.1) translateY(-5px);
    z-index: 20;
}

.building-marker {
    width: 8px;
    height: 8px;
    background: var(--accent-gold);
    border-radius: 50%;
    box-shadow: 0 0 10px var(--accent-gold);
    margin-bottom: 8px;
    opacity: 0;
    transition: opacity 0.3s;
}

.building:hover .building-marker { opacity: 1; }

.building-icon img {
    display: block;
    width: 120px;
    filter: drop-shadow(0 10px 20px rgba(0,0,0,0.5));
}

#my-castle img { width: 200px; }

.building-info {
    position: absolute;
    bottom: -30px;
    background: rgba(0,0,0,0.8);
    border: 1px solid var(--border-color);
    padding: 6px 12px;
    border-radius: 4px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    backdrop-filter: blur(4px);
    pointer-events: none;
    transition: all 0.3s;
    opacity: 0.7;
}

.building:hover .building-info {
    opacity: 1;
    border-color: var(--accent-gold);
    transform: translateY(5px);
}

.b-type {
    font-size: 8px;
    letter-spacing: 2px;
    color: var(--text-secondary);
    text-transform: uppercase;
}

.b-name {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-primary);
    letter-spacing: 0.5px;
}

@keyframes pulse {
    0% { box-shadow: 0 0 0 0 rgba(212, 175, 55, 0.4); }
    70% { box-shadow: 0 0 0 10px rgba(212, 175, 55, 0); }
    100% { box-shadow: 0 0 0 0 rgba(212, 175, 55, 0); }
}

#my-castle .building-marker {
    opacity: 1;
    animation: pulse 2s infinite;
}
"""

with open("P.A.T.H/mainHub/index.html", "w") as f:
    f.write(html_content)

with open("P.A.T.H/mainHub/style.css", "w") as f:
    f.write(css_content)

print("Files updated.")
