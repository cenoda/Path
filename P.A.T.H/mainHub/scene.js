import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { create3DBalloon, getBalloonColors, setBalloonDetailLevel } from './balloonModel.js';

// main.js is a classic script (non-module), so expose THREE for shared preview rendering.
if (typeof window !== 'undefined' && !window.THREE) {
    window.THREE = THREE;
}

// ── World constants ──────────────────────────────────────────────────────────
// The game world is 200,000 × 200,000 world-units.  A WORLD_SCALE factor maps
// world-units to Three.js scene-units so the renderer stays in a comfortable
// numeric range while the coordinate system feels large-scale to players.
const WORLD_SIZE        = 200000;  // total world width/height (world-units)
const WORLD_SCALE       = 0.15;    // scene-units per world-unit  (200,000 → 30,000 scene-units)
const CHUNK_SIZE        = 4000;    // spatial-partition chunk edge (world-units)
const DRAG_SENSITIVITY  = 0.55;    // 0..1 – lower = less sensitive mouse/touch drag
const WORLD_HALF        = WORLD_SIZE / 2;   // convenience: max |world coord|
const REMOTE_POS_LERP   = 0.12;    // lerp factor for remote player position interpolation
const REMOTE_STALE_REMOVE_MS = 12000; // grace period before removing unseen remote balloons

const AURA_COLORS = {
    none: null,
    sun: 0xffc44d,
    frost: 0x7fd9ff,
    forest: 0x67d57a,
    cosmic: 0x9e8dff,
    royal: 0xe08bff
};

function worldToScene(value) {
    return -value * WORLD_SCALE;
}

function sceneToWorld(value) {
    return -value / WORLD_SCALE;
}

