/* ============================================================
    app.js — 实验流程管理平台前端逻辑
   ============================================================ */

// 全局配置变量
let CONFIG = {
    area_map: {},
    plate_configs: {},
    concentration_units: []
};

// 状态
let STATE = {
    currentDate: new Date(),
    selectedDate: new Date(),
    calendarMarks: {},
    cellDb: {},
    activeCellProfile: null,
    drugProtocols: [],
    drugPlates: [],
    mwLibrary: []
};

let AUTH_USER = null;

const MOBILE_FULLSCREEN_MEDIA = '(max-width: 768px), (pointer: coarse)';
let MOBILE_FULLSCREEN_INITIALIZED = false;
let MOBILE_FULLSCREEN_LAST_ATTEMPT = 0;

function isMobileShell() {
    return !!(window.matchMedia && window.matchMedia(MOBILE_FULLSCREEN_MEDIA).matches);
}

function isStandaloneDisplayMode() {
    return !!(
        window.navigator.standalone === true ||
        (window.matchMedia && (
            window.matchMedia('(display-mode: fullscreen)').matches ||
            window.matchMedia('(display-mode: standalone)').matches
        ))
    );
}

function getFullscreenElement() {
    return document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement ||
        null;
}

function updateMobileFullscreenClasses() {
    document.documentElement.classList.toggle('is-mobile-shell', isMobileShell());
    document.documentElement.classList.toggle('is-app-fullscreen', isStandaloneDisplayMode() || !!getFullscreenElement());
}

function updateMobileViewportHeight() {
    if (!isMobileShell()) {
        document.documentElement.style.removeProperty('--app-viewport-height');
        updateMobileFullscreenClasses();
        return;
    }
    let viewportHeight = window.visualViewport && window.visualViewport.height
        ? window.visualViewport.height
        : window.innerHeight;
    if (viewportHeight > 0) {
        document.documentElement.style.setProperty('--app-viewport-height', `${Math.round(viewportHeight)}px`);
    }
    updateMobileFullscreenClasses();
}

function requestMobileFullscreen() {
    updateMobileViewportHeight();
    if (!isMobileShell() || isStandaloneDisplayMode() || getFullscreenElement()) return Promise.resolve(false);

    let root = document.documentElement;
    let requestFullscreen = root.requestFullscreen ||
        root.webkitRequestFullscreen ||
        root.mozRequestFullScreen ||
        root.msRequestFullscreen;
    if (!requestFullscreen) return Promise.resolve(false);

    let requestResult;
    try {
        requestResult = requestFullscreen.call(root, { navigationUI: 'hide' });
    } catch (fullscreenError) {
        try {
            requestResult = requestFullscreen.call(root);
        } catch (fallbackError) {
            updateMobileFullscreenClasses();
            return Promise.resolve(false);
        }
    }

    return Promise.resolve(requestResult)
        .then(() => {
            updateMobileViewportHeight();
            return true;
        })
        .catch(() => {
            updateMobileFullscreenClasses();
            return false;
        });
}

function collapseMobileBrowserBar() {
    if (!isMobileShell() || isStandaloneDisplayMode() || getFullscreenElement()) return;
    window.setTimeout(() => {
        let scrollingElement = document.scrollingElement || document.documentElement;
        if (!scrollingElement || window.scrollY > 1) return;
        if (scrollingElement.scrollHeight <= window.innerHeight + 2) return;
        try {
            window.scrollTo({ left: 0, top: 1, behavior: 'auto' });
        } catch (scrollError) {
            window.scrollTo(0, 1);
        }
    }, 250);
}

function handleMobileFullscreenGesture() {
    if (!isMobileShell() || isStandaloneDisplayMode() || getFullscreenElement()) return;
    let now = Date.now();
    if (now - MOBILE_FULLSCREEN_LAST_ATTEMPT < 1200) return;
    MOBILE_FULLSCREEN_LAST_ATTEMPT = now;
    requestMobileFullscreen();
}

function initMobileFullscreenMode() {
    if (MOBILE_FULLSCREEN_INITIALIZED) return;
    MOBILE_FULLSCREEN_INITIALIZED = true;

    updateMobileViewportHeight();
    requestMobileFullscreen();
    collapseMobileBrowserBar();

    ['click', 'touchend', 'pointerup'].forEach(eventName => {
        document.addEventListener(eventName, handleMobileFullscreenGesture, { capture: true, passive: true });
    });
    document.addEventListener('fullscreenchange', updateMobileViewportHeight);
    document.addEventListener('webkitfullscreenchange', updateMobileViewportHeight);
    window.addEventListener('resize', updateMobileViewportHeight, { passive: true });
    window.addEventListener('orientationchange', () => {
        window.setTimeout(() => {
            updateMobileViewportHeight();
            collapseMobileBrowserBar();
        }, 250);
    }, { passive: true });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', updateMobileViewportHeight, { passive: true });
        window.visualViewport.addEventListener('scroll', updateMobileViewportHeight, { passive: true });
    }
}

document.addEventListener('click', (event) => {
    let summary = event.target.closest('.workflow-steps-details > summary');
    if (!summary) return;
    let details = summary.parentElement;
    event.preventDefault();
    if (details.dataset.animating === '1') return;
    details.dataset.animating = '1';
    if (details.open) {
        details.classList.remove('opening');
        details.classList.add('closing');
        setTimeout(() => {
            details.open = false;
            details.classList.remove('closing');
            details.dataset.animating = '';
        }, 180);
    } else {
        details.open = true;
        details.classList.add('opening');
        setTimeout(() => {
            details.classList.remove('opening');
            details.dataset.animating = '';
        }, 180);
    }
});

window.uiOpenSheet = function(id, title, bodyHtml) {
    let old = document.getElementById(id);
    if (old) old.remove();
    let modal = document.createElement('div');
    modal.id = id;
    modal.className = 'sheet-modal';
    modal.innerHTML = `
        <div class="sheet-panel">
            <div class="sheet-header">
                <div class="sheet-title">${title}</div>
                <button class="btn btn-icon btn-ghost" onclick="uiCloseSheet('${id}')" aria-label="关闭"><i class="ti ti-x"></i></button>
            </div>
            ${bodyHtml}
        </div>`;
    modal.addEventListener('click', event => { if (event.target === modal) uiCloseSheet(id); });
    document.body.appendChild(modal);
    return modal;
};

window.uiCloseSheet = function(id) {
    let modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('closing');
    setTimeout(() => modal.remove(), 160);
};

const LAB_TIMER_STORAGE_KEY = 'v2_app_lab_step_timers_v1';
let LAB_TIMERS = {};
let LAB_TIMER_AUDIO_CONTEXT = null;

function labTimerLoadState() {
    try {
        LAB_TIMERS = JSON.parse(localStorage.getItem(LAB_TIMER_STORAGE_KEY) || '{}') || {};
    } catch (e) {
        LAB_TIMERS = {};
    }
}

function labTimerSaveState() {
    try { localStorage.setItem(LAB_TIMER_STORAGE_KEY, JSON.stringify(LAB_TIMERS)); } catch (e) {}
}

function labTimerSeconds(value) {
    let seconds = Number(value || 0);
    return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
}

function labTimerRemaining(timer) {
    if (!timer) return 0;
    if (timer.status === 'running') return Math.max(0, Math.ceil((Number(timer.endAt || 0) - Date.now()) / 1000));
    return Math.max(0, Math.round(Number(timer.remaining || 0)));
}

function labTimerFormat(seconds) {
    let total = Math.max(0, Math.round(Number(seconds || 0)));
    let hours = Math.floor(total / 3600);
    let minutes = Math.floor((total % 3600) / 60);
    let secs = total % 60;
    if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function protocolDurationLabel(seconds) {
    let total = Math.max(0, Math.round(Number(seconds || 0)));
    if (!total) return '未设置';
    let hours = Math.floor(total / 3600);
    let minutes = Math.round((total % 3600) / 60);
    if (hours && minutes) return `${hours}小时${minutes}分钟`;
    if (hours) return `${hours}小时`;
    if (total >= 60) return `${Math.round(total / 60)}分钟`;
    return `${total}秒`;
}

function labTimerNormalizeList(timers, length) {
    let source = Array.isArray(timers) ? timers : [];
    return Array.from({ length }, (_, index) => labTimerSeconds(source[index]));
}

function labTimerUnlockAudio() {
    try {
        let AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        if (!LAB_TIMER_AUDIO_CONTEXT) LAB_TIMER_AUDIO_CONTEXT = new AudioContextClass();
        if (LAB_TIMER_AUDIO_CONTEXT.state === 'suspended') LAB_TIMER_AUDIO_CONTEXT.resume();
    } catch (e) {}
}

function labTimerPlayAlert() {
    labTimerUnlockAudio();
    if (!LAB_TIMER_AUDIO_CONTEXT) return;
    let ctx = LAB_TIMER_AUDIO_CONTEXT;
    let now = ctx.currentTime;
    [0, 0.32, 0.64].forEach(offset => {
        let osc = ctx.createOscillator();
        let gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now + offset);
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.24, now + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.22);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.24);
    });
}

function labTimerNotify(timer) {
    let title = '实验步骤倒计时结束';
    let body = timer.label || '有一个实验步骤计时已归零';
    if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification(title, { body, tag: timer.key || body }); } catch (e) {}
    }
    if (navigator.vibrate) navigator.vibrate([360, 140, 360, 140, 520]);
    labTimerPlayAlert();
    if (typeof showToast === 'function') showToast(`${body} 已结束`, 'warning');
}

function labTimerStatusText(status) {
    if (status === 'running') return '进行中';
    if (status === 'paused') return '已暂停';
    if (status === 'done') return '已结束';
    return '未开始';
}

function labTimerWidgetInner(key, duration, label) {
    let timer = LAB_TIMERS[key] || null;
    let status = timer ? timer.status : 'idle';
    let remaining = timer ? labTimerRemaining(timer) : duration;
    let safeKey = protocolJsArg(key);
    let safeLabel = protocolJsArg(label || '实验步骤');
    let primary = status === 'running'
        ? `<button type="button" class="btn btn-sm btn-secondary" onclick="labTimerPause('${safeKey}', event)" title="暂停"><i class="ti ti-player-pause"></i></button>`
        : `<button type="button" class="btn btn-sm btn-secondary" onclick="labTimerStart('${safeKey}', ${duration}, '${safeLabel}', false, event)" title="开始"><i class="ti ti-player-play"></i></button>`;
    return `<div class="step-timer-main">
            <i class="ti ti-clock"></i>
            <span>倒计时</span>
            <b>${labTimerFormat(timer ? remaining : duration)}</b>
            <small>${labTimerStatusText(status)}</small>
        </div>
        <div class="step-timer-actions">
            ${primary}
            <button type="button" class="btn btn-sm btn-secondary" onclick="labTimerRestart('${safeKey}', ${duration}, '${safeLabel}', event)" title="重新开始"><i class="ti ti-refresh"></i></button>
            <button type="button" class="btn btn-sm btn-danger" onclick="labTimerCancel('${safeKey}', event)" title="取消"><i class="ti ti-player-stop"></i></button>
        </div>`;
}

function labTimerWidgetHtml(key, duration, label) {
    if (!duration) return '';
    return `<div class="step-timer" data-lab-timer-key="${protocolSafe(key)}" data-lab-timer-duration="${duration}" data-lab-timer-label="${protocolSafe(label)}">
        ${labTimerWidgetInner(key, duration, label)}
    </div>`;
}

function labTimerRenderAll() {
    document.querySelectorAll('[data-lab-timer-key]').forEach(widget => {
        let key = widget.dataset.labTimerKey;
        let duration = labTimerSeconds(widget.dataset.labTimerDuration);
        let label = widget.dataset.labTimerLabel || '实验步骤';
        widget.innerHTML = labTimerWidgetInner(key, duration, label);
    });
}

function labTimerTick() {
    let changed = false;
    Object.keys(LAB_TIMERS).forEach(key => {
        let timer = LAB_TIMERS[key];
        if (!timer || timer.status !== 'running') return;
        let remaining = labTimerRemaining(timer);
        if (remaining <= 0) {
            timer.status = 'done';
            timer.remaining = 0;
            timer.completedAt = Date.now();
            if (!timer.alerted) {
                timer.alerted = true;
                labTimerNotify(timer);
            }
            changed = true;
        }
    });
    if (changed) labTimerSaveState();
    labTimerRenderAll();
}

window.labTimerRequestPermission = function(event) {
    if (event) event.stopPropagation();
    labTimerUnlockAudio();
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
            if (typeof showToast === 'function') showToast(permission === 'granted' ? '计时提醒通知已开启' : '通知未授权，仍会在页面内响铃提醒', permission === 'granted' ? 'success' : 'warning');
        });
    } else if (typeof showToast === 'function') {
        showToast(('Notification' in window && Notification.permission === 'granted') ? '计时提醒已准备好' : '当前浏览器不支持系统通知，将使用页面提醒', 'info');
    }
    if (navigator.vibrate) navigator.vibrate(40);
};

window.labTimerStart = function(key, duration, label = '实验步骤', restart = false, event = null) {
    if (event) event.stopPropagation();
    duration = labTimerSeconds(duration);
    if (!key || !duration) return;
    labTimerUnlockAudio();
    let current = LAB_TIMERS[key];
    let remaining = restart || !current || current.status === 'done' ? duration : labTimerRemaining(current) || duration;
    LAB_TIMERS[key] = {
        key,
        label,
        duration,
        remaining,
        status: 'running',
        endAt: Date.now() + remaining * 1000,
        updatedAt: Date.now(),
        alerted: false
    };
    labTimerSaveState();
    labTimerRenderAll();
};

window.labTimerPause = function(key, event = null) {
    if (event) event.stopPropagation();
    let timer = LAB_TIMERS[key];
    if (!timer) return;
    timer.remaining = labTimerRemaining(timer);
    timer.status = 'paused';
    timer.updatedAt = Date.now();
    labTimerSaveState();
    labTimerRenderAll();
};

window.labTimerCancel = function(key, event = null) {
    if (event) event.stopPropagation();
    if (!key) return;
    delete LAB_TIMERS[key];
    labTimerSaveState();
    labTimerRenderAll();
};

window.labTimerRestart = function(key, duration, label = '实验步骤', event = null) {
    window.labTimerStart(key, duration, label, true, event);
};

window.labTimerHandleStepCheck = function(key, duration, label, checked) {
    if (!checked || !duration) return;
    let timer = LAB_TIMERS[key];
    if (!timer || timer.status === 'idle' || timer.status === 'done') window.labTimerStart(key, duration, label, false, null);
};

labTimerLoadState();
setInterval(labTimerTick, 1000);

window.buildWorkflowStepChecklist = function(steps, checks = [], inputPrefix, onchangeName, title = '实验流程步骤', timers = []) {
    if (!Array.isArray(steps) || steps.length === 0) return '';
    let timerList = labTimerNormalizeList(timers, steps.length);
    let hasTimers = timerList.some(Boolean);
    return `<details class="workflow-steps-details">
        <summary><i class="ti ti-info-circle"></i> ${title}</summary>
        ${hasTimers ? `<div class="step-timer-permission"><span><i class="ti ti-bell"></i> 步骤计时结束后会响铃、通知，并在支持设备上振动。</span><button type="button" class="btn btn-sm btn-secondary" onclick="labTimerRequestPermission(event)">允许提醒</button></div>` : ''}
        <div class="step-list">
            ${steps.map((step, index) => {
                let key = `${inputPrefix}:${index}`;
                let label = `Step ${index + 1} · ${step}`;
                return `
                <div class="step-item ${(checks || [])[index] ? 'checked' : ''}" id="${protocolSafe(`${inputPrefix}Item_${index}`)}">
                    <label class="step-item-main">
                        <input type="checkbox" class="step-checkbox" ${(checks || [])[index] ? 'checked' : ''} onchange="labTimerHandleStepCheck('${protocolJsAttr(key)}', ${timerList[index]}, '${protocolJsAttr(label)}', this.checked);${onchangeName}(${index}, this.checked)">
                        <span><b>Step ${index + 1}.</b> ${protocolSafe(step)}</span>
                    </label>
                    ${labTimerWidgetHtml(key, timerList[index], label)}
                </div>`;
            }).join('')}
        </div>
    </details>`;
};

window.buildReadonlyWorkflowSteps = function(steps, checks = [], title = '操作步骤', timers = []) {
    if (!Array.isArray(steps) || !steps.length) return '';
    let timerList = labTimerNormalizeList(timers, steps.length);
    return `<div class="card" style="margin-bottom:8px;"><div class="card-header"><i class="ti ti-checklist"></i> ${title}</div>
        ${steps.map((step, index) => `
            <label class="step-item ${(checks || [])[index] ? 'checked' : ''}" style="pointer-events:none;opacity:${(checks || [])[index] ? 1 : 0.65};">
                <input type="checkbox" class="step-checkbox" ${(checks || [])[index] ? 'checked' : ''} disabled>
                <div><b>Step ${index + 1}.</b> ${protocolSafe(step)}${timerList[index] ? `<small class="readonly-step-timer"><i class="ti ti-clock"></i> ${protocolDurationLabel(timerList[index])}</small>` : ''}</div>
            </label>`).join('')}
    </div>`;
};

function setAuthUi(authenticated, user = null) {
    AUTH_USER = user;
    document.body.classList.remove('auth-pending', 'auth-login', 'auth-ready');
    document.body.classList.add(authenticated ? 'auth-ready' : 'auth-login');
    if (authenticated && typeof profSyncAuthUser === 'function') profSyncAuthUser(user);
}

async function authCheckSession() {
    try {
        let res = await fetch('/api/auth/session');
        let data = await res.json();
        setAuthUi(!!data.authenticated, data.user || null);
        return !!data.authenticated;
    } catch (e) {
        setAuthUi(false, null);
        return false;
    }
}

