import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { create3DBalloon, getBalloonColors, setBalloonDetailLevel } from './balloonModel.js';
import { sceneGenerationMethods } from './sceneGeneration.js';
import {
    WORLD_SIZE,
    CHUNK_SIZE,
    DRAG_SENSITIVITY,
    WORLD_HALF,
    WORLD_SCALE,
    REMOTE_POS_LERP,
    REMOTE_STALE_REMOVE_MS,
    BALLOON_COLLISION_REPEL,
    BALLOON_COLLISION_DAMP,
    BALLOON_COLLISION_MAX_PUSH,
    AURA_COLORS,
    worldToScene,
    sceneToWorld,
    worldToScene3D,
    sceneToWorld3D,
    ORBIT_DEFAULT_THETA,
    ORBIT_DEFAULT_PHI,
    ORBIT_MIN_PHI,
    ORBIT_MAX_PHI,
    ORBIT_DEFAULT_RADIUS,
    ORBIT_MIN_RADIUS,
    ORBIT_MAX_RADIUS,
    ORBIT_ROTATE_SPEED,
    ORBIT_DAMPING,
    GROUND_Y,
    BALLOON_FLOAT_Y
} from './sceneConstants.js';

// main.js is a classic script (non-module), so expose THREE for shared preview rendering.
if (typeof window !== 'undefined' && !window.THREE) {
    window.THREE = THREE;
}
if (typeof window !== 'undefined' && !window.createShopBalloonModel) {
    window.createShopBalloonModel = (scale = 0.8, skinId = 'default') => create3DBalloon(scale, skinId, false);
}

