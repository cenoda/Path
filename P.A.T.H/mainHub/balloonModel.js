import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// balloonSkins.js가 window.BALLOON_SKINS를 먼저 정의합니다.
export function getBalloonColors(skinId) {
    const skin = window.BALLOON_SKINS?.[skinId] || window.BALLOON_SKINS?.default;
    return skin?.colors || { primary: 0xcc1a1a, secondary: 0xffffff, accent: 0xffcc00 };
}

function getBalloonMaterial(skinId) {
    const skin = window.BALLOON_SKINS?.[skinId] || window.BALLOON_SKINS?.default;
    return skin?.material || { envelopeRoughness: 0.55, envelopeSheen: 0.15, seamRoughness: 0.70, accentMetalness: 0.10 };
}

export function setBalloonDetailLevel(balloonGroup, useLowDetail) {
    if (!balloonGroup?.userData) return;
    const lowGroup = balloonGroup.userData.lowDetailGroup;
    const detailedChildren = balloonGroup.userData.detailedChildren;
    if (!lowGroup || !Array.isArray(detailedChildren)) return;
    const nextDetail = useLowDetail ? 'low' : 'high';
    if (balloonGroup.userData.currentDetail === nextDetail) return;
    lowGroup.visible = useLowDetail;
    detailedChildren.forEach(c => { c.visible = !useLowDetail; });
    balloonGroup.userData.currentDetail = nextDetail;
}

// ── 재질 헬퍼 ──────────────────────────────────────────────

function envelopeMat(colors, mat) {
    return new THREE.MeshPhysicalMaterial({
        color:              colors.primary,
        roughness:          mat.envelopeRoughness,
        metalness:          0.02,
        clearcoat:          mat.clearcoat ?? 0,
        clearcoatRoughness: mat.clearcoatRoughness ?? 0.1,
        sheen:              mat.envelopeSheen,
        sheenColor:         new THREE.Color(colors.primary).lerp(new THREE.Color(0xffffff), 0.4),
        emissive:           new THREE.Color(mat.emissiveColor ?? 0x000000),
        emissiveIntensity:  mat.emissiveIntensity ?? 0,
        side:               THREE.DoubleSide
    });
}

function seamMat(color, mat) {
    return new THREE.MeshStandardMaterial({
        color,
        roughness:          mat.seamRoughness,
        metalness:          0.03,
        emissive:           new THREE.Color(mat.emissiveColor ?? 0x000000),
        emissiveIntensity:  (mat.emissiveIntensity ?? 0) * 0.5
    });
}

function accentMat(colors, mat) {
    return new THREE.MeshPhysicalMaterial({
        color:              colors.accent,
        roughness:          0.4,
        metalness:          mat.accentMetalness,
        clearcoat:          (mat.clearcoat ?? 0) * 0.7,
        clearcoatRoughness: mat.clearcoatRoughness ?? 0.1,
        emissive:           new THREE.Color(mat.emissiveColor ?? 0x000000),
        emissiveIntensity:  (mat.emissiveIntensity ?? 0) * 0.8
    });
}

const metalMat = new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.28, metalness: 0.88 });
const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x5a5e64, roughness: 0.35, metalness: 0.80 });

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const gltfLoader = new GLTFLoader();
const glbLoadCache = new Map();

function getBalloonModelCandidates(skinId) {
    const fromWindow = typeof window !== 'undefined' ? String(window.PATH_BALLOON_GLB_URL || '').trim() : '';
    const list = [
        fromWindow,
        `./assets/models/${skinId}.glb`,
        './assets/models/default.glb',
        './assets/models/balloon.glb'
    ].filter(Boolean);
    return Array.from(new Set(list));
}

function loadGlbOnce(url) {
    if (glbLoadCache.has(url)) return glbLoadCache.get(url);
    const promise = new Promise((resolve) => {
        gltfLoader.load(
            url,
            (gltf) => resolve(gltf?.scene || null),
            undefined,
            () => resolve(null)
        );
    });
    glbLoadCache.set(url, promise);
    return promise;
}

async function loadFirstAvailableBalloonGlb(skinId) {
    const candidates = getBalloonModelCandidates(skinId);
    for (const url of candidates) {
        const scene = await loadGlbOnce(url);
        if (scene) return scene;
    }
    return null;
}

