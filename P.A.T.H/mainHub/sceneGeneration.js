import * as THREE from 'three';
import { InteractableProp } from './interactableProp.js';
import { WORLD_HALF, WORLD_SCALE } from './sceneConstants.js';

// Scene object methods that are primarily responsible for world/environment
// generation and seeded prop creation.
export const sceneGenerationMethods = {
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
            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = r * Math.cos(phi);
            sizes[i] = 0.6 + Math.random() * 2.8;
            phases[i] = Math.random() * Math.PI * 2;
            const rnd = Math.random();
            if (rnd < 0.08) {
                colors[i * 3] = 1;
                colors[i * 3 + 1] = 0.9;
                colors[i * 3 + 2] = 0.7;
            } else if (rnd < 0.14) {
                colors[i * 3] = 0.7;
                colors[i * 3 + 1] = 0.8;
                colors[i * 3 + 2] = 1;
            } else {
                colors[i * 3] = 1;
                colors[i * 3 + 1] = 1;
                colors[i * 3 + 2] = 1;
            }
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
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
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
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide
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

                    vec2 shadowCenter = c - vec2(0.18, -0.1);
                    float shadowD = length(shadowCenter);
                    float lit = smoothstep(0.30, 0.48, shadowD);

                    vec3 darkSide = vec3(0.42, 0.40, 0.38);
                    vec3 brightSide = vec3(0.98, 0.96, 0.85);
                    vec3 moonCol = mix(darkSide, brightSide, lit);

                    gl_FragColor = vec4(moonCol, edge);
                }
            `,
            transparent: true,
            depthWrite: false
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
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
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
            transparent: true,
            depthWrite: false
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
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
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
            { x: 300, y: 440, z: 700, scale: 1.0, type: 'normal' },
            { x: 900, y: 360, z: -500, scale: 0.8, type: 'wispy' },
            { x: -300, y: 500, z: 800, scale: 1.2, type: 'large' },
            { x: 600, y: 300, z: 400, scale: 0.7, type: 'wispy' },
            { x: -1400, y: 450, z: -550, scale: 1.6, type: 'large' },
            { x: 1200, y: 520, z: 900, scale: 1.1, type: 'normal' },
            { x: -500, y: 280, z: 350, scale: 0.6, type: 'wispy' },
            { x: 1500, y: 400, z: -650, scale: 1.3, type: 'large' },
            { x: -1100, y: 340, z: 450, scale: 0.9, type: 'normal' },
            { x: 400, y: 560, z: 750, scale: 1.8, type: 'storm' },
            { x: -800, y: 600, z: -1000, scale: 2.0, type: 'large' },
            { x: 1800, y: 320, z: 500, scale: 0.5, type: 'wispy' },
            { x: -1600, y: 480, z: -700, scale: 1.5, type: 'storm' },
            { x: 0, y: 550, z: 850, scale: 1.0, type: 'wispy' },
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
            positions[i * 3] = (Math.random() - 0.5) * 6000;
            positions[i * 3 + 1] = Math.random() * 800 + 100;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 6000;
            phases[i] = Math.random() * Math.PI * 2;
        }
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
        const mat = new THREE.PointsMaterial({
            color: 0xaaffaa,
            size: 5,
            transparent: true,
            opacity: 0.7,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        this._fireflies = new THREE.Points(geo, mat);
        this._fireflies.visible = !this.isLight;
        this._fireflyPhases = phases;
        this.scene.add(this._fireflies);
    },

    _buildSkyIslands() {
        const islandData = [
            { x: -900, y: 200, z: -800, rx: 2.0, name: '관악 샤 아일랜드', university: '서울대학교', landmark: '서울대학교 · 서울대 정문·샤 조형물', type: 'forest', admissionUrl: 'https://admission.snu.ac.kr', admissionNote: '수시/정시 모집요강과 전형별 공지 확인' },
            { x: 700, y: 250, z: 600, rx: 1.6, name: '신촌 독수리 아일랜드', university: '연세대학교', landmark: '연세대학교 · 언더우드관·독수리 상징', type: 'crystal', admissionUrl: 'https://admission.yonsei.ac.kr', admissionNote: '전형 일정 및 모집 단위 확인' },
            { x: 200, y: 180, z: -1000, rx: 1.2, name: '안암 호랑이 아일랜드', university: '고려대학교', landmark: '고려대학교 · 중앙광장·호랑이 상징', type: 'misty', admissionUrl: 'https://oku.korea.ac.kr', admissionNote: '정시/수시 입학전형 세부사항 확인' },
            { x: -1200, y: 300, z: 400, rx: 1.8, name: '대덕 사이언스 아일랜드', university: '카이스트', landmark: 'KAIST · 본원 상징 조형·과학광장', type: 'waterfall', admissionUrl: 'https://admission.kaist.ac.kr', admissionNote: '창의도전전형 및 일반전형 안내 확인' },
            { x: 1400, y: 220, z: -700, rx: 2.2, name: '포스텍 스틸 아일랜드', university: '포항공과대학교', landmark: 'POSTECH · 지곡회관·상징 조형물', type: 'flower', admissionUrl: 'https://adm.postech.ac.kr', admissionNote: '입학전형/장학제도/공지사항 확인' },
            { x: -1600, y: 280, z: -900, rx: 1.4, name: '인문명륜 아일랜드', university: '성균관대학교', landmark: '성균관대학교 · 명륜당·은행나무 상징', type: 'rock', admissionUrl: 'https://admission.skku.edu', admissionNote: '캠퍼스별 모집요강 및 전형안내 확인' },
            { x: 500, y: 190, z: 1200, rx: 1.9, name: '사자 한양 아일랜드', university: '한양대학교', landmark: '한양대학교 · 사자상·본관 라인', type: 'star', admissionUrl: 'https://go.hanyang.ac.kr', admissionNote: '전형 일정, 경쟁률, 모집요강 확인' },
            { x: -600, y: 260, z: 500, rx: 1.5, name: '흑석 청룡 아일랜드', university: '중앙대학교', landmark: '중앙대학교 · 청룡상·중앙마루', type: 'aurora', admissionUrl: 'https://admission.cau.ac.kr', admissionNote: '학과별 전형요소 및 합격자 발표일 확인' },
            { x: 1800, y: 240, z: 400, rx: 2.4, name: '평화의 전당 아일랜드', university: '경희대학교', landmark: '경희대학교 · 평화의전당·캠퍼스 로드', type: 'fortress', admissionUrl: 'https://iphak.khu.ac.kr', admissionNote: '캠퍼스별 모집 인원과 전형계획 확인' },
            { x: -2000, y: 310, z: 600, rx: 1.3, name: '서강 알바트로스 아일랜드', university: '서강대학교', landmark: '서강대학교 · 본관·알바트로스 상징', type: 'moon', admissionUrl: 'https://admission.sogang.ac.kr', admissionNote: '모집요강, FAQ, 공지사항 확인' },
            { x: 1100, y: 200, z: -1100, rx: 1.7, name: '이화 유레카 아일랜드', university: '이화여자대학교', landmark: '이화여자대학교 · ECC·유레카 상징', type: 'dragon', admissionUrl: 'https://admission.ewha.ac.kr', admissionNote: '전형별 지원자격 및 제출서류 확인' },
            { x: -400, y: 230, z: -300, rx: 2.1, name: '금정 교정 아일랜드', university: '부산대학교', landmark: '부산대학교 · 금정캠퍼스·정문 상징', type: 'wind', admissionUrl: 'https://go.pusan.ac.kr', admissionNote: '정시/수시 모집단위와 일정 확인' },
        ];
        islandData.forEach(d => {
            const group = new THREE.Group();

            const topColor = d.type === 'crystal' ? 0x6ba3c7 : d.type === 'flower' ? 0x7dba6f
                : d.type === 'star' ? 0x4a5a8a : d.type === 'dragon' ? 0x8a5a4a
                    : 0x3a7d44;
            const topGeo = new THREE.CylinderGeometry(d.rx * 90, d.rx * 80, 30, 12);
            const topMat = new THREE.MeshStandardMaterial({ color: topColor, roughness: 0.9, metalness: 0 });
            const top = new THREE.Mesh(topGeo, topMat);
            top.position.y = 15;
            group.add(top);

            const botColor = d.type === 'crystal' ? 0x4a7a9a : d.type === 'dragon' ? 0x5a3020 : 0x6b4226;
            const botGeo = new THREE.CylinderGeometry(d.rx * 60, d.rx * 30, 80, 10);
            const botMat = new THREE.MeshStandardMaterial({ color: botColor, roughness: 1.0, metalness: 0 });
            const bot = new THREE.Mesh(botGeo, botMat);
            bot.position.y = -25;
            group.add(bot);

            if (d.type === 'forest' || d.type === 'flower') {
                for (let t = 0; t < 4; t++) {
                    const treeGeo = new THREE.ConeGeometry(d.rx * 12, d.rx * 35, 6);
                    const treeMat = new THREE.MeshStandardMaterial({
                        color: d.type === 'flower' ? 0xe8a0c0 : 0x2d6e30,
                        roughness: 0.9,
                        metalness: 0
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
                        color: 0x88ccff,
                        roughness: 0.2,
                        metalness: 0.6,
                        transparent: true,
                        opacity: 0.8
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
                    color: 0x88ccff,
                    transparent: true,
                    opacity: 0.5,
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

    initSeed(seed) {
        this.seededProps.forEach(m => this.scene.remove(m));
        this.seededProps = [];
        this.interactableProps.forEach(p => this.scene.remove(p.group));
        this.interactableProps = [];

        const rng = this._seededRng(seed);

        const CLOUD_SPREAD_X = WORLD_HALF * WORLD_SCALE * 0.85;
        const CLOUD_SPREAD_Z = WORLD_HALF * WORLD_SCALE * 0.85;
        const cloudTypes = ['normal', 'wispy', 'large', 'storm'];
        for (let i = 0; i < 60; i++) {
            const cx = (rng() - 0.5) * 2 * CLOUD_SPREAD_X;
            const cy = 400 + rng() * 600; // Height above ground (Y-up)
            const cz = (rng() - 0.5) * 2 * CLOUD_SPREAD_Z;
            const scale = 0.3 + rng() * 1.2;
            const type = cloudTypes[Math.floor(rng() * cloudTypes.length)];
            const cloud = type === 'wispy' ? this._makeWispyCloud(scale)
                : type === 'large' ? this._makeLargeCumulus(scale)
                    : type === 'storm' ? this._makeStormCloud(scale)
                        : this._makeCloud(scale);
            cloud.position.set(cx, cy, cz);
            cloud.userData.baseX = cx;
            cloud.userData.speed = 0.005 + rng() * 0.025;
            cloud.renderOrder = -10;
            cloud.visible = this.isLight;
            this.clouds.push(cloud);
            this.scene.add(cloud);
            this.seededProps.push(cloud);
        }

        const BUILDING_SPREAD = WORLD_HALF * WORLD_SCALE * 0.75;
        for (let i = 0; i < 60; i++) {
            const bx = (rng() - 0.5) * 2 * BUILDING_SPREAD;
            const bz = (rng() - 0.5) * 2 * BUILDING_SPREAD;
            const h = 80 + rng() * 250;
            const w = 30 + rng() * 60;
            const geo = new THREE.BoxGeometry(w, h, w * 0.8);
            const grey = 0.18 + rng() * 0.2;
            const mat = new THREE.MeshStandardMaterial({
                color: new THREE.Color(grey, grey, grey + 0.05),
                roughness: 0.95,
                metalness: 0.05,
                transparent: true,
                opacity: 0.75,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(bx, h / 2, bz); // Sit on ground
            this.scene.add(mesh);
            this.seededProps.push(mesh);
        }

        const ROCK_SPREAD = WORLD_HALF * WORLD_SCALE * 0.7;
        for (let i = 0; i < 80; i++) {
            const rx = (rng() - 0.5) * 2 * ROCK_SPREAD;
            const ry = 50 + rng() * 400; // Float above ground
            const rz = (rng() - 0.5) * 2 * ROCK_SPREAD;
            const size = 10 + rng() * 40;
            const geo = new THREE.DodecahedronGeometry(size, 0);
            const shade = 0.3 + rng() * 0.3;
            const mat = new THREE.MeshStandardMaterial({
                color: new THREE.Color(shade, shade * 0.9, shade * 0.8),
                roughness: 0.95,
                metalness: 0.05,
                transparent: true,
                opacity: 0.7,
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

        const CRYSTAL_SPREAD = WORLD_HALF * WORLD_SCALE * 0.6;
        for (let i = 0; i < 25; i++) {
            const group = new THREE.Group();
            const cx2 = (rng() - 0.5) * 2 * CRYSTAL_SPREAD;
            const cy2 = 100 + rng() * 350; // Floating height
            const cz2 = (rng() - 0.5) * 2 * CRYSTAL_SPREAD;
            const numCrystals = 3 + Math.floor(rng() * 4);
            const hue = rng();
            for (let j = 0; j < numCrystals; j++) {
                const crystalSize = 8 + rng() * 20;
                const geo = new THREE.OctahedronGeometry(crystalSize, 0);
                const color = new THREE.Color().setHSL(hue, 0.5 + rng() * 0.3, 0.5 + rng() * 0.2);
                const mat = new THREE.MeshStandardMaterial({
                    color,
                    roughness: 0.15,
                    metalness: 0.7,
                    transparent: true,
                    opacity: 0.75,
                });
                const mesh = new THREE.Mesh(geo, mat);
                mesh.position.set((rng() - 0.5) * 40, rng() * 30, (rng() - 0.5) * 40);
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

        const PILLAR_SPREAD = WORLD_HALF * WORLD_SCALE * 0.65;
        for (let i = 0; i < 15; i++) {
            const px = (rng() - 0.5) * 2 * PILLAR_SPREAD;
            const pz = (rng() - 0.5) * 2 * PILLAR_SPREAD;
            const height = 200 + rng() * 400;
            const geo = new THREE.CylinderGeometry(3, 3, height, 6);
            const hue2 = rng();
            const color = new THREE.Color().setHSL(hue2, 0.6, 0.6);
            const mat = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.25,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(px, height / 2, pz);
            this.scene.add(mesh);
            this.seededProps.push(mesh);
        }

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
            const wy = 150 + rng() * 350; // Float above ground
            const wz = (rng() - 0.5) * 2 * ISLAND_SPREAD;
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

    setInteractionState(propId, activated) {
        const prop = this.interactableProps.find(p => p.id === propId);
        if (prop) prop.setActivated(activated);
    },

    _makeCloud(scale) {
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, transparent: true, opacity: 0.6 });
        const blobs = [
            { x: 0, y: 0, s: 60 * scale },
            { x: 80, y: -15, s: 50 * scale },
            { x: -70, y: -10, s: 45 * scale },
            { x: 40, y: 30, s: 40 * scale },
            { x: -30, y: 25, s: 35 * scale },
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
            { x: 0, y: 0, s: 35 * scale },
            { x: 100, y: -5, s: 25 * scale },
            { x: -90, y: 5, s: 28 * scale },
            { x: 160, y: -8, s: 20 * scale },
            { x: -150, y: 3, s: 22 * scale },
            { x: 50, y: 10, s: 18 * scale },
            { x: -40, y: -8, s: 20 * scale },
        ];
        blobs.forEach(b => {
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
            { x: 0, y: 0, s: 90 * scale },
            { x: 110, y: -20, s: 75 * scale },
            { x: -100, y: -15, s: 70 * scale },
            { x: 55, y: 50, s: 65 * scale },
            { x: -45, y: 45, s: 55 * scale },
            { x: 140, y: 10, s: 50 * scale },
            { x: -130, y: 5, s: 45 * scale },
            { x: 0, y: 65, s: 60 * scale },
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
            { x: 0, y: 0, s: 80 * scale },
            { x: 120, y: -25, s: 70 * scale },
            { x: -110, y: -20, s: 65 * scale },
            { x: 50, y: 40, s: 60 * scale },
            { x: -60, y: 35, s: 55 * scale },
            { x: 0, y: -40, s: 75 * scale },
            { x: 80, y: -50, s: 50 * scale },
            { x: -70, y: -45, s: 55 * scale },
        ];
        blobs.forEach(b => {
            const geo = new THREE.SphereGeometry(b.s, 10, 8);
            const m = new THREE.Mesh(geo, mat);
            m.position.set(b.x, b.y, 0);
            group.add(m);
        });
        return group;
    },
};