window.authLogin = async function() {
    let username = document.getElementById('loginUser')?.value.trim();
    let password = document.getElementById('loginPwd')?.value || '';
    if (!username || !password) {
        showToast('需填写账号和密码', 'error');
        return;
    }
    try {
        let res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        let data = await res.json();
        if (!res.ok) throw new Error(data.error || data.detail || '登录失败');
        setAuthUi(true, data.user);
        showToast(`登录成功：${data.user.display_name || data.user.username}`);
        await initAuthenticatedApp();
    } catch (e) {
        showToast(e.message, 'error');
    }
};

window.authLogout = async function() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setAuthUi(false, null);
    showToast('已退出登录');
};

// ==========================================
// 路由与导航
// ==========================================
function navigate(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    let target = document.getElementById(`page-${pageId}`);
    if(target) target.classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(btn => {
        if(btn.dataset.page === pageId) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    if (pageId === 'home') {
        loadHomeData();
    } else if (pageId === 'journal') {
        if (typeof jnInit === 'function') jnInit();
    }
}

async function openModule(modId) {
    let hub = document.getElementById('expHub');
    if (hub) hub.style.display = 'none';
    document.querySelectorAll('.module-view').forEach(m => m.style.display = 'none');
    let target = document.getElementById(`mod-${modId}`);
    if (target) {
        target.style.display = 'block';
        target.classList.remove('view-enter', 'view-exit');
        void target.offsetWidth;
        target.classList.add('view-enter');
    }
    
    if (modId === 'cell_passage') {
        loadCellDb();
    } else if (modId === 'drug_treatment') {
        await Promise.all([loadProtocols(), loadCellDb()]);
        if (STATE.drugPlates.length === 0) {
            addPlate('6孔板');
        }
    } else if (modId === 'pcr') {
        if (typeof loadPcrData === 'function') {
            await loadPcrData();
        }
    } else if (modId === 'wb') {
        if (typeof loadWbData === 'function') {
            await loadWbData();
        }
    } else if (modId === 'if') {
        if (typeof loadIfData === 'function') await loadIfData();
    } else if (modId === 'animal') {
        if (typeof loadAnimalData === 'function') await loadAnimalData();
        if (typeof loadAnimalHarvestModule === 'function') await loadAnimalHarvestModule();
    } else if (modId === 'samples') {
        if (typeof loadSampleLibrary === 'function') await loadSampleLibrary();
    } else if (modId === 'bioinfo') {
        if (typeof loadBioinfoModule === 'function') await loadBioinfoModule();
    } else if (modId === 'other') {
        if (typeof loadOtherModule === 'function') await loadOtherModule();
    } else if (modId === 'patient_harvest') {
        if (typeof loadPatientHarvestModule === 'function') await loadPatientHarvestModule();
    } else if (modId === 'sendout') {
        if (typeof loadSendoutModule === 'function') await loadSendoutModule();
    } else if (modId === 'primer_antibody') {
        if (typeof loadPrimerAntibodyLibrary === 'function') await loadPrimerAntibodyLibrary();
    } else if (modId === 'reagent') {
        if (typeof loadReagentLibrary === 'function') await loadReagentLibrary();
    } else if (modId === 'protocols') {
        await Promise.all([
            loadProtocols(),
            loadMwLibrary(),
            loadCellDb(),
            typeof loadPcrData === 'function' ? loadPcrData() : Promise.resolve(),
            typeof loadWbData === 'function' ? loadWbData() : Promise.resolve(),
            typeof loadWorkflowProtocols === 'function' ? loadWorkflowProtocols() : Promise.resolve()
        ]);
        if (typeof renderProtocolLibraryHub === 'function') renderProtocolLibraryHub();
    }
}

function addDaysToDateTime(baseValue, days) {
    let base = baseValue ? new Date(String(baseValue).replace(' ', 'T')) : new Date();
    if (Number.isNaN(base.getTime())) base = new Date();
    base.setDate(base.getDate() + (parseInt(days) || 0));
    return base.toISOString().substring(0, 16).replace('T', ' ');
}

function closeModule() {
    let active = Array.from(document.querySelectorAll('.module-view')).find(m => m.style.display !== 'none');
    let hub = document.getElementById('expHub');
    if (active) {
        active.classList.remove('view-enter');
        active.classList.add('view-exit');
        setTimeout(() => {
            active.style.display = 'none';
            active.classList.remove('view-exit');
            if (hub) {
                hub.style.display = 'block';
                hub.classList.remove('view-enter');
                void hub.offsetWidth;
                hub.classList.add('view-enter');
            }
        }, 160);
        return;
    }
    document.querySelectorAll('.module-view').forEach(m => m.style.display = 'none');
    if (hub) {
        hub.style.display = 'block';
        hub.classList.add('view-enter');
    }
}

function switchTab(btn, groupClass, targetId) {
    let parent = btn.parentElement;
    parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    document.querySelectorAll(`.${groupClass}`).forEach(p => p.classList.remove('active'));
    document.getElementById(targetId).classList.add('active');

    // 切换到 RT 标签时，刷新 RNA 来源下拉（保证新保存的RNA实验立即可见）
    if (targetId === 'pcrRt' && typeof _refreshRtRnaSelect === 'function') {
        _refreshRtRnaSelect();
    }
    // 切换到 qPCR 标签时，刷新 RT 来源下拉
    if (targetId === 'pcrQpcr' && typeof _refreshQpcrRtSelect === 'function') {
        _refreshQpcrRtSelect();
    }
}

function toggleCollapse(el) {
    el.classList.toggle('open');
    let body = el.nextElementSibling;
    body.classList.toggle('open');
}

function showToast(msg, type = "success") {
    let container = document.getElementById('toastContainer');
    let toast = document.createElement('div');
    toast.className = 'toast';
    let icon = type === "error" ? '<i class="ti ti-circle-x-filled" style="color:var(--danger); font-size:18px; margin-top:-1px;"></i>'
              : type === "warning" ? '<i class="ti ti-alert-triangle-filled" style="color:var(--warning); font-size:18px; margin-top:-1px;"></i>'
              : '<i class="ti ti-circle-check-filled" style="color:var(--success); font-size:18px; margin-top:-1px;"></i>';
    toast.innerHTML = `<span style="display:flex;align-items:center;height:100%;">${icon}</span> <span style="line-height:1;margin-top:1px;">${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        if(container.contains(toast)) container.removeChild(toast);
    }, 2500);
}

// ==========================================
// 初始化
// ==========================================
async function initAuthenticatedApp() {
    try {
        let res = await fetch('/api/config');
        CONFIG = await res.json();
    } catch(e) {
        console.error("加载配置失败", e);
    }
    
    // 初始化时加载首页数据
    loadHomeData();
}

async function initApp() {
    initMobileFullscreenMode();
    let authenticated = await authCheckSession();
    if (!authenticated) return;
    await initAuthenticatedApp();
}

window.addEventListener('DOMContentLoaded', initApp);

// ==========================================
// 首页模块
// ==========================================
async function loadHomeData() {
    try {
        // Stats
        let statRes = await fetch('/api/stats');
        let stats = await statRes.json();
        document.getElementById('statToday').innerText = stats.today_schedules;
        document.getElementById('statSchedules').innerText = stats.pending_schedules;
        document.getElementById('statExperiments').innerText = stats.total_experiments;
        document.getElementById('statProtocols').innerText = stats.active_experiments;

        // Calendar Marks
        let marksRes = await fetch('/api/calendar-marks');
        STATE.calendarMarks = await marksRes.json();
        
        renderCalendar();
        loadDayDetails();
    } catch(e) {
        console.error("加载首页数据失败", e);
    }
}

function renderCalendar() {
    let containers = ['calendarWidget', 'scheduleCalendarWidget'];
    let year = STATE.currentDate.getFullYear();
    let month = STATE.currentDate.getMonth();
    
    let firstDay = new Date(year, month, 1).getDay();
    firstDay = firstDay === 0 ? 6 : firstDay - 1;
    let daysInMonth = new Date(year, month + 1, 0).getDate();
    
    let html = `
        <div class="calendar-nav">
            <button onclick="changeMonth(-1)"><i class="ti ti-chevron-left"></i> 上月</button>
            <div class="month-label">${year} 年 ${month + 1} 月</div>
            <button onclick="changeMonth(1)">下月 <i class="ti ti-chevron-right"></i></button>
        </div>
        <div class="calendar-grid">
            <div class="cal-weekday">一</div><div class="cal-weekday">二</div>
            <div class="cal-weekday">三</div><div class="cal-weekday">四</div>
            <div class="cal-weekday">五</div><div class="cal-weekday">六</div>
            <div class="cal-weekday">日</div>
    `;
    
    for (let i = 0; i < firstDay; i++) {
        html += `<div class="cal-day empty"></div>`;
    }
    
    let today = new Date();
    
    for (let i = 1; i <= daysInMonth; i++) {
        let d = new Date(year, month, i);
        let dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        let count = STATE.calendarMarks[dateStr] || 0;
        
        let isToday = (d.toDateString() === today.toDateString()) ? 'today' : '';
        let isSelected = (d.toDateString() === STATE.selectedDate.toDateString()) ? 'selected' : '';
        
        // Show number of items, adjust color for contrast if selected
        let badgeColor = isSelected ? 'rgba(255,255,255,0.9)' : 'var(--accent)';
        let badge = count > 0 ? `<div style="font-size:10px;font-weight:700;color:${badgeColor};line-height:1;margin-top:2px;">${count} 项</div>` : '';
        
        html += `
            <button class="cal-day ${isToday} ${isSelected}" onclick="selectDate(${year}, ${month}, ${i})">
                ${i}
                ${badge}
            </button>
        `;
    }
    
    html += `</div>`;

    containers.forEach(id => {
        let el = document.getElementById(id);
        if (el) el.innerHTML = html;
    });
}


function changeMonth(delta) {
    let m = STATE.currentDate.getMonth();
    STATE.currentDate.setMonth(m + delta);
    renderCalendar();
}

function selectDate(year, month, day) {
    STATE.selectedDate = new Date(year, month, day);
    renderCalendar();
    loadDayDetails();
}

async function loadDayDetails() {
    let year = STATE.selectedDate.getFullYear();
    let month = String(STATE.selectedDate.getMonth() + 1).padStart(2, '0');
    let day = String(STATE.selectedDate.getDate()).padStart(2, '0');
    let dateStr = `${year}-${month}-${day}`;
    
    let titleEl = document.getElementById('dayDetailTitle');
    let titleElSch = document.getElementById('schDetailTitle');
    if(titleEl) titleEl.innerHTML = `<i class="ti ti-map-pin"></i> ${year}年${month}月${day}日 事务明细`;
    if(titleElSch) titleElSch.innerHTML = `<i class="ti ti-map-pin"></i> ${year}年${month}月${day}日 选中日期明细`;
    
    try {
        let res = await fetch(`/api/schedule/date/${dateStr}`);
        let data = await res.json();
        
        let html = '';
        
        // 排期
        html += `<div class="section-title"><i class="ti ti-clock"></i> 当日日程</div>`;
        if (data.schedules.length === 0) {
            html += `<div class="empty-state" style="padding:24px 16px">
                <i class="ti ti-calendar-off ti-xl"></i>
                <div style="margin-top:8px;font-size:13px">当日无待办事项</div>
            </div>`;
        } else {
            data.schedules.forEach(s => {
                let isDone = s.status && s.status.includes("已完成");
                let timeObj = s.obs_time.length >= 16 ? s.obs_time : s.obs_time + " 00:00"; 
                let time = timeObj.substring(11, 16);
                html += `<div class="event-card schedule ${isDone ? 'done' : ''}" style="position:relative;">
                    <div class="event-card-icon"><i class="ti ti-${isDone ? 'check' : 'clock'}"></i></div>
                    <div class="event-card-body">
                        <div style="font-weight:700">${time} · ${s.profile}</div>
                        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${s.details}</div>
                    </div>
                    <button class="btn btn-sm btn-danger" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);" onclick="event.stopPropagation();schDeleteSchedule('${s.id}')"><i class="ti ti-x"></i></button>
                </div>`;
            });
        }
        
        html += `<div class="section-title"><i class="ti ti-flask"></i> 当日实验记录</div>`;
        if (data.experiments.length === 0 && data.passages.length === 0 && (!data.workflows || data.workflows.length === 0)) {
            html += `<div class="empty-state" style="padding:24px 16px">
                <i class="ti ti-file-off ti-xl"></i>
                <div style="margin-top:8px;font-size:13px">当日无新实验记录</div>
            </div>`;
        }
        
        data.experiments.forEach(e => {
            html += `<div class="event-card experiment" onclick="navigate('experiment'); openModule('drug_treatment');">
                <div class="event-card-icon"><i class="ti ti-pill"></i></div>
                <div class="event-card-body">
                    <div style="font-weight:700">${e.name}</div>
                    <div style="font-size:12px;opacity:0.8;margin-top:2px">${e.plate_type} · ${e.status}</div>
                </div>
            </div>`;
        });
        
        data.passages.forEach(p => {
            html += `<div class="event-card passage" onclick="navigate('experiment'); openModule('cell_passage');">
                <div class="event-card-icon"><i class="ti ti-cell"></i></div>
                <div class="event-card-body">
                    <div style="font-weight:700">${p.profile} 传代</div>
                    <div style="font-size:12px;opacity:0.8;margin-top:2px">
                        ${p.src_vessel} × ${p.src_count} <i class="ti ti-arrow-right"></i> ${p.tgt_vessel} × ${p.tgt_count}
                    </div>
                </div>
            </div>`;
        });

        (data.workflows || []).forEach(w => {
            let icon = w.kind === 'harvest' ? 'ti-database-plus' : (w.primary_antibody ? 'ti-microscope' : 'ti-list-check');
            html += `<div class="event-card experiment" onclick="navigate('journal');">
                <div class="event-card-icon"><i class="ti ${icon}"></i></div>
                <div class="event-card-body">
                    <div style="font-weight:700">${w.name}</div>
                    <div style="font-size:12px;opacity:0.8;margin-top:2px">${w.protocol_name || w.source_model_name || w.status || '工作流记录'}</div>
                </div>
            </div>`;
        });

        let targetContainers = ['dayDetailContent', 'schDetailContent'];
        targetContainers.forEach(id => {
            let el = document.getElementById(id);
            if(el) el.innerHTML = html;
        });

    } catch(e) {
        console.error("加载当日详情失败", e);
    }
}

// ============================================
// 日程创建
// ============================================

window.schOpenCreateModal = function() {
    let year = STATE.selectedDate.getFullYear();
    let month = String(STATE.selectedDate.getMonth() + 1).padStart(2, '0');
    let day = String(STATE.selectedDate.getDate()).padStart(2, '0');
    let dateStr = `${year}-${month}-${day}`;
    // 预设下一个整点
    let now = new Date();
    let hr = String((now.getHours() + 1) % 24).padStart(2, '0');

    uiOpenSheet('schCreateModal', '<i class="ti ti-calendar-plus" style="color:var(--accent);"></i> 创建待办日程', `
            <div class="form-group">
                <label class="form-label">待办项目名称</label>
                <input type="text" class="form-input" id="schItemName" placeholder="野生型小鼠肝脏取材">
            </div>
            <div class="form-group">
                <label class="form-label">时间</label>
                <input type="datetime-local" class="form-input" id="schItemTime" value="${dateStr}T${hr}:00">
            </div>
            <div class="form-group">
                <label class="form-label">实验类型</label>
                <select class="form-select" id="schItemType">
                    <option value="常规实验">常规实验</option>
                    <option value="细胞实验">细胞实验</option>
                    <option value="动物造模">动物造模</option>
                    <option value="取材/收样">取材 / 收样</option>
                    <option value="会议/汇报">会议 / 汇报</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">实验简要内容</label>
                <textarea class="form-textarea" id="schItemNotes" rows="3" placeholder="记录方案摘要或关键注意事项"></textarea>
            </div>
            
            <button class="btn btn-primary btn-block" style="margin-top:12px;font-size:14px;height:44px;" onclick="schSaveSchedule()">
                <i class="ti ti-device-floppy"></i> 保存日程
            </button>
    `);
}

window.schSaveSchedule = async function() {
    let name = document.getElementById('schItemName').value;
    let time = document.getElementById('schItemTime').value; // YYYY-MM-DDTHH:mm
    let type = document.getElementById('schItemType').value;
    let notes = document.getElementById('schItemNotes').value;

    if (!name || !time) {
        showToast('需填写项目名称和时间', 'error');
        return;
    }

    try {
        let payload = {
            profile: name,
            obs_time: time.replace('T', ' ') + ':00',
            details: `[${type}] ${notes}`
        };
        
        let res = await fetch('/api/schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!res.ok) throw new Error('保存失败');
        
        showToast('新日程已创建同步！');
        uiCloseSheet('schCreateModal');
        
        // 重新拉取日历数据并渲染
        loadHomeData(); 
    } catch(e) {
        showToast(e.message, 'error');
    }
}

window.schDeleteSchedule = async function(id) {
    if(!confirm("确定要删除此待办事项吗？")) return;
    try {
        let res = await fetch(`/api/schedule/${id}`, { method: 'DELETE' });
        if(!res.ok) throw new Error('删除失败');
        showToast('日程已删除');
        loadHomeData();
    } catch(e) {
        showToast(e.message, 'error');
    }
}

// ==========================================
// 细胞档案模块
// ==========================================
async function loadCellDb() {
    try {
        let res = await fetch('/api/cell-db');
        STATE.cellDb = await res.json();
        renderCellProfiles();
        renderCellDbBox();
        if (typeof renderProtocolLibraryHub === 'function') renderProtocolLibraryHub();
    } catch(e) {
        showToast("加载细胞档案失败", "error");
    }
}

// 细胞档案库 — 方案库中的统一卡片视图
function renderCellDbBox() {
    let container = document.getElementById('cellDbBox');
    if (!container) return;

    let keys = Object.keys(STATE.cellDb);
    let existingItems = keys.length === 0
        ? '<div class="empty-state">暂无细胞档案</div>'
        : keys.map(k => {
            let p = (STATE.cellDb[k] && STATE.cellDb[k].params) || {};
            return `
            <div class="list-item" style="padding:8px;margin-top:6px;">
                <div class="list-item-content">
                    <div class="list-item-title" style="font-size:13px;font-weight:600">${k}</div>
                    <div class="list-item-subtitle" style="margin-top:3px">
                        <i class="ti ti-droplet" style="color:var(--accent)"></i> ${p.base_media || '-'} + FBS ${p.fbs || '-'}
                    </div>
                    ${p.others ? `<div class="list-item-subtitle"><i class="ti ti-notes" style="color:var(--text-secondary)"></i> ${p.others}</div>` : ''}
                </div>
                <button class="btn btn-sm btn-danger" onclick="deleteCellProfile('${k}')"><i class=\"ti ti-x\"></i></button>
            </div>
        `}).join('');

    container.innerHTML = `
        <div class="card">
            <div class="card-header"><i class="ti ti-dna-2"></i> 细胞档案库</div>
            <div class="form-group">
                <label class="form-label">细胞名称</label>
                <input class="form-input" id="cdbName" placeholder="VSMC">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">基础培养基</label>
                    <input class="form-input" id="cdbMedia" placeholder="DMEM">
                </div>
                <div class="form-group">
                    <label class="form-label">FBS 浓度</label>
                    <input class="form-input" id="cdbFbs" placeholder="10%">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">其他补充</label>
                <input class="form-input" id="cdbOthers" placeholder="青链霉素 1%">
            </div>
            <button class="btn btn-secondary btn-block" onclick="createCellProfileFromBox()"><i class="ti ti-device-floppy"></i> 保存细胞档案</button>
            <div class="divider"></div>
            ${existingItems}
        </div>
    `;
}

function protocolSafe(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function protocolJsArg(value) {
    return String(value == null ? '' : value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function protocolJsAttr(value) {
    return protocolSafe(protocolJsArg(value));
}

function protocolDetectStepTimerSeconds(text) {
    let match = String(text || '').match(/(\d+(?:\.\d+)?)\s*(小时|h|hr|hrs|hour|hours|分钟|min|mins|minute|minutes)(?![a-z])/i);
    if (!match) return 0;
    let value = parseFloat(match[1]);
    if (!Number.isFinite(value) || value <= 0) return 0;
    let unit = match[2].toLowerCase();
    return Math.round(value * (unit.includes('h') || unit.includes('小时') ? 3600 : 60));
}

function protocolTimerParts(seconds) {
    seconds = labTimerSeconds(seconds);
    let hours = Math.floor(seconds / 3600);
    let minutes = Math.floor((seconds % 3600) / 60);
    let secs = seconds % 60;
    return { hours, minutes, seconds: secs };
}

function protocolTimerHms(seconds) {
    let parts = protocolTimerParts(seconds);
    return [parts.hours, parts.minutes, parts.seconds].map(value => String(value).padStart(2, '0')).join(':');
}

function protocolTimerButtonHtml(seconds) {
    seconds = labTimerSeconds(seconds);
    let label = seconds ? protocolTimerHms(seconds) : '';
    return `<button type="button" class="btn btn-sm btn-secondary protocol-step-icon protocol-step-timer-btn ${seconds ? 'has-timer' : ''}" data-step-timer-button onclick="protocolOpenStepTimer(this)" title="设置倒计时" aria-label="设置倒计时"><i class="ti ti-clock"></i><span data-step-timer-label>${label}</span></button>`;
}

function protocolTimerWheelOptions(max, selected) {
    return Array.from({ length: max + 1 }, (_, value) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${String(value).padStart(2, '0')}</option>`).join('');
}

