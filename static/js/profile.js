/* ============================================================
   profile.js — 个人档案与系统设置
   ============================================================ */

const PROF_STATE = {
    user: null, // string name
    themeMode: 'auto', // 'light', 'dark', 'auto'
    themeKey: 'clay'
};

/* ----------------------------------------------------------------
   主题预设 — Claude / Anthropic 风格
   每个主题协调搭配：页面底色 / 文字色 / 重点色 / 边框
   ---------------------------------------------------------------- */
const THEME_PRESETS = {
    clay: {
        name: 'clay', label: '陶土',
        bg: '#faf9f5', surface: '#ffffff', surfaceHover: '#f5f4ed', surfaceRaised: '#f0eee6',
        text: '#141413', textSecondary: '#5e5d59', textTertiary: '#87867f',
        border: 'rgba(20,20,19,0.08)', borderStrong: 'rgba(20,20,19,0.14)',
        accent: '#c96442', accent2: '#d97757',
        accentLight: 'rgba(201,100,66,0.10)', accentGlow: 'rgba(201,100,66,0.18)',
        navBg: 'rgba(250,249,245,0.86)',
        swatch: '#c96442'
    },
    oat: {
        name: 'oat', label: '燕麦',
        bg: '#efe7d3', surface: '#f7f1e1', surfaceHover: '#e8dec7', surfaceRaised: '#ddd2b9',
        text: '#2a241a', textSecondary: '#5e5440', textTertiary: '#857a62',
        border: 'rgba(42,36,26,0.10)', borderStrong: 'rgba(42,36,26,0.18)',
        accent: '#9b6731', accent2: '#b88149',
        accentLight: 'rgba(155,103,49,0.12)', accentGlow: 'rgba(155,103,49,0.22)',
        navBg: 'rgba(239,231,211,0.88)',
        swatch: '#e3dacc'
    },
    cactus: {
        name: 'cactus', label: '仙人掌',
        bg: '#e6efe9', surface: '#f1f6f2', surfaceHover: '#d8e3da', surfaceRaised: '#cad9cc',
        text: '#15291f', textSecondary: '#3e5b4c', textTertiary: '#6c8576',
        border: 'rgba(21,41,31,0.10)', borderStrong: 'rgba(21,41,31,0.18)',
        accent: '#3e7560', accent2: '#629987',
        accentLight: 'rgba(62,117,96,0.12)', accentGlow: 'rgba(62,117,96,0.22)',
        navBg: 'rgba(230,239,233,0.88)',
        swatch: '#bcd1ca'
    },
    sky: {
        name: 'sky', label: '晴空',
        bg: '#e6eef6', surface: '#f0f4fa', surfaceHover: '#d8e2ee', surfaceRaised: '#c8d6e6',
        text: '#0f2740', textSecondary: '#3a5572', textTertiary: '#6b809a',
        border: 'rgba(15,39,64,0.10)', borderStrong: 'rgba(15,39,64,0.18)',
        accent: '#3a6d9b', accent2: '#6a9bcc',
        accentLight: 'rgba(58,109,155,0.12)', accentGlow: 'rgba(58,109,155,0.22)',
        navBg: 'rgba(230,238,246,0.88)',
        swatch: '#6a9bcc'
    },
    heather: {
        name: 'heather', label: '石南',
        bg: '#ecebf2', surface: '#f4f3f8', surfaceHover: '#dedde8', surfaceRaised: '#cccada',
        text: '#23204a', textSecondary: '#4a4670', textTertiary: '#7a7596',
        border: 'rgba(35,32,74,0.10)', borderStrong: 'rgba(35,32,74,0.18)',
        accent: '#5a548a', accent2: '#827dbd',
        accentLight: 'rgba(90,84,138,0.12)', accentGlow: 'rgba(90,84,138,0.22)',
        navBg: 'rgba(236,235,242,0.88)',
        swatch: '#cbcadb'
    },
    fig: {
        name: 'fig', label: '无花果',
        bg: '#f3e6ec', surface: '#faf1f5', surfaceHover: '#ead4dd', surfaceRaised: '#dcc1cd',
        text: '#3d1828', textSecondary: '#693a4d', textTertiary: '#956b7a',
        border: 'rgba(61,24,40,0.10)', borderStrong: 'rgba(61,24,40,0.18)',
        accent: '#9c4862', accent2: '#c46686',
        accentLight: 'rgba(156,72,98,0.12)', accentGlow: 'rgba(156,72,98,0.22)',
        navBg: 'rgba(243,230,236,0.88)',
        swatch: '#c46686'
    },
    mineral: {
        name: 'mineral', label: '矿石',
        bg: '#e2ece7', surface: '#eef4f1', surfaceHover: '#d2dfd9', surfaceRaised: '#bfd0c8',
        text: '#0f2a22', textSecondary: '#345146', textTertiary: '#637e72',
        border: 'rgba(15,42,34,0.10)', borderStrong: 'rgba(15,42,34,0.18)',
        accent: '#3e7560', accent2: '#629987',
        accentLight: 'rgba(62,117,96,0.12)', accentGlow: 'rgba(62,117,96,0.22)',
        navBg: 'rgba(226,236,231,0.88)',
        swatch: '#629987'
    },
    plum: {
        name: 'plum', label: '梅紫',
        bg: '#ebe8f0', surface: '#f3f1f7', surfaceHover: '#dcd8e6', surfaceRaised: '#c8c2d8',
        text: '#2b1f4d', textSecondary: '#4f4275', textTertiary: '#7a6f9a',
        border: 'rgba(43,31,77,0.10)', borderStrong: 'rgba(43,31,77,0.18)',
        accent: '#5a4a8a', accent2: '#827dbd',
        accentLight: 'rgba(90,74,138,0.12)', accentGlow: 'rgba(90,74,138,0.22)',
        navBg: 'rgba(235,232,240,0.88)',
        swatch: '#827dbd'
    },
    coral: {
        name: 'coral', label: '珊瑚',
        bg: '#f7e7e3', surface: '#fcf2ef', surfaceHover: '#ecd6cf', surfaceRaised: '#dfc1b8',
        text: '#3d1f17', textSecondary: '#69443a', textTertiary: '#956d62',
        border: 'rgba(61,31,23,0.10)', borderStrong: 'rgba(61,31,23,0.18)',
        accent: '#b85a45', accent2: '#d97757',
        accentLight: 'rgba(184,90,69,0.12)', accentGlow: 'rgba(184,90,69,0.22)',
        navBg: 'rgba(247,231,227,0.88)',
        swatch: '#ebcece'
    },
    peach: {
        name: 'peach', label: '桃色',
        bg: '#f5e2d2', surface: '#faead8', surfaceHover: '#e8d2bd', surfaceRaised: '#d8bda4',
        text: '#3d2515', textSecondary: '#6e4e36', textTertiary: '#9a785c',
        border: 'rgba(61,37,21,0.10)', borderStrong: 'rgba(61,37,21,0.18)',
        accent: '#8a4a1f', accent2: '#b3683a',
        accentLight: 'rgba(138,74,31,0.12)', accentGlow: 'rgba(138,74,31,0.22)',
        navBg: 'rgba(245,226,210,0.88)',
        swatch: '#ebc9b7'
    },
    olive: {
        name: 'olive', label: '橄榄',
        bg: '#e9ebde', surface: '#f1f3e7', surfaceHover: '#d9dccc', surfaceRaised: '#c5c9b3',
        text: '#1f2614', textSecondary: '#4a523b', textTertiary: '#787f66',
        border: 'rgba(31,38,20,0.10)', borderStrong: 'rgba(31,38,20,0.18)',
        accent: '#566a3d', accent2: '#788c5d',
        accentLight: 'rgba(86,106,61,0.12)', accentGlow: 'rgba(86,106,61,0.22)',
        navBg: 'rgba(233,235,222,0.88)',
        swatch: '#788c5d'
    },
    charcoal: {
        name: 'charcoal', label: '墨炭',
        bg: '#262624', surface: '#1f1e1d', surfaceHover: '#30302e', surfaceRaised: '#3d3d3a',
        text: '#f5f4ed', textSecondary: '#c2c0b6', textTertiary: '#9c9a92',
        border: 'rgba(245,244,237,0.08)', borderStrong: 'rgba(245,244,237,0.16)',
        accent: '#d97757', accent2: '#e89a7c',
        accentLight: 'rgba(217,119,87,0.16)', accentGlow: 'rgba(217,119,87,0.28)',
        navBg: 'rgba(31,30,29,0.86)',
        swatch: '#262624', dark: true
    }
};

