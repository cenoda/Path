let isDragging = false;
let startX, startY;
let scrollLeft, scrollTop;
let scale = 1.0;

const grid = document.getElementById('isometric-grid');
const container = document.getElementById('world-container');
const returnBtn = document.getElementById('btn-return-home');

// 1. 드래그 스크롤 로직
container.addEventListener('mousedown', (e) => {
    isDragging = true;
    container.style.cursor = 'grabbing';
    startX = e.pageX - grid.offsetLeft;
    startY = e.pageY - grid.offsetTop;
});

window.addEventListener('mouseup', () => {
    isDragging = false;
    container.style.cursor = 'grab';
});

window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const x = e.pageX - startX;
    const y = e.pageY - startY;
    grid.style.left = `${x}px`;
    grid.style.top = `${y}px`;

    // 홈에서 멀어지면 복귀 버튼 표시 (간단한 거리 계산)
    const dist = Math.sqrt(Math.pow(x + 2000, 2) + Math.pow(y + 2000, 2));
    if (dist > 500) returnBtn.classList.remove('hidden');
    else returnBtn.classList.add('hidden');
});

// 2. 확대/축소 (줌)
container.addEventListener('wheel', (e) => {
    e.preventDefault();
    scale += e.deltaY * -0.001;
    scale = Math.min(Math.max(0.5, scale), 2); // 0.5배 ~ 2배 제한
    grid.style.transform = `rotateX(60deg) rotateZ(45deg) scale(${scale})`;
});

// 3. 홈 복귀 함수
function returnToHome() {
    grid.style.transition = "all 0.5s ease-in-out";
    grid.style.left = "-2000px";
    grid.style.top = "-2000px";
    setTimeout(() => { grid.style.transition = "none"; }, 500);
    returnBtn.classList.add('hidden');
}

// 4. 페이지 전환
function goToTimer() {
    // 실제 경로에 맞춰 수정
    window.location.href = "../mainPageDev/index.html";
}

function enterCastle() {
    alert("성 내부로 진입합니다. (세금 징수/펫 관리 화면 준비 중)");
}