function protocolStepRow(value = '', index = 0, timerSeconds = 0) {
    timerSeconds = labTimerSeconds(timerSeconds);
    return `<div class="protocol-step-row">
        <div class="protocol-step-number">${String(index + 1).padStart(2, '0')}</div>
        <input type="text" class="form-input protocol-step-input" data-step-input value="${protocolSafe(value)}" placeholder="输入步骤内容">
        <div class="protocol-step-actions">
            <input type="hidden" data-step-timer-seconds value="${timerSeconds}">
            ${protocolTimerButtonHtml(timerSeconds)}
            <button type="button" class="btn btn-sm btn-danger protocol-step-icon" onclick="protocolRemoveStep(this)" title="删除步骤" aria-label="删除步骤"><i class="ti ti-trash"></i></button>
        </div>
    </div>`;
}

function protocolStepEditor(id, steps = [], timers = []) {
    let values = Array.isArray(steps) && steps.length ? steps : [''];
    let rows = values.map((step, index) => protocolStepRow(step, index, (timers || [])[index] || 0)).join('');
    return `<div class="protocol-step-editor" data-step-editor="${protocolSafe(id)}">
        <div class="protocol-step-editor-head">
            <label class="form-label">流程步骤</label>
            <button type="button" class="btn btn-sm btn-secondary" onclick="protocolAddStep('${protocolJsArg(id)}')"><i class="ti ti-plus"></i> 添加步骤</button>
        </div>
        <div class="protocol-step-list">${rows}</div>
    </div>`;
}

function protocolUpdateStepNumbers(editor) {
    if (!editor) return;
    editor.querySelectorAll('.protocol-step-row').forEach((row, index) => {
        let num = row.querySelector('.protocol-step-number');
        if (num) num.textContent = String(index + 1).padStart(2, '0');
        let input = row.querySelector('[data-step-input]');
        if (input) input.placeholder = `步骤 ${index + 1}`;
    });
}

window.protocolAddStep = function(id, value = '') {
    let editor = document.querySelector(`[data-step-editor="${id}"]`);
    let list = editor ? editor.querySelector('.protocol-step-list') : null;
    if (!editor || !list) return;
    let count = list.querySelectorAll('.protocol-step-row').length;
    list.insertAdjacentHTML('beforeend', protocolStepRow(value, count));
    protocolUpdateStepNumbers(editor);
    let inputs = list.querySelectorAll('[data-step-input]');
    if (inputs.length) inputs[inputs.length - 1].focus();
};

function protocolReadTimerWheelSeconds() {
    let hour = parseInt(document.querySelector('[data-protocol-timer-part="hour"]')?.value || '0') || 0;
    let minute = parseInt(document.querySelector('[data-protocol-timer-part="minute"]')?.value || '0') || 0;
    let second = parseInt(document.querySelector('[data-protocol-timer-part="second"]')?.value || '0') || 0;
    return Math.max(0, (hour * 3600) + (minute * 60) + second);
}

function protocolApplyStepTimer(row, seconds) {
    if (!row) return;
    seconds = labTimerSeconds(seconds);
    let hidden = row.querySelector('[data-step-timer-seconds]');
    let button = row.querySelector('[data-step-timer-button]');
    let label = row.querySelector('[data-step-timer-label]');
    if (hidden) hidden.value = String(seconds);
    if (button) button.classList.toggle('has-timer', !!seconds);
    if (button) button.title = seconds ? `倒计时 ${protocolTimerHms(seconds)}` : '设置倒计时';
    if (label) label.textContent = seconds ? protocolTimerHms(seconds) : '';
}

window.protocolUpdateTimerWheelPreview = function() {
    let preview = document.getElementById('protocolTimerWheelPreview');
    if (preview) preview.textContent = protocolTimerHms(protocolReadTimerWheelSeconds());
};

window.protocolOpenStepTimer = function(button) {
    let row = button.closest('.protocol-step-row');
    if (!row) return;
    window._protocolTimerTargetRow = row;
    let savedSeconds = labTimerSeconds(row.querySelector('[data-step-timer-seconds]')?.value || 0);
    let detectedSeconds = protocolDetectStepTimerSeconds(row.querySelector('[data-step-input]')?.value || '');
    let initialSeconds = Math.min(savedSeconds || detectedSeconds, (99 * 3600) + (59 * 60) + 59);
    let parts = protocolTimerParts(initialSeconds);
    uiOpenSheet('protocolTimerWheelModal', '设置倒计时', `
        <div class="protocol-timer-sheet">
            <div class="protocol-timer-preview" id="protocolTimerWheelPreview">${protocolTimerHms(initialSeconds)}</div>
            <div class="protocol-timer-wheel" role="group" aria-label="倒计时时长">
                <label class="protocol-timer-wheel-column"><span>时</span><select size="5" data-protocol-timer-part="hour" onchange="protocolUpdateTimerWheelPreview()">${protocolTimerWheelOptions(99, Math.min(parts.hours, 99))}</select></label>
                <label class="protocol-timer-wheel-column"><span>分</span><select size="5" data-protocol-timer-part="minute" onchange="protocolUpdateTimerWheelPreview()">${protocolTimerWheelOptions(59, parts.minutes)}</select></label>
                <label class="protocol-timer-wheel-column"><span>秒</span><select size="5" data-protocol-timer-part="second" onchange="protocolUpdateTimerWheelPreview()">${protocolTimerWheelOptions(59, parts.seconds)}</select></label>
            </div>
            <div class="protocol-timer-actions">
                <button type="button" class="btn btn-secondary" onclick="protocolClearStepTimer()"><i class="ti ti-clock-x"></i> 清除</button>
                <button type="button" class="btn btn-primary" onclick="protocolSaveStepTimer()"><i class="ti ti-circle-check"></i> 保存</button>
            </div>
        </div>`);
};

window.protocolSaveStepTimer = function() {
    protocolApplyStepTimer(window._protocolTimerTargetRow, protocolReadTimerWheelSeconds());
    window._protocolTimerTargetRow = null;
    uiCloseSheet('protocolTimerWheelModal');
};

window.protocolClearStepTimer = function() {
    protocolApplyStepTimer(window._protocolTimerTargetRow, 0);
    window._protocolTimerTargetRow = null;
    uiCloseSheet('protocolTimerWheelModal');
};

window.protocolRemoveStep = function(button) {
    let row = button.closest('.protocol-step-row');
    let editor = button.closest('[data-step-editor]');
    if (!row || !editor) return;
    let rows = editor.querySelectorAll('.protocol-step-row');
    if (rows.length <= 1) {
        let input = row.querySelector('[data-step-input]');
        if (input) input.value = '';
        protocolApplyStepTimer(row, 0);
        input?.focus();
        return;
    }
    row.remove();
    protocolUpdateStepNumbers(editor);
};

window.protocolReadSteps = function(id) {
    let editor = document.querySelector(`[data-step-editor="${id}"]`);
    if (!editor) return [];
    return Array.from(editor.querySelectorAll('[data-step-input]')).map(input => input.value.trim()).filter(Boolean);
};

window.protocolReadStepTimers = function(id) {
    let editor = document.querySelector(`[data-step-editor="${id}"]`);
    if (!editor) return [];
    return Array.from(editor.querySelectorAll('.protocol-step-row')).map(row => {
        let step = row.querySelector('[data-step-input]')?.value.trim();
        if (!step) return null;
        return labTimerSeconds(row.querySelector('[data-step-timer-seconds]')?.value || 0);
    }).filter(value => value !== null);
};

window.protocolSetSteps = function(id, steps = [], timers = []) {
    let editor = document.querySelector(`[data-step-editor="${id}"]`);
    let list = editor ? editor.querySelector('.protocol-step-list') : null;
    if (!editor || !list) return false;
    let values = Array.isArray(steps) && steps.length ? steps : [''];
    list.innerHTML = values.map((step, index) => protocolStepRow(step, index, (timers || [])[index] || 0)).join('');
    protocolUpdateStepNumbers(editor);
    return true;
};

function protocolWorkflowModuleFromKey(key) {
    return String(key || '').replace(/^wf_/, '');
}

function protocolLibrarySpecs() {
    const pcr = typeof PCR_STATE !== 'undefined' ? PCR_STATE : {};
    const wb = typeof WB_STATE !== 'undefined' ? WB_STATE : { protocols: {} };
    const wf = typeof WORKFLOW_STATE !== 'undefined' ? WORKFLOW_STATE : { protocols: {} };
    return {
        cell: { label: '细胞档案库', icon: 'ti-dna-2', color: '#6f7f76', count: () => Object.keys(STATE.cellDb || {}).length, summary: '培养条件与生长参数', form: protocolCellForm, history: protocolCellHistory },
        drug: { label: '细胞造模方案库', icon: 'ti-pill', color: '#9a7a62', count: () => (STATE.drugProtocols || []).length, summary: '培养体系与诱导组合', form: protocolDrugForm, history: protocolDrugHistory },
        pcr_rna: { label: 'RNA 提取方案库', icon: 'ti-droplet', color: '#6f8a72', count: () => (pcr.rnaProtocols || []).length, summary: 'RNA 提取流程', form: protocolPcrRnaForm, history: protocolPcrRnaHistory },
        pcr_rt: { label: '逆转录方案库', icon: 'ti-arrows-right-left', color: '#7e7791', count: () => (pcr.rtProtocols || []).length, summary: '逆转录体系与步骤', form: protocolPcrRtForm, history: protocolPcrRtHistory },
        pcr_qpcr: { label: 'qPCR 体系方案库', icon: 'ti-chart-line', color: '#936b78', count: () => (pcr.qpcrProtocols || []).length, summary: '荧光定量反应体系', form: protocolPcrQpcrForm, history: protocolPcrQpcrHistory },
        wb_extract: { label: 'WB 提取配平方案库', icon: 'ti-droplet-half-2', color: '#6c8391', count: () => ((wb.protocols || {}).extract || []).length, summary: '裂解、BCA 与配平参数', form: protocolWbExtractForm, history: protocolWbExtractHistory },
        wb_electro: { label: 'WB 跑胶转膜方案库', icon: 'ti-layers-subtract', color: '#777c95', count: () => ((wb.protocols || {}).electrophoresis || []).length, summary: '电泳、制胶与转膜步骤', form: protocolWbElectroForm, history: protocolWbElectroHistory },
        wb_detection: { label: 'WB 检测流程方案库', icon: 'ti-list-check', color: '#937079', count: () => ((wb.protocols || {}).detectionWorkflows || []).length, summary: '封闭、孵育、洗膜与显影', form: protocolWbDetectionForm, history: protocolWbDetectionHistory },
        wb_marker: { label: 'WB Marker 方案库', icon: 'ti-ruler-2', color: '#708496', count: () => ((wb.protocols || {}).markerSchemes || []).length, summary: 'Marker 条带与分子量', form: protocolWbMarkerForm, history: protocolWbMarkerHistory },
        wf_animal: { label: '动物造模方案库', icon: 'ti-vaccine', color: '#8f765f', count: () => ((wf.protocols || {}).animal || []).length, summary: '动物诱导与取材流程', form: () => protocolWorkflowForm('animal'), history: () => protocolWorkflowHistory('animal') },
        wf_if: { label: '免疫荧光方案库', icon: 'ti-microscope', color: '#817993', count: () => ((wf.protocols || {}).if || []).length, summary: '固定、封闭与染色流程', form: () => protocolWorkflowForm('if'), history: () => protocolWorkflowHistory('if') },
        wf_bioinfo: { label: '生信分析方案库', icon: 'ti-chart-dots-3', color: '#6d8494', count: () => ((wf.protocols || {}).bioinfo || []).length, summary: '数据处理与分析流程', form: () => protocolWorkflowForm('bioinfo'), history: () => protocolWorkflowHistory('bioinfo') },
        wf_other: { label: '其他实验方案库', icon: 'ti-tool', color: '#75857c', count: () => ((wf.protocols || {}).other || []).length, summary: '通用实验流程', form: () => protocolWorkflowForm('other'), history: () => protocolWorkflowHistory('other') },
        mw: { label: '常用试剂档案库', icon: 'ti-flask', color: '#817e93', count: () => (STATE.mwLibrary || []).length, summary: '摩尔质量档案', form: protocolMwForm, history: protocolMwHistory }
    };
}

function protocolResetEditingFor(key) {
    if (key === 'cell') {}
    if (key === 'drug') { window._currentEditingDrugProtoId = null; _protoDrugs = []; }
    if (key === 'pcr_rna') window._currentEditingRnaProtoId = null;
    if (key === 'pcr_rt') window._currentEditingRtProtoId = null;
    if (key === 'pcr_qpcr') window._currentEditingQpcrProtoId = null;
    if (key === 'wb_extract') window._editingWbPExId = null;
    if (key === 'wb_electro') window._editingWbPElId = null;
    if (key === 'wb_detection') window._editingWbDWorkflowId = null;
    if (key === 'wb_marker') { window._editingWbMarkerId = null; window._wbMarkerBandDraft = []; }
    if (String(key).startsWith('wf_')) { window._editingWorkflowProtocolId = null; window._editingWorkflowModule = null; }
}

window.protocolOpenLibrary = function(key) {
    window._protocolLibraryActive = key;
    window._protocolLibraryCreating = false;
    window._protocolLibraryMotion = 'enter';
    renderProtocolLibraryHub();
};

window.protocolStartCreate = function(key) {
    if (key) window._protocolLibraryActive = key;
    protocolResetEditingFor(window._protocolLibraryActive);
    window._protocolLibraryCreating = true;
    window._protocolLibraryMotion = '';
    renderProtocolLibraryHub();
};

window.protocolCancelForm = function() {
    protocolCloseCreateForm(() => {
        protocolResetEditingFor(window._protocolLibraryActive);
        window._protocolLibraryCreating = false;
        renderProtocolLibraryHub();
    });
};

window.protocolBackToHub = function() {
    window._protocolLibraryActive = '';
    window._protocolLibraryCreating = false;
    window._protocolLibraryMotion = 'back';
    renderProtocolLibraryHub();
};

window.protocolFinishSave = function() {
    return protocolCloseCreateForm(() => {
        window._protocolLibraryCreating = false;
        renderProtocolLibraryHub();
    });
};

function protocolCloseCreateForm(afterClose) {
    let panel = document.querySelector('#protocolLibraryView .protocol-form-panel');
    if (!panel) {
        afterClose();
        return Promise.resolve();
    }
    panel.style.setProperty('--protocol-close-height', `${panel.scrollHeight}px`);
    panel.classList.remove('form-drop-enter');
    panel.classList.add('form-drop-exit');
    return new Promise(resolve => setTimeout(() => {
        afterClose();
        resolve();
    }, 130));
}

