const BG = {
    canvas: null,
    ctx: null,
    stars: [],
    shootingStars: [],
    city: [],
    quality: null,
    t: 0,
    topPct: 100,

    init(topPct) {
        this.topPct = parseFloat(topPct) || 100;
        this.canvas = document.getElementById('bg-canvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.quality = this.getQuality();
        this.resize();
        this.generate();
        this.loop();
        window.addEventListener('resize', () => {
            this.resize();
            this.generate();
        });
        this.applyBuildingGlow();
    },

    getQuality() {
        const p = this.topPct;
        if (p <= 1)  return { stars: 1100, maxOp: 1.0,  aurora: true,  shooting: true,  city: 0.95, bgTop: [8,5,30],  bgMid: [5,3,20]  };
        if (p <= 5)  return { stars: 750,  maxOp: 0.88, aurora: false, shooting: true,  city: 0.8,  bgTop: [6,5,22],  bgMid: [4,3,14]  };
        if (p <= 15) return { stars: 480,  maxOp: 0.7,  aurora: false, shooting: true,  city: 0.6,  bgTop: [5,5,16],  bgMid: [3,3,10]  };
        if (p <= 30) return { stars: 280,  maxOp: 0.5,  aurora: false, shooting: false, city: 0.4,  bgTop: [5,5,10],  bgMid: [3,3,6]   };
        if (p <= 60) return { stars: 120,  maxOp: 0.32, aurora: false, shooting: false, city: 0.22, bgTop: [5,5,6],   bgMid: [3,3,3]   };
        return             { stars: 45,   maxOp: 0.18, aurora: false, shooting: false, city: 0.1,  bgTop: [5,5,5],   bgMid: [3,3,3]   };
    },

    resize() {
        this.canvas.width  = window.innerWidth;
        this.canvas.height = window.innerHeight;
    },

    generate() {
        const W = this.canvas.width;
        const H = this.canvas.height;
        const q = this.quality;

        this.stars = Array.from({ length: q.stars }, () => {
            const big = Math.random() < 0.06;
            return {
                x: Math.random() * W,
                y: Math.random() * H * 0.82,
                r: big ? (Math.random() * 1.8 + 1.2) : (Math.random() * 0.9 + 0.2),
                op: Math.random() * q.maxOp * 0.5 + q.maxOp * 0.35,
                ts: Math.random() * 0.018 + 0.004,
                to: Math.random() * Math.PI * 2,
                color: Math.random() < 0.08 ? '#ffeebb'
                     : Math.random() < 0.05 ? '#aaccff'
                     : '#ffffff'
            };
        });

        this.city = [];
        let x = -10;
        while (x < W + 100) {
            const w = 18 + Math.random() * 55;
            const h = 25 + Math.random() * H * 0.28;
            this.city.push({ x: Math.round(x), w: Math.round(w), h: Math.round(h) });
            x += w + Math.random() * 6 + 1;
        }
        this.shootingStars = [];
    },

    drawBg() {
        const W = this.canvas.width;
        const H = this.canvas.height;
        const q = this.quality;
        const [r1, g1, b1] = q.bgTop;
        const [r2, g2, b2] = q.bgMid;
        const grad = this.ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0,   `rgb(${r1},${g1},${b1})`);
        grad.addColorStop(0.5, `rgb(${r2},${g2},${b2})`);
        grad.addColorStop(1,   `rgb(2,2,3)`);
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(0, 0, W, H);
    },

    drawAurora() {
        const W = this.canvas.width;
        const H = this.canvas.height;
        const ctx = this.ctx;
        const t = this.t;
        const bands = [
            { c: '80,40,180', yBase: 0.18, amp: 45, speed: 0.25 },
            { c: '40,60,210', yBase: 0.26, amp: 35, speed: 0.38 },
            { c: '120,30,160', yBase: 0.14, amp: 55, speed: 0.18 }
        ];
        bands.forEach(({ c, yBase, amp, speed }, i) => {
            const grad = ctx.createLinearGradient(0, H * (yBase - 0.06), 0, H * (yBase + 0.28));
            grad.addColorStop(0,   `rgba(${c},0)`);
            grad.addColorStop(0.4, `rgba(${c},0.09)`);
            grad.addColorStop(1,   `rgba(${c},0)`);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(0, H * yBase);
            const segs = 12;
            for (let s = 0; s <= segs; s++) {
                const px = (s / segs) * W;
                const wave = Math.sin(px * 0.003 + t * speed + i * 1.4) * amp
                           + Math.sin(px * 0.006 + t * speed * 0.6 + i) * (amp * 0.4);
                ctx.lineTo(px, H * yBase + wave);
            }
            ctx.lineTo(W, H * 0.6);
            ctx.lineTo(0, H * 0.6);
            ctx.closePath();
            ctx.fill();
        });
    },

    drawStars() {
        const t = this.t;
        const ctx = this.ctx;
        this.stars.forEach(s => {
            const twinkle = Math.sin(t * s.ts * 60 + s.to) * 0.28 + 0.72;
            ctx.globalAlpha = s.op * twinkle;
            ctx.fillStyle = s.color;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1;
    },

    maybeShoot() {
        if (this.shootingStars.length < 3 && Math.random() < 0.0025) {
            const W = this.canvas.width;
            const H = this.canvas.height;
            const angle = (Math.random() * 20 + 20) * Math.PI / 180;
            const speed = 5 + Math.random() * 4;
            this.shootingStars.push({
                x: Math.random() * W * 0.75 + W * 0.05,
                y: Math.random() * H * 0.35 + H * 0.03,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                maxLen: 80 + Math.random() * 60
            });
        }
    },

    drawShootingStars() {
        const ctx = this.ctx;
        this.shootingStars = this.shootingStars.filter(s => s.life > 0);
        this.shootingStars.forEach(s => {
            const tailX = s.x - s.vx * (s.maxLen / (Math.abs(s.vx) + 0.1));
            const tailY = s.y - s.vy * (s.maxLen / (Math.abs(s.vx) + 0.1));
            const grad = ctx.createLinearGradient(tailX, tailY, s.x, s.y);
            grad.addColorStop(0, `rgba(255,255,255,0)`);
            grad.addColorStop(1, `rgba(255,255,255,${s.life * 0.85})`);
            ctx.strokeStyle = grad;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(tailX, tailY);
            ctx.lineTo(s.x, s.y);
            ctx.stroke();
            s.x += s.vx;
            s.y += s.vy;
            s.life -= 0.022;
        });
    },

    drawCity() {
        const W = this.canvas.width;
        const H = this.canvas.height;
        const ctx = this.ctx;
        const q = this.quality;

        const cityBaseY = H;
        const windowW = 4, windowH = 3, gapX = 9, gapY = 9, padX = 4, padY = 5;

        this.city.forEach(b => {
            const bTop = cityBaseY - b.h;

            ctx.fillStyle = '#020204';
            ctx.fillRect(b.x, bTop, b.w, b.h);
            ctx.strokeStyle = 'rgba(255,255,255,0.025)';
            ctx.lineWidth = 1;
            ctx.strokeRect(b.x + 0.5, bTop + 0.5, b.w - 1, b.h - 1);

            const cols = Math.max(1, Math.floor((b.w - padX * 2) / gapX));
            const rows = Math.max(1, Math.floor((b.h - padY * 2) / gapY));

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const seed = (b.x * 17 + r * 31 + c * 13) % 1;
                    const pseudo = Math.abs(Math.sin(b.x * 0.01 + r * 7.3 + c * 3.7));
                    if (pseudo < q.city) {
                        const wx = b.x + padX + c * gapX;
                        const wy = bTop + padY + r * gapY;
                        const brightness = 0.45 + pseudo * 0.4;
                        ctx.fillStyle = `rgba(255,210,70,${brightness})`;
                        ctx.fillRect(wx, wy, windowW, windowH);
                    }
                }
            }
        });

        const groundGrad = ctx.createLinearGradient(0, H - 50, 0, H);
        groundGrad.addColorStop(0, 'rgba(0,0,0,0)');
        groundGrad.addColorStop(1, 'rgba(0,0,0,0.95)');
        ctx.fillStyle = groundGrad;
        ctx.fillRect(0, H - 50, W, 50);
    },

    applyBuildingGlow() {
        const castle = document.getElementById('my-castle');
        if (!castle) return;
        let glow = castle.querySelector('.castle-glow');
        if (!glow) {
            glow = document.createElement('div');
            glow.className = 'castle-glow';
            castle.insertBefore(glow, castle.firstChild);
        }
        const p = this.topPct;
        let size, opacity, color, pulse;
        if (p <= 1)  { size = 320; opacity = 0.55; color = '212,175,55';  pulse = true;  }
        else if (p <= 5)  { size = 240; opacity = 0.42; color = '200,160,50';  pulse = true;  }
        else if (p <= 15) { size = 180; opacity = 0.30; color = '180,140,40';  pulse = false; }
        else if (p <= 30) { size = 130; opacity = 0.20; color = '150,120,30';  pulse = false; }
        else if (p <= 60) { size = 90;  opacity = 0.12; color = '120,100,20';  pulse = false; }
        else              { size = 50;  opacity = 0.07; color = '100,80,10';   pulse = false; }

        glow.style.cssText = `
            position: absolute;
            bottom: -20px;
            left: 50%;
            transform: translateX(-50%);
            width: ${size}px;
            height: ${size * 0.45}px;
            border-radius: 50%;
            background: radial-gradient(ellipse, rgba(${color},${opacity}) 0%, transparent 70%);
            pointer-events: none;
            z-index: -1;
            ${pulse ? 'animation: glowPulse 2.5s ease-in-out infinite;' : ''}
        `;
    },

    loop() {
        const W = this.canvas.width;
        const H = this.canvas.height;
        this.ctx.clearRect(0, 0, W, H);
        this.drawBg();
        if (this.quality.aurora) this.drawAurora();
        this.drawStars();
        if (this.quality.shooting) { this.maybeShoot(); this.drawShootingStars(); }
        this.drawCity();
        this.t++;
        requestAnimationFrame(() => this.loop());
    }
};