// ==============================
// 账户登录/登出 (Mock)
// ==============================

window.profLogin = function() {
    let name = document.getElementById('profUser').value.trim();
    if (!name) {
        showToast('请输入账号名称', 'error');
        return;
    }
    PROF_STATE.user = name;
    localStorage.setItem('lab_user', name);
    profUpdateLoginView();
    showToast(`欢迎回来，${name}`);
};

window.profLogout = function() {
    PROF_STATE.user = null;
    localStorage.removeItem('lab_user');
    document.getElementById('profUser').value = '';
    document.getElementById('profPwd').value = '';
    profUpdateLoginView();
    showToast('已退出登录');
};

function profUpdateLoginView() {
    if (PROF_STATE.user) {
        let lv = document.getElementById('profLoginView');
        if(lv) lv.style.display = 'none';
        let logged = document.getElementById('profLoggedView');
        if(logged) logged.style.display = 'block';
        let nameEl = document.getElementById('profCurrentName');
        if(nameEl) nameEl.innerText = PROF_STATE.user;
    } else {
        let lv = document.getElementById('profLoginView');
        if(lv) lv.style.display = 'block';
        let logged = document.getElementById('profLoggedView');
        if(logged) logged.style.display = 'none';
    }
}

// ==============================
// 个性化设置
// ==============================

