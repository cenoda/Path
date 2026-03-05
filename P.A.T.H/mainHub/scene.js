import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const WorldScene = {
    scene: null, camera: null, renderer: null, composer: null,
    balloons: new Map(),
    myBalloon: null,
    stars: null,
    shootingStars: [],
    moon: null,
    sun: null,
    clouds: [],
    raindrops: [],
    snowflakes: [],
    fireflies: [],
    clickParticles: [],
    weatherMode: 'none',
    hoveredBalloon: null,
    keysPressed: {},
    skyIslands: [],

    camPos: { x: 0, y: 0 },
    camTarget: { x: 0, y: 0 },
    springActive: false,
    camZ: 820,
    camZTarget: 820,
    velX: 0, velY: 0,
    tiltX: 0, tiltY: 0,

    isDragging: false,
    isDraggingBalloon: false,
    balloonDragDist: 0,
    lastPointer: null,
    pinchStart: null,

    isLight: false,
    isReady: false,
    frameCount: 0,
    friendIds: new Set(),

    SPRING: 0.10,
    FRICTION: 0.82,
    TILT_STRENGTH: 0.018,
    TILT_RETURN: 0.08,

    init() {
        this.isLight = document.body.classList.contains('light');

        const canvas = document.createElement('canvas');
        canvas.id = 'three-canvas';
        canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:0;display:block;';
        document.body.prepend(canvas);

        const bgCanvas = document.getElementById('bg-canvas');
        if (bgCanvas) bgCanvas.style.display = 'none';

        const W = window.innerWidth, H = window.innerHeight;

        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
        this.renderer.setSize(W, H);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = false;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.1;

        this.scene = new THREE.Scene();
        this._updateSky();

        this.camera = new THREE.PerspectiveCamera(46, W / H, 1, 8000);
        this.camera.position.set(0, 0, this.camZ);
        this.camera.lookAt(0, 0, 0);

        const ambientLight = new THREE.AmbientLight(0x8090c0, 0.8);
        this.scene.add(ambientLight);
        this.dirLight = new THREE.DirectionalLight(0xfff0dd, 1.6);
        this.dirLight.position.set(300, 500, 600);
        this.scene.add(this.dirLight);
        const fillLight = new THREE.DirectionalLight(0x4060ff, 0.3);
        fillLight.position.set(-200, -100, 300);
        this.scene.add(fillLight);

        this._buildStars();
        this._buildMoon();
        this._buildClouds();
        this._buildFireflies();
        this._buildSkyIslands();

        this._setupComposer(W, H);
        this._setupInput();
        this._setupKeyboard();

        window.addEventListener('resize', () => this._onResize());

        this.isReady = true;
        this._loop();
    },

    _updateSky() {
        if (this.isLight) {
            this.scene.background = new THREE.Color(0x87ceeb);
            this.scene.fog = new THREE.Fog(0xb0d8f0, 1200, 4000);
        } else {
            this.scene.background = new THREE.Color(0x060814);
            this.scene.fog = new THREE.FogExp2(0x060814, 0.00022);
        }
        if (this.stars) this.stars.visible = !this.isLight;
        if (this.moon) this.moon.visible = !this.isLight;
        if (this.sun) this.sun.visible = this.isLight;
        this.clouds.forEach(c => { c.visible = this.isLight; });
        if (this.fireflies) this.fireflies.forEach(f => f.visible = !this.isLight);
        
        // 하늘섬 잔디 색상 업데이트
        this.skyIslands.forEach(island => {
            island.children.forEach(child => {
                if (child.material && child.geometry && child.geometry.type === 'CylinderGeometry' && child.position.y > 0) {
                    child.material.color.set(this.isLight ? 0x6fbf73 : 0x2d5a3d);
                }
            });
        });

        if (this.isLight) {
            if (this.dirLight) {
                this.dirLight.color.set(0xfffde0);
                this.dirLight.intensity = 2.2;
                this.dirLight.position.set(600, 800, 600);
            }
        } else {
            if (this.dirLight) {
                this.dirLight.color.set(0x8090ff);
                this.dirLight.intensity = 0.6;
                this.dirLight.position.set(300, 500, 600);
            }
        }
    },

    _buildStars() {
        const N = 1800;
        const positions = new Float32Array(N * 3);
        const sizes = new Float32Array(N);
        const phases = new Float32Array(N);
        const colors = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 2000 + Math.random() * 500;
            positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = r * Math.cos(phi);
            sizes[i] = 0.6 + Math.random() * 2.8;
            phases[i] = Math.random() * Math.PI * 2;
            const rnd = Math.random();
            if (rnd < 0.08) { colors[i*3]=1; colors[i*3+1]=0.9; colors[i*3+2]=0.7; }
            else if (rnd < 0.14) { colors[i*3]=0.7; colors[i*3+1]=0.8; colors[i*3+2]=1; }
            else { colors[i*3]=1; colors[i*3+1]=1; colors[i*3+2]=1; }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('starSize', new THREE.BufferAttribute(sizes, 1));
        geo.setAttribute('starColor', new THREE.BufferAttribute(colors, 3));
        geo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));

        const mat = new THREE.ShaderMaterial({
            uniforms: { uTime: { value: 0 } },
            vertexShader: `
                attribute float starSize; attribute float phase; attribute vec3 starColor;
                varying vec3 vColor; varying float vTwinkle;
                uniform float uTime;
                void main() {
                    vColor = starColor;
                    vTwinkle = 0.5 + 0.5 * sin(uTime * 2.0 + phase);
                    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = starSize * vTwinkle * (300.0 / -mvPos.z);
                    gl_Position = projectionMatrix * mvPos;
                }
            `,
            fragmentShader: `
                varying vec3 vColor; varying float vTwinkle;
                void main() {
                    float d = length(gl_PointCoord - vec2(0.5));
                    if (d > 0.5) discard;
                    float alpha = (1.0 - d * 2.0) * vTwinkle;
                    gl_FragColor = vec4(vColor, alpha);
                }
            `,
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
        });
        this.starMaterial = mat;
        this.stars = new THREE.Points(geo, mat);
        this.stars.visible = !this.isLight;
        this.scene.add(this.stars);

        this._buildGalaxy();
    },

    _buildGalaxy() {
        const geo = new THREE.PlaneGeometry(3000, 1200);
        const mat = new THREE.ShaderMaterial({
            uniforms: {},
            vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
            fragmentShader: `
                varying vec2 vUv;
                void main() {
                    vec2 c = vUv - vec2(0.5, 0.5);
                    float d = length(c * vec2(1.0, 2.5));
                    float band = 1.0 - smoothstep(0.0, 0.5, abs(c.y * 3.5 - c.x * 0.4));
                    float core = exp(-d * 2.5) * 0.15;
                    float glow = band * exp(-abs(c.y * 6.0)) * 0.06;
                    vec3 col = mix(vec3(0.18, 0.1, 0.35), vec3(0.4, 0.3, 0.8), core + glow);
                    gl_FragColor = vec4(col, (core + glow) * 0.7);
                }
            `,
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
        });
        const galaxy = new THREE.Mesh(geo, mat);
        galaxy.rotation.x = -Math.PI / 6;
        galaxy.rotation.z = Math.PI / 5;
        galaxy.position.set(0, 200, -1800);
        galaxy.visible = true;
        this.galaxy = galaxy;
        this.scene.add(galaxy);
        if (this.stars) {
            this.galaxy.visible = !this.isLight;
        }
    },

    _buildMoon() {
        const geo = new THREE.CircleGeometry(45, 64);
        const mat = new THREE.ShaderMaterial({
            uniforms: {},
            vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
            fragmentShader: `
                varying vec2 vUv;
                void main() {
                    vec2 c = vUv - vec2(0.5);
                    float d = length(c);
                    if (d > 0.5) discard;
                    vec2 shadow = c - vec2(0.18, -0.1);
                    float shadowD = length(shadow);
                    float crescent = smoothstep(0.42, 0.44, shadowD);
                    vec3 moonCol = mix(vec3(0.85, 0.8, 0.65), vec3(0.98, 0.96, 0.85), crescent);
                    float edge = 1.0 - smoothstep(0.44, 0.5, d);
                    gl_FragColor = vec4(moonCol * crescent, crescent * edge);
                }
            `,
            transparent: true, depthWrite: false
        });
        this.moon = new THREE.Mesh(geo, mat);
        this.moon.position.set(-600, 520, -1200);
        this.moon.visible = !this.isLight;
        this.scene.add(this.moon);

        const glowGeo = new THREE.CircleGeometry(110, 32);
        const glowMat = new THREE.ShaderMaterial({
            uniforms: {},
            vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
            fragmentShader: `varying vec2 vUv; void main() { float d = length(vUv - vec2(0.5)); float a = (1.0 - smoothstep(0.2, 0.5, d)) * 0.18; gl_FragColor = vec4(0.9, 0.95, 1.0, a); }`,
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.position.copy(this.moon.position);
        glow.visible = !this.isLight;
        this.moonGlow = glow;
        this.scene.add(glow);

        const sunGeo = new THREE.CircleGeometry(55, 64);
        const sunMat = new THREE.ShaderMaterial({
            uniforms: {},
            vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
            fragmentShader: `varying vec2 vUv; void main() { float d = length(vUv - vec2(0.5)); if(d > 0.5) discard; vec3 col = mix(vec3(1.0, 0.98, 0.7), vec3(1.0, 0.85, 0.3), d * 2.0); float a = 1.0 - smoothstep(0.42, 0.5, d); gl_FragColor = vec4(col, a); }`,
            transparent: true, depthWrite: false
        });
        this.sun = new THREE.Mesh(sunGeo, sunMat);
        this.sun.position.set(700, 500, -1200);
        this.sun.visible = this.isLight;
        this.scene.add(this.sun);

        const sunGlowGeo = new THREE.CircleGeometry(200, 32);
        const sunGlowMat = new THREE.ShaderMaterial({
            uniforms: {},
            vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
            fragmentShader: `varying vec2 vUv; void main() { float d = length(vUv - vec2(0.5)); float a = (1.0 - smoothstep(0.1, 0.5, d)) * 0.25; gl_FragColor = vec4(1.0, 0.95, 0.5, a); }`,
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
        });
        const sunGlow = new THREE.Mesh(sunGlowGeo, sunGlowMat);
        sunGlow.position.copy(this.sun.position);
        sunGlow.visible = this.isLight;
        this.sunGlow = sunGlow;
        this.scene.add(sunGlow);
    },

    _buildClouds() {
        this.clouds = [];
        const cloudData = [
            { x: -700, y: 380, z: -600, scale: 1.4 },
            { x: 300, y: 440, z: -700, scale: 1.0 },
            { x: 900, y: 360, z: -500, scale: 0.8 },
            { x: -300, y: 500, z: -800, scale: 1.2 },
            { x: 600, y: 300, z: -400, scale: 0.7 },
        ];
        cloudData.forEach((d, idx) => {
            const cloud = this._makeCloud(d.scale);
            cloud.position.set(d.x, d.y, d.z);
            cloud.userData.baseX = d.x;
            cloud.userData.speed = 0.03 + idx * 0.01;
            cloud.visible = this.isLight;
            this.clouds.push(cloud);
            this.scene.add(cloud);
        });
    },

    _makeCloud(scale) {
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, transparent: true, opacity: 0.88 });
        const blobs = [
            { x: 0,    y: 0,    s: 60 * scale },
            { x: 80,   y: -15,  s: 50 * scale },
            { x: -70,  y: -10,  s: 45 * scale },
            { x: 40,   y: 30,   s: 40 * scale },
            { x: -30,  y: 25,   s: 35 * scale },
        ];
        blobs.forEach(b => {
            const geo = new THREE.SphereGeometry(b.s, 10, 8);
            const m = new THREE.Mesh(geo, mat);
            m.position.set(b.x, b.y, 0);
            group.add(m);
        });
        return group;
    },

    _loadTexture(src) {
        if (this._texCache && this._texCache.has(src)) return this._texCache.get(src);
        if (!this._texCache) this._texCache = new Map();
        const loader = new THREE.TextureLoader();
        const tex = loader.load(src);
        tex.colorSpace = THREE.SRGBColorSpace;
        this._texCache.set(src, tex);
        return tex;
    },

    _makeLabel(user, isMe) {
        const c = document.createElement('canvas');
        c.width = 256; c.height = 80;
        const ctx = c.getContext('2d');
        const rr = 16;
        ctx.fillStyle = 'rgba(20,20,30,0.85)';
        ctx.beginPath();
        ctx.moveTo(8 + rr, 8);
        ctx.lineTo(248 - rr, 8); ctx.arcTo(248, 8, 248, 8 + rr, rr);
        ctx.lineTo(248, 72 - rr); ctx.arcTo(248, 72, 248 - rr, 72, rr);
        ctx.lineTo(8 + rr, 72); ctx.arcTo(8, 72, 8, 72 - rr, rr);
        ctx.lineTo(8, 8 + rr); ctx.arcTo(8, 8, 8 + rr, 8, rr);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = isMe ? 'rgba(212,175,55,0.6)' : 'rgba(255,255,255,0.15)';
        ctx.lineWidth = isMe ? 2 : 1;
        ctx.stroke();
        ctx.fillStyle = isMe ? '#D4AF37' : '#E8E8ED';
        ctx.font = `bold 22px "Pretendard Variable", sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(user.nickname, 128, 34);
        ctx.fillStyle = 'rgba(180,180,200,0.8)';
        ctx.font = `16px "Pretendard Variable", sans-serif`;
        ctx.fillText(user.university || '', 128, 58);
        return c;
    },

    _makeBubble(msg, isMe) {
        const c = document.createElement('canvas');
        c.width = 256; c.height = 80;
        const ctx = c.getContext('2d');
        if (!msg) return c;
        ctx.font = `bold 15px "Pretendard Variable", sans-serif`;
        const maxTextW = 220;
        const textW = Math.min(ctx.measureText(msg).width + 28, maxTextW);
        const bH = 44;
        const x0 = (256 - textW) / 2;
        const y0 = 4;
        const r = 12;
        ctx.fillStyle = isMe ? 'rgba(212,175,55,0.92)' : 'rgba(240,242,255,0.94)';
        ctx.beginPath();
        ctx.moveTo(x0 + r, y0);
        ctx.lineTo(x0 + textW - r, y0); ctx.arcTo(x0 + textW, y0, x0 + textW, y0 + r, r);
        ctx.lineTo(x0 + textW, y0 + bH - r); ctx.arcTo(x0 + textW, y0 + bH, x0 + textW - r, y0 + bH, r);
        ctx.lineTo(x0 + r, y0 + bH); ctx.arcTo(x0, y0 + bH, x0, y0 + bH - r, r);
        ctx.lineTo(x0, y0 + r); ctx.arcTo(x0, y0, x0 + r, y0, r);
        ctx.closePath();
        ctx.fill();
        const tailX = 128;
        ctx.beginPath();
        ctx.moveTo(tailX - 7, y0 + bH);
        ctx.lineTo(tailX + 7, y0 + bH);
        ctx.lineTo(tailX, y0 + bH + 12);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = isMe ? '#1a1100' : '#1C1C2E';
        ctx.font = `bold 15px "Pretendard Variable", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(msg, 128, y0 + bH / 2, maxTextW - 16);
        return c;
    },

    addBalloon(user, src, isMe) {
        const existing = this.balloons.get(user.id);
        if (existing) { this.scene.remove(existing.group); }

        const group = new THREE.Group();

        const tex = this._loadTexture(src);
        const balloonGeo = new THREE.PlaneGeometry(isMe ? 160 : 100, isMe ? 200 : 125);
        const balloonMat = new THREE.MeshStandardMaterial({
            map: tex, transparent: true, alphaTest: 0.05,
            roughness: 0.85, metalness: 0.0,
            side: THREE.DoubleSide
        });
        const balloon = new THREE.Mesh(balloonGeo, balloonMat);
        balloon.position.y = isMe ? 80 : 50;
        group.add(balloon);

        const shadowGeo = new THREE.CircleGeometry(isMe ? 55 : 35, 24);
        const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false });
        const shadow = new THREE.Mesh(shadowGeo, shadowMat);
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = -80;
        group.add(shadow);

        const labelCanvas = this._makeLabel(user, isMe);
        const labelTex = new THREE.CanvasTexture(labelCanvas);
        const labelGeo = new THREE.PlaneGeometry(120, 38);
        const labelMat = new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, depthWrite: false });
        const label = new THREE.Mesh(labelGeo, labelMat);
        label.position.y = isMe ? -58 : -36;
        group.add(label);

        let bubbleMesh = null;
        if (user.status_message) {
            const bubbleCanvas = this._makeBubble(user.status_message, isMe);
            const bubbleTex = new THREE.CanvasTexture(bubbleCanvas);
            const bubbleGeo = new THREE.PlaneGeometry(isMe ? 145 : 110, isMe ? 52 : 42);
            const bubbleMat = new THREE.MeshBasicMaterial({ map: bubbleTex, transparent: true, depthWrite: false });
            bubbleMesh = new THREE.Mesh(bubbleGeo, bubbleMat);
            bubbleMesh.position.y = isMe ? 205 : 135;
            group.add(bubbleMesh);
        }

        group.userData = { userId: user.id, user, balloon, label, bubbleMesh, isMe, baseY: 0 };

        if (isMe) {
            const glowGeo = new THREE.CircleGeometry(70, 30);
            const glowMat = new THREE.ShaderMaterial({
                uniforms: { uTime: { value: 0 } },
                vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
                fragmentShader: `uniform float uTime; varying vec2 vUv; void main() { float d = length(vUv - vec2(0.5)); float pulse = 0.55 + 0.45 * sin(uTime * 2.2); float a = (1.0 - smoothstep(0.2, 0.5, d)) * 0.35 * pulse; gl_FragColor = vec4(0.83, 0.69, 0.21, a); }`,
                transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
            });
            const glowMesh = new THREE.Mesh(glowGeo, glowMat);
            glowMesh.position.y = 100;
            glowMesh.position.z = -5;
            group.userData.glowMat = glowMat;
            group.add(glowMesh);
        }

        this.scene.add(group);
        this.balloons.set(user.id, { group, user, isMe });
        if (isMe) this.myBalloon = this.balloons.get(user.id);

        group.userData.clickable = true;
        return group;
    },

    setFriendIds(ids) {
        this.friendIds = new Set(ids);
    },

    updateStatusMsg(userId, msg) {
        const b = this.balloons.get(userId);
        if (!b) return;
        b.user.status_message = msg || null;
        const grp = b.group;
        if (grp.userData.bubbleMesh) {
            grp.remove(grp.userData.bubbleMesh);
            grp.userData.bubbleMesh.geometry.dispose();
            if (grp.userData.bubbleMesh.material.map) grp.userData.bubbleMesh.material.map.dispose();
            grp.userData.bubbleMesh.material.dispose();
            grp.userData.bubbleMesh = null;
        }
        if (msg) {
            const bubbleCanvas = this._makeBubble(msg, b.isMe);
            const bubbleTex = new THREE.CanvasTexture(bubbleCanvas);
            const bubbleGeo = new THREE.PlaneGeometry(b.isMe ? 145 : 110, b.isMe ? 52 : 42);
            const bubbleMat = new THREE.MeshBasicMaterial({ map: bubbleTex, transparent: true, depthWrite: false });
            const bubbleMesh = new THREE.Mesh(bubbleGeo, bubbleMat);
            bubbleMesh.position.y = b.isMe ? 205 : 135;
            grp.add(bubbleMesh);
            grp.userData.bubbleMesh = bubbleMesh;
        }
    },

    _updateOffscreenIndicators() {
        if (!this._offscreenEl) {
            const el = document.createElement('div');
            el.id = 'nav-offscreen';
            el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9;overflow:hidden;';
            document.body.appendChild(el);
            this._offscreenEl = el;
        }
        this.camera.updateMatrixWorld();
        const W = window.innerWidth, H = window.innerHeight;
        const EDGE = 36, MAX = 7;
        const cx = W / 2, cy = H / 2;
        const items = [];

        this.balloons.forEach((b) => {
            if (b.isMe) return;
            const wp = b.group.position.clone();
            wp.project(this.camera);
            const sx = (wp.x + 1) / 2 * W;
            const sy = (1 - wp.y) / 2 * H;
            if (sx >= 0 && sx <= W && sy >= 0 && sy <= H) return;
            const dx = sx - cx, dy = sy - cy;
            if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) return;
            const scaleX = (cx - EDGE) / Math.abs(dx);
            const scaleY = (cy - EDGE) / Math.abs(dy);
            const scale = Math.min(scaleX, scaleY);
            const ex = cx + dx * scale, ey = cy + dy * scale;
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            const isFriend = this.friendIds.has(b.user.id);
            items.push({ user: b.user, ex, ey, angle, isFriend });
        });

        items.sort((a, b) => (b.isFriend ? 1 : 0) - (a.isFriend ? 1 : 0));
        const shown = items.slice(0, MAX);

        this._offscreenEl.innerHTML = shown.map(({ user, ex, ey, angle, isFriend }) => {
            const clr = isFriend ? '#D4AF37' : 'rgba(200,210,230,0.9)';
            const bg = isFriend ? 'rgba(40,30,10,0.82)' : 'rgba(15,18,30,0.78)';
            const border = isFriend ? '1px solid rgba(212,175,55,0.5)' : '1px solid rgba(255,255,255,0.12)';
            const prefix = isFriend ? '<span style="margin-right:2px;font-size:9px">★</span>' : '';
            return `<div style="position:absolute;left:${ex}px;top:${ey}px;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:3px;">
                <div style="font-size:14px;color:${clr};transform:rotate(${angle + 90}deg);filter:drop-shadow(0 0 3px rgba(0,0,0,0.8));line-height:1">▲</div>
                <div style="background:${bg};border:${border};color:${clr};font-family:'Pretendard Variable',sans-serif;font-size:10px;padding:3px 8px;border-radius:10px;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:flex;align-items:center;">${prefix}${user.nickname}</div>
            </div>`;
        }).join('');
    },

    setUsers(users, me, isLight) {
        this.isLight = isLight;
        this._updateSky();

        const keepIds = new Set(users.map(u => u.id));
        if (me) keepIds.add(me.id);
        this.balloons.forEach((_, id) => {
            if (!keepIds.has(id)) {
                const b = this.balloons.get(id);
                if (b) this.scene.remove(b.group);
                this.balloons.delete(id);
            }
        });

        const isLightMode = isLight;
        const skinKey = isLightMode ? 'lightImg' : 'darkImg';

        if (me) {
            const skinId = me.balloon_skin || 'default';
            const src = this._getSrc(skinId, isLightMode);
            if (this.myBalloon) {
                const mat = this.myBalloon.group.userData.balloon.material;
                mat.map = this._loadTexture(src);
                mat.needsUpdate = true;
            } else {
                const grp = this.addBalloon(me, src, true);
                grp.position.set(0, 0, 0);
            }
        }

        // 거리 기반 렌더링: 최대 500명까지 확장 가능
        const others = users.filter(u => !me || u.id !== me.id).slice(0, 500);
        const myPos = this.myBalloon ? this.myBalloon.group.position : new THREE.Vector3(0, 0, 0);
        
        others.forEach((user, i) => {
            const angle = i * 137.508;
            const radius = 260 + Math.sqrt(i) * 160;
            const x = radius * Math.cos(angle * Math.PI / 180);
            const y = radius * Math.sin(angle * Math.PI / 180);
            const z = (Math.sin(i * 3.7) * 80);
            const skinId = user.balloon_skin || 'default';
            const src = this._getSrc(skinId, isLightMode);

            if (this.balloons.has(user.id)) {
                const b = this.balloons.get(user.id);
                b.group.position.set(x, y, z);
                b.group.userData.baseY = y;
                const mat = b.group.userData.balloon.material;
                mat.map = this._loadTexture(src);
                mat.needsUpdate = true;
                
                // 거리 기반 LOD (Level of Detail)
                const dist = Math.hypot(x - myPos.x, y - myPos.y, z - myPos.z);
                if (dist > 3000) {
                    b.group.visible = false; // 매우 먼 거리는 숨김
                } else {
                    b.group.visible = true;
                    // 거리에 따라 세부 표현 조절
                    if (b.group.userData.label) b.group.userData.label.visible = dist < 1500;
                    if (b.group.userData.bubbleMesh) b.group.userData.bubbleMesh.visible = dist < 1000;
                }
            } else {
                const grp = this.addBalloon(user, src, false);
                grp.position.set(x, y, z);
                grp.userData.baseY = y;
                
                // 초기 LOD 설정
                const dist = Math.hypot(x - myPos.x, y - myPos.y, z - myPos.z);
                grp.visible = dist <= 3000;
            }
        });
    },

    _getSrc(skinId, isLight) {
        const skins = {
            default: { dark: 'assets/balloon_dark.png', light: 'assets/balloon_light.png' },
            rainbow: { dark: 'assets/balloon_rainbow.png', light: 'assets/balloon_rainbow.png' },
            pastel: { dark: 'assets/balloon_pastel.png', light: 'assets/balloon_pastel.png' },
            redstripes: { dark: 'assets/balloon_redstripes.png', light: 'assets/balloon_redstripes.png' }
        };
        const s = skins[skinId] || skins.default;
        return isLight ? s.light : s.dark;
    },

    updateMyBalloon(src) {
        if (!this.myBalloon) return;
        const mat = this.myBalloon.group.userData.balloon.material;
        mat.map = this._loadTexture(src);
        mat.needsUpdate = true;
    },

    focusUserById(userId) {
        this.springActive = true;
        const b = this.balloons.get(userId);
        if (!b) return;
        this.camTarget.x = -b.group.position.x;
        this.camTarget.y = -(b.group.userData.baseY || 0);
    },

    focusHome() {
        this.springActive = true;
        if (this.myBalloon) {
            const grp = this.myBalloon.group;
            this.camTarget.x = grp.position.x;
            this.camTarget.y = grp.userData.baseY || 0;
        } else {
            this.camTarget.x = 0;
            this.camTarget.y = 0;
        }
        this.camZTarget = 820;
    },

    getMyPosition() {
        if (this.myBalloon) {
            const pos = this.myBalloon.group.position;
            return { x: Math.round(pos.x), y: Math.round(pos.y), z: Math.round(pos.z) };
        }
        return { x: 0, y: 0, z: 0 };
    },

    getUserPosition(userId) {
        const b = this.balloons.get(userId);
        if (b) {
            const pos = b.group.position;
            return { x: Math.round(pos.x), y: Math.round(pos.y), z: Math.round(pos.z) };
        }
        return null;
    },

    teleportTo(x, y) {
        this.springActive = true;
        this.camTarget.x = -x;
        this.camTarget.y = -y;
        this.camZTarget = 820;
    },

    zoom(delta) {
        this.camZTarget = Math.min(Math.max(400, this.camZTarget - delta * 600), 2000);
    },

    highlightUser(query) {
        if (!query) return;
        const q = query.toLowerCase();
        this.balloons.forEach((b) => {
            const u = b.user;
            if (u.nickname.toLowerCase().includes(q) || (u.university || '').toLowerCase().includes(q)) {
                this.springActive = true;
                this.camTarget.x = -b.group.position.x;
                this.camTarget.y = -b.group.position.y;
            }
        });
    },

    _setupComposer(W, H) {
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));

        const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.25, 0.4, 0.88);
        this.composer.addPass(bloom);
    },

    _setupInput() {
        const canvas = this.renderer.domElement;

        canvas.addEventListener('pointerdown', (e) => {
            if (e.target.closest?.('.glass-panel,.hud-header,.fab-rail,.pill-action-wrap')) return;
            this.lastPointer = { x: e.clientX, y: e.clientY };
            this.balloonDragDist = 0;
            canvas.setPointerCapture(e.pointerId);

            if (this.myBalloon) {
                const rect = canvas.getBoundingClientRect();
                const mouse = new THREE.Vector2(
                    ((e.clientX - rect.left) / rect.width) * 2 - 1,
                    -((e.clientY - rect.top) / rect.height) * 2 + 1
                );
                const ray = new THREE.Raycaster();
                ray.setFromCamera(mouse, this.camera);
                const meshes = [];
                this.myBalloon.group.traverse(ch => { if (ch.isMesh) meshes.push(ch); });
                if (ray.intersectObjects(meshes, false).length > 0) {
                    this.isDraggingBalloon = true;
                    this.springActive = false;
                    this.velX = 0; this.velY = 0;
                    canvas.style.cursor = 'grabbing';
                    this._showTravelHint(true);
                    return;
                }
            }

            this.isDragging = true;
            this.springActive = false;
        });

        canvas.addEventListener('pointermove', (e) => {
            if (!this.lastPointer) return;
            const dx = e.clientX - this.lastPointer.x;
            const dy = e.clientY - this.lastPointer.y;
            this.lastPointer = { x: e.clientX, y: e.clientY };

            if (this.isDraggingBalloon && this.myBalloon) {
                const worldScale = this.camZ / 900;
                this.balloonDragDist += Math.hypot(dx, dy);
                const grp = this.myBalloon.group;
                grp.position.x += dx * worldScale;
                grp.userData.baseY = (grp.userData.baseY || 0) - dy * worldScale;
                this.camPos.x += dx * worldScale;
                this.camPos.y -= dy * worldScale;
                this.velX = 0; this.velY = 0;
                return;
            }

            if (!this.isDragging) {
                if (this.myBalloon && !this.isDraggingBalloon && this.frameCount % 4 === 0) {
                    const rect = canvas.getBoundingClientRect();
                    const mouse = new THREE.Vector2(
                        ((e.clientX - rect.left) / rect.width) * 2 - 1,
                        -((e.clientY - rect.top) / rect.height) * 2 + 1
                    );
                    const ray = new THREE.Raycaster();
                    ray.setFromCamera(mouse, this.camera);
                    const meshes = [];
                    this.myBalloon.group.traverse(ch => { if (ch.isMesh) meshes.push(ch); });
                    canvas.style.cursor = ray.intersectObjects(meshes, false).length > 0 ? 'grab' : '';
                }
                return;
            }
            const worldScale = this.camZ / 900;
            this.velX -= dx * worldScale * 1.2;
            this.velY += dy * worldScale * 1.2;
            this.tiltX += dy * this.TILT_STRENGTH;
            this.tiltY -= dx * this.TILT_STRENGTH;
        });

        canvas.addEventListener('pointerup', (e) => {
            if (this.isDraggingBalloon) {
                this.isDraggingBalloon = false;
                canvas.style.cursor = '';
                this._showTravelHint(false);
            }
            this.isDragging = false;
            this.lastPointer = null;
            try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
        });

        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.zoom(e.deltaY * 0.001);
        }, { passive: false });

        canvas.addEventListener('click', (e) => {
            if (this.balloonDragDist > 8) return;
            const rect = canvas.getBoundingClientRect();
            const mouse = new THREE.Vector2(
                ((e.clientX - rect.left) / rect.width) * 2 - 1,
                -((e.clientY - rect.top) / rect.height) * 2 + 1
            );
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, this.camera);
            const meshes = [];
            this.balloons.forEach(b => {
                b.group.traverse(ch => { if (ch.isMesh) meshes.push(ch); });
            });
            const hits = raycaster.intersectObjects(meshes, false);
            if (hits.length > 0) {
                let obj = hits[0].object;
                while (obj && !obj.userData.clickable) obj = obj.parent;
                if (obj && obj.userData.clickable && obj.userData.user) {
                    if (obj.userData.isMe) {
                        if (window.openEstate) window.openEstate();
                    } else {
                        if (window.openUserModal) window.openUserModal(obj.userData.user);
                    }
                }
            }
        });

        let pinchDist0 = null;
        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                pinchDist0 = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            }
        }, { passive: true });
        canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2 && pinchDist0 !== null) {
                const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                this.zoom((pinchDist0 - dist) * 0.005);
                pinchDist0 = dist;
            }
        }, { passive: true });
        canvas.addEventListener('touchend', () => { pinchDist0 = null; }, { passive: true });

        // 더블클릭으로 빠른 이동
        let lastClickTime = 0;
        canvas.addEventListener('dblclick', (e) => {
            const rect = canvas.getBoundingClientRect();
            const mouse = new THREE.Vector2(
                ((e.clientX - rect.left) / rect.width) * 2 - 1,
                -((e.clientY - rect.top) / rect.height) * 2 + 1
            );
            const worldScale = this.camZ / 400;
            const worldX = -this.camPos.x + mouse.x * worldScale * rect.width / 2;
            const worldY = -this.camPos.y - mouse.y * worldScale * rect.height / 2;
            this.teleportTo(worldX, worldY);
            this._createClickParticle(worldX, worldY, 0);
        });

        // 호버 효과
        canvas.addEventListener('mousemove', (e) => {
            if (this.isDragging) return;
            const rect = canvas.getBoundingClientRect();
            const mouse = new THREE.Vector2(
                ((e.clientX - rect.left) / rect.width) * 2 - 1,
                -((e.clientY - rect.top) / rect.height) * 2 + 1
            );
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, this.camera);
            const meshes = [];
            this.balloons.forEach(b => {
                b.group.traverse(ch => { if (ch.isMesh) meshes.push(ch); });
            });
            const hits = raycaster.intersectObjects(meshes, false);
            if (hits.length > 0) {
                let obj = hits[0].object;
                while (obj && !obj.userData.clickable) obj = obj.parent;
                if (obj && obj.userData.clickable) {
                    canvas.style.cursor = 'pointer';
                    this.hoveredBalloon = obj;
                    return;
                }
            }
            canvas.style.cursor = '';
            this.hoveredBalloon = null;
        });
    },

    _setupKeyboard() {
        const moveSpeed = 15;
        document.addEventListener('keydown', (e) => {
            this.keysPressed[e.key.toLowerCase()] = true;
            
            // R키로 날씨 변경
            if (e.key.toLowerCase() === 'r') {
                this.cycleWeather();
            }
            // H키로 홈 복귀
            if (e.key.toLowerCase() === 'h') {
                this.focusHome();
            }
        });
        document.addEventListener('keyup', (e) => {
            this.keysPressed[e.key.toLowerCase()] = false;
        });
        
        setInterval(() => {
            if (this.keysPressed['w'] || this.keysPressed['arrowup']) {
                this.velY += moveSpeed;
            }
            if (this.keysPressed['s'] || this.keysPressed['arrowdown']) {
                this.velY -= moveSpeed;
            }
            if (this.keysPressed['a'] || this.keysPressed['arrowleft']) {
                this.velX += moveSpeed;
            }
            if (this.keysPressed['d'] || this.keysPressed['arrowright']) {
                this.velX -= moveSpeed;
            }
        }, 50);
    },

    _showTravelHint(visible) {
        let el = document.getElementById('travel-hint');
        if (!el) {
            el = document.createElement('div');
            el.id = 'travel-hint';
            el.style.cssText = `
                position:fixed; bottom:140px; left:50%; transform:translateX(-50%);
                background:rgba(10,10,20,0.82); border:1px solid rgba(212,175,55,0.5);
                color:#D4AF37; font-family:"Pretendard Variable",sans-serif; font-size:13px;
                padding:8px 18px; border-radius:20px; z-index:50;
                pointer-events:none; transition:opacity 0.3s;
                letter-spacing:0.04em;
            `;
            document.body.appendChild(el);
        }
        if (visible) {
            el.textContent = '✈  열기구를 드래그해 여행 중...';
            el.style.opacity = '1';
        } else {
            el.style.opacity = '0';
        }
    },

    _spawnShootingStar() {
        if (this.isLight || this.shootingStars.length >= 3) return;
        const angle = (Math.random() * 30 + 15) * Math.PI / 180;
        const speed = 18 + Math.random() * 14;
        const start = new THREE.Vector3(
            -1200 + Math.random() * 2400,
            600 + Math.random() * 600,
            -800
        );
        const dir = new THREE.Vector3(Math.cos(angle) * speed, -Math.sin(angle) * speed, 0);

        const points = [start.clone(), start.clone().add(dir.clone().multiplyScalar(-12))];
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
        const line = new THREE.Line(geo, mat);
        this.scene.add(line);
        this.shootingStars.push({ line, pos: start.clone(), dir, life: 1.0 });
    },

    _updateShootingStars() {
        for (let i = this.shootingStars.length - 1; i >= 0; i--) {
            const s = this.shootingStars[i];
            s.pos.add(s.dir);
            s.life -= 0.022;
            s.line.material.opacity = s.life;
            const tail = s.pos.clone().sub(s.dir.clone().multiplyScalar(12));
            s.line.geometry.setFromPoints([s.pos.clone(), tail]);
            if (s.life <= 0) {
                this.scene.remove(s.line);
                s.line.geometry.dispose();
                s.line.material.dispose();
                this.shootingStars.splice(i, 1);
            }
        }
    },

    _onResize() {
        const W = window.innerWidth, H = window.innerHeight;
        this.camera.aspect = W / H;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(W, H);
        this.composer.setSize(W, H);
    },

    _loop() {
        requestAnimationFrame(() => this._loop());
        this.frameCount++;
        const t = this.frameCount * 0.016;

        if (this.springActive) {
            const dx = this.camTarget.x - this.camPos.x;
            const dy = this.camTarget.y - this.camPos.y;
            this.velX += dx * this.SPRING;
            this.velY += dy * this.SPRING;
            if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(this.velX) < 0.2 && Math.abs(this.velY) < 0.2) {
                this.springActive = false;
            }
        }
        this.velX *= this.FRICTION;
        this.velY *= this.FRICTION;
        this.camPos.x += this.velX;
        this.camPos.y += this.velY;

        this.camZ += (this.camZTarget - this.camZ) * 0.08;
        this.camera.position.set(this.camPos.x, this.camPos.y, this.camZ);

        this.tiltX *= (1 - this.TILT_RETURN);
        this.tiltY *= (1 - this.TILT_RETURN);
        this.tiltX = Math.max(-0.18, Math.min(0.18, this.tiltX));
        this.tiltY = Math.max(-0.18, Math.min(0.18, this.tiltY));

        const speed = Math.sqrt(this.velX * this.velX + this.velY * this.velY);

        this.balloons.forEach((b) => {
            const grp = b.group;
            grp.quaternion.copy(this.camera.quaternion);
            grp.rotation.z += this.tiltY * 0.4;
            grp.rotation.x += this.tiltX * 0.3;

            const baseY = grp.userData.baseY || 0;
            const floatOffset = Math.sin(t * 0.9 + grp.position.x * 0.002) * (b.isMe ? 14 : 9);
            grp.position.y = baseY + floatOffset;

            if (b.isMe && grp.userData.glowMat) {
                grp.userData.glowMat.uniforms.uTime.value = t;
            }
        });

        if (this.starMaterial) {
            this.starMaterial.uniforms.uTime.value = t;
        }

        if (!this.isLight) {
            if (this.frameCount % 240 === 0 && Math.random() < 0.6) {
                this._spawnShootingStar();
            }
            this._updateShootingStars();
        }

        this.clouds.forEach((c, i) => {
            c.position.x = c.userData.baseX + Math.sin(t * c.userData.speed * 0.4 + i) * 80;
        });

        if (this.moon) {
            this.moon.position.x = -600 + Math.sin(t * 0.003) * 15;
            this.moonGlow.position.copy(this.moon.position);
        }

        if (this.frameCount % 10 === 0) this._updateOffscreenIndicators();

        // 좌표 UI 업데이트 (5프레임마다)
        if (this.frameCount % 5 === 0 && window.updateCoordinatesUI) {
            const pos = this.getMyPosition();
            window.updateCoordinatesUI(pos.x, pos.y, pos.z);
        }

        // 거리 기반 LOD 업데이트 (10프레임마다)
        if (this.frameCount % 10 === 0 && this.myBalloon) {
            const myPos = this.myBalloon.group.position;
            this.balloons.forEach((b) => {
                if (b.isMe) return;
                const dist = myPos.distanceTo(b.group.position);
                if (dist > 3000) {
                    b.group.visible = false;
                } else {
                    b.group.visible = true;
                    if (b.group.userData.label) b.group.userData.label.visible = dist < 1500;
                    if (b.group.userData.bubbleMesh) b.group.userData.bubbleMesh.visible = dist < 1000;
                }
            });
        }

        // 날씨 업데이트
        this.raindrops.forEach(d => {
            d.position.y -= d.userData.speed;
            if (d.position.y < -200) d.position.y = d.userData.resetY;
        });
        this.snowflakes.forEach(f => {
            f.position.y -= f.userData.speed;
            f.position.x += f.userData.drift * Math.sin(t * 0.5);
            if (f.position.y < -200) f.position.y = f.userData.resetY;
        });

        // 반딧불이 업데이트
        this.fireflies.forEach((f, i) => {
            const t2 = t + f.userData.phase;
            f.position.y = f.userData.baseY + Math.sin(t2 * 0.8) * 30;
            f.position.x += Math.cos(t2 * 0.3) * 0.5;
            f.position.z += Math.sin(t2 * 0.4) * 0.5;
            f.material.opacity = 0.3 + Math.sin(t2 * 2) * 0.4;
        });

        // 클릭 파티클 업데이트
        for (let i = this.clickParticles.length - 1; i >= 0; i--) {
            const p = this.clickParticles[i];
            p.position.x += p.userData.vx;
            p.position.y += p.userData.vy;
            p.position.z += p.userData.vz;
            p.userData.vy -= 1; // 중력
            p.userData.life -= 0.02;
            p.material.opacity = p.userData.life;
            if (p.userData.life <= 0) {
                this.scene.remove(p);
                p.geometry.dispose();
                p.material.dispose();
                this.clickParticles.splice(i, 1);
            }
        }

        // 호버 효과
        if (this.hoveredBalloon) {
            const scale = 1 + Math.sin(t * 4) * 0.05;
            this.hoveredBalloon.scale.set(scale, scale, scale);
        }

        // 하늘섬 애니메이션
        this.skyIslands.forEach((island) => {
            const floatHeight = Math.sin(t * island.userData.floatSpeed + island.userData.floatPhase) * 15;
            island.position.y = island.userData.baseY + floatHeight;
            
            // 라벨 회전 (항상 카메라 방향)
            island.children.forEach(child => {
                if (child.geometry && child.geometry.type === 'PlaneGeometry') {
                    child.quaternion.copy(this.camera.quaternion);
                }
            });
            
            // 파티클 회전
            if (island.userData.particles) {
                island.userData.particles.rotation.y += 0.005;
            }
            
            // 천천히 회전
            island.rotation.y += 0.001;
        });

        this.composer.render();
    }
};

window.WorldScene = WorldScene;
window._worldSceneReady = true;
if (window._onWorldSceneReady) window._onWorldSceneReady();
