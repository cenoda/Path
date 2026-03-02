let isDragging = false;
let startX, startY;
let scale = 1.0;

const grid = document.getElementById('isometric-grid');
const container = document.getElementById('world-container');
const returnBtn = document.getElementById('btn-return-home');

let currentUser = null;

async function initHub() {
    try {
        const r = await fetch('/api/auth/me', { credentials: 'include' });
        if (!r.ok) {
            window.location.href = '/P.A.T.H/login/index.html';
            return;
        }
        const data = await r.json();
        currentUser = data.user;

        document.getElementById('gold-txt').textContent = currentUser.gold.toLocaleString();
        document.getElementById('exp-txt').textContent = currentUser.exp.toLocaleString();
        document.getElementById('tier-txt').textContent = currentUser.tier;

        const myHome = document.getElementById('my-home');
        if (myHome) {
            const label = myHome.querySelector('.building-label');
            if (label) label.textContent = currentUser.university + ' 성채';
        }

        loadRanking();
    } catch (e) {
        console.error('initHub 오류:', e);
    }
}

async function loadRanking() {
    try {
        const r = await fetch('/api/ranking', { credentials: 'include' });
        if (!r.ok) return;
        const data = await r.json();

        const myRankData = await fetch('/api/ranking/me', { credentials: 'include' });
        if (myRankData.ok) {
            const rankInfo = await myRankData.json();
            document.getElementById('tier-txt').textContent =
                `${currentUser.tier} (${rankInfo.pct}%)`;
        }

        renderOtherUsers(data.ranking);
    } catch (e) {
        console.error('랭킹 로드 오류:', e);
    }
}

function renderOtherUsers(ranking) {
    const existingHuts = document.querySelectorAll('.hut');
    existingHuts.forEach(h => h.remove());

    const others = ranking.filter(u => u.id !== currentUser?.id).slice(0, 8);
    const positions = [
        { top: 2200, left: 2800 }, { top: 2800, left: 2200 },
        { top: 2000, left: 2600 }, { top: 2600, left: 2000 },
        { top: 3000, left: 2700 }, { top: 2700, left: 3000 },
        { top: 2300, left: 2400 }, { top: 2400, left: 2300 }
    ];

    others.forEach((user, i) => {
        const pos = positions[i] || { top: 2500 + (i * 100), left: 2500 - (i * 80) };
        const hut = document.createElement('div');
        hut.className = 'entity hut';
        hut.style.top = pos.top + 'px';
        hut.style.left = pos.left + 'px';
        hut.title = `${user.nickname} (${user.university}) - ${user.tier}`;
        hut.onclick = () => alert(`${user.nickname}\n${user.university}\n티어: ${user.tier}\nEXP: ${user.exp.toLocaleString()}`);

        const label = document.createElement('div');
        label.className = 'building-label';
        label.style.fontSize = '11px';
        label.textContent = user.nickname;
        hut.appendChild(label);

        grid.appendChild(hut);
    });
}

container.addEventListener('mousedown', (e) => {
    isDragging = true;
    container.style.cursor = 'grabbing';
    startX = e.pageX - parseInt(grid.style.left || -2000);
    startY = e.pageY - parseInt(grid.style.top || -2000);
});

container.addEventListener('touchstart', (e) => {
    isDragging = true;
    const touch = e.touches[0];
    startX = touch.pageX - parseInt(grid.style.left || -2000);
    startY = touch.pageY - parseInt(grid.style.top || -2000);
}, { passive: true });

window.addEventListener('mouseup', () => {
    isDragging = false;
    container.style.cursor = 'grab';
});

window.addEventListener('touchend', () => { isDragging = false; });

window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const x = e.pageX - startX;
    const y = e.pageY - startY;
    grid.style.left = `${x}px`;
    grid.style.top = `${y}px`;

    const dist = Math.sqrt(Math.pow(x + 2000, 2) + Math.pow(y + 2000, 2));
    if (dist > 500) returnBtn.classList.remove('hidden');
    else returnBtn.classList.add('hidden');
});

window.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    const x = touch.pageX - startX;
    const y = touch.pageY - startY;
    grid.style.left = `${x}px`;
    grid.style.top = `${y}px`;
}, { passive: true });

container.addEventListener('wheel', (e) => {
    e.preventDefault();
    scale += e.deltaY * -0.001;
    scale = Math.min(Math.max(0.5, scale), 2);
    grid.style.transform = `rotateX(60deg) rotateZ(45deg) scale(${scale})`;
});

function returnToHome() {
    grid.style.transition = "all 0.5s ease-in-out";
    grid.style.left = "-2000px";
    grid.style.top = "-2000px";
    setTimeout(() => { grid.style.transition = "none"; }, 500);
    returnBtn.classList.add('hidden');
}

function goToTimer() {
    window.location.href = '/P.A.T.H/mainPageDev/index.html';
}

function enterCastle() {
    alert("성 내부로 진입합니다. (세금 징수/펫 관리 화면 준비 중)");
}

async function doLogout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/P.A.T.H/login/index.html';
}

initHub();
