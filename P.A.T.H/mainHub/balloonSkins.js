/**
 * balloonSkins.js — 열기구 스킨 중앙 데이터 파일
 *
 * 새 스킨을 추가하려면 BALLOON_SKINS에 항목 하나만 추가하면 됩니다.
 * colors / material 값은 balloonModel.js가 자동으로 읽어갑니다.
 *
 * hasOwnImage: true  → assets/balloon_<id>.png 파일이 존재하는 스킨
 * hasOwnImage: false → 3D 렌더링 전용 (폴백 시 default 이미지 사용)
 */
window.BALLOON_SKINS = {
    default: {
        id: 'default',
        name: '기본 열기구',
        price: 0,
        darkImg: 'assets/balloon_dark.png',
        lightImg: 'assets/balloon_light.png',
        hasOwnImage: true,
        colors: { primary: 0xff4444, secondary: 0xffaa44, accent: 0xffdd00 },
        material: { envelopeRoughness: 0.52, envelopeSheen: 0.20, seamRoughness: 0.72, accentMetalness: 0.08 }
    },
    rainbow: {
        id: 'rainbow',
        name: '무지개 열기구',
        price: 2000,
        darkImg: 'assets/balloon_rainbow.png',
        lightImg: 'assets/balloon_rainbow.png',
        hasOwnImage: true,
        colors: { primary: 0xff00ff, secondary: 0x00ffff, accent: 0xffff00 },
        material: { envelopeRoughness: 0.38, envelopeSheen: 0.38, seamRoughness: 0.58, accentMetalness: 0.10 }
    },
    pastel: {
        id: 'pastel',
        name: '파스텔 열기구',
        price: 3000,
        darkImg: 'assets/balloon_pastel.png',
        lightImg: 'assets/balloon_pastel.png',
        hasOwnImage: true,
        colors: { primary: 0xffb6c1, secondary: 0xb0e0e6, accent: 0xffd700 },
        material: { envelopeRoughness: 0.66, envelopeSheen: 0.18, seamRoughness: 0.80, accentMetalness: 0.06 }
    },
    redstripes: {
        id: 'redstripes',
        name: '레드 스트라이프',
        price: 4000,
        darkImg: 'assets/balloon_redstripes.png',
        lightImg: 'assets/balloon_redstripes.png',
        hasOwnImage: true,
        colors: { primary: 0xcc0000, secondary: 0xffffff, accent: 0xcc0000 },
        material: { envelopeRoughness: 0.48, envelopeSheen: 0.26, seamRoughness: 0.68, accentMetalness: 0.08 }
    },
    golden: {
        id: 'golden',
        name: '황금 열기구',
        price: 5000,
        darkImg: 'assets/balloon_golden.png',
        lightImg: 'assets/balloon_golden.png',
        hasOwnImage: false,
        colors: { primary: 0xffd700, secondary: 0xdaa520, accent: 0xffdf00 },
        material: { envelopeRoughness: 0.36, envelopeSheen: 0.45, seamRoughness: 0.56, accentMetalness: 0.25 }
    },
    cosmic: {
        id: 'cosmic',
        name: '우주 열기구',
        price: 6500,
        darkImg: 'assets/balloon_cosmic.png',
        lightImg: 'assets/balloon_cosmic.png',
        hasOwnImage: false,
        colors: { primary: 0x0d1b2a, secondary: 0x1b263b, accent: 0x415a77 },
        material: { envelopeRoughness: 0.30, envelopeSheen: 0.50, seamRoughness: 0.50, accentMetalness: 0.30 }
    },
    sunset: {
        id: 'sunset',
        name: '석양 열기구',
        price: 8000,
        darkImg: 'assets/balloon_sunset.png',
        lightImg: 'assets/balloon_sunset.png',
        hasOwnImage: false,
        colors: { primary: 0xff6b35, secondary: 0xff9a56, accent: 0xffcc00 },
        material: { envelopeRoughness: 0.42, envelopeSheen: 0.33, seamRoughness: 0.62, accentMetalness: 0.15 }
    },
    emerald: {
        id: 'emerald',
        name: '에메랄드 열기구',
        price: 9500,
        darkImg: 'assets/balloon_emerald.png',
        lightImg: 'assets/balloon_emerald.png',
        hasOwnImage: false,
        colors: { primary: 0x2ecc71, secondary: 0x27ae60, accent: 0x1abc9c },
        material: { envelopeRoughness: 0.50, envelopeSheen: 0.26, seamRoughness: 0.70, accentMetalness: 0.10 }
    },
    phoenix: {
        id: 'phoenix',
        name: '불사조 열기구',
        price: 11000,
        darkImg: 'assets/balloon_phoenix.png',
        lightImg: 'assets/balloon_phoenix.png',
        hasOwnImage: false,
        colors: { primary: 0xff4500, secondary: 0xff8c00, accent: 0xffd700 },
        material: { envelopeRoughness: 0.34, envelopeSheen: 0.46, seamRoughness: 0.56, accentMetalness: 0.22 }
    },
    galaxy: {
        id: 'galaxy',
        name: '은하수 열기구',
        price: 13000,
        darkImg: 'assets/balloon_galaxy.png',
        lightImg: 'assets/balloon_galaxy.png',
        hasOwnImage: false,
        colors: { primary: 0x6a0dad, secondary: 0x9932cc, accent: 0x00ced1 },
        material: { envelopeRoughness: 0.28, envelopeSheen: 0.52, seamRoughness: 0.48, accentMetalness: 0.28 }
    },
    diamond: {
        id: 'diamond',
        name: '다이아몬드 열기구',
        price: 15000,
        darkImg: 'assets/balloon_diamond.png',
        lightImg: 'assets/balloon_diamond.png',
        hasOwnImage: false,
        colors: { primary: 0xe8f4f8, secondary: 0xb0e0e6, accent: 0xffffff },
        material: { envelopeRoughness: 0.22, envelopeSheen: 0.62, seamRoughness: 0.42, accentMetalness: 0.34 }
    }
};
