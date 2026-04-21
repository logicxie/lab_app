/* ============================================================
   app.js — 实验小助手 v2 前端逻辑
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
    document.getElementById('expHub').style.display = 'none';
    document.querySelectorAll('.module-view').forEach(m => m.style.display = 'none');
    document.getElementById(`mod-${modId}`).style.display = 'block';
    
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
    } else if (modId === 'protocols') {
        await Promise.all([
            loadProtocols(),
            loadMwLibrary(),
            loadCellDb(),
            typeof loadPcrData === 'function' ? loadPcrData() : Promise.resolve()
        ]);
    }
}

function closeModule() {
    document.querySelectorAll('.module-view').forEach(m => m.style.display = 'none');
    document.getElementById('expHub').style.display = 'block';
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
async function initApp() {
    try {
        let res = await fetch('/api/config');
        CONFIG = await res.json();
    } catch(e) {
        console.error("加载配置失败", e);
    }
    
    // 初始化时加载首页数据
    loadHomeData();
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
                <div style="margin-top:8px;font-size:13px">当日暂无待办事项</div>
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
                    <button class="btn btn-sm btn-danger" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);padding:2px 6px;" onclick="event.stopPropagation();schDeleteSchedule('${s.id}')"><i class="ti ti-trash"></i></button>
                </div>`;
            });
        }
        
        html += `<div class="section-title"><i class="ti ti-flask"></i> 当日实验记录</div>`;
        if (data.experiments.length === 0 && data.passages.length === 0) {
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
// 手动新增日程安排 (Schedule)
// ============================================

window.schOpenCreateModal = function() {
    let old = document.getElementById('schCreateModal');
    if (old) old.remove();

    let year = STATE.selectedDate.getFullYear();
    let month = String(STATE.selectedDate.getMonth() + 1).padStart(2, '0');
    let day = String(STATE.selectedDate.getDate()).padStart(2, '0');
    let dateStr = `${year}-${month}-${day}`;
    // 预设下一个整点
    let now = new Date();
    let hr = String((now.getHours() + 1) % 24).padStart(2, '0');

    let modal = document.createElement('div');
    modal.id = 'schCreateModal';
    modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:99998;display:flex;align-items:flex-end;`;
    modal.innerHTML = `
        <div style="background:var(--surface);border-radius:20px 20px 0 0;width:100%;max-height:85vh;overflow-y:auto;padding:24px 16px 32px;box-shadow:0 -10px 20px rgba(0,0,0,0.1);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                <div style="font-size:16px;font-weight:700"><i class="ti ti-calendar-plus" style="color:var(--accent);"></i> 新建待办日程</div>
                <button onclick="document.getElementById('schCreateModal').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--text-secondary)">&times;</button>
            </div>
            
            <div class="form-group">
                <label class="form-label">待办项目名称</label>
                <input type="text" class="form-input" id="schItemName" placeholder="例如：野生型小鼠肝脏取材">
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
                <textarea class="form-textarea" id="schItemNotes" rows="3" placeholder="具体方案或注意事项摘要…"></textarea>
            </div>
            
            <button class="btn btn-primary btn-block" style="margin-top:12px;font-size:14px;height:44px;" onclick="schSaveSchedule()">
                <i class="ti ti-device-floppy"></i> 保存日程
            </button>
        </div>
    `;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
}

window.schSaveSchedule = async function() {
    let name = document.getElementById('schItemName').value;
    let time = document.getElementById('schItemTime').value; // YYYY-MM-DDTHH:mm
    let type = document.getElementById('schItemType').value;
    let notes = document.getElementById('schItemNotes').value;

    if (!name || !time) {
        showToast('项目名称和时间为必填项', 'error');
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
        document.getElementById('schCreateModal').remove();
        
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
                <input class="form-input" id="cdbName" placeholder="如: VSMC">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">基础培养基</label>
                    <input class="form-input" id="cdbMedia" placeholder="如: DMEM">
                </div>
                <div class="form-group">
                    <label class="form-label">FBS 浓度</label>
                    <input class="form-input" id="cdbFbs" placeholder="如: 10%">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">其他补充（可选）</label>
                <input class="form-input" id="cdbOthers" placeholder="如: 青链霉素 1%">
            </div>
            <button class="btn btn-secondary btn-block" onclick="createCellProfileFromBox()"><i class="ti ti-device-floppy"></i> 保存细胞档案</button>
            <div class="divider"></div>
            ${existingItems}
        </div>
    `;
}

async function createCellProfileFromBox() {
    let name = document.getElementById('cdbName').value.trim();
    let media = document.getElementById('cdbMedia').value.trim();
    let fbs = document.getElementById('cdbFbs').value.trim();
    let others = document.getElementById('cdbOthers').value.trim();

    if (!name || !media || !fbs) {
        showToast("名称/培养基/血清必填", "error");
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
        container.innerHTML = '<div class="empty-state">请先选择细胞档案</div>';
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
        
        // 如果比例 > 100%，源容器不够，提示警告
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
                    <input type="text" class="form-input" id="calcNote" placeholder="传代备注 (如: 第15代)">
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
        container.innerHTML = '<div class="empty-state">请先选择细胞档案</div>';
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
    
    showToast(`已加载修改项，修改后点击计算以生成新记录`);
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
                <input class="form-input" id="pName" placeholder="如: TGF-β 造模">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">基础培养基</label>
                    <input class="form-input" id="pBaseMedia" placeholder="如: DMEM" value="DMEM">
                </div>
                <div class="form-group">
                    <label class="form-label">FBS 浓度</label>
                    <input class="form-input" id="pFbsConc" placeholder="如: 10%" value="10%">
                </div>
            </div>
            <div style="font-size:12px;font-weight:600;margin:8px 0 4px;color:var(--text-secondary)">额外加药（可选）</div>
            <div id="protoDrugRows"><div style="font-size:12px;color:#999;padding:4px 0;">（无额外加药）</div></div>
            <button class="btn btn-sm btn-secondary" style="margin-bottom:10px" onclick="_addProtoDrug()"><i class="ti ti-plus"></i> 添加药物</button>
            <div class="form-group">
                <label class="form-label">备注（可选）</label>
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
        showToast("方案名称必填", "error");
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
                    <input class="form-input" id="mwNameIn" placeholder="例如: NaCl, DMSO">
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
        showToast("请输入有效的试剂名称和数值", "error");
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

function renderDilution() {
    let container = document.getElementById('dtDilution');
    if (!container) return;
    let opts = CONFIG.concentration_units.map(u=>`<option value="${u}">${u}</option>`).join('');
    
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
                <div style="font-size:12px;font-weight:600;color:var(--warning);margin-bottom:8px;"><i class="ti ti-bulb"></i> 若单位发生质量和摩尔互转（如 mg 到 μM），需提供摩尔质量：</div>
                <div class="form-row">
                    <div class="form-group" style="flex:2;margin:0">
                        <label class="form-label">调用档案库常用试剂</label>
                        <select class="form-select" onchange="document.getElementById('ccMw').value = this.value; this.options[this.selectedIndex].text !== '-- 自定义输入或不填 --' ? document.getElementById('ccName').value = this.options[this.selectedIndex].text.split(' ')[0] : null">
                            ${mwOpts}
                        </select>
                    </div>
                    <div class="form-group" style="flex:1;margin:0">
                        <label class="form-label">试剂名(选填)</label>
                        <input type="text" class="form-input" id="ccName" placeholder="如 NaCl">
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
            return buildRecordCard({ key, type: 'dilution', data: l, meta: { icon: 'ti-calculator', color: '#0a84ff', typeLabel: '浓度换算' }, extraButtons: extras });
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
        showToast("请输入完整的浓度和体积数值，不能为空", "error");
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

// 加药设计（板交互）
function addPlate(type) {
    let id = STATE.drugPlates.length;
    let cfg = CONFIG.plate_configs[type];
    let wells = {};
    for(let r=0; r<cfg.rows; r++) {
        for(let c=0; c<cfg.cols; c++) {
            wells[`${cfg.row_labels[r]}${c+1}`] = { protocol_name: '（空白/对照）' };
        }
    }
    
    let harvest = new Date();
    harvest.setDate(harvest.getDate() + 3);
    
    STATE.drugPlates.push({
        plate_name: `板 ${id+1}`,
        plate_type: type,
        wells: wells,
        induction_density: 70,
        starvation: false,
        starvation_hours: 12,
        media_change_freq: 2,
        media_change_ratio: "全换",
        harvest_time: harvest.toISOString().substring(0,16).replace('T', ' ')
    });
    renderDrugDesign();
}

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
    if (autoSaveModelingTimer) clearTimeout(autoSaveModelingTimer);
    if (immediate) {
        _doModelingAutoSave();
    } else {
        autoSaveModelingTimer = setTimeout(_doModelingAutoSave, 500);
    }
};
async function _doModelingAutoSave() {
    if(!window._curModelingExp) return;
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
    if (window._curModelingExp) {
        let payload = {
            status: window._curModelingExp.status,
            name: window._curModelingExp.name,
            cell_line: window._curModelingExp.cell_line,
            protocols: window._curModelingExp.protocols || [],
            plates: STATE.drugPlates
        };
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        navigator.sendBeacon(`/api/experiments/${window._curModelingExp.id}`, blob);
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
                    <i class="ti ti-player-play"></i> 开始新细胞造模实验
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
                <input type="text" id="ddSetupName" class="form-input" value="${expInfo.name || ''}" placeholder="例如：新建 TGF-b 诱导" oninput="updateModelingExpForm()">
            </div>
            <div class="form-group">
                <label class="form-label">实验细胞系</label>
                <div style="display:flex;gap:8px;">
                    <select class="form-select" id="ddSetupCellSel" style="flex:1;" onchange="document.getElementById('ddSetupCellIn').value = this.value; if(this.value){this.value='';} updateModelingExpForm();">
                        <option value="">-- 从档案库选择 --</option>
                        ${cellOpts}
                    </select>
                    <input type="text" id="ddSetupCellIn" class="form-input" value="${expInfo.cell_line || ''}" placeholder="或手动填写" style="flex:1;" oninput="updateModelingExpForm()">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">涉及的诱导方案</label>
                <div style="background:var(--surface-hover);padding:10px;border-radius:8px;border:1px solid var(--border)">
                    ${protoOpts || '<div style="color:var(--text-tertiary);font-size:12px">暂无可用方案，请先去方案库配置</div>'}
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
        <div style="font-size:12px;color:#888;margin-bottom:10px;">💡 点击 <b>左上角■</b> 全板 | 点击 <b>列号</b> 整列 | 点击 <b>行字母</b> 整行 | 点击 <b>孔位</b> 单孔 — 弹出方案选择</div>
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
        gridHtml += `<td class="plate-header plate-corner" title="点击选择全板方案" onclick="assignFullPlate(event,${pi})"
            style="width:${cs}px;height:${cs}px;font-size:${Math.round(cs*0.45)}px">■</td>`;
        for(let c=0; c<pcfg.cols; c++) {
            gridHtml += `<td class="plate-header plate-col-header" title="点击分配第${c+1}列" onclick="assignColumn(event,${pi},${c})"
                style="width:${ws}px;font-size:${fs}px"><b>${c+1}</b></td>`;
        }
        gridHtml += `</tr>`;
        
        for(let r=0; r<pcfg.rows; r++) {
            gridHtml += `<tr>`;
            gridHtml += `<td class="plate-header plate-row-header" title="点击分配第${pcfg.row_labels[r]}行" onclick="assignRow(event,${pi},${r})"
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
                    <div class="form-group"><label class="form-label">换液(天)</label><input type="number" class="form-input" value="${plate.media_change_freq}" onchange="updatePlate(${pi},'media_change_freq',this.value)"></div>
                    <div class="form-group"><label class="form-label">收样</label><input type="datetime-local" class="form-input" value="${plate.harvest_time.replace(' ', 'T')}" onchange="updatePlate(${pi},'harvest_time',this.value.replace('T', ' '))"></div>
                </div>
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
        let payload = { name: "新建造模实验", cell_line: "", protocols: [], plates: [] };
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
    if(!window._curModelingExp.name) return showToast("请输入实验名称", "error");
    if(!window._curModelingExp.protocols || window._curModelingExp.protocols.length === 0) return showToast("请至少选择一个造模方案", "error");
    if(STATE.drugPlates.length === 0) return showToast("无任何板，请至少添加一块", "error");
    
    // Status stays as "进行中" until all plates are harvested
    window._curModelingExp.status = "进行中";
    try {
        await autoSaveModeling(true);
        window._curModelingExp = null;
        STATE.drugPlates = [];
        renderDrugDesign();
        showToast("实验已完成，日程排期已生成！");
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
    let harvest = new Date();
    harvest.setDate(harvest.getDate() + 3);
    STATE.drugPlates.push({
        plate_name: `板 ${id+1}`,
        plate_type: type,
        wells: wells,
        induction_density: 70,
        starvation: false,
        starvation_hours: 12,
        media_change_freq: 2,
        media_change_ratio: "全换",
        harvest_time: harvest.toISOString().substring(0,16).replace('T', ' ')
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

    showToast(`已恢复「${exp.name}」，修改后点击确认可覆盖或生成新排期`);
    renderDrugDesign();
};




