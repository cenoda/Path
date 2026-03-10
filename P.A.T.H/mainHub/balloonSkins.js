/**
 * balloonSkins.js — 열기구 스킨 중앙 데이터 파일
 *
 * 새 스킨 추가: 이 파일에 항목 하나만 추가하면 끝.
 *
 * colors 필드:
 *   primary          – 기낭(envelope) 메인 색
 *   secondary        – 고어 심(seam) / 밴드 색
 *   accent           – 크라운·스커트·상단 캡 색
 *   palette          – (선택) 고어 패널별 개별 색 배열 (rainbow 등)
 *   basket           – (선택) 바구니 색 (기본 0x7a5528)
 *   rope             – (선택) 로프 색 (기본 0x4f3b24)
 *
 * material 필드:
 *   envelopeRoughness  – 기낭 거칠기 (0=광택, 1=무광)
 *   envelopeSheen      – 천 특유의 광택(sheen) 세기
 *   seamRoughness      – 심 거칠기
 *   accentMetalness    – 악센트 금속감
 *   clearcoat          – (선택) 유광 코팅 세기 (0~1)
 *   clearcoatRoughness – (선택) 코팅 거칠기 (기본 0.1)
 *   emissiveColor      – (선택) 발광 색 (16진수)
 *   emissiveIntensity  – (선택) 발광 세기 (0~3)
 *
 * hasOwnImage: true → assets/balloon_<id>.png 존재
 * hasOwnImage: false → 3D 전용 (폴백 시 default 이미지)
 */