// Central world runtime. Rendering/input/network sync are intentionally grouped
// here, while reusable primitives are moved to dedicated modules.
const WorldScene = {
    ...sceneGenerationMethods,
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

    // 3D orbit camera state
    orbitTheta: ORBIT_DEFAULT_THETA,
    orbitPhi: ORBIT_DEFAULT_PHI,
    orbitRadius: ORBIT_DEFAULT_RADIUS,
    orbitTargetRadius: ORBIT_DEFAULT_RADIUS,
    orbitTarget: null, // THREE.Vector3 – set in init()
    orbitVelTheta: 0,
    orbitVelPhi: 0,
    playerWorldX: 0,
    playerWorldY: 0,
    playerWorldZ: 0, // altitude offset from BALLOON_FLOAT_Y
    minWorldZ: -40,
    maxWorldZ: 500,
    touchGesture: null,
    oneHandCruise: {
        active: false,
        pointerId: null,
        anchorX: 0,
        anchorY: 0,
        dirX: 0,
        dirY: 1,
        speed: 0.6,
        longPressTimer: null,
    },
    touchTuning: {
        altitudeZone: 0.72,
        longPressMs: 320,
        tapPx: 9,
        tapMaxMs: 230,
        cancelLongPressPx: 14,
        altitudeSwipeGain: 1.8,
        dragMoveScale: 0.0023,
        twoFingerRotateSpeed: ORBIT_ROTATE_SPEED * 0.55,
        twoFingerTiltSpeed: ORBIT_ROTATE_SPEED * 0.38,
        cruiseMinSpeed: 0.22,
        cruiseResponsePx: 120,
        cruiseStartSpeed: 0.6,
    },
    ignoreNextClickUntil: 0,

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
        this.camera = new THREE.PerspectiveCamera(55, W / H, 1, 30000);

        // Initialize orbit target (player's scene position)
        this.orbitTarget = new THREE.Vector3(0, BALLOON_FLOAT_Y, 0);
        this._updateCameraFromOrbit();

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

        this._buildGroundPlane();
        this._setupComposer(W, H);

        this._buildStars();
        this._buildMoon();
        this._buildClouds();
        this._buildSkyIslands();
        this.balloonLodDistance = this._getAdaptiveBalloonLodDistance();
        this.touchTuning = this._getAdaptiveTouchTuning();

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

    /** Build the 3D ground plane with grid pattern */
    _buildGroundPlane() {
        // Large ground disc
        const groundSize = WORLD_HALF * WORLD_SCALE * 2;
        const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize, 1, 1);
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x1a2a1a,
            roughness: 0.95,
            metalness: 0.0,
            transparent: true,
            opacity: 0.85,
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = GROUND_Y;
        ground.receiveShadow = true;
        this.scene.add(ground);
        this._groundMesh = ground;

        // Grid helper for spatial reference
        const gridSize = 6000;
        const gridDivisions = 60;
        const grid = new THREE.GridHelper(gridSize, gridDivisions, 0x1a3a5a, 0x0a1520);
        grid.position.y = GROUND_Y + 0.5;
        grid.material.transparent = true;
        grid.material.opacity = 0.35;
        this.scene.add(grid);
        this._gridHelper = grid;
    },

    /** Update camera position from spherical orbit parameters */
    _updateCameraFromOrbit() {
        if (!this.camera || !this.orbitTarget) return;
        const r = this.orbitRadius;
        const theta = this.orbitTheta;
        const phi = this.orbitPhi;
        this.camera.position.set(
            this.orbitTarget.x + r * Math.sin(phi) * Math.sin(theta),
            this.orbitTarget.y + r * Math.cos(phi),
            this.orbitTarget.z + r * Math.sin(phi) * Math.cos(theta)
        );
        this.camera.lookAt(this.orbitTarget);
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

    // Environment builders and seeded world generation live in sceneGeneration.js
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

        // If my id was previously rendered as remote/ranking/background,
        // rebuild it as true self balloon so scale/offset/depth are consistent.
        if (b && !b.isMe) {
            this._removeBalloonById(me.id);
            b = null;
        }

        if (!b) {
            const grp = this.addBalloon(me, null, true);
            const s = worldToScene3D(this.playerWorldX, this.playerWorldY);
            grp.position.set(s.x, BALLOON_FLOAT_Y, s.z);
            grp.userData.baseY = BALLOON_FLOAT_Y;
            b = this.balloons.get(me.id);
        }
        if (!b) return;

        b.isMe = true;
        b.kind = 'self';
        b.isBackground = false;
        b.user = { ...b.user, ...me };
        b.group.userData.user = b.user;
        if (!Number.isFinite(b.group.position.x)) b.group.position.x = 0;
        if (!Number.isFinite(b.group.position.z)) b.group.position.z = 0;
        if (!Number.isFinite(b.group.userData.baseY)) b.group.userData.baseY = BALLOON_FLOAT_Y;
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

    _hash01(seed) {
        const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453123;
        return x - Math.floor(x);
    },

    _getBalloonCollisionRadius(balloonState) {
        if (!balloonState) return 92;
        if (balloonState.isMe) return 128;
        if (balloonState.kind === 'background') return 88;
        if (balloonState.kind === 'nearby') return 98;
        return 94;
    },

    _resolveBalloonCollisions() {
        const entries = [];
        this.balloons.forEach((b) => {
            const grp = b?.group;
            if (!grp || !grp.visible) return;
            entries.push(b);
            if (!Number.isFinite(grp.userData.pushVX)) grp.userData.pushVX = 0;
            if (!Number.isFinite(grp.userData.pushVZ)) grp.userData.pushVZ = 0;
        });

        for (let i = 0; i < entries.length; i++) {
            const a = entries[i];
            const ga = a.group;
            const ar = this._getBalloonCollisionRadius(a);

            for (let j = i + 1; j < entries.length; j++) {
                const b = entries[j];
                const gb = b.group;
                const br = this._getBalloonCollisionRadius(b);
                const minDist = ar + br;

                const dx = gb.position.x - ga.position.x;
                const dz = gb.position.z - ga.position.z;
                const distSq = dx * dx + dz * dz;
                if (distSq >= minDist * minDist) continue;

                const dist = Math.max(0.001, Math.sqrt(distSq));
                const nx = dx / dist;
                const nz = dz / dist;
                const overlap = minDist - dist;
                const impulse = Math.min(BALLOON_COLLISION_MAX_PUSH, overlap * BALLOON_COLLISION_REPEL);

                const aStatic = !!a.isMe;
                const bStatic = !!b.isMe;

                if (aStatic && bStatic) continue;

                if (aStatic || bStatic) {
                    if (aStatic) {
                        gb.userData.pushVX += nx * impulse;
                        gb.userData.pushVZ += nz * impulse;
                    } else {
                        ga.userData.pushVX -= nx * impulse;
                        ga.userData.pushVZ -= nz * impulse;
                    }
                } else {
                    const half = impulse * 0.5;
                    ga.userData.pushVX -= nx * half;
                    ga.userData.pushVZ -= nz * half;
                    gb.userData.pushVX += nx * half;
                    gb.userData.pushVZ += nz * half;
                }
            }
        }
    },

    _getHorizontalSlot(id, index, total, options = {}) {
        const radiusStep = options.radiusStep ?? 88;
        const yBand = options.yBand ?? 72;
        const yWave = options.yWave ?? 26;
        const depthBand = options.depthBand ?? 110;
        const radialJitter = options.radialJitter ?? 28;
        const angularJitter = options.angularJitter ?? 0.95;
        const driftX = options.driftX ?? 42;
        const squashZ = options.squashZ ?? 0.65;

        const h1 = this._hash01(id * 1.17 + 11.3);
        const h2 = this._hash01(id * 2.37 + 23.1);
        const h3 = this._hash01(id * 3.97 + 31.7);

        const safeTotal = Math.max(1, total | 0);
        const t = (index + 0.5) / safeTotal;
        const goldenAngle = Math.PI * (3 - Math.sqrt(5));

        // Sunflower-like spread in 3D XZ plane around player
        const baseRadius = Math.sqrt(index + 0.6) * radiusStep;
        const radius = Math.max(24, baseRadius + (h1 - 0.5) * radialJitter);
        const angle = index * goldenAngle + h2 * angularJitter + t * Math.PI * 0.35;

        const xCore = Math.cos(angle) * radius;
        const zCore = Math.sin(angle) * radius * squashZ;

        // Place in world XZ plane relative to camera/player
        const playerScene = worldToScene3D(this.playerWorldX, this.playerWorldY);
        const sx = playerScene.x + xCore + Math.sin(angle * 0.63 + h3 * 4.2) * driftX;
        const sz = playerScene.z + zCore + (h3 - 0.5) * depthBand;
        const sy = BALLOON_FLOAT_Y + (h2 - 0.5) * yBand + Math.sin(angle * 1.55 + h1 * 6.0) * yWave;

        return { sx, sy, sz, h1, h2, h3 };
    },

    /**
     * Populate / refresh the ranking layer using a camera-relative
     * curved multi-row arrangement with deterministic variance.
     */
    // Player sync pipeline: ranking data -> balloons -> target transforms.
    setUsers(users, me, isLight) {
        this.setDayNightMode(isLight, true);
        this._ensureMyBalloon(me);

        const rankingList = (users || [])
            .filter(u => !me || u.id !== me.id)
            .slice(0, 120)
            .sort((a, b) => Number(a.id) - Number(b.id));
        const keepRankingIds = new Set(rankingList.map(u => u.id));

        this.balloons.forEach((b, id) => {
            if (b.isMe) return;
            if (b.kind === 'nearby') return;
            if (!keepRankingIds.has(id)) this._removeBalloonById(id);
        });

        rankingList.forEach((user, i) => {
            const { sx, sy, sz, h1, h2, h3 } = this._getHorizontalSlot(user.id, i, rankingList.length, {
                rowOffsetY: -120,
                radiusStep: 86,
                yBand: 66,
                yWave: 24,
                depthBand: 96,
                radialJitter: 24,
                angularJitter: 0.92,
                driftX: 38,
                squashZ: 0.62
            });

            const skinId = user.balloon_skin || 'default';
            const auraId = user.balloon_aura || 'none';

            let b = this.balloons.get(user.id);
            if (!b) {
                const grp = this.addBalloon(user, null, false);
                grp.position.set(sx, sy, sz);
                grp.userData.baseY = sy;
                grp.userData.floatAmp = 6 + h1 * 5;
                grp.userData.floatSpeed = 0.8 + h2 * 0.6;
                grp.userData.floatPhase = h3 * Math.PI * 2;
                b = this.balloons.get(user.id);
            }
            if (!b || b.isMe || b.kind === 'nearby') return;

            b.kind = 'ranking';
            b.isBackground = false;
            b.user = { ...b.user, ...user };
            b.group.userData.user = b.user;
            b.group.userData.targetX = sx;
            b.group.userData.targetY = sy;
            b.group.position.z += (sz - b.group.position.z) * 0.2;
            b.group.userData.floatAmp = 6 + h1 * 5;
            b.group.userData.floatSpeed = 0.8 + h2 * 0.6;
            b.group.userData.floatPhase = h3 * Math.PI * 2;
            this._updateBalloonColor(b.group, skinId);
            this._updateBalloonAura(b.group, auraId, false);

            b.group.visible = true;
            if (b.group.userData.label) b.group.userData.label.visible = true;
            if (b.group.userData.bubbleMesh) b.group.userData.bubbleMesh.visible = true;
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

        const nearbyUsers = (players || [])
            .filter(u => !me || u.id !== me.id)
            .slice(0, 80)
            .sort((a, b) => Number(a.id) - Number(b.id));
        const nearbyIds = new Set(nearbyUsers.map(u => u.id));

        this.balloons.forEach((b, id) => {
            if (b.isMe) return;
            if (b.kind !== 'nearby') return;
            if (!nearbyIds.has(id) && now - (b.lastSeenAt || 0) > REMOTE_STALE_REMOVE_MS) {
                this._removeBalloonById(id);
            }
        });

        nearbyUsers.forEach((user, i) => {
            const skinId = user.balloon_skin || 'default';
            const auraId = user.balloon_aura || 'none';
            const { sx, sy, sz, h1, h2, h3 } = this._getHorizontalSlot(user.id, i, nearbyUsers.length, {
                rowOffsetY: 110,
                radiusStep: 82,
                yBand: 72,
                yWave: 28,
                depthBand: 104,
                radialJitter: 28,
                angularJitter: 1.05,
                driftX: 44,
                squashZ: 0.68
            });

            let b = this.balloons.get(user.id);
            if (!b) {
                const grp = this.addBalloon(user, null, false);
                grp.position.set(sx, sy, sz);
                grp.userData.baseY = sy;
                grp.userData.floatAmp = 7 + h1 * 6;
                grp.userData.floatSpeed = 0.9 + h2 * 0.7;
                grp.userData.floatPhase = h3 * Math.PI * 2;
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
            b.group.position.z += (sz - b.group.position.z) * 0.25;
            if (typeof b.group.userData.baseY !== 'number') b.group.userData.baseY = sy;
            b.group.userData.floatAmp = 7 + h1 * 6;
            b.group.userData.floatSpeed = 0.9 + h2 * 0.7;
            b.group.userData.floatPhase = h3 * Math.PI * 2;

            this._updateBalloonColor(b.group, skinId);
            this._updateBalloonAura(b.group, auraId, false);
            if (b.user.status_message !== user.status_message) {
                this.updateStatusMsg(user.id, user.status_message);
            }
            b.group.visible = true;
        });
    },

    /** Move a single remote player to a new world position (socket player:moved). */
    moveWorldPlayer(userId, worldX, worldY, worldZ) {
        const b = this.balloons.get(userId);
        if (!b || b.isMe) return;
        if (b.kind !== 'nearby') return;
        b.lastSeenAt = Date.now();
        // Horizontal layout is applied by updateWorldPlayers() from the latest
        // nearby snapshot, so per-move world coordinates are intentionally ignored.
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
        const list = (users || [])
            .slice(0, 40)
            .sort((a, b) => Number(a.id) - Number(b.id));
        const keepIds = new Set(list.map(u => u.id));

        // Remove old background balloons not present in the new list.
        this.balloons.forEach((b, id) => {
            if (b.kind === 'background' && !keepIds.has(id)) {
                this._removeBalloonById(id);
            }
        });

        list.forEach((user, i) => {
            if (!user || user.id == null) return;
            const { sx, sy, sz, h1, h2, h3 } = this._getHorizontalSlot(user.id, i, list.length, {
                rowOffsetY: -360,
                radiusStep: 112,
                yBand: 58,
                yWave: 20,
                depthBand: 138,
                radialJitter: 34,
                angularJitter: 0.88,
                driftX: 52,
                squashZ: 0.58
            });

            const skinId = user.balloon_skin || 'default';
            const auraId = user.balloon_aura || 'none';

            if (this.balloons.has(user.id)) {
                const b = this.balloons.get(user.id);
                if (!b.isMe && b.kind !== 'nearby') {
                    b.kind = 'background';
                    b.isBackground = true;
                    b.user = { ...b.user, ...user };
                    b.group.userData.user = b.user;
                    b.group.userData.targetX = sx;
                    b.group.userData.targetY = sy;
                    b.group.position.z += (sz - b.group.position.z) * 0.2;
                    b.group.userData.floatAmp = 5 + h1 * 4;
                    b.group.userData.floatSpeed = 0.75 + h2 * 0.45;
                    b.group.userData.floatPhase = h3 * Math.PI * 2;
                    this._updateBalloonColor(b.group, skinId);
                    this._updateBalloonAura(b.group, auraId, false);
                    b.group.visible = true;
                }
            } else {
                const grp = this.addBalloon(user, null, false);
                grp.position.set(sx, sy, sz);
                grp.userData.baseY = sy;
                grp.userData.floatAmp = 5 + h1 * 4;
                grp.userData.floatSpeed = 0.75 + h2 * 0.45;
                grp.userData.floatPhase = h3 * Math.PI * 2;
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
        const skins = window.BALLOON_SKINS || {};
        const fallback = { darkImg: 'assets/balloon_dark.png', lightImg: 'assets/balloon_light.png' };
        const s = skins[skinId] || skins.default || fallback;
        return isLight ? (s.lightImg || fallback.lightImg) : (s.darkImg || fallback.darkImg);
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
        const b = this.balloons.get(userId);
        if (!b) return;
        const pos = b.group.position;
        const wPos = sceneToWorld3D(pos.x, pos.z);
        this.teleportTo(wPos.x, wPos.y);
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
                d.position.set((Math.random() - 0.5) * 4000, Math.random() * 800 + 100, (Math.random() - 0.5) * 4000);
                d.userData.speed = 12 + Math.random() * 6;
                d.userData.resetY = 800;
                this.scene.add(d);
                this.raindrops.push(d);
            }
        } else if (this.weatherMode === 'snow') {
            for (let i = 0; i < 150; i++) {
                const geo = new THREE.SphereGeometry(3 + Math.random() * 3, 5, 5);
                const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
                const f = new THREE.Mesh(geo, mat);
                f.position.set((Math.random() - 0.5) * 4000, Math.random() * 800 + 100, (Math.random() - 0.5) * 4000);
                f.userData.speed = 1.5 + Math.random() * 1.5;
                f.userData.drift = (Math.random() - 0.5) * 2;
                f.userData.resetY = 800;
                this.scene.add(f);
                this.snowflakes.push(f);
            }
        }
    },

    focusHome() {
        if (this.myBalloon) {
            const grp = this.myBalloon.group;
            const wPos = sceneToWorld3D(grp.position.x, grp.position.z);
            this.teleportTo(wPos.x, wPos.y);
        } else {
            this.teleportTo(0, 0);
        }
        this.orbitTargetRadius = ORBIT_DEFAULT_RADIUS;
    },

    // ── World coordinate helpers ──────────────────────────────────────────

    /** Clamp player position to the world boundary. */
    _clampCamPos() {
        this._clampPlayerState();
    },

    _clampPlayerState() {
        this.playerWorldX = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, this.playerWorldX));
        this.playerWorldY = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, this.playerWorldY));
        this.playerWorldZ = Math.max(this.minWorldZ, Math.min(this.maxWorldZ, this.playerWorldZ));
        const s = worldToScene3D(this.playerWorldX, this.playerWorldY);
        this.camPos.x = s.x;
        this.camPos.y = s.z;
    },

    _getBalloonBaseY() {
        return BALLOON_FLOAT_Y + this.playerWorldZ;
    },

    _setPlayerWorldPosition(worldX, worldY, worldZ = this.playerWorldZ) {
        this.playerWorldX = Number(worldX) || 0;
        this.playerWorldY = Number(worldY) || 0;
        this.playerWorldZ = Number(worldZ) || 0;
        this._clampPlayerState();
        this._syncPlayerPosition();
    },

    _applyPlayerWorldDelta(dx = 0, dy = 0, dz = 0) {
        this._setPlayerWorldPosition(
            this.playerWorldX + dx,
            this.playerWorldY + dy,
            this.playerWorldZ + dz
        );
    },

    /**
     * Returns the player's position in *world-units* (large-scale coordinates).
     * worldX ∈ [-100000, 100000], worldY ∈ [-100000, 100000].
     */
    getWorldPosition() {
        return {
            x: Math.round(this.playerWorldX),
            y: Math.round(this.playerWorldY),
            z: Math.round(this.playerWorldZ),
        };
    },

    getMyPosition() {
        return {
            x: Math.round(this.playerWorldX),
            y: Math.round(this.playerWorldY),
            z: Math.round(this.playerWorldZ)
        };
    },

    getUserPosition(userId) {
        const b = this.balloons.get(userId);
        if (b) {
            const pos = b.group.position;
            const wPos = sceneToWorld3D(pos.x, pos.z);
            return {
                x: Math.round(wPos.x),
                y: Math.round(wPos.y),
                z: Math.round(pos.y)
            };
        }
        return null;
    },

    /** Teleport to world-unit coordinates. */
    teleportTo(worldX, worldY, worldZ = this.playerWorldZ) {
        this._setPlayerWorldPosition(worldX, worldY, worldZ);
    },

    /** Set initial spawn position from saved world coordinates. */
    setSpawnPosition(worldX, worldY, worldZ = 0) {
        this._setPlayerWorldPosition(worldX || 0, worldY || 0, worldZ || 0);
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
            <button id="island-info-close" style="
                background:rgba(49,130,246,0.12); border:1.5px solid rgba(49,130,246,0.35);
                color:#3182F6; padding:10px 28px; border-radius:999px;
                font-size:13px; font-weight:700; cursor:pointer;
                transition:all 0.2s; font-family:'Pretendard Variable',sans-serif;
            ">닫기</button>
        `;

        const _closeIslandInfo = () => { const t = document.getElementById('island-info'); if (t) t.remove(); };
        const _closeBtn1 = infoEl.querySelector('#island-info-close');
        if (_closeBtn1) {
            _closeBtn1.addEventListener('click', _closeIslandInfo);
            _closeBtn1.addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') { e.preventDefault(); _closeIslandInfo(); } }, { passive: false });
        }

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
        this.orbitTargetRadius += delta * 600;
        this.orbitTargetRadius = Math.max(ORBIT_MIN_RADIUS, Math.min(ORBIT_MAX_RADIUS, this.orbitTargetRadius));
    },

    highlightUser(query) {
        if (!query) return;
        const q = query.toLowerCase();
        this.balloons.forEach((b) => {
            const u = b.user;
            if (u.nickname.toLowerCase().includes(q) || (u.university || '').toLowerCase().includes(q)) {
                const pos = b.group.position;
                const wPos = sceneToWorld3D(pos.x, pos.z);
                this.teleportTo(wPos.x, wPos.y);
            }
        });
    },

    _setupComposer(W, H) {
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));

        const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.25, 0.4, 0.88);
        this.composer.addPass(bloom);
    },

    // Input router for 3D orbit camera: drag to rotate, scroll to zoom,
    // right-drag/two-finger to pan, WASD to move player.
    _setupInput() {
        const canvas = this.renderer.domElement;
        let pointerButton = -1;

        canvas.addEventListener('pointerdown', (e) => {
            if (e.target.closest?.('.glass-panel,.hud-header,.fab-rail,.pill-action-wrap')) return;
            this.lastPointer = { x: e.clientX, y: e.clientY };
            this.balloonDragDist = 0;
            pointerButton = e.button;
            canvas.setPointerCapture(e.pointerId);

            // Mobile-first, no-button controls:
            // - left/center touch drag: move in world plane
            // - right-side vertical swipe: altitude up/down
            if (e.pointerType === 'touch') {
                const tune = this.touchTuning || {};
                const altitudeZone = Number.isFinite(tune.altitudeZone) ? tune.altitudeZone : 0.72;
                const mode = (e.clientX / Math.max(1, window.innerWidth)) >= altitudeZone
                    ? 'altitude'
                    : 'travel';
                this.touchGesture = {
                    pointerId: e.pointerId,
                    mode,
                    startedAt: Date.now(),
                    startX: e.clientX,
                    startY: e.clientY,
                    moved: 0,
                    longPressActivated: false,
                };
                this.isDraggingBalloon = mode === 'travel' && !this.oneHandCruise.active;
                this.isDragging = false;

                if (mode === 'travel' && this.oneHandCruise.active) {
                    this.oneHandCruise.pointerId = e.pointerId;
                    this.oneHandCruise.anchorX = e.clientX;
                    this.oneHandCruise.anchorY = e.clientY;
                    this.touchGesture.mode = 'cruise-steer';
                    this._showTravelHint(true, '원핸드 순항 조향 중... 탭하면 해제');
                    return;
                }

                if (mode === 'travel') {
                    const tune2 = this.touchTuning || {};
                    const longPressMs = Number.isFinite(tune2.longPressMs) ? tune2.longPressMs : 320;
                    this.springActive = false;
                    this._showTravelHint(true, '화면 드래그 이동 · 길게 누르면 원핸드 순항');
                    this._clearOneHandLongPressTimer();
                    this.oneHandCruise.longPressTimer = setTimeout(() => {
                        const tune3 = this.touchTuning || {};
                        const cancelLongPressPx = Number.isFinite(tune3.cancelLongPressPx) ? tune3.cancelLongPressPx : 14;
                        if (!this.touchGesture) return;
                        if (this.touchGesture.pointerId !== e.pointerId) return;
                        if (this.touchGesture.mode !== 'travel') return;
                        if (this.touchGesture.moved > cancelLongPressPx) return;
                        this.touchGesture.longPressActivated = true;
                        this.touchGesture.mode = 'cruise-steer';
                        this.isDraggingBalloon = false;
                        this._startOneHandCruise(e.pointerId, e.clientX, e.clientY);
                        this.ignoreNextClickUntil = Date.now() + 420;
                    }, longPressMs);
                }
                return;
            }

            // Check if user clicked their own balloon for dragging
            if (this.myBalloon && e.button === 0) {
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
                    canvas.style.cursor = 'grabbing';
                    this._showTravelHint(true);
                    return;
                }
            }

            this.isDragging = true;
        });

        canvas.addEventListener('pointermove', (e) => {
            if (!this.lastPointer) return;
            const dx = e.clientX - this.lastPointer.x;
            const dy = e.clientY - this.lastPointer.y;
            this.lastPointer = { x: e.clientX, y: e.clientY };

            if (e.pointerType === 'touch' && this.touchGesture?.pointerId === e.pointerId) {
                const movedNow = Math.hypot(dx, dy);
                this.balloonDragDist += movedNow;
                this.touchGesture.moved += movedNow;

                if (this.touchGesture.mode === 'altitude') {
                    this._clearOneHandLongPressTimer();
                    const tune = this.touchTuning || {};
                    const altitudeSwipeGain = Number.isFinite(tune.altitudeSwipeGain) ? tune.altitudeSwipeGain : 1.8;
                    const dz = (-dy) * altitudeSwipeGain;
                    this._applyPlayerWorldDelta(0, 0, dz);
                    return;
                }

                if (this.touchGesture.mode === 'cruise-steer') {
                    this._clearOneHandLongPressTimer();
                    this._updateOneHandCruiseVector(e.clientX, e.clientY);
                    return;
                }

                const tune = this.touchTuning || {};
                const cancelLongPressPx = Number.isFinite(tune.cancelLongPressPx) ? tune.cancelLongPressPx : 14;
                if (this.touchGesture.mode === 'travel' && this.touchGesture.moved > cancelLongPressPx) {
                    this._clearOneHandLongPressTimer();
                }

                const forward = new THREE.Vector3();
                this.camera.getWorldDirection(forward);
                forward.y = 0;
                forward.normalize();
                const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
                const dragMoveScale = Number.isFinite(tune.dragMoveScale) ? tune.dragMoveScale : 0.0023;
                const moveScale = this.orbitRadius * dragMoveScale;
                this._applyPlayerWorldDelta(
                    (right.x * dx + forward.x * (-dy)) * moveScale / WORLD_SCALE,
                    (right.z * dx + forward.z * (-dy)) * moveScale / WORLD_SCALE,
                    0
                );
                return;
            }

            // Dragging own balloon: move player in world XZ plane
            if (this.isDraggingBalloon && this.myBalloon) {
                this.balloonDragDist += Math.hypot(dx, dy);
                // Compute movement in the camera's XZ-projected right and forward vectors
                const forward = new THREE.Vector3();
                this.camera.getWorldDirection(forward);
                forward.y = 0;
                forward.normalize();
                const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

                const moveScale = this.orbitRadius * 0.002;
                this._applyPlayerWorldDelta(
                    (right.x * dx + forward.x * (-dy)) * moveScale / WORLD_SCALE,
                    (right.z * dx + forward.z * (-dy)) * moveScale / WORLD_SCALE,
                    0
                );
                return;
            }

            if (!this.isDragging) {
                // Hover check for cursor
                if (this.myBalloon && this.frameCount % 4 === 0) {
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

            if (pointerButton === 2 || e.shiftKey) {
                // Right-drag or shift-drag: pan the orbit target
                const forward = new THREE.Vector3();
                this.camera.getWorldDirection(forward);
                forward.y = 0;
                forward.normalize();
                const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
                const panScale = this.orbitRadius * 0.0015;
                this._applyPlayerWorldDelta(
                    (right.x * (-dx) + forward.x * dy) * panScale / WORLD_SCALE,
                    (right.z * (-dx) + forward.z * dy) * panScale / WORLD_SCALE,
                    0
                );
            } else {
                // Left-drag: orbit camera rotation
                this.orbitVelTheta += -dx * ORBIT_ROTATE_SPEED;
                this.orbitVelPhi += dy * ORBIT_ROTATE_SPEED;
            }
        });

        canvas.addEventListener('pointerup', (e) => {
            if (this.touchGesture?.pointerId === e.pointerId) {
                const tune = this.touchTuning || {};
                const tapPx = Number.isFinite(tune.tapPx) ? tune.tapPx : 9;
                const tapMaxMs = Number.isFinite(tune.tapMaxMs) ? tune.tapMaxMs : 230;
                const elapsed = Date.now() - (this.touchGesture.startedAt || Date.now());
                const isTap = this.touchGesture.moved < tapPx && elapsed < tapMaxMs;

                if (this.touchGesture.mode === 'cruise-steer' && this.oneHandCruise.active && isTap) {
                    this._stopOneHandCruise();
                    this._showTravelHint(false);
                } else if (this.touchGesture.mode === 'cruise-steer' && this.oneHandCruise.active) {
                    this._showTravelHint(true, '원핸드 순항 중... 탭하면 해제');
                } else if (this.touchGesture.mode === 'travel') {
                    this._showTravelHint(false);
                }

                this._clearOneHandLongPressTimer();
                this.touchGesture = null;
                this.ignoreNextClickUntil = Date.now() + 260;
            }
            if (this.isDraggingBalloon) {
                this.isDraggingBalloon = false;
                canvas.style.cursor = '';
                this._showTravelHint(false);
            }
            this.isDragging = false;
            this.lastPointer = null;
            pointerButton = -1;
            try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
        });

        // Prevent context menu on right-click (used for pan)
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.orbitTargetRadius += e.deltaY * 0.5;
            this.orbitTargetRadius = Math.max(ORBIT_MIN_RADIUS, Math.min(ORBIT_MAX_RADIUS, this.orbitTargetRadius));
        }, { passive: false });

        canvas.addEventListener('click', (e) => {
            if (Date.now() < this.ignoreNextClickUntil) return;
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

            // Sky island click check
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

            // Balloon click check
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

            // Click on ground to move there
            if (this._groundMesh) {
                const groundHits = raycaster.intersectObject(this._groundMesh, false);
                if (groundHits.length > 0) {
                    const pt = groundHits[0].point;
                    const wPos = sceneToWorld3D(pt.x, pt.z);
                    this.teleportTo(wPos.x, wPos.y);
                    this._createClickParticle(pt.x, BALLOON_FLOAT_Y, pt.z);
                }
            }
        });

        // Two-finger gesture: drag to rotate camera + pinch to zoom
        const twoTouchState = {
            active: false,
            prevCenterX: 0,
            prevCenterY: 0,
            prevDist: 0,
        };
        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                this.isDragging = false;
                this.isDraggingBalloon = false;
                this.lastPointer = null;
                this._clearOneHandLongPressTimer();
                this.touchGesture = null;

                const x1 = e.touches[0].clientX;
                const y1 = e.touches[0].clientY;
                const x2 = e.touches[1].clientX;
                const y2 = e.touches[1].clientY;
                twoTouchState.active = true;
                twoTouchState.prevCenterX = (x1 + x2) * 0.5;
                twoTouchState.prevCenterY = (y1 + y2) * 0.5;
                twoTouchState.prevDist = Math.hypot(x1 - x2, y1 - y2);
            }
        }, { passive: false });
        canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2 && twoTouchState.active) {
                e.preventDefault();
                const x1 = e.touches[0].clientX;
                const y1 = e.touches[0].clientY;
                const x2 = e.touches[1].clientX;
                const y2 = e.touches[1].clientY;

                const centerX = (x1 + x2) * 0.5;
                const centerY = (y1 + y2) * 0.5;
                const dist = Math.hypot(x1 - x2, y1 - y2);

                const dCenterX = centerX - twoTouchState.prevCenterX;
                const dCenterY = centerY - twoTouchState.prevCenterY;
                const tune = this.touchTuning || {};
                const rotateSpeed = Number.isFinite(tune.twoFingerRotateSpeed)
                    ? tune.twoFingerRotateSpeed
                    : ORBIT_ROTATE_SPEED * 0.55;
                const tiltSpeed = Number.isFinite(tune.twoFingerTiltSpeed)
                    ? tune.twoFingerTiltSpeed
                    : ORBIT_ROTATE_SPEED * 0.38;

                this.orbitVelTheta += -dCenterX * rotateSpeed;
                this.orbitVelPhi += dCenterY * tiltSpeed;

                this.orbitTargetRadius += (twoTouchState.prevDist - dist) * 1.5;
                this.orbitTargetRadius = Math.max(ORBIT_MIN_RADIUS, Math.min(ORBIT_MAX_RADIUS, this.orbitTargetRadius));

                twoTouchState.prevCenterX = centerX;
                twoTouchState.prevCenterY = centerY;
                twoTouchState.prevDist = dist;
            }
        }, { passive: false });
        canvas.addEventListener('touchend', (e) => {
            if (e.touches.length < 2) {
                twoTouchState.active = false;
            }
        }, { passive: true });

        // Double-click to teleport
        canvas.addEventListener('dblclick', (e) => {
            const rect = canvas.getBoundingClientRect();
            const mouse = new THREE.Vector2(
                ((e.clientX - rect.left) / rect.width) * 2 - 1,
                -((e.clientY - rect.top) / rect.height) * 2 + 1
            );
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, this.camera);
            if (this._groundMesh) {
                const hits = raycaster.intersectObject(this._groundMesh, false);
                if (hits.length > 0) {
                    const pt = hits[0].point;
                    const wPos = sceneToWorld3D(pt.x, pt.z);
                    this.teleportTo(wPos.x, wPos.y);
                    this._createClickParticle(pt.x, BALLOON_FLOAT_Y, pt.z);
                }
            }
        });

        // Hover effect for balloons
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

    /** Sync the player's Three.js position with internal world coords */
    _syncPlayerPosition() {
        const s = worldToScene3D(this.playerWorldX, this.playerWorldY);
        const baseY = this._getBalloonBaseY();
        if (this.orbitTarget) {
            this.orbitTarget.set(s.x, baseY, s.z);
        }
        if (this.myBalloon) {
            const grp = this.myBalloon.group;
            grp.position.x = s.x;
            grp.position.z = s.z;
            grp.userData.baseY = baseY;
        }
        // Keep legacy camPos in sync for coordinate display compat
        this.camPos.x = s.x;
        this.camPos.y = s.z;
    },

    _clearOneHandLongPressTimer() {
        const t = this.oneHandCruise?.longPressTimer;
        if (!t) return;
        clearTimeout(t);
        this.oneHandCruise.longPressTimer = null;
    },

    _stopOneHandCruise() {
        this._clearOneHandLongPressTimer();
        this.oneHandCruise.active = false;
        this.oneHandCruise.pointerId = null;
    },

    _startOneHandCruise(pointerId, x, y) {
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        this.oneHandCruise.active = true;
        this.oneHandCruise.pointerId = pointerId;
        this.oneHandCruise.anchorX = x;
        this.oneHandCruise.anchorY = y;
        this.oneHandCruise.dirX = Number.isFinite(forward.x) ? forward.x : 0;
        this.oneHandCruise.dirY = Number.isFinite(forward.z) ? forward.z : 1;
        const tune = this.touchTuning || {};
        this.oneHandCruise.speed = Number.isFinite(tune.cruiseStartSpeed) ? tune.cruiseStartSpeed : 0.6;
        this._showTravelHint(true, '원핸드 순항 모드: 드래그 조향 · 탭 해제');
    },

    _updateOneHandCruiseVector(clientX, clientY) {
        const dx = clientX - this.oneHandCruise.anchorX;
        const dy = clientY - this.oneHandCruise.anchorY;
        const dist = Math.hypot(dx, dy);
        if (dist < 6) return;

        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

        const worldDX = right.x * dx + forward.x * (-dy);
        const worldDY = right.z * dx + forward.z * (-dy);
        const len = Math.hypot(worldDX, worldDY);
        if (len < 0.001) return;

        this.oneHandCruise.dirX = worldDX / len;
        this.oneHandCruise.dirY = worldDY / len;
        const tune = this.touchTuning || {};
        const cruiseMinSpeed = Number.isFinite(tune.cruiseMinSpeed) ? tune.cruiseMinSpeed : 0.22;
        const cruiseResponsePx = Number.isFinite(tune.cruiseResponsePx) ? tune.cruiseResponsePx : 120;
        this.oneHandCruise.speed = Math.max(cruiseMinSpeed, Math.min(1, dist / cruiseResponsePx));
    },

    _getOneHandCruiseDelta(baseMoveSpeed) {
        if (!this.oneHandCruise.active) return { dx: 0, dy: 0 };
        return {
            dx: this.oneHandCruise.dirX * baseMoveSpeed * this.oneHandCruise.speed,
            dy: this.oneHandCruise.dirY * baseMoveSpeed * this.oneHandCruise.speed,
        };
    },

    _setupKeyboard() {
        const moveSpeed = 120; // world-units per tick
        const verticalSpeed = 30; // altitude-units per tick
        document.addEventListener('keydown', (e) => {
            this.keysPressed[e.key.toLowerCase()] = true;
            if (e.key.toLowerCase() === 'r') this.cycleWeather();
            if (e.key.toLowerCase() === 'h') this.focusHome();
            if (e.code === 'Space' || e.key === 'PageUp' || e.key === 'PageDown') {
                e.preventDefault();
            }
        });
        document.addEventListener('keyup', (e) => {
            this.keysPressed[e.key.toLowerCase()] = false;
        });

        setInterval(() => {
            // Compute forward/right in world plane from camera angle
            const forward = new THREE.Vector3();
            this.camera.getWorldDirection(forward);
            forward.y = 0;
            forward.normalize();
            const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

            let mx = 0, mz = 0;
            if (this.keysPressed['w'] || this.keysPressed['arrowup']) { mx += forward.x; mz += forward.z; }
            if (this.keysPressed['s'] || this.keysPressed['arrowdown']) { mx -= forward.x; mz -= forward.z; }
            if (this.keysPressed['a'] || this.keysPressed['arrowleft']) { mx -= right.x; mz -= right.z; }
            if (this.keysPressed['d'] || this.keysPressed['arrowright']) { mx += right.x; mz += right.z; }

            let dz = 0;
            if (this.keysPressed[' '] || this.keysPressed['e'] || this.keysPressed['pageup']) dz += verticalSpeed;
            if (this.keysPressed['shift'] || this.keysPressed['q'] || this.keysPressed['control'] || this.keysPressed['pagedown']) dz -= verticalSpeed;

            let dx = 0;
            let dy = 0;
            if (mx !== 0 || mz !== 0) {
                const len = Math.sqrt(mx * mx + mz * mz);
                dx += (mx / len) * moveSpeed;
                dy += (mz / len) * moveSpeed;
            }

            const cruiseDelta = this._getOneHandCruiseDelta(moveSpeed);
            dx += cruiseDelta.dx;
            dy += cruiseDelta.dy;

            if (dx !== 0 || dy !== 0 || dz !== 0) {
                this._applyPlayerWorldDelta(dx, dy, dz);
            }
        }, 50);
    },

    _showTravelHint(visible, message) {
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
            el.textContent = message || '✈  화면을 드래그해 이동 중...';
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

    _getAdaptiveTouchTuning() {
        const nav = window.navigator || {};
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const shortSide = Math.min(window.innerWidth || 0, window.innerHeight || 0);
        const hasTouch = ('ontouchstart' in window) || ((nav.maxTouchPoints || 0) > 0);
        const isMobileLike = hasTouch && shortSide <= 1024;

        let longPressMs = isMobileLike ? 300 : 340;
        let tapPx = isMobileLike ? 11 : 9;
        let cancelLongPressPx = isMobileLike ? 18 : 14;
        let altitudeSwipeGain = isMobileLike ? 2.0 : 1.8;
        let dragMoveScale = isMobileLike ? 0.0027 : 0.0023;
        let twoFingerRotateSpeed = ORBIT_ROTATE_SPEED * (isMobileLike ? 0.62 : 0.55);
        let twoFingerTiltSpeed = ORBIT_ROTATE_SPEED * (isMobileLike ? 0.42 : 0.38);
        let cruiseResponsePx = isMobileLike ? 105 : 120;
        let cruiseStartSpeed = isMobileLike ? 0.62 : 0.6;

        if (dpr >= 2.5) {
            tapPx += 2;
            cancelLongPressPx += 2;
            dragMoveScale *= 1.08;
            altitudeSwipeGain *= 1.08;
            twoFingerRotateSpeed *= 1.06;
            twoFingerTiltSpeed *= 1.06;
            cruiseResponsePx = Math.max(88, cruiseResponsePx - 8);
        }

        if (shortSide <= 430) {
            dragMoveScale *= 1.12;
            altitudeSwipeGain *= 1.1;
            longPressMs = Math.max(240, longPressMs - 25);
        }

        return {
            altitudeZone: isMobileLike ? 0.74 : 0.72,
            longPressMs: Math.round(longPressMs),
            tapPx: Math.round(tapPx),
            tapMaxMs: 240,
            cancelLongPressPx: Math.round(cancelLongPressPx),
            altitudeSwipeGain,
            dragMoveScale,
            twoFingerRotateSpeed,
            twoFingerTiltSpeed,
            cruiseMinSpeed: 0.22,
            cruiseResponsePx,
            cruiseStartSpeed,
        };
    },

    _onResize() {
        const W = window.innerWidth, H = window.innerHeight;
        this.balloonLodDistance = this._getAdaptiveBalloonLodDistance();
        this.touchTuning = this._getAdaptiveTouchTuning();
        this.camera.aspect = W / H;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(W, H);
        this.composer.setSize(W, H);
        this._updateCameraFromOrbit();
    },

    // Per-frame simulation + render entry point.
    _loop() {
        requestAnimationFrame(() => this._loop());
        this.frameCount++;
        const t = this.frameCount * 0.016;

        // ── Orbit camera update ──────────────────────────────────
        // Apply orbit velocity with damping (inertia from drag)
        this.orbitTheta += this.orbitVelTheta;
        this.orbitPhi += this.orbitVelPhi;
        this.orbitVelTheta *= ORBIT_DAMPING;
        this.orbitVelPhi *= ORBIT_DAMPING;

        // Clamp phi to prevent flipping
        this.orbitPhi = Math.max(ORBIT_MIN_PHI, Math.min(ORBIT_MAX_PHI, this.orbitPhi));

        // Smooth zoom
        this.orbitRadius += (this.orbitTargetRadius - this.orbitRadius) * 0.08;

        // Smoothly track orbit target toward player position
        if (this.orbitTarget && this.myBalloon) {
            const grp = this.myBalloon.group;
            this.orbitTarget.x += (grp.position.x - this.orbitTarget.x) * 0.1;
            this.orbitTarget.y += (this._getBalloonBaseY() - this.orbitTarget.y) * 0.1;
            this.orbitTarget.z += (grp.position.z - this.orbitTarget.z) * 0.1;
        }

        this._updateCameraFromOrbit();

        // Move grid to follow player
        if (this._gridHelper && this.myBalloon) {
            this._gridHelper.position.x = this.myBalloon.group.position.x;
            this._gridHelper.position.z = this.myBalloon.group.position.z;
        }

        this._resolveBalloonCollisions();

        this.balloons.forEach((b) => {
            const grp = b.group;

            // In 3D mode, balloons face the camera only on the Y axis (turntable)
            if (this.camera) {
                const lookTarget = new THREE.Vector3(
                    this.camera.position.x,
                    grp.position.y,
                    this.camera.position.z
                );
                grp.lookAt(lookTarget);
            }

            // Name tags always face camera fully
            if (grp.userData.label) {
                grp.userData.label.quaternion.copy(this.camera.quaternion);
            }
            if (grp.userData.bubbleMesh) {
                grp.userData.bubbleMesh.quaternion.copy(this.camera.quaternion);
            }

            // Smoothly interpolate toward target position for remote players.
            if (!b.isMe && grp.userData.targetX !== undefined) {
                grp.position.x  += (grp.userData.targetX - grp.position.x)  * REMOTE_POS_LERP;
                grp.userData.baseY += (grp.userData.targetY - grp.userData.baseY) * REMOTE_POS_LERP;
                if (grp.userData.targetZ !== undefined) {
                    grp.position.z += (grp.userData.targetZ - grp.position.z) * REMOTE_POS_LERP;
                }
            }

            if (!b.isMe) {
                const pushVX = Number.isFinite(grp.userData.pushVX) ? grp.userData.pushVX : 0;
                const pushVZ = Number.isFinite(grp.userData.pushVZ) ? grp.userData.pushVZ : 0;
                grp.position.x += pushVX;
                grp.position.z += pushVZ;
                if (grp.userData.targetX !== undefined) {
                    grp.userData.targetX += pushVX * 0.7;
                }
                if (grp.userData.targetZ !== undefined) {
                    grp.userData.targetZ += pushVZ * 0.7;
                }
                grp.userData.pushVX = pushVX * BALLOON_COLLISION_DAMP;
                grp.userData.pushVZ = pushVZ * BALLOON_COLLISION_DAMP;
            }

            const baseY = grp.userData.baseY || BALLOON_FLOAT_Y;
            const floatAmp = b.isMe ? 14 : (grp.userData.floatAmp || 9);
            const floatSpeed = b.isMe ? 1 : (grp.userData.floatSpeed || 1);
            const floatPhase = grp.userData.floatPhase || 0;
            const floatOffset = Math.sin(t * 0.9 * floatSpeed + grp.position.x * 0.0015 + floatPhase) * floatAmp;
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
            const myPos = this.myBalloon.group.position;
            const lodEnterDistance = this.balloonLodDistance + 180;
            const lodExitDistance = Math.max(900, this.balloonLodDistance - 180);
            this.balloons.forEach((b) => {
                if (b.isMe) return;
                const dist = Math.hypot(
                    b.group.position.x - myPos.x,
                    b.group.position.z - myPos.z
                );
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
            if (d.position.y < GROUND_Y - 50) d.position.y = d.userData.resetY;
        });
        this.snowflakes.forEach(f => {
            f.position.y -= f.userData.speed;
            f.position.x += f.userData.drift * Math.sin(t * 0.5);
            if (f.position.y < GROUND_Y - 50) f.position.y = f.userData.resetY;
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

window.WorldScene = WorldScene;
window._worldSceneReady = true;
if (window._onWorldSceneReady) window._onWorldSceneReady();