function fitGlbToBalloonSpace(modelRoot, scale) {
    const box = new THREE.Box3().setFromObject(modelRoot);
    if (box.isEmpty()) return;

    const size = new THREE.Vector3();
    box.getSize(size);
    if (size.y < 0.0001) return;

    const targetHeight = scale * 145;
    const ratio = targetHeight / size.y;
    modelRoot.scale.multiplyScalar(ratio);

    const fittedBox = new THREE.Box3().setFromObject(modelRoot);
    const center = new THREE.Vector3();
    fittedBox.getCenter(center);

    modelRoot.position.x -= center.x;
    modelRoot.position.z -= center.z;

    const desiredBottomY = scale * -70;
    modelRoot.position.y += desiredBottomY - fittedBox.min.y;
}

function findFirstMesh(root) {
    let firstMesh = null;
    root.traverse((child) => {
        if (!firstMesh && child?.isMesh) firstMesh = child;
    });
    return firstMesh;
}

async function tryAttachGlbBalloonModel(fallbackGroup, scale, skinId) {
    const glbTemplate = await loadFirstAvailableBalloonGlb(skinId);
    if (!glbTemplate || !fallbackGroup?.userData) return;

    const glbRoot = glbTemplate.clone(true);
    fitGlbToBalloonSpace(glbRoot, scale);
    glbRoot.traverse((child) => {
        if (!child?.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
    });

    const lowGroup = fallbackGroup.userData.lowDetailGroup || null;
    const wasLowDetail = fallbackGroup.userData.currentDetail === 'low';

    fallbackGroup.userData.detailedChildren?.forEach((child) => {
        child.visible = false;
    });

    glbRoot.visible = !wasLowDetail;
    if (lowGroup) lowGroup.visible = wasLowDetail;

    fallbackGroup.add(glbRoot);
    fallbackGroup.userData.detailedChildren = [glbRoot];
    fallbackGroup.userData.currentDetail = wasLowDetail ? 'low' : 'high';

    const firstMesh = findFirstMesh(glbRoot);
    if (firstMesh) {
        if (!fallbackGroup.userData.colorParts) fallbackGroup.userData.colorParts = {};
        fallbackGroup.userData.colorParts.primary = [firstMesh];
    }
}

function placeCable(mesh, from, to) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    if (len < 0.0001) return;
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.scale.set(1, len, 1);
    mesh.quaternion.setFromUnitVectors(Y_AXIS, dir.normalize());
}

// 고어 패널 색 결정
function goreColor(colors, index) {
    if (colors.palette) {
        return colors.palette[index % colors.palette.length];
    }
    return index % 2 === 0 ? colors.primary : colors.secondary;
}

// ── 메인 3D 모델 ───────────────────────────────────────────

