/* ============================================================
   wb.js — Western Blot 模块前端流
   ============================================================ */

/**
 * 全局 WB 状态
 */
let WB_STATE = {
    // 方案预设
    protocols: {
        extract: [],       // 提取与BCA、配平方案
        electrophoresis: [],// 制胶与转膜缓冲方案
        detection: [],      // 抗体库
        detectionWorkflows: [] // 检测流程方案
    },
    // 实验日志与记录
    logs: {
        extract: [],
        electrophoresis: [],
        detection: []
    },
    sampleGroups: [],      // WB专属样本流

    // 常用配置缓冲
    activeCheck: {
        extract: [],
        electrophoresis: [],
        detection: []
    }
};

function wbCreateId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }
    return `wb_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function wbNotifyBlocked(message) {
    if (typeof showToast === 'function') showToast(message, 'error');
    else window.alert(message);
}

function wbGetUsableSampleGroups() {
    return (WB_STATE.sampleGroups || []).filter(group =>
        Array.isArray(group.samples) && group.samples.some(sample => String(sample.name || '').trim())
    );
}

function wbPendingSampleGroupHasSamples() {
    let group = window._curWbSampleGroup;
    return !!(group && Array.isArray(group.samples) && group.samples.some(sample => String(sample.name || '').trim()));
}

function wbStatusBadge(status) {
    let cls = status === '已完成' ? 'badge-success' : 'badge-info';
    return `<span class="badge ${cls}">${status || '进行中'}</span>`;
}

function wbRdField(label, val, full) {
    if (typeof _rdField === 'function') return _rdField(label, val, full);
    if (val == null || val === '') return '';
    return `<div class="form-group" style="margin-bottom:8px;"><label class="form-label" style="font-size:11px;">${label}</label><div class="rd-readonly-val${full ? ' rd-full' : ''}">${val}</div></div>`;
}

function wbRdRow(...fields) {
    let fs = fields.filter(Boolean);
    if (typeof _rdRow === 'function') return _rdRow(...fields);
    return fs.length ? `<div class="form-row" style="margin-bottom:0;">${fs.join('')}</div>` : '';
}

function wbResolveProtocol(category, id) {
    let list = [];
    if (category === 'extract') list = WB_STATE.protocols.extract || [];
    if (category === 'electrophoresis') list = WB_STATE.protocols.electrophoresis || [];
    if (category === 'detectionWorkflow') list = WB_STATE.protocols.detectionWorkflows || [];
    return list.find(item => item.id === id) || null;
}

function wbResolveSteps(category, data) {
    if (Array.isArray(data.steps) && data.steps.length > 0) return data.steps;
    let proto = null;
    if (category === 'extract') proto = wbResolveProtocol('extract', data.protocol_id);
    if (category === 'electrophoresis') proto = wbResolveProtocol('electrophoresis', data.protocol_id);
    if (category === 'detection') proto = wbResolveProtocol('detectionWorkflow', data.workflow_id);
    return proto && Array.isArray(proto.steps) ? proto.steps : [];
}

function wbBuildStepChecklist(steps, checks, inputPrefix, onchangeName, title) {
    if (!Array.isArray(steps) || steps.length === 0) return '';
    return `<details style="margin: 8px 0; background: var(--surface-hover); padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
        <summary style="cursor:pointer; font-weight:600; font-size:13px; color:var(--text-secondary);"><i class="ti ti-info-circle"></i> ${title}</summary>
        <div class="step-list" style="margin-top:8px;">
            ${steps.map((step, i) => `
                <label class="step-item ${(checks || [])[i] ? 'checked' : ''}" id="${inputPrefix}Item_${i}">
                    <input type="checkbox" class="step-checkbox" ${(checks || [])[i] ? 'checked' : ''} onchange="${onchangeName}(${i}, this.checked)">
                    <div><b>Step ${i + 1}.</b> ${step}</div>
                </label>`).join('')}
        </div>
    </details>`;
}

function wbBuildReadonlySteps(steps, checks) {
    if (!Array.isArray(steps) || steps.length === 0) return '';
    return `<div class="card" style="margin-bottom:8px;"><div class="card-header"><i class="ti ti-checklist"></i> 操作步骤（只读）</div>
        ${steps.map((step, i) => `
            <label class="step-item ${(checks || [])[i] ? 'checked' : ''}" style="pointer-events:none;opacity:${(checks || [])[i] ? 1 : 0.65};">
                <input type="checkbox" class="step-checkbox" ${(checks || [])[i] ? 'checked' : ''} disabled>
                <div><b>Step ${i + 1}.</b> ${step}</div>
            </label>`).join('')}
    </div>`;
}

function wbGetStageMeta(category, log) {
    const meta = {
        extract: { type: 'wb_extract', icon: 'ti-droplet', color: '#007aff', label: 'WB 提取配平' },
        electrophoresis: { type: 'wb_electro', icon: 'ti-layout-columns', color: '#5856d6', label: 'WB 跑胶转膜' },
        detection: { type: 'wb_detect', icon: 'ti-cut', color: '#ff2d55', label: 'WB 裁膜显影' }
    }[category];
    let label = meta.label + (log.status ? ` · ${log.status}` : '');
    let steps = wbResolveSteps(category === 'detection' ? 'detection' : category, log);
    if (steps.length > 0 && Array.isArray(log.activeCheck)) {
        let done = log.activeCheck.filter(Boolean).length;
        label += ` · 步骤 ${done}/${steps.length}`;
    }
    return { ...meta, typeLabel: label, bgColor: log.status === '已完成' ? 'var(--surface-hover)' : 'var(--surface)' };
}

function wbBuildStageHistory(category) {
    let logs = [...(WB_STATE.logs[category] || [])].reverse();
    if (logs.length === 0) return '<div class="empty-state">暂无记录</div>';
    return logs.map(log => {
        let meta = wbGetStageMeta(category, log);
        let extras = `
            <button class="btn btn-sm btn-secondary" style="padding:2px 7px; margin-right:4px;" onclick="event.stopPropagation();_wbEditLog('${category}','${log.id}')"><i class="ti ti-pencil"></i></button>
            <button class="btn btn-sm btn-danger" style="padding:2px 7px;" onclick="event.stopPropagation();deleteWbItem('${category}','logs','${log.id}', event)"><i class="ti ti-x"></i></button>`;
        return buildRecordCard({ key: `wb_${category}_${log.id}`, type: meta.type, data: log, meta, extraButtons: extras });
    }).join('');
}

window._wbEditLog = function(category, id) {
    if (category === 'extract') loadWbExtractState(id);
    if (category === 'electrophoresis') loadWbElectroState(id);
    if (category === 'detection') loadWbDetectState(id);
};

function wbSplitDetectionProtocols(items) {
    let antibodies = [];
    let workflows = [];

    (items || []).forEach(item => {
        if (item && item.kind === 'workflow') workflows.push(item);
        else antibodies.push(item || {});
    });

    return { antibodies, workflows };
}

function wbGetRangeText(item, field) {
    if (!item) return '';
    if (item[field]) return item[field];
    if (field === 'wb_range' && item.ratio) return `1:${item.ratio}`;
    return '';
}

function wbGetDefaultRatioFromRange(rangeText) {
    let raw = String(rangeText || '').trim();
    if (!raw) return null;
    raw = raw.replace(/1\s*[：:]/g, '');
    let match = raw.match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : null;
}

function wbGetAntibodyDefaultRatio(item) {
    return wbGetDefaultRatioFromRange(wbGetRangeText(item, 'wb_range'));
}

function wbBuildAntibodyTitle(item) {
    let bits = [item.name, item.host, item.vendor].filter(Boolean);
    return bits.join(' | ') || '未命名抗体';
}

function wbHydrateDetectLog(log) {
    if (!log) return log;
    if (!Array.isArray(log.strips)) log.strips = [];

    if (!log.workflow_id && WB_STATE.protocols.detectionWorkflows.length > 0) {
        log.workflow_id = WB_STATE.protocols.detectionWorkflows[0].id;
        if (!log.workflow_name) log.workflow_name = WB_STATE.protocols.detectionWorkflows[0].name;
    }

    let workflow = WB_STATE.protocols.detectionWorkflows.find(x => x.id === log.workflow_id);
    if (workflow && !log.workflow_name) log.workflow_name = workflow.name;

    if ((!Array.isArray(log.activeCheck) || log.activeCheck.length === 0) && log.strips[0] && Array.isArray(log.strips[0].activeCheck) && log.strips[0].activeCheck.length > 0) {
        log.activeCheck = log.strips[0].activeCheck.slice();
    }

    if (!Array.isArray(log.activeCheck)) {
        log.activeCheck = new Array((workflow && workflow.steps ? workflow.steps.length : 0)).fill(false);
    }

    log.strips = log.strips.map(st => {
        let antibody = WB_STATE.protocols.detection.find(x => x.id === st.ab_id);
        let ratio = st.ratio;
        if ((ratio === undefined || ratio === null || ratio === '') && antibody) {
            ratio = wbGetAntibodyDefaultRatio(antibody) || '';
        }
        return {
            ab_id: st.ab_id || '',
            vol: st.vol || 10,
            ratio: ratio === undefined || ratio === null ? '' : ratio
        };
    });

    return log;
}

/**
 * 载入后台数据字典
 */
window.loadWbData = async function() {
    try {
        let rs = await Promise.all([
            fetch('/api/wb/extract/protocols'),      // 0
            fetch('/api/wb/electrophoresis/protocols'),// 1
            fetch('/api/wb/detection/protocols'),    // 2
            fetch('/api/wb/extract/logs'),           // 3
            fetch('/api/wb/electrophoresis/logs'),   // 4
            fetch('/api/wb/detection/logs'),         // 5
            fetch('/api/wb/samples/groups'),         // 6
            fetch('/api/protocols')                  // 7 (药物)
        ]);
        
        WB_STATE.protocols.extract = await rs[0].json();
        WB_STATE.protocols.electrophoresis = await rs[1].json();
        let detectionItems = await rs[2].json();
        let detectionSplit = wbSplitDetectionProtocols(detectionItems);
        WB_STATE.protocols.detection = detectionSplit.antibodies;
        WB_STATE.protocols.detectionWorkflows = detectionSplit.workflows;
        
        WB_STATE.logs.extract = await rs[3].json();
        WB_STATE.logs.electrophoresis = await rs[4].json();
        WB_STATE.logs.detection = (await rs[5].json()).map(wbHydrateDetectLog);
        
        WB_STATE.sampleGroups = await rs[6].json();
        
        // 渲染对应的视图
        if (typeof renderWbProtocolsBox === 'function') renderWbProtocolsBox();
        if (typeof renderWbSamples === 'function') renderWbSamples();
        if (typeof renderWbExtract === 'function') renderWbExtract();
        if (typeof renderWbElectro === 'function') renderWbElectro();
        if (typeof renderWbDetect === 'function') renderWbDetect();
        
    } catch(e) {
        console.error("WB Data Load Error:", e);
    }
}

/**
 * 通用删除
 */
window.deleteWbItem = async function(category, type, id, event) {
    if (event) event.stopPropagation();
    if(!confirm("确定要删除此条记录吗？")) return;
    try {
        let res = await fetch(`/api/wb/${category}/${type}/${id}`, { method: 'DELETE' });
        if(!res.ok) throw new Error("删除失败");
        showToast("已删除");
        await loadWbData();
    } catch(e) {
        showToast(e.message, "error");
    }
}

/**
 * =========================================================================
 *  模块 0 : 方案库渲染
 * =========================================================================
 */
window.renderWbProtocolsBox = function() {
    let container = document.getElementById('wbProtocolsContainer');
    if (!container) return;

    let antibodyItems = WB_STATE.protocols.detection.length === 0
        ? '<div class="empty-state">暂无抗体条目</div>'
        : WB_STATE.protocols.detection.map(p => {
            let hostVendor = [p.host, p.vendor].filter(Boolean).join(' | ');
            let ranges = [
                ['WB', wbGetRangeText(p, 'wb_range')],
                ['IF', wbGetRangeText(p, 'if_range')],
                ['IHC', wbGetRangeText(p, 'ihc_range')]
            ].filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(' · ');

            return `
                <div class="list-item" style="padding:8px;margin-top:6px;align-items:flex-start;">
                    <div class="list-item-content">
                        <div class="list-item-title" style="font-size:13px;">${p.name || '-'}</div>
                        <div class="list-item-subtitle">${hostVendor || '未填写宿主/厂家'}</div>
                        <div class="list-item-subtitle">${ranges || '未填写实验稀释范围'}</div>
                    </div>
                    <div>
                        <button class="btn btn-sm btn-secondary" style="padding:2px 7px; margin-right:4px;" onclick="editWbPAb('${p.id}')"><i class="ti ti-pencil"></i></button>
                        <button class="btn btn-sm btn-danger" onclick="deleteWbItem('detection','protocols','${p.id}',event)"><i class="ti ti-x"></i></button>
                    </div>
                </div>
            `;
        }).join('');

    let workflowItems = WB_STATE.protocols.detectionWorkflows.length === 0
        ? '<div class="empty-state">暂无检测流程方案</div>'
        : WB_STATE.protocols.detectionWorkflows.map(p => `
            <div class="list-item" style="padding:8px;margin-top:6px;align-items:flex-start;">
                <div class="list-item-content">
                    <div class="list-item-title" style="font-size:13px;">${p.name || '-'}</div>
                    <div class="list-item-subtitle">${(p.steps || []).length} 个流程步骤</div>
                </div>
                <div>
                    <button class="btn btn-sm btn-secondary" style="padding:2px 7px; margin-right:4px;" onclick="editWbDWorkflow('${p.id}')"><i class="ti ti-pencil"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="deleteWbItem('detection','protocols','${p.id}',event)"><i class="ti ti-x"></i></button>
                </div>
            </div>
        `).join('');

    container.innerHTML = `
        <div class="card">
            <div class="card-header"><i class="ti ti-droplet-half-2"></i> WB 提取与配平方案</div>
            <div class="form-group"><label class="form-label">方案名称</label><input class="form-input" id="wbPExName" placeholder="如: RIPA + 5x Loading"></div>
            <div class="form-group"><label class="form-label" style="display:flex;justify-content:space-between">操作步骤提示 (支持多行) <span style="font-weight:normal;color:#888;font-size:11px;">(留空则不显示检查单)</span></label><textarea class="form-textarea" id="wbPExSteps" placeholder="加入1x蛋白酶抑制剂\\n超声15秒\\n..."></textarea></div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">Loading Buffer设定</label><select class="form-select" id="wbPExLb"><option value="4">4x</option><option value="5" selected>5x</option><option value="6">6x</option></select></div>
            </div>
            <button class="btn btn-secondary btn-block" onclick="saveWbPEx()"><i class="ti ti-device-floppy"></i> 保存提取配平方案</button>
            <div class="divider"></div>
            ${WB_STATE.protocols.extract.map(p => `
                <div class="list-item" style="padding:6px;margin-top:6px;">
                    <span style="font-size:13px">${p.name}</span>
                    <div>
                        <button class="btn btn-sm btn-secondary" style="padding:2px 7px; margin-right:4px;" onclick="editWbPEx('${p.id}')"><i class="ti ti-pencil"></i></button>
                        <button class="btn btn-sm btn-danger" onclick="deleteWbItem('extract','protocols','${p.id}',event)"><i class="ti ti-x"></i></button>
                    </div>
                </div>
            `).join('')}
        </div>
        
        <div class="card">
            <div class="card-header"><i class="ti ti-layers-subtract"></i> 半预制胶/电泳方案</div>
            <div class="form-group"><label class="form-label">方案名称</label><input class="form-input" id="wbPElName" placeholder="如: 10% 预制胶 + 湿转"></div>
            <div class="form-group"><label class="form-label" style="display:flex;justify-content:space-between">操作步骤提示 (支持多行)</label><textarea class="form-textarea" id="wbPElSteps" placeholder="撕开胶纸\\n浓缩胶 80V 30分..."></textarea></div>
            <button class="btn btn-secondary btn-block" onclick="saveWbPEl()"><i class="ti ti-device-floppy"></i> 保存电泳配方</button>
            <div class="divider"></div>
            ${WB_STATE.protocols.electrophoresis.map(p => `
                <div class="list-item" style="padding:6px;margin-top:6px;">
                    <span style="font-size:13px">${p.name}</span>
                    <div>
                        <button class="btn btn-sm btn-secondary" style="padding:2px 7px; margin-right:4px;" onclick="editWbPEl('${p.id}')"><i class="ti ti-pencil"></i></button>
                        <button class="btn btn-sm btn-danger" onclick="deleteWbItem('electrophoresis','protocols','${p.id}',event)"><i class="ti ti-x"></i></button>
                    </div>
                </div>
            `).join('')}
        </div>

        <div class="card">
            <div class="card-header"><i class="ti ti-vaccine"></i> WB 抗体库</div>
            <div class="form-group"><label class="form-label">抗体名称</label><input class="form-input" id="wbPAbName" placeholder="如: GAPDH"></div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">宿主</label><input class="form-input" id="wbPAbHost" placeholder="如: Mouse / Rabbit"></div>
                <div class="form-group"><label class="form-label">厂家</label><input class="form-input" id="wbPAbVendor" placeholder="如: CST / Abcam"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">WB 稀释比范围</label><input class="form-input" id="wbPAbWbRange" placeholder="如: 1:500-1:2000"></div>
                <div class="form-group"><label class="form-label">IF 稀释比范围</label><input class="form-input" id="wbPAbIfRange" placeholder="如: 1:100-1:500"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">IHC 稀释比范围</label><input class="form-input" id="wbPAbIhcRange" placeholder="如: 1:100-1:300"></div>
                <div class="form-group"><label class="form-label">备注</label><input class="form-input" id="wbPAbNote" placeholder="如: 4C 过夜, PVDF 推荐"></div>
            </div>
            <button class="btn btn-secondary btn-block" onclick="saveWbPAb()"><i class="ti ti-device-floppy"></i> 保存抗体条目</button>
            <div class="divider"></div>
            ${antibodyItems}
        </div>

        <div class="card">
            <div class="card-header"><i class="ti ti-list-check"></i> WB 检测流程方案</div>
            <div class="form-group"><label class="form-label">方案名称</label><input class="form-input" id="wbDWfName" placeholder="如: 常规 ECL 洗膜流程"></div>
            <div class="form-group"><label class="form-label">流程步骤 (支持多行)</label><textarea class="form-textarea" id="wbDWfSteps" placeholder="5%脱脂奶粉封闭 1h\n一抗 4度过夜\nTBST 洗膜 10min x3\n二抗孵育 1h\nECL 显影"></textarea></div>
            <button class="btn btn-secondary btn-block" onclick="saveWbDWorkflow()"><i class="ti ti-device-floppy"></i> 保存检测流程方案</button>
            <div class="divider"></div>
            ${workflowItems}
        </div>
    `;
}

// 方案保存函数
window.saveWbPEx = async function() {
    let name = document.getElementById('wbPExName').value.trim();
    let steps = document.getElementById('wbPExSteps').value.trim();
    let lb = document.getElementById('wbPExLb').value;
    if(!name) return showToast("请输入方案名称","error");
    
    let payload = { name, steps: steps.split('\\n').filter(s=>s.trim()!==''), lb_factor: parseInt(lb) };
    if(window._editingWbPExId) { payload.id = window._editingWbPExId; }
    
    await fetch('/api/wb/extract/protocols', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    window._editingWbPExId = null;
    showToast("提取方案保存成功");
    loadWbData();
}
window.editWbPEx = function(id) {
    let p = WB_STATE.protocols.extract.find(x => x.id === id);
    if(p) {
        document.getElementById('wbPExName').value = p.name;
        document.getElementById('wbPExSteps').value = (p.steps || []).join('\\n');
        document.getElementById('wbPExLb').value = p.lb_factor || '5';
        window._editingWbPExId = id;
    }
}

window.saveWbPEl = async function() {
    let name = document.getElementById('wbPElName').value.trim();
    let steps = document.getElementById('wbPElSteps').value.trim();
    if(!name) return showToast("请输入方案名称","error");
    
    let payload = { name, steps: steps.split('\\n').filter(s=>s.trim()!=='') };
    if(window._editingWbPElId) { payload.id = window._editingWbPElId; }
    
    await fetch('/api/wb/electrophoresis/protocols', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    window._editingWbPElId = null;
    showToast("电泳方案保存成功");
    loadWbData();
}
window.editWbPEl = function(id) {
    let p = WB_STATE.protocols.electrophoresis.find(x => x.id === id);
    if(p) {
        document.getElementById('wbPElName').value = p.name;
        document.getElementById('wbPElSteps').value = p.steps.join('\\n');
        window._editingWbPElId = id;
    }
}

window.saveWbPAb = async function() {
    let name = document.getElementById('wbPAbName').value.trim();
    let host = document.getElementById('wbPAbHost').value.trim();
    let vendor = document.getElementById('wbPAbVendor').value.trim();
    let wbRange = document.getElementById('wbPAbWbRange').value.trim();
    let ifRange = document.getElementById('wbPAbIfRange').value.trim();
    let ihcRange = document.getElementById('wbPAbIhcRange').value.trim();
    let note = document.getElementById('wbPAbNote').value.trim();
    if(!name) return showToast("请输入抗体名称","error");
    
    let payload = {
        kind: 'antibody',
        name,
        host,
        vendor,
        wb_range: wbRange,
        if_range: ifRange,
        ihc_range: ihcRange,
        note
    };
    if(window._editingWbPAbId) { payload.id = window._editingWbPAbId; }
    
    await fetch('/api/wb/detection/protocols', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    window._editingWbPAbId = null;
    showToast("抗体条目保存成功");
    loadWbData();
}
window.editWbPAb = function(id) {
    let p = WB_STATE.protocols.detection.find(x => x.id === id);
    if(p) {
        document.getElementById('wbPAbName').value = p.name;
        document.getElementById('wbPAbHost').value = p.host || '';
        document.getElementById('wbPAbVendor').value = p.vendor || '';
        document.getElementById('wbPAbWbRange').value = p.wb_range || (p.ratio ? `1:${p.ratio}` : '');
        document.getElementById('wbPAbIfRange').value = p.if_range || '';
        document.getElementById('wbPAbIhcRange').value = p.ihc_range || '';
        document.getElementById('wbPAbNote').value = p.note || '';
        window._editingWbPAbId = id;
    }
}

window.saveWbDWorkflow = async function() {
    let name = document.getElementById('wbDWfName').value.trim();
    let steps = document.getElementById('wbDWfSteps').value.trim();
    if(!name) return showToast("请输入流程方案名称","error");

    let payload = {
        kind: 'workflow',
        name,
        steps: steps.split('\\n').filter(s => s.trim() !== '')
    };
    if(window._editingWbDWorkflowId) { payload.id = window._editingWbDWorkflowId; }

    await fetch('/api/wb/detection/protocols', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    window._editingWbDWorkflowId = null;
    showToast("检测流程方案保存成功");
    loadWbData();
}

window.editWbDWorkflow = function(id) {
    let p = WB_STATE.protocols.detectionWorkflows.find(x => x.id === id);
    if(p) {
        document.getElementById('wbDWfName').value = p.name || '';
        document.getElementById('wbDWfSteps').value = (p.steps || []).join('\\n');
        window._editingWbDWorkflowId = id;
    }
}

/**
 * =========================================================================
 *  模块 1 : WB 样本设定
 * =========================================================================
 */
window._curWbSampleGroup = null;

window.renderWbSamples = function() {
    let c = document.getElementById('wbSamples');
    if (!c) return;

    let isOngoing = !!window._curWbSampleGroup;
    let setupHtml = ``;

    if (!isOngoing) {
        setupHtml = `
        <div class="card" style="margin-top:8px;">
            <div class="card-header"><i class="ti ti-users"></i> 新建 WB 独立样本组</div>
            <div class="form-group"><input class="form-input" id="wbSmpGroupName" placeholder="样本组名称 (如: A549 缺氧模型蛋白提取)"></div>
            <div class="form-group"><input class="form-input" id="wbSmpGroupSource" placeholder="样本来源说明 / 分组备注"></div>
            <button class="btn btn-primary btn-block" style="margin-top: 12px;" onclick="startWbSampleGroup()"><i class="ti ti-player-play"></i> 开始设定</button>
        </div>`;
    } else {
        let g = window._curWbSampleGroup;
        setupHtml = `
        <div class="card" style="margin-top:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <h3 style="margin:0;font-size:16px;">[${g.name}]</h3>
                    <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">来源/备注: ${g.source || '-'}</div>
                </div>
                <button class="btn btn-sm btn-secondary" onclick="window._curWbSampleGroup=null;window._editingWbSmpGroupId=null;renderWbSamples()"><i class="ti ti-x"></i> 取消设定</button>
            </div>
            
            <div class="divider"></div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
                <label class="form-label" style="margin:0;">样本清单</label>
                <button class="btn btn-sm btn-secondary" onclick="addWbSampleRow()"><i class="ti ti-plus"></i> 添加样本</button>
            </div>
            
            <div class="rt-table-wrapper">
                <table class="rt-table" id="wbSmpGroupTable">
                    <thead><tr><th>样本名称标识</th><th>处理/组别</th><th>备注(时间等)</th><th style="width:50px;">操作</th></tr></thead>
                    <tbody id="wbSmpGroupTbody"></tbody>
                </table>
            </div>
            <button class="btn btn-success btn-block" style="margin-top:12px;" onclick="saveWbSampleGroup()"><i class="ti ti-circle-check"></i> 确认保存样本组配置</button>
        </div>`;
    }

    let historyHtml = `
        <div class="divider"></div>
        <div class="section-title"><i class="ti ti-history"></i> 历史记录</div>
        ${WB_STATE.sampleGroups.length === 0 ? '<div class="empty-state">暂无样本组</div>' : WB_STATE.sampleGroups.map(g => {
        let extras = `<button class="btn btn-sm btn-secondary" style="padding:2px 7px; margin-right:4px;" onclick="event.stopPropagation();viewWbSampleGroup('${g.id}')"><i class="ti ti-pencil"></i></button>
                      <button class="btn btn-sm btn-danger" style="padding:2px 7px;" onclick="event.stopPropagation();deleteWbItem('samples','groups','${g.id}', event)"><i class="ti ti-trash"></i></button>`;
        return buildRecordCard({
            key: 'wb_sg_' + g.id,
            type: 'wb_sample_group',
            data: g,
            meta: { icon: 'ti-users', color: '#3498DB', typeLabel: `WB 样本组 · ${(g.samples || []).length}个样本` },
            extraButtons: extras
        });
    }).join('')}`;

    c.innerHTML = setupHtml + historyHtml;

    if (isOngoing) _renderWbSmpTbody();
}

window.startWbSampleGroup = function() {
    let name = document.getElementById('wbSmpGroupName').value.trim();
    let source = document.getElementById('wbSmpGroupSource').value.trim();
    if(!name) return showToast('请输入样本组名称','error');
    
    window._curWbSampleGroup = {
        name, source,
        samples: [
            { id: wbCreateId(), name: 'Sample-1', group: 'Control', note: '' },
            { id: wbCreateId(), name: 'Sample-2', group: 'Treat', note: '' }
        ]
    };
    renderWbSamples();
}

window.addWbSampleRow = function() {
    if(!window._curWbSampleGroup) return;
    let n = window._curWbSampleGroup.samples.length + 1;
    let lastGroup = n > 1 ? window._curWbSampleGroup.samples[n-2].group : '';
    window._curWbSampleGroup.samples.push({ id: wbCreateId(), name: `Sample-${n}`, group: lastGroup, note: '' });
    _renderWbSmpTbody();
}

function _renderWbSmpTbody() {
    let tb = document.getElementById('wbSmpGroupTbody');
    if(!tb || !window._curWbSampleGroup) return;
    tb.innerHTML = window._curWbSampleGroup.samples.map((s, i) => `
        <tr>
            <td><input type="text" class="cal-cell-input" style="text-align:left;padding-left:4px;" value="${s.name}" onchange="window._curWbSampleGroup.samples[${i}].name=this.value"></td>
            <td><input type="text" class="cal-cell-input" style="text-align:left;padding-left:4px;" value="${s.group}" onchange="window._curWbSampleGroup.samples[${i}].group=this.value"></td>
            <td><input type="text" class="cal-cell-input" style="text-align:left;padding-left:4px;" value="${s.note}" onchange="window._curWbSampleGroup.samples[${i}].note=this.value"></td>
            <td><button class="btn btn-sm btn-danger" onclick="window._curWbSampleGroup.samples.splice(${i},1);_renderWbSmpTbody()"><i class="ti ti-x"></i></button></td>
        </tr>
    `).join('');
}

window.saveWbSampleGroup = async function() {
    let g = window._curWbSampleGroup;
    if(g.samples.length === 0) return showToast("样本不能为空","error");
    
    // Check duplicates
    let names = g.samples.map(x=>x.name.trim());
    if(new Set(names).size !== names.length) return showToast("样本名称不能重复","error");
    
    let payload = {
        name: g.name, source: g.source,
        samples: g.samples.map(x => ({id: x.id, name: x.name.trim(), group: x.group.trim(), note: x.note.trim()}))
    };
    if (window._editingWbSmpGroupId) payload.id = window._editingWbSmpGroupId;
    
    await fetch('/api/wb/samples/groups', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    window._curWbSampleGroup = null;
    window._editingWbSmpGroupId = null;
    
    // Refresh WB extract input dropdown immediately if exist
    if (typeof _refreshWbExtractSelect === 'function') _refreshWbExtractSelect();
    
    showToast("WB 样本组已被稳妥保存。你不仅可以在这里修改它，也可在历史记录界面点击铅笔编辑。");
    loadWbData();
}

window.viewWbSampleGroup = function(id) {
    let g = WB_STATE.sampleGroups.find(x => x.id === id);
    if(g) {
        window._curWbSampleGroup = JSON.parse(JSON.stringify(g));
        window._editingWbSmpGroupId = id;
        renderWbSamples();
        switchTab(document.querySelector('.tab-btn[onclick*="wbSamples"]'), 'wbTab', 'wbSamples');
    }
}

function _refreshWbExtractSelect() {
    let sel = document.getElementById('wbExSampleSrc');
    if (!sel) return;
    let prev = sel.value;
    sel.innerHTML = WB_STATE.sampleGroups.map(g => `<option value="${g.id}"${g.id===prev?' selected':''}>${g.name} (${g.samples.length}样)</option>`).join('');
    if (!WB_STATE.sampleGroups.find(l => l.id === prev) && WB_STATE.sampleGroups.length > 0) sel.value = WB_STATE.sampleGroups[0].id;
}

/**
 * =========================================================================
 *  模块 2 : 阶段一 (提取与变性配平)
 * =========================================================================
 */
window._curWbExtract = null;

window.renderWbExtract = function() {
    let c = document.getElementById('wbExtract');
    if(!c) return;

    let historyHtml = `
        <div class="divider"></div>
        <div class="section-title"><i class="ti ti-history"></i> 历史记录</div>
        <div id="wbExHistory">${wbBuildStageHistory('extract')}</div>
    `;

    if (!window._curWbExtract) {
        c.innerHTML = `
            <div class="card" style="margin-top:8px;">
                <button class="btn btn-primary btn-block" onclick="_startNewWbExtract()"><i class="ti ti-player-play"></i> 开始提取变性实验</button>
            </div>
            ${historyHtml}
        `;
        return;
    }

    let e = window._curWbExtract;
    let p = WB_STATE.protocols.extract.find(x => x.id === e.protocol_id) || { id: '', name: e.p_name || '默认参数', steps: [], lb_factor: e.bufferX || 5 };
    let st = p.steps || [];
    
    let checkArr = e.activeCheck || [];
    let stepsHtml = wbBuildStepChecklist(st, checkArr, 'wbexStep', 'wbUpdateExCheck', '实验步骤提示 / Protocol Steps');

    // Standards Setup
    let stdHtml = `
        <div style="background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-sm); padding:10px; margin-bottom:12px;">
            <div style="font-size:12px; font-weight:600; margin-bottom:8px; display:flex; justify-content:space-between">
                <span><i class="ti ti-chart-line"></i> BCA 标准曲线 (y=kx+b)</span>
                <span id="bcaRslt" style="color:var(--accent)">R² = ?</span>
            </div>
            <div style="display:grid; grid-template-columns: repeat(6, 1fr); gap:4px;">
                <div style="font-size:10px;text-align:center;color:#888;">0 μg/μl</div>
                <div style="font-size:10px;text-align:center;color:#888;">0.125</div>
                <div style="font-size:10px;text-align:center;color:#888;">0.25</div>
                <div style="font-size:10px;text-align:center;color:#888;">0.5</div>
                <div style="font-size:10px;text-align:center;color:#888;">1.0</div>
                <div style="font-size:10px;text-align:center;color:#888;">2.0</div>
                
                <input type="number" class="cal-cell-input" placeholder="OD" value="${e.stds[0]||''}" onchange="wbUpdateStd(0, this.value)">
                <input type="number" class="cal-cell-input" placeholder="OD" value="${e.stds[1]||''}" onchange="wbUpdateStd(1, this.value)">
                <input type="number" class="cal-cell-input" placeholder="OD" value="${e.stds[2]||''}" onchange="wbUpdateStd(2, this.value)">
                <input type="number" class="cal-cell-input" placeholder="OD" value="${e.stds[3]||''}" onchange="wbUpdateStd(3, this.value)">
                <input type="number" class="cal-cell-input" placeholder="OD" value="${e.stds[4]||''}" onchange="wbUpdateStd(4, this.value)">
                <input type="number" class="cal-cell-input" placeholder="OD" value="${e.stds[5]||''}" onchange="wbUpdateStd(5, this.value)">
            </div>
        </div>
    `;

    // Normalization Config
    let normHtml = `
        <div style="display:flex; gap:12px; margin-bottom:12px; background:var(--surface-hover); padding:10px; border-radius:var(--radius-sm);">
            <div style="flex:1;">
                <label style="font-size:11px;color:#888;">目标上样质量(μg)</label>
                <input type="number" class="cal-cell-input" value="${e.targetMass||30}" onchange="window._curWbExtract.targetMass=parseFloat(this.value);renderWbExtract()">
            </div>
            <div style="flex:1;">
                <label style="font-size:11px;color:#888;">目标孔体积(μl)</label>
                <input type="number" class="cal-cell-input" value="${e.targetVol||15}" onchange="window._curWbExtract.targetVol=parseFloat(this.value);renderWbExtract()">
            </div>
            <div style="flex:1;">
                <label style="font-size:11px;color:#888;">上样缓冲(x)</label>
                <input type="number" class="cal-cell-input" value="${e.bufferX||(p?p.lb_factor:5)}" disabled>
            </div>
        </div>
    `;

    // Samples Table
    let tableHtml = `
        <div class="rt-table-wrapper">
            <table class="rt-table">
                <thead><tr><th style="width:70px">样本</th><th style="width:60px">净OD</th><th>浓度(μg/μl)</th><th style="min-width:140px;color:var(--accent)">配平加液表 (μl)<br><span style="font-size:9px">原液 / RIPA / Buffer</span></th></tr></thead>
                <tbody>
                    ${e.samples.map((s, i) => {
                        let rowHtml = ``;
                        if (s.conc === undefined) s.conc = 0;
                        if (s.od && e.eq_k && e.eq_k > 0) {
                            s.conc = Math.max(0, (parseFloat(s.od) - e.eq_b) / e.eq_k);
                        }
                        
                        let normStr = `<span style="color:#888;font-size:11px;">无浓度</span>`;
                        let warn = false;
                        if (s.conc > 0) {
                            let V_prot = e.targetMass / s.conc;
                            let V_buf = e.targetVol / e.bufferX;
                            let V_ripa = e.targetVol - V_prot - V_buf;
                            if (V_ripa < 0) {
                                warn = true;
                                normStr = `<span style="color:var(--danger);font-size:11px;font-weight:700;">蛋白超量 ${V_prot.toFixed(1)}μl</span>`;
                            } else {
                                normStr = `<span style="font-size:11px;"><b>${V_prot.toFixed(1)}</b> / ${V_ripa.toFixed(1)} / ${V_buf.toFixed(1)}</span>`;
                            }
                        }

                        return `
                        <tr style="${warn?'background:rgba(255,55,95,0.05)':''}">
                            <td style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:70px;" title="${s.name}">${s.name}</td>
                            <td><input type="number" class="cal-cell-input" style="padding:2px" value="${s.od||''}" onchange="window._curWbExtract.samples[${i}].od=this.value;renderWbExtract()"></td>
                            <td style="font-size:12px;font-weight:600;">${s.conc?s.conc.toFixed(2):'-'}</td>
                            <td>${normStr}</td>
                        </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;

    let srcOptions = wbGetUsableSampleGroups().map(g => `<option value="${g.id}" ${g.id === e.group_id?'selected':''}>${g.name} (${g.samples.length}样)</option>`).join('');
    let protoOptions = WB_STATE.protocols.extract.length === 0
        ? '<option value="">默认参数 (5x Loading Buffer)</option>'
        : WB_STATE.protocols.extract.map(p => `<option value="${p.id}" ${p.id === e.protocol_id?'selected':''}>${p.name}</option>`).join('');

    c.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div style="font-weight:700; font-size:16px;"><i class="ti ti-droplet" style="color:var(--primary)"></i> 提取变性实验</div>
            <button class="btn btn-sm btn-secondary" onclick="window._curWbExtract=null;renderWbExtract()"><i class="ti ti-x"></i></button>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">来源样本组</label>
                <select class="form-select" onchange="wbUpdateExConfig(this.value, null)">
                    ${srcOptions}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">采用方案 (含配平规则)</label>
                <select class="form-select" onchange="wbUpdateExConfig(null, this.value)">
                    ${protoOptions}
                </select>
            </div>
        </div>
        ${stepsHtml}
        ${stdHtml}
        ${normHtml}
        ${tableHtml}
        
        <div style="display:flex; gap:12px; margin-top:16px;">
            <button class="btn btn-secondary" style="flex:1" onclick="autoSaveWbEx()"><i class="ti ti-device-floppy"></i> 暂存进度</button>
            ${e.status !== '已完成' ? 
                `<button class="btn btn-success" style="flex:1.5" onclick="finishWbExtract()"><i class="ti ti-check"></i> 完成配平 & 变性</button>` :
                `<div style="flex:1.5; text-align:center; color:var(--success); font-weight:700; line-height:36px;"><i class="ti ti-check"></i> 已归档</div>`
            }
        </div>
    `;

    setTimeout(calcBcaCurve, 50);
}

window._startNewWbExtract = function() {
    let sampleGroups = wbGetUsableSampleGroups();
    if (sampleGroups.length === 0) {
        if (wbPendingSampleGroupHasSamples()) {
            return wbNotifyBlocked("请先在样本组页点击“确认保存样本组配置”");
        }
        return wbNotifyBlocked("请先在 WB 样本组中保存至少 1 个样本");
    }
    let sg = sampleGroups[0];
    let p = WB_STATE.protocols.extract[0] || { id: '', name: '默认提取配平参数', steps: [], lb_factor: 5 };
    
    window._curWbExtract = {
        name: `WB 提取配平 (基于 ${sg.name})`,
        status: '进行中',
        protocol_id: p.id,
        p_name: p.name,
        group_id: sg.id,
        activeCheck: [],
        stds: ['', '', '', '', '', ''],
        targetMass: 30,
        targetVol: 15,
        bufferX: p.lb_factor || 5,
        samples: JSON.parse(JSON.stringify(sg.samples)), // deep copy
        eq_k: 0,
        eq_b: 0,
        r2: 0
    };
    renderWbExtract();
    if (WB_STATE.protocols.extract.length === 0 && typeof showToast === 'function') {
        showToast("未检测到提取方案，已使用默认 5x Loading Buffer", "warning");
    }
    autoSaveWbEx();
}

window.wbUpdateExConfig = function(gid, pid) {
    let e = window._curWbExtract;
    if(!e) return;
    
    if(gid) {
        let sg = WB_STATE.sampleGroups.find(x => x.id === gid);
        if (!sg || !Array.isArray(sg.samples) || !sg.samples.some(sample => String(sample.name || '').trim())) return wbNotifyBlocked("所选 WB 样本组没有可用样本");
        e.group_id = gid;
        e.name = `WB 提取配平 (基于 ${sg.name})`;
        e.samples = JSON.parse(JSON.stringify(sg.samples));
    }
    if(pid !== null) {
        if (!pid) {
            e.protocol_id = '';
            e.p_name = '默认提取配平参数';
            e.bufferX = 5;
            e.activeCheck = [];
            renderWbExtract();
            autoSaveWbEx();
            return;
        }
        let p = WB_STATE.protocols.extract.find(x => x.id === pid);
        if (!p) return;
        e.protocol_id = pid;
        e.p_name = p.name;
        e.bufferX = p.lb_factor || 5;
        e.activeCheck = [];
    }
    renderWbExtract();
    autoSaveWbEx();
}

window.wbUpdateExCheck = function(i, checked) {
    let e = window._curWbExtract;
    if(!e) return;
    if(!e.activeCheck) e.activeCheck = [];
    e.activeCheck[i] = checked;
    autoSaveWbEx(true); // passive save
}

window.wbUpdateStd = function(i, value) {
    let e = window._curWbExtract;
    if(!e) return;
    e.stds[i] = value;
    calcBcaCurve();
    renderWbExtract();
}

window.calcBcaCurve = function() {
    let e = window._curWbExtract;
    if(!e) return;
    let xStr = [0, 0.125, 0.25, 0.5, 1.0, 2.0];
    let points = [];
    for(let i=0; i<6; i++) {
        let v = parseFloat(e.stds[i]);
        if(!isNaN(v)) points.push({x: xStr[i], y: v});
    }
    
    let rsltEl = document.getElementById('bcaRslt');
    if(points.length < 2) {
        if(rsltEl) rsltEl.innerText = '标准点不足';
        return;
    }
    
    let n = points.length;
    let sumX=0, sumY=0, sumXY=0, sumX2=0;
    points.forEach(p => { sumX+=p.x; sumY+=p.y; sumXY+=p.x*p.y; sumX2+=p.x*p.x; });
    
    let meanX = sumX/n;
    let meanY = sumY/n;
    
    let denom = (n*sumX2 - sumX*sumX);
    if(denom === 0) {
        if(rsltEl) rsltEl.innerText = '线性计算失败';
        return;
    }
    
    let k = (n*sumXY - sumX*sumY) / denom;
    let b = meanY - k*meanX;
    
    // R2
    let sst = 0, ssr = 0;
    points.forEach(p => {
        let yFit = k*p.x + b;
        sst += Math.pow(p.y - meanY, 2);
        ssr += Math.pow(p.y - yFit, 2);
    });
    
    let r2 = sst===0 ? 1 : (1 - ssr/sst);
    
    e.eq_k = k;
    e.eq_b = b;
    e.r2 = r2;
    
    if(rsltEl) rsltEl.innerHTML = `R² = <b>${r2.toFixed(4)}</b>`;
    autoSaveWbEx(true); // silent
}

window.autoSaveWbEx = async function(silent=false) {
    if(!window._curWbExtract) return;
    try {
        let rs = await fetch('/api/wb/extract/logs', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(window._curWbExtract) });
        let data = await rs.json();
        if(!window._curWbExtract.id) window._curWbExtract.id = data.id; // backfill UUID
        if(!silent) {
            showToast("暂存成功");
            loadWbData();
        }
    } catch(err) {}
}

window.finishWbExtract = async function() {
    window._curWbExtract.status = '已完成';
    await autoSaveWbEx(false);
    
    if (typeof _refreshWbElectroSelect === 'function') _refreshWbElectroSelect();
    loadWbData();
    window._curWbExtract = null;
    renderWbExtract();
}

window.loadWbExtractState = function(id) {
    let l = WB_STATE.logs.extract.find(x => x.id === id);
    if(l) {
        window._curWbExtract = JSON.parse(JSON.stringify(l));
        renderWbExtract();
    }
}

function _refreshWbElectroSelect() {
    let sel = document.getElementById('wbElExtractSrc');
    if (!sel) return;
    let prev = sel.value;
    let all = WB_STATE.logs.extract.filter(l => l.status === '已完成');
    sel.innerHTML = all.map(l => `<option value="${l.id}"${l.id===prev?' selected':''}>${l.name}</option>`).join('');
    if (!all.find(l => l.id === prev) && all.length > 0) sel.value = all[0].id;
}

/**
 * =========================================================================
 *  模块 3 : 阶段二 (跑胶与转膜)
 * =========================================================================
 */
window._curWbElectro = null;

window.renderWbElectro = function() {
    let c = document.getElementById('wbElectro');
    if(!c) return;

    let allEx = WB_STATE.logs.extract.filter(l => l.status === '已完成');
    
    let historyHtml = `
        <div class="divider"></div>
        <div class="section-title"><i class="ti ti-history"></i> 历史记录</div>
        <div id="wbElHistory">${wbBuildStageHistory('electrophoresis')}</div>
    `;

    if (!window._curWbElectro) {
        c.innerHTML = `
            <div class="card" style="margin-top:8px;">
                <button class="btn btn-primary btn-block" onclick="_startNewWbElectro()"><i class="ti ti-player-play"></i> 开始跑胶与转膜</button>
            </div>
            ${historyHtml}
        `;
        return;
    }

    let e = window._curWbElectro;
    let p = WB_STATE.protocols.electrophoresis.find(x => x.id === e.protocol_id) || { id: '', name: e.p_name || '默认跑胶转膜参数', steps: [] };
    let st = p.steps || [];
    
    let checkArr = e.activeCheck || [];
    let stepsHtml = wbBuildStepChecklist(st, checkArr, 'wbelStep', 'wbUpdateElCheck', '实验步骤提示 / Protocol Steps');

    // Extract samples to drop
    let smpList = WB_STATE.logs.extract.find(x => x.id === e.extract_id)?.samples || [];
    
    // Virtual Gel Map
    let unassigned = smpList.filter(s => !e.laneMap.includes(s.id));
    
    // Build Lane map HTML
    let lanesHtml = Array.from({length: parseInt(e.numWells)}).map((_, i) => {
        let assignedId = e.laneMap[i];
        let content = `<div style="color:#ccc;font-size:10px;text-align:center;margin-top:10px">空</div>`;
        if (assignedId === 'MARKER') {
            content = `<div style="background:#5a67d8;color:#fff;border-radius:4px;padding:4px;font-size:9px;text-align:center">Marker</div>`;
        } else if (assignedId) {
            let smp = smpList.find(x => x.id === assignedId);
            content = `<div style="background:var(--accent);color:#fff;border-radius:4px;padding:4px;font-size:9px;text-align:center;word-break:break-all">${smp ? smp.name : 'Unknown'}</div>`;
        }
        
        return `
            <div style="flex:1; border:1px dashed var(--border); border-radius:4px; min-height:80px; padding:4px; display:flex; flex-direction:column;">
                <div style="font-size:10px;color:#888;text-align:center;border-bottom:1px solid var(--border);padding-bottom:2px;margin-bottom:4px;">#${i+1}</div>
                <div style="flex:1" ondragover="event.preventDefault()" ondrop="wbLaneDrop(event, ${i})">${content}</div>
                ${assignedId ? `<button class="btn btn-sm btn-secondary" style="margin-top:4px;padding:2px 0;font-size:10px;" onclick="wbClearLane(${i})"><i class="ti ti-x"></i></button>` : ''}
            </div>
        `;
    }).join('');

    let poolHtml = unassigned.map(s => `
        <div draggable="true" ondragstart="wbLaneDrag(event, '${s.id}')" style="display:inline-block;background:var(--surface);border:1px solid var(--border);padding:4px 8px;border-radius:12px;font-size:11px;cursor:grab;margin:4px 4px 0 0;">
            ${s.name} <i class="ti ti-grip-vertical"></i>
        </div>
    `).join('');

    let srcOptions = allEx.map(l => `<option value="${l.id}" ${l.id === e.extract_id?'selected':''}>${l.name}</option>`).join('');
    let protoOptions = WB_STATE.protocols.electrophoresis.length === 0
        ? '<option value="">默认参数（无步骤提示）</option>'
        : WB_STATE.protocols.electrophoresis.map(p => `<option value="${p.id}" ${p.id === e.protocol_id?'selected':''}>${p.name}</option>`).join('');

    c.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div style="font-weight:700; font-size:16px;"><i class="ti ti-layout-columns" style="color:var(--primary)"></i> 跑胶与转膜实验</div>
            <button class="btn btn-sm btn-secondary" onclick="window._curWbElectro=null;renderWbElectro()"><i class="ti ti-x"></i></button>
        </div>
        
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">来源: 已完成提取配置</label>
                <select class="form-select" onchange="wbUpdateElConfig(this.value, null, null)">
                    ${srcOptions}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">制胶跑胶配置</label>
                <select class="form-select" onchange="wbUpdateElConfig(null, this.value, null)">
                    ${protoOptions}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">电泳梳规格</label>
                <select class="form-select" onchange="wbUpdateElConfig(null, null, this.value)">
                    <option value="10" ${e.numWells==='10'?'selected':''}>10孔</option>
                    <option value="12" ${e.numWells==='12'?'selected':''}>12孔</option>
                    <option value="15" ${e.numWells==='15'?'selected':''}>15孔</option>
                </select>
            </div>
        </div>
        ${stepsHtml}
        
        <div class="card" style="margin-top:12px">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px">
                <div style="font-size:13px; font-weight:600;"><i class="ti ti-layout-columns"></i> 虚拟凝胶加样排版</div>
                <button class="btn btn-sm btn-secondary" onclick="wbAutoFillLanes()"><i class="ti ti-wand"></i> 一键顺序顺排</button>
            </div>
            
            <div style="display:flex;gap:4px;margin-bottom:16px;background:var(--surface-hover);padding:10px;border-radius:var(--radius-sm);overflow-x:auto;">
                ${lanesHtml}
            </div>
            
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;">拖拽以分配样本排版（支持拖拽 Marker 或下方尚未分配的样本）</div>
            <div style="padding:10px; border:1px dashed var(--border); border-radius:var(--radius-sm); min-height:50px;">
                <div draggable="true" ondragstart="wbLaneDrag(event, 'MARKER')" style="display:inline-block;background:#5a67d8;color:#fff;border:1px solid #4c51bf;padding:4px 8px;border-radius:12px;font-size:11px;cursor:grab;margin:4px 12px 0 0;font-weight:700;">
                    [通用] Marker <i class="ti ti-grip-vertical"></i>
                </div>
                ${poolHtml}
            </div>
        </div>
        
        <div style="display:flex; gap:12px; margin-top:16px;">
            <button class="btn btn-secondary" style="flex:1" onclick="autoSaveWbEl()"><i class="ti ti-device-floppy"></i> 暂存排版</button>
            ${e.status !== '已完成' ? 
                `<button class="btn btn-success" style="flex:1.5" onclick="finishWbElectro()"><i class="ti ti-check"></i> 跑胶转膜完毕</button>` :
                `<div style="flex:1.5; text-align:center; color:var(--success); font-weight:700; line-height:36px;"><i class="ti ti-check"></i> 已转膜结测</div>`
            }
        </div>
    `;
}

window._startNewWbElectro = function() {
    let allEx = WB_STATE.logs.extract.filter(l => l.status === '已完成');
    if (allEx.length === 0) {
        return wbNotifyBlocked("请先完成至少一次 WB 提取配平实验");
    }
    
    let ex = allEx[0];
    let p = WB_STATE.protocols.electrophoresis[0] || { id: '', name: '默认跑胶转膜参数', steps: [] };
    let w = "15";
    
    let laneMap = new Array(parseInt(w)).fill(null);
    
    window._curWbElectro = {
        name: `WB 凝胶电泳 (${ex.name})`,
        status: '进行中',
        protocol_id: p.id,
        extract_id: ex.id,
        p_name: p.name,
        numWells: w,
        activeCheck: [],
        laneMap: laneMap
    };
    renderWbElectro();
    if (WB_STATE.protocols.electrophoresis.length === 0 && typeof showToast === 'function') {
        showToast("未检测到跑胶转膜方案，步骤提示为空", "warning");
    }
    autoSaveWbEl();
}

window.wbUpdateElConfig = function(exid, pid, wells) {
    let e = window._curWbElectro;
    if(!e) return;
    
    if(exid) {
        let ex = WB_STATE.logs.extract.find(x => x.id === exid);
        e.extract_id = exid;
        e.name = `WB 凝胶电泳 (${ex.name})`;
        e.laneMap = new Array(parseInt(e.numWells)).fill(null); // reset lanes if source changes
    }
    if(pid !== null) {
        if (!pid) {
            e.protocol_id = '';
            e.p_name = '默认跑胶转膜参数';
            e.activeCheck = [];
            renderWbElectro();
            autoSaveWbEl();
            return;
        }
        let p = WB_STATE.protocols.electrophoresis.find(x => x.id === pid);
        if (!p) return;
        e.protocol_id = pid;
        e.p_name = p.name;
        e.activeCheck = [];
    }
    if(wells) {
        e.numWells = wells;
        e.laneMap = new Array(parseInt(wells)).fill(null);
    }
    
    renderWbElectro();
    autoSaveWbEl();
}

window.wbUpdateElCheck = function(i, checked) {
    let e = window._curWbElectro;
    if(!e) return;
    if(!e.activeCheck) e.activeCheck = [];
    e.activeCheck[i] = checked;
    autoSaveWbEl(true); // passive save
}

window.wbLaneDrag = function(ev, id) {
    ev.dataTransfer.setData("text", id);
}
window.wbLaneDrop = function(ev, laneIdx) {
    let e = window._curWbElectro;
    if(!e) return;
    let id = ev.dataTransfer.getData("text");
    if(id) {
        // if item is already in another lane, clear it first
        let oldIdx = e.laneMap.indexOf(id);
        if(oldIdx !== -1 && id !== 'MARKER') e.laneMap[oldIdx] = null;
        
        e.laneMap[laneIdx] = id;
        renderWbElectro();
        autoSaveWbEl(true);
    }
}
window.wbClearLane = function(laneIdx) {
    let e = window._curWbElectro;
    if(!e) return;
    e.laneMap[laneIdx] = null;
    renderWbElectro();
    autoSaveWbEl(true);
}
window.wbAutoFillLanes = function() {
    let e = window._curWbElectro;
    if(!e) return;
    let smpList = WB_STATE.logs.extract.find(x => x.id === e.extract_id)?.samples || [];
    let unassigned = smpList.filter(s => !e.laneMap.includes(s.id));
    
    // Find first empty, fill marker, then fill rest
    let emptyCount = e.laneMap.filter(x=>x===null).length;
    if(emptyCount === 0) return;
    
    // Auto-assign logic: Marker in 1, rest sequential. If 1 is occupied, skip.
    let fillPtr = 0;
    if (!e.laneMap.includes('MARKER') && e.laneMap[0] === null) {
        e.laneMap[0] = 'MARKER';
        fillPtr = 1;
    }
    
    for(let s of unassigned) {
        while(fillPtr < e.laneMap.length && e.laneMap[fillPtr] !== null) {
            fillPtr++;
        }
        if(fillPtr < e.laneMap.length) {
            e.laneMap[fillPtr] = s.id;
        }
    }
    renderWbElectro();
    autoSaveWbEl(true);
}

window.autoSaveWbEl = async function(silent=false) {
    if(!window._curWbElectro) return;
    try {
        let rs = await fetch('/api/wb/electrophoresis/logs', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(window._curWbElectro) });
        let data = await rs.json();
        if(!window._curWbElectro.id) window._curWbElectro.id = data.id; // backfill UUID
        if(!silent) {
            showToast("凝胶排版暂存成功");
            loadWbData();
        }
    } catch(err) {}
}

window.finishWbElectro = async function() {
    window._curWbElectro.status = '已完成';
    await autoSaveWbEl(false);
    
    if (typeof _refreshWbDetectSelect === 'function') _refreshWbDetectSelect();
    loadWbData();
    window._curWbElectro = null;
    renderWbElectro();
}

window.loadWbElectroState = function(id) {
    let l = WB_STATE.logs.electrophoresis.find(x => x.id === id);
    if(l) {
        window._curWbElectro = JSON.parse(JSON.stringify(l));
        renderWbElectro();
    }
}

function _refreshWbDetectSelect() {
    let sel = document.getElementById('wbDtElectroSrc');
    if (!sel) return;
    let prev = sel.value;
    let all = WB_STATE.logs.electrophoresis.filter(l => l.status === '已完成');
    sel.innerHTML = all.map(l => `<option value="${l.id}"${l.id===prev?' selected':''}>${l.name}</option>`).join('');
    if (!all.find(l => l.id === prev) && all.length > 0) sel.value = all[0].id;
}

/**
 * =========================================================================
 *  模块 4 : 阶段三 (裁膜与抗体匹配)
 * =========================================================================
 */
window._curWbDetect = null;

window.renderWbDetect = function() {
    let c = document.getElementById('wbDetect');
    if(!c) return;

    if (!window._curWbDetect) {
        let allEl = WB_STATE.logs.electrophoresis.filter(l => l.status === '已完成');
        let historyHtml = `
            <div class="divider"></div>
            <div class="section-title"><i class="ti ti-history"></i> 历史记录</div>
            <div id="wbDtHistory">${wbBuildStageHistory('detection')}</div>
        `;

        c.innerHTML = `
            <div class="card" style="margin-top:8px;">
                <button class="btn btn-primary btn-block" onclick="_startNewWbDetect()"><i class="ti ti-player-play"></i> 开始裁膜与抗体匹配监控</button>
            </div>
            ${historyHtml}
        `;
        return;
    }

    let e = window._curWbDetect;
    let workflow = WB_STATE.protocols.detectionWorkflows.find(x => x.id === e.workflow_id) || { id: '', name: e.workflow_name || '默认检测流程', steps: [] };
    let workflowSteps = workflow ? (workflow.steps || []) : [];
    let workflowChecks = Array.isArray(e.activeCheck) ? e.activeCheck : new Array(workflowSteps.length).fill(false);
    
    // Antibody Selection dropdown template
    let abOpts = `<option value="">-- 未选择 --</option>` + WB_STATE.protocols.detection.map(p => `
        <option value="${p.id}">${wbBuildAntibodyTitle(p)}</option>
    `).join('');

    let stripsHtml = e.strips.map((st, i) => {
        let p = WB_STATE.protocols.detection.find(x => x.id === st.ab_id);
        let ratioText = st.ratio ? `1:${st.ratio}` : (p ? wbGetRangeText(p, 'wb_range') || '-' : '-');
        let calcVol = st.ratio ? (st.vol * 1000 / st.ratio).toFixed(1) : '-';
        let hostVendor = p ? [p.host, p.vendor].filter(Boolean).join(' | ') : '';
        let rangeSummary = p ? [
            wbGetRangeText(p, 'wb_range') ? `WB ${wbGetRangeText(p, 'wb_range')}` : '',
            wbGetRangeText(p, 'if_range') ? `IF ${wbGetRangeText(p, 'if_range')}` : '',
            wbGetRangeText(p, 'ihc_range') ? `IHC ${wbGetRangeText(p, 'ihc_range')}` : ''
        ].filter(Boolean).join(' · ') : '';
        
        return `
            <div style="border:1px solid var(--border); border-radius:var(--radius-md); padding:10px; margin-bottom:12px; background:var(--surface);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <div style="font-weight:600;font-size:14px;"><i class="ti ti-slice"></i> 检测抗体 #${i+1}</div>
                    <button class="btn btn-sm btn-danger" style="padding:2px 8px;" onclick="wbRemoveStrip(${i})"><i class="ti ti-trash"></i> 删除</button>
                </div>
                <div class="form-row">
                    <div class="form-group" style="flex:1;">
                        <label class="form-label" style="font-size:11px;">匹配抗体库</label>
                        <select class="form-select" onchange="wbUpdateStripAb(${i}, this.value)">
                            ${abOpts.replace(`value="${st.ab_id}"`, `value="${st.ab_id}" selected`)}
                        </select>
                        <div style="font-size:11px;color:var(--text-secondary);margin-top:6px;line-height:1.5;">${hostVendor || '未填写宿主/厂家'}</div>
                        <div style="font-size:11px;color:var(--text-tertiary);line-height:1.5;">${rangeSummary || '未填写实验稀释范围'}</div>
                    </div>
                    <div class="form-group" style="flex:1;">
                        <label class="form-label" style="font-size:11px;">封闭底体积(ml)</label>
                        <input type="number" class="form-input" value="${st.vol}" onchange="wbUpdateStripVol(${i}, this.value)">
                    </div>
                    <div class="form-group" style="flex:1;">
                        <label class="form-label" style="font-size:11px;">本次稀释比例 1:</label>
                        <input type="number" class="form-input" value="${st.ratio || ''}" placeholder="如 1000" onchange="wbUpdateStripRatio(${i}, this.value)">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group" style="flex:1;">
                        <label class="form-label" style="font-size:11px;color:var(--text-secondary)">参考范围</label>
                        <div style="padding:8px;font-size:12px;background:var(--surface-hover);border-radius:4px;text-align:center;">
                            ${ratioText}
                        </div>
                    </div>
                    <div class="form-group" style="flex:1;">
                        <label class="form-label" style="font-size:11px;color:var(--accent)">所需加样(μl)</label>
                        <div style="padding:8px;font-size:13px;font-weight:700;color:var(--accent);background:rgba(10,132,255,0.1);border-radius:4px;text-align:center;">
                            ${calcVol}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    let allEl = WB_STATE.logs.electrophoresis.filter(l => l.status === '已完成');
    let srcOptions = allEl.map(l => `<option value="${l.id}" ${l.id === e.electro_id?'selected':''}>${l.name}</option>`).join('');
    let workflowOptions = WB_STATE.protocols.detectionWorkflows.length === 0
        ? '<option value="">默认检测流程（无步骤提示）</option>'
        : WB_STATE.protocols.detectionWorkflows.map(l => `<option value="${l.id}" ${l.id === e.workflow_id?'selected':''}>${l.name}</option>`).join('');
    let workflowHtml = wbBuildStepChecklist(workflowSteps, workflowChecks, 'wbdtFlowStep', 'wbUpdateDtCheck', '实验步骤提示 / Protocol Steps');

    c.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div style="font-weight:700; font-size:16px;"><i class="ti ti-cut" style="color:var(--primary)"></i> 裁膜孵育匹配</div>
            <button class="btn btn-sm btn-secondary" onclick="window._curWbDetect=null;renderWbDetect()"><i class="ti ti-x"></i></button>
        </div>
        
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">来源: 已完成转膜的胶</label>
                <select class="form-select" onchange="wbUpdateDtConfig(this.value)">
                    ${srcOptions}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">检测流程方案</label>
                <select class="form-select" onchange="wbUpdateDtWorkflow(this.value)">
                    ${workflowOptions}
                </select>
            </div>
        </div>
        ${workflowHtml}
        <div class="form-group">
            <label class="form-label"><i class="ti ti-cut"></i> 裁膜 / Marker 刻度备注</label>
            <textarea class="form-textarea" placeholder="例如：70kDa 与 55kDa 之间裁开；上半膜孵育目标蛋白，下半膜孵育内参" oninput="wbUpdateDtCutNote(this.value)">${e.cut_note || ''}</textarea>
        </div>
        
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
            <label class="form-label" style="margin:0;"><i class="ti ti-swatches"></i> 裁膜独立孵育管区</label>
            <button class="btn btn-sm btn-secondary" onclick="wbAddStrip()"><i class="ti ti-plus"></i> 添加检测靶标</button>
        </div>
        
        ${e.strips.length === 0 ? '<div class="empty-state" style="margin-bottom:16px;">没有添加任何检测靶标</div>' : stripsHtml}
        
        <div style="display:flex; gap:12px; margin-top:16px;">
            <button class="btn btn-secondary" style="flex:1" onclick="autoSaveWbDt()"><i class="ti ti-device-floppy"></i> 暂存进度</button>
            ${e.status !== '已完成' ? 
                `<button class="btn btn-success" style="flex:1.5" onclick="finishWbDetect()"><i class="ti ti-check"></i> 显影完毕并归档</button>` :
                `<div style="flex:1.5; text-align:center; color:var(--success); font-weight:700; line-height:36px;"><i class="ti ti-check"></i> 检测已归档</div>`
            }
        </div>
    `;
}

window._startNewWbDetect = function() {
    let allEl = WB_STATE.logs.electrophoresis.filter(l => l.status === '已完成');
    if (allEl.length === 0) return wbNotifyBlocked("请先完成至少一块胶的跑胶转膜流程");
    
    let el = allEl[0];
    let workflow = WB_STATE.protocols.detectionWorkflows[0] || { id: '', name: '默认检测流程', steps: [] };
    
    window._curWbDetect = {
        name: `WB 裁膜显影 (${el.name})`,
        status: '进行中',
        electro_id: el.id,
        workflow_id: workflow.id,
        workflow_name: workflow.name,
        activeCheck: new Array((workflow.steps || []).length).fill(false),
        cut_note: '',
        strips: []
    };
    renderWbDetect();
    if (WB_STATE.protocols.detectionWorkflows.length === 0 && typeof showToast === 'function') {
        showToast("未检测到检测流程方案，步骤提示为空", "warning");
    }
    wbAddStrip();
}

window.wbUpdateDtConfig = function(elid) {
    let e = window._curWbDetect;
    if(!e || !elid) return;
    
    let el = WB_STATE.logs.electrophoresis.find(x => x.id === elid);
    if(el) {
        e.electro_id = el.id;
        e.name = `WB 裁膜显影 (${el.name})`;
    }
    renderWbDetect();
    autoSaveWbDt();
}

window.wbUpdateDtWorkflow = function(workflowId) {
    let e = window._curWbDetect;
    if(!e) return;

    if (!workflowId) {
        e.workflow_id = '';
        e.workflow_name = '默认检测流程';
        e.activeCheck = [];
        renderWbDetect();
        autoSaveWbDt();
        return;
    }

    let workflow = WB_STATE.protocols.detectionWorkflows.find(x => x.id === workflowId);
    if(workflow) {
        e.workflow_id = workflow.id;
        e.workflow_name = workflow.name;
        e.activeCheck = new Array((workflow.steps || []).length).fill(false);
    }
    renderWbDetect();
    autoSaveWbDt();
}

window.wbUpdateDtCutNote = function(value) {
    if (!window._curWbDetect) return;
    window._curWbDetect.cut_note = value;
    autoSaveWbDt(true);
}

window.wbAddStrip = function() {
    let e = window._curWbDetect;
    if(!e) return;
    e.strips.push({ ab_id: '', vol: 10, ratio: '' });
    renderWbDetect();
    autoSaveWbDt(true);
}
window.wbRemoveStrip = function(i) {
    window._curWbDetect.strips.splice(i, 1);
    renderWbDetect();
    autoSaveWbDt(true);
}
window.wbUpdateStripAb = function(i, val) {
    let st = window._curWbDetect.strips[i];
    st.ab_id = val;
    let antibody = WB_STATE.protocols.detection.find(x => x.id === val);
    st.ratio = antibody ? (wbGetAntibodyDefaultRatio(antibody) || '') : '';
    renderWbDetect();
    autoSaveWbDt(true);
}
window.wbUpdateStripVol = function(i, val) {
    window._curWbDetect.strips[i].vol = parseFloat(val);
    renderWbDetect();
    autoSaveWbDt(true);
}
window.wbUpdateStripRatio = function(i, val) {
    let num = parseFloat(val);
    window._curWbDetect.strips[i].ratio = isNaN(num) ? '' : num;
    renderWbDetect();
    autoSaveWbDt(true);
}
window.wbUpdateDtCheck = function(ckIdx, checked) {
    if (!Array.isArray(window._curWbDetect.activeCheck)) window._curWbDetect.activeCheck = [];
    window._curWbDetect.activeCheck[ckIdx] = checked;
    autoSaveWbDt(true); // passive save
}

window.autoSaveWbDt = async function(silent=false) {
    if(!window._curWbDetect) return;
    try {
        let rs = await fetch('/api/wb/detection/logs', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(window._curWbDetect) });
        let data = await rs.json();
        if(!window._curWbDetect.id) window._curWbDetect.id = data.id;
        if(!silent) {
            showToast("孵育记录暂存成功");
            loadWbData();
        }
    } catch(err) {}
}

window.finishWbDetect = async function() {
    window._curWbDetect.status = '已完成';
    await autoSaveWbDt(false);
    loadWbData();
    window._curWbDetect = null;
    renderWbDetect();
}

window.loadWbDetectState = function(id) {
    let l = WB_STATE.logs.detection.find(x => x.id === id);
    if(l) {
        window._curWbDetect = wbHydrateDetectLog(JSON.parse(JSON.stringify(l)));
        renderWbDetect();
    }
}

function _buildWbSampleGroupDetail(d) {
    let rows = (d.samples || []).map(s => `<tr>
        <td style="font-weight:700">${s.name || '-'}</td>
        <td>${s.group || '-'}</td>
        <td>${s.note || '-'}</td>
    </tr>`).join('');
    return `
    <div class="card" style="margin-bottom:8px;">
        <div class="card-header"><i class="ti ti-info-circle"></i> 基本信息</div>
        ${wbRdRow(wbRdField('来源 / 备注', d.source || '-'), wbRdField('包含样本数', (d.samples || []).length + ' 个'))}
        ${wbRdField('创建时间', (d.created_at || '').substring(0, 16))}
    </div>
    <div class="card" style="margin-bottom:8px;">
        <div class="card-header"><i class="ti ti-list"></i> 样本列表</div>
        <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
            <table class="cal-data-table" style="font-size:12px;text-align:center;">
                <thead><tr><th>样本名称</th><th>处理 / 组别</th><th>备注</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="3">无样本</td></tr>'}</tbody>
            </table>
        </div>
    </div>`;
}

function _buildWbExtractDetail(d) {
    let sampleGroup = (WB_STATE.sampleGroups || []).find(g => g.id === d.group_id);
    let steps = wbResolveSteps('extract', d);
    let standards = Array.isArray(d.stds) ? d.stds : [];
    let standardRows = [0, 0.125, 0.25, 0.5, 1.0, 2.0].map((x, i) => `<tr><td>${x}</td><td>${standards[i] || '-'}</td></tr>`).join('');
    let bufferX = Number(d.bufferX || 5);
    let targetMass = Number(d.targetMass || 30);
    let targetVol = Number(d.targetVol || 15);
    let sampleRows = (d.samples || []).map(s => {
        let conc = Number(s.conc || 0);
        if (!conc && s.od && d.eq_k && d.eq_k > 0) conc = Math.max(0, (Number(s.od) - Number(d.eq_b || 0)) / Number(d.eq_k));
        let mix = '-';
        if (conc > 0) {
            let proteinVol = targetMass / conc;
            let bufferVol = targetVol / bufferX;
            let ripaVol = targetVol - proteinVol - bufferVol;
            mix = ripaVol < 0
                ? `<span style="color:var(--danger);font-weight:700">蛋白液 ${proteinVol.toFixed(1)} μL，超出目标体积</span>`
                : `${proteinVol.toFixed(1)} / ${ripaVol.toFixed(1)} / ${bufferVol.toFixed(1)}`;
        }
        return `<tr>
            <td style="font-weight:700">${s.name || '-'}</td>
            <td>${s.group || s.note || '-'}</td>
            <td>${s.od || '-'}</td>
            <td>${conc > 0 ? conc.toFixed(2) : '-'}</td>
            <td>${mix}</td>
        </tr>`;
    }).join('');

    return `
    <div class="card" style="margin-bottom:8px;">
        <div class="card-header"><i class="ti ti-droplet"></i> WB 提取配平</div>
        ${wbRdRow(wbRdField('实验名称', d.name), wbRdField('时间', (d.created_at || d.timestamp || '').substring(0, 16)))}
        ${wbRdRow(wbRdField('状态', wbStatusBadge(d.status)), wbRdField('来源样本组', sampleGroup ? sampleGroup.name : d.group_id))}
        ${wbRdRow(wbRdField('提取方案', d.p_name || d.protocol_name || '默认参数'), wbRdField('上样缓冲', `${bufferX}x`))}
        ${wbRdRow(wbRdField('目标上样质量', `${targetMass} μg`), wbRdField('目标孔体积', `${targetVol} μL`))}
    </div>
    <div class="card" style="margin-bottom:8px;">
        <div class="card-header"><i class="ti ti-chart-line"></i> BCA 标准曲线</div>
        ${wbRdRow(wbRdField('斜率 k', d.eq_k ? Number(d.eq_k).toFixed(4) : '-'), wbRdField('截距 b', d.eq_b ? Number(d.eq_b).toFixed(4) : '-'))}
        ${wbRdField('R²', d.r2 ? Number(d.r2).toFixed(4) : '-')}
        <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
            <table class="cal-data-table" style="font-size:12px;text-align:center;">
                <thead><tr><th>标准浓度 (μg/μL)</th><th>OD</th></tr></thead>
                <tbody>${standardRows}</tbody>
            </table>
        </div>
    </div>
    <div class="card" style="margin-bottom:8px;">
        <div class="card-header"><i class="ti ti-table"></i> 样本浓度与配平表</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">配平列格式：蛋白液 / RIPA / Loading Buffer，单位 μL。</div>
        <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
            <table class="cal-data-table" style="font-size:12px;text-align:center;">
                <thead><tr><th>样本</th><th>组别/备注</th><th>净OD</th><th>浓度</th><th>配平加液</th></tr></thead>
                <tbody>${sampleRows || '<tr><td colspan="5">无样本数据</td></tr>'}</tbody>
            </table>
        </div>
    </div>
    ${wbBuildReadonlySteps(steps, d.activeCheck || [])}`;
}

function _buildWbElectroDetail(d) {
    let extract = (WB_STATE.logs.extract || []).find(x => x.id === d.extract_id);
    let samples = extract ? (extract.samples || []) : [];
    let steps = wbResolveSteps('electrophoresis', d);
    let lanes = Array.isArray(d.laneMap) ? d.laneMap : [];
    let laneHtml = lanes.map((id, i) => {
        let label = '空';
        let style = 'background:var(--surface-hover);color:var(--text-tertiary);border:1px solid var(--border);';
        if (id === 'MARKER') {
            label = 'Marker';
            style = 'background:#5a67d8;color:#fff;border:1px solid #4c51bf;';
        } else if (id) {
            let sample = samples.find(s => s.id === id);
            label = sample ? sample.name : id;
            style = 'background:var(--accent);color:#fff;border:1px solid var(--accent);';
        }
        return `<div style="min-width:54px;flex:1;border:1px dashed var(--border);border-radius:6px;padding:5px;text-align:center;">
            <div style="font-size:10px;color:var(--text-secondary);margin-bottom:4px;">#${i + 1}</div>
            <div style="${style}border-radius:5px;padding:6px 4px;font-size:10px;font-weight:700;min-height:30px;display:flex;align-items:center;justify-content:center;word-break:break-word;">${label}</div>
        </div>`;
    }).join('');

    return `
    <div class="card" style="margin-bottom:8px;">
        <div class="card-header"><i class="ti ti-layout-columns"></i> WB 跑胶转膜</div>
        ${wbRdRow(wbRdField('实验名称', d.name), wbRdField('时间', (d.created_at || d.timestamp || '').substring(0, 16)))}
        ${wbRdRow(wbRdField('状态', wbStatusBadge(d.status)), wbRdField('来源提取记录', extract ? extract.name : d.extract_id))}
        ${wbRdRow(wbRdField('跑胶转膜方案', d.p_name || '默认参数'), wbRdField('电泳梳规格', `${d.numWells || lanes.length || '-'} 孔`))}
    </div>
    <div class="card" style="margin-bottom:8px;">
        <div class="card-header"><i class="ti ti-layout-grid"></i> 凝胶孔位排版</div>
        <div style="display:flex;gap:4px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:4px;">${laneHtml || '<span style="font-size:12px;color:var(--text-tertiary)">无排版数据</span>'}</div>
    </div>
    ${wbBuildReadonlySteps(steps, d.activeCheck || [])}`;
}

function _buildWbDetectDetail(d) {
    let electro = (WB_STATE.logs.electrophoresis || []).find(x => x.id === d.electro_id);
    let steps = wbResolveSteps('detection', d);
    let stripRows = (d.strips || []).map((st, i) => {
        let antibody = (WB_STATE.protocols.detection || []).find(x => x.id === st.ab_id);
        let ratio = st.ratio || (antibody ? wbGetAntibodyDefaultRatio(antibody) : '');
        let stockVol = ratio ? (Number(st.vol || 0) * 1000 / Number(ratio)).toFixed(1) : '-';
        return `<tr>
            <td style="font-weight:700">#${i + 1}</td>
            <td>${antibody ? wbBuildAntibodyTitle(antibody) : (st.ab_id || '未选择')}</td>
            <td>${st.vol || '-'} mL</td>
            <td>${ratio ? '1:' + ratio : '-'}</td>
            <td>${stockVol}</td>
        </tr>`;
    }).join('');

    return `
    <div class="card" style="margin-bottom:8px;">
        <div class="card-header"><i class="ti ti-cut"></i> WB 裁膜显影</div>
        ${wbRdRow(wbRdField('实验名称', d.name), wbRdField('时间', (d.created_at || d.timestamp || '').substring(0, 16)))}
        ${wbRdRow(wbRdField('状态', wbStatusBadge(d.status)), wbRdField('来源转膜记录', electro ? electro.name : d.electro_id))}
        ${wbRdField('检测流程方案', d.workflow_name || '默认检测流程')}
        ${d.cut_note ? wbRdField('裁膜 / Marker 刻度备注', `<div style="white-space:pre-wrap;">${d.cut_note}</div>`, true) : ''}
    </div>
    <div class="card" style="margin-bottom:8px;">
        <div class="card-header"><i class="ti ti-swatches"></i> 抗体孵育计算</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">原液用量单位为 μL。</div>
        <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
            <table class="cal-data-table" style="font-size:12px;text-align:center;">
                <thead><tr><th>条带</th><th>抗体</th><th>孵育液</th><th>比例</th><th>原液</th></tr></thead>
                <tbody>${stripRows || '<tr><td colspan="5">无抗体条目</td></tr>'}</tbody>
            </table>
        </div>
    </div>
    ${wbBuildReadonlySteps(steps, d.activeCheck || [])}`;
}