window.BALLOON_SKINS = {

    // 기본 — 기준 모델
    default: {
        id: 'default',
        name: '기본 열기구',
        price: 0,
        darkImg: 'assets/balloon_dark.png',
        lightImg: 'assets/balloon_light.png',
        hasOwnImage: true,
        desc: '처음부터 제공되는 기본 스킨',
        colors: {
            primary:   0xcc1a1a,
            secondary: 0xffffff,
            accent:    0xffcc00,
            basket:    0x7a5528,
            rope:      0x4f3b24
        },
        material: {
            envelopeRoughness:  0.55,
            envelopeSheen:      0.15,
            seamRoughness:      0.70,
            accentMetalness:    0.10
        }
    },

    aurora: {
        id: 'aurora',
        name: '오로라 웨이브',
        price: 2200,
        darkImg: 'assets/balloon_dark.png',
        lightImg: 'assets/balloon_light.png',
        hasOwnImage: false,
        desc: '오로라처럼 흐르는 네온 그라데이션',
        colors: {
            primary:   0x00bfa6,
            secondary: 0x5f74ff,
            accent:    0xa7ffeb,
            palette:   [0x00c6a7, 0x00d2c3, 0x33b5ff, 0x5f74ff, 0x8a5cff, 0x4ed8cb],
            basket:    0x173a44,
            rope:      0x8ef6ff
        },
        material: {
            envelopeRoughness:  0.34,
            envelopeSheen:      0.40,
            seamRoughness:      0.48,
            accentMetalness:    0.22,
            clearcoat:          0.26,
            clearcoatRoughness: 0.12,
            emissiveColor:      0x062128,
            emissiveIntensity:  0.30
        }
    },

    magma: {
        id: 'magma',
        name: '마그마 코어',
        price: 3600,
        darkImg: 'assets/balloon_dark.png',
        lightImg: 'assets/balloon_light.png',
        hasOwnImage: false,
        desc: '용암 결이 살아있는 고열 스킨',
        colors: {
            primary:   0x8c1400,
            secondary: 0xff5a00,
            accent:    0xffd166,
            palette:   [0x6f0f00, 0x8c1400, 0xba2500, 0xff5a00, 0xff8c2a, 0xc41c00],
            basket:    0x351300,
            rope:      0xff7a1a
        },
        material: {
            envelopeRoughness:  0.36,
            envelopeSheen:      0.36,
            seamRoughness:      0.50,
            accentMetalness:    0.20,
            emissiveColor:      0x3a1000,
            emissiveIntensity:  0.70
        }
    },

    cobalt: {
        id: 'cobalt',
        name: '코발트 러너',
        price: 4800,
        darkImg: 'assets/balloon_dark.png',
        lightImg: 'assets/balloon_light.png',
        hasOwnImage: false,
        desc: '짙은 청색과 은색 라인의 레이싱 무드',
        colors: {
            primary:   0x1247b8,
            secondary: 0xc7d2f0,
            accent:    0x1d9bf0,
            basket:    0x1a2b52,
            rope:      0xb8c5ff
        },
        material: {
            envelopeRoughness:  0.32,
            envelopeSheen:      0.30,
            seamRoughness:      0.45,
            accentMetalness:    0.26,
            clearcoat:          0.20,
            clearcoatRoughness: 0.16
        }
    },

    ivory: {
        id: 'ivory',
        name: '아이보리 클래식',
        price: 6200,
        darkImg: 'assets/balloon_dark.png',
        lightImg: 'assets/balloon_light.png',
        hasOwnImage: false,
        desc: '크림 화이트와 골드 트림의 정석 클래식',
        colors: {
            primary:   0xf5efe1,
            secondary: 0xd9c9a2,
            accent:    0xc19743,
            basket:    0x7b5a2f,
            rope:      0xbea878
        },
        material: {
            envelopeRoughness:  0.46,
            envelopeSheen:      0.22,
            seamRoughness:      0.58,
            accentMetalness:    0.34,
            clearcoat:          0.16,
            clearcoatRoughness: 0.22
        }
    },

    mint: {
        id: 'mint',
        name: '민트 브리즈',
        price: 7600,
        darkImg: 'assets/balloon_dark.png',
        lightImg: 'assets/balloon_light.png',
        hasOwnImage: false,
        desc: '민트와 크림이 섞인 산뜻한 프리미엄 톤',
        colors: {
            primary:   0x6fe2c6,
            secondary: 0xe7fff7,
            accent:    0x2fbf9f,
            palette:   [0x6fe2c6, 0x93ecd6, 0xb2f3e4, 0xe7fff7, 0xa5efe0, 0x71d8bf],
            basket:    0x365d54,
            rope:      0xc7fff1
        },
        material: {
            envelopeRoughness:  0.41,
            envelopeSheen:      0.34,
            seamRoughness:      0.52,
            accentMetalness:    0.14,
            clearcoat:          0.24,
            clearcoatRoughness: 0.18
        }
    },

    midnight: {
        id: 'midnight',
        name: '미드나잇 노바',
        price: 9100,
        darkImg: 'assets/balloon_dark.png',
        lightImg: 'assets/balloon_light.png',
        hasOwnImage: false,
        desc: '별빛이 스며드는 딥 네이비 테마',
        colors: {
            primary:   0x0f1733,
            secondary: 0x33407a,
            accent:    0x80b3ff,
            basket:    0x10182f,
            rope:      0x6f8ddd
        },
        material: {
            envelopeRoughness:  0.24,
            envelopeSheen:      0.48,
            seamRoughness:      0.38,
            accentMetalness:    0.36,
            clearcoat:          0.36,
            clearcoatRoughness: 0.10,
            emissiveColor:      0x0c1230,
            emissiveIntensity:  0.45
        }
    },

    royale: {
        id: 'royale',
        name: '로열 벨벳',
        price: 10800,
        darkImg: 'assets/balloon_dark.png',
        lightImg: 'assets/balloon_light.png',
        hasOwnImage: false,
        desc: '버건디와 샴페인 골드의 왕실 컬러',
        colors: {
            primary:   0x5e1027,
            secondary: 0x8e1a3a,
            accent:    0xe5c27a,
            basket:    0x381320,
            rope:      0xd4b26f
        },
        material: {
            envelopeRoughness:  0.40,
            envelopeSheen:      0.42,
            seamRoughness:      0.49,
            accentMetalness:    0.44,
            clearcoat:          0.30,
            clearcoatRoughness: 0.14
        }
    },

    prism: {
        id: 'prism',
        name: '프리즘 스펙트럼',
        price: 12600,
        darkImg: 'assets/balloon_dark.png',
        lightImg: 'assets/balloon_light.png',
        hasOwnImage: false,
        desc: '각도마다 달라 보이는 스펙트럼 글로우',
        colors: {
            primary:   0x7a4dff,
            secondary: 0x3dd9ff,
            accent:    0xfff4cc,
            palette:   [0x5a6bff, 0x6d4bff, 0x8a53ff, 0x34d5ff, 0x46ffd0, 0x6d4bff],
            basket:    0x1d1c3b,
            rope:      0xa7c8ff
        },
        material: {
            envelopeRoughness:  0.20,
            envelopeSheen:      0.58,
            seamRoughness:      0.34,
            accentMetalness:    0.48,
            clearcoat:          0.48,
            clearcoatRoughness: 0.08,
            emissiveColor:      0x161634,
            emissiveIntensity:  0.65
        }
    },

    obsidian: {
        id: 'obsidian',
        name: '옵시디언 엣지',
        price: 14800,
        darkImg: 'assets/balloon_dark.png',
        lightImg: 'assets/balloon_light.png',
        hasOwnImage: false,
        desc: '블랙 글래스와 전기 민트 엣지 하이라이트',
        colors: {
            primary:   0x06080d,
            secondary: 0x1a1f2d,
            accent:    0x4cf0c9,
            basket:    0x0f131d,
            rope:      0x34b89d
        },
        material: {
            envelopeRoughness:  0.16,
            envelopeSheen:      0.55,
            seamRoughness:      0.28,
            accentMetalness:    0.60,
            clearcoat:          0.62,
            clearcoatRoughness: 0.06,
            emissiveColor:      0x07150f,
            emissiveIntensity:  0.40
        }
    }
};