function protocolEntry(key, spec) {
    return `<button class="protocol-library-entry" onclick="protocolOpenLibrary('${key}')">
        <span class="protocol-library-icon" style="color:${spec.color};border-color:${spec.color}33;background:${spec.color}12"><i class="ti ${spec.icon}"></i></span>
        <span class="protocol-library-main"><b>${spec.label}</b><small>${spec.summary}</small></span>
        <span class="protocol-library-count">${spec.count()} 条</span>
        <i class="ti ti-chevron-right protocol-library-chevron"></i>
    </button>`;
}

window.renderProtocolLibraryHub = function() {
    let container = document.getElementById('protocolLibraryView');
    if (!container) return;
    let specs = protocolLibrarySpecs();
    let active = window._protocolLibraryActive || '';
    if (!active || !specs[active]) {
        window._protocolLibraryActive = '';
        let keys = Object.keys(specs);
        let motion = window._protocolLibraryMotion === 'back' ? ' protocol-view-back' : '';
        container.innerHTML = `<div class="protocol-library-list${motion}">${keys.map(key => protocolEntry(key, specs[key])).join('')}</div>`;
        window._protocolLibraryMotion = '';
        return;
    }
    let spec = specs[active];
    let motion = window._protocolLibraryMotion === 'enter' ? ' protocol-view-enter' : '';
    let formHtml = window._protocolLibraryCreating ? `<div class="protocol-form-panel form-drop-enter">${spec.form()}</div>` : '';
    container.innerHTML = `<div class="protocol-subpage${motion}">
        <button class="protocol-subpage-back" onclick="protocolBackToHub()"><i class="ti ti-chevron-left"></i> 方案库</button>
        <div class="protocol-subpage-head">
            <div class="protocol-subpage-title"><span style="color:${spec.color};border-color:${spec.color}33;background:${spec.color}12"><i class="ti ${spec.icon}"></i></span><div><b>${spec.label}</b><small>${spec.summary}</small></div></div>
            ${window._protocolLibraryCreating ? '' : `<button class="btn btn-primary" onclick="protocolStartCreate('${active}')"><i class="ti ti-plus"></i> 新建方案</button>`}
        </div>
        ${formHtml}
        <div class="section-title"><i class="ti ti-history"></i> 历史记录</div>
        <div class="protocol-history-list">${spec.history()}</div>
    </div>`;
    window._protocolLibraryMotion = '';
    if (active === 'drug' && window._protocolLibraryCreating) _renderProtoDrugRows();
};

function protocolListItem(title, subtitle, actions = '') {
    return `<div class="list-item protocol-history-item"><div class="list-item-content"><div class="list-item-title">${title}</div>${subtitle ? `<div class="list-item-subtitle">${subtitle}</div>` : ''}</div><div class="list-item-actions">${actions}</div></div>`;
}

window.protocolFormShell = function(title, icon, bodyHtml, primaryActionHtml) {
    return `<div class="card inline-form-panel protocol-form-card">
        <div class="inline-form-head"><b><i class="ti ${icon || 'ti-plus'}"></i> ${title}</b><button class="btn btn-sm btn-secondary" onclick="protocolCancelForm()" title="关闭"><i class="ti ti-x"></i></button></div>
        ${bodyHtml}
        ${primaryActionHtml ? `<div class="protocol-form-actions">${primaryActionHtml}</div>` : ''}
    </div>`;
};

function protocolCellForm() {
    return protocolFormShell('新建细胞档案', 'ti-plus', `
        <div class="form-group"><label class="form-label">细胞名称</label><input class="form-input" id="cdbName" placeholder="VSMC"></div>
        <div class="form-row"><div class="form-group"><label class="form-label">基础培养基</label><input class="form-input" id="cdbMedia" placeholder="DMEM"></div><div class="form-group"><label class="form-label">FBS 浓度</label><input class="form-input" id="cdbFbs" placeholder="10%"></div></div>
        <div class="form-group"><label class="form-label">其他补充</label><input class="form-input" id="cdbOthers" placeholder="青链霉素 1%"></div>
    `, `<button class="btn btn-primary" onclick="createCellProfileFromBox()"><i class="ti ti-device-floppy"></i> 保存细胞档案</button>`);
}

function protocolCellHistory() {
    let keys = Object.keys(STATE.cellDb || {});
    if (!keys.length) return '<div class="empty-state">暂无细胞档案</div>';
    return keys.map(k => {
        let p = (STATE.cellDb[k] && STATE.cellDb[k].params) || {};
        let sub = `${p.base_media || '-'} + FBS ${p.fbs || '-'}${p.others ? ' · ' + p.others : ''}`;
        return protocolListItem(protocolSafe(k), protocolSafe(sub), `<button class="btn btn-sm btn-danger" onclick="deleteCellProfile('${protocolJsArg(k)}')"><i class="ti ti-x"></i></button>`);
    }).join('');
}

function protocolDrugForm() {
    return protocolFormShell('新建造模方案', 'ti-plus', `
        <div class="form-group"><label class="form-label">方案名称</label><input class="form-input" id="pName" placeholder="TGF-beta 造模"></div>
        <div class="form-row"><div class="form-group"><label class="form-label">基础培养基</label><input class="form-input" id="pBaseMedia" placeholder="DMEM" value="DMEM"></div><div class="form-group"><label class="form-label">FBS 浓度</label><input class="form-input" id="pFbsConc" placeholder="10%" value="10%"></div></div>
        <div class="section-subtitle" style="font-weight:700;margin-bottom:6px;">额外加药</div><div id="protoDrugRows"><div style="font-size:12px;color:#999;padding:4px 0;">（无额外加药）</div></div>
        <button class="btn btn-sm btn-secondary" style="margin-bottom:10px" onclick="_addProtoDrug()"><i class="ti ti-plus"></i> 添加药物</button>
        <div class="form-group"><label class="form-label">备注</label><input class="form-input" id="pNote"></div>
    `, `<button class="btn btn-primary" onclick="addProtocol()"><i class="ti ti-device-floppy"></i> 保存造模方案</button>`);
}

function protocolDrugHistory() {
    let list = STATE.drugProtocols || [];
    if (!list.length) return '<div class="empty-state">暂无方案</div>';
    return list.map(p => {
        let drugsInfo = (p.drugs && p.drugs.length) ? p.drugs.map(d => `${d.drug_name} ${d.work_conc}${d.work_unit}`).join(' + ') : '无额外加药';
        return protocolListItem(protocolSafe(p.name), `${protocolSafe(p.base_media || 'DMEM')} + FBS ${protocolSafe(p.fbs_conc || '10%')} · ${protocolSafe(drugsInfo)}`, `<button class="btn btn-sm btn-secondary" onclick="protocolStartCreate('drug');editProtocol('${p.id}')"><i class="ti ti-pencil"></i></button><button class="btn btn-sm btn-danger" onclick="deleteProtocol('${p.id}')"><i class="ti ti-x"></i></button>`);
    }).join('');
}

function protocolPcrRnaForm() {
    return protocolFormShell('新建 RNA 提取方案', 'ti-plus', `<div class="form-group"><label class="form-label">方案名称</label><input class="form-input" id="rnaPName" placeholder="Trizol"></div>${protocolStepEditor('rnaPSteps')}`, `<button class="btn btn-primary" onclick="saveRnaProtocol()"><i class="ti ti-device-floppy"></i> 保存 RNA 方案</button>`);
}

function protocolPcrRnaHistory() {
    let list = (typeof PCR_STATE !== 'undefined' ? PCR_STATE.rnaProtocols : []) || [];
    if (!list.length) return '<div class="empty-state">暂无 RNA 提取方案</div>';
    return list.map(p => protocolListItem(protocolSafe(p.name), `${(p.steps || []).length} 个流程步骤`, `<button class="btn btn-sm btn-secondary" onclick="protocolStartCreate('pcr_rna');editRnaP('${p.id}')"><i class="ti ti-pencil"></i></button><button class="btn btn-sm btn-danger" onclick="deletePcrItem('rna','protocols','${p.id}', event)"><i class="ti ti-x"></i></button>`)).join('');
}

function protocolPcrRtForm() {
    return protocolFormShell('新建逆转录方案', 'ti-plus', `<div class="form-group"><label class="form-label">方案名称</label><input class="form-input" id="rtPName" placeholder="诺唯赞 RT Kit"></div>${protocolStepEditor('rtPSteps')}<div class="form-row"><div class="form-group"><label class="form-label">总量(μL)</label><input type="number" id="rtPTotal" class="form-input" value="20"></div><div class="form-group"><label class="form-label">酶用量(μL)</label><input type="number" id="rtPEnz" class="form-input" value="4"></div><div class="form-group"><label class="form-label">总RNA(ng)</label><input type="number" id="rtPRna" class="form-input" value="1000"></div></div>`, `<button class="btn btn-primary" onclick="saveRtProtocol()"><i class="ti ti-device-floppy"></i> 保存 RT 方案</button>`);
}

function protocolPcrRtHistory() {
    let list = (typeof PCR_STATE !== 'undefined' ? PCR_STATE.rtProtocols : []) || [];
    if (!list.length) return '<div class="empty-state">暂无逆转录方案</div>';
    return list.map(p => protocolListItem(protocolSafe(p.name), `${p.total_vol || 20}μL · 酶 ${p.enzyme_vol || 4}μL · ${(p.steps || []).length} 步`, `<button class="btn btn-sm btn-secondary" onclick="protocolStartCreate('pcr_rt');editRtP('${p.id}')"><i class="ti ti-pencil"></i></button><button class="btn btn-sm btn-danger" onclick="deletePcrItem('rt','protocols','${p.id}', event)"><i class="ti ti-x"></i></button>`)).join('');
}

function protocolPcrQpcrForm() {
    return protocolFormShell('新建 qPCR 体系', 'ti-plus', `<div class="form-group"><label class="form-label">体系名称</label><input class="form-input" id="qPName" placeholder="10ul SYBR"></div>${protocolStepEditor('qPSteps')}<div class="form-row"><div class="form-group"><label class="form-label">单孔总量(μL)</label><input type="number" id="qPTotal" value="10" class="form-input"></div><div class="form-group"><label class="form-label">SYBR/Mix(μL)</label><input type="number" id="qPSybr" value="5" class="form-input"></div></div><div class="form-row"><div class="form-group"><label class="form-label">引物(μL)</label><input type="number" id="qPPrimer" value="1" class="form-input"></div><div class="form-group"><label class="form-label">cDNA(μL)</label><input type="number" id="qPCdna" value="1" class="form-input"></div></div>`, `<button class="btn btn-primary" onclick="saveQpcrProtocol()"><i class="ti ti-device-floppy"></i> 保存 qPCR 体系</button>`);
}

function protocolPcrQpcrHistory() {
    let list = (typeof PCR_STATE !== 'undefined' ? PCR_STATE.qpcrProtocols : []) || [];
    if (!list.length) return '<div class="empty-state">暂无 qPCR 体系方案</div>';
    return list.map(p => protocolListItem(protocolSafe(p.name), `${p.well_vol || '-'}μL体系 · 水:${(p.well_vol || 0) - (p.sybr_vol || 0) - (p.primer_vol || 0) - (p.cdna_vol || 0)}μL · ${(p.steps || []).length} 步`, `<button class="btn btn-sm btn-secondary" onclick="protocolStartCreate('pcr_qpcr');editQpcrP('${p.id}')"><i class="ti ti-pencil"></i></button><button class="btn btn-sm btn-danger" onclick="deletePcrItem('qpcr','protocols','${p.id}',event)"><i class="ti ti-x"></i></button>`)).join('');
}

function protocolWbExtractForm() {
    return protocolFormShell('新建 WB 提取配平方案', 'ti-plus', `<div class="form-group"><label class="form-label">方案名称</label><input class="form-input" id="wbPExName" placeholder="RIPA + 5x Loading"></div>${protocolStepEditor('wbPExSteps')}<div class="form-group"><label class="form-label">Loading Buffer设定</label><select class="form-select" id="wbPExLb"><option value="4">4x</option><option value="5" selected>5x</option><option value="6">6x</option></select></div>`, `<button class="btn btn-primary" onclick="saveWbPEx()"><i class="ti ti-device-floppy"></i> 保存方案</button>`);
}

function protocolWbExtractHistory() {
    let list = (typeof WB_STATE !== 'undefined' ? WB_STATE.protocols.extract : []) || [];
    if (!list.length) return '<div class="empty-state">暂无 WB 提取配平方案</div>';
    return list.map(p => protocolListItem(protocolSafe(p.name), `Loading Buffer ${p.lb_factor || 5}x · ${(p.steps || []).length} 步`, `<button class="btn btn-sm btn-secondary" onclick="protocolStartCreate('wb_extract');editWbPEx('${p.id}')"><i class="ti ti-pencil"></i></button><button class="btn btn-sm btn-danger" onclick="deleteWbItem('extract','protocols','${p.id}',event)"><i class="ti ti-x"></i></button>`)).join('');
}

function protocolWbElectroForm() {
    return protocolFormShell('新建跑胶转膜方案', 'ti-plus', `<div class="form-group"><label class="form-label">方案名称</label><input class="form-input" id="wbPElName" placeholder="10% 预制胶 + 湿转"></div>${protocolStepEditor('wbPElSteps')}`, `<button class="btn btn-primary" onclick="saveWbPEl()"><i class="ti ti-device-floppy"></i> 保存方案</button>`);
}

function protocolWbElectroHistory() {
    let list = (typeof WB_STATE !== 'undefined' ? WB_STATE.protocols.electrophoresis : []) || [];
    if (!list.length) return '<div class="empty-state">暂无 WB 跑胶转膜方案</div>';
    return list.map(p => protocolListItem(protocolSafe(p.name), `${(p.steps || []).length} 个流程步骤`, `<button class="btn btn-sm btn-secondary" onclick="protocolStartCreate('wb_electro');editWbPEl('${p.id}')"><i class="ti ti-pencil"></i></button><button class="btn btn-sm btn-danger" onclick="deleteWbItem('electrophoresis','protocols','${p.id}',event)"><i class="ti ti-x"></i></button>`)).join('');
}

function protocolWbDetectionForm() {
    return protocolFormShell('新建 WB 检测流程', 'ti-plus', `<div class="form-group"><label class="form-label">方案名称</label><input class="form-input" id="wbDWfName" placeholder="常规 ECL 洗膜流程"></div>${protocolStepEditor('wbDWfSteps')}`, `<button class="btn btn-primary" onclick="saveWbDWorkflow()"><i class="ti ti-device-floppy"></i> 保存流程</button>`);
}

function protocolWbDetectionHistory() {
    let list = (typeof WB_STATE !== 'undefined' ? WB_STATE.protocols.detectionWorkflows : []) || [];
    if (!list.length) return '<div class="empty-state">暂无 WB 检测流程方案</div>';
    return list.map(p => protocolListItem(protocolSafe(p.name), `${(p.steps || []).length} 个流程步骤`, `<button class="btn btn-sm btn-secondary" onclick="protocolStartCreate('wb_detection');editWbDWorkflow('${p.id}')"><i class="ti ti-pencil"></i></button><button class="btn btn-sm btn-danger" onclick="deleteWbItem('detection','protocols','${p.id}',event)"><i class="ti ti-x"></i></button>`)).join('');
}

function protocolWbMarkerForm() {
    return typeof wbMarkerSchemeForm === 'function' ? wbMarkerSchemeForm() : '<div class="empty-state">Marker 编辑器未加载</div>';
}

function protocolWbMarkerHistory() {
    let list = (typeof WB_STATE !== 'undefined' ? WB_STATE.protocols.markerSchemes : []) || [];
    if (!list.length) return '<div class="empty-state">暂无 Marker 方案</div>';
    return list.map(p => protocolListItem(protocolSafe(p.name), (p.bands || []).map(b => `${b.mw}kDa`).join(' / ') || '未设置条带', `<button class="btn btn-sm btn-secondary" onclick="protocolStartCreate('wb_marker');editWbMarkerScheme('${p.id}')"><i class="ti ti-pencil"></i></button><button class="btn btn-sm btn-danger" onclick="deleteWbItem('detection','protocols','${p.id}',event)"><i class="ti ti-x"></i></button>`)).join('');
}

function protocolWorkflowForm(module) {
    let meta = (typeof WORKFLOW_META !== 'undefined' ? WORKFLOW_META[module] : null) || { label: module };
    return protocolFormShell(`新建${meta.label}方案`, 'ti-plus', `<div class="form-row"><div class="form-group"><label class="form-label">模块类型</label><select class="form-select" id="wfProtoModule"><option value="${module}">${meta.label}</option></select></div><div class="form-group"><label class="form-label">方案名称</label><input class="form-input" id="wfProtoName" placeholder="${meta.label}流程"></div></div>${protocolStepEditor('wfProtoSteps')}<div class="form-group"><label class="form-label">备注</label><input class="form-input" id="wfProtoNote"></div>`, `<button class="btn btn-primary" onclick="saveWorkflowProtocol()"><i class="ti ti-device-floppy"></i> 保存方案</button>`);
}

function protocolWorkflowHistory(module) {
    let list = (typeof WORKFLOW_STATE !== 'undefined' ? WORKFLOW_STATE.protocols[module] : []) || [];
    if (!list.length) return '<div class="empty-state">暂无方案</div>';
    let key = `wf_${module}`;
    return list.map(p => protocolListItem(protocolSafe(p.name), `${(p.steps || []).length} 个步骤${p.note ? ' · ' + protocolSafe(p.note) : ''}`, `<button class="btn btn-sm btn-secondary" onclick="protocolStartCreate('${key}');editWorkflowProtocol('${module}','${p.id}')"><i class="ti ti-pencil"></i></button><button class="btn btn-sm btn-danger" onclick="deleteWorkflowProtocol('${module}','${p.id}')"><i class="ti ti-x"></i></button>`)).join('');
}

function protocolMwForm() {
    return protocolFormShell('新建常用试剂档案', 'ti-plus', `<div class="form-row"><div class="form-group" style="flex:2;"><label class="form-label">化学试剂名称</label><input class="form-input" id="mwNameIn" placeholder="NaCl, DMSO"></div><div class="form-group"><label class="form-label">摩尔质量(g/mol)</label><input type="number" class="form-input" id="mwValueIn" placeholder="数值"></div></div>`, `<button class="btn btn-primary" onclick="addMw()"><i class="ti ti-device-floppy"></i> 保存试剂档案</button>`);
}