// 切换暗色模式
window.profSetMode = function(mode) {
    PROF_STATE.themeMode = mode;
    localStorage.setItem('lab_theme', mode);

    // UI 激活态切换
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
    const btns = document.querySelectorAll('.theme-btn');
    const idx = mode === 'light' ? 0 : (mode === 'dark' ? 1 : 2);
    if (btns[idx]) btns[idx].classList.add('active');

    // 重新应用主题（mode 会影响最终选用的 preset）
    profApplyTheme();
};

// 切换主色调（向后兼容）—— 内部委托给 profSetTheme
window.profSetAccent = function(themeKeyOrColor) {
    if (typeof themeKeyOrColor === 'string' && THEME_PRESETS[themeKeyOrColor]) {
        return profSetTheme(themeKeyOrColor);
    }
    profSetTheme('clay');
};

window.profSetTheme = function(themeKey) {
    if (!THEME_PRESETS[themeKey]) themeKey = 'clay';
    PROF_STATE.themeKey = themeKey;
    localStorage.setItem('lab_theme_key', themeKey);
    profApplyTheme();
};

// 计算当前实际生效的预设：暗色模式覆盖为 charcoal
function profResolveActivePreset() {
    const mode = PROF_STATE.themeMode;
    const userKey = PROF_STATE.themeKey || 'clay';
    let isDark = false;
    if (mode === 'dark') isDark = true;
    else if (mode === 'auto') {
        isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    if (isDark) {
        // 用 charcoal 作为统一暗色底，同时保留用户选择主题的 accent
        const userPreset = THEME_PRESETS[userKey] || THEME_PRESETS.clay;
        const dark = THEME_PRESETS.charcoal;
        if (userKey === 'charcoal') return dark;
        return Object.assign({}, dark, {
            accent: userPreset.accent2 || userPreset.accent,
            accent2: userPreset.accent,
            accentLight: userPreset.accentLight,
            accentGlow: userPreset.accentGlow,
            dark: true
        });
    }
    return THEME_PRESETS[userKey] || THEME_PRESETS.clay;
}

function profApplyTheme() {
    const preset = profResolveActivePreset();
    const root = document.documentElement;
    const setVar = (k, v) => root.style.setProperty(k, v);

    setVar('--bg', preset.bg);
    setVar('--surface', preset.surface);
    setVar('--surface-hover', preset.surfaceHover);
    setVar('--surface-raised', preset.surfaceRaised);
    setVar('--text', preset.text);
    setVar('--text-secondary', preset.textSecondary);
    setVar('--text-tertiary', preset.textTertiary);
    setVar('--border', preset.border);
    setVar('--border-strong', preset.borderStrong);
    setVar('--accent', preset.accent);
    setVar('--accent-2', preset.accent2);
    setVar('--accent-light', preset.accentLight);
    setVar('--accent-glow', preset.accentGlow);
    setVar('--nav-bg', preset.navBg);

    if (preset.dark) {
        root.setAttribute('data-theme', 'dark');
        root.setAttribute('data-theme-tone', 'dark');
    } else {
        root.setAttribute('data-theme', 'light');
        root.removeAttribute('data-theme-tone');
    }

    profUpdateActiveSwatch();
}

// 监听系统主题变化（auto 模式下生效）
if (window.matchMedia) {
    try {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            if (PROF_STATE.themeMode === 'auto') profApplyTheme();
        });
    } catch (_) { /* old browsers */ }
}

function profUpdateActiveSwatch() {
    document.querySelectorAll('.theme-swatch').forEach(el => {
        el.classList.toggle('active', el.dataset.theme === PROF_STATE.themeKey);
    });
}

function profRenderThemeGrid() {
    const grid = document.getElementById('themeGrid');
    if (!grid) return;
    grid.innerHTML = Object.values(THEME_PRESETS).map(p => `
        <button type="button" class="theme-swatch" data-theme="${p.name}"
                onclick="profSetTheme('${p.name}')" aria-label="${p.label}">
            <span class="color-dot" style="background:${p.swatch};"></span>
            <span class="name">${p.label}</span>
        </button>
    `).join('');
    profUpdateActiveSwatch();
}

// ==============================
// 初始化与加载
// ==============================

document.addEventListener('DOMContentLoaded', () => {
    // 1. 用户
    let savedUser = localStorage.getItem('lab_user');
    if (savedUser) PROF_STATE.user = savedUser;
    profUpdateLoginView();

    // 2. 读取 mode + themeKey 到 state（不立即应用）
    PROF_STATE.themeMode = localStorage.getItem('lab_theme') || 'auto';
    let savedThemeKey = localStorage.getItem('lab_theme_key');
    if (!savedThemeKey && localStorage.getItem('lab_accent')) {
        localStorage.removeItem('lab_accent');
    }
    PROF_STATE.themeKey = (savedThemeKey && THEME_PRESETS[savedThemeKey]) ? savedThemeKey : 'clay';

    // 3. 渲染 UI（按钮 / swatch）
    profRenderThemeGrid();
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
    const btns = document.querySelectorAll('.theme-btn');
    const idx = PROF_STATE.themeMode === 'light' ? 0 : (PROF_STATE.themeMode === 'dark' ? 1 : 2);
    if (btns[idx]) btns[idx].classList.add('active');

    // 4. 统一应用
    profApplyTheme();
});