function createFallback3DBalloon(scale, colorScheme, isMe) {
    const group  = new THREE.Group();
    const colors = getBalloonColors(colorScheme);
    const mat    = getBalloonMaterial(colorScheme);

    const basketColor = colors.basket ?? 0x7a5528;
    const ropeColor   = colors.rope   ?? 0x4f3b24;

    const colorParts = { primary: [], secondary: [], accent: [] };

    // ── 기낭 (envelope) ─────────────────────────────────────
    // 실제 열기구 실루엣에 맞춘 정밀한 12포인트 프로파일
    const profile = [
        [0.0,  -38.0],   // 하단 목 개구부
        [5.5,  -36.0],
        [14.0, -32.0],
        [24.0, -22.0],
        [32.5, -9.0],
        [37.5,  5.0],
        [37.0, 18.0],
        [33.0, 30.0],
        [25.5, 42.0],
        [15.0, 50.0],
        [5.5,  54.0],
        [0.0,  55.5]    // 상단 크라운
    ].map(([r, y]) => new THREE.Vector2(r * scale, y * scale));

    const envelopeMesh = new THREE.Mesh(
        new THREE.LatheGeometry(profile, 64), // 64 세그먼트로 매끄러운 곡면
        envelopeMat(colors, mat)
    );
    envelopeMesh.position.y = scale * 20;
    colorParts.primary.push(envelopeMesh);
    group.add(envelopeMesh);

    // ── 고어 심(seam) + 패널 ─────────────────────────────────
    const seamCount = 16; // 16개 고어로 더 정밀한 표현
    for (let i = 0; i < seamCount; i++) {
        const angle = (i / seamCount) * Math.PI * 2;
        const gc = goreColor(colors, i);

        // 고어 컬러 밴드 (palette 스킨용)
        if (colors.palette) {
            const bandGeo = new THREE.CylinderGeometry(
                scale * 36.8, scale * 9.0, scale * 95, 1, 1, true,
                angle - 0.005, (Math.PI * 2) / seamCount + 0.01
            );
            const bandMat = new THREE.MeshStandardMaterial({
                color:             gc,
                roughness:         mat.envelopeRoughness + 0.05,
                metalness:         0.01,
                emissive:          new THREE.Color(mat.emissiveColor ?? 0x000000),
                emissiveIntensity: (mat.emissiveIntensity ?? 0) * 0.6,
                side:              THREE.DoubleSide,
                transparent:       true,
                opacity:           0.93
            });
            const band = new THREE.Mesh(bandGeo, bandMat);
            band.position.y = scale * 12;
            group.add(band);
        }

        // 고어 심(seam) — 상단에서 하단까지 이어지는 봉합선
        // 하단으로 갈수록 약간 두꺼워지도록 tubular subdivisions 활용
        const seamPointsWorld = profile.map(v => new THREE.Vector3(
            Math.cos(angle) * v.x,
            v.y + scale * 20,
            Math.sin(angle) * v.x
        ));
        const seamGeo = new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3(seamPointsWorld),
            18,           // 더 많은 세그먼트로 매끄러운 심
            scale * 0.48, // 튜브 반경
            6, false
        );
        const sColor = colors.palette ? 0x6e7176 : colors.secondary;
        const seam = new THREE.Mesh(seamGeo, seamMat(sColor, mat));
        colorParts.secondary.push(seam);
        group.add(seam);

        // 수평 밴드 (palette 없는 스킨)
        if (!colors.palette && i % 2 === 0) {
            const bGeo = new THREE.CylinderGeometry(
                scale * 36.2, scale * 36.2, scale * 8.5, 32, 1, true
            );
            const bMat = new THREE.MeshStandardMaterial({
                color:       colors.secondary,
                roughness:   0.75,
                metalness:   0.02,
                transparent: true,
                opacity:     0.32,
                side:        THREE.DoubleSide
            });
            const b = new THREE.Mesh(bGeo, bMat);
            b.position.y = scale * (4 + i * 0.55);
            colorParts.secondary.push(b);
            group.add(b);
        }
    }

    // ── 수평 강화 링 (horizontal reinforcement bands) ────────
    // 실제 열기구에는 하단, 하중 존, 허리, 어깨 등에 강화 테이프/링이 있음
    const hBandHeights = [
        { y: scale * -16, r: scale * 7.5,  w: scale * 0.9  }, // 넥 상단
        { y: scale *  -2, r: scale * 19.5, w: scale * 1.1  }, // 하단 팽창부
        { y: scale *  14, r: scale * 35.5, w: scale * 1.0  }, // 최대 직경 아래
        { y: scale *  28, r: scale * 35.8, w: scale * 1.0  }, // 허리
        { y: scale *  42, r: scale * 28.0, w: scale * 0.85 }, // 어깨
        { y: scale *  56, r: scale * 13.5, w: scale * 0.75 }, // 상단 어깨
    ];
    hBandHeights.forEach(({ y, r, w }) => {
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(r, w, 6, 48),
            new THREE.MeshStandardMaterial({
                color:    colors.palette ? 0x888a8f : colors.secondary,
                roughness: mat.seamRoughness,
                metalness: 0.05
            })
        );
        ring.position.y = y;
        ring.rotation.x = Math.PI * 0.5;
        group.add(ring);
    });

    // ── 크라운 벤트 (crown vent) ─────────────────────────────
    // 상단 배기구 - 실제 열기구의 중요 구성요소
    const crownVent = new THREE.Mesh(
        new THREE.CircleGeometry(scale * 7.8, 32),
        accentMat(colors, mat)
    );
    crownVent.position.y = scale * 75.5;
    crownVent.rotation.x = Math.PI * 0.5;
    colorParts.accent.push(crownVent);
    group.add(crownVent);

    // 크라운 테두리 림
    const crownRim = new THREE.Mesh(
        new THREE.TorusGeometry(scale * 7.8, scale * 0.9, 8, 32),
        accentMat(colors, mat)
    );
    crownRim.position.y = scale * 75.5;
    crownRim.rotation.x = Math.PI * 0.5;
    colorParts.accent.push(crownRim);
    group.add(crownRim);

    // 패러슈트 벨브 핸들 (parachute valve pull)
    const valvePost = new THREE.Mesh(
        new THREE.CylinderGeometry(scale * 0.6, scale * 0.6, scale * 4, 6),
        new THREE.MeshStandardMaterial({ color: 0xcc2200, roughness: 0.6, metalness: 0.1 })
    );
    valvePost.position.y = scale * 77.5;
    group.add(valvePost);

    // ── 스커트 / 넥 ─────────────────────────────────────────
    // 3단 테이퍼 구조로 열기구 목 부분의 실제 형상 묘사
    const skirtUpper = new THREE.Mesh(
        new THREE.CylinderGeometry(scale * 10.5, scale * 9.2, scale * 7, 24),
        accentMat(colors, mat)
    );
    skirtUpper.position.y = scale * -12;
    colorParts.accent.push(skirtUpper);
    group.add(skirtUpper);

    const skirtLower = new THREE.Mesh(
        new THREE.CylinderGeometry(scale * 9.2, scale * 7.8, scale * 9, 24),
        new THREE.MeshPhysicalMaterial({
            color:     new THREE.Color(colors.accent).lerp(new THREE.Color(0x111111), 0.15),
            roughness: 0.52,
            metalness: mat.accentMetalness * 0.7,
            side:      THREE.DoubleSide
        })
    );
    skirtLower.position.y = scale * -19.5;
    group.add(skirtLower);

    // 내열 패브릭 주름 표현용 얇은 플랜지 링
    const skirtFlange = new THREE.Mesh(
        new THREE.TorusGeometry(scale * 10.4, scale * 0.6, 6, 28),
        new THREE.MeshStandardMaterial({ color: colors.accent, roughness: 0.55, metalness: 0.05 })
    );
    skirtFlange.position.y = scale * -8.5;
    skirtFlange.rotation.x = Math.PI * 0.5;
    group.add(skirtFlange);

    // ── 로드 링 + 카라비너 ───────────────────────────────────
    // 열기구 하단에서 바구니를 매다는 핵심 금속 링
    const loadRing = new THREE.Mesh(
        new THREE.TorusGeometry(scale * 9.0, scale * 0.9, 10, 40),
        metalMat.clone()
    );
    loadRing.position.y = scale * -24.5;
    loadRing.rotation.x = Math.PI * 0.5;
    group.add(loadRing);

    // 내부 보강 링 (이중 링 구조)
    const loadRingInner = new THREE.Mesh(
        new THREE.TorusGeometry(scale * 7.8, scale * 0.55, 8, 32),
        darkMetalMat.clone()
    );
    loadRingInner.position.y = scale * -24.5;
    loadRingInner.rotation.x = Math.PI * 0.5;
    group.add(loadRingInner);

    // 4방향 카라비너 (quick-link shackles)
    for (let i = 0; i < 4; i++) {
        const qa = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const qx = Math.cos(qa) * scale * 9;
        const qz = Math.sin(qa) * scale * 9;
        const carabiner = new THREE.Mesh(
            new THREE.TorusGeometry(scale * 1.2, scale * 0.38, 6, 14),
            metalMat.clone()
        );
        carabiner.position.set(qx, scale * -24.5, qz);
        carabiner.rotation.y = qa;
        group.add(carabiner);
    }

    // ── 바구니 ───────────────────────────────────────────────
    const basketGroup = new THREE.Group();
    basketGroup.position.y = scale * -62;

    // 바구니 바닥
    const basketBase = new THREE.Mesh(
        new THREE.BoxGeometry(scale * 19, scale * 2.5, scale * 19),
        new THREE.MeshStandardMaterial({ color: basketColor, roughness: 0.96, metalness: 0.0 })
    );
    basketBase.position.y = -scale * 8.0;
    basketGroup.add(basketBase);

    // ── 위커 짜임 시뮬레이션 (wicker weave) ─────────────────
    // 각 면을 여러 개의 수평/수직 스트립으로 구성
    const wickerLight = new THREE.Color(basketColor).multiplyScalar(1.15).getHex();
    const wickerDark  = new THREE.Color(basketColor).multiplyScalar(0.78).getHex();
    const wallH = scale * 14;
    const halfW = scale * 9.5;
    const numHStrips = 8; // 수평 스트립 수

    // 면 정의: [법선방향, 위치오프셋]
    const faces = [
        { axis: 'z', sign:  1, pos: [0,         -scale * 0.5,  halfW      ] },
        { axis: 'z', sign: -1, pos: [0,         -scale * 0.5, -halfW      ] },
        { axis: 'x', sign:  1, pos: [ halfW,     -scale * 0.5,  0         ] },
        { axis: 'x', sign: -1, pos: [-halfW,     -scale * 0.5,  0         ] }
    ];
    faces.forEach(({ axis, sign, pos }) => {
        const isX = axis === 'x';
        const faceW = scale * 19;
        for (let s = 0; s < numHStrips; s++) {
            const yOff = -wallH / 2 + (s + 0.5) * (wallH / numHStrips);
            const mat2 = new THREE.MeshStandardMaterial({
                color:     s % 2 === 0 ? wickerLight : wickerDark,
                roughness: 0.94, metalness: 0.0
            });
            const strip = new THREE.Mesh(
                new THREE.BoxGeometry(
                    isX ? scale * 1.6 : faceW,
                    wallH / numHStrips * 0.82,
                    isX ? faceW       : scale * 1.6
                ),
                mat2
            );
            strip.position.set(pos[0], yOff, pos[2]);
            basketGroup.add(strip);
        }

        // 수직 스트립 (세로 위커)
        const numVStrips = 7;
        for (let v = 0; v < numVStrips; v++) {
            const t2 = (v + 0.5) / numVStrips;
            const offset = (t2 - 0.5) * faceW;
            const vMat = new THREE.MeshStandardMaterial({
                color:     v % 2 === 0 ? wickerDark : wickerLight,
                roughness: 0.96, metalness: 0.0
            });
            const vStrip = new THREE.Mesh(
                new THREE.BoxGeometry(
                    isX ? scale * 0.9 : scale * 1.0,
                    wallH,
                    isX ? scale * 1.0 : scale * 0.9
                ),
                vMat
            );
            vStrip.position.set(
                pos[0] + (isX ? 0 : offset),
                -scale * 0.5,
                pos[2] + (isX ? offset : 0)
            );
            basketGroup.add(vStrip);
        }
    });

    // 바구니 상단 테두리 림
    const rimColor = new THREE.Color(basketColor).multiplyScalar(0.58);
    const rimMat = new THREE.MeshStandardMaterial({ color: rimColor, roughness: 0.85, metalness: 0.0 });
    const rim = new THREE.Mesh(
        new THREE.BoxGeometry(scale * 20.5, scale * 1.4, scale * 20.5),
        rimMat
    );
    rim.position.y = scale * 7.0;
    basketGroup.add(rim);

    // 상단 안쪽 패딩 (승객 손잡이 시트)
    const padColor = new THREE.Color(basketColor).lerp(new THREE.Color(0x6b4e25), 0.4).getHex();
    const innerRim = new THREE.Mesh(
        new THREE.BoxGeometry(scale * 18, scale * 1.0, scale * 18),
        new THREE.MeshStandardMaterial({ color: padColor, roughness: 0.92, metalness: 0.0 })
    );
    innerRim.position.y = scale * 6.8;
    basketGroup.add(innerRim);

    // 승객 손잡이 (passenger handholds) - 상단 테두리에 4개의 홀드
    const holdMat = new THREE.MeshStandardMaterial({ color: darkMetalMat.color, roughness: 0.35, metalness: 0.75 });
    [0, 1, 2, 3].forEach(i => {
        const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const hx = Math.cos(angle) * scale * 8.5;
        const hz = Math.sin(angle) * scale * 8.5;
        const hold = new THREE.Mesh(
            new THREE.TorusGeometry(scale * 2.2, scale * 0.5, 6, 14, Math.PI),
            holdMat
        );
        hold.position.set(hx, scale * 8.5, hz);
        hold.rotation.y = angle + Math.PI * 0.5;
        hold.rotation.z = Math.PI * 0.5;
        basketGroup.add(hold);
    });

    // 모서리 강화 포스트
    const postMat = new THREE.MeshStandardMaterial({ color: 0x7a7f86, roughness: 0.38, metalness: 0.75 });
    const postOffsets = [
        new THREE.Vector3( scale * 8.2, scale * 12.5,  scale * 8.2),
        new THREE.Vector3(-scale * 8.2, scale * 12.5,  scale * 8.2),
        new THREE.Vector3( scale * 8.2, scale * 12.5, -scale * 8.2),
        new THREE.Vector3(-scale * 8.2, scale * 12.5, -scale * 8.2)
    ];
    postOffsets.forEach(offset => {
        // 주 포스트
        const post = new THREE.Mesh(
            new THREE.CylinderGeometry(scale * 0.75, scale * 0.75, scale * 12, 8),
            postMat
        );
        post.position.copy(offset);
        basketGroup.add(post);

        // 포스트 상단 볼트 캡
        const cap = new THREE.Mesh(
            new THREE.SphereGeometry(scale * 0.95, 8, 6),
            metalMat.clone()
        );
        cap.position.set(offset.x, offset.y + scale * 6.5, offset.z);
        basketGroup.add(cap);
    });

    // ── 버너 어셈블리 ──────────────────────────────────────
    // 버너 서포트 프레임 (십자형 크로스 바)
    const burnerFMat = new THREE.MeshStandardMaterial({ color: 0x6b7179, roughness: 0.34, metalness: 0.76 });
    [0, 1].forEach(axis => {
        const bar = new THREE.Mesh(
            new THREE.CylinderGeometry(scale * 0.55, scale * 0.55, scale * 18, 8),
            burnerFMat
        );
        bar.position.y = scale * 13.5;
        bar.rotation[axis === 0 ? 'z' : 'x'] = Math.PI * 0.5;
        basketGroup.add(bar);
    });

    // 버너 베이스 플레이트
    const burnerPlate = new THREE.Mesh(
        new THREE.BoxGeometry(scale * 9.5, scale * 1.0, scale * 9.5),
        new THREE.MeshStandardMaterial({ color: 0x5c6068, roughness: 0.32, metalness: 0.78 })
    );
    burnerPlate.position.y = scale * 13.0;
    basketGroup.add(burnerPlate);

    // 주 버너 실린더 (main burner)
    const burnerCyl = new THREE.Mesh(
        new THREE.CylinderGeometry(scale * 2.0, scale * 2.6, scale * 6.0, 12),
        new THREE.MeshStandardMaterial({ color: 0xa0a8b0, roughness: 0.28, metalness: 0.85 })
    );
    burnerCyl.position.y = scale * 17.0;
    basketGroup.add(burnerCyl);

    // 버너 노즐 팁
    const burnerNozzle = new THREE.Mesh(
        new THREE.CylinderGeometry(scale * 1.0, scale * 2.0, scale * 2.5, 10),
        metalMat.clone()
    );
    burnerNozzle.position.y = scale * 20.5;
    basketGroup.add(burnerNozzle);

    // 4개의 파일럿 버너 (pilot burners - 소형 상시 연소 버너)
    for (let i = 0; i < 4; i++) {
        const pa = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const px = Math.cos(pa) * scale * 3.2;
        const pz = Math.sin(pa) * scale * 3.2;
        const pilotCyl = new THREE.Mesh(
            new THREE.CylinderGeometry(scale * 0.42, scale * 0.55, scale * 2.8, 6),
            new THREE.MeshStandardMaterial({ color: 0x8a9099, roughness: 0.30, metalness: 0.80 })
        );
        pilotCyl.position.set(px, scale * 16.8, pz);
        basketGroup.add(pilotCyl);
    }

    // 연료 호스 (fuel hose - 버너에서 바구니 벽으로)
    const hoseMat = new THREE.MeshStandardMaterial({ color: 0x222426, roughness: 0.85, metalness: 0.1 });
    for (let i = 0; i < 2; i++) {
        const hoseFrom = new THREE.Vector3(i === 0 ? scale * 4 : -scale * 4, scale * 13.5, 0);
        const hoseTo   = new THREE.Vector3(i === 0 ? scale * 9 : -scale * 9, -scale * 3, 0);
        const hoseMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(scale * 0.32, scale * 0.32, 1, 5),
            hoseMat
        );
        placeCable(hoseMesh, hoseFrom, hoseTo);
        basketGroup.add(hoseMesh);
    }

    group.add(basketGroup);

    // ── 서스펜션 케이블 (8개 주 케이블) ──────────────────────
    const cableMat = new THREE.MeshStandardMaterial({ color: ropeColor, roughness: 0.92, metalness: 0.02 });
    const cableGeo = new THREE.CylinderGeometry(scale * 0.28, scale * 0.28, 1, 5);

    // 8개 케이블: 4 코너 + 4 면 중앙
    const spreadAngles = Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2);
    const topRingR = scale * 8.8; // 로드링 반경
    const botCorners = [
        new THREE.Vector3( scale * 8.2, scale * 12.5,  scale * 8.2),
        new THREE.Vector3(-scale * 8.2, scale * 12.5,  scale * 8.2),
        new THREE.Vector3(-scale * 8.2, scale * 12.5, -scale * 8.2),
        new THREE.Vector3( scale * 8.2, scale * 12.5, -scale * 8.2)
    ];
    // 코너 케이블 4개
    botCorners.forEach((botP, i) => {
        const angle = Math.atan2(botP.z, botP.x);
        const topP  = new THREE.Vector3(
            Math.cos(angle) * topRingR,
            scale * -24.5,
            Math.sin(angle) * topRingR
        );
        const botWorld = new THREE.Vector3(botP.x, basketGroup.position.y + botP.y, botP.z);
        const cable = new THREE.Mesh(cableGeo, cableMat);
        placeCable(cable, topP, botWorld);
        group.add(cable);
    });
    // 면 중앙 케이블 4개 (추가 지지)
    const faceAngles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
    faceAngles.forEach(angle => {
        const topP = new THREE.Vector3(
            Math.cos(angle + Math.PI * 0.25) * topRingR * 0.85,
            scale * -24.5,
            Math.sin(angle + Math.PI * 0.25) * topRingR * 0.85
        );
        const botP = new THREE.Vector3(
            Math.cos(angle) * scale * 9.2,
            basketGroup.position.y + scale * 11.5,
            Math.sin(angle) * scale * 9.2
        );
        const cable = new THREE.Mesh(cableGeo, cableMat);
        placeCable(cable, topP, botP);
        group.add(cable);
    });

    // ── 불꽃 (플레이어 본인 + magma 항상) ───────────────────
    if (isMe || colorScheme === 'magma') {
        const flameColor  = colorScheme === 'magma' ? 0xff3300 : 0xff7a1a;
        const midColor    = colorScheme === 'magma' ? 0xff8800 : 0xffba40;
        const innerColor  = colorScheme === 'magma' ? 0xffcc00 : 0xffe08a;
        const coreColor   = 0xffffff;
        const baseY       = basketGroup.position.y + scale * 21.5;

        // 외부 화염 (outermost - 주황/빨강)
        const flameOuter = new THREE.Mesh(
            new THREE.ConeGeometry(scale * 2.4, scale * 13, 12),
            new THREE.MeshBasicMaterial({
                color: flameColor, transparent: true, opacity: 0.45,
                blending: THREE.AdditiveBlending, depthWrite: false
            })
        );
        flameOuter.position.y = baseY;
        flameOuter.rotation.x = Math.PI;
        group.add(flameOuter);

        // 중간 화염
        const flameMid = new THREE.Mesh(
            new THREE.ConeGeometry(scale * 1.65, scale * 10.5, 10),
            new THREE.MeshBasicMaterial({
                color: midColor, transparent: true, opacity: 0.58,
                blending: THREE.AdditiveBlending, depthWrite: false
            })
        );
        flameMid.position.y = baseY + scale * 0.5;
        flameMid.rotation.x = Math.PI;
        group.add(flameMid);

        // 내부 화염
        const flameInner = new THREE.Mesh(
            new THREE.ConeGeometry(scale * 1.0, scale * 8.0, 10),
            new THREE.MeshBasicMaterial({
                color: innerColor, transparent: true, opacity: 0.72,
                blending: THREE.AdditiveBlending, depthWrite: false
            })
        );
        flameInner.position.y = baseY + scale * 1.0;
        flameInner.rotation.x = Math.PI;
        group.add(flameInner);

        // 코어 화염 (가장 밝은 중심)
        const flameCore = new THREE.Mesh(
            new THREE.ConeGeometry(scale * 0.5, scale * 5.0, 8),
            new THREE.MeshBasicMaterial({
                color: coreColor, transparent: true, opacity: 0.80,
                blending: THREE.AdditiveBlending, depthWrite: false
            })
        );
        flameCore.position.y = baseY + scale * 1.5;
        flameCore.rotation.x = Math.PI;
        group.add(flameCore);

        group.userData.flame      = flameOuter;
        group.userData.innerFlame = flameInner;
        group.userData.flameMid   = flameMid;
        group.userData.flameCore  = flameCore;
    }

    // ── 저해상도 LOD ─────────────────────────────────────────
    const detailedChildren = group.children.slice();
    const lowDetailGroup   = new THREE.Group();

    const lowEnvelope = new THREE.Mesh(
        new THREE.SphereGeometry(scale * 37, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.88),
        new THREE.MeshStandardMaterial({
            color:             colors.primary,
            roughness:         Math.min(0.92, mat.envelopeRoughness + 0.15),
            metalness:         0.01,
            emissive:          new THREE.Color(mat.emissiveColor ?? 0x000000),
            emissiveIntensity: (mat.emissiveIntensity ?? 0) * 0.5
        })
    );
    lowEnvelope.position.y = scale * 23;
    colorParts.primary.push(lowEnvelope);
    lowDetailGroup.add(lowEnvelope);

    const lowBand = new THREE.Mesh(
        new THREE.CylinderGeometry(scale * 34.5, scale * 34.5, scale * 8, 12, 1, true),
        new THREE.MeshStandardMaterial({
            color: colors.palette ? colors.palette[2] : colors.secondary,
            roughness: 0.78, metalness: 0.02, transparent: true, opacity: 0.42,
            side: THREE.DoubleSide
        })
    );
    lowBand.position.y = scale * 7;
    colorParts.secondary.push(lowBand);
    lowDetailGroup.add(lowBand);

    const lowSkirt = new THREE.Mesh(
        new THREE.CylinderGeometry(scale * 9.2, scale * 6.8, scale * 10, 10),
        new THREE.MeshStandardMaterial({
            color:     colors.accent,
            roughness: 0.82,
            metalness: Math.max(0.02, mat.accentMetalness * 0.45)
        })
    );
    lowSkirt.position.y = scale * -14;
    colorParts.accent.push(lowSkirt);
    lowDetailGroup.add(lowSkirt);

    const lowBasket = new THREE.Mesh(
        new THREE.BoxGeometry(scale * 17, scale * 13, scale * 17),
        new THREE.MeshStandardMaterial({ color: basketColor, roughness: 0.95, metalness: 0.0 })
    );
    lowBasket.position.y = scale * -62;
    lowDetailGroup.add(lowBasket);

    lowDetailGroup.visible = false;
    group.add(lowDetailGroup);

    group.userData.lowDetailGroup   = lowDetailGroup;
    group.userData.detailedChildren = detailedChildren;
    group.userData.currentDetail    = 'high';
    group.userData.colorParts       = colorParts;
    return group;
}