function protocolMwHistory() {
    let list = STATE.mwLibrary || [];
    if (!list.length) return '<div class="empty-state">暂无登记试剂</div>';
    return list.map(m => protocolListItem(protocolSafe(m.name), `摩尔质量: ${protocolSafe(m.mw)} g/mol`, `<button class="btn btn-sm btn-danger" onclick="deleteMw('${m.id}')"><i class="ti ti-x"></i></button>`)).join('');
}

async function createCellProfileFromBox() {
    let name = document.getElementById('cdbName').value.trim();
    let media = document.getElementById('cdbMedia').value.trim();
    let fbs = document.getElementById('cdbFbs').value.trim();
    let others = document.getElementById('cdbOthers').value.trim();

    if (!name || !media || !fbs) {
        showToast("需填写名称、培养基和血清", "error");
        return;
    }
    try {
        let res = await fetch('/api/cell-db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, base_media: media, fbs, others })
        });
        if (!res.ok) {
            let err = await res.json();
            throw new Error(err.error || err.detail || "创建失败");
        }
        if (typeof protocolFinishSave === 'function') await protocolFinishSave();
        showToast("创建成功");
        await loadCellDb(); // 同时刷新传代模块下拉和方案库卡片
    } catch(e) {
        showToast(e.message, "error");
    }
}

function renderCellProfiles() {
    let sel = document.getElementById('cellProfileSelect');
    if (!sel) return;
    sel.innerHTML = '';
    
    let keys = Object.keys(STATE.cellDb);
    if(keys.length === 0) {
        sel.innerHTML = '<option value="">(无档案)</option>';
    } else {
        keys.forEach(k => {
            sel.innerHTML += `<option value="${k}">${k}</option>`;
        });
    }
    
    onCellProfileChanged();
}

async function deleteCellProfile(k) {
    if(!confirm(`确定删除档案 ${k}？`)) return;
    try {
        await fetch(`/api/cell-db/${k}`, {method:'DELETE'});
        showToast("删除成功");
        await loadCellDb(); // 同步刷新传代模块和方案库两处
    } catch(e) {
        showToast("删除失败", "error");
    }
}

function onCellProfileChanged() {
    let sel = document.getElementById('cellProfileSelect');
    if (!sel) return;
    STATE.activeCellProfile = sel.value;
    renderCpCalc();
    renderCpCalibrate();
    renderCpHistory();
}

// 传代计算器界面
function renderCpCalc() {
    let container = document.getElementById('cpCalc');
    if (!container) return;
    if(!STATE.activeCellProfile) {
        container.innerHTML = '<div class="empty-state">需选择细胞档案</div>';
        return;
    }
    
    let r = STATE.cellDb[STATE.activeCellProfile].r;
    let p = STATE.cellDb[STATE.activeCellProfile].params || {};
    let note = p.others || '';
    
    let vesselOptions = Object.keys(CONFIG.area_map).map(k => `<option value="${k}">${k}</option>`).join('');
    
    let html = `
        <div style="font-size:13px;margin-bottom:12px;color:#666;">
            <div>模型生长系数 r ≈ ${r.toFixed(4)}</div>
            ${note ? `<div style="margin-top:4px;"><i class="ti ti-notes" style="color:var(--text-secondary)"></i> 附加信息：${note}</div>` : ''}
        </div>
        <div class="card">
            <div class="card-header"><i class="ti ti-cell"></i> 传前状态（源容器）</div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">容器类型</label>
                    <select class="form-select" id="calcSrcVessel">${vesselOptions}</select>
                </div>
                <div class="form-group">
                    <label class="form-label">容器数量</label>
                    <input type="number" class="form-input" id="calcSrcCount" value="1" min="1">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">当前密度 (%)</label>
                <input type="number" class="form-input" id="calcSrcDen" value="90">
            </div>
        </div>
        <div class="card">
            <div class="card-header"><i class="ti ti-target"></i> 目标期望（目标容器）</div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">容器类型</label>
                    <select class="form-select" id="calcTgtVessel">${vesselOptions}</select>
                </div>
                <div class="form-group">
                    <label class="form-label">容器数量</label>
                    <input type="number" class="form-input" id="calcTgtCount" value="1" min="1">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">生长时间 (h)</label>
                    <input type="number" class="form-input" id="calcTgtTime" value="24" oninput="updateExpectedTime()">
                    <div id="calcTgtTimePreview" style="font-size:11px;color:var(--accent);margin-top:4px;font-weight:600;"></div>
                </div>
                <div class="form-group">
                    <label class="form-label">期望密度 (%)</label>
                    <input type="number" class="form-input" id="calcTgtDen" value="85">
                </div>
            </div>
        </div>
        <button class="btn btn-primary btn-block" onclick="doPassageCalc()"><i class="ti ti-calculator"></i> 计算传代方案</button>
        <div id="calcResult" style="margin-top:16px;"></div>
        
        <div class="divider" style="margin-top:24px;"></div>
        <div class="section-title"><i class="ti ti-history"></i> 传代记录</div>
        <div id="cpHistory"></div>
    `;
    container.innerHTML = html;
    setTimeout(updateExpectedTime, 50);
    if (typeof renderCpHistory === 'function') setTimeout(renderCpHistory, 50);
}

window.updateExpectedTime = function() {
    let input = document.getElementById('calcTgtTime');
    let preview = document.getElementById('calcTgtTimePreview');
    if(!input || !preview) return;
    let h = parseFloat(input.value) || 0;
    let td = new Date(Date.now() + h * 3600000);
    let today = new Date();
    let tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
    let ds = '周' + ['日','一','二','三','四','五','六'][td.getDay()];
    if (td.toDateString() === today.toDateString()) ds = "今日";
    else if (td.toDateString() === tomorrow.toDateString()) ds = "明日";
    let hh = String(td.getHours()).padStart(2, '0');
    let mm = String(td.getMinutes()).padStart(2, '0');
    preview.innerText = `预计到达：${ds} ${hh}:${mm}`;
}

async function doPassageCalc() {
    let srcCountEl = document.getElementById('calcSrcCount');
    let tgtCountEl = document.getElementById('calcTgtCount');
    let payload = {
        profile: STATE.activeCellProfile,
        src_vessel: document.getElementById('calcSrcVessel').value,
        src_count: srcCountEl ? parseInt(srcCountEl.value) || 1 : 1,
        src_density: parseFloat(document.getElementById('calcSrcDen').value),
        tgt_vessel: document.getElementById('calcTgtVessel').value,
        tgt_count: tgtCountEl ? parseInt(tgtCountEl.value) || 1 : 1,
        tgt_time: parseFloat(document.getElementById('calcTgtTime').value),
        tgt_density: parseFloat(document.getElementById('calcTgtDen').value)
    };
    
    try {
        let res = await fetch('/api/passage/calculate', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify(payload)
        });
        if(!res.ok) throw new Error("计算失败");
        let data = await res.json();
        
        // 将结果暂存，供确认时使用
        window._currentPassagePlan = Object.assign({}, payload, data);
        
        let ratioPct = (data.passage_ratio * 100).toFixed(1);
        let srcCount = payload.src_count;
        let tgtCount = payload.tgt_count;
        
        // 比例超过 100% 时标记容量不足
        let ratioWarning = data.passage_ratio > 1.0
            ? `<div style="color:var(--danger);font-size:12px;margin-top:4px"><i class="ti ti-alert-triangle"></i> 传代比例异常：源容器细胞总数不足以满足期望接种量。</div>` : '';
        
        let resHtml = `
            <div class="card" style="border-color:var(--accent)">
                <div style="font-weight:700;margin-bottom:10px">计算结果</div>
                
                <div class="passage-result-grid">
                    <div class="passage-result-item">
                        <div class="passage-result-label">每个目标容器接种密度</div>
                        <div class="passage-result-value">${data.required_N0.toFixed(1)}<span class="passage-result-unit">%</span></div>
                    </div>
                    <div class="passage-result-item accent">
                        <div class="passage-result-label">传代比例 (共用)</div>
                        <div class="passage-result-value">${ratioPct}<span class="passage-result-unit">%</span></div>
                    </div>
                </div>
                
                ${ratioWarning}

                <div style="background:var(--surface-hover);border-radius:8px;padding:10px 12px;margin:10px 0;font-size:13px;line-height:1.9;">
                    <i class="ti ti-chart-bar" style="color:var(--primary)"></i> <b>${srcCount}</b> 个 ${payload.src_vessel}  →  <b>${tgtCount}</b> 个 ${payload.tgt_vessel}<br>
                    每个源容器提供 <b>${(data.passage_ratio / srcCount * tgtCount * 100 / tgtCount).toFixed(1)}%</b> 细胞体积至每个目标容器<br>
                    <span style="color:#888">预计暂存时间：${data.obs_time}</span>
                </div>
                
                <div class="form-group">
                    <input type="text" class="form-input" id="calcNote" placeholder="传代备注：第15代">
                </div>
                <button class="btn btn-secondary btn-block" onclick="confirmPassage()"><i class="ti ti-circle-check"></i> 确认并记录</button>
            </div>
        `;
        document.getElementById('calcResult').innerHTML = resHtml;
        
    } catch(e) {
        showToast(e.message, "error");
    }
}

async function confirmPassage() {
    let p = window._currentPassagePlan;
    p.note = document.getElementById('calcNote').value;
    
    try {
        let res = await fetch('/api/passage/confirm', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify(p)
        });
        if(!res.ok) throw new Error("保存失败");
        showToast("传代记录已保存");
        document.getElementById('calcResult').innerHTML = '';
        renderCpHistory();
    } catch(e) {
        showToast(e.message, "error");
    }
}

// ------------------------------------------
// 数据校准界面
// ------------------------------------------
function renderCpCalibrate() {
    let container = document.getElementById('cpCalibrate');
    if (!container) return;
    if(!STATE.activeCellProfile) {
        container.innerHTML = '<div class="empty-state">需选择细胞档案</div>';
        return;
    }

    let profile = STATE.cellDb[STATE.activeCellProfile];
    let r = profile.r;
    let data = profile.data || [];
    let vesselOptions = Object.keys(CONFIG.area_map).map(k => `<option value="${k}">${k}</option>`).join('');
    
    // Build observation data table
    let tableHtml = '';
    if (data.length === 0) {
        tableHtml = '<div style="color:#888;font-size:13px;text-align:center;padding:16px;">暂无观测数据</div>';
    } else {
        tableHtml = `
        <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
        <table class="cal-data-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th>接种密度(N0%)</th>
                    <th>时间(h)</th>
                    <th>末密度(Nt%)</th>
                    <th>时间戳</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody id="calDataTbody">
        `;
        data.forEach((row, i) => {
            tableHtml += `
                <tr id="calRow_${i}">
                    <td style="color:#888;font-size:12px">${i+1}</td>
                    <td><input type="number" class="cal-cell-input" value="${Number(row.N0).toFixed(2)}" onchange="updateCalRow(${i},'N0',this.value)"></td>
                    <td><input type="number" class="cal-cell-input" value="${Number(row.t).toFixed(1)}" onchange="updateCalRow(${i},'t',this.value)"></td>
                    <td><input type="number" class="cal-cell-input" value="${Number(row.Nt).toFixed(2)}" onchange="updateCalRow(${i},'Nt',this.value)"></td>
                    <td style="font-size:11px;color:#888;white-space:nowrap">${row.timestamp || ''}</td>
                    <td><button class="btn btn-sm btn-danger" onclick="deleteCalRow(${i})"><i class=\"ti ti-x\"></i></button></td>
                </tr>
            `;
        });
        tableHtml += `</tbody></table></div>`;
    }

    let html = `
        <div style="font-size:13px;margin-bottom:8px;color:#666;">填入真实的传代结果，让数学模型持续优化 r 值。</div>
        <div style="font-size:13px;margin-bottom:12px;">当前 r 值：<b style="color:var(--accent)">${r.toFixed(4)}</b></div>
        
        <div class="card">
            <div class="card-header"><i class="ti ti-edit"></i> 录入新观测数据</div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">传代前容器</label>
                    <select class="form-select" id="calSrcVess">${vesselOptions}</select>
                </div>
                <div class="form-group">
                    <label class="form-label">传前密度 (%)</label>
                    <input type="number" class="form-input" id="calSrcDen" value="90">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">传代后容器</label>
                    <select class="form-select" id="calTgtVess">${vesselOptions}</select>
                </div>
                <div class="form-group">
                    <label class="form-label">实际比例 (%)</label>
                    <input type="number" class="form-input" id="calRatio" value="33.3">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">生长时间 (h)</label>
                    <input type="number" class="form-input" id="calTime" value="24">
                </div>
                <div class="form-group">
                    <label class="form-label">最终密度 (%)</label>
                    <input type="number" class="form-input" id="calFinalDen" value="80">
                </div>
            </div>
            <button class="btn btn-primary btn-block" onclick="doCalibrate()"><i class="ti ti-device-floppy"></i> 保存并校准模型</button>
        </div>

        <div class="card" style="margin-top:4px">
            <div class="card-header" style="justify-content:space-between">
                <span><i class="ti ti-table"></i> 所有观测数据（共 ${data.length} 条）</span>
                ${data.length > 0 ? `<button class="btn btn-sm btn-secondary" onclick="saveCalEdits()"><i class="ti ti-circle-check"></i> 保存修改</button>` : ''}
            </div>
            ${tableHtml}
        </div>
    `;
    container.innerHTML = html;
}

// 更新表格中某行的字段值（仅更新内存，需调用saveCalEdits保存）
function updateCalRow(i, field, val) {
    let data = STATE.cellDb[STATE.activeCellProfile].data;
    if (data[i]) data[i][field] = parseFloat(val);
}

// 删除某条观测数据并立即保存
async function deleteCalRow(i) {
    if(!confirm('确定删除这条观测数据？')) return;
    let data = STATE.cellDb[STATE.activeCellProfile].data;
    data.splice(i, 1);
    await _pushCalData();
}

// 保存对表格的所有修改
async function saveCalEdits() {
    await _pushCalData();
}

async function _pushCalData() {
    let data = STATE.cellDb[STATE.activeCellProfile].data;
    try {
        let res = await fetch('/api/passage/calibrate/update', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({profile: STATE.activeCellProfile, data: data})
        });
        if(!res.ok) throw new Error('保存失败');
        let result = await res.json();
        STATE.cellDb[STATE.activeCellProfile].r = result.r;
        showToast(`已保存，r = ${result.r.toFixed(4)}`);
        renderCpCalibrate();
        renderCpCalc();
    } catch(e) {
        showToast(e.message, 'error');
    }
}

async function doCalibrate() {
    let payload = {
        profile: STATE.activeCellProfile,
        src_vessel: document.getElementById('calSrcVess').value,
        src_density: parseFloat(document.getElementById('calSrcDen').value),
        passage_ratio: parseFloat(document.getElementById('calRatio').value),
        tgt_vessel: document.getElementById('calTgtVess').value,
        growth_time: parseFloat(document.getElementById('calTime').value),
        final_density: parseFloat(document.getElementById('calFinalDen').value)
    };
    
    try {
        let res = await fetch('/api/passage/calibrate', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify(payload)
        });
        if(!res.ok) throw new Error("校准失败");
        let data = await res.json();
        
        showToast(`模型优化成功！最新 r = ${data.r.toFixed(4)}`);
        // 更新本地 r 值并重新加载档案数据
        await loadCellDb();
        renderCpCalc();
    } catch(e) {
        showToast(e.message, "error");
    }
}

async function renderCpHistory() {
    let container = document.getElementById('cpHistory');
    if (!container) return;
    try {
        let res = await fetch('/api/passage/history');
        let history = await res.json();
        let profHistory = history.filter(x => x.profile === STATE.activeCellProfile);
        profHistory.sort((a,b) => b.timestamp.localeCompare(a.timestamp));
        if (profHistory.length === 0) {
            container.innerHTML = '<div class="empty-state">暂无记录</div>';
            return;
        }
        container.innerHTML = profHistory.map(h => {
            let key = `passage:${h.id}`;
            let extras = `
                <button class="btn btn-sm btn-danger" style="padding:2px 7px;" onclick="event.stopPropagation();deletePassage('${h.id}')"><i class="ti ti-x"></i></button>`;
            return buildRecordCard({ key, type: 'passage', data: h,
                meta: { icon: 'ti-cell', color: '#4a9eff', typeLabel: '传代记录' },
                extraButtons: extras });
        }).join('');
    } catch(e) {}
}

window.editPassage = async function(id) {
    let res = await fetch('/api/passage/history');
    let history = await res.json();
    let h = history.find(x => x.id === id);
    if (!h) { showToast('找不到记录', 'error'); return; }
    
    document.getElementById('calcSrcVessel').value = h.src_vessel;
    document.getElementById('calcSrcCount').value = h.src_count;
    document.getElementById('calcSrcDen').value = h.src_density;
    document.getElementById('calcTgtVessel').value = h.tgt_vessel;
    document.getElementById('calcTgtCount').value = h.tgt_count;
    document.getElementById('calcTgtTime').value = h.tgt_time;
    document.getElementById('calcTgtDen').value = h.tgt_density;
    
    let calcCard = document.querySelector('.card-header i.ti-cell')?.closest('.card');
    if (calcCard) calcCard.scrollIntoView({behavior: 'smooth'});
    
    showToast(`记录已载入，可重新计算并保存`);
}


async function deletePassage(id) {
    if(!confirm("确定删除记录？")) return;
    try {
        await fetch(`/api/passage/history/${id}`, {method:'DELETE'});
        showToast("已删除");
        renderCpHistory();
    } catch(e) {}
}

// ==========================================
// 加药模块 (造模方案部分)
// ==========================================
async function loadProtocols() {
    try {
        let res = await fetch('/api/protocols');
        STATE.drugProtocols = await res.json();
        renderProtocols();
        if (typeof renderProtocolLibraryHub === 'function') renderProtocolLibraryHub();
        renderDilution();
        // 如果当时已经在设计页面，则更新网格
        renderDrugDesign();
    } catch(e) {
        console.error(e);
    }
}

