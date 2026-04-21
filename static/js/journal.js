/* ============================================================
   journal.js — 实验日志模块
   ============================================================ */

// ── 日志状态 ──
let JN = {
    entries: [],       // [{type, id, label, data}, ...]
    allRecords: [],    // 全量记录缓存
};

// 类型元数据
const JN_TYPE_META = {
    passage: { color: '#4a9eff', bg: 'rgba(74, 158, 255, 0.15)', icon: 'ti-cell', label: '传代' },
    experiment: { color: '#ff9f0a', bg: 'rgba(255, 159, 10, 0.15)', icon: 'ti-pill', label: '造模' },
    pcr_rna: { color: '#30d158', bg: 'rgba(48, 209, 88, 0.15)', icon: 'ti-droplet', label: 'RNA' },
    pcr_rt: { color: '#7c3aed', bg: 'rgba(124, 58, 237, 0.15)', icon: 'ti-arrows-right-left', label: 'RT' },
    pcr_qpcr: { color: '#ff375f', bg: 'rgba(255, 55, 95, 0.15)', icon: 'ti-chart-line', label: 'qPCR' },
};

// ── 初始化 ──
window.jnInit = function () {
    // 日期默认今天
    let d = document.getElementById('jnDate');
    if (d && !d.value) {
        d.value = new Date().toISOString().slice(0, 10);
    }
    // 加载已有日志
    jnLoadForDate();
};

// 渲染已关联条目
function jnRenderEntries() {
    let el = document.getElementById('jnEntries');
    if (!el) return;
    if (JN.entries.length === 0) {
        el.innerHTML = '<div style="font-size:12px;color:var(--text-tertiary);padding:6px 0 12px;">暂无关联条目，点击下方按钮添加</div>';
        return;
    }
    el.innerHTML = JN.entries.map((en, i) => {
        let m = JN_TYPE_META[en.type] || { color: 'var(--text-secondary)', bg: 'var(--surface-hover)', icon: 'ti-file', label: en.type };
        return `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;margin-bottom:6px;
                    background:${m.bg};border-left:3px solid ${m.color};border-radius:8px;position:relative;">
            <i class="ti ${m.icon}" style="color:${m.color};flex-shrink:0"></i>
            <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:600">${en.label}</div>
                <div style="font-size:11px;color:var(--text-secondary)">${m.label} · ${(en.timestamp || '').substring(0, 16)}</div>
            </div>
            <button class="btn btn-sm" style="padding:0 6px;height:28px;font-size:12px;background:transparent;"
                    onclick="jnExpandEntry(${i})" title="展开详情">
                <i class="ti ti-eye" style="color:var(--text-secondary)"></i>
            </button>
            <button class="btn btn-sm btn-danger" style="padding:0 6px;height:28px;" onclick="jnRemoveEntry(${i})">
                <i class="ti ti-x"></i>
            </button>
        </div>
        ${en._expanded ? jnRenderEntryDetail(en) : ''}
        `;
    }).join('');
}

// 展开/收起条目详情
window.jnExpandEntry = function (i) {
    JN.entries[i]._expanded = !JN.entries[i]._expanded;
    jnRenderEntries();
};

function jnRenderEntryDetail(en) {
    let detail = (typeof buildRecordDetailHTML === 'function')
        ? buildRecordDetailHTML(en.type, en.data)
        : '<div style="color:var(--text-tertiary);font-size:12px;">详情不可用</div>';
    return `<div style="margin:-2px 0 8px;padding:10px;background:var(--surface-hover);border-radius:8px;">${detail}</div>`;
}

window.jnRemoveEntry = function (i) {
    JN.entries.splice(i, 1);
    jnRenderEntries();
};

// ── 加载当日已有日志 ──
async function jnLoadForDate() {
    let dateEl = document.getElementById('jnDate');
    if (!dateEl) return;
    let date = dateEl.value || new Date().toISOString().slice(0, 10);
    try {
        let res = await fetch(`/api/journals/${date}`);
        let j = await res.json();
        if (j && j.entries) {
            JN.entries = j.entries.map(en => ({ ...en, _expanded: false }));
            document.getElementById('jnWork').value = j.work || '';
            document.getElementById('jnResult').value = j.result || '';
            document.getElementById('jnThinking').value = j.thinking || '';
        } else {
            JN.entries = [];
            ['jnWork', 'jnResult', 'jnThinking'].forEach(id => {
                let el = document.getElementById(id);
                if (el) el.value = '';
            });
        }
        jnRenderEntries();
    } catch (e) { }
}