const WorldScene = {
    scene: null,
    camera: null,
    renderer: null,
    composer: null,
    balloons: new Map(),
    myBalloon: null,
    stars: null,
    shootingStars: [],
    moon: null,
    moonGlow: null,
    sun: null,
    sunGlow: null,
    galaxy: null,
    clouds: [],
    raindrops: [],
    snowflakes: [],
    fireflies: [],
    clickParticles: [],
    weatherMode: 'none',
    hoveredBalloon: null,
    keysPressed: {},
    skyIslands: [],
    universityLandmarkStats: {},
    seededProps: [],
    interactableProps: [],
    friendIds: new Set(),

    camPos: { x: 0, y: 0 },
    camTarget: { x: 0, y: 0 },
    springActive: false,
    camZ: 820,
    camZTarget: 820,
    velX: 0,
    velY: 0,
    tiltX: 0,
    tiltY: 0,

    isDragging: false,
    isDraggingBalloon: false,
    balloonDragDist: 0,
    frameCount: 0,
    isReady: false,
    isLight: false,
    dayNightMix: 0,
    dayNightTarget: 0,
    balloonLodDistance: 2300,

    SPRING: 0.045,
    FRICTION: 0.86,
    TILT_STRENGTH: 0.0008,
    TILT_RETURN: 0.08,

    // signature: (propId: string, activated: boolean) => void
    onInteraction: null,

    init() {
        if (this.isReady) return;

        const bgCanvas = document.getElementById('bg-canvas');
        if (!bgCanvas) {
            console.error('WorldScene: #bg-canvas를 찾을 수 없습니다.');
            return;
        }

        bgCanvas.style.display = 'block';
        bgCanvas.style.pointerEvents = 'auto';
        bgCanvas.style.touchAction = 'none';

        const W = window.innerWidth;
        const H = window.innerHeight;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(55, W / H, 1, 20000);
        this.camera.position.set(this.camPos.x, this.camPos.y, this.camZ);

        this.renderer = new THREE.WebGLRenderer({
            canvas: bgCanvas,
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(W, H);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;

        this.ambientLight = new THREE.AmbientLight(0x8090c0, 0.85);
        this.scene.add(this.ambientLight);

        this.dirLight = new THREE.DirectionalLight(0x8090ff, 1.1);
        this.dirLight.position.set(300, 500, 600);
        this.scene.add(this.dirLight);

        this.fillLight = new THREE.HemisphereLight(0x88aaff, 0x1a1d2b, 0.34);
        this.scene.add(this.fillLight);

        this._setupComposer(W, H);

        this._buildStars();
        this._buildMoon();
        this._buildClouds();
        this._buildSkyIslands();
        this.balloonLodDistance = this._getAdaptiveBalloonLodDistance();

        this.isLight = document.body.classList.contains('light');
        this.dayNightMix = this.isLight ? 1 : 0;
        this.dayNightTarget = this.dayNightMix;
        this._applyDayNightBlend(this.dayNightMix);

        this._setupInput();
        this._setupKeyboard();

        if (!this._onResizeBound) {
            this._onResizeBound = () => this._onResize();
            window.addEventListener('resize', this._onResizeBound);
        }

        this.isReady = true;
        this._loop();
    },

    setDayNightMode(isLight, animate = true) {
        this.isLight = !!isLight;
        this.dayNightTarget = this.isLight ? 1 : 0;
        if (!animate) {
            this.dayNightMix = this.dayNightTarget;
            this._applyDayNightBlend(this.dayNightMix);
        }
    },

    _applyDayNightBlend(mix) {
        if (!this.scene) return;

        const nightBg = new THREE.Color(0x050814);
        const dayBg = new THREE.Color(0x87ceeb);
        const fogNight = new THREE.Color(0x060814);
        const fogDay = new THREE.Color(0xb0d8f0);

        if (!this.scene.background || !this.scene.background.isColor) {
            this.scene.background = nightBg.clone();
        }
        this.scene.background.copy(nightBg).lerp(dayBg, mix);

        const fogColor = fogNight.clone().lerp(fogDay, mix);
        const fogDensity = 0.00012 * (1 - mix) + 0.00004 * mix;
        if (!this.scene.fog || !this.scene.fog.isFogExp2) {
            this.scene.fog = new THREE.FogExp2(fogColor, fogDensity);
        } else {
            this.scene.fog.color.copy(fogColor);
            this.scene.fog.density = fogDensity;
        }

        if (this.dirLight) {
            const nightColor = new THREE.Color(0x8090ff);
            const dayColor = new THREE.Color(0xfffde0);
            this.dirLight.color.copy(nightColor).lerp(dayColor, mix);
            this.dirLight.intensity = 0.6 + mix * 1.6;
            this.dirLight.position.set(300 + mix * 300, 500 + mix * 300, 600);
        }

        if (this.ambientLight) {
            const nightColor = new THREE.Color(0x8090c0);
            const dayColor = new THREE.Color(0xffffff);
            this.ambientLight.color.copy(nightColor).lerp(dayColor, mix);
            this.ambientLight.intensity = 0.65 + mix * 0.45;
        }

        if (this.fillLight) {
            this.fillLight.intensity = 0.34 - mix * 0.16;
        }

        if (this.starMaterial) {
            this.starMaterial.uniforms.uGlobalAlpha.value = 1 - mix;
        }
        if (this.stars) this.stars.visible = (1 - mix) > 0.01;

        if (this.galaxy?.material) {
            this.galaxy.material.opacity = (1 - mix) * 0.7;
            this.galaxy.visible = (1 - mix) > 0.01;
        }

        if (this.moon?.material) {
            this.moon.material.opacity = 1 - mix;
            this.moon.visible = (1 - mix) > 0.01;
        }
        if (this.moonGlow?.material) {
            this.moonGlow.material.opacity = (1 - mix) * 0.18;
            this.moonGlow.visible = (1 - mix) > 0.01;
        }

        if (this.sun?.material) {
            this.sun.material.opacity = mix;
            this.sun.visible = mix > 0.01;
        }
        if (this.sunGlow?.material) {
            this.sunGlow.material.opacity = mix * 0.25;
            this.sunGlow.visible = mix > 0.01;
        }

        this.clouds.forEach(c => {
            c.visible = true;
            c.traverse(child => {
                if (child.material) child.material.opacity = 0.88 * mix;
            });
        });

        this.skyIslands.forEach(island => {
            island.children.forEach(child => {
                if (child.material && child.geometry && child.geometry.type === 'CylinderGeometry' && child.position.y > 0) {
                    const nightGrass = new THREE.Color(0x2d5a3d);
                    const dayGrass = new THREE.Color(0x6fbf73);
                    child.material.color.copy(nightGrass).lerp(dayGrass, mix);
                }
            });
        });
    },

    _buildStars() {
        const N = 3000;
        const positions = new Float32Array(N * 3);
        const sizes = new Float32Array(N);
        const phases = new Float32Array(N);
        const colors = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 4000 + Math.random() * 1000;
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
            uniforms: { uTime: { value: 0 }, uGlobalAlpha: { value: 1 } },
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
                uniform float uGlobalAlpha;
                void main() {
                    float d = length(gl_PointCoord - vec2(0.5));
                    if (d > 0.5) discard;
                    float alpha = (1.0 - d * 2.0) * vTwinkle * uGlobalAlpha;
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
        const geo = new THREE.PlaneGeometry(5000, 2000);
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
        galaxy.position.set(0, 300, -3500);
        galaxy.visible = true;
        this.galaxy = galaxy;
        this.scene.add(galaxy);
        if (this.stars) {
            this.galaxy.visible = !this.isLight;
        }
    },

    _buildMoon() {
        const geo = new THREE.CircleGeometry(60, 64);
        const mat = new THREE.ShaderMaterial({
            uniforms: {},
            vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
            fragmentShader: `
                varying vec2 vUv;
                void main() {
                    vec2 c = vUv - vec2(0.5);
                    float d = length(c);
                    if (d > 0.5) discard;
                    float edge = 1.0 - smoothstep(0.44, 0.5, d);

                    // Keep the moon disc centered and fake the crescent with internal shading.
                    // This avoids the visual offset between moon core and moon glow.
                    vec2 shadowCenter = c - vec2(0.18, -0.1);
                    float shadowD = length(shadowCenter);
                    float lit = smoothstep(0.30, 0.48, shadowD);

                    vec3 darkSide = vec3(0.42, 0.40, 0.38);
                    vec3 brightSide = vec3(0.98, 0.96, 0.85);
                    vec3 moonCol = mix(darkSide, brightSide, lit);

                    gl_FragColor = vec4(moonCol, edge);
                }
            `,
            transparent: true, depthWrite: false
        });
        this.moon = new THREE.Mesh(geo, mat);
        this.moon.position.set(-800, 700, -2500);
        this.moon.visible = !this.isLight;
        this.scene.add(this.moon);

        const glowGeo = new THREE.CircleGeometry(180, 32);
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

        const sunGeo = new THREE.CircleGeometry(70, 64);
        const sunMat = new THREE.ShaderMaterial({
            uniforms: {},
            vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
            fragmentShader: `varying vec2 vUv; void main() { float d = length(vUv - vec2(0.5)); if(d > 0.5) discard; vec3 col = mix(vec3(1.0, 0.98, 0.7), vec3(1.0, 0.85, 0.3), d * 2.0); float a = 1.0 - smoothstep(0.42, 0.5, d); gl_FragColor = vec4(col, a); }`,
            transparent: true, depthWrite: false
        });
        this.sun = new THREE.Mesh(sunGeo, sunMat);
        this.sun.position.set(900, 700, -2500);
        this.sun.visible = this.isLight;
        this.scene.add(this.sun);

        const sunGlowGeo = new THREE.CircleGeometry(300, 32);
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
            { x: -700, y: 380, z: -600, scale: 1.4, type: 'normal' },
            { x: 300, y: 440, z: -700, scale: 1.0, type: 'normal' },
            { x: 900, y: 360, z: -500, scale: 0.8, type: 'wispy' },
            { x: -300, y: 500, z: -800, scale: 1.2, type: 'large' },
            { x: 600, y: 300, z: -400, scale: 0.7, type: 'wispy' },
            { x: -1400, y: 450, z: -550, scale: 1.6, type: 'large' },
            { x: 1200, y: 520, z: -900, scale: 1.1, type: 'normal' },
            { x: -500, y: 280, z: -350, scale: 0.6, type: 'wispy' },
            { x: 1500, y: 400, z: -650, scale: 1.3, type: 'large' },
            { x: -1100, y: 340, z: -450, scale: 0.9, type: 'normal' },
            { x: 400, y: 560, z: -750, scale: 1.8, type: 'storm' },
            { x: -800, y: 600, z: -1000, scale: 2.0, type: 'large' },
            { x: 1800, y: 320, z: -500, scale: 0.5, type: 'wispy' },
            { x: -1600, y: 480, z: -700, scale: 1.5, type: 'storm' },
            { x: 0, y: 550, z: -850, scale: 1.0, type: 'wispy' },
        ];
        cloudData.forEach((d, idx) => {
            const cloud = d.type === 'wispy' ? this._makeWispyCloud(d.scale)
                        : d.type === 'large' ? this._makeLargeCumulus(d.scale)
                        : d.type === 'storm' ? this._makeStormCloud(d.scale)
                        : this._makeCloud(d.scale);
            cloud.position.set(d.x, d.y, d.z);
            cloud.userData.baseX = d.x;
            cloud.userData.speed = 0.03 + (idx % 5) * 0.008;
            cloud.renderOrder = -10;
            cloud.visible = this.isLight;
            this.clouds.push(cloud);
            this.scene.add(cloud);
        });
    },

    _buildFireflies() {
        const count = 120;
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const phases = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            positions[i * 3]     = (Math.random() - 0.5) * 6000;
            positions[i * 3 + 1] = Math.random() * 800 + 100;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 6000;
            phases[i] = Math.random() * Math.PI * 2;
        }
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
        const mat = new THREE.PointsMaterial({
            color: 0xaaffaa, size: 5, transparent: true, opacity: 0.7,
            depthWrite: false, blending: THREE.AdditiveBlending
        });
        this._fireflies = new THREE.Points(geo, mat);
        this._fireflies.visible = !this.isLight;
        this._fireflyPhases = phases;
        this.scene.add(this._fireflies);
    },

    _buildSkyIslands() {
        const islandData = [
            { x: -900, y: -60, z: -800, rx: 2.0, name: '관악 샤 아일랜드', university: '서울대학교', landmark: '서울대학교 · 서울대 정문·샤 조형물', type: 'forest', admissionUrl: 'https://admission.snu.ac.kr', admissionNote: '수시/정시 모집요강과 전형별 공지 확인' },
            { x:  700, y: -80, z: -600, rx: 1.6, name: '신촌 독수리 아일랜드', university: '연세대학교', landmark: '연세대학교 · 언더우드관·독수리 상징', type: 'crystal', admissionUrl: 'https://admission.yonsei.ac.kr', admissionNote: '전형 일정 및 모집 단위 확인' },
            { x:  200, y: -50, z:-1000, rx: 1.2, name: '안암 호랑이 아일랜드', university: '고려대학교', landmark: '고려대학교 · 중앙광장·호랑이 상징', type: 'misty', admissionUrl: 'https://oku.korea.ac.kr', admissionNote: '정시/수시 입학전형 세부사항 확인' },
            { x:-1200, y: -70, z: -400, rx: 1.8, name: '대덕 사이언스 아일랜드', university: '카이스트', landmark: 'KAIST · 본원 상징 조형·과학광장', type: 'waterfall', admissionUrl: 'https://admission.kaist.ac.kr', admissionNote: '창의도전전형 및 일반전형 안내 확인' },
            { x: 1400, y: -55, z: -700, rx: 2.2, name: '포스텍 스틸 아일랜드', university: '포항공과대학교', landmark: 'POSTECH · 지곡회관·상징 조형물', type: 'flower', admissionUrl: 'https://adm.postech.ac.kr', admissionNote: '입학전형/장학제도/공지사항 확인' },
            { x:-1600, y: -90, z: -900, rx: 1.4, name: '인문명륜 아일랜드', university: '성균관대학교', landmark: '성균관대학교 · 명륜당·은행나무 상징', type: 'rock', admissionUrl: 'https://admission.skku.edu', admissionNote: '캠퍼스별 모집요강 및 전형안내 확인' },
            { x:  500, y: -40, z:-1200, rx: 1.9, name: '사자 한양 아일랜드', university: '한양대학교', landmark: '한양대학교 · 사자상·본관 라인', type: 'star', admissionUrl: 'https://go.hanyang.ac.kr', admissionNote: '전형 일정, 경쟁률, 모집요강 확인' },
            { x:-600,  y: -75, z: -500, rx: 1.5, name: '흑석 청룡 아일랜드', university: '중앙대학교', landmark: '중앙대학교 · 청룡상·중앙마루', type: 'rainbow', admissionUrl: 'https://admission.cau.ac.kr', admissionNote: '학과별 전형요소 및 합격자 발표일 확인' },
            { x: 1800, y: -65, z: -400, rx: 2.4, name: '평화의 전당 아일랜드', university: '경희대학교', landmark: '경희대학교 · 평화의전당·캠퍼스 로드', type: 'fortress', admissionUrl: 'https://iphak.khu.ac.kr', admissionNote: '캠퍼스별 모집 인원과 전형계획 확인' },
            { x:-2000, y: -85, z: -600, rx: 1.3, name: '서강 알바트로스 아일랜드', university: '서강대학교', landmark: '서강대학교 · 본관·알바트로스 상징', type: 'moon', admissionUrl: 'https://admission.sogang.ac.kr', admissionNote: '모집요강, FAQ, 공지사항 확인' },
            { x: 1100, y: -45, z:-1100, rx: 1.7, name: '이화 유레카 아일랜드', university: '이화여자대학교', landmark: '이화여자대학교 · ECC·유레카 상징', type: 'dragon', admissionUrl: 'https://admission.ewha.ac.kr', admissionNote: '전형별 지원자격 및 제출서류 확인' },
            { x:-400,  y: -95, z: -300, rx: 2.1, name: '금정 교정 아일랜드', university: '부산대학교', landmark: '부산대학교 · 금정캠퍼스·정문 상징', type: 'wind', admissionUrl: 'https://go.pusan.ac.kr', admissionNote: '정시/수시 모집단위와 일정 확인' },
        ];
        islandData.forEach(d => {
            const group = new THREE.Group();

            // Top cap (grass surface)
            const topColor = d.type === 'crystal' ? 0x6ba3c7 : d.type === 'flower' ? 0x7dba6f
                           : d.type === 'star' ? 0x4a5a8a : d.type === 'dragon' ? 0x8a5a4a
                           : 0x3a7d44;
            const topGeo = new THREE.CylinderGeometry(d.rx * 90, d.rx * 80, 30, 12);
            const topMat = new THREE.MeshStandardMaterial({ color: topColor, roughness: 0.9, metalness: 0 });
            const top = new THREE.Mesh(topGeo, topMat);
            top.position.y = 15;
            group.add(top);

            // Stone base
            const botColor = d.type === 'crystal' ? 0x4a7a9a : d.type === 'dragon' ? 0x5a3020 : 0x6b4226;
            const botGeo = new THREE.CylinderGeometry(d.rx * 60, d.rx * 30, 80, 10);
            const botMat = new THREE.MeshStandardMaterial({ color: botColor, roughness: 1.0, metalness: 0 });
            const bot = new THREE.Mesh(botGeo, botMat);
            bot.position.y = -25;
            group.add(bot);

            // Decorations based on island type
            if (d.type === 'forest' || d.type === 'flower') {
                for (let t = 0; t < 4; t++) {
                    const treeGeo = new THREE.ConeGeometry(d.rx * 12, d.rx * 35, 6);
                    const treeMat = new THREE.MeshStandardMaterial({
                        color: d.type === 'flower' ? 0xe8a0c0 : 0x2d6e30,
                        roughness: 0.9, metalness: 0
                    });
                    const tree = new THREE.Mesh(treeGeo, treeMat);
                    const angle = (t / 4) * Math.PI * 2;
                    tree.position.set(Math.cos(angle) * d.rx * 40, 45, Math.sin(angle) * d.rx * 40);
                    group.add(tree);
                }
            } else if (d.type === 'crystal') {
                for (let c = 0; c < 5; c++) {
                    const crystalGeo = new THREE.OctahedronGeometry(d.rx * 8 + c * 3, 0);
                    const crystalMat = new THREE.MeshStandardMaterial({
                        color: 0x88ccff, roughness: 0.2, metalness: 0.6,
                        transparent: true, opacity: 0.8
                    });
                    const crystal = new THREE.Mesh(crystalGeo, crystalMat);
                    const angle = (c / 5) * Math.PI * 2;
                    crystal.position.set(Math.cos(angle) * d.rx * 35, 35 + c * 8, Math.sin(angle) * d.rx * 35);
                    crystal.rotation.set(Math.random(), Math.random(), Math.random());
                    group.add(crystal);
                }
            } else if (d.type === 'waterfall') {
                const fallGeo = new THREE.PlaneGeometry(d.rx * 20, 80);
                const fallMat = new THREE.MeshBasicMaterial({
                    color: 0x88ccff, transparent: true, opacity: 0.5,
                    side: THREE.DoubleSide
                });
                const fall = new THREE.Mesh(fallGeo, fallMat);
                fall.position.set(d.rx * 50, -20, 0);
                group.add(fall);
            } else if (d.type === 'fortress') {
                for (let tw = 0; tw < 3; tw++) {
                    const towerGeo = new THREE.CylinderGeometry(d.rx * 10, d.rx * 12, d.rx * 50, 8);
                    const towerMat = new THREE.MeshStandardMaterial({ color: 0x8a8a7a, roughness: 0.8, metalness: 0.1 });
                    const tower = new THREE.Mesh(towerGeo, towerMat);
                    const angle = (tw / 3) * Math.PI * 2;
                    tower.position.set(Math.cos(angle) * d.rx * 50, 40, Math.sin(angle) * d.rx * 50);
                    group.add(tower);
                }
            } else if (d.type === 'wind') {
                const poleGeo = new THREE.CylinderGeometry(d.rx * 3, d.rx * 4, d.rx * 60, 6);
                const poleMat = new THREE.MeshStandardMaterial({ color: 0xccccbb, roughness: 0.7, metalness: 0.2 });
                const pole = new THREE.Mesh(poleGeo, poleMat);
                pole.position.y = 50;
                group.add(pole);
            }

            group.position.set(d.x, d.y, d.z);
            group.userData.baseY = d.y;
            group.userData.name = d.name;
            group.userData.university = d.university || null;
            group.userData.landmark = d.landmark;
            group.userData.admissionUrl = d.admissionUrl || null;
            group.userData.admissionNote = d.admissionNote || null;
            group.userData.floatSpeed = 0.4 + Math.random() * 0.3;
            group.userData.floatPhase = Math.random() * Math.PI * 2;
            this.scene.add(group);
            this.skyIslands.push(group);
        });
    },

    // ── Seed-based world generation ──────────────────────────────────────────

    /**
     * Mulberry32 seeded PRNG – fast, dependency-free.
     * Returns a function that generates floats in [0, 1).
     */
    _seededRng(seed) {
        let s = seed >>> 0;
        return function rng() {
            s |= 0;
            s = s + 0x6D2B79F5 | 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    },

    /**
     * Build the seed-based world: scattered clouds, distant buildings, and
     * interactable sky-island portals.  All clients with the same seed will
     * produce an identical layout, so there is no need to transmit positions
     * over the network.
     *
     * Called once when the server sends 'world:seed'.  A second call with the
     * same seed is idempotent (previous props are removed first).
     */
    initSeed(seed) {
        // Remove any previously generated seeded props.
        this.seededProps.forEach(m => this.scene.remove(m));
        this.seededProps = [];
        this.interactableProps.forEach(p => this.scene.remove(p.group));
        this.interactableProps = [];

        const rng = this._seededRng(seed);

        // ── Scattered background clouds (various types) ─────────────────
        // 60 clouds distributed across the massive world, deterministic positions.
        const CLOUD_SPREAD_X = WORLD_HALF * WORLD_SCALE * 0.85;
        const CLOUD_SPREAD_Y = 8000;
        const cloudTypes = ['normal', 'wispy', 'large', 'storm'];
        for (let i = 0; i < 60; i++) {
            const cx = (rng() - 0.5) * 2 * CLOUD_SPREAD_X;
            const cy = (rng() - 0.5) * CLOUD_SPREAD_Y;
            const cz = -400 - rng() * 600;
            const scale = 0.3 + rng() * 1.2;
            const type = cloudTypes[Math.floor(rng() * cloudTypes.length)];
            const cloud = type === 'wispy'  ? this._makeWispyCloud(scale)
                        : type === 'large'  ? this._makeLargeCumulus(scale)
                        : type === 'storm'  ? this._makeStormCloud(scale)
                        : this._makeCloud(scale);
            cloud.position.set(cx, cy, cz);
            cloud.userData.baseX  = cx;
            cloud.userData.speed  = 0.005 + rng() * 0.025;
            cloud.renderOrder = -10;
            cloud.visible = this.isLight;
            this.clouds.push(cloud);
            this.scene.add(cloud);
            this.seededProps.push(cloud);
        }

        // ── Background buildings / towers (visual only) ──────────────────
        const BUILDING_SPREAD = WORLD_HALF * WORLD_SCALE * 0.75;
        for (let i = 0; i < 60; i++) {
            const bx = (rng() - 0.5) * 2 * BUILDING_SPREAD;
            const by = -200 - rng() * 150;
            const bz = -800 - rng() * 800;
            const h  = 80 + rng() * 250;
            const w  = 30 + rng() * 60;
            const geo = new THREE.BoxGeometry(w, h, w * 0.8);
            const grey = 0.18 + rng() * 0.2;
            const mat = new THREE.MeshStandardMaterial({
                color: new THREE.Color(grey, grey, grey + 0.05),
                roughness: 0.95, metalness: 0.05,
                transparent: true, opacity: 0.75,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(bx, by + h / 2, bz);
            this.scene.add(mesh);
            this.seededProps.push(mesh);
        }

        // ── Floating rocks / debris ──────────────────────────────────────
        const ROCK_SPREAD = WORLD_HALF * WORLD_SCALE * 0.7;
        for (let i = 0; i < 80; i++) {
            const rx = (rng() - 0.5) * 2 * ROCK_SPREAD;
            const ry = (rng() - 0.5) * 4000;
            const rz = -300 - rng() * 900;
            const size = 10 + rng() * 40;
            const geo = new THREE.DodecahedronGeometry(size, 0);
            const shade = 0.3 + rng() * 0.3;
            const mat = new THREE.MeshStandardMaterial({
                color: new THREE.Color(shade, shade * 0.9, shade * 0.8),
                roughness: 0.95, metalness: 0.05,
                transparent: true, opacity: 0.7,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(rx, ry, rz);
            mesh.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
            mesh.userData.baseY = ry;
            mesh.userData.floatSpeed = 0.2 + rng() * 0.4;
            mesh.userData.floatPhase = rng() * Math.PI * 2;
            this.scene.add(mesh);
            this.seededProps.push(mesh);
        }

        // ── Crystal formations ───────────────────────────────────────────
        const CRYSTAL_SPREAD = WORLD_HALF * WORLD_SCALE * 0.6;
        for (let i = 0; i < 25; i++) {
            const group = new THREE.Group();
            const cx2 = (rng() - 0.5) * 2 * CRYSTAL_SPREAD;
            const cy2 = (rng() - 0.5) * 3000;
            const cz2 = -500 - rng() * 700;
            const numCrystals = 3 + Math.floor(rng() * 4);
            const hue = rng();
            for (let j = 0; j < numCrystals; j++) {
                const crystalSize = 8 + rng() * 20;
                const geo = new THREE.OctahedronGeometry(crystalSize, 0);
                const color = new THREE.Color().setHSL(hue, 0.5 + rng() * 0.3, 0.5 + rng() * 0.2);
                const mat = new THREE.MeshStandardMaterial({
                    color, roughness: 0.15, metalness: 0.7,
                    transparent: true, opacity: 0.75,
                });
                const mesh = new THREE.Mesh(geo, mat);
                mesh.position.set(
                    (rng() - 0.5) * 40,
                    rng() * 30,
                    (rng() - 0.5) * 40
                );
                mesh.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
                group.add(mesh);
            }
            group.position.set(cx2, cy2, cz2);
            group.userData.baseY = cy2;
            group.userData.floatSpeed = 0.15 + rng() * 0.25;
            group.userData.floatPhase = rng() * Math.PI * 2;
            this.scene.add(group);
            this.seededProps.push(group);
        }

        // ── Light pillars / beacons ──────────────────────────────────────
        const PILLAR_SPREAD = WORLD_HALF * WORLD_SCALE * 0.65;
        for (let i = 0; i < 15; i++) {
            const px = (rng() - 0.5) * 2 * PILLAR_SPREAD;
            const py = -80;
            const pz = -600 - rng() * 600;
            const height = 200 + rng() * 400;
            const geo = new THREE.CylinderGeometry(3, 3, height, 6);
            const hue2 = rng();
            const color = new THREE.Color().setHSL(hue2, 0.6, 0.6);
            const mat = new THREE.MeshBasicMaterial({
                color, transparent: true, opacity: 0.25,
                depthWrite: false, blending: THREE.AdditiveBlending,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(px, py + height / 2, pz);
            this.scene.add(mesh);
            this.seededProps.push(mesh);
        }

        // ── Interactable sky-island portals ───────────────────────────────
        // 20 interactable islands spread across the large world.
        const ISLAND_SPREAD = WORLD_HALF * WORLD_SCALE * 0.65;
        const islandNames = [
            '별의 섬', '황금 섬', '구름 섬', '달빛 섬',
            '바람 섬', '불꽃 섬', '물결 섬', '숲의 섬',
            '얼음 섬', '번개 섬', '태양 섬', '은하 섬',
            '꿈의 섬', '미래 섬', '고대 섬', '환상 섬',
            '평화 섬', '용기 섬', '지혜 섬', '희망 섬',
        ];
        for (let i = 0; i < 20; i++) {
            const wx = (rng() - 0.5) * 2 * ISLAND_SPREAD;
            const wy = (rng() - 0.5) * 2500;
            const wz = -500 - rng() * 600;
            const rx = 1.0 + rng() * 1.5;
            const propId = `island_${seed}_${i}`;
            const name = islandNames[i % islandNames.length];
            const prop = new InteractableProp(propId, name, wx, wy, wz, rx, this.scene, (id, activated) => {
                if (this.onInteraction) this.onInteraction(id, activated);
            });
            prop.group.userData.floatSpeed = 0.3 + rng() * 0.4;
            prop.group.userData.floatPhase = rng() * Math.PI * 2;
            this.interactableProps.push(prop);
        }
    },

    /** Apply an interaction-state update received from the server. */
    setInteractionState(propId, activated) {
        const prop = this.interactableProps.find(p => p.id === propId);
        if (prop) prop.setActivated(activated);
    },

    _createClickParticle(x, y, z) {
        const count = 8;
        for (let i = 0; i < count; i++) {
            const geo = new THREE.SphereGeometry(3 + Math.random() * 4, 4, 4);
            const mat = new THREE.MeshBasicMaterial({
                color: 0xD4AF37, transparent: true, opacity: 1, depthWrite: false
            });
            const p = new THREE.Mesh(geo, mat);
            p.position.set(x + (Math.random()-0.5)*20, y + (Math.random()-0.5)*20, z);
            const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
            const speed = 5 + Math.random() * 8;
            p.userData.vx = Math.cos(angle) * speed;
            p.userData.vy = Math.sin(angle) * speed + 4;
            p.userData.vz = (Math.random()-0.5) * 3;
            p.userData.life = 1.0;
            this.scene.add(p);
            this.clickParticles.push(p);
        }
    },

    _makeCloud(scale) {
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, transparent: true, opacity: 0.6 });
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

    _makeWispyCloud(scale) {
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0xf0f4ff, roughness: 1, metalness: 0, transparent: true, opacity: 0.4 });
        const blobs = [
            { x: 0,     y: 0,   s: 35 * scale },
            { x: 100,   y: -5,  s: 25 * scale },
            { x: -90,   y: 5,   s: 28 * scale },
            { x: 160,   y: -8,  s: 20 * scale },
            { x: -150,  y: 3,   s: 22 * scale },
            { x: 50,    y: 10,  s: 18 * scale },
            { x: -40,   y: -8,  s: 20 * scale },
        ];
        blobs.forEach(b => {
            // Stretched horizontally + flattened vertically for a wispy look.
            const geo = new THREE.SphereGeometry(b.s, 8, 6);
            geo.scale(1.8, 0.5, 1.0);
            const m = new THREE.Mesh(geo, mat);
            m.position.set(b.x, b.y, 0);
            group.add(m);
        });
        return group;
    },

    _makeLargeCumulus(scale) {
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, transparent: true, opacity: 0.7 });
        const blobs = [
            { x: 0,     y: 0,    s: 90 * scale },
            { x: 110,   y: -20,  s: 75 * scale },
            { x: -100,  y: -15,  s: 70 * scale },
            { x: 55,    y: 50,   s: 65 * scale },
            { x: -45,   y: 45,   s: 55 * scale },
            { x: 140,   y: 10,   s: 50 * scale },
            { x: -130,  y: 5,    s: 45 * scale },
            { x: 0,     y: 65,   s: 60 * scale },
        ];
        blobs.forEach(b => {
            const geo = new THREE.SphereGeometry(b.s, 12, 10);
            const m = new THREE.Mesh(geo, mat);
            m.position.set(b.x, b.y, 0);
            group.add(m);
        });
        return group;
    },

    _makeStormCloud(scale) {
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0x8090a0, roughness: 1, metalness: 0, transparent: true, opacity: 0.65 });
        const blobs = [
            { x: 0,     y: 0,    s: 80 * scale },
            { x: 120,   y: -25,  s: 70 * scale },
            { x: -110,  y: -20,  s: 65 * scale },
            { x: 50,    y: 40,   s: 60 * scale },
            { x: -60,   y: 35,   s: 55 * scale },
            { x: 0,     y: -40,  s: 75 * scale },
            { x: 80,    y: -50,  s: 50 * scale },
            { x: -70,   y: -45,  s: 55 * scale },
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
        ctx.strokeStyle = isMe ? 'rgba(49,130,246,0.7)' : 'rgba(255,255,255,0.15)';
        ctx.lineWidth = isMe ? 2 : 1;
        ctx.stroke();
        ctx.fillStyle = isMe ? '#3182F6' : '#E8E8ED';
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
        ctx.fillStyle = isMe ? 'rgba(49,130,246,0.92)' : 'rgba(240,242,255,0.94)';
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
        group.renderOrder = 100;

        // Get color scheme from skin
        const skinId = user.balloon_skin || 'default';
        const auraId = user.balloon_aura || 'none';

        // Create 3D balloon instead of 2D plane
        const scale = isMe ? 2.0 : 1.25;
        const balloon3D = create3DBalloon(scale, skinId, isMe);
        balloon3D.position.y = isMe ? 80 : 50;
        balloon3D.renderOrder = 100;

        // Keep a stable reference to the primary balloon envelope mesh.
        const balloonMesh = balloon3D.userData?.colorParts?.primary?.[0] || balloon3D.children[0];
        group.userData.balloon = balloonMesh;

        group.add(balloon3D);

        const shadowGeo = new THREE.CircleGeometry(isMe ? 55 : 35, 24);
        const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false });
        const shadow = new THREE.Mesh(shadowGeo, shadowMat);
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = -80;
        group.add(shadow);

        const labelCanvas = this._makeLabel(user, isMe);
        const labelTex = new THREE.CanvasTexture(labelCanvas);
        const labelGeo = new THREE.PlaneGeometry(120, 38);
        const labelMat = new THREE.MeshBasicMaterial({
            map: labelTex,
            transparent: true,
            depthWrite: false,
            depthTest: false
        });
        const label = new THREE.Mesh(labelGeo, labelMat);
        label.position.y = isMe ? -58 : -36;
        label.renderOrder = 220;
        group.add(label);

        let bubbleMesh = null;
        if (user.status_message) {
            const bubbleCanvas = this._makeBubble(user.status_message, isMe);
            const bubbleTex = new THREE.CanvasTexture(bubbleCanvas);
            const bubbleGeo = new THREE.PlaneGeometry(isMe ? 145 : 110, isMe ? 52 : 42);
            const bubbleMat = new THREE.MeshBasicMaterial({
                map: bubbleTex,
                transparent: true,
                depthWrite: false,
                depthTest: false
            });
            bubbleMesh = new THREE.Mesh(bubbleGeo, bubbleMat);
            bubbleMesh.position.y = isMe ? 205 : 135;
            bubbleMesh.renderOrder = 230;
            group.add(bubbleMesh);
        }

        // Keep explicit references used by click handlers/animations.
        group.userData = {
            userId: user.id,
            user,
            balloon: balloonMesh,
            balloon3D,
            label,
            bubbleMesh,
            isMe,
            baseY: 0,
            isLowDetail: false,
            auraId,
            auraGroup: null,
            auraMats: []
        };

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

        this._updateBalloonAura(group, auraId, isMe);

        this.scene.add(group);
        this.balloons.set(user.id, {
            group,
            user,
            isMe,
            kind: isMe ? 'self' : 'ranking',
            isBackground: false,
            lastSeenAt: Date.now()
        });
        if (isMe) this.myBalloon = this.balloons.get(user.id);

        group.userData.clickable = true;
        return group;
    },

    _removeBalloonById(userId) {
        const b = this.balloons.get(userId);
        if (!b) return;
        this.scene.remove(b.group);
        this.balloons.delete(userId);
        if (this.myBalloon === b) this.myBalloon = null;
    },

    _ensureMyBalloon(me) {
        if (!me || me.id == null) return;

        const skinId = me.balloon_skin || 'default';
        const auraId = me.balloon_aura || 'none';
        let b = this.balloons.get(me.id);

        if (!b) {
            const grp = this.addBalloon(me, null, true);
            grp.position.set(0, 0, 0);
            grp.userData.baseY = 0;
            b = this.balloons.get(me.id);
        }
        if (!b) return;

        b.isMe = true;
        b.kind = 'self';
        b.isBackground = false;
        b.user = { ...b.user, ...me };
        b.group.userData.user = b.user;
        if (!Number.isFinite(b.group.position.x)) b.group.position.x = 0;
        if (!Number.isFinite(b.group.userData.baseY)) b.group.userData.baseY = 0;
        b.group.visible = true;
        this._updateBalloonColor(b.group, skinId);
        this._updateBalloonAura(b.group, auraId, true);
        this.myBalloon = b;
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
            const bubbleMat = new THREE.MeshBasicMaterial({
                map: bubbleTex,
                transparent: true,
                depthWrite: false,
                depthTest: false
            });
            const bubbleMesh = new THREE.Mesh(bubbleGeo, bubbleMat);
            bubbleMesh.position.y = b.isMe ? 205 : 135;
            bubbleMesh.renderOrder = 230;
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
            const clr = isFriend ? '#00C471' : 'rgba(200,210,230,0.9)';
            const bg = isFriend ? 'rgba(0,196,113,0.10)' : 'rgba(15,18,30,0.78)';
            const border = isFriend ? '1px solid rgba(0,196,113,0.4)' : '1px solid rgba(255,255,255,0.12)';
            const prefix = isFriend ? '<span style="margin-right:3px;font-size:8px;opacity:0.8">●</span>' : '';
            return `<div style="position:absolute;left:${ex}px;top:${ey}px;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:3px;">
                <div style="font-size:14px;color:${clr};transform:rotate(${angle + 90}deg);filter:drop-shadow(0 0 3px rgba(0,0,0,0.8));line-height:1">▲</div>
                <div style="background:${bg};border:${border};color:${clr};font-family:'Pretendard Variable',sans-serif;font-size:10px;padding:3px 8px;border-radius:10px;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:flex;align-items:center;">${prefix}${user.nickname}</div>
            </div>`;
        }).join('');
    },

    /**
     * Populate / refresh the balloon layer.
     *
     * If a user object has `worldX` / `worldY` fields (provided by the
     * socket-based nearby-player snapshot), those world-unit coordinates are
     * used to place the balloon relative to the camera.  Otherwise the legacy
     * deterministic spiral layout is used for the REST-API ranking list.
     *
     * Chunk-based culling: balloons whose world position is further than
     * CHUNK_SIZE × 3 world-units from the viewer are hidden regardless of
     * whether they are inside or outside the frustum, keeping the visible set
     * small when 1,000 players are spread across the map.
     */
    setUsers(users, me, isLight) {
        this.setDayNightMode(isLight, true);
        this._ensureMyBalloon(me);

        const rankingList = (users || []).filter(u => !me || u.id !== me.id).slice(0, 3000);
        const keepRankingIds = new Set(rankingList.map(u => u.id));

        this.balloons.forEach((b, id) => {
            if (b.isMe) return;
            if (b.kind === 'nearby') return;
            if (!keepRankingIds.has(id)) this._removeBalloonById(id);
        });

        const CULL_SCENE = CHUNK_SIZE * 3 * WORLD_SCALE;
        rankingList.forEach((user, i) => {
            let sx, sy, sz;

            if (typeof user.worldX === 'number' && typeof user.worldY === 'number') {
                sx = worldToScene(user.worldX);
                sy = worldToScene(user.worldY);
                sz = Math.sin(user.id * 3.7) * 40;
            } else {
                const angle = i * 137.508;
                const radius = 260 + Math.sqrt(i) * 160;
                sx = radius * Math.cos(angle * Math.PI / 180);
                sy = radius * Math.sin(angle * Math.PI / 180);
                sz = Math.sin(i * 3.7) * 80;
            }

            const skinId = user.balloon_skin || 'default';
            const auraId = user.balloon_aura || 'none';
            const distFromCam = Math.hypot(sx - this.camPos.x, sy - this.camPos.y);
            const visible = distFromCam <= CULL_SCENE;

            let b = this.balloons.get(user.id);
            if (!b) {
                const grp = this.addBalloon(user, null, false);
                grp.position.set(sx, sy, sz);
                grp.userData.baseY = sy;
                b = this.balloons.get(user.id);
            }
            if (!b || b.isMe || b.kind === 'nearby') return;

            b.kind = 'ranking';
            b.isBackground = false;
            b.user = { ...b.user, ...user };
            b.group.userData.user = b.user;
            b.group.position.set(sx, sy, sz);
            b.group.userData.baseY = sy;
            b.group.userData.targetX = undefined;
            b.group.userData.targetY = undefined;
            this._updateBalloonColor(b.group, skinId);
            this._updateBalloonAura(b.group, auraId, false);

            b.group.visible = visible;
            if (b.group.userData.label) b.group.userData.label.visible = visible && distFromCam < CULL_SCENE * 0.5;
            if (b.group.userData.bubbleMesh) b.group.userData.bubbleMesh.visible = visible && distFromCam < CULL_SCENE * 0.35;
        });
    },

    /**
     * Receive the authoritative nearby-player list from socket.io and update
     * balloon positions in real time.  Players that are no longer nearby are
     * removed from the scene.
     */
    updateWorldPlayers(players, me) {
        const now = Date.now();
        this._ensureMyBalloon(me);

        const nearbyUsers = (players || []).filter(u => !me || u.id !== me.id);
        const nearbyIds = new Set(nearbyUsers.map(u => u.id));

        this.balloons.forEach((b, id) => {
            if (b.isMe) return;
            if (b.kind !== 'nearby') return;
            if (!nearbyIds.has(id) && now - (b.lastSeenAt || 0) > REMOTE_STALE_REMOVE_MS) {
                this._removeBalloonById(id);
            }
        });

        nearbyUsers.forEach((user) => {
            const skinId = user.balloon_skin || 'default';
            const auraId = user.balloon_aura || 'none';
            const sx = worldToScene(user.worldX);
            const sy = worldToScene(user.worldY);
            const sz = Math.sin(user.id * 3.7) * 40;

            let b = this.balloons.get(user.id);
            if (!b) {
                const grp = this.addBalloon(user, null, false);
                grp.position.set(sx, sy, sz);
                grp.userData.baseY = sy;
                b = this.balloons.get(user.id);
            }
            if (!b || b.isMe) return;

            b.kind = 'nearby';
            b.isBackground = false;
            b.lastSeenAt = now;
            b.user = { ...b.user, ...user };
            b.group.userData.user = b.user;

            b.group.userData.targetX = sx;
            b.group.userData.targetY = sy;
            if (typeof b.group.userData.baseY !== 'number') b.group.userData.baseY = sy;

            this._updateBalloonColor(b.group, skinId);
            this._updateBalloonAura(b.group, auraId, false);
            if (b.user.status_message !== user.status_message) {
                this.updateStatusMsg(user.id, user.status_message);
            }
            b.group.visible = true;
        });
    },

    /** Move a single remote player to a new world position (socket player:moved). */
    moveWorldPlayer(userId, worldX, worldY) {
        const b = this.balloons.get(userId);
        if (!b || b.isMe) return;
        if (b.kind !== 'nearby') return;
        b.lastSeenAt = Date.now();
        const sx = worldToScene(worldX);
        const sy = worldToScene(worldY);
        // Smooth transition instead of snap.
        b.group.userData.targetX = sx;
        b.group.userData.targetY = sy;
    },

    /** Remove a player balloon when they disconnect (socket player:left). */
    removeWorldPlayer(userId) {
        const b = this.balloons.get(userId);
        if (b && !b.isMe && b.kind === 'nearby') {
            this._removeBalloonById(userId);
        }
    },

    /**
     * Render ranking users as distant background balloons when nearby count is low.
     * Background balloons are tagged and can be cleared independently.
     */
    setBackgroundUsers(users, isLight) {
        const keepIds = new Set((users || []).map(u => u.id));

        // Remove old background balloons not present in the new list.
        this.balloons.forEach((b, id) => {
            if (b.kind === 'background' && !keepIds.has(id)) {
                this._removeBalloonById(id);
            }
        });

        (users || []).forEach((user, i) => {
            if (!user || user.id == null) return;

            const angle = i * 137.508;
            const radius = 2500 + Math.sqrt(i) * 350;
            const sx = radius * Math.cos(angle * Math.PI / 180);
            const sy = radius * Math.sin(angle * Math.PI / 180);
            const sz = Math.sin(i * 3.7) * 120;

            const skinId = user.balloon_skin || 'default';
            const auraId = user.balloon_aura || 'none';

            if (this.balloons.has(user.id)) {
                const b = this.balloons.get(user.id);
                if (!b.isMe && b.kind !== 'nearby') {
                    b.kind = 'background';
                    b.isBackground = true;
                    b.user = { ...b.user, ...user };
                    b.group.userData.user = b.user;
                    b.group.position.set(sx, sy, sz);
                    b.group.userData.baseY = sy;
                    b.group.userData.targetX = undefined;
                    b.group.userData.targetY = undefined;
                    this._updateBalloonColor(b.group, skinId);
                    this._updateBalloonAura(b.group, auraId, false);
                    b.group.visible = true;
                }
            } else {
                const grp = this.addBalloon(user, null, false);
                grp.position.set(sx, sy, sz);
                grp.userData.baseY = sy;
                grp.visible = true;
                const b = this.balloons.get(user.id);
                if (b) {
                    b.kind = 'background';
                    b.isBackground = true;
                }
            }
        });
    },

    clearBackgroundUsers() {
        this.balloons.forEach((b, id) => {
            if (b.kind === 'background') this._removeBalloonById(id);
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

    updateMyBalloon(skinId) {
        if (!this.myBalloon) return;
        this._updateBalloonColor(this.myBalloon.group, skinId);
    },

    updateMyAura(auraId) {
        if (!this.myBalloon) return;
        this._updateBalloonAura(this.myBalloon.group, auraId || 'none', true);
    },

    _updateBalloonColor(group, skinId) {
        const colors = getBalloonColors(skinId);
        const balloon3D = group.children.find(child => child.isGroup || (child.children && child.children.length > 0));
        if (!balloon3D) return;

        const parts = balloon3D.userData?.colorParts;
        if (parts) {
            (parts.primary || []).forEach((m) => m?.material?.color?.setHex(colors.primary));
            (parts.secondary || []).forEach((m) => m?.material?.color?.setHex(colors.secondary));
            (parts.accent || []).forEach((m) => m?.material?.color?.setHex(colors.accent));
            return;
        }

        // Backward-compatible fallback for older balloon instances.
        if (balloon3D.children[0] && balloon3D.children[0].material) {
            balloon3D.children[0].material.color.setHex(colors.primary);
        }
    },

    _updateBalloonAura(group, auraId, isMe) {
        const nextAuraId = AURA_COLORS[auraId] ? auraId : 'none';
        const ud = group.userData || {};

        const sameAura = (ud.auraId || 'none') === nextAuraId;
        if (sameAura && ((nextAuraId === 'none' && !ud.auraGroup) || (nextAuraId !== 'none' && ud.auraGroup))) {
            return;
        }

        if (ud.auraGroup) {
            group.remove(ud.auraGroup);
            ud.auraGroup.traverse((obj) => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
                    else obj.material.dispose();
                }
            });
            ud.auraGroup = null;
            ud.auraMats = [];
        }

        ud.auraId = nextAuraId;
        if (nextAuraId === 'none') {
            group.userData = ud;
            return;
        }

        const auraColor = AURA_COLORS[nextAuraId];
        const colorR = ((auraColor >> 16) & 255) / 255;
        const colorG = ((auraColor >> 8) & 255) / 255;
        const colorB = (auraColor & 255) / 255;

        const auraGroup = new THREE.Group();
        const auraMats = [];

        const ringGeo = new THREE.TorusGeometry(isMe ? 58 : 42, isMe ? 2.6 : 2.0, 16, 48);
        const ringMat = new THREE.ShaderMaterial({
            uniforms: { uTime: { value: 0 } },
            vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
            fragmentShader: `uniform float uTime; varying vec2 vUv; void main() { float pulse = 0.55 + 0.45 * sin(uTime * 2.4); gl_FragColor = vec4(${colorR}, ${colorG}, ${colorB}, 0.35 * pulse); }`,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.y = isMe ? 98 : 64;
        auraGroup.add(ring);
        auraMats.push(ringMat);

        const haloGeo = new THREE.CircleGeometry(isMe ? 80 : 56, 40);
        const haloMat = new THREE.ShaderMaterial({
            uniforms: { uTime: { value: 0 } },
            vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
            fragmentShader: `uniform float uTime; varying vec2 vUv; void main() { float d = length(vUv - vec2(0.5)); float wave = 0.65 + 0.35 * sin(uTime * 1.8); float alpha = (1.0 - smoothstep(0.24, 0.52, d)) * 0.22 * wave; gl_FragColor = vec4(${colorR}, ${colorG}, ${colorB}, alpha); }`,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const halo = new THREE.Mesh(haloGeo, haloMat);
        halo.position.y = isMe ? 98 : 64;
        halo.position.z = -4;
        auraGroup.add(halo);
        auraMats.push(haloMat);

        ud.auraGroup = auraGroup;
        ud.auraMats = auraMats;
        group.add(auraGroup);
        group.userData = ud;
    },

    focusUserById(userId) {
        this.springActive = true;
        const b = this.balloons.get(userId);
        if (!b) return;
        this.camTarget.x = -b.group.position.x;
        this.camTarget.y = -(b.group.userData.baseY || 0);
    },

    cycleWeather() {
        const modes = ['none', 'rain', 'snow'];
        const idx = modes.indexOf(this.weatherMode);
        this.weatherMode = modes[(idx + 1) % modes.length];

        this.raindrops.forEach(d => this.scene.remove(d));
        this.raindrops.length = 0;
        this.snowflakes.forEach(f => this.scene.remove(f));
        this.snowflakes.length = 0;

        if (this.weatherMode === 'rain') {
            for (let i = 0; i < 200; i++) {
                const geo = new THREE.CylinderGeometry(0.5, 0.5, 18, 4);
                const mat = new THREE.MeshBasicMaterial({ color: 0x88aaff, transparent: true, opacity: 0.45 });
                const d = new THREE.Mesh(geo, mat);
                d.position.set((Math.random() - 0.5) * 4000, Math.random() * 800 - 100, (Math.random() - 0.5) * 1200);
                d.userData.speed = 12 + Math.random() * 6;
                d.userData.resetY = 600;
                this.scene.add(d);
                this.raindrops.push(d);
            }
        } else if (this.weatherMode === 'snow') {
            for (let i = 0; i < 150; i++) {
                const geo = new THREE.SphereGeometry(3 + Math.random() * 3, 5, 5);
                const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
                const f = new THREE.Mesh(geo, mat);
                f.position.set((Math.random() - 0.5) * 4000, Math.random() * 800 - 100, (Math.random() - 0.5) * 1200);
                f.userData.speed = 1.5 + Math.random() * 1.5;
                f.userData.drift = (Math.random() - 0.5) * 2;
                f.userData.resetY = 600;
                this.scene.add(f);
                this.snowflakes.push(f);
            }
        }
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

    // ── World coordinate helpers ──────────────────────────────────────────

    /** Clamp camera position to the world boundary (in scene units). */
    _clampCamPos() {
        const maxScene = WORLD_HALF * WORLD_SCALE;
        this.camPos.x = Math.max(-maxScene, Math.min(maxScene, this.camPos.x));
        this.camPos.y = Math.max(-maxScene, Math.min(maxScene, this.camPos.y));
    },

    /**
     * Returns the player's position in *world-units* (large-scale coordinates).
     * worldX ∈ [-100000, 100000], worldY ∈ [-100000, 100000].
     */
    getWorldPosition() {
        return {
            x: Math.round(sceneToWorld(this.camPos.x)),
            y: Math.round(sceneToWorld(this.camPos.y)),
        };
    },

    getMyPosition() {
        // Returns world-unit coordinates for the UI coordinate display.
        const wp = this.getWorldPosition();
        return {
            x: wp.x,
            y: wp.y,
            z: Math.round(this.camZ)
        };
    },

    getUserPosition(userId) {
        const b = this.balloons.get(userId);
        if (b) {
            const pos = b.group.position;
            // Convert scene position back to world units for the caller.
            return {
                x: Math.round(sceneToWorld(pos.x)),
                y: Math.round(sceneToWorld(pos.y)),
                z: Math.round(pos.z)
            };
        }
        return null;
    },

    /** Teleport to world-unit coordinates. */
    teleportTo(worldX, worldY) {
        const clampedX = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, worldX));
        const clampedY = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, worldY));
        this.springActive = true;
        this.camTarget.x = -clampedX * WORLD_SCALE;
        this.camTarget.y = -clampedY * WORLD_SCALE;
        this.camZTarget = 820;
    },

    setUniversityLandmarkStats(stats) {
        this.universityLandmarkStats = stats && typeof stats === 'object' ? stats : {};
    },

    _showIslandInfo(islandData) {
        const esc = (value) => String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        const universityName = islandData.university || null;
        const uniStats = universityName ? (this.universityLandmarkStats?.[universityName] || null) : null;
        const isUniversityLandmark = !!universityName;
        const topNickname = uniStats?.topScorerNickname ? `@${uniStats.topScorerNickname}` : null;
        const topScore = Number.isFinite(Number(uniStats?.topScorerScore)) ? `${Math.round(Number(uniStats.topScorerScore))}점` : '미등록';
        const predictedCutScore = Number.isFinite(Number(uniStats?.predictedCutScore)) ? `${Math.round(Number(uniStats.predictedCutScore))}점` : '집계 대기';
        const basePercentile = Number.isFinite(Number(uniStats?.basePercentile)) ? `${Number(uniStats.basePercentile)}%` : '집계 대기';
        const departmentCount = Number.isFinite(Number(uniStats?.departmentCount)) ? `${Math.round(Number(uniStats.departmentCount))}개` : '집계 대기';
        const regionText = uniStats?.region || '정보 준비 중';
        const admissionUrl = uniStats?.admissionUrl || islandData.admissionUrl || '';
        const admissionNote = uniStats?.admissionNote || islandData.admissionNote || '입학처 공지에서 최신 모집요강과 전형 일정을 확인하세요.';

        let infoEl = document.getElementById('island-info');
        if (!infoEl) {
            infoEl = document.createElement('div');
            infoEl.id = 'island-info';
            infoEl.style.cssText = `
                position:fixed; top:50%; left:50%; transform:translate(-50%, -50%);
                background:var(--surface-color,#1B2130); border:1.5px solid rgba(49,130,246,0.35);
                border-radius:20px; padding:28px 36px; z-index:1000;
                font-family:'Pretendard Variable',sans-serif;
                backdrop-filter:blur(24px);
                box-shadow:0 8px 40px rgba(0,0,0,0.6);
                min-width:320px; text-align:center;
            `;
            document.body.appendChild(infoEl);
        }

        const modalId = `island-info-${Date.now()}`;
        infoEl.setAttribute('data-modal-id', modalId);
        
        infoEl.innerHTML = `
            <div style="font-size:32px;margin-bottom:12px;">🏝️</div>
            <div style="font-size:11px;color:var(--text-secondary,#7E94B8);letter-spacing:1.1px;margin-bottom:6px;">${isUniversityLandmark ? 'UNIVERSITY LANDMARK' : 'SKY ISLAND'}</div>
            <div style="font-size:22px;color:var(--accent,#3182F6);font-weight:800;margin-bottom:8px;letter-spacing:-0.3px;">${esc(islandData.name)}</div>
            <div style="font-size:13px;color:var(--text-secondary,#7E94B8);margin-bottom:16px;">${esc(islandData.landmark)}</div>
            ${isUniversityLandmark ? `
                <div style="font-size:12px;color:var(--text-secondary,#7E94B8);line-height:1.65;margin-bottom:8px;">
                    ${esc(universityName)} - 현재 최고점수 보유자: ${topNickname ? `${esc(topNickname)} (${topScore})` : '미등록'}<br>
                    침공 예상 컷 점수: ${predictedCutScore}
                </div>
                <div style="background:rgba(49,130,246,0.09);border:1px solid rgba(49,130,246,0.25);border-radius:12px;padding:10px 12px;text-align:left;margin-bottom:12px;font-size:11px;line-height:1.55;color:var(--text-secondary,#7E94B8)">
                    <div><strong style="color:#cfe2ff;">입시 스냅샷</strong></div>
                    <div>지역: ${esc(regionText)} · 모집 단위: ${esc(departmentCount)} · 기준 백분위: ${esc(basePercentile)}</div>
                    <div style="margin-top:4px;">${esc(admissionNote)}</div>
                </div>
                <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:14px;">
                    <button id="island-admission-link" style="background:#3182F6;border:1px solid #3182F6;color:#fff;padding:8px 14px;border-radius:999px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Pretendard Variable',sans-serif;">입학처 바로가기</button>
                    <button id="island-view-estate" style="background:rgba(49,130,246,0.12);border:1.5px solid rgba(49,130,246,0.35);color:#3182F6;padding:8px 14px;border-radius:999px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Pretendard Variable',sans-serif;">대학 정보 보기</button>
                </div>
            ` : `
                <div style="font-size:12px;color:var(--text-secondary,#7E94B8);line-height:1.65;margin-bottom:18px;">
                    이 하늘섬은 ${esc(islandData.name)}의 상징적인 공간입니다.<br>
                    맵을 탐험하며 다양한 대학의 하늘섬을 발견해보세요!
                </div>
            `}
            <button onclick="document.getElementById('island-info').remove()" style="
                background:rgba(49,130,246,0.12); border:1.5px solid rgba(49,130,246,0.35);
                color:#3182F6; padding:10px 28px; border-radius:999px;
                font-size:13px; font-weight:700; cursor:pointer;
                transition:all 0.2s; font-family:'Pretendard Variable',sans-serif;
            " onmouseover="this.style.background='#3182F6';this.style.color='#fff'"
               onmouseout="this.style.background='rgba(49,130,246,0.12)';this.style.color='#3182F6'">닫기</button>
        `;

        if (isUniversityLandmark) {
            const admissionBtn = infoEl.querySelector('#island-admission-link');
            if (admissionBtn) {
                if (admissionUrl) {
                    admissionBtn.addEventListener('click', () => window.open(admissionUrl, '_blank', 'noopener,noreferrer'));
                } else {
                    admissionBtn.disabled = true;
                    admissionBtn.textContent = '입학처 준비 중';
                    admissionBtn.style.opacity = '0.45';
                    admissionBtn.style.cursor = 'not-allowed';
                }
            }

            const estateBtn = infoEl.querySelector('#island-view-estate');
            if (estateBtn) {
                estateBtn.addEventListener('click', () => {
                    if (window.viewUniversityEstate) {
                        window.viewUniversityEstate(universityName);
                    }
                });
            }
        }
        
        // 일반 섬은 자동으로 닫고, 대학 랜드마크는 사용자 상호작용을 위해 유지합니다.
        if (!isUniversityLandmark) {
            setTimeout(() => {
                if (infoEl.parentElement && infoEl.getAttribute('data-modal-id') === modalId) {
                    infoEl.style.opacity = '0';
                    infoEl.style.transition = 'opacity 0.3s';
                    setTimeout(() => {
                        if (infoEl.parentElement && infoEl.getAttribute('data-modal-id') === modalId) infoEl.remove();
                    }, 300);
                }
            }, 4000);
        }
    },

    zoom(delta) {
        this.camZTarget = Math.min(Math.max(400, this.camZTarget - delta * 600), 4000);
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
                const sceneScale = (this.camZ / 900) * DRAG_SENSITIVITY;
                this.balloonDragDist += Math.hypot(dx, dy);
                const grp = this.myBalloon.group;
                grp.position.x += dx * sceneScale;
                grp.userData.baseY = (grp.userData.baseY || 0) - dy * sceneScale;
                this.camPos.x += dx * sceneScale;
                this.camPos.y -= dy * sceneScale;
                this._clampCamPos();
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
            const sceneScale = (this.camZ / 900) * DRAG_SENSITIVITY;
            this.velX -= dx * sceneScale * 1.2;
            this.velY += dy * sceneScale * 1.2;
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

            // Check interactable props (seed-based islands) first.
            const ipMeshes = [];
            this.interactableProps.forEach(ip => {
                ip.group.traverse(ch => { if (ch.isMesh) ipMeshes.push(ch); });
            });
            if (ipMeshes.length) {
                const ipHits = raycaster.intersectObjects(ipMeshes, false);
                if (ipHits.length > 0) {
                    let obj = ipHits[0].object;
                    while (obj && !obj.userData.propId) obj = obj.parent;
                    if (obj && obj.userData.propId) {
                        const prop = this.interactableProps.find(p => p.id === obj.userData.propId);
                        if (prop) { prop.toggle(); return; }
                    }
                }
            }

            // 하늘섬 클릭 체크
            const islandMeshes = [];
            this.skyIslands.forEach(island => {
                island.traverse(ch => { if (ch.isMesh) islandMeshes.push(ch); });
            });
            const islandHits = raycaster.intersectObjects(islandMeshes, false);
            if (islandHits.length > 0) {
                let island = islandHits[0].object;
                while (island && !island.userData.name) island = island.parent;
                if (island && island.userData.name) {
                    this._showIslandInfo(island.userData);
                    return;
                }
            }

            // 열기구 클릭 체크
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
                e.preventDefault();
                this.isDragging = false;
                this.isDraggingBalloon = false;
                this.lastPointer = null;
                pinchDist0 = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            }
        }, { passive: false });
        canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2 && pinchDist0 !== null) {
                e.preventDefault();
                const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                this.zoom((pinchDist0 - dist) * 0.005);
                pinchDist0 = dist;
            }
        }, { passive: false });
        canvas.addEventListener('touchend', () => { pinchDist0 = null; }, { passive: true });

        // 더블클릭으로 빠른 이동
        let lastClickTime = 0;
        canvas.addEventListener('dblclick', (e) => {
            const rect = canvas.getBoundingClientRect();
            const mouse = new THREE.Vector2(
                ((e.clientX - rect.left) / rect.width) * 2 - 1,
                -((e.clientY - rect.top) / rect.height) * 2 + 1
            );
            // Compute the double-clicked destination in scene-units, then convert
            // to world-units before calling teleportTo (which expects world-units).
            const scaleScene = this.camZ / 400;
            const sceneX = -this.camPos.x + mouse.x * scaleScene * rect.width / 2;
            const sceneY = -this.camPos.y - mouse.y * scaleScene * rect.height / 2;
            const destWorldX = sceneX / WORLD_SCALE;
            const destWorldY = sceneY / WORLD_SCALE;
            this.teleportTo(destWorldX, destWorldY);
            this._createClickParticle(sceneX, sceneY, 0);
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
                background:var(--surface-color,#1B2130); border:1.5px solid rgba(49,130,246,0.35);
                color:#3182F6; font-family:"Pretendard Variable",sans-serif; font-size:13px;
                font-weight:600; padding:9px 20px; border-radius:999px; z-index:50;
                pointer-events:none; transition:opacity 0.3s;
                box-shadow:0 4px 20px rgba(49,130,246,0.25);
                backdrop-filter:blur(16px);
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
            -2400 + Math.random() * 4800,
            800 + Math.random() * 800,
            -1500
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

    _getAdaptiveBalloonLodDistance() {
        const nav = window.navigator || {};
        const cores = nav.hardwareConcurrency || 4;
        const mem = nav.deviceMemory || 4;
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const shortSide = Math.min(window.innerWidth || 0, window.innerHeight || 0);
        const hasTouch = ('ontouchstart' in window) || ((nav.maxTouchPoints || 0) > 0);

        let score = 0;
        if (cores >= 8) score += 1;
        else if (cores <= 4) score -= 1;

        if (mem >= 8) score += 1;
        else if (mem <= 4) score -= 1;

        if (dpr >= 2.5) score -= 1;
        else if (dpr <= 1.25) score += 1;

        if (shortSide >= 1200) score += 1;
        else if (shortSide <= 700) score -= 1;

        if (hasTouch) score -= 1;

        const dist = 2300 + score * 260;
        return Math.max(1500, Math.min(3200, dist));
    },

    _onResize() {
        const W = window.innerWidth, H = window.innerHeight;
        this.balloonLodDistance = this._getAdaptiveBalloonLodDistance();
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
        this._clampCamPos();

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

            // Apply camera motion tilt only to the balloon model so name tags
            // keep a stable facing/stacking in front of the balloon.
            const balloon3D = grp.userData.balloon3D;
            if (balloon3D) {
                balloon3D.rotation.x = this.tiltX * 0.3;
                balloon3D.rotation.z = this.tiltY * 0.4;
            }

            if (grp.userData.label) {
                grp.userData.label.rotation.set(0, 0, 0);
            }
            if (grp.userData.bubbleMesh) {
                grp.userData.bubbleMesh.rotation.set(0, 0, 0);
            }

            // Smoothly interpolate toward target position for remote players.
            if (!b.isMe && grp.userData.targetX !== undefined) {
                grp.position.x  += (grp.userData.targetX - grp.position.x)  * REMOTE_POS_LERP;
                grp.userData.baseY += (grp.userData.targetY - grp.userData.baseY) * REMOTE_POS_LERP;
            }

            const baseY = grp.userData.baseY || 0;
            const floatOffset = Math.sin(t * 0.9 + grp.position.x * 0.002) * (b.isMe ? 14 : 9);
            grp.position.y = baseY + floatOffset;

            if (b.isMe && grp.userData.glowMat) {
                grp.userData.glowMat.uniforms.uTime.value = t;
            }
            if (grp.userData.auraMats && grp.userData.auraMats.length) {
                grp.userData.auraMats.forEach((mat) => {
                    if (mat?.uniforms?.uTime) mat.uniforms.uTime.value = t;
                });
            }
        });

        if (this.starMaterial) {
            this.starMaterial.uniforms.uTime.value = t;
        }

        if (Math.abs(this.dayNightMix - this.dayNightTarget) > 0.001) {
            this.dayNightMix += (this.dayNightTarget - this.dayNightMix) * 0.06;
            this._applyDayNightBlend(this.dayNightMix);
        } else if (this.dayNightMix !== this.dayNightTarget) {
            this.dayNightMix = this.dayNightTarget;
            this._applyDayNightBlend(this.dayNightMix);
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

        // Animate floating rocks and crystal formations
        if (this.frameCount % 2 === 0) {
            this.seededProps.forEach(prop => {
                if (prop.userData.floatSpeed) {
                    const floatH = Math.sin(t * prop.userData.floatSpeed + prop.userData.floatPhase) * 10;
                    prop.position.y = prop.userData.baseY + floatH;
                }
            });
        }

        if (this.moon) {
            this.moon.position.x = -800 + Math.sin(t * 0.003) * 15;
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
            const myPosX = this.camPos.x;
            const myPosY = this.camPos.y;
            const lodEnterDistance = this.balloonLodDistance + 180;
            const lodExitDistance = Math.max(900, this.balloonLodDistance - 180);
            this.balloons.forEach((b) => {
                if (b.isMe) return;
                const dist = Math.hypot(b.group.position.x - myPosX, b.group.position.y - myPosY);
                b.group.visible = true;
                if (b.group.userData.balloon3D) {
                    const wasLowDetail = !!b.group.userData.isLowDetail;
                    const useLowDetail = wasLowDetail
                        ? dist > lodExitDistance
                        : dist > lodEnterDistance;

                    if (useLowDetail !== wasLowDetail) {
                        b.group.userData.isLowDetail = useLowDetail;
                    }
                    setBalloonDetailLevel(b.group.userData.balloon3D, useLowDetail);
                }
                if (b.group.userData.label) b.group.userData.label.visible = dist < 3000;
                if (b.group.userData.bubbleMesh) b.group.userData.bubbleMesh.visible = dist < 2000;
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
            f.material.opacity = (0.3 + Math.sin(t2 * 2) * 0.4) * (1 - this.dayNightMix);
            f.visible = (1 - this.dayNightMix) > 0.01;
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

        // Animate seed-based interactable props.
        this.interactableProps.forEach(prop => prop.update(t, this.camera));

        this.composer.render();
    }
};

// ── InteractableProp ─────────────────────────────────────────────────────────
/**
 * A clickable world object (sky-island portal, building, etc.) that can be
 * activated / deactivated by any player.  State changes are broadcast via
 * socket.io so all connected clients see the same result.
 *
 * Visual feedback:
 *  - Inactive : standard green/brown floating island
 *  - Active   : golden glow + rotating glow ring + label
 */
class InteractableProp {
    /**
     * @param {string}      id         Unique prop identifier (stable across sessions)
     * @param {string}      name       Display name
     * @param {number}      x          Scene X
     * @param {number}      y          Scene Y (base, before float)
     * @param {number}      z          Scene Z
     * @param {number}      rx         Radius multiplier
     * @param {THREE.Scene} scene      Three.js scene
     * @param {Function}    onTrigger  Called with (id, activated) when this client toggles
     */
    constructor(id, name, x, y, z, rx, scene, onTrigger) {
        this.id        = id;
        this.name      = name;
        this.activated = false;
        this.onTrigger = onTrigger;

        this.group = new THREE.Group();
        this.group.userData.propId     = id;
        this.group.userData.name       = name;
        this.group.userData.baseY      = y;
        this.group.userData.floatSpeed = 0.35;
        this.group.userData.floatPhase = 0;

        // Top cap (grass / portal surface)
        const topGeo = new THREE.CylinderGeometry(rx * 90, rx * 80, 30, 14);
        this._topMat = new THREE.MeshStandardMaterial({ color: 0x3a7d44, roughness: 0.9, metalness: 0 });
        const top = new THREE.Mesh(topGeo, this._topMat);
        top.position.y = 15;
        top.userData.propId = id;
        this.group.add(top);

        // Stone base
        const botGeo = new THREE.CylinderGeometry(rx * 60, rx * 30, 80, 10);
        const botMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 1.0, metalness: 0 });
        const bot = new THREE.Mesh(botGeo, botMat);
        bot.position.y = -25;
        bot.userData.propId = id;
        this.group.add(bot);

        // Castle structure
        this._buildCastle(rx);

        // Activation glow ring
        const ringGeo = new THREE.TorusGeometry(rx * 85, 8, 8, 32);
        this._glowMat = new THREE.MeshBasicMaterial({
            color: 0xD4AF37, transparent: true, opacity: 0, depthWrite: false,
        });
        this._glowRing = new THREE.Mesh(ringGeo, this._glowMat);
        this._glowRing.rotation.x = Math.PI / 2;
        this._glowRing.position.y = 32;
        this.group.add(this._glowRing);

        // Name label (canvas texture, always faces camera)
        const labelCanvas = this._makeLabel(name);
        const labelTex    = new THREE.CanvasTexture(labelCanvas);
        const labelGeo    = new THREE.PlaneGeometry(160, 44);
        const labelMat    = new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, depthWrite: false });
        this._labelMesh   = new THREE.Mesh(labelGeo, labelMat);
        this._labelMesh.position.y = 80;
        this.group.add(this._labelMesh);

        this.group.position.set(x, y, z);
        scene.add(this.group);
    }

    _buildCastle(rx) {
        // Castle stone material
        const stoneMat = new THREE.MeshStandardMaterial({
            color: 0x8b8b8b,
            roughness: 0.95,
            metalness: 0.05
        });

        // Main castle tower
        const towerGeo = new THREE.CylinderGeometry(rx * 25, rx * 28, 70, 8);
        const tower = new THREE.Mesh(towerGeo, stoneMat);
        tower.position.set(0, 55, 0);
        this.group.add(tower);

        // Tower top (cone roof)
        const roofGeo = new THREE.ConeGeometry(rx * 32, 35, 8);
        const roofMat = new THREE.MeshStandardMaterial({
            color: 0x8b4513,
            roughness: 0.9,
            metalness: 0
        });
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.set(0, 107, 0);
        this.group.add(roof);

        // Battlements (crenellations) around tower top
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const bx = Math.cos(angle) * rx * 27;
            const bz = Math.sin(angle) * rx * 27;
            const battlementGeo = new THREE.BoxGeometry(rx * 8, 10, rx * 8);
            const battlement = new THREE.Mesh(battlementGeo, stoneMat);
            battlement.position.set(bx, 95, bz);
            this.group.add(battlement);
        }

        // Side towers (4 smaller towers around main)
        const towerPositions = [
            { x: rx * 50, z: rx * 50 },
            { x: -rx * 50, z: rx * 50 },
            { x: rx * 50, z: -rx * 50 },
            { x: -rx * 50, z: -rx * 50 }
        ];

        towerPositions.forEach(pos => {
            const sideTowerGeo = new THREE.CylinderGeometry(rx * 15, rx * 17, 50, 6);
            const sideTower = new THREE.Mesh(sideTowerGeo, stoneMat);
            sideTower.position.set(pos.x, 40, pos.z);
            this.group.add(sideTower);

            // Small roof on side tower
            const sideRoofGeo = new THREE.ConeGeometry(rx * 20, 25, 6);
            const sideRoof = new THREE.Mesh(sideRoofGeo, roofMat);
            sideRoof.position.set(pos.x, 77, pos.z);
            this.group.add(sideRoof);
        });

        // Castle walls connecting the towers
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0x7a7a7a,
            roughness: 0.95,
            metalness: 0.05
        });

        // Front and back walls
        const wallGeoX = new THREE.BoxGeometry(rx * 100, 35, rx * 8);
        const frontWall = new THREE.Mesh(wallGeoX, wallMat);
        frontWall.position.set(0, 32.5, rx * 50);
        this.group.add(frontWall);

        const backWall = new THREE.Mesh(wallGeoX, wallMat);
        backWall.position.set(0, 32.5, -rx * 50);
        this.group.add(backWall);

        // Left and right walls
        const wallGeoZ = new THREE.BoxGeometry(rx * 8, 35, rx * 100);
        const leftWall = new THREE.Mesh(wallGeoZ, wallMat);
        leftWall.position.set(-rx * 50, 32.5, 0);
        this.group.add(leftWall);

        const rightWall = new THREE.Mesh(wallGeoZ, wallMat);
        rightWall.position.set(rx * 50, 32.5, 0);
        this.group.add(rightWall);

        // Gate entrance
        const gateGeo = new THREE.BoxGeometry(rx * 20, 25, rx * 10);
        const gateMat = new THREE.MeshStandardMaterial({
            color: 0x4a2f1a,
            roughness: 0.9,
            metalness: 0
        });
        const gate = new THREE.Mesh(gateGeo, gateMat);
        gate.position.set(0, 27.5, rx * 50);
        this.group.add(gate);

        // Windows on main tower
        const windowMat = new THREE.MeshBasicMaterial({ color: 0x4a4a1a });
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const wx = Math.cos(angle) * rx * 26;
            const wz = Math.sin(angle) * rx * 26;
            const windowGeo = new THREE.BoxGeometry(rx * 6, 8, 2);
            const window = new THREE.Mesh(windowGeo, windowMat);
            window.position.set(wx, 60, wz);
            window.lookAt(0, 60, 0);
            this.group.add(window);
        }

        // Flags on towers
        const flagMat = new THREE.MeshStandardMaterial({
            color: 0xcc0000,
            roughness: 0.8,
            metalness: 0.1,
            side: THREE.DoubleSide
        });
        const flagGeo = new THREE.PlaneGeometry(rx * 15, rx * 10);
        const mainFlag = new THREE.Mesh(flagGeo, flagMat);
        mainFlag.position.set(0, 125, 0);
        this.group.add(mainFlag);
    }

    _makeLabel(text) {
        const c   = document.createElement('canvas');
        c.width   = 320;
        c.height  = 88;
        const ctx = c.getContext('2d');
        ctx.fillStyle = 'rgba(10,12,24,0.82)';
        ctx.beginPath();
        ctx.roundRect(4, 4, 312, 80, 14);
        ctx.fill();
        ctx.strokeStyle = 'rgba(49,130,246,0.55)';
        ctx.lineWidth   = 2;
        ctx.stroke();
        ctx.fillStyle   = '#3182F6';
        ctx.font        = 'bold 26px "Pretendard Variable",sans-serif';
        ctx.textAlign   = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 160, 44);
        return c;
    }

    /** Toggle activation state and fire the onTrigger callback. */
    toggle() {
        this.setActivated(!this.activated);
        if (this.onTrigger) this.onTrigger(this.id, this.activated);
        this._showPropInfo();
    }

    /** Apply a remote activation-state change (no callback fired). */
    setActivated(activated) {
        this.activated = !!activated;
        if (this.activated) {
            this._topMat.color.set(0xD4AF37);
            this._glowMat.opacity = 0.7;
        } else {
            this._topMat.color.set(0x3a7d44);
            this._glowMat.opacity = 0;
        }
    }

    /** Per-frame update: float animation + glow pulse + label faces camera. */
    update(t, camera) {
        const floatH = Math.sin(t * this.group.userData.floatSpeed + this.group.userData.floatPhase) * 14;
        this.group.position.y = this.group.userData.baseY + floatH;
        this.group.rotation.y += 0.0008;
        if (this._labelMesh) this._labelMesh.quaternion.copy(camera.quaternion);
        if (this.activated && this._glowMat) {
            this._glowMat.opacity = 0.4 + 0.35 * Math.sin(t * 3.5);
        }
    }

    _showPropInfo() {
        let el = document.getElementById('island-info');
        if (!el) {
            el = document.createElement('div');
            el.id = 'island-info';
            el.style.cssText = [
                'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);',
                'background:var(--surface-color,#1B2130);border:1.5px solid rgba(49,130,246,0.35);',
                'border-radius:20px;padding:28px 36px;z-index:1000;',
                "font-family:'Pretendard Variable',sans-serif;",
                'backdrop-filter:blur(24px);min-width:320px;text-align:center;',
                'box-shadow:0 8px 40px rgba(0,0,0,0.6);',
            ].join('');
            document.body.appendChild(el);
        }
        const statusText  = this.activated ? '✨ 활성화됨 – 근처 모든 플레이어에게 실시간 반영됩니다' : '💤 비활성화됨';
        const statusColor = this.activated ? '#00C471' : 'var(--text-secondary,#7E94B8)';
        el.innerHTML = `
            <div style="font-size:32px;margin-bottom:12px;">🏝️</div>
            <div style="font-size:22px;color:var(--accent,#3182F6);font-weight:800;margin-bottom:8px;letter-spacing:-0.3px;">${this.name}</div>
            <div style="font-size:13px;color:${statusColor};margin-bottom:16px;">${statusText}</div>
            <div style="font-size:12px;color:var(--text-secondary,#7E94B8);line-height:1.65;margin-bottom:18px;">
                클릭으로 활성화하면 근처의 모든 플레이어에게 실시간으로 반영됩니다.
            </div>
            <button onclick="document.getElementById('island-info').remove()" style="
                background:rgba(49,130,246,0.12);border:1.5px solid rgba(49,130,246,0.35);
                color:#3182F6;padding:10px 28px;border-radius:999px;
                font-size:13px;font-weight:700;cursor:pointer;
                font-family:'Pretendard Variable',sans-serif;"
                onmouseover="this.style.background='#3182F6';this.style.color='#fff'"
                onmouseout="this.style.background='rgba(49,130,246,0.12)';this.style.color='#3182F6'">닫기</button>
        `;
        setTimeout(() => {
            if (el && el.parentElement) {
                el.style.opacity = '0';
                el.style.transition = 'opacity 0.3s';
                setTimeout(() => { if (el.parentElement) el.remove(); }, 300);
            }
        }, 4500);
    }
}

window.WorldScene = WorldScene;
window._worldSceneReady = true;
if (window._onWorldSceneReady) window._onWorldSceneReady();