// ── 造模方案 — 额外用药行管理 ──
let _protoDrugs = []; // [{drug_name, work_conc, work_unit}, ...]

function _renderProtoDrugRows() {
    let box = document.getElementById('protoDrugRows');
    if (!box) return;
    if (_protoDrugs.length === 0) {
        box.innerHTML = '<div style="font-size:12px;color:#999;padding:4px 0;">（无额外加药）</div>';
        return;
    }
    let units = CONFIG.concentration_units || ['nM','μM','mM','ng/mL','μg/mL','mg/mL'];
    box.innerHTML = _protoDrugs.map((d, i) => `
        <div class="form-row" style="align-items:flex-end;gap:6px;margin-bottom:6px;">
            <div class="form-group" style="flex:2;margin:0">
                <input class="form-input" placeholder="药物名" value="${d.drug_name}"
                    oninput="_protoDrugs[${i}].drug_name=this.value">
            </div>
            <div class="form-group" style="flex:1;margin:0">
                <input type="number" class="form-input" placeholder="工作浓度" value="${d.work_conc}"
                    oninput="_protoDrugs[${i}].work_conc=this.value">
            </div>
            <div class="form-group" style="flex:1;margin:0">
                <select class="form-select" onchange="_protoDrugs[${i}].work_unit=this.value">
                    ${units.map(u=>`<option${u===d.work_unit?' selected':''}>${u}</option>`).join('')}
                </select>
            </div>
            <button class="btn btn-sm btn-danger" style="flex-shrink:0;height:36px" onclick="_removeProtoDrug(${i})"><i class=\"ti ti-x\"></i></button>
        </div>
    `).join('');
}

function _addProtoDrug() {
    let units = CONFIG.concentration_units || ['nM','μM','mM','ng/mL','μg/mL','mg/mL'];
    _protoDrugs.push({ drug_name: '', work_conc: '', work_unit: units[0] || 'ng/mL' });
    _renderProtoDrugRows();
}

function _removeProtoDrug(i) {
    _protoDrugs.splice(i, 1);
    _renderProtoDrugRows();
}

function renderProtocols() {
    let container = document.getElementById('drugProtocolsBox');
    if (!container) return;

    let existingItems = STATE.drugProtocols.length === 0
        ? '<div class="empty-state">暂无方案</div>'
        : STATE.drugProtocols.map(p => {
            let drugsInfo = (p.drugs && p.drugs.length > 0)
                ? p.drugs.map(d => `${d.drug_name} ${d.work_conc}${d.work_unit}`).join(' + ')
                : '无额外加药';
            return `
            <div class="list-item" style="padding:8px;margin-top:6px;">
                <div class="list-item-content">
                    <div class="list-item-title" style="font-size:13px;font-weight:600">${p.name}</div>
                    <div class="list-item-subtitle" style="margin-top:3px">
                        <i class="ti ti-droplet-filled" style="color:var(--accent)"></i> ${p.base_media || 'DMEM'} + FBS ${p.fbs_conc || '10%'}
                    </div>
                    <div class="list-item-subtitle"><i class="ti ti-pill" style="color:var(--warning)"></i> ${drugsInfo}</div>
                </div>
                <div style="display:flex;">
                    <button class="btn btn-sm btn-secondary" style="padding:2px 7px; margin-right:4px;" onclick="editProtocol('${p.id}')"><i class="ti ti-pencil"></i></button>
                    <button class="btn btn-sm btn-danger" style="padding:2px 7px;" onclick="deleteProtocol('${p.id}')"><i class=\"ti ti-x\"></i></button>
                </div>
            </div>
        `}).join('');

    _protoDrugs = [];
    container.innerHTML = `
        <div class="card">
            <div class="card-header"><i class="ti ti-pill"></i> 细胞造模方案库</div>
            <div class="form-group">
                <label class="form-label">方案名称</label>
                <input class="form-input" id="pName" placeholder="TGF-β 造模">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">基础培养基</label>
                    <input class="form-input" id="pBaseMedia" placeholder="DMEM" value="DMEM">
                </div>
                <div class="form-group">
                    <label class="form-label">FBS 浓度</label>
                    <input class="form-input" id="pFbsConc" placeholder="10%" value="10%">
                </div>
            </div>
            <div style="font-size:12px;font-weight:600;margin:8px 0 4px;color:var(--text-secondary)">额外加药</div>
            <div id="protoDrugRows"><div style="font-size:12px;color:#999;padding:4px 0;">（无额外加药）</div></div>
            <button class="btn btn-sm btn-secondary" style="margin-bottom:10px" onclick="_addProtoDrug()"><i class="ti ti-plus"></i> 添加药物</button>
            <div class="form-group">
                <label class="form-label">备注</label>
                <input class="form-input" id="pNote" placeholder="">
            </div>
            <div style="display:flex;gap:8px;">
                <button class="btn btn-secondary btn-block" onclick="addProtocol()"><i class="ti ti-device-floppy"></i> 保存造模方案</button>
                <button class="btn btn-secondary" style="background:var(--surface);border:1px solid var(--border);color:var(--text-secondary);" onclick="_cancelEditProtocol()"><i class="ti ti-x"></i> 重置</button>
            </div>
            <div class="divider"></div>
            ${existingItems}
        </div>
    `;
}

async function addProtocol() {
    let name = document.getElementById('pName').value.trim();
    let base_media = document.getElementById('pBaseMedia').value.trim() || 'DMEM';
    let fbs_conc = document.getElementById('pFbsConc').value.trim() || '10%';
    let note = document.getElementById('pNote').value.trim();

    if (!name) {
        showToast("需填写方案名称", "error");
        return;
    }
    // 过滤掉药名为空的行
    let drugs = _protoDrugs.filter(d => d.drug_name && d.drug_name.trim());

    let payload = { name, base_media, fbs_conc, drugs, note };
    try {
        let url = '/api/protocols';
        let method = 'POST';
        if (window._currentEditingDrugProtoId) {
            url = `/api/protocols/${window._currentEditingDrugProtoId}`;
            method = 'PUT';
        }
        let res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            showToast("保存成功");
            window._currentEditingDrugProtoId = null;
            _protoDrugs = [];
            if (typeof protocolFinishSave === 'function') await protocolFinishSave();
            loadProtocols();
        } else {
            let err = await res.json();
            showToast(err.detail || "保存失败", "error");
        }
    } catch(e) {
        showToast("网络错误", "error");
    }
}

async function deleteProtocol(id) {
    if(!confirm("确定删除方案？")) return;
    try {
        await fetch(`/api/protocols/${id}`, {method:'DELETE'});
        showToast("已删除");
        loadProtocols();
    } catch(e) {}
}

window.editProtocol = function(id) {
    let p = STATE.drugProtocols.find(x => x.id === id);
    if (!p) return;
    window._currentEditingDrugProtoId = p.id;
    document.getElementById('pName').value = p.name || '';
    document.getElementById('pBaseMedia').value = p.base_media || 'DMEM';
    document.getElementById('pFbsConc').value = p.fbs_conc || '10%';
    document.getElementById('pNote').value = p.note || '';
    
    _protoDrugs = JSON.parse(JSON.stringify(p.drugs || []));
    _renderProtoDrugRows();
    
    document.getElementById('pName').scrollIntoView({behavior:'smooth'});
};

window._cancelEditProtocol = function() {
    window._currentEditingDrugProtoId = null;
    document.getElementById('pName').value = '';
    document.getElementById('pBaseMedia').value = 'DMEM';
    document.getElementById('pFbsConc').value = '10%';
    document.getElementById('pNote').value = '';
    _protoDrugs = [];
    _renderProtoDrugRows();
};

async function loadMwLibrary() {
    try {
        let res = await fetch('/api/mw-library');
        STATE.mwLibrary = await res.json();
        renderMwLibrary();
        if (typeof renderProtocolLibraryHub === 'function') renderProtocolLibraryHub();
        // If dilution calc is currently open, we should re-render it to update the MW dropdown
        if (document.getElementById('dtDilution') && document.getElementById('dtDilution').innerHTML !== '') {
            renderDilution();
        }
    } catch(e) {}
}

function renderMwLibrary() {
    let container = document.getElementById('mwLibraryBox');
    if (!container) return;

    let itemsHtml = STATE.mwLibrary.length === 0
        ? '<div class="empty-state">暂无登记试剂</div>'
        : STATE.mwLibrary.map(m => `
        <div class="list-item" style="padding:10px 12px;margin-top:6px;display:flex;justify-content:space-between;align-items:center;">
            <div>
                <div style="font-size:14px;font-weight:600">${m.name}</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-top:3px;">摩尔质量: <b>${m.mw}</b> g/mol</div>
            </div>
            <button class="btn btn-sm btn-danger" onclick="deleteMw('${m.id}')" title="删除"><i class="ti ti-x"></i></button>
        </div>
        `).join('');

    container.innerHTML = `
        <div class="card">
            <div class="card-header"><i class="ti ti-flask"></i> 常用试剂档案库 (MW库)</div>
            <div class="form-row">
                <div class="form-group" style="flex:2;">
                    <label class="form-label">化学试剂名称</label>
                    <input class="form-input" id="mwNameIn" placeholder="NaCl, DMSO">
                </div>
                <div class="form-group" style="flex:1;">
                    <label class="form-label">摩尔质量(g/mol)</label>
                    <input type="number" class="form-input" id="mwValueIn" placeholder="数值">
                </div>
            </div>
            <button class="btn btn-primary" style="margin-bottom:12px;" onclick="addMw()">
                <i class="ti ti-plus"></i> 添加/更新至档案库
            </button>
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px"><i class="ti ti-info-circle"></i> 已存档记录（下拉换算时可自动调用）</div>
            ${itemsHtml}
        </div>
    `;
}

async function addMw() {
    let name = document.getElementById('mwNameIn').value.trim();
    let mw = parseFloat(document.getElementById('mwValueIn').value);
    if (!name || isNaN(mw) || mw <= 0) {
        showToast("需填写有效的试剂名称和数值", "error");
        return;
    }
    try {
        let res = await fetch('/api/mw-library', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, mw })
        });
        if (res.ok) {
            showToast("档案已更新");
            if (typeof protocolFinishSave === 'function') await protocolFinishSave();
            loadMwLibrary();
        } else {
            showToast("添加失败", "error");
        }
    } catch(e) { showToast("网络错误", "error");}
}

async function deleteMw(id) {
    if(!confirm("确定删除该试剂档案吗？")) return;
    try {
        await fetch(`/api/mw-library/${id}`, {method:'DELETE'});
        showToast("已删除");
        loadMwLibrary();
    } catch(e) {}
}

window.ccUseMwPreset = function(selectEl, mwInputId, nameInputId) {
    let selected = selectEl.options[selectEl.selectedIndex];
    let selectedName = (selected?.textContent || '').replace(/\s*\([^)]*\)\s*$/, '');
    let mwInput = document.getElementById(mwInputId);
    let nameInput = document.getElementById(nameInputId);
    if (mwInput) mwInput.value = selectEl.value || '';
    if (nameInput && selectEl.value && selectedName) nameInput.value = selectedName;
};

function ccRound(value, digits = 4) {
    if (!Number.isFinite(value)) return '-';
    return parseFloat(value.toFixed(digits)).toString();
}

function ccFormatMass(massMg) {
    if (!Number.isFinite(massMg) || massMg < 0) return '-';
    if (massMg >= 1000) return `${ccRound(massMg / 1000, 4)} g`;
    if (massMg >= 1) return `${ccRound(massMg, 4)} mg`;
    if (massMg >= 0.001) return `${ccRound(massMg * 1000, 3)} μg`;
    return `${ccRound(massMg * 1000000, 3)} ng`;
}

function ccFormatMoles(moles) {
    if (moles >= 1e-3) return `${ccRound(moles, 6)} mol`;
    if (moles >= 1e-6) return `${ccRound(moles * 1000, 4)} mmol`;
    if (moles >= 1e-9) return `${ccRound(moles * 1000000, 4)} μmol`;
    return `${ccRound(moles * 1000000000, 4)} nmol`;
}

function ccFormatActivity(iuValue) {
    if (iuValue >= 1000000) return `${ccRound(iuValue / 1000000, 4)} MIU`;
    if (iuValue >= 1000) return `${ccRound(iuValue / 1000, 4)} kIU`;
    return `${ccRound(iuValue, 4)} IU`;
}

function ccVolumeToMl(volumeValue, unit) {
    if (unit === 'μL') return volumeValue / 1000;
    if (unit === 'L') return volumeValue * 1000;
    return volumeValue;
}

function ccCalculatePowderMass(concentration, unit, volumeMl, molecularWeight, potencyIuPerMg) {
    const molarUnits = { 'nM': 1e-9, 'μM': 1e-6, 'uM': 1e-6, 'mM': 1e-3, 'M': 1 };
    const massUnits = { 'ng/mL': 1e-6, 'μg/mL': 1e-3, 'ug/mL': 1e-3, 'mg/mL': 1, 'g/L': 1, 'mg/L': 1e-3 };
    const activityUnits = { 'IU/mL': 1, 'U/mL': 1, 'IU/L': 1e-3, 'U/L': 1e-3 };

    if (molarUnits[unit]) {
        if (!molecularWeight || molecularWeight <= 0) throw new Error('摩尔浓度计算需填写摩尔质量 MW');
        let moles = concentration * molarUnits[unit] * (volumeMl / 1000);
        return { massMg: moles * molecularWeight * 1000, amountText: ccFormatMoles(moles), basis: '摩尔浓度' };
    }
    if (massUnits[unit]) {
        let massMg = concentration * massUnits[unit] * volumeMl;
        return { massMg, amountText: ccFormatMass(massMg), basis: '质量浓度' };
    }
    if (activityUnits[unit]) {
        if (!potencyIuPerMg || potencyIuPerMg <= 0) throw new Error('有效单位浓度计算需填写效价 IU/mg');
        let totalIu = concentration * activityUnits[unit] * volumeMl;
        return { massMg: totalIu / potencyIuPerMg, amountText: ccFormatActivity(totalIu), basis: '有效单位浓度' };
    }
    throw new Error('暂不支持该工作液浓度单位');
}

function renderDilution() {
    let container = document.getElementById('dtDilution');
    if (!container) return;
    let opts = CONFIG.concentration_units.map(u=>`<option value="${u}">${u}</option>`).join('');
    let powderUnits = ['nM', 'μM', 'mM', 'M', 'ng/mL', 'μg/mL', 'mg/mL', 'g/L', 'IU/mL', 'U/mL', 'IU/L', 'U/L'];
    let powderOpts = powderUnits.map(u=>`<option value="${u}" ${u === 'μM' ? 'selected' : ''}>${u}</option>`).join('');
    
    // Build MW Library Options
    if (!STATE.mwLibrary) STATE.mwLibrary = [];
    let mwOpts = `<option value="">-- 自定义输入或不填 --</option>` + STATE.mwLibrary.map(m=>`<option value="${m.mw}">${m.name} (${m.mw} g/mol)</option>`).join('');
    
    container.innerHTML = `
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px"><i class="ti ti-calculator" style="color:var(--accent)"></i> C₁V₁ = C₂V₂ 稀释计算器（支持自动跨质量/摩尔单位体系换算）</div>
        <div class="card">
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">原液浓度 (C₁)</label>
                    <input type="number" class="form-input" id="ccC1" value="10">
                </div>
                <div class="form-group">
                    <label class="form-label">单位</label>
                    <select class="form-select" id="ccU1">${opts}</select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">工作液浓度 (C₂)</label>
                    <input type="number" class="form-input" id="ccC2" value="10">
                </div>
                <div class="form-group">
                    <label class="form-label">单位</label>
                    <select class="form-select" id="ccU2">${opts}</select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">工作液总体积 V₂ (mL)</label>
                    <input type="number" class="form-input" id="ccV2" value="10">
                </div>
            </div>
            
            <div style="padding:12px;background:var(--surface-hover);border-radius:12px;margin-bottom:12px;">
                <div style="font-size:12px;font-weight:600;color:var(--warning);margin-bottom:8px;"><i class="ti ti-info-circle"></i> 质量单位与摩尔单位互转需提供摩尔质量：</div>
                <div class="form-row">
                    <div class="form-group" style="flex:2;margin:0">
                        <label class="form-label">调用档案库常用试剂</label>
                        <select class="form-select" onchange="document.getElementById('ccMw').value = this.value; this.options[this.selectedIndex].text !== '-- 自定义输入或不填 --' ? document.getElementById('ccName').value = this.options[this.selectedIndex].text.split(' ')[0] : null">
                            ${mwOpts}
                        </select>
                    </div>
                    <div class="form-group" style="flex:1;margin:0">
                        <label class="form-label">试剂名(选填)</label>
                        <input type="text" class="form-input" id="ccName" placeholder="NaCl">
                    </div>
                    <div class="form-group" style="flex:1;margin:0">
                        <label class="form-label">摩尔质量(MW)</label>
                        <input type="number" class="form-input" id="ccMw" placeholder="g/mol">
                    </div>
                </div>
            </div>
            
            <button class="btn btn-primary btn-block" onclick="doDilution()"><i class="ti ti-calculator"></i> 计算制备体积</button>
            <div id="dilutionRes" style="margin-top:16px"></div>
        </div>

        <div class="card">
            <div class="card-header"><i class="ti ti-scale"></i> 粉末配制工作液</div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">工作液浓度</label>
                    <input type="number" class="form-input" id="ccPowderConc" value="10">
                </div>
                <div class="form-group">
                    <label class="form-label">浓度单位</label>
                    <select class="form-select" id="ccPowderUnit">${powderOpts}</select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">工作液总体积</label>
                    <input type="number" class="form-input" id="ccPowderVol" value="10">
                </div>
                <div class="form-group">
                    <label class="form-label">体积单位</label>
                    <select class="form-select" id="ccPowderVolUnit"><option value="mL">mL</option><option value="L">L</option><option value="μL">μL</option></select>
                </div>
            </div>
            <div style="padding:12px;background:var(--surface-hover);border-radius:12px;margin-bottom:12px;">
                <div class="form-row">
                    <div class="form-group" style="flex:2;margin:0">
                        <label class="form-label">调用档案库常用试剂</label>
                        <select class="form-select" onchange="ccUseMwPreset(this, 'ccPowderMw', 'ccPowderName')">
                            ${mwOpts}
                        </select>
                    </div>
                    <div class="form-group" style="flex:1;margin:0">
                        <label class="form-label">试剂名</label>
                        <input type="text" class="form-input" id="ccPowderName" placeholder="药物/蛋白名称">
                    </div>
                </div>
                <div class="form-row" style="margin-top:10px">
                    <div class="form-group" style="margin:0">
                        <label class="form-label">摩尔质量 MW (g/mol)</label>
                        <input type="number" class="form-input" id="ccPowderMw" placeholder="摩尔浓度时填写">
                    </div>
                    <div class="form-group" style="margin:0">
                        <label class="form-label">效价 (IU/mg)</label>
                        <input type="number" class="form-input" id="ccPowderIu" placeholder="IU 或 U 单位时填写">
                    </div>
                </div>
            </div>
            <button class="btn btn-primary btn-block" onclick="doPowderPreparation()"><i class="ti ti-scale"></i> 计算称量质量</button>
            <div id="powderRes" style="margin-top:16px"></div>
        </div>
        <div class="section-title"><i class="ti ti-history"></i> 计算历史</div>
        <div id="dilutionHistoryBox"></div>
    `;
    loadDilutionHistory();
}