// 当日期输入改变时重加载
document.addEventListener('DOMContentLoaded', () => {
    document.body.addEventListener('change', e => {
        if (e.target && e.target.id === 'jnDate') jnLoadForDate();
    });
});

// ── 添加今日记录 ──
window.jnAddTodayRecords = async function () {
    let today = new Date().toISOString().slice(0, 10);
    try {
        let all = await _jnFetchAllRecords();
        let todayRecs = all.filter(r => r.date === today);
        if (todayRecs.length === 0) { showToast('今日暂无实验记录', 'warning'); return; }

        let added = 0;
        todayRecs.forEach(r => {
            if (!JN.entries.find(en => en.id === r.id)) {
                JN.entries.push({ ...r, _expanded: false });
                added++;
            }
        });
        showToast(added > 0 ? `已添加 ${added} 条今日记录` : '今日记录已全部在列');
        jnRenderEntries();
    } catch (e) { showToast('加载失败', 'error'); }
};

// ── 从历史选取记录 ──
window.jnPickRecord = async function () {
    try {
        let all = await _jnFetchAllRecords();
        jnShowPickerModal(all);
    } catch (e) { showToast('加载失败', 'error'); }
};

async function _jnFetchAllRecords() {
    if (JN.allRecords.length === 0) {
        let res = await fetch('/api/records/all');
        JN.allRecords = await res.json();
    }
    return JN.allRecords;
}

