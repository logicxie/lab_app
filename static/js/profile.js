/* ============================================================
   profile.js — 个人档案与系统设置
   ============================================================ */

const PROF_STATE = {
    user: null, // string name
    themeMode: 'auto', // 'light', 'dark', 'auto'
    accent: '#5a67d8',
    accentLight: 'rgba(90,103,216,0.1)',
    accentGlow: 'rgba(90,103,216,0.22)'
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
    
    if (mode === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        let btns = document.querySelectorAll('.theme-btn');
        if(btns[0]) btns[0].classList.add('active');
    } else if (mode === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        let btns = document.querySelectorAll('.theme-btn');
        if(btns[1]) btns[1].classList.add('active');
    } else {
        document.documentElement.removeAttribute('data-theme');
        let btns = document.querySelectorAll('.theme-btn');
        if(btns[2]) btns[2].classList.add('active');
    }
};

// 切换主色调
window.profSetAccent = function(color, lightColor, glowColor) {
    PROF_STATE.accent = color;
    PROF_STATE.accentLight = lightColor;
    PROF_STATE.accentGlow = glowColor;
    
    localStorage.setItem('lab_accent', JSON.stringify({color, lightColor, glowColor}));
    
    // 应用 CSS 变量
    document.documentElement.style.setProperty('--accent', color);
    document.documentElement.style.setProperty('--accent-light', lightColor);
    document.documentElement.style.setProperty('--accent-glow', glowColor);
    
    // 如果有图表，也需要更新色调 (Plotly)
    if (typeof renderCellDbBox === 'function' && document.getElementById('page-profile') && document.getElementById('page-profile').classList.contains('active') === false) {
        renderCellDbBox(); 
    }
    
    profUpdateActiveColorDot();
};

function profUpdateActiveColorDot() {
    document.querySelectorAll('.color-dot').forEach(el => {
        el.classList.remove('active');
    });
    
    // 强制查找最接近的
    document.querySelectorAll('.color-dot').forEach(el => {
        let inlineColor = el.getAttribute('onclick');
        if (inlineColor && inlineColor.includes(PROF_STATE.accent)) {
            el.classList.add('active');
        }
    });
}

// ==============================
// 初始化与加载
// ==============================

document.addEventListener('DOMContentLoaded', () => {
    // 1. 用户
    let savedUser = localStorage.getItem('lab_user');
    if (savedUser) PROF_STATE.user = savedUser;
    profUpdateLoginView();
    
    // 2. 主题
    let savedTheme = localStorage.getItem('lab_theme') || 'auto';
    profSetMode(savedTheme);
    
    // 3. 色调
    let savedAccentRaw = localStorage.getItem('lab_accent');
    if (savedAccentRaw) {
        try {
            let c = JSON.parse(savedAccentRaw);
            profSetAccent(c.color, c.lightColor, c.glowColor);
        } catch(e) {}
    } else {
        profUpdateActiveColorDot(); // just update UI
    }
});