window.loadDilutionHistory = async function() {
    let container = document.getElementById('dilutionHistoryBox');
    if (!container) return;
    try {
        let res = await fetch('/api/dilution/logs');
        let logs = await res.json();
        logs.sort((a,b) => b.created_at.localeCompare(a.created_at));

        if (logs.length === 0) {
            container.innerHTML = '<div class="empty-state">暂无计算记录</div>';
            return;
        }
        container.innerHTML = logs.map(l => {
            let key = `dilution:${l.id}`;
            let extras = `<button class="btn btn-sm btn-danger" style="padding:2px 7px;" onclick="event.stopPropagation();deleteDilutionLog('${l.id}')"><i class="ti ti-x"></i></button>`;
            let typeLabel = l.kind === 'powder' ? '粉末配制' : '浓度换算';
            return buildRecordCard({ key, type: 'dilution', data: l, meta: { icon: 'ti-calculator', color: '#0a84ff', typeLabel }, extraButtons: extras });
        }).join('');
    } catch (e) {
        container.innerHTML = '<div class="empty-state">加载失败</div>';
    }
}

window.deleteDilutionLog = async function(id) {
    if (!confirm('确定删除该计算记录？')) return;
    await fetch(`/api/dilution/logs/${id}`, { method: 'DELETE' });
    showToast('已删除');
    loadDilutionHistory();
}

async function doDilution() {
    let c1 = parseFloat(document.getElementById('ccC1').value);
    let c2 = parseFloat(document.getElementById('ccC2').value);
    let v2 = parseFloat(document.getElementById('ccV2').value);
    let mwRaw = document.getElementById('ccMw').value;
    let mw = mwRaw ? parseFloat(mwRaw) : null;
    
    if (isNaN(c1) || isNaN(c2) || isNaN(v2)) {
        showToast("需填写完整的浓度和体积数值", "error");
        return;
    }

    let payload = {
        c1: c1,
        u1: document.getElementById('ccU1').value,
        c2: c2,
        u2: document.getElementById('ccU2').value,
        v2: v2,
        mw: mw
    };
    try {
        let res = await fetch('/api/dilution', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify(payload)
        });
        let data = await res.json();
        if(!res.ok) {
            document.getElementById('dilutionRes').innerHTML = `
                <div style="padding:12px;background:rgba(255,55,95,0.1);border-radius:8px;border:1px solid rgba(255,55,95,0.3);color:var(--danger)">
                     <i class="ti ti-alert-circle"></i> <b>计算失败：</b>${data.error || "发生了错误"}
                </div>
            `;
            throw new Error(data.error || "计算失败");
        }
        
        document.getElementById('dilutionRes').innerHTML = `
            <div style="padding:12px;background:rgba(52,199,89,0.1);border-radius:8px;border:1px solid #34c759;">
                 需加入原始试剂 <b>${data.v1_ul} μL</b> 以配制成 ${v2} mL 工作液
            </div>
        `;
        
        let rn = document.getElementById('ccName').value.trim() || '未命名计算';
        payload.v1_ul = data.v1_ul;
        payload.v1_ml = data.v1_ml;
        payload.name = rn;
        
        // 自动保存历史
        await fetch('/api/dilution/logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        loadDilutionHistory();

    } catch(e) {
        showToast(e.message, "error");
    }
}

window.doPowderPreparation = async function() {
    let concentration = parseFloat(document.getElementById('ccPowderConc').value);
    let volumeValue = parseFloat(document.getElementById('ccPowderVol').value);
    let unit = document.getElementById('ccPowderUnit').value;
    let volumeUnit = document.getElementById('ccPowderVolUnit').value;
    let molecularWeightRaw = document.getElementById('ccPowderMw').value;
    let potencyRaw = document.getElementById('ccPowderIu').value;
    let molecularWeight = molecularWeightRaw ? parseFloat(molecularWeightRaw) : null;
    let potencyIuPerMg = potencyRaw ? parseFloat(potencyRaw) : null;

    if (isNaN(concentration) || concentration <= 0 || isNaN(volumeValue) || volumeValue <= 0) {
        showToast('需填写有效的工作液浓度和体积', 'error');
        return;
    }

    try {
        let volumeMl = ccVolumeToMl(volumeValue, volumeUnit);
        let result = ccCalculatePowderMass(concentration, unit, volumeMl, molecularWeight, potencyIuPerMg);
        let massText = ccFormatMass(result.massMg);
        document.getElementById('powderRes').innerHTML = `
            <div style="padding:12px;background:rgba(52,199,89,0.1);border-radius:8px;border:1px solid #34c759;">
                 目标总量 <b>${result.amountText}</b>，需称取粉末 <b>${massText}</b>
            </div>
        `;

        let payload = {
            kind: 'powder',
            name: document.getElementById('ccPowderName').value.trim() || '粉末配制计算',
            target_conc: concentration,
            target_unit: unit,
            final_volume: volumeValue,
            volume_unit: volumeUnit,
            volume_ml: volumeMl,
            mw: molecularWeight,
            potency_iu_per_mg: potencyIuPerMg,
            powder_mass_mg: result.massMg,
            powder_mass_text: massText,
            amount_text: result.amountText,
            basis: result.basis
        };
        await fetch('/api/dilution/logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        loadDilutionHistory();
    } catch(e) {
        document.getElementById('powderRes').innerHTML = `
            <div style="padding:12px;background:rgba(255,55,95,0.1);border-radius:8px;border:1px solid rgba(255,55,95,0.3);color:var(--danger)">
                 <i class="ti ti-alert-circle"></i> <b>计算失败：</b>${e.message}
            </div>
        `;
        showToast(e.message, 'error');
    }
};

// ── Well Assignment Popup State ──
let _wellPopup = null;

function _closeWellPopup() {
    if (_wellPopup) {
        _wellPopup.remove();
        _wellPopup = null;
    }
}

function _showProtoPopup(anchorEl, title, onSelect) {
    _closeWellPopup();
    let protoNames = ['（空白/对照）'].concat(STATE.drugProtocols.map(p => p.name));
    let colors = ["#E8E8E8", "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8"];
    let colorMap = {};
    protoNames.forEach((pn, i) => colorMap[pn] = colors[i % colors.length]);

    let popup = document.createElement('div');
    popup.className = 'well-proto-popup';
    popup.innerHTML = `
        <div class="well-proto-popup-title" style="font-weight:bold;margin-bottom:8px;font-size:13px;color:var(--text);border-bottom:1px solid var(--border);padding-bottom:6px;">${title}</div>
        ${protoNames.map(pn => `
            <div class="well-proto-option" onclick="_handlePopupSelect(event, '${pn.replace(/'/g,"\\'")}')"
                style="padding:8px 6px;margin-bottom:4px;cursor:pointer;border-radius:4px;background:var(--surface-hover);display:flex;align-items:center;font-size:12px;border-left:4px solid ${colorMap[pn]};transition:opacity 0.2s;"
                onmouseover="this.style.opacity=0.7" onmouseout="this.style.opacity=1">
                <span style="display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:8px;background:${colorMap[pn]};flex-shrink:0;"></span>
                <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${pn}">${pn === '（空白/对照）' ? '对照' : pn}</span>
            </div>
        `).join('')}
        <div class="well-proto-option" style="padding:8px;cursor:pointer;border:1px solid var(--border);border-radius:4px;color:var(--text-secondary);font-size:12px;display:flex;justify-content:center;margin-top:8px;transition:background 0.2s;" onmouseover="this.style.background='var(--surface-hover)'" onmouseout="this.style.background='transparent'" onclick="_closeWellPopup()">取消</div>
    `;
    popup._onSelect = onSelect;
    
    // 注入必要的内联样式（修复位置和外观）
    popup.style.position = 'absolute';
    popup.style.zIndex = '9999';
    popup.style.background = 'var(--surface)';
    popup.style.border = '1px solid var(--border)';
    popup.style.borderRadius = 'var(--radius-md)';
    popup.style.padding = '10px';
    popup.style.boxShadow = 'var(--shadow-lg)';
    popup.style.width = '240px';
    popup.style.maxHeight = '300px';
    popup.style.overflowY = 'auto';

    document.body.appendChild(popup);
    _wellPopup = popup;

    // Position popup near anchor
    let rect = anchorEl.getBoundingClientRect();
    let popW = 240, popH = popup.offsetHeight || 280;
    let left = rect.left + window.scrollX;
    let top = rect.bottom + window.scrollY + 4;
    if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
    if (top + popH > window.scrollY + window.innerHeight - 8) top = rect.top + window.scrollY - popH - 4;
    popup.style.left = Math.max(8, left) + 'px';
    popup.style.top = Math.max(8, top) + 'px';

    // Close on outside click
    setTimeout(() => {
        document.addEventListener('click', _outsidePopupHandler);
    }, 10);
}

function _outsidePopupHandler(e) {
    if (_wellPopup && !_wellPopup.contains(e.target)) {
        _closeWellPopup();
        document.removeEventListener('click', _outsidePopupHandler);
    }
}

function _handlePopupSelect(e, protoName) {
    e.stopPropagation();
    if (_wellPopup && _wellPopup._onSelect) {
        _wellPopup._onSelect(protoName);
    }
    _closeWellPopup();
    document.removeEventListener('click', _outsidePopupHandler);
}

let autoSaveModelingTimer = null;
window.autoSaveModeling = function(immediate = false) {
    if (autoSaveModelingTimer) {
        clearTimeout(autoSaveModelingTimer);
        autoSaveModelingTimer = null;
    }
    if (immediate) {
        return _doModelingAutoSave();
    } else {
        autoSaveModelingTimer = setTimeout(() => {
            autoSaveModelingTimer = null;
            _doModelingAutoSave();
        }, 500);
    }
    return Promise.resolve();
};
async function _doModelingAutoSave() {
    if(!window._curModelingExp || !window._curModelingExp.id) return;
    try {
        let payload = {
            status: window._curModelingExp.status,
            name: window._curModelingExp.name,
            cell_line: window._curModelingExp.cell_line,
            protocols: window._curModelingExp.protocols || [],
            plates: STATE.drugPlates
        };
        await fetch(`/api/experiments/${window._curModelingExp.id}`, {
            method: 'PUT',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify(payload)
        });
        if(window.renderExpHistory) renderExpHistory();
    } catch(e) {}
}

window.addEventListener('beforeunload', function() {
    if (window._curModelingExp && window._curModelingExp.id) {
        let payload = {
            status: window._curModelingExp.status,
            name: window._curModelingExp.name,
            cell_line: window._curModelingExp.cell_line,
            protocols: window._curModelingExp.protocols || [],
            plates: STATE.drugPlates
        };
        try {
            fetch(`/api/experiments/${window._curModelingExp.id}`, {
                method: 'PUT',
                keepalive: true,
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify(payload)
            });
        } catch(e) {}
    }
});

function renderDrugDesign() {
    let container = document.getElementById('dtDesign');
    if (!container) return;
    
    // 如果没有正在进行的实验，显示单按钮
    if (!window._curModelingExp || window._curModelingExp.status === "已完成") {
        container.innerHTML = `
            <div class="card">
                <button class="btn btn-primary btn-block" onclick="startModelingExperiment()">
                    <i class="ti ti-player-play"></i> 启动细胞造模实验
                </button>
            </div>
            
            <div class="divider" style="margin-top:24px;"></div>
            <div class="section-title"><i class="ti ti-history"></i> 实验记录</div>
            <div id="dtHistory"></div>
        `;
        if (typeof renderExpHistory === 'function') setTimeout(renderExpHistory, 50);
        return;
    }

    // 运行中的实验 UI (统一面板)
    let expInfo = window._curModelingExp;
    let cellOpts = Object.keys(STATE.cellDb || {}).map(k => `<option value="${k}" ${k === expInfo.cell_line ? 'selected' : ''}>${k}</option>`).join('');
    let protoOpts = STATE.drugProtocols.map(p => {
        let checked = (expInfo.protocols || []).includes(p.name) ? 'checked' : '';
        return `<div><label class="form-label" style="display:inline-flex;align-items:center;font-weight:normal"><input type="checkbox" name="setupProto" value="${p.name}" ${checked} onchange="updateModelingExpForm()" style="margin-right:6px"> ${p.name}</label></div>`;
    }).join('');

    let html = `
        <div class="card" style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <div style="font-weight:700;font-size:15px;"><i class="ti ti-flask" style="color:var(--primary)"></i> 细胞造模实验详情</div>
                <button class="btn btn-sm btn-secondary" onclick="window._curModelingExp=null;STATE.drugPlates=[];renderDrugDesign()"><i class="ti ti-x"></i></button>
            </div>
            
            <!-- Unified Setup Form -->
            <div class="form-group">
                <label class="form-label">实验名称</label>
                <input type="text" id="ddSetupName" class="form-input" value="${expInfo.name || ''}" placeholder="TGF-b 诱导实验" oninput="updateModelingExpForm()">
            </div>
            <div class="form-group">
                <label class="form-label">实验细胞系</label>
                <div style="display:flex;gap:8px;">
                    <select class="form-select" id="ddSetupCellSel" style="flex:1;" onchange="document.getElementById('ddSetupCellIn').value = this.value; if(this.value){this.value='';} updateModelingExpForm();">
                        <option value="">-- 从档案库选择 --</option>
                        ${cellOpts}
                    </select>
                    <input type="text" id="ddSetupCellIn" class="form-input" value="${expInfo.cell_line || ''}" placeholder="输入细胞系" style="flex:1;" oninput="updateModelingExpForm()">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">涉及的诱导方案</label>
                <div style="background:var(--surface-hover);padding:10px;border-radius:8px;border:1px solid var(--border)">
                    ${protoOpts || '<div style="color:var(--text-tertiary);font-size:12px">未配置造模方案</div>'}
                </div>
            </div>
        </div>

        <div class="section-title"><i class="ti ti-plus"></i> 添加新板</div>
        <div class="form-row">
            <div class="form-group">
                <select class="form-select" id="ddNewPt">
                    ${Object.keys(CONFIG.plate_configs).map(k=>`<option value="${k}">${k}</option>`).join('')}
                </select>
            </div>
            <div class="form-group"><button class="btn btn-secondary btn-block" onclick="addPlate(document.getElementById('ddNewPt').value)"><i class="ti ti-plus"></i> 添加板</button></div>
        </div>
        <div class="divider"></div>
        <div class="section-title"><i class="ti ti-palette"></i> 配置与分配</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">板孔方案分配：全板、整列、整行或单孔均可单独设定。</div>
    `;
    
    let colors = ["#E8E8E8", "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8"];
    let protoNames = ['（空白/对照）'].concat(expInfo.protocols || []);
    let colorMap = {};
    protoNames.forEach((pn, i) => colorMap[pn] = colors[i % colors.length]);
    
    STATE.drugPlates.forEach((plate, pi) => {
        let pcfg = CONFIG.plate_configs[plate.plate_type];
        
        // 根据板型决定孔格尺寸和字号
        const wellSizeMap = { '6孔板': 72, '12孔板': 56, '24孔板': 42, '96孔板': 28 };
        const fontSizeMap = { '6孔板': 13, '12孔板': 11, '24孔板': 10, '96孔板': 9 };
        const cornerSizeMap = { '6孔板': 36, '12孔板': 30, '24孔板': 28, '96孔板': 24 };
        let ws = wellSizeMap[plate.plate_type] || 32;
        let fs = fontSizeMap[plate.plate_type] || 10;
        let cs = cornerSizeMap[plate.plate_type] || 28;
        let borderRadius = ws >= 56 ? '50%' : '5px';
        
        let gridHtml = `<div class="plate-grid-container"><table class="plate-grid"><tbody>`;
        gridHtml += `<tr>`;
        gridHtml += `<td class="plate-header plate-corner" title="选择全板方案" onclick="assignFullPlate(event,${pi})"
            style="width:${cs}px;height:${cs}px;font-size:${Math.round(cs*0.45)}px">■</td>`;
        for(let c=0; c<pcfg.cols; c++) {
            gridHtml += `<td class="plate-header plate-col-header" title="分配第${c+1}列" onclick="assignColumn(event,${pi},${c})"
                style="width:${ws}px;font-size:${fs}px"><b>${c+1}</b></td>`;
        }
        gridHtml += `</tr>`;
        
        for(let r=0; r<pcfg.rows; r++) {
            gridHtml += `<tr>`;
            gridHtml += `<td class="plate-header plate-row-header" title="分配第${pcfg.row_labels[r]}行" onclick="assignRow(event,${pi},${r})"
                style="height:${ws}px;font-size:${fs}px"><b>${pcfg.row_labels[r]}</b></td>`;
            for(let c=0; c<pcfg.cols; c++) {
                let wid = `${pcfg.row_labels[r]}${c+1}`;
                let well = plate.wells[wid];
                let bg = colorMap[well.protocol_name] || '#E8E8E8';
                let isDark = _isDarkColor(bg);
                let label = ws >= 56 ? well.protocol_name.replace('（空白/对照）', '对照').substring(0, ws >= 72 ? 4 : 3) : wid;
                gridHtml += `<td class="plate-cell" 
                    style="background:${bg};color:${isDark?'#fff':'#333'};width:${ws}px;height:${ws}px;font-size:${fs}px;border-radius:${borderRadius};font-weight:600" 
                    title="${wid}: ${well.protocol_name}" 
                    onclick="assignSingleWell(event,${pi},'${wid}')">${label}</td>`;
            }
            gridHtml += `</tr>`;
        }
        gridHtml += `</tbody></table></div>`;
        
        let legendHtml = '<div class="plate-legend">';
        protoNames.forEach(pn => {
            let used = Object.values(plate.wells).some(w => w.protocol_name === pn);
            if (used) {
                legendHtml += `<div class="legend-item"><div class="legend-dot" style="background:${colorMap[pn]}"></div>${pn==='（空白/对照）'?'对照':pn}</div>`;
            }
        });
        legendHtml += '</div>';

        html += `
            <div class="card">
                <div class="card-header" style="justify-content:space-between">
                    <div><i class="ti ti-layout-grid"></i> ${plate.plate_name} (${plate.plate_type})</div>
                    <button class="btn btn-sm btn-danger" onclick="removePlate(${pi})"><i class=\"ti ti-x\"></i></button>
                </div>
                ${gridHtml}
                ${legendHtml}
                <div class="divider"></div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">诱导天数</label><input type="number" class="form-input" min="0" value="${plate.induction_days || 0}" onchange="updatePlate(${pi},'induction_days',this.value)"></div>
                    <div class="form-group"><label class="form-label">诱导频率</label><input class="form-input" value="${plate.induction_frequency || ''}" placeholder="每日 / 隔日 / 单次" onchange="updatePlate(${pi},'induction_frequency',this.value)"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">换液(天)</label><input type="number" class="form-input" min="0" value="${plate.media_change_freq}" onchange="updatePlate(${pi},'media_change_freq',this.value)"></div>
                    <div class="form-group"><label class="form-label">收样天数</label><input type="number" class="form-input" min="0" value="${plate.harvest_days || 3}" onchange="updatePlate(${pi},'harvest_days',this.value)"></div>
                </div>
                <div class="form-group"><label class="form-label">预计收样时间</label><input type="datetime-local" class="form-input" value="${(plate.harvest_time || '').replace(' ', 'T')}" onchange="updatePlate(${pi},'harvest_time',this.value.replace('T', ' '))"></div>
            </div>
        `;
    });
    
    html += `
        <button class="btn btn-primary btn-block" style="margin-top:20px;padding:14px" onclick="finishModelingExperiment()"><i class="ti ti-circle-check"></i> 保存并收起面板</button>
        
        <div class="divider" style="margin-top:24px;"></div>
        <div class="section-title"><i class="ti ti-history"></i> 实验记录</div>
        <div id="dtHistory"></div>
    `;
    container.innerHTML = html;
    if (typeof renderExpHistory === 'function') setTimeout(renderExpHistory, 50);
}