function jnShowPickerModal(records) {
    // 移除旧的
    let old = document.getElementById('jnPickerModal');
    if (old) old.remove();

    let typeOrder = ['experiment', 'passage', 'pcr_qpcr', 'pcr_rt', 'pcr_rna'];
    let grouped = {};
    typeOrder.forEach(t => { grouped[t] = []; });
    records.forEach(r => { if (grouped[r.type]) grouped[r.type].push(r); });

    let groupsHtml = typeOrder.map(t => {
        let recs = grouped[t];
        if (recs.length === 0) return '';
        let m = JN_TYPE_META[t] || {};
        return `
        <div style="margin-bottom:12px">
            <div style="font-size:11px;font-weight:700;color:${m.color || 'var(--text-secondary)'};margin-bottom:6px;text-transform:uppercase;letter-spacing:0.6px">
                <i class="ti ${m.icon}"></i> ${m.label}
            </div>
            ${recs.map(r => {
            let alreadyIn = JN.entries.find(en => en.id === r.id);
            return `<div onclick="${alreadyIn ? '' : `jnPickerSelect('${r.id}')`}"
                    style="padding:8px 10px;margin-bottom:4px;border-radius:6px;border:1px solid ${m.color || 'var(--border)'};
                           background:${alreadyIn ? 'var(--surface-hover)' : 'var(--surface)'};cursor:${alreadyIn ? 'default' : 'pointer'};
                           display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <div style="font-size:13px;font-weight:600;color:${alreadyIn ? 'var(--text-tertiary)' : 'var(--text)'}">${r.label}</div>
                        <div style="font-size:11px;color:var(--text-secondary)">${(r.timestamp || '').substring(0, 16)}</div>
                    </div>
                    ${alreadyIn ? '<span style="font-size:11px;color:var(--text-tertiary)">已添加</span>' : '<i class="ti ti-plus" style="color:var(--accent)"></i>'}
                </div>`;
        }).join('')}
        </div>`;
    }).join('');

    let modal = document.createElement('div');
    modal.id = 'jnPickerModal';
    modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:99998;display:flex;align-items:flex-end;`;
    modal.innerHTML = `
        <div style="background:var(--surface);border-radius:20px 20px 0 0;width:100%;max-height:80vh;overflow-y:auto;padding:20px 16px 32px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                <div style="font-size:16px;font-weight:700">选取实验记录</div>
                <button onclick="document.getElementById('jnPickerModal').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--text-secondary)">&times;</button>
            </div>
            <div id="jnPickerContent">${groupsHtml || '<div style="color:var(--text-tertiary);text-align:center;padding:24px">暂无记录</div>'}</div>
        </div>
    `;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);

    // 存记录到全局供选取函数使用
    window._jnPickerRecords = records;
}

window.jnPickerSelect = function (id) {
    let r = (window._jnPickerRecords || []).find(rec => rec.id === id);
    if (!r) return;
    if (!JN.entries.find(en => en.id === id)) {
        JN.entries.push({ ...r, _expanded: false });
        jnRenderEntries();
        showToast(`已添加：${r.label}`);
    }
    // 刷新 modal
    jnShowPickerModal(window._jnPickerRecords);
};

// ── 保存日志 ──
window.jnSave = async function () {
    let date = document.getElementById('jnDate').value;
    if (!date) { showToast('信息不完整', 'error'); return; }

    let payload = {
        date,
        entries: JN.entries.map(({ _expanded, ...rest }) => rest),
        work: document.getElementById('jnWork').value,
        result: document.getElementById('jnResult').value,
        thinking: document.getElementById('jnThinking').value,
    };
    try {
        let res = await fetch('/api/journals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('保存失败');
        showToast('日志已保存');
        JN.allRecords = []; // 清缓存
    } catch (e) { showToast(e.message, 'error'); }
};

// ── 日志历史 ──
window.jnLoadHistory = async function () {
    let el = document.getElementById('jnHistoryList');
    if (!el) return;
    el.innerHTML = '<div style="color:#999;text-align:center;padding:24px">加载中…</div>';
    try {
        let res = await fetch('/api/journals');
        let journals = await res.json();
        if (journals.length === 0) {
            el.innerHTML = '<div class="empty-state"><i class="ti ti-notebook ti-xl"></i><div style="margin-top:8px">暂无日志记录</div></div>';
            return;
        }
        el.innerHTML = journals.map(j => {
            let entriesCards = (j.entries || []).map((en, idx) => {
                let m = JN_TYPE_META[en.type] || { color: '#888', icon: 'ti-file', label: en.type };
                let key = `jn_${j.date}_${idx}`;
                let formatData = { name: en.label, created_at: en.timestamp, ...en.data };
                return (typeof buildRecordCard === 'function')
                    ? buildRecordCard({ 
                        key, type: en.type, data: formatData, 
                        meta: { icon: m.icon, color: m.color, typeLabel: m.label },
                        extraButtons: '' 
                      })
                    : '';
            }).join('');
            
            let detailHtml = `
                ${j.work || j.result || j.thinking ? `<div class="card" style="margin-bottom:8px;">
                    <div class="card-header"><i class="ti ti-notes"></i> 日志内容</div>
                    ${j.work ? `<div class="form-group" style="margin-bottom:8px;"><label class="form-label" style="font-size:11px;">今日工作</label><div class="rd-readonly-val rd-full" style="white-space:pre-wrap;">${j.work}</div></div>` : ''}
                    ${j.result ? `<div class="form-group" style="margin-bottom:8px;"><label class="form-label" style="font-size:11px;">实验结果</label><div class="rd-readonly-val rd-full" style="white-space:pre-wrap;">${j.result}</div></div>` : ''}
                    ${j.thinking ? `<div class="form-group" style="margin-bottom:8px;"><label class="form-label" style="font-size:11px;">思考与总结</label><div class="rd-readonly-val rd-full" style="white-space:pre-wrap;">${j.thinking}</div></div>` : ''}
                </div>` : ''}
                <div class="card" style="margin-bottom:8px;">
                    <div class="card-header"><i class="ti ti-link"></i> 关联实验记录</div>
                    ${entriesCards || '<div style="color:#aaa;font-size:12px;padding:4px">无关联记录</div>'}
                </div>
            `;
            
            let key = `journal_${j.date}`;
            let extras = `
                <button class="btn btn-sm btn-secondary" style="padding:2px 7px;font-size:11px;" title="编辑" onclick="event.stopPropagation();jnLoadIntoEditor('${j.date}')"><i class="ti ti-pencil"></i></button>
                <button class="btn btn-sm btn-danger" style="padding:2px 7px;" onclick="event.stopPropagation();jnDeleteJournal('${j.date}')"><i class="ti ti-x"></i></button>
            `;
            
            return (typeof buildRecordCard === 'function')
                ? buildRecordCard({
                    key, type: 'journal',
                    data: { name: `实验日志 (${j.date})`, created_at: j.date },
                    meta: { icon: 'ti-calendar', color: 'var(--accent)', typeLabel: '日结' },
                    extraButtons: extras, detailHtml: detailHtml
                })
                : '<div class="empty-state">需要刷新页面加载核心功能</div>';
        }).join('');
    } catch (e) { el.innerHTML = '<div class="empty-state">加载失败</div>'; }
};

window.jnLoadIntoEditor = async function (date) {
    // 切换到编辑 tab
    document.querySelector('[onclick*="journalEditor"]')?.click();
    document.getElementById('jnDate').value = date;
    await jnLoadForDate();
};

window.jnDeleteJournal = async function (date) {
    if (!confirm(`确定删除 ${date} 的日志？`)) return;
    await fetch(`/api/journals/${date}`, { method: 'DELETE' });
    showToast('已删除');
    jnLoadHistory();
};
