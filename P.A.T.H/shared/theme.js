(function (global) {
    'use strict';

    var DEFAULT_KEY = 'path_theme';
    var DEFAULT_MODE = 'light';

    function normalizeMode(mode, fallback) {
        var safeFallback = fallback === 'dark' ? 'dark' : DEFAULT_MODE;
        return mode === 'dark' || mode === 'light' ? mode : safeFallback;
    }

    function getStorageValue(key) {
        try {
            if (global.localStorage) {
                return global.localStorage.getItem(key);
            }
        } catch (_) {}
        return null;
    }

    function setStorageValue(key, value) {
        try {
            if (global.localStorage) {
                global.localStorage.setItem(key, value);
            }
        } catch (_) {}
    }

    function readMode(options) {
        var opts = options || {};
        var key = opts.key || DEFAULT_KEY;
        var fallback = normalizeMode(opts.fallback, DEFAULT_MODE);
        return normalizeMode(getStorageValue(key), fallback);
    }

    function applyMode(mode, options) {
        var opts = options || {};
        var fallback = normalizeMode(opts.fallback, DEFAULT_MODE);
        var normalizedMode = normalizeMode(mode, fallback);
        var body = opts.body || document.body;

        if (body && body.classList) {
            body.classList.toggle('light', normalizedMode === 'light');
        }
        if (body && typeof body.setAttribute === 'function') {
            body.setAttribute('data-theme-mode', normalizedMode);
        }
        if (body && body.style) {
            body.style.colorScheme = normalizedMode;
        }

        return normalizedMode;
    }

    function applyStoredTheme(options) {
        var mode = readMode(options);
        return applyMode(mode, options);
    }

    function setMode(mode, options) {
        var opts = options || {};
        var key = opts.key || DEFAULT_KEY;
        var fallback = normalizeMode(opts.fallback, DEFAULT_MODE);
        var normalizedMode = normalizeMode(mode, fallback);

        setStorageValue(key, normalizedMode);
        return applyMode(normalizedMode, opts);
    }

    function setLightMode(isLight, options) {
        return setMode(isLight ? 'light' : 'dark', options);
    }

    function toggle(options) {
        var opts = options || {};
        var body = opts.body || document.body;
        var nextIsLight;

        if (body && body.classList) {
            nextIsLight = !body.classList.contains('light');
        } else {
            nextIsLight = readMode(opts) !== 'light';
        }

        return setLightMode(nextIsLight, opts);
    }

    global.PathTheme = {
        readMode: readMode,
        applyMode: applyMode,
        applyStoredTheme: applyStoredTheme,
        setMode: setMode,
        setLightMode: setLightMode,
        toggle: toggle
    };
})(window);