window.updateModelingExpForm = function() {
    if(!window._curModelingExp) return;
    let nameElem = document.getElementById('ddSetupName');
    let cellElem = document.getElementById('ddSetupCellIn');
    if (nameElem) window._curModelingExp.name = nameElem.value.trim();
    if (cellElem) window._curModelingExp.cell_line = cellElem.value.trim();
    let protocols = Array.from(document.querySelectorAll('input[name="setupProto"]:checked')).map(el => el.value);
    window._curModelingExp.protocols = protocols;

    // Immediately trigger a partial refresh of the legend without interrupting input focus (renderDrugDesign rebuilds entire DOM which loses focus)
    // For simplicity, we just save state - next time user adds a plate or assigns a well, colors will update
    autoSaveModeling(true);
}


window.startModelingExperiment = async function() {
    try {
        let payload = { name: "细胞造模实验", cell_line: "", protocols: [], plates: [] };
        let res = await fetch('/api/experiments', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        let data = await res.json();
        if(data && data.id) {
            window._curModelingExp = data;
            window._curModelingExp.status = "中途保存"; // Indicate drafting
            STATE.drugPlates = [];
            renderDrugDesign();
            renderExpHistory();
            autoSaveModeling(true);
        }
    } catch(e) { showToast("启动失败", "error"); }
}

window.finishModelingExperiment = async function() {
    if(!window._curModelingExp) return;
    if(!window._curModelingExp.name) return showToast("需填写实验名称", "error");
    if(!window._curModelingExp.protocols || window._curModelingExp.protocols.length === 0) return showToast("需选择至少一个造模方案", "error");
    if(STATE.drugPlates.length === 0) return showToast("需添加至少一块培养板", "error");
    
    // Status stays as "进行中" until all plates are harvested
    window._curModelingExp.status = "进行中";
    try {
        await autoSaveModeling(true);
        window._curModelingExp = null;
        STATE.drugPlates = [];
        renderDrugDesign();
        showToast("实验记录已保存，日程排期已生成");
    } catch(e) { showToast("保存失败", "error"); }
}

function _isDarkColor(hex) {
    let c = hex.replace('#','');
    if(c.length !== 6) return false;
    let r = parseInt(c.substr(0,2),16), g = parseInt(c.substr(2,2),16), b = parseInt(c.substr(4,2),16);
    return (0.299*r + 0.587*g + 0.114*b) < 128;
}

window.updatePlate = function(idx, key, val) {
    if(key === 'media_change_freq') val = parseInt(val) || 2;
    if(key === 'induction_days') val = parseInt(val) || 0;
    if(key === 'harvest_days') {
        val = parseInt(val) || 0;
        STATE.drugPlates[idx].harvest_time = addDaysToDateTime(window._curModelingExp?.created_at, val);
    }
    STATE.drugPlates[idx][key] = val;
    autoSaveModeling();
}

window.addPlate = function(type) {
    let id = STATE.drugPlates.length;
    let cfg = CONFIG.plate_configs[type];
    let wells = {};
    for(let r=0; r<cfg.rows; r++) {
        for(let c=0; c<cfg.cols; c++) {
            wells[`${cfg.row_labels[r]}${c+1}`] = { protocol_name: '（空白/对照）' };
        }
    }
    let harvestDays = 3;
    STATE.drugPlates.push({
        plate_name: `板 ${id+1}`,
        plate_type: type,
        wells: wells,
        induction_density: 70,
        induction_days: 0,
        induction_frequency: '每日',
        starvation: false,
        starvation_hours: 12,
        media_change_freq: 2,
        media_change_ratio: "全换",
        harvest_days: harvestDays,
        harvest_time: addDaysToDateTime(window._curModelingExp?.created_at, harvestDays)
    });
    renderDrugDesign();
    autoSaveModeling();
}

window.removePlate = function(idx) {
    if(!confirm("删除此板？")) return;
    STATE.drugPlates.splice(idx, 1);
    renderDrugDesign();
    autoSaveModeling();
}

window.assignFullPlate = function(e, pi) {
    e.stopPropagation();
    _showModelingPopup(e.currentTarget, '全板方案选择', (proto) => {
        let wells = STATE.drugPlates[pi].wells;
        for(let k in wells) wells[k].protocol_name = proto;
        renderDrugDesign();
        autoSaveModeling();
    });
}

window.assignColumn = function(e, pi, colIdx) {
    e.stopPropagation();
    let pcfg = CONFIG.plate_configs[STATE.drugPlates[pi].plate_type];
    _showModelingPopup(e.currentTarget, `第 ${colIdx+1} 列方案选择`, (proto) => {
        for(let r=0; r<pcfg.rows; r++) {
            let wid = `${pcfg.row_labels[r]}${colIdx+1}`;
            STATE.drugPlates[pi].wells[wid].protocol_name = proto;
        }
        renderDrugDesign();
        autoSaveModeling();
    });
}

window.assignRow = function(e, pi, rowIdx) {
    e.stopPropagation();
    let pcfg = CONFIG.plate_configs[STATE.drugPlates[pi].plate_type];
    _showModelingPopup(e.currentTarget, `第 ${pcfg.row_labels[rowIdx]} 行方案选择`, (proto) => {
        for(let c=0; c<pcfg.cols; c++) {
            let wid = `${pcfg.row_labels[rowIdx]}${c+1}`;
            STATE.drugPlates[pi].wells[wid].protocol_name = proto;
        }
        renderDrugDesign();
        autoSaveModeling();
    });
}

window.assignSingleWell = function(e, pi, wid) {
    e.stopPropagation();
    _showModelingPopup(e.currentTarget, `孔位 ${wid} 方案选择`, (proto) => {
        STATE.drugPlates[pi].wells[wid].protocol_name = proto;
        renderDrugDesign();
        autoSaveModeling();
    });
}

function _showModelingPopup(anchorEl, title, onSelect) {
    if (!window._curModelingExp) return;
    _closeWellPopup();
    let protoNames = ['（空白/对照）'].concat(window._curModelingExp.protocols || []);
    let colors = ["#E8E8E8", "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8"];
    let colorMap = {};
    protoNames.forEach((pn, i) => colorMap[pn] = colors[i % colors.length]);

    let popup = document.createElement('div');
    popup.className = 'well-proto-popup';
    popup.innerHTML = `
        <div class="well-proto-popup-title" style="font-weight:bold;margin-bottom:8px;font-size:13px;color:var(--text);border-bottom:1px solid var(--border);padding-bottom:6px;">${title}</div>
        ${protoNames.map(pn => `
            <div class="well-proto-option" onclick="_handlePopupSelect(event, '${pn.replace(/'/g,"\\'")}')"
                style="padding:8px 6px;margin-bottom:4px;cursor:pointer;border-radius:4px;background:var(--surface-hover);display:flex;align-items:center;font-size:12px;border-left:4px solid ${colorMap[pn]};transition:opacity 0.2s;"
                onmouseover="this.style.opacity=0.7" onmouseout="this.style.opacity=1">
                <span style="display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:8px;background:${colorMap[pn]};flex-shrink:0;"></span>
                <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${pn}">${pn === '（空白/对照）' ? '对照' : pn}</span>
            </div>
        `).join('')}
        <div class="well-proto-option" style="padding:8px;cursor:pointer;border:1px solid var(--border);border-radius:4px;color:var(--text-secondary);font-size:12px;display:flex;justify-content:center;margin-top:8px;transition:background 0.2s;" onmouseover="this.style.background='var(--surface-hover)'" onmouseout="this.style.background='transparent'" onclick="_closeWellPopup()">取消</div>
    `;
    popup._onSelect = onSelect;
    
    popup.style.position = 'absolute';
    popup.style.zIndex = '9999';
    popup.style.background = 'var(--surface)';
    popup.style.border = '1px solid var(--border)';
    popup.style.borderRadius = 'var(--radius-md)';
    popup.style.padding = '10px';
    popup.style.boxShadow = 'var(--shadow-lg)';
    popup.style.width = '240px';
    popup.style.maxHeight = '300px';
    popup.style.overflowY = 'auto';

    document.body.appendChild(popup);
    _wellPopup = popup;

    let rect = anchorEl.getBoundingClientRect();
    let popW = 240, popH = popup.offsetHeight || 280;
    let left = rect.left + window.scrollX;
    let top = rect.bottom + window.scrollY + 4;
    if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
    if (top + popH > window.scrollY + window.innerHeight - 8) top = rect.top + window.scrollY - popH - 4;
    popup.style.left = Math.max(8, left) + 'px';
    popup.style.top = Math.max(8, top) + 'px';

    setTimeout(() => { document.addEventListener('click', _outsidePopupHandler); }, 10);
}

// ==========================================
// 加药实验历史记录
// ==========================================
const EXP_TYPE_COLORS = {
    passage:   { bg: '#e8f4ff', border: '#4a9eff', icon: 'ti-cell',        label: '传代' },
    experiment:{ bg: '#fff4e8', border: '#ff9f0a', icon: 'ti-pill',        label: '造模' },
    pcr_rna:   { bg: '#f0ffe8', border: '#30d158', icon: 'ti-droplet',     label: 'RNA提取' },
    pcr_rt:    { bg: '#f5f0ff', border: '#7c3aed', icon: 'ti-arrows-right-left', label: '逆转录' },
    pcr_qpcr:  { bg: '#fff0f5', border: '#ff375f', icon: 'ti-chart-line',  label: 'qPCR' },
};

window.renderExpHistory = async function() {
    let container = document.getElementById('dtHistory');
    if (!container) return;
    try {
        let res = await fetch('/api/experiments');
        let exps = await res.json();
        exps.sort((a,b) => b.created_at.localeCompare(a.created_at));

        if (exps.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="ti ti-flask ti-xl"></i><div style="margin-top:8px">暂无实验记录</div></div>';
            return;
        }
        let nowTime = new Date().getTime();
        container.innerHTML = exps.map(e => {
            // Dynamic completion check
            let isDone = false;
            if (e.force_status) {
                isDone = e.status === '已完成';
            } else {
                if (e.plates && e.plates.length > 0) {
                    let latestHarvest = Math.max(...e.plates.map(p => new Date(p.harvest_time || 0).getTime()));
                    if (nowTime > latestHarvest) {
                        isDone = true;
                    }
                } else if (e.status === '已完成') {
                    isDone = true;
                }
            }

            let key = `experiment:${e.id}`;
            let bgColor = isDone ? 'var(--surface-hover)' : 'var(--surface)';
            let statusIcon = isDone ? 'ti-check' : 'ti-clock';
            let statusColor = isDone ? 'var(--success)' : 'var(--warning)';
            let statusText = isDone ? '已完成' : '进行中';

            let extras = `
                <button class="btn btn-sm" style="padding:2px 7px;font-size:11px;background:var(--surface);border:1px solid ${statusColor};color:${statusColor};border-radius:6px;margin-right:4px;transition:all 0.2s;" title="切换状态"
                    onmouseover="this.style.background='${statusColor}';this.style.color='#fff'" onmouseout="this.style.background='var(--surface)';this.style.color='${statusColor}'"
                    onclick="event.stopPropagation();toggleExpStatus('${e.id}')"><i class="ti ${statusIcon}"></i></button>
                <button class="btn btn-sm btn-secondary" style="padding:2px 7px;font-size:11px;margin-right:4px;" onclick="event.stopPropagation();editExperiment('${e.id}')"><i class="ti ti-pencil"></i></button>
                <button class="btn btn-sm btn-danger" style="padding:2px 7px;" onclick="event.stopPropagation();deleteExpRecord('${e.id}')"><i class="ti ti-x"></i></button>`;
            return buildRecordCard({ key, type: 'experiment', data: e,
                meta: { icon: 'ti-pill', color: '#ff9f0a', typeLabel: isDone ? '造模·已完成' : '造模·进行中', bgColor: bgColor },
                extraButtons: extras });
        }).join('');
    } catch(e) { container.innerHTML = '<div class="empty-state">加载失败</div>'; }
};

window.toggleExpStatus = async function(id) {
    await fetch(`/api/experiments/${id}/toggle_status`, {method:'PUT'});
    showToast('状态已更新');
    renderExpHistory();
};

window.deleteExpRecord = async function(id) {
    if (!confirm('确定删除该实验记录？')) return;
    await fetch(`/api/experiments/${id}`, {method:'DELETE'});
    showToast('已删除');
    renderExpHistory();
};

window.editExperiment = async function(id) {
    let res = await fetch('/api/experiments');
    let exps = await res.json();
    let exp = exps.find(e => e.id === id);
    if (!exp) { showToast('找不到记录', 'error'); return; }

    window._curModelingExp = { ...exp };
    STATE.drugPlates = exp.plates || [];

    // 切换到设计 tab
    let designBtn = document.querySelector('[onclick*="dtDesign"]');
    if (designBtn) designBtn.click();

    showToast(`记录已载入：${exp.name}`);
    renderDrugDesign();
};

window.registerExperimentSamples = async function(id) {
    if (typeof openModule === 'function') await openModule('drug_treatment');
    let btn = document.querySelector('.tab-btn[onclick*="dtHarvest"]');
    if (btn) switchTab(btn, 'dtTab', 'dtHarvest');
    if (typeof HARVEST_STATE !== 'undefined') {
        HARVEST_STATE.cellSourceId = id;
        HARVEST_STATE.cellSelected.clear();
        HARVEST_STATE.cellBatches = [];
    }
    if (typeof loadCellHarvestModule === 'function') await loadCellHarvestModule();
};

window.saveExperimentSamples = async function(expId) {
    let modal = document.getElementById('sampleRegisterModal');
    if (!modal) return;
    let rows = Array.from(modal.querySelectorAll('.sample-row'));
    let count = 0;
    for (let row of rows) {
        if (!row.querySelector('.sr-check')?.checked) continue;
        let name = row.querySelector('.sr-name').value.trim();
        if (!name) continue;
        let tags = row.querySelector('.sr-tags').value.split(',').map(x => x.trim()).filter(Boolean);
        await fetch('/api/samples', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                source_type: '细胞造模',
                source_id: expId,
                source_label: row.querySelector('.sr-source')?.value.trim() || '细胞造模',
                group: row.querySelector('.sr-group')?.value.trim() || '',
                induction_scheme: row.querySelector('.sr-induction')?.value.trim() || '',
                duration: row.querySelector('.sr-duration')?.value.trim() || '',
                harvested_at: (row.querySelector('.sr-harvest')?.value || '').replace('T', ' '),
                material_type: row.querySelector('.sr-type').value,
                preservation: row.querySelector('.sr-pres').value.trim(),
                tags,
                status: '可用',
                notes: '由细胞造模实验收样登记'
            })
        });
        count++;
    }
    modal.remove();
    showToast(`已登记 ${count} 个样本`);
};




