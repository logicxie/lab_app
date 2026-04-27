/* ============================================================
   pcr.js — PCR 模块前端逻辑 (RNA -> RT -> qPCR)
   ============================================================ */

const pcrStyle = document.createElement('style');
pcrStyle.innerHTML = `
    .pcr-layout { padding: 10px 0; }
    .step-list { margin: 12px 0; }
    .step-item { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; background: var(--surface); padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border); transition: all 0.2s; }
    .step-item.checked { opacity: 0.5; text-decoration: line-through; border-color: var(--success); }
    .step-checkbox { width: 20px; height: 20px; cursor: pointer; flex-shrink: 0; }
    
    .rt-table-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 12px 0; }
    .rt-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .rt-table th { background: var(--surface-hover); padding: 8px; text-align: center; border-bottom: 2px solid var(--border); white-space: nowrap; }
    .rt-table td { padding: 6px; text-align: center; border-bottom: 1px solid var(--border); vertical-align: middle; }
    .rt-input { width: 68px; padding: 4px 6px; border: 1.5px solid var(--border); border-radius: 4px; text-align: center; font-size: 13px; }
    .rt-input:focus { border-color: var(--accent); outline: none; }
    .rt-input.error { border-color: var(--danger); background: rgba(255,59,48,0.05); }
    
    .strips-container { display: flex; flex-wrap: wrap; gap: 16px; margin: 12px 0; align-items: flex-start; }
    .strip-wrapper { display: flex; flex-direction: column; }
    .strip-8 { display: flex; flex-direction: row; gap: 4px; background: rgba(0,0,0,0.04); padding: 8px; border-radius: 8px; }
    .strip-tube { width: 32px; height: 32px; border-radius: 50%; border: 2px solid rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: center; font-size: 9px; background: var(--surface); color: var(--text); font-weight: 700; overflow: hidden; line-height: 1.1; word-break: break-all; transition: background 0.2s; cursor: pointer; }
    .strip-tube.filled { background: var(--accent); color: white; border-color: transparent; }
    .rt-pop-opt { padding: 8px 12px; font-size: 13px; cursor: pointer; border-bottom: 1px solid var(--border); }
    .rt-pop-opt:hover { background: var(--surface-hover); }
    
    .plate-384-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 16px 0; padding-bottom: 8px; }
    .plate-384 { border-spacing: 1.5px; border-collapse: separate; margin: 0; user-select: none; table-layout: fixed; width: max-content; }
    .plate-384-cell { width: 20px; min-width: 20px; max-width: 20px; height: 20px; min-height: 20px; max-height: 20px; padding: 0; box-sizing: border-box; border-radius: 3px; border: 1px solid rgba(0,0,0,0.15); font-size: 8px; text-align: center; cursor: pointer; position: relative; overflow: hidden; background: var(--surface); }
    .plate-384-cell:hover::after { content:''; position:absolute; inset:0; box-shadow: 0 0 0 2px var(--info) inset; border-radius: 3px; }
    .plate-384-cell.selected { box-shadow: 0 0 0 2px var(--warning) inset; }
    .plate-384-cell-content { transform: scale(0.85); pointer-events: none; white-space: nowrap; font-weight: 600; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
    .plate-nav-label { font-size: 10px; font-weight: bold; color: var(--text-secondary); text-align: center; width: 24px; min-width: 24px; height: 24px; }
    
    .color-legend { display: flex; flex-wrap: wrap; gap: 10px; margin: 12px 0; font-size: 12px; }
    .legend-tag { display: inline-flex; align-items: center; gap: 4px; background: var(--surface); border: 1px solid var(--border); padding: 4px 8px; border-radius: 4px; }
    .color-dot { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
    
    .qpcr-toolbar { display: flex; flex-wrap: wrap; gap: 10px; background: var(--surface-hover); padding: 12px; border-radius: var(--radius-sm); margin-bottom: 12px; align-items: center; }
    .history-card { cursor: pointer; border-left: 3px solid transparent; }
    .history-card:hover { border-color: var(--accent); background: var(--surface-hover); }
`;
document.head.appendChild(pcrStyle);

let PCR_STATE = {
    sampleGroups: [], drugProtocols: [],
    rnaProtocols: [], rnaLogs: [],
    rtProtocols: [], rtLogs: [],
    qpcrProtocols: [], qpcrLogs: [],
    activeRnaStepsCheck: [],
    rtCurrentSamples: [],
    rtStripMap: [],
    qpcrSelectedWells: new Set(),
    qpcrPlateMap: {},
    qpcrGenes: [],
    qpcrSamples: [],
    activeRtStepsCheck: [],
    activeQpcrStepsCheck: []
};

const M_COLORS = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8", "#FFD93D", "#FF8B94", "#A8E6CF", "#3498DB", "#9B59B6"];
function getColor(index) { return M_COLORS[index % M_COLORS.length]; }

let autoSaveTimers = {};
window.autoSaveExp = function (cat, immediate = false) {
    if (autoSaveTimers[cat]) clearTimeout(autoSaveTimers[cat]);
    if (immediate) {
        _doAutoSave(cat);
    } else {
        autoSaveTimers[cat] = setTimeout(() => _doAutoSave(cat), 300);
    }
}

// 离开页面时自动将进行中的实验即时保存（使用 sendBeacon 保证退出时不丢失数据）
window.addEventListener('beforeunload', function () {
    ['sg', 'rna', 'rt', 'qpcr'].forEach(cat => {
        let exp;
        if (cat === 'sg') { exp = window._curPcrSampleGroup; }
        else if (cat === 'rna') { exp = window._curRnaExp; if (exp) exp.activeCheck = PCR_STATE.activeRnaStepsCheck; }
        else if (cat === 'rt') { exp = window._curRtExp; if (exp) { exp.samples = PCR_STATE.rtCurrentSamples; exp.stripMap = PCR_STATE.rtStripMap; exp.activeCheck = PCR_STATE.activeRtStepsCheck; } }
        else if (cat === 'qpcr') { exp = window._curQpcrExp; if (exp) { exp.plate_map = PCR_STATE.qpcrPlateMap; exp.samples = PCR_STATE.qpcrSamples; exp.activeCheck = PCR_STATE.activeQpcrStepsCheck; } }

        if (exp) {
            const blob = new Blob([JSON.stringify(exp)], { type: 'application/json' });
            let url = cat === 'sg' ? '/api/pcr/samples/groups' : `/api/pcr/${cat}/logs`;
            navigator.sendBeacon(url, blob);
        }
    });
});
async function _doAutoSave(cat) {
    let exp;
    let url = `/api/pcr/${cat}/logs`;
    if (cat === 'sg') {
        exp = window._curPcrSampleGroup;
        url = `/api/pcr/samples/groups`;
    } else if (cat === 'rna') {
        exp = window._curRnaExp;
        if (exp) exp.activeCheck = PCR_STATE.activeRnaStepsCheck;
    } else if (cat === 'rt') {
        exp = window._curRtExp;
        if (exp) { exp.samples = PCR_STATE.rtCurrentSamples; exp.stripMap = PCR_STATE.rtStripMap; exp.activeCheck = PCR_STATE.activeRtStepsCheck; }
    } else if (cat === 'qpcr') {
        exp = window._curQpcrExp;
        if (exp) { exp.plate_map = PCR_STATE.qpcrPlateMap; exp.samples = PCR_STATE.qpcrSamples; exp.activeCheck = PCR_STATE.activeQpcrStepsCheck; }
    }
    if (!exp) return;
    try {
        let res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(exp) });
        let data = await res.json();
        if (data && data.id && !exp.id) exp.id = data.id;

        if (cat !== 'sg') {
            let rs = await fetch(`/api/pcr/${cat}/logs`);
            PCR_STATE[`${cat}Logs`] = await rs.json();
            renderPcrHistory(cat);
            // 上游数据更新时，同步刷新下游模块的来源下拉
            if (cat === 'rna') _refreshRtRnaSelect();
            if (cat === 'rt') _refreshQpcrRtSelect();
        } else {
            let rs = await fetch('/api/pcr/samples/groups');
            PCR_STATE.sampleGroups = await rs.json();
            // 仅仅为了记录ID和不刷新当前表格避免失焦
        }
    } catch (e) { }
}

// 仅刷新 RT 页面的 RNA 来源下拉，不重绘整个 RT 界面（避免丢失进行中状态）
function _refreshRtRnaSelect() {
    let sel = document.getElementById('rtExpRnaLog');
    if (!sel) return; // RT 页面未渲染或用户不在 RT tab，忽略
    let prev = sel.value; // 记住当前选中项
    let completed = PCR_STATE.rnaLogs.filter(l => l.status === '已完成');
    let all = PCR_STATE.rnaLogs;
    // 如果 RT 主区域还处于「先完成RNA」的空状态，检查现在是否可以展示入口
    let working = document.getElementById('rtExpWorking');
    let rtCard = document.getElementById('pcrRt');
    // 只更新下拉，不整体重渲
    sel.innerHTML = all.map(l =>
        `<option value="${l.id}"${l.id === prev ? ' selected' : ''}>${l.name} (${l.samples.length}样)${l.status === '已完成' ? '' : ' [进行中]'
        }</option>`
    ).join('');
    // 如果之前选中的还在就保持，否则选第一个
    if (!all.find(l => l.id === prev) && all.length > 0) sel.value = all[0].id;

    // 若整个 RT 卡片目前显示的是「先进行RNA」的空状态，重新渲染让入口出现
    if (rtCard && all.length > 0 && rtCard.querySelector('.empty-state')) {
        renderPcrRt();
    }
}

// 仅刷新 qPCR 页面的 RT 来源下拉，不重绘整个 qPCR 界面
function _refreshQpcrRtSelect() {
    let sel = document.getElementById('qExpRtLog');
    if (!sel) return;
    let prev = sel.value;
    let all = PCR_STATE.rtLogs;
    sel.innerHTML = all.map(l =>
        `<option value="${l.id}"${l.id === prev ? ' selected' : ''}>${l.name}${l.status === '已完成' ? '' : ' [进行中]'
        }</option>`
    ).join('');
    if (!all.find(l => l.id === prev) && all.length > 0) sel.value = all[0].id;
    // 若 qPCR 卡片仍显示空状态，整体重渲让入口出现
    let qCard = document.getElementById('pcrQpcr');
    if (qCard && all.length > 0 && qCard.querySelector('.empty-state')) {
        renderPcrQpcr();
    }
}


async function loadPcrData() {
    try {
        let rs = await Promise.all([
            fetch('/api/pcr/rna/protocols'), fetch('/api/pcr/rna/logs'),
            fetch('/api/pcr/rt/protocols'), fetch('/api/pcr/rt/logs'),
            fetch('/api/pcr/qpcr/protocols'), fetch('/api/pcr/qpcr/logs'),
            fetch('/api/pcr/samples/groups'), fetch('/api/protocols')
        ]);
        PCR_STATE.rnaProtocols = await rs[0].json();
        PCR_STATE.rnaLogs = await rs[1].json();
        PCR_STATE.rtProtocols = await rs[2].json();
        PCR_STATE.rtLogs = await rs[3].json();
        PCR_STATE.qpcrProtocols = await rs[4].json();
        PCR_STATE.qpcrLogs = await rs[5].json();
        PCR_STATE.sampleGroups = await rs[6].json();
        PCR_STATE.drugProtocols = await rs[7].json();

        if (typeof renderPcrSamples === 'function') renderPcrSamples();
        renderPcrRna();
        renderPcrRt();
        renderPcrQpcr();
        if (typeof renderPcrProtocols === 'function') renderPcrProtocols();
    } catch (e) { }
}