export function create3DBalloon(scale, colorScheme, isMe) {
    const fallback = createFallback3DBalloon(scale, colorScheme, isMe);
    tryAttachGlbBalloonModel(fallback, scale, colorScheme).catch(() => {});
    return fallback;
}

// ── 상점 미리보기용 간소화 모델 ─────────────────────────────

export function make3DBalloonPreview(scale, skinId) {
    const group  = new THREE.Group();
    const colors = getBalloonColors(skinId);
    const mat    = getBalloonMaterial(skinId);

    // 기낭
    const balloonMesh = new THREE.Mesh(
        new THREE.SphereGeometry(scale * 40, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.75),
        new THREE.MeshPhysicalMaterial({
            color:              colors.primary,
            roughness:          mat.envelopeRoughness,
            metalness:          0.02,
            clearcoat:          mat.clearcoat ?? 0,
            clearcoatRoughness: mat.clearcoatRoughness ?? 0.1,
            emissive:           new THREE.Color(mat.emissiveColor ?? 0x000000),
            emissiveIntensity:  mat.emissiveIntensity ?? 0,
            side:               THREE.DoubleSide
        })
    );
    balloonMesh.position.y = scale * 20;
    group.add(balloonMesh);

    // 세로 줄기
    const numStripes = 8;
    for (let i = 0; i < numStripes; i++) {
        const angle  = (i / numStripes) * Math.PI * 2;
        const sColor = colors.palette
            ? colors.palette[i % colors.palette.length]
            : (i % 2 === 0 ? colors.primary : colors.secondary);

        const stripe = new THREE.Mesh(
            new THREE.PlaneGeometry(scale * 10, scale * 62),
            new THREE.MeshStandardMaterial({
                color:             sColor,
                roughness:         mat.envelopeRoughness + 0.05,
                metalness:         0.01,
                emissive:          new THREE.Color(mat.emissiveColor ?? 0x000000),
                emissiveIntensity: (mat.emissiveIntensity ?? 0) * 0.5,
                side:              THREE.DoubleSide,
                transparent:       true,
                opacity:           colors.palette ? 0.88 : 0.55
            })
        );
        stripe.position.set(
            Math.cos(angle) * scale * 34,
            scale * 18,
            Math.sin(angle) * scale * 34
        );
        stripe.lookAt(0, scale * 18, 0);
        group.add(stripe);
    }

    // 상단 캡
    const cap = new THREE.Mesh(
        new THREE.SphereGeometry(scale * 8, 12, 8),
        new THREE.MeshPhysicalMaterial({
            color:             colors.accent,
            roughness:         0.3,
            metalness:         mat.accentMetalness,
            clearcoat:         mat.clearcoat ?? 0,
            emissive:          new THREE.Color(mat.emissiveColor ?? 0x000000),
            emissiveIntensity: (mat.emissiveIntensity ?? 0) * 0.8
        })
    );
    cap.position.y = scale * 50;
    group.add(cap);

    // 바구니
    const basketColor = colors.basket ?? 0x8b6914;
    const previewBasket = new THREE.Mesh(
        new THREE.BoxGeometry(scale * 20, scale * 15, scale * 20),
        new THREE.MeshStandardMaterial({ color: basketColor, roughness: 0.90, metalness: 0.0 })
    );
    previewBasket.position.y = scale * -25;
    group.add(previewBasket);

    // 로프
    const ropeColor = colors.rope ?? 0x654321;
    [
        [scale * 10,  scale * 10],
        [-scale * 10, scale * 10],
        [scale * 10,  -scale * 10],
        [-scale * 10, -scale * 10]
    ].forEach(([x, z]) => {
        const rope = new THREE.Mesh(
            new THREE.CylinderGeometry(scale * 0.5, scale * 0.5, scale * 35, 4),
            new THREE.MeshStandardMaterial({ color: ropeColor, roughness: 0.95, metalness: 0.0 })
        );
        rope.position.set(x, scale * -5, z);
        group.add(rope);
    });

    return group;
}
