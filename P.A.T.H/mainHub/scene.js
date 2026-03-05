import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
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

    camPos: { x: 0, y: 0 },
    camTarget: { x: 0, y: 0 },
    camZ: 820,
    camZTarget: 820,
    velX: 0, velY: 0,
    tiltX: 0, tiltY: 0,

    isDragging: false,
    lastPointer: null,
    pinchStart: null,

    isLight: false,
    isReady: false,
    frameCount: 0,

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

        this._setupComposer(W, H);
        this._setupInput();

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

        const canvas2d = document.createElement('canvas');
        canvas2d.width = 256; canvas2d.height = 80;
        const ctx = canvas2d.getContext('2d');
        ctx.fillStyle = 'rgba(20,20,30,0.85)';
        const rr = 16;
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

        const labelTex = new THREE.CanvasTexture(canvas2d);
        const labelGeo = new THREE.PlaneGeometry(120, 38);
        const labelMat = new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, depthWrite: false });
        const label = new THREE.Mesh(labelGeo, labelMat);
        label.position.y = isMe ? -58 : -36;
        group.add(label);

        group.userData = { userId: user.id, user, balloon, label, isMe, baseY: 0 };

        if (isMe) {
            // 열기구(160×200)보다 1.8× 큰 plane — 텍스처 UV를 역산해 실루엣 글로우 생성
            const GS = 1.8;
            const glowGeo = new THREE.PlaneGeometry(160 * GS, 200 * GS);
            // glowUV → balloonUV 변환: offset = (1-1/GS)/2, scale = 1/GS
            const uvOffset = (1 - 1 / GS) / 2;   // ≈ 0.2222
            const uvScale  = 1 / GS;               // ≈ 0.5556
            const glowMat = new THREE.ShaderMaterial({
                uniforms: {
                    uTime:     { value: 0 },
                    uTex:      { value: tex },
                    uOff:      { value: uvOffset },
                    uScale:    { value: uvScale }
                },
                vertexShader: `
                    varying vec2 vUv;
                    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
                `,
                fragmentShader: `
                    uniform sampler2D uTex;
                    uniform float uTime, uOff, uScale;
                    varying vec2 vUv;

                    float sampleA(vec2 guv) {
                        vec2 buv = (guv - uOff) / uScale;
                        if (buv.x < 0.0 || buv.x > 1.0 || buv.y < 0.0 || buv.y > 1.0) return 0.0;
                        return texture2D(uTex, buv).a;
                    }

                    void main() {
                        float sp = 0.055;
                        float a  = sampleA(vUv)
                                 + sampleA(vUv + vec2( sp,  0.0))
                                 + sampleA(vUv + vec2(-sp,  0.0))
                                 + sampleA(vUv + vec2( 0.0, sp))
                                 + sampleA(vUv + vec2( 0.0,-sp))
                                 + sampleA(vUv + vec2( sp*0.7,  sp*0.7))
                                 + sampleA(vUv + vec2(-sp*0.7,  sp*0.7))
                                 + sampleA(vUv + vec2( sp*0.7, -sp*0.7))
                                 + sampleA(vUv + vec2(-sp*0.7, -sp*0.7));
                        a = smoothstep(0.08, 0.85, a / 9.0);
                        float pulse = 0.55 + 0.45 * sin(uTime * 2.2);
                        gl_FragColor = vec4(0.98, 0.85, 0.28, a * pulse * 0.75);
                    }
                `,
                transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
            });
            const glowMesh = new THREE.Mesh(glowGeo, glowMat);
            glowMesh.position.y = 80;  // 열기구 본체와 동일 y
            glowMesh.position.z = -4;  // 열기구 뒤
            group.userData.glowMat = glowMat;
            group.add(glowMesh);
        }

        this.scene.add(group);
        this.balloons.set(user.id, { group, user, isMe });
        if (isMe) this.myBalloon = this.balloons.get(user.id);

        group.userData.clickable = true;
        return group;
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

        const others = users.filter(u => !me || u.id !== me.id).slice(0, 100);
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
            } else {
                const grp = this.addBalloon(user, src, false);
                grp.position.set(x, y, z);
                grp.userData.baseY = y;
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
        const b = this.balloons.get(userId);
        if (!b) return;
        this.camTarget.x = -b.group.position.x;
        this.camTarget.y = -b.group.position.y;
    },

    focusHome() {
        this.camTarget.x = 0;
        this.camTarget.y = 0;
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
                this.camTarget.x = -b.group.position.x;
                this.camTarget.y = -b.group.position.y;
            }
        });
    },

    _setupComposer(W, H) {
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));

        this.bokehPass = new BokehPass(this.scene, this.camera, {
            focus: this.camZ,
            aperture: 0.0003,
            maxblur: 0.006
        });
        this.composer.addPass(this.bokehPass);

        const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.25, 0.4, 0.88);
        this.composer.addPass(bloom);
    },

    _setupInput() {
        const canvas = this.renderer.domElement;

        canvas.addEventListener('pointerdown', (e) => {
            if (e.target.closest?.('.glass-panel,.hud-header,.fab-rail,.pill-action-wrap')) return;
            this.isDragging = true;
            this.lastPointer = { x: e.clientX, y: e.clientY };
            canvas.setPointerCapture(e.pointerId);
        });

        canvas.addEventListener('pointermove', (e) => {
            if (!this.isDragging || !this.lastPointer) return;
            const dx = e.clientX - this.lastPointer.x;
            const dy = e.clientY - this.lastPointer.y;
            const worldScale = this.camZ / 900;
            this.velX -= dx * worldScale * 1.2;
            this.velY += dy * worldScale * 1.2;
            this.lastPointer = { x: e.clientX, y: e.clientY };
            this.tiltX += dy * this.TILT_STRENGTH;
            this.tiltY -= dx * this.TILT_STRENGTH;
        });

        canvas.addEventListener('pointerup', (e) => {
            this.isDragging = false;
            this.lastPointer = null;
            try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
        });

        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.zoom(e.deltaY * 0.001);
        }, { passive: false });

        canvas.addEventListener('click', (e) => {
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

        this.velX += (this.camTarget.x - this.camPos.x) * this.SPRING;
        this.velY += (this.camTarget.y - this.camPos.y) * this.SPRING;
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

        if (this.bokehPass) {
            this.bokehPass.uniforms.focus.value = this.camZ;
        }

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

        this.composer.render();
    }
};

window.WorldScene = WorldScene;
window._worldSceneReady = true;
if (window._onWorldSceneReady) window._onWorldSceneReady();