async function savePcrItem(cat, type, payload) {
    await fetch(`/api/pcr/${cat}/${type}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    await loadPcrData();
    showToast("保存成功！");
}

async function deletePcrItem(cat, type, id, e) {
    if (e) e.stopPropagation();
    if (!confirm("确定删除？")) return;
    await fetch(`/api/pcr/${cat}/${type}/${id}`, { method: 'DELETE' });
    showToast("已删除");
    await loadPcrData();
}

window.renderPcrHistory = function (cat) {
    let container = document.getElementById(`pcr${cat}HistoryDiv`);
    if (!container) return;
    let logs = PCR_STATE[`${cat}Logs`];
    if (logs.length === 0) {
        container.innerHTML = '<div class="empty-state">暂无记录</div>';
        return;
    }
    const META = {
        rna: { icon: 'ti-droplet', color: '#30d158', typeLabel: 'RNA提取' },
        rt: { icon: 'ti-arrows-right-left', color: '#7c3aed', typeLabel: '逆转录' },
        qpcr: { icon: 'ti-chart-line', color: '#ff375f', typeLabel: 'qPCR' },
    };
    let sorted = [...logs].reverse();
    container.innerHTML = sorted.map(l => {
        let isDraft = l.status === '中途保存' || l.status === '进行中';
        let key = `${cat}:${l.id}`;
        let extras = `
            <button class="btn btn-sm btn-secondary" style="padding:2px 7px; margin-right:4px;" onclick="event.stopPropagation();_pcrEditLog('${cat}','${l.id}')"><i class="ti ti-pencil"></i></button>
            <button class="btn btn-sm btn-danger" style="padding:2px 7px;" onclick="event.stopPropagation();deletePcrItem('${cat}','logs','${l.id}', event)"><i class="ti ti-x"></i></button>`;

        let m = { ...META[cat] };
        if (isDraft) {
            m.typeLabel += ' · 中途保存';
            m.color = '#888';
            m.bgColor = '#f5f6f8';
        } else if (cat === 'qpcr' && l.status === '未计算FC') {
            m.typeLabel += ' · 未计算FC';
            m.color = '#f59e0b';
        } else if (cat === 'qpcr' && l.status === '已计算FC值') {
            m.typeLabel += ' · 已计算FC值';
            m.color = '#10b981';
        }

        if (l.activeCheck && l.activeCheck.length > 0) {
            let done = l.activeCheck.filter(Boolean).length;
            let total = l.activeCheck.length;
            m.typeLabel += ` · 步骤 ${done}/${total}`;
            if (done === total) m.typeLabel += ' ✅';
        }

        return buildRecordCard({ key, type: 'pcr_' + cat, data: l, meta: m, extraButtons: extras });
    }).join('');
}

window._pcrEditLog = function (cat, id) {
    let log = PCR_STATE[cat + 'Logs'].find(l => l.id === id);
    if (!log) return;
    let exp = JSON.parse(JSON.stringify(log));
    if (cat === 'rna') {
        window._curRnaExp = exp;
        PCR_STATE.activeRnaStepsCheck = exp.activeCheck || new Array((exp.steps||[]).length).fill(false);
        renderPcrRna();
        document.getElementById('pcrRna').scrollIntoView({ behavior: 'smooth' });
    } else if (cat === 'rt') {
        window._curRtExp = exp;
        PCR_STATE.rtCurrentSamples = exp.samples || [];
        PCR_STATE.rtStripMap = exp.stripMap || [];
        PCR_STATE.activeRtStepsCheck = exp.activeCheck || [];
        renderPcrRt();
        document.getElementById('pcrRt').scrollIntoView({ behavior: 'smooth' });
    } else if (cat === 'qpcr') {
        window._curQpcrExp = exp;
        PCR_STATE.qpcrPlateMap = exp.plate_map || {};
        PCR_STATE.qpcrSamples = exp.samples || [];
        PCR_STATE.qpcrGenes = exp.genes || [];
        PCR_STATE.qpcrSelectedWells = new Set();
        PCR_STATE.activeQpcrStepsCheck = exp.activeCheck || [];
        renderPcrQpcr();
        document.getElementById('pcrQpcr').scrollIntoView({ behavior: 'smooth' });
    }
}

window.renderPcrProtocols = function () {
    let c = document.getElementById('pcrProtocolsContainer');
    if (!c) return;

    c.innerHTML = `
        <div class="card">
            <div class="card-header"><i class="ti ti-droplet"></i> RNA 提取方案</div>
            <div class="form-group"><input class="form-input" id="rnaPName" placeholder="方案名 (例如: Trizol)"></div>
            <div class="form-group"><textarea class="form-textarea" id="rnaPSteps" placeholder="加1ml Trizol\\n震荡..."></textarea></div>
            <button class="btn btn-secondary btn-block" onclick="saveRnaProtocol()"><i class="ti ti-device-floppy"></i> 保存 RNA 方案</button>
            <div class="divider"></div>
            ${PCR_STATE.rnaProtocols.map(p => `
                <div class="list-item" style="padding:6px;margin-top:6px;">
                    <span style="font-size:13px">${p.name} (${p.steps.length}步)</span>
                    <div>
                        <button class="btn btn-sm btn-secondary" style="padding:2px 7px; margin-right:4px;" onclick="editRnaP('${p.id}')"><i class="ti ti-pencil"></i></button>
                        <button class="btn btn-sm btn-danger" onclick="deletePcrItem('rna','protocols','${p.id}', event)"><i class=\"ti ti-x\"></i></button>
                    </div>
                </div>
            `).join('')}
        </div>
        
        <div class="card">
            <div class="card-header"><i class="ti ti-arrows-right-left"></i> 逆转录方案</div>
            <div class="form-group"><input class="form-input" id="rtPName" placeholder="如: 诺唯赞 RT Kit"></div>
            <div class="form-group"><textarea class="form-textarea" id="rtPSteps" placeholder="步骤提示 (此步骤支持多行，保存后将在实验页面呈现为可折叠提示)..."></textarea></div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">总量(μL)</label><input type="number" id="rtPTotal" class="form-input" value="20"></div>
                <div class="form-group"><label class="form-label">酶用量(μL)</label><input type="number" id="rtPEnz" class="form-input" value="4"></div>
                <div class="form-group"><label class="form-label">总RNA(ng)</label><input type="number" id="rtPRna" class="form-input" value="1000"></div>
            </div>
            <button class="btn btn-secondary btn-block" onclick="saveRtProtocol()"><i class="ti ti-device-floppy"></i> 保存 RT 方案</button>
            <div class="divider"></div>
            ${PCR_STATE.rtProtocols.map(p => `
                <div class="list-item" style="padding:6px;margin-top:6px;">
                    <span style="font-size:13px">${p.name} (水:${p.total_vol - p.enzyme_vol}μl前)</span>
                    <div>
                        <button class="btn btn-sm btn-secondary" style="padding:2px 7px; margin-right:4px;" onclick="editRtP('${p.id}')"><i class="ti ti-pencil"></i></button>
                        <button class="btn btn-sm btn-danger" onclick="deletePcrItem('rt','protocols','${p.id}', event)"><i class=\"ti ti-x\"></i></button>
                    </div>
                </div>
            `).join('')}
        </div>
        
        <div class="card">
            <div class="card-header"><i class="ti ti-chart-line"></i> qPCR 体系方案</div>
            <div class="form-group"><label class="form-label" style="font-size:12px;color:var(--text-secondary);">体系名称</label><input class="form-input" id="qPName" placeholder="方案名 (如 10ul SYBR)"></div>
            <div class="form-group"><textarea class="form-textarea" id="qPSteps" placeholder="步骤提示 (此步骤支持多行，保存后将在实验页面呈现为可折叠提示)..."></textarea></div>
            <div class="form-row"><div class="form-group"><label class="form-label" style="font-size:12px;color:var(--text-secondary);">孔板单孔总液量 (μL)</label><input type="number" id="qPTotal" value="10" placeholder="总量" class="form-input"></div><div class="form-group"><label class="form-label" style="font-size:12px;color:var(--text-secondary);">SYBR/Mix (μL)</label><input type="number" id="qPSybr" value="5" placeholder="SYBR" class="form-input"></div></div>
            <div class="form-row"><div class="form-group"><label class="form-label" style="font-size:12px;color:var(--text-secondary);">引物 (μL)</label><input type="number" id="qPPrimer" value="1" placeholder="引物" class="form-input"></div><div class="form-group"><label class="form-label" style="font-size:12px;color:var(--text-secondary);">cDNA (μL)</label><input type="number" id="qPCdna" value="1" placeholder="cDNA" class="form-input"></div></div>
            <button class="btn btn-secondary btn-block" onclick="saveQpcrProtocol()"><i class="ti ti-device-floppy"></i> 保存 qPCR 体系</button>
            <div class="divider"></div>
            ${PCR_STATE.qpcrProtocols.map(p => `<div class="list-item" style="padding:6px;margin-top:6px;"><span style="font-size:13px">${p.name} (水:${p.well_vol - p.sybr_vol - p.primer_vol - p.cdna_vol}μl)</span><div><button class="btn btn-sm btn-secondary" style="padding:2px 7px; margin-right:4px;" onclick="editQpcrP('${p.id}')"><i class="ti ti-pencil"></i></button><button class="btn btn-sm btn-danger" onclick="deletePcrItem('qpcr','protocols','${p.id}',event)"><i class=\"ti ti-x\"></i></button></div></div>`).join('')}
        </div>
    `;
}

// -------------------------------------------------------- 样本设定 (Samples)
window.renderPcrSamples = function () {
    let c = document.getElementById('pcrSamples');
    if (!c) return;

    let schemeCheckboxes = PCR_STATE.drugProtocols.length === 0 ?
        '<span style="font-size:12px;color:#888;">无方案记录，请在方案库配置</span>' :
        PCR_STATE.drugProtocols.map(p => `
            <label style="display:flex; align-items:center; gap:6px; font-size:13px; cursor:pointer;" class="smp-scheme-label">
                <input type="checkbox" class="smp-scheme-cb" value="${p.id}" data-name="${p.name}" style="width:16px;height:16px;cursor:pointer;">
                ${p.name}
            </label>
        `).join('');

    let isOngoing = !!window._curPcrSampleGroup;
    let setupHtml = ``;

    if (!isOngoing) {
        setupHtml = `
        <div class="card" style="margin-top:8px;">
            <div class="card-header"><i class="ti ti-users"></i> 新建样本组</div>
            <div class="form-group"><input class="form-input" id="smpGroupName" placeholder="样本组名称 (如: A549 缺氧模型)"></div>
            <div class="form-group"><input class="form-input" id="smpGroupSource" placeholder="样本来源 (如: A549 细胞)"></div>
            <div class="form-group">
                <label class="form-label" style="display:block;margin-bottom:8px;">涉及的诱导方案 (可多选)</label>
                <div id="smpGroupSchemes" style="display:flex; flex-wrap:wrap; gap:12px; padding: 10px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm);">
                    ${schemeCheckboxes}
                </div>
            </div>
            <button class="btn btn-primary btn-block" style="margin-top: 12px;" onclick="startPcrSampleGroup()"><i class="ti ti-player-play"></i> 开始设定</button>
        </div>`;
    } else {
        let g = window._curPcrSampleGroup;
        let pNames = g.induction_schemes.map(sid => {
            let p = PCR_STATE.drugProtocols.find(dp => dp.id === sid);
            return p ? p.name : sid;
        }).join(', ');

        setupHtml = `
        <div class="card" style="margin-top:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <h3 style="margin:0;font-size:16px;">[${g.name}]</h3>
                    <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">来源: ${g.source || '-'} | 方案: ${pNames || '-'}</div>
                </div>
                <button class="btn btn-sm btn-secondary" onclick="window._curPcrSampleGroup=null;window._currentEditingSmpGroup=null;renderPcrSamples()"><i class="ti ti-x"></i> 取消设定</button>
            </div>
            
            <div class="divider"></div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
                <label class="form-label" style="margin:0;">样本列表</label>
                <button class="btn btn-sm btn-secondary" onclick="addPcrSampleRow()"><i class="ti ti-plus"></i> 添加样本</button>
            </div>
            
            <div class="rt-table-wrapper">
                <table class="rt-table" id="smpGroupTable">
                    <thead><tr><th>样本名称</th><th>诱导方案/组别</th><th>时间点(天/时)</th><th style="width:50px;">操作</th></tr></thead>
                    <tbody id="smpGroupTbody"></tbody>
                </table>
            </div>
            <button class="btn btn-success btn-block" style="margin-top:12px;" onclick="saveSampleGroup()"><i class="ti ti-circle-check"></i> 确认保存配置</button>
        </div>`;
    }

    let historyHtml = `
        <div class="divider"></div>
        <div class="section-title"><i class="ti ti-database"></i> 已保存的样本组</div>
        ${PCR_STATE.sampleGroups.length === 0 ? '<div class="empty-state">暂无样本组</div>' : PCR_STATE.sampleGroups.map(g => {
        let key = 'sg_' + g.id;
        let extras = `<button class="btn btn-sm btn-secondary" style="padding:2px 7px; margin-right:4px;" onclick="event.stopPropagation();viewSampleGroup('${g.id}')"><i class="ti ti-pencil"></i></button>
            <button class="btn btn-sm btn-danger" style="padding:2px 7px;" onclick="event.stopPropagation();deletePcrItem('samples','groups','${g.id}', event)"><i class="ti ti-x"></i></button>`;
        let schemeNames = (g.induction_schemes || []).map(sid => {
            let p = PCR_STATE.drugProtocols.find(dp => dp.id === sid);
            return p ? p.name : sid;
        });

        let isDraft = g.status === '中途保存';
        let bgColor = isDraft ? '#f5f6f8' : 'var(--surface)';
        let titleLabel = isDraft ? '样本组 · 中途保存' : '样本组 · ' + (g.samples || []).length + '个样本';

        return (typeof buildRecordCard === 'function') ? buildRecordCard({
            key,
            type: 'pcr_sample_group',
            data: { ...g, timestamp: '', induction_schemes: schemeNames },
            meta: { icon: 'ti-users', color: isDraft ? '#888' : '#3498DB', typeLabel: titleLabel, bgColor: bgColor },
            extraButtons: extras
        }) : '<div class="list-item">加载失败</div>';
    }).join('')}
    `;

    c.innerHTML = setupHtml + historyHtml;

    if (isOngoing) {
        let tbody = document.getElementById('smpGroupTbody');
        if (tbody) {
            tbody.innerHTML = '';
            if (window._curPcrSampleGroup.samples.length === 0) {
                addPcrSampleRow();
            } else {
                window._curPcrSampleGroup.samples.forEach(s => addPcrSampleRow(s));
            }
        }
    }
}

window.startPcrSampleGroup = function () {
    let name = document.getElementById('smpGroupName').value.trim();
    let source = document.getElementById('smpGroupSource').value.trim();
    if (!name) return showToast("请输入样本组名称", "error");

    let schemes = [];
    document.querySelectorAll('.smp-scheme-cb:checked').forEach(cb => schemes.push(cb.value));

    window._curPcrSampleGroup = {
        name, source, induction_schemes: schemes, samples: [], status: "中途保存"
    };
    renderPcrSamples();
    autoSaveExp('sg', true);
}

window.sgSyncTable = function () {
    if (!window._curPcrSampleGroup) return;
    let tbody = document.getElementById('smpGroupTbody');
    if (!tbody) return;
    let samples = [];
    tbody.querySelectorAll('tr').forEach(tr => {
        let inputs = tr.querySelectorAll('.rt-input');
        samples.push({ name: inputs[0].value.trim(), group: inputs[1].value, day: inputs[2].value.trim() });
    });
    window._curPcrSampleGroup.samples = samples;
    autoSaveExp('sg');
}

window.addPcrSampleRow = function (existingSample = null) {
    let tbody = document.getElementById('smpGroupTbody');
    if (!tbody) return;

    let schemeOpts = '<option value="对照组">对照组 (Control)</option>';
    let selectedSchemes = window._curPcrSampleGroup ? window._curPcrSampleGroup.induction_schemes : [];

    selectedSchemes.forEach(sid => {
        let p = PCR_STATE.drugProtocols.find(dp => dp.id === sid);
        let pName = p ? p.name : sid;
        schemeOpts += `<option value="${pName}">${pName}</option>`;
    });

    let tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="text" class="rt-input" style="width:100%;box-sizing:border-box;" placeholder="名字 (如 S1)" value="${existingSample ? existingSample.name : ''}" oninput="sgSyncTable()"></td>
        <td><select class="rt-input" style="width:100%;box-sizing:border-box;" onchange="sgSyncTable()">${schemeOpts}</select></td>
        <td><input type="text" class="rt-input" style="width:100%;box-sizing:border-box;" placeholder="数值(例:1)" value="${existingSample ? existingSample.day : '1'}" oninput="sgSyncTable()"></td>
        <td style="width:50px;text-align:center;"><button class="btn btn-sm btn-danger" onclick="this.closest('tr').remove();sgSyncTable()"><i class="ti ti-minus"></i></button></td>
    `;

    if (existingSample && existingSample.group) {
        let selectEl = tr.querySelector('select');
        let optionExists = Array.from(selectEl.options).some(o => o.value === existingSample.group);
        if (!optionExists) {
            selectEl.insertAdjacentHTML('beforeend', `<option value="${existingSample.group}">${existingSample.group}</option>`);
        }
        selectEl.value = existingSample.group;
    }

    tbody.appendChild(tr);
}

window.saveSampleGroup = async function () {
    if (!window._curPcrSampleGroup) return;

    let samples = [];
    let tbody = document.getElementById('smpGroupTbody');
    if (tbody) {
        tbody.querySelectorAll('tr').forEach(tr => {
            let inputs = tr.querySelectorAll('.rt-input');
            let sname = inputs[0].value.trim();
            if (sname) {
                samples.push({ name: sname, group: inputs[1].value, day: inputs[2].value.trim() });
            }
        });
    }
    if (samples.length === 0) return showToast("请添加至少一个样本", "error");

    let payload = {
        name: window._curPcrSampleGroup.name,
        source: window._curPcrSampleGroup.source,
        induction_schemes: window._curPcrSampleGroup.induction_schemes,
        induction_days: [], // 保留空数组保持向下兼容
        samples,
        status: "已完成"
    };

    if (window._currentEditingSmpGroup) {
        payload.id = window._currentEditingSmpGroup;
    }

    try {
        await fetch('/api/pcr/samples/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        showToast("保存样本组配置成功！");
        window._curPcrSampleGroup = null;
        window._currentEditingSmpGroup = null;
        await loadPcrData();
    } catch (e) { }
}

window.viewSampleGroup = function (id) {
    let g = PCR_STATE.sampleGroups.find(x => x.id === id);
    if (!g) return;

    window._currentEditingSmpGroup = g.id;
    window._curPcrSampleGroup = JSON.parse(JSON.stringify(g));

    renderPcrSamples();
    showToast(`已加载「${g.name}」配置信息`);
}

// -------------------------------------------------------- RNA
window.renderPcrRna = function () {
    let c = document.getElementById('pcrRna');
    if (!c) return;
    let hasExp = !!window._curRnaExp;
    let noProto = PCR_STATE.rnaProtocols.length === 0;
    let workHtml = '';
    if (hasExp) {
        let exp = window._curRnaExp;
        let protoOptions = PCR_STATE.rnaProtocols.map(p => `<option value="${p.id}" ${p.id === exp.protocol_id ? 'selected' : ''}>${p.name}</option>`).join('');
        let groupOptions = '<option value="">-- 手动输入或自动导入 --</option>' + PCR_STATE.sampleGroups.map(g => `<option value="${g.id}">${g.name} (${(g.samples||[]).length}样)</option>`).join('');
        let samplesStr = (exp.samples || []).map(s => s.original || s.name || s).join(', ');
        let steps = exp.steps || [];
        let checks = PCR_STATE.activeRnaStepsCheck || [];
        let stepsHtml = steps.map((s, i) => `
            <label class="step-item ${checks[i] ? 'checked' : ''}" id="rnaStepItem_${i}">
                <input type="checkbox" class="step-checkbox" ${checks[i] ? 'checked' : ''} onchange="toggleRnaStep(${i}, this.checked)">
                <div><b>Step ${i + 1}.</b> ${s}</div>
            </label>`).join('');
        workHtml = `
        <div class="card" style="margin-top:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <div style="font-weight:700;font-size:15px;"><i class="ti ti-microscope" style="color:var(--primary)"></i> RNA 提取实验</div>
                <button class="btn btn-sm btn-secondary" onclick="window._curRnaExp=null;PCR_STATE.activeRnaStepsCheck=[];renderPcrRna()"><i class="ti ti-x"></i></button>
            </div>
            <div class="form-group"><label class="form-label">实验名称</label><input class="form-input" id="rnaExpName" value="${exp.name || ''}" placeholder="如：第一批RNA提取" oninput="if(window._curRnaExp)window._curRnaExp.name=this.value"></div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">提取方案</label><select class="form-select" id="rnaExpProto" onchange="_onRnaProtoChange()">${protoOptions}</select></div>
                <div class="form-group"><label class="form-label">从样本组导入</label><select class="form-select" id="rnaExpGroupSelect" onchange="onRnaGroupSelect(this.value)">${groupOptions}</select></div>
            </div>
            <div class="form-group"><label class="form-label">样本列表 (逗号分隔)</label><input class="form-input" id="rnaExpSamples" value="${samplesStr}" placeholder="S1, S2, S3"></div>
            ${steps.length > 0 ? `<div class="divider"></div>
                <div class="section-title"><i class="ti ti-checklist"></i> 操作步骤</div>
                <div id="rnaRunSteps" class="step-list">${stepsHtml}</div>` : ''}
            <button class="btn btn-success btn-block" style="margin-top:12px;" onclick="finishRnaExperiment()"><i class="ti ti-circle-check"></i> 完成并保存记录</button>
        </div>`;
    }
    c.innerHTML = `
        ${hasExp ? workHtml : `<div class="card" style="margin-top:8px;">
            <button class="btn btn-primary btn-block" ${noProto ? 'disabled title="请先建立方案"' : ''} onclick="_startNewRna()"><i class="ti ti-player-play"></i> 开始新 RNA 提取实验</button>
        </div>`}
        <div class="divider"></div>
        <div class="section-title"><i class="ti ti-history"></i> 历史记录</div>
        <div id="pcrrnaHistoryDiv"></div>`;
    renderPcrHistory('rna');
}

window._startNewRna = function () {
    let proto = PCR_STATE.rnaProtocols[0];
    window._curRnaExp = { name: '', protocol_id: proto ? proto.id : '', protocol_name: proto ? proto.name : '', samples: [], steps: proto ? [...proto.steps] : [], status: '中途保存' };
    PCR_STATE.activeRnaStepsCheck = new Array((proto ? proto.steps : []).length).fill(false);
    renderPcrRna();
    autoSaveExp('rna', true);
}

window._onRnaProtoChange = function () {
    let pid = document.getElementById('rnaExpProto').value;
    let proto = PCR_STATE.rnaProtocols.find(p => p.id === pid);
    if (proto && window._curRnaExp) {
        _syncRnaSamples();
        window._curRnaExp.protocol_id = proto.id;
        window._curRnaExp.protocol_name = proto.name;
        window._curRnaExp.steps = [...proto.steps];
        PCR_STATE.activeRnaStepsCheck = new Array(proto.steps.length).fill(false);
        renderPcrRna();
    }
}

function _syncRnaSamples() {
    if (!window._curRnaExp) return;
    let el = document.getElementById('rnaExpSamples');
    if (!el) return;
    window._curRnaExp.samples = el.value.split(/[,，]+/).map(s => s.trim()).filter(s => s).map(str => {
        let m = str.match(/^([^(]+)(?:\(([^-]+)-([^)]+)\))?$/);
        if (m) return { original: str, name: m[1].trim(), group: m[2] ? m[2].trim().replace(/_/g, ',') : '对照组', day: m[3] ? m[3].trim() : '-' };
        return { original: str, name: str, group: '对照组', day: '-' };
    });
}

window.onRnaGroupSelect = function (gid) {
    let input = document.getElementById('rnaExpSamples');
    if (!gid) { input.value = ''; return; }
    let g = PCR_STATE.sampleGroups.find(x => x.id === gid);
    if (g) input.value = g.samples.map(s => `${s.name}(${s.group.replace(/[,，]/g, '_')}-${s.day})`).join(', ');
}

window.saveRnaProtocol = async function () {
    let name = document.getElementById('rnaPName').value;
    let sStr = document.getElementById('rnaPSteps').value;
    if (!name || !sStr) return showToast("信息不完整", "error");
    let payload = { name, steps: sStr.split('\n').map(x => x.trim()).filter(x => x) };
    if (window._currentEditingRnaProtoId) { payload.id = window._currentEditingRnaProtoId; window._currentEditingRnaProtoId = null; }
    await savePcrItem('rna', 'protocols', payload);
}

window.editRnaP = function (id) {
    let p = PCR_STATE.rnaProtocols.find(x => x.id === id);
    if (!p) return;
    window._currentEditingRnaProtoId = p.id;
    document.getElementById('rnaPName').value = p.name;
    document.getElementById('rnaPSteps').value = p.steps.join('\n');
    document.getElementById('rnaPName').scrollIntoView({ behavior: 'smooth' });
}

window.toggleRnaStep = function (i, checked) {
    PCR_STATE.activeRnaStepsCheck[i] = checked;
    let el = document.getElementById(`rnaStepItem_${i}`);
    if (el) { if (checked) el.classList.add('checked'); else el.classList.remove('checked'); }
    autoSaveExp('rna');
}

window.toggleRtStep = function (i, checked) {
    PCR_STATE.activeRtStepsCheck[i] = checked;
    let el = document.getElementById(`rtStepItem_${i}`);
    if (el) { if (checked) el.classList.add('checked'); else el.classList.remove('checked'); }
    autoSaveExp('rt');
}

window.toggleQpcrStep = function (i, checked) {
    PCR_STATE.activeQpcrStepsCheck[i] = checked;
    let el = document.getElementById(`qpcrStepItem_${i}`);
    if (el) { if (checked) el.classList.add('checked'); else el.classList.remove('checked'); }
    autoSaveExp('qpcr');
}

window.finishRnaExperiment = function () {
    _syncRnaSamples();
    let exp = window._curRnaExp;
    if (!exp.name) return showToast("请填写实验名称", "error");
    if (!exp.samples || exp.samples.length === 0) return showToast("请填写样本", "error");
    exp.status = "已完成";
    exp.activeCheck = PCR_STATE.activeRnaStepsCheck;
    autoSaveExp('rna', true);
    let existing = PCR_STATE.rnaLogs.find(l => l.id === exp.id);
    if (existing) existing.status = '已完成';
    window._curRnaExp = null;
    PCR_STATE.activeRnaStepsCheck = [];
    renderPcrRna();
    _refreshRtRnaSelect();
}

// -------------------------------------------------------- RT
function renderPcrRt() {
    let c = document.getElementById('pcrRt');
    if (!c) return;
    let hasExp = !!window._curRtExp;
    let noReady = PCR_STATE.rtProtocols.length === 0 || PCR_STATE.rnaLogs.length === 0;
    let disabledMsg = PCR_STATE.rtProtocols.length === 0 ? '请先建立 RT 方案' : (PCR_STATE.rnaLogs.length === 0 ? '请先完成 RNA 提取' : '');

    let workHtml = '';
    if (hasExp) {
        let exp = window._curRtExp;
        let protoOptions = PCR_STATE.rtProtocols.map(p => `<option value="${p.id}" ${p.id === exp.protocol_id ? 'selected' : ''}>${p.name} (${p.total_vol}μl)</option>`).join('');
        let rnaLogOptions = PCR_STATE.rnaLogs.map(l => `<option value="${l.id}" ${l.id === exp.rna_log_id ? 'selected' : ''}>${l.name} (${(l.samples||[]).length}样)</option>`).join('');

        workHtml = `
        <div class="card" style="margin-top:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <div style="font-weight:700;font-size:15px;"><i class="ti ti-arrows-right-left" style="color:var(--primary)"></i> 逆转录实验</div>
                <button class="btn btn-sm btn-secondary" onclick="window._curRtExp=null;PCR_STATE.rtCurrentSamples=[];PCR_STATE.rtStripMap=[];renderPcrRt()"><i class="ti ti-x"></i></button>
            </div>
            <div class="form-group"><label class="form-label">实验名称</label><input class="form-input" id="rtExpName" value="${exp.name || ''}" placeholder="如：第一批RT" oninput="if(window._curRtExp)window._curRtExp.name=this.value"></div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">RNA来源实验</label><select class="form-select" id="rtExpRnaLog" onchange="_onRtRnaChange()">${rnaLogOptions}</select></div>
                <div class="form-group"><label class="form-label">RT方案</label><select class="form-select" id="rtExpProto" onchange="_onRtProtoChange()">${protoOptions}</select></div>
            </div>
            <div style="font-size:12px;margin-bottom:8px;color:#888;" id="rtRunDesc">总量:${exp.tot_vol||'-'}μl, 目标:${exp.req_ng||'-'}ng</div>
            ${ (() => {
                let p = PCR_STATE.rtProtocols.find(x => x.id === exp.protocol_id);
                if(!p || !p.steps || p.steps.length === 0) return '';
                let checks = PCR_STATE.activeRtStepsCheck || [];
                let stepsHtml = p.steps.map((s, i) => `
                    <label class="step-item ${checks[i] ? 'checked' : ''}" id="rtStepItem_${i}">
                        <input type="checkbox" class="step-checkbox" ${checks[i] ? 'checked' : ''} onchange="toggleRtStep(${i}, this.checked)">
                        <div><b>Step ${i + 1}.</b> ${s}</div>
                    </label>`).join('');
                return `<details style="margin: 8px 0; background: var(--surface-hover); padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border);"><summary style="cursor:pointer; font-weight:600; font-size:13px; color:var(--text-secondary);"><i class="ti ti-info-circle"></i> 实验步骤提示 / Protocol Steps</summary><div class="step-list" style="margin-top:8px;">${stepsHtml}</div></details>`;
            })() }
            <div class="rt-table-wrapper">
                <table class="rt-table">
                    <thead><tr><th>样本</th><th>管孔</th><th>浓度(ng/µL)</th><th>260/280</th><th>RNA(µL)</th><th>酶(µL)</th><th>H2O(µL)</th><th>操作</th></tr></thead>
                    <tbody id="rtTableBody"></tbody>
                </table>
            </div>
            <div class="section-title"><i class="ti ti-test-pipe"></i> 八联管排布</div>
            <div class="strips-container" id="rtStripsBox"></div>
            <button class="btn btn-success btn-block" onclick="finishRtExperiment()"><i class="ti ti-circle-check"></i> 完成并保存 RT 记录</button>
        </div>`;
    }

    c.innerHTML = `
        ${hasExp ? workHtml : `<div class="card" style="margin-top:8px;">
            <button class="btn btn-primary btn-block" ${noReady ? 'disabled title="' + disabledMsg + '"' : ''} onclick="_startNewRt()"><i class="ti ti-player-play"></i> 开始新逆转录实验</button>
        </div>`}
        <div class="divider"></div>
        <div class="section-title"><i class="ti ti-history"></i> 历史记录</div>
        <div id="pcrrtHistoryDiv"></div>`;
    if (hasExp) { renderRtTable(); }
    renderPcrHistory('rt');
}

window._startNewRt = function () {
    let rna = PCR_STATE.rnaLogs[0];
    let p = PCR_STATE.rtProtocols[0];
    if (!rna || !p) return;
    PCR_STATE.activeRtStepsCheck = new Array((p.steps || []).length).fill(false);
    PCR_STATE.rtCurrentSamples = rna.samples.map(s => {
        let nm = s.name ? s.name : s;
        return { original: s.original || nm, name: nm, group: s.group || '-', day: s.day || '-', tube: '-', conc: '', ratio: '', rna_vol: 0, enzyme_vol: p.enzyme_vol, water_vol: 0 };
    });
    let ts = Math.ceil(PCR_STATE.rtCurrentSamples.length / 8) || 1;
    PCR_STATE.rtStripMap = Array.from({ length: ts }, (_, i) => Array.from({ length: 8 }, (_, j) => { let v = i * 8 + j; return v < PCR_STATE.rtCurrentSamples.length ? v : null; }));
    window._curRtExp = { name: '', rna_log_id: rna.id, rna_source_name: rna.name, protocol_id: p.id, req_ng: p.required_rna_ng || p.rna_vol, tot_vol: p.total_vol, enz_vol: p.enzyme_vol, status: '中途保存' };
    renderPcrRt();
    autoSaveExp('rt', true);
}

window._onRtRnaChange = function () {
    let rnaId = document.getElementById('rtExpRnaLog').value;
    let rna = PCR_STATE.rnaLogs.find(l => l.id === rnaId);
    if (!rna || !window._curRtExp) return;
    window._curRtExp.rna_log_id = rna.id;
    window._curRtExp.rna_source_name = rna.name;
    let p = PCR_STATE.rtProtocols.find(x => x.id === window._curRtExp.protocol_id) || PCR_STATE.rtProtocols[0];
    PCR_STATE.rtCurrentSamples = rna.samples.map(s => {
        let nm = s.name ? s.name : s;
        return { original: s.original || nm, name: nm, group: s.group || '-', day: s.day || '-', tube: '-', conc: '', ratio: '', rna_vol: 0, enzyme_vol: p.enzyme_vol, water_vol: 0 };
    });
    let ts = Math.ceil(PCR_STATE.rtCurrentSamples.length / 8) || 1;
    PCR_STATE.rtStripMap = Array.from({ length: ts }, (_, i) => Array.from({ length: 8 }, (_, j) => { let v = i * 8 + j; return v < PCR_STATE.rtCurrentSamples.length ? v : null; }));
    renderRtTable();
}

window._onRtProtoChange = function () {
    let pId = document.getElementById('rtExpProto').value;
    let p = PCR_STATE.rtProtocols.find(x => x.id === pId);
    if (!p || !window._curRtExp) return;
    window._curRtExp.protocol_id = p.id;
    window._curRtExp.req_ng = p.required_rna_ng || p.rna_vol;
    window._curRtExp.tot_vol = p.total_vol;
    window._curRtExp.enz_vol = p.enzyme_vol;
    PCR_STATE.rtCurrentSamples.forEach((s, i) => { s.enzyme_vol = p.enzyme_vol; if (s.conc) calcRtSample(i, s.conc); });
    renderPcrRt();
}

window.saveRtProtocol = async function () {
    let name = document.getElementById('rtPName').value;
    let total = parseFloat(document.getElementById('rtPTotal').value) || 20;
    let enz = parseFloat(document.getElementById('rtPEnz').value) || 4;
    let rna = parseFloat(document.getElementById('rtPRna').value) || 1000;
    let stepsVal = document.getElementById('rtPSteps') ? document.getElementById('rtPSteps').value : '';
    let stepsArr = stepsVal.split('\n').map(x => x.trim()).filter(x => x);
    if (!name) return showToast("请填写方案名称", "error");
    let payload = { name, total_vol: total, enzyme_vol: enz, rna_vol: rna, steps: stepsArr };
    if (window._currentEditingRtProtoId) { payload.id = window._currentEditingRtProtoId; window._currentEditingRtProtoId = null; }
    await savePcrItem('rt', 'protocols', payload);
}

window.editRtP = function (id) {
    let p = PCR_STATE.rtProtocols.find(x => x.id === id);
    if (!p) return;
    window._currentEditingRtProtoId = p.id;
    document.getElementById('rtPName').value = p.name;
    document.getElementById('rtPTotal').value = p.total_vol;
    document.getElementById('rtPEnz').value = p.enzyme_vol;
    document.getElementById('rtPRna').value = p.rna_vol;
    if(document.getElementById('rtPSteps')) document.getElementById('rtPSteps').value = (p.steps || []).join('\n');
    document.getElementById('rtPName').scrollIntoView({ behavior: 'smooth' });
}

window.finishRtExperiment = function () {
    if (!window._curRtExp.name) return showToast("请填写实验名称", "error");
    window._curRtExp.status = "已完成";
    window._curRtExp.activeCheck = PCR_STATE.activeRtStepsCheck;
    autoSaveExp('rt', true);
    let existing = PCR_STATE.rtLogs.find(l => l.id === window._curRtExp.id);
    if (existing) existing.status = '已完成';
    window._curRtExp = null;
    PCR_STATE.rtCurrentSamples = [];
    PCR_STATE.rtStripMap = [];
    PCR_STATE.activeRtStepsCheck = [];
    renderPcrRt();
    _refreshQpcrRtSelect();
    showToast("逆转录实验及步骤存档成功");
}

function renderRtTable() {
    PCR_STATE.rtCurrentSamples.forEach(s => s.tube = '未分配');
    PCR_STATE.rtStripMap.forEach((s, i) => s.forEach((sx, j) => { if (sx !== null && PCR_STATE.rtCurrentSamples[sx]) PCR_STATE.rtCurrentSamples[sx].tube = `${i + 1}-${["A", "B", "C", "D", "E", "F", "G", "H"][j]}`; }));

    document.getElementById('rtTableBody').innerHTML = PCR_STATE.rtCurrentSamples.map((s, idx) => `
        <tr id="rtRow_${idx}">
            <td style="font-weight:bold">${s.name}</td>
            <td style="color:#666;font-size:12px;" class="tube-lbl">${s.tube}</td>
            <td><input type="number" class="rt-input" placeholder="0.0" value="${s.conc}" oninput="calcRtSample(${idx},this.value,'conc')"></td>
            <td><input type="number" class="rt-input" placeholder="1.8" value="${s.ratio}" oninput="PCR_STATE.rtCurrentSamples[${idx}].ratio=this.value; autoSaveExp('rt');"></td>
            <td class="rna-vol" style="font-weight:bold;color:var(--info)">${s.rna_vol > 0 ? Number(s.rna_vol).toFixed(2) : '-'}</td>
            <td>${s.enzyme_vol}</td>
            <td class="water-vol ${s.water_vol < 0 ? 'error' : ''}" style="font-weight:bold;color:${s.water_vol < 0 ? 'var(--danger)' : 'var(--success)'}">${s.conc ? Number(s.water_vol).toFixed(2) : '-'}</td>
            <td><button class="btn btn-sm btn-danger" style="padding:2px 6px;" onclick="deleteRtSample(${idx})" title="从此实验中剔除该样本"><i class="ti ti-trash"></i></button></td>
        </tr>
    `).join('');

    renderRtStrips();
}

window.deleteRtSample = function (idx) {
    if (!confirm(`确定要从本轮逆转录(RT)中剔除样本 ${PCR_STATE.rtCurrentSamples[idx].name} 吗？`)) return;
    PCR_STATE.rtCurrentSamples.splice(idx, 1);
    let ts = Math.ceil(PCR_STATE.rtCurrentSamples.length / 8) || 1;
    PCR_STATE.rtStripMap = Array.from({ length: ts }, (_, i) => Array.from({ length: 8 }, (_, j) => { let v = i * 8 + j; return v < PCR_STATE.rtCurrentSamples.length ? v : null; }));
    renderPcrRt();
    autoSaveExp('rt');
}

function renderRtStrips() {
    let box = document.getElementById('rtStripsBox');
    let sh = '';
    PCR_STATE.rtStripMap.forEach((s, i) => {
        sh += `<div class="strip-wrapper"><div style="font-size:10px;text-align:center;color:#888;margin-bottom:2px">管 ${i + 1}</div><div class="strip-8">`;
        s.forEach((sx, j) => {
            let smp = (sx !== null) ? PCR_STATE.rtCurrentSamples[sx] : null;
            let c = smp ? smp.name.substring(0, 3) : (sx !== null ? '?' : ''); // fallback
            sh += `<div class="strip-tube ${smp ? 'filled' : ''}" title="${smp ? smp.name : '空'}" onclick="showRtAssign(${i},${j},this)">${c}</div>`;
        });
        sh += `</div></div>`;
    });
    sh += `<div class="strip-wrapper" style="justify-content:center;"><div style="font-size:10px;text-align:center;color:#888;margin-bottom:2px">&nbsp;</div><div style="display:flex;flex-direction:row;gap:4px;padding:8px;align-items:center;"><button class="btn btn-sm btn-secondary" style="width:32px;height:32px;border-radius:50%;padding:0;display:flex;align-items:center;justify-content:center;" onclick="addRtStrip()">➕</button>`;
    if (PCR_STATE.rtStripMap.length > 1) sh += `<button class="btn btn-sm btn-danger" style="width:32px;height:32px;border-radius:50%;padding:0;display:flex;align-items:center;justify-content:center;" onclick="removeRtStrip()">➖</button>`;
    sh += `</div></div>`;
    box.innerHTML = sh;
}

window.calcRtSample = function (idx, val) {
    let s = PCR_STATE.rtCurrentSamples[idx]; s.conc = val; let cv = parseFloat(val);
    if (cv > 0) {
        let e = window._curRtExp; s.rna_vol = e.req_ng / cv;
        if (s.rna_vol > e.tot_vol - e.enz_vol) s.rna_vol = e.tot_vol - e.enz_vol;
        s.water_vol = e.tot_vol - e.enz_vol - s.rna_vol;
    } else { s.rna_vol = 0; s.water_vol = 0; }

    let tr = document.getElementById(`rtRow_${idx}`);
    if (tr) {
        tr.querySelector('.rna-vol').innerText = s.rna_vol > 0 ? s.rna_vol.toFixed(2) : '-';
        let wv = tr.querySelector('.water-vol');
        wv.innerText = s.conc ? s.water_vol.toFixed(2) : '-';
        wv.className = `water-vol ${s.water_vol < 0 ? 'error' : ''}`;
        wv.style.color = s.water_vol < 0 ? 'var(--danger)' : 'var(--success)';
    }
    autoSaveExp('rt');
}

window.showRtAssign = function (si, ti, el) {
    let p = document.getElementById('rtAssignPop'); if (p) p.remove();
    p = document.createElement('div'); p.id = 'rtAssignPop';
    p.style.cssText = `position:absolute; background:var(--surface); border:1px solid var(--border); box-shadow:var(--shadow-md); border-radius:8px; padding:4px 0; z-index:9999; width:160px; max-height:220px; overflow-y:auto;`;
    p.innerHTML = PCR_STATE.rtCurrentSamples.map((s, i) => `<div class="rt-pop-opt" onclick="assignRtStrip(${si},${ti},${i})">${s.name}</div>`).join('') +
        `<div class="rt-pop-opt" style="color:var(--danger)" onclick="assignRtStrip(${si},${ti},null)">[置空]</div>`;
    document.body.appendChild(p);
    let r = el.getBoundingClientRect(); p.style.left = (r.left + window.scrollX) + 'px'; p.style.top = (r.bottom + window.scrollY + 4) + 'px';
    setTimeout(() => { let h = (e) => { if (!p.contains(e.target)) { p.remove(); document.removeEventListener('click', h) } }; document.addEventListener('click', h); }, 10);
}

window.assignRtStrip = function (si, ti, stx) {
    // 置空他处
    if (stx !== null) {
        PCR_STATE.rtStripMap.forEach(s => s.forEach((v, j) => { if (v === stx) s[j] = null; }));
    }
    PCR_STATE.rtStripMap[si][ti] = stx;
    let p = document.getElementById('rtAssignPop'); if (p) p.remove();
    renderRtTable(); // full render because tube labels changed
    autoSaveExp('rt');
}
window.addRtStrip = function () { PCR_STATE.rtStripMap.push(new Array(8).fill(null)); renderRtTable(); autoSaveExp('rt'); }
window.removeRtStrip = function () { PCR_STATE.rtStripMap.pop(); renderRtTable(); autoSaveExp('rt'); }



// -------------------------------------------------------- qPCR
function renderPcrQpcr() {
    let c = document.getElementById('pcrQpcr');
    if (!c) return;
    let hasExp = !!window._curQpcrExp;
    let noReady = PCR_STATE.qpcrProtocols.length === 0 || PCR_STATE.rtLogs.length === 0;
    let disabledMsg = PCR_STATE.qpcrProtocols.length === 0 ? '请先建立 qPCR 方案' : (PCR_STATE.rtLogs.length === 0 ? '请先完成 RT 实验' : '');

    let workHtml = '';
    if (hasExp) {
        let exp = window._curQpcrExp;
        let protoOptions = PCR_STATE.qpcrProtocols.map(p => `<option value="${p.id}" ${p.id === exp.protocol_id ? 'selected' : ''}>${p.name} (${p.well_vol}ul体系)</option>`).join('');
        let rtLogOptions = PCR_STATE.rtLogs.map(l => `<option value="${l.id}" ${l.id === exp.rt_log_id ? 'selected' : ''}>${l.name}</option>`).join('');
        let genesStr = (exp.genes || PCR_STATE.qpcrGenes || []).join(', ');
        let geneSelectOpts = '<option value="">选择基因</option>' + (PCR_STATE.qpcrGenes || []).map(g => `<option>${g}</option>`).join('');
        let sampleSelectOpts = '<option value="">选择样本</option>' + (PCR_STATE.qpcrSamples || []).map(s => `<option value="${s.name || s}">${s.name || s}</option>`).join('');

        // Build FC/CT section
        let hkOpts = (PCR_STATE.qpcrGenes || []).map(g => `<option value="${g}" ${exp.hk_gene === g ? 'selected' : ''}>${g}</option>`).join('');

        workHtml = `
        <div class="card" style="margin-top:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <div style="font-weight:700;font-size:15px;"><i class="ti ti-chart-line" style="color:var(--primary)"></i> qPCR 荧光定量实验</div>
                <button class="btn btn-sm btn-secondary" onclick="window._curQpcrExp=null;PCR_STATE.qpcrGenes=[];PCR_STATE.qpcrSamples=[];PCR_STATE.qpcrPlateMap={};PCR_STATE.qpcrSelectedWells=new Set();renderPcrQpcr()"><i class="ti ti-x"></i></button>
            </div>
            <div class="form-group"><label class="form-label">实验名称</label><input class="form-input" id="qExpName" value="${exp.name || ''}" placeholder="如：第一批qPCR" oninput="if(window._curQpcrExp)window._curQpcrExp.name=this.value"></div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">cDNA来源 (RT实验)</label><select class="form-select" id="qExpRtLog" onchange="_onQpcrRtChange()">${rtLogOptions}</select></div>
                <div class="form-group"><label class="form-label">qPCR方案</label><select class="form-select" id="qExpProto" onchange="if(window._curQpcrExp) { window._curQpcrExp.protocol_id=this.value; renderPcrQpcr(); }">${protoOptions}</select></div>
            </div>
            ${ (() => {
                let badges = (PCR_STATE.qpcrSamples || []).map((s, idx) => `
                    <span style="display:inline-flex;align-items:center;padding:2px 8px;background:var(--surface-hover);border:1px solid var(--border);border-radius:12px;font-size:11px;margin:2px 4px 2px 0;">
                        ${s.name || s}
                        <i class="ti ti-x" style="cursor:pointer;margin-left:4px;color:var(--danger)" onclick="deleteQpcrSample(${idx})" title="剔除样本"></i>
                    </span>
                `).join('');
                return `<div class="form-group" style="margin-bottom:8px">
                    <label class="form-label">在库样本 (可点击 '×' 剔除无效或未配好的样本)</label>
                    <div style="display:flex;flex-wrap:wrap;">${badges || '<span style="font-size:12px;color:#888">无样本</span>'}</div>
                </div>`;
            })() }
            <div class="form-row">
                <div class="form-group" style="flex:2"><label class="form-label">测试基因 (逗号分隔)</label><input class="form-input" id="qExpGenes" value="${genesStr}" placeholder="如 GAPDH, IL-6, TNF-a" onchange="_onQpcrGenesChange()"></div>
                <div class="form-group" style="flex:1"><label class="form-label">复孔数</label><input type="number" class="form-input" id="qExpReps" value="${exp.reps || 3}" min="1" style="width:80px;"></div>
                <div class="form-group" style="display:flex;align-items:flex-end"><button class="btn btn-secondary" onclick="_autoAssignQpcr()" title="根据基因和样本自动排布384板"><i class="ti ti-wand"></i> 自动排布</button></div>
            </div>
            <div class="divider"></div>
            ${ (() => {
                let p = PCR_STATE.qpcrProtocols.find(x => x.id === exp.protocol_id);
                if(!p || !p.steps || p.steps.length === 0) return '';
                let checks = PCR_STATE.activeQpcrStepsCheck || [];
                let stepsHtml = p.steps.map((s, i) => `
                    <label class="step-item ${checks[i] ? 'checked' : ''}" id="qpcrStepItem_${i}">
                        <input type="checkbox" class="step-checkbox" ${checks[i] ? 'checked' : ''} onchange="toggleQpcrStep(${i}, this.checked)">
                        <div><b>Step ${i + 1}.</b> ${s}</div>
                    </label>`).join('');
                return `<details style="margin-bottom: 12px; background: var(--surface-hover); padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border);"><summary style="cursor:pointer; font-weight:600; font-size:13px; color:var(--text-secondary);"><i class="ti ti-info-circle"></i> 实验步骤提示 / Protocol Steps</summary><div class="step-list" style="margin-top:8px;">${stepsHtml}</div></details>`;
            })() }
            <div class="qpcr-toolbar">
                <div style="font-size:12px;font-weight:600;width:100%"><i class="ti ti-palette"></i> 涂色模式 (手动框选孔位后选择基因/样本)</div>
                <select class="form-select" style="width:120px;" id="qPaintGene">${geneSelectOpts}</select>
                <select class="form-select" style="width:120px;" id="qPaintSample">${sampleSelectOpts}</select>
                <button class="btn btn-sm btn-secondary" onclick="applyPaint()"><i class="ti ti-circle-check"></i> 应用</button>
                <button class="btn btn-sm btn-secondary" onclick="clearSelectedWells()"><i class="ti ti-eraser"></i> 清除</button>
            </div>
            <div id="qPlateLegend" class="color-legend"></div>
            <div class="plate-384-wrapper" id="qPlateWrapper"></div>
            <button class="btn btn-secondary btn-block" onclick="saveQpcrDraft()"><i class="ti ti-device-floppy"></i> 暂存板布局</button>

            <div class="divider"></div>
            <div class="section-title"><i class="ti ti-chart-area-line"></i> FC 数据分析</div>
            <div class="form-row" style="align-items:flex-end;">
                <div class="form-group"><label class="form-label">内参基因 (HKG)</label><select class="form-select" id="qHkGene">${hkOpts}</select></div>
            </div>
            <div id="qFcTableArea"></div>
            <button class="btn btn-primary btn-block" style="margin-top:8px;" onclick="calculateAndPlotFC()"><i class="ti ti-chart-area-line"></i> 计算并画图</button>
            <div id="qFcChartArea" style="margin-top:12px;"></div>
        </div>`;
    }

    c.innerHTML = `
        ${hasExp ? workHtml : `<div class="card" style="margin-top:8px;">
            <button class="btn btn-primary btn-block" ${noReady ? 'disabled title="' + disabledMsg + '"' : ''} onclick="_startNewQpcr()"><i class="ti ti-player-play"></i> 开始新 qPCR 实验</button>
        </div>`}
        <div class="divider"></div>
        <div class="section-title"><i class="ti ti-history"></i> 历史记录</div>
        <div id="pcrqpcrHistoryDiv"></div>`;
    if (hasExp) {
        renderQpcrPlate();
        // Auto-generate FC table if plate has data
        if (Object.keys(PCR_STATE.qpcrPlateMap).length > 0) generateFcTable();
    }
    renderPcrHistory('qpcr');
}

window._startNewQpcr = function () {
    let rt = PCR_STATE.rtLogs[0];
    let p = PCR_STATE.qpcrProtocols[0];
    if (!rt || !p) return;
    PCR_STATE.activeQpcrStepsCheck = new Array((p.steps || []).length).fill(false);
    let smps = rt.samples.map(s => ({ name: s.name || s, original: s.original || s.name || s, group: s.group || '-', day: s.day || '-' }));
    PCR_STATE.qpcrGenes = [];
    PCR_STATE.qpcrSamples = smps;
    PCR_STATE.qpcrPlateMap = {};
    PCR_STATE.qpcrSelectedWells = new Set();
    window._curQpcrExp = { name: '', rt_log_id: rt.id, rt_source_name: rt.name, protocol_id: p.id, genes: [], reps: 3, status: '中途保存' };
    renderPcrQpcr();
    autoSaveExp('qpcr', true);
}

window._onQpcrRtChange = function () {
    let rtId = document.getElementById('qExpRtLog').value;
    let rt = PCR_STATE.rtLogs.find(l => l.id === rtId);
    if (!rt || !window._curQpcrExp) return;
    window._curQpcrExp.rt_log_id = rt.id;
    window._curQpcrExp.rt_source_name = rt.name;
    PCR_STATE.qpcrSamples = rt.samples.map(s => ({ name: s.name || s, original: s.original || s.name || s, group: s.group || '-', day: s.day || '-' }));
    renderPcrQpcr();
}

window.deleteQpcrSample = function (idx) {
    let smp = PCR_STATE.qpcrSamples[idx];
    if (!confirm(`确定要在本次 qPCR 中剔除样本 ${smp.name || smp} 吗？\n(这也会将已画在其孔位上的该样本清空)`)) return;
    PCR_STATE.qpcrSamples.splice(idx, 1);
    Object.keys(PCR_STATE.qpcrPlateMap).forEach(k => {
        let v = PCR_STATE.qpcrPlateMap[k];
        if (v.sample === (smp.name || smp)) {
            delete v.sample;
            delete v.sampleObj;
            if (!v.gene) delete PCR_STATE.qpcrPlateMap[k];
        }
    });
    renderPcrQpcr();
    autoSaveExp('qpcr');
}

window._onQpcrGenesChange = function () {
    let genesStr = document.getElementById('qExpGenes').value;
    let genes = genesStr.split(/[,，\s]+/).map(g => g.trim()).filter(g => g);
    PCR_STATE.qpcrGenes = genes;
    if (window._curQpcrExp) window._curQpcrExp.genes = genes;
    // Refresh paint gene dropdown
    let sel = document.getElementById('qPaintGene');
    if (sel) sel.innerHTML = '<option value="">选择基因</option>' + genes.map(g => `<option>${g}</option>`).join('');
    // Refresh legend
    let legend = document.getElementById('qPlateLegend');
    if (legend) legend.innerHTML = genes.map((g, i) => `<div class="legend-tag"><div class="color-dot" style="background:${getColor(i)}"></div> ${g}</div>`).join('');
    // Refresh HKG selector
    let hk = document.getElementById('qHkGene');
    if (hk) hk.innerHTML = genes.map(g => `<option value="${g}">${g}</option>`).join('');
}

window._autoAssignQpcr = function () {
    let genesStr = document.getElementById('qExpGenes').value;
    let genes = genesStr.split(/[,，\s]+/).map(g => g.trim()).filter(g => g);
    if (genes.length === 0) return showToast("请先输入基因", "warning");
    let reps = parseInt(document.getElementById('qExpReps').value) || 3;
    PCR_STATE.qpcrGenes = genes;
    if (window._curQpcrExp) { window._curQpcrExp.genes = genes; window._curQpcrExp.reps = reps; }
    PCR_STATE.qpcrPlateMap = {};
    let smps = PCR_STATE.qpcrSamples;
    let lts = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P"];
    let cr = 0, cc = 1;
    for (let g of genes) {
        if (cr + reps > 16) { cr = 0; cc += smps.length; }
        if (cc + smps.length - 1 > 24) break;
        for (let si = 0; si < smps.length; si++) {
            let wc = cc + si;
            for (let r = 0; r < reps; r++) {
                let wr = cr + r;
                PCR_STATE.qpcrPlateMap[lts[wr] + wc] = { sample: smps[si].name, sampleObj: smps[si], gene: g, colorInfo: g };
            }
        }
        cr += reps;
    }
    renderQpcrPlate();
    // Refresh paint dropdowns
    let gSel = document.getElementById('qPaintGene');
    if (gSel) gSel.innerHTML = '<option value="">选择基因</option>' + genes.map(g => `<option>${g}</option>`).join('');
    let hk = document.getElementById('qHkGene');
    if (hk) hk.innerHTML = genes.map(g => `<option value="${g}">${g}</option>`).join('');
    generateFcTable();
    showToast(`已自动排布 ${genes.length} 个基因 × ${smps.length} 个样本`);
    autoSaveExp('qpcr');
}

function renderQpcrPlate() {
    let genes = PCR_STATE.qpcrGenes; let lts = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P"];
    document.getElementById('qPlateLegend').innerHTML = genes.map((g, i) => `<div class="legend-tag"><div class="color-dot" style="background:${getColor(i)}"></div> ${g}</div>`).join('');
    let html = '<table class="plate-384" style="touch-action:none; user-select:none; -webkit-user-select:none;"><tbody><tr><td></td>';
    for (let c = 1; c <= 24; c++) html += `<td class="plate-nav-label" style="padding-bottom:2px;">${c}</td>`;
    html += '</tr>';
    for (let r = 0; r < 16; r++) {
        html += `<tr><td class="plate-nav-label" style="padding-right:4px;">${lts[r]}</td>`;
        for (let c = 1; c <= 24; c++) {
            let wid = lts[r] + c; let info = PCR_STATE.qpcrPlateMap[wid]; let sld = PCR_STATE.qpcrSelectedWells.has(wid);
            let bg = 'var(--surface)', t = '', tt = wid;
            if (info && info.gene) { let gi = genes.indexOf(info.gene); bg = gi !== -1 ? getColor(gi) : '#cacaca'; t = info.sample ? info.sample.substring(0, 2) : ''; tt = `${wid}: ${info.sample} (${info.gene})`; }
            html += `<td class="plate-384-cell ${sld ? 'selected' : ''}" id="well_${wid}" data-row="${r}" data-col="${c-1}" style="background:${bg};" title="${tt}" onmousedown="qBoxStart(event, ${r}, ${c-1})" onmouseenter="qBoxMove(${r}, ${c-1})" ontouchstart="qBoxStart(event, ${r}, ${c-1})"><div class="plate-384-cell-content" style="color:${info ? '#fff' : 'var(--text-secondary)'}; pointer-events:none;">${t}</div></td>`;
        }
        html += '</tr>';
    }
    html += '</tbody></table>';
    document.getElementById('qPlateWrapper').innerHTML = html;
}

window.toggleWellSelect = function (wid) { if (PCR_STATE.qpcrSelectedWells.has(wid)) PCR_STATE.qpcrSelectedWells.delete(wid); else PCR_STATE.qpcrSelectedWells.add(wid); renderQpcrPlate(); }

window._qBoxSelector = { isDragging: false, startRow: -1, startCol: -1, targetState: true, baseSelection: [] };
const QLts = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P"];

window.qBoxStart = function(e, r, c) {
    if (e && e.preventDefault) e.preventDefault();
    let wid = QLts[r] + (c + 1);
    window._qBoxSelector.isDragging = true;
    window._qBoxSelector.startRow = r;
    window._qBoxSelector.startCol = c;
    
    let isOnlySelected = (PCR_STATE.qpcrSelectedWells.size === 1 && PCR_STATE.qpcrSelectedWells.has(wid));
    window._qBoxSelector.targetState = !isOnlySelected;
    window._qBoxSelector.baseSelection = [];
    
    // Clear old visual selection
    PCR_STATE.qpcrSelectedWells.forEach(twid => {
        let el = document.getElementById('well_' + twid);
        if (el) el.classList.remove('selected');
    });
    
    qBoxMove(r, c);
}

window.qBoxMove = function(r, c) {
    if (!window._qBoxSelector.isDragging) return;
    // Optimization: only process if coordinates changed
    if (window._qBoxSelector.lastR === r && window._qBoxSelector.lastC === c) return;
    window._qBoxSelector.lastR = r; window._qBoxSelector.lastC = c;
    
    let minR = Math.min(window._qBoxSelector.startRow, r), maxR = Math.max(window._qBoxSelector.startRow, r);
    let minC = Math.min(window._qBoxSelector.startCol, c), maxC = Math.max(window._qBoxSelector.startCol, c);
    let newSet = new Set(window._qBoxSelector.baseSelection);
    for (let ir = 0; ir < 16; ir++) {
        for (let ic = 0; ic < 24; ic++) {
            let twid = QLts[ir] + (ic + 1);
            let inBox = (ir >= minR && ir <= maxR && ic >= minC && ic <= maxC);
            if (inBox) { if (window._qBoxSelector.targetState) newSet.add(twid); else newSet.delete(twid); }
            let el = document.getElementById('well_' + twid);
            if (el) { 
                let hasCls = el.classList.contains('selected');
                let shouldHave = newSet.has(twid);
                if (hasCls !== shouldHave) { // Only manipulate DOM if actually changing (prevents layout thrashing lag)
                    if (shouldHave) el.classList.add('selected'); else el.classList.remove('selected'); 
                }
            }
        }
    }
    PCR_STATE.qpcrSelectedWells = newSet;
}

window.qBoxEnd = function() { window._qBoxSelector.isDragging = false; }
document.addEventListener('mouseup', window.qBoxEnd);
document.addEventListener('touchend', window.qBoxEnd);
document.addEventListener('touchmove', function(e) {
    if (!window._qBoxSelector.isDragging) return;
    let touch = e.touches[0];
    let elem = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!elem) return;
    let td = elem.closest('.plate-384-cell');
    if (td) {
        let r = parseInt(td.getAttribute('data-row')), c = parseInt(td.getAttribute('data-col'));
        if (!isNaN(r) && !isNaN(c)) { e.preventDefault(); qBoxMove(r, c); }
    }
}, {passive: false});

window.applyPaint = function () {
    if (PCR_STATE.qpcrSelectedWells.size === 0) return showToast("没选孔", "warning");
    let g = document.getElementById('qPaintGene').value, s = document.getElementById('qPaintSample').value;
    PCR_STATE.qpcrSelectedWells.forEach(wid => {
        if (!PCR_STATE.qpcrPlateMap[wid]) PCR_STATE.qpcrPlateMap[wid] = {};
        if (g) { PCR_STATE.qpcrPlateMap[wid].gene = g; PCR_STATE.qpcrPlateMap[wid].colorInfo = g; }
        if (s) {
            PCR_STATE.qpcrPlateMap[wid].sample = s;
            let fullSmp = PCR_STATE.qpcrSamples.find(x => (x.name || x) === s);
            if (fullSmp) PCR_STATE.qpcrPlateMap[wid].sampleObj = fullSmp;
        }
    });
    PCR_STATE.qpcrSelectedWells.clear(); renderQpcrPlate(); autoSaveExp('qpcr');
    if (typeof renderQpcrMasterMix === 'function') renderQpcrMasterMix();
    if (typeof renderQpcrAnalysis === 'function') renderQpcrAnalysis();
}
window.clearSelectedWells = function () { PCR_STATE.qpcrSelectedWells.forEach(wid => delete PCR_STATE.qpcrPlateMap[wid]); PCR_STATE.qpcrSelectedWells.clear(); renderQpcrPlate(); autoSaveExp('qpcr'); if (typeof renderQpcrMasterMix === 'function') renderQpcrMasterMix(); if (typeof renderQpcrAnalysis === 'function') renderQpcrAnalysis(); }
window.saveQpcrDraft = function () {
    if (!window._curQpcrExp) return;
    if (!window._curQpcrExp.name) return showToast('请填写实验名称', 'error');
    window._curQpcrExp.status = "未计算FC";
    window._curQpcrExp.plate_map = PCR_STATE.qpcrPlateMap;
    window._curQpcrExp.samples = PCR_STATE.qpcrSamples;
    window._curQpcrExp.genes = PCR_STATE.qpcrGenes;
    window._curQpcrExp.activeCheck = PCR_STATE.activeQpcrStepsCheck;
    autoSaveExp('qpcr', true);
    showToast('板布局暂存成功，步骤已存档');
}

window.saveQpcrProtocol = async function () {
    let name = document.getElementById('qPName').value;
    let tv = parseFloat(document.getElementById('qPTotal').value) || 10;
    let sybr = parseFloat(document.getElementById('qPSybr').value) || 5;
    let primer = parseFloat(document.getElementById('qPPrimer').value) || 1;
    let cdna = parseFloat(document.getElementById('qPCdna').value) || 1;
    let stepsVal = document.getElementById('qPSteps') ? document.getElementById('qPSteps').value : '';
    let stepsArr = stepsVal.split('\n').map(x => x.trim()).filter(x => x);
    if (!name || !tv) return showToast("信息不完整", "error");
    let payload = { name, well_vol: tv, sybr_vol: sybr, primer_vol: primer, cdna_vol: cdna, steps: stepsArr };
    if (window._currentEditingQpcrProtoId) { payload.id = window._currentEditingQpcrProtoId; window._currentEditingQpcrProtoId = null; }
    await savePcrItem('qpcr', 'protocols', payload);
}

window.editQpcrP = function (id) {
    let p = PCR_STATE.qpcrProtocols.find(x => x.id === id);
    if (!p) return;
    window._currentEditingQpcrProtoId = p.id;
    document.getElementById('qPName').value = p.name;
    document.getElementById('qPTotal').value = p.well_vol;
    document.getElementById('qPSybr').value = p.sybr_vol;
    document.getElementById('qPPrimer').value = p.primer_vol;
    document.getElementById('qPCdna').value = p.cdna_vol;
    if(document.getElementById('qPSteps')) document.getElementById('qPSteps').value = (p.steps || []).join('\n');
    document.getElementById('qPName').scrollIntoView({ behavior: 'smooth' });
}

// ---- FC table & calculation ----
window.generateFcTable = function () {
    let area = document.getElementById('qFcTableArea');
    if (!area) return;
    let genes = PCR_STATE.qpcrGenes || [];
    let pm = PCR_STATE.qpcrPlateMap || {};
    if (genes.length === 0 || Object.keys(pm).length === 0) { area.innerHTML = ''; return; }
    // Build unique sample-gene combos from plate
    let combos = {};
    for (let wid in pm) {
        let w = pm[wid]; if (!w.gene || !w.sample) continue;
        let key = w.gene + '||' + w.sample;
        if (!combos[key]) combos[key] = { gene: w.gene, sample: w.sample, sampleObj: w.sampleObj, cts: [] };
        combos[key].cts.push(w.ct || '');
    }
    // Load saved CT values from exp
    let savedCt = (window._curQpcrExp && window._curQpcrExp.ct_data) || {};
    // Table header = genes, rows = samples
    let sampleNames = [...new Set(Object.values(pm).filter(w => w.sample).map(w => w.sample))];
    let html = '<div class="rt-table-wrapper"><table class="rt-table"><thead><tr><th>样本</th>';
    genes.forEach(g => { html += `<th>${g}</th>`; });
    html += '</tr></thead><tbody>';
    sampleNames.forEach(s => {
        html += `<tr><td style="font-weight:bold">${s}</td>`;
        genes.forEach(g => {
            let key = g + '||' + s;
            let saved = savedCt[key] || '';
            html += `<td><input type="number" class="rt-input" step="0.01" placeholder="CT" value="${saved}" oninput="_updateCtVal('${g}','${s}',this.value)"></td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table></div>';
    area.innerHTML = html;
}

window._updateCtVal = function (gene, sample, val) {
    if (!window._curQpcrExp) return;
    if (!window._curQpcrExp.ct_data) window._curQpcrExp.ct_data = {};
    window._curQpcrExp.ct_data[gene + '||' + sample] = parseFloat(val) || '';
    autoSaveExp('qpcr');
}

window.calculateAndPlotFC = function () {
    let exp = window._curQpcrExp;
    if (!exp) return;
    let hkGene = document.getElementById('qHkGene');
    let hkg = hkGene ? hkGene.value : '';
    if (!hkg) return showToast('请选择内参基因', 'error');
    let ct = exp.ct_data || {};
    let genes = PCR_STATE.qpcrGenes.filter(g => g !== hkg);
    let pm = PCR_STATE.qpcrPlateMap || {};
    let sampleNames = [...new Set(Object.values(pm).filter(w => w.sample).map(w => w.sample))];
    // Get sample info for grouping
    let sampleInfo = {};
    for (let wid in pm) { let w = pm[wid]; if (w.sample && w.sampleObj) sampleInfo[w.sample] = w.sampleObj; }
    // Calculate delta-delta CT
    // delta CT = CT_target - CT_hkg for each sample
    let deltaCt = {};
    sampleNames.forEach(s => {
        let hkVal = ct[hkg + '||' + s];
        if (!hkVal && hkVal !== 0) return;
        deltaCt[s] = {};
        genes.forEach(g => {
            let tVal = ct[g + '||' + s];
            if (tVal || tVal === 0) deltaCt[s][g] = tVal - hkVal;
        });
    });
    // Group by day and group
    let groups = {}; let days = new Set();
    sampleNames.forEach(s => {
        let info = sampleInfo[s] || { group: '对照组', day: '-' };
        let groupName = info.group || '对照组';
        let day = info.day || '-';
        days.add(day);
        if (!groups[groupName]) groups[groupName] = {};
        if (!groups[groupName][day]) groups[groupName][day] = {};
        genes.forEach(g => {
            if (deltaCt[s] && (deltaCt[s][g] || deltaCt[s][g] === 0)) {
                if (!groups[groupName][day][g]) groups[groupName][day][g] = [];
                groups[groupName][day][g].push(deltaCt[s][g]);
            }
        });
    });
    let daysList = [...days].sort();
    // Find control group (first group or group with 'control'/'对照' in name)
    let groupNames = Object.keys(groups);
    let ctrlName = groupNames.find(n => /control|对照|ctrl/i.test(n)) || groupNames[0];
    // FC calculation: 2^(-(deltaCt_treatment - avg_deltaCt_control))
    let fcResults = {};
    genes.forEach(g => {
        fcResults[g] = {};
        groupNames.forEach(grp => {
            fcResults[g][grp] = {};
            daysList.forEach(d => {
                let ctrlDeltaArr = (groups[ctrlName] && groups[ctrlName][d] && groups[ctrlName][d][g]) || [];
                let ctrlAvg = ctrlDeltaArr.length > 0 ? ctrlDeltaArr.reduce((a, b) => a + b, 0) / ctrlDeltaArr.length : null;
                let treatArr = (groups[grp] && groups[grp][d] && groups[grp][d][g]) || [];
                if (ctrlAvg !== null && treatArr.length > 0) {
                    let fcs = treatArr.map(v => Math.pow(2, -(v - ctrlAvg)));
                    fcResults[g][grp][d] = { avg: fcs.reduce((a, b) => a + b, 0) / fcs.length, values: fcs };
                }
            });
        });
    });
    // Save results
    exp.hk_gene = hkg;
    exp.fc_results = fcResults;
    exp.status = '已计算FC';
    exp.activeCheck = PCR_STATE.activeQpcrStepsCheck;
    autoSaveExp('qpcr', true);
    // Render FC results as tables and log
    let chartArea = document.getElementById('qFcChartArea');
    if (!chartArea) return;
    let html = '<div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px;">✅ FC 计算完成 (内参: ' + hkg + ', 对照组: ' + ctrlName + ')</div>';
    genes.forEach(g => {
        html += `<div class="section-title" style="margin-top:12px;"><b>${g}</b> - 以同时间点 ${ctrlName} 为基准</div>`;
        html += '<div class="rt-table-wrapper"><table class="rt-table"><thead><tr><th>组/时间</th>';
        daysList.forEach(d => { html += `<th>${d}</th>`; });
        html += '</tr></thead><tbody>';
        groupNames.forEach(grp => {
            html += `<tr><td style="font-weight:bold">${grp}</td>`;
            daysList.forEach(d => {
                let r = fcResults[g][grp] && fcResults[g][grp][d];
                html += `<td>${r ? r.avg.toFixed(3) : '-'}</td>`;
            });
            html += '</tr>';
        });
        html += '</tbody></table></div>';
    });
    // Check for D0 and render fold-over-D0
    let hasD0 = daysList.some(d => /^0|^d0|^D0/i.test(d));
    if (hasD0) {
        let d0Key = daysList.find(d => /^0|^d0|^D0/i.test(d));
        html += '<div class="divider"></div><div class="section-title">📈 以 D0 为基准的倍数变化</div>';
        genes.forEach(g => {
            html += `<div style="font-weight:600;margin:8px 0 4px;">${g}</div>`;
            html += '<div class="rt-table-wrapper"><table class="rt-table"><thead><tr><th>组/时间</th>';
            daysList.forEach(d => { html += `<th>${d}</th>`; });
            html += '</tr></thead><tbody>';
            groupNames.forEach(grp => {
                let d0r = fcResults[g][grp] && fcResults[g][grp][d0Key];
                let d0Avg = d0r ? d0r.avg : null;
                html += `<tr><td style="font-weight:bold">${grp}</td>`;
                daysList.forEach(d => {
                    let r = fcResults[g][grp] && fcResults[g][grp][d];
                    let val = (r && d0Avg) ? (r.avg / d0Avg).toFixed(3) : '-';
                    html += `<td>${val}</td>`;
                });
                html += '</tr>';
            });
            html += '</tbody></table></div>';
        });
    }
    chartArea.innerHTML = html;
    showToast('FC 计算完成');
    // Update history to show status
    renderPcrHistory('qpcr');
}

window.loadExpHistory = function (cat, id) {
    let log = PCR_STATE[cat + 'Logs'].find(l => l.id === id); if (!log) return;
    let exp = JSON.parse(JSON.stringify(log));
    if (cat === 'rna') { window._curRnaExp = exp; PCR_STATE.activeRnaStepsCheck = exp.activeCheck || []; renderPcrRna(); }
    if (cat === 'rt') { window._curRtExp = exp; PCR_STATE.rtCurrentSamples = exp.samples || []; PCR_STATE.rtStripMap = exp.stripMap || []; PCR_STATE.activeRtStepsCheck = exp.activeCheck || []; renderPcrRt(); }
    if (cat === 'qpcr') { window._curQpcrExp = exp; PCR_STATE.qpcrPlateMap = exp.plate_map || {}; PCR_STATE.qpcrSamples = exp.samples || []; PCR_STATE.qpcrGenes = exp.genes || []; PCR_STATE.qpcrSelectedWells = new Set(); PCR_STATE.activeQpcrStepsCheck = exp.activeCheck || []; renderPcrQpcr(); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.renderQpcrMasterMix = function () {
    let wrap = document.getElementById('qPlateWrapper');
    if (!wrap) return;
    let existing = document.getElementById('qMasterMixPanel');
    if (existing) existing.remove();

    if (!window._curQpcrExp) return;
    let p = PCR_STATE.qpcrProtocols.find(x => x.id === window._curQpcrExp.protocol_id);
    if (!p) return;

    let counts = {};
    for (let wid in PCR_STATE.qpcrPlateMap) {
        let g = PCR_STATE.qpcrPlateMap[wid].gene;
        if (g) counts[g] = (counts[g] || 0) + 1;
    }

    if (Object.keys(counts).length === 0) return;

    let html = `<div id="qMasterMixPanel" class="card" style="margin-top:16px; background:var(--surface-hover);">
        <div class="section-title" style="margin-bottom:8px;"><i class="ti ti-beaker"></i> 本板预混液 (Master Mix) 参考</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">配置公式：计算孔数(N) + 5孔余量。单孔: SYBR ${p.sybr_vol}μL, 引物 ${p.primer_vol}μL, cDNA ${p.cdna_vol}μL, H2O ${p.well_vol - p.sybr_vol - p.primer_vol - p.cdna_vol}μL。</div>
        <div style="display:flex;flex-wrap:wrap;gap:12px;">`;

    for (let g in counts) {
        let n = counts[g] + 5;
        let sybr = (n * p.sybr_vol).toFixed(1);
        let primer = (n * p.primer_vol).toFixed(1);
        let water = (n * (p.well_vol - p.sybr_vol - p.primer_vol - p.cdna_vol)).toFixed(1);
        let mix = (p.well_vol - p.cdna_vol).toFixed(1);
        html += `<div style="background:var(--surface); border:1px solid var(--border); border-radius:6px; padding:10px; min-width:200px;">
            <div style="font-weight:600;margin-bottom:6px;">${g} 基因 <span style="font-size:11px;color:#888;">(${counts[g]}孔 => 按 ${n}孔 计)</span></div>
            <div style="font-size:13px; line-height:1.6; font-family: 'Inter', sans-serif;">
                SYBR: ${sybr} μL<br>
                Primer: ${primer} μL<br>
                H2O: ${water} μL<br>
                <div style="border-top:1px dashed var(--border); margin:4px 0;"></div>
                总 Mix: ${(parseFloat(sybr) + parseFloat(primer) + parseFloat(water)).toFixed(1)} μL
            </div>
            <div style="font-size:11px; color:var(--info); margin-top:6px;"><b>点板提示：</b>每孔先加Mix <b>${mix}</b> μL，再加cDNA <b>${p.cdna_vol}</b> μL</div>
        </div>`;
    }
    html += `</div></div>`;
    wrap.insertAdjacentHTML('afterend', html);
}

window.renderQpcrAnalysis = function () {
    let panel = document.getElementById('qAnalysisPanel');
    if (!panel) {
        let html = `<div id="qAnalysisPanel" class="card" style="margin-top:16px;">
            <div class="card-header"><i class="ti ti-chart-bar"></i> FC 数据分析 (Fold Change)</div>
            <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:12px; align-items:center;">
                <label style="font-size:13px;font-weight:600;">内参基因(HKG):</label>
                <select id="qHkGene" class="form-select" style="width:150px;"></select>
                <button class="btn btn-sm btn-secondary" onclick="generateFcTable()"><i class="ti ti-table"></i> 1. 填写CT值</button>
            </div>
            <div id="qFcTableArea"></div>
            <div id="qFcChartArea" style="margin-top:20px;"></div>
        </div>`;
        document.getElementById('qExpWorking').insertAdjacentHTML('beforeend', html);
        panel = document.getElementById('qAnalysisPanel');
    }

    let genes = new Set();
    for (let wid in PCR_STATE.qpcrPlateMap) if (PCR_STATE.qpcrPlateMap[wid].gene) genes.add(PCR_STATE.qpcrPlateMap[wid].gene);
    let hkSel = document.getElementById('qHkGene');
    let prevHk = hkSel.value;
    hkSel.innerHTML = Array.from(genes).map(g => `<option value="${g}">${g}</option>`).join('');
    if (Array.from(genes).includes(prevHk)) hkSel.value = prevHk;
}

window.generateFcTable = function () {
    let groups = {};
    for (let wid in PCR_STATE.qpcrPlateMap) {
        let info = PCR_STATE.qpcrPlateMap[wid];
        if (!info.sample || !info.gene) continue;
        let sObj = info.sampleObj || { name: info.sample, group: '-', day: '-' };
        let key = `${sObj.name}:::${info.gene}`;
        if (!groups[key]) groups[key] = { sample: sObj, gene: info.gene, wells: [] };
        groups[key].wells.push(wid);
    }
    window._fcData = groups;

    if (Object.keys(groups).length === 0) return;

    // Restore saved CT values if available (issue 9)
    let savedCt = (window._curQpcrExp && window._curQpcrExp.ct_values) ? window._curQpcrExp.ct_values : {};

    let html = `<div class="rt-table-wrapper"><table class="rt-table">
        <thead><tr><th>组别</th><th>天数</th><th>样本名</th><th>基因</th><th>复孔</th><th>CT (空格或逗号隔开)</th><th>Mean</th><th>SD</th></tr></thead>
        <tbody>`;

    Object.keys(groups).forEach((k, idx) => {
        let g = groups[k];
        let savedVal = savedCt[k] || '';
        let meanText = '-', sdText = '-';
        if (savedVal) {
            let nums = savedVal.split(/[,，\s]+/).map(parseFloat).filter(n => !isNaN(n));
            if (nums.length > 0) {
                let mean = nums.reduce((a, b) => a + b, 0) / nums.length;
                let sd = 0;
                if (nums.length > 1) { let sq = nums.reduce((a, b) => a + Math.pow(b - mean, 2), 0); sd = Math.sqrt(sq / (nums.length - 1)); }
                g.ct_mean = mean; g.ct_sd = sd;
                meanText = mean.toFixed(2); sdText = sd.toFixed(2);
            }
        }
        html += `<tr>
            <td style="font-size:12px;color:#666;">${g.sample.group}</td>
            <td style="font-size:12px;color:#666;">${g.sample.day}</td>
            <td style="font-weight:600;">${g.sample.name}</td>
            <td style="color:var(--accent); font-weight:600;">${g.gene}</td>
            <td style="font-size:11px;color:#888;">${g.wells.join(', ')}</td>
            <td><input type="text" class="rt-input ct-input" style="width:160px; text-align:left;" id="ctInput_${idx}" placeholder="如 21.0, 21.2" value="${savedVal}" oninput="calcRowCT('${k}', ${idx})"></td>
            <td id="ctMean_${idx}" style="font-weight:bold;">${meanText}</td>
            <td id="ctSd_${idx}" style="font-size:11px;color:#666;">${sdText}</td>
        </tr>`;
    });

    html += `</tbody></table></div>
        <button class="btn btn-primary btn-block" style="margin-top:12px;" onclick="calculateAndPlotFC()"><i class="ti ti-chart-area-line"></i> 2. 计算并画图 (自动识别D0或同时间对照)</button>
    `;
    document.getElementById('qFcTableArea').innerHTML = html;
}

window.calcRowCT = function (key, idx) {
    let val = document.getElementById(`ctInput_${idx}`).value;
    let nums = val.split(/[,，\s]+/).map(parseFloat).filter(n => !isNaN(n));
    if (nums.length === 0) {
        window._fcData[key].ct_mean = null; window._fcData[key].ct_sd = null;
        document.getElementById(`ctMean_${idx}`).innerText = '-';
        document.getElementById(`ctSd_${idx}`).innerText = '-';
        return;
    }
    let mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    let sd = 0;
    if (nums.length > 1) {
        let sq = nums.reduce((a, b) => a + Math.pow(b - mean, 2), 0);
        sd = Math.sqrt(sq / (nums.length - 1));
    }
    window._fcData[key].ct_mean = mean; window._fcData[key].ct_sd = sd;
    document.getElementById(`ctMean_${idx}`).innerText = mean.toFixed(2);
    document.getElementById(`ctSd_${idx}`).innerText = sd.toFixed(2);
}

window.calculateAndPlotFC = function () {
    let hk = document.getElementById('qHkGene').value;
    if (!hk) return showToast('先选择内参基因', 'warning');
    if (!window.Plotly) return showToast('正在加载图表库，请稍后再试或检查网络', 'error');

    // Save CT input values into experiment for persistence (issue 9)
    let ctValues = {};
    let fcKeys = Object.keys(window._fcData);
    fcKeys.forEach((k, idx) => {
        let el = document.getElementById(`ctInput_${idx}`);
        if (el) ctValues[k] = el.value;
    });
    if (window._curQpcrExp) {
        window._curQpcrExp.ct_values = ctValues;
        window._curQpcrExp.hk_gene = hk;
    }

    let sampleStats = {};
    for (let k in window._fcData) {
        let row = window._fcData[k];
        if (!sampleStats[row.sample.name]) sampleStats[row.sample.name] = { obj: row.sample, ct: {} };
        if (row.ct_mean !== null && row.ct_mean !== undefined) {
            sampleStats[row.sample.name].ct[row.gene] = row.ct_mean;
        }
    }

    let validSamples = [];
    for (let sname in sampleStats) {
        let stats = sampleStats[sname];
        if (stats.ct[hk] === undefined) continue;
        stats.dct = {};
        for (let g in stats.ct) {
            if (g === hk) continue;
            stats.dct[g] = stats.ct[g] - stats.ct[hk];
        }
        validSamples.push(stats);
    }

    if (validSamples.length === 0) return showToast('未有效提取到带有内参CT的样本', 'error');

    let hasD0 = false;
    let numStrMap = {};
    for (let st of validSamples) {
        let ds = String(st.obj.day);
        let numParsed = parseFloat(ds.match(/[0-9.]+/));
        let num = isNaN(numParsed) ? ds : numParsed;
        numStrMap[ds] = num;
        if (num === 0 || ds.toLowerCase() === 'd0' || ds === '0天' || ds === '0') hasD0 = true;
    }

    let genesToAnalyze = new Set();
    validSamples.forEach(st => Object.keys(st.dct).forEach(g => genesToAnalyze.add(g)));

    function isControl(groupName) {
        let l = groupName.toLowerCase();
        return l === '-' || l === '对照组' || l.includes('control') || l.includes('ctrl') || l === 'mock';
    }

    let chartHtml = '';
    genesToAnalyze.forEach(gene => {
        let safeId = gene.replace(/\W/g, '_');
        chartHtml += `<div style="margin-bottom:24px; padding:12px; border:1px solid var(--border); border-radius:8px; background:var(--surface);">
            <div id="plot_bar_${safeId}" style="width:100%;height:380px;"></div></div>`;
        if (hasD0) {
            chartHtml += `<div style="margin-bottom:24px; padding:12px; border:1px solid var(--border); border-radius:8px; background:var(--surface);">
                <div id="plot_line_${safeId}" style="width:100%;height:380px;"></div></div>`;
        }
    });
    document.getElementById('qFcChartArea').innerHTML = chartHtml;

    let fcResults = {};

    genesToAnalyze.forEach(gene => {
        let safeId = gene.replace(/\W/g, '_');
        let geneData = [];
        validSamples.forEach(st => {
            if (st.dct[gene] !== undefined) {
                geneData.push({ group: st.obj.group, dayStr: st.obj.day, dayNum: numStrMap[st.obj.day], dct: st.dct[gene], isCtrl: isControl(st.obj.group) });
            }
        });

        // ── Bar Chart: 同时间点 control 为基准 ──
        let days = Array.from(new Set(geneData.map(d => d.dayNum))).sort((a, b) => {
            let nA = parseFloat(a), nB = parseFloat(b);
            if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
            return String(a).localeCompare(String(b));
        });
        let ctrlDctByDay = {};
        days.forEach(dy => {
            let ctrls = geneData.filter(d => d.isCtrl && String(d.dayNum) === String(dy));
            if (ctrls.length > 0) ctrlDctByDay[dy] = ctrls.reduce((a, b) => a + b.dct, 0) / ctrls.length;
        });

        let traces = {};
        geneData.forEach(d => {
            if (!traces[d.group]) traces[d.group] = {};
            if (!traces[d.group][d.dayNum]) traces[d.group][d.dayNum] = [];
            traces[d.group][d.dayNum].push(d.dct);
        });

        let barData = [];
        for (let grp in traces) {
            let x = []; let y = [];
            days.forEach(dy => {
                if (traces[grp][dy] && ctrlDctByDay[dy] !== undefined) {
                    let dcts = traces[grp][dy];
                    let meanDct = dcts.reduce((a, b) => a + b, 0) / dcts.length;
                    let ddct = meanDct - ctrlDctByDay[dy];
                    let fc = Math.pow(2, -ddct);
                    let originalStr = geneData.find(d => d.group === grp && String(d.dayNum) === String(dy))?.dayStr;
                    x.push(originalStr || dy); y.push(fc);
                    if (!fcResults[gene]) fcResults[gene] = [];
                    fcResults[gene].push({ group: grp, day: originalStr || dy, fc_bar: fc });
                }
            });
            if (x.length > 0) barData.push({ x, y, type: 'bar', name: grp, text: y.map(v => Number(v).toFixed(2)), textposition: 'auto' });
        }
        if (barData.length > 0) {
            Plotly.newPlot(`plot_bar_${safeId}`, barData, { title: `${gene} 组间比较 FC (同时间对照为基准)`, margin: { t: 40 }, barmode: 'group', xaxis: { title: '时间点' }, yaxis: { title: 'Fold Change' }, template: 'plotly_white' });
        }

        // ── Line Chart: D0为基准 (仅当存在D0样本) ──
        if (hasD0) {
            let ctrlD0 = geneData.filter(d => d.isCtrl && (d.dayNum === 0 || String(d.dayStr).toLowerCase() === 'd0' || d.dayStr === '0天' || d.dayStr === '0'));
            if (ctrlD0.length === 0) {
                let plotEl = document.getElementById(`plot_line_${safeId}`);
                if (plotEl) plotEl.innerHTML = '<div class="empty-state">缺少 Control D0 数据</div>';
                return;
            }
            let baseDct = ctrlD0.reduce((a, b) => a + b.dct, 0) / ctrlD0.length;

            let lineTraces = {};
            geneData.forEach(d => {
                if (!lineTraces[d.group]) lineTraces[d.group] = {};
                if (!lineTraces[d.group][d.dayNum]) lineTraces[d.group][d.dayNum] = [];
                lineTraces[d.group][d.dayNum].push(d.dct);
            });

            let lineData = [];
            for (let grp in lineTraces) {
                let x = []; let y = [];
                let sortedKeys = Object.keys(lineTraces[grp]).sort((a, b) => {
                    let nA = parseFloat(a), nB = parseFloat(b);
                    if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
                    return String(a).localeCompare(String(b));
                });
                sortedKeys.forEach(dy => {
                    let dcts = lineTraces[grp][dy];
                    let meanDct = dcts.reduce((a, b) => a + b, 0) / dcts.length;
                    let ddct = meanDct - baseDct;
                    let fc = Math.pow(2, -ddct);
                    let originalStr = geneData.find(d => d.group === grp && String(d.dayNum) === String(dy))?.dayStr;
                    x.push(originalStr || dy); y.push(fc);
                });
                lineData.push({ x, y, type: 'scatter', mode: 'lines+markers', name: grp, line: { width: 3, shape: 'spline' }, marker: { size: 8 } });
            }
            Plotly.newPlot(`plot_line_${safeId}`, lineData, { title: `${gene} FC 变化趋势 (D0为基准)`, margin: { t: 40 }, xaxis: { title: '时间点' }, yaxis: { title: 'Fold Change (vs D0)' }, template: 'plotly_white' });
        }
    });

    // Issue 8: Update status + save
    if (window._curQpcrExp) {
        window._curQpcrExp.status = "已计算FC值";
        window._curQpcrExp.fc_results = fcResults;
        window._curQpcrExp.plate_map = PCR_STATE.qpcrPlateMap;
        window._curQpcrExp.samples = PCR_STATE.qpcrSamples;
        window._curQpcrExp.activeCheck = PCR_STATE.activeQpcrStepsCheck;
        autoSaveExp('qpcr', true);
        showToast('FC计算完成，数据及步骤状态已保存！');
    }
}


