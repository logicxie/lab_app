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
        detectionWorkflows: [], // 检测流程方案
        markerSchemes: []
    },
    // 实验日志与记录
    logs: {
        extract: [],
        electrophoresis: [],
        detection: []
    },
    sampleGroups: [],      // WB专属样本流
    denaturedSamples: [],

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

function wbIsProteinSample(sample) {
    let tags = Array.isArray(sample.tags) ? sample.tags.join(' ') : (sample.tags || '');
    let text = [sample.sample_category, sample.material_category, sample.material_type, tags].join(' ').toLowerCase();
    return text.includes('蛋白') || text.includes('protein') || text.includes('wb');
}

function wbIsDenaturedSample(sample) {
    let tags = Array.isArray(sample.tags) ? sample.tags.join(' ') : (sample.tags || '');
    let text = [sample.sample_category, sample.material_category, sample.material_type, tags].join(' ').toLowerCase();
    return text.includes('变性') || text.includes('denatured');
}

function wbAssignSampleAliases(samples = [], prefix = 'WT') {
    if (typeof wfAssignSampleAliases === 'function') return wfAssignSampleAliases(samples, prefix);
    let used = new Set();
    let aliasPrefix = String(prefix || 'WT').toUpperCase();
    return (samples || []).map((sample, index) => {
        let code = String(sample.alias_code || sample.sample_code || '').trim();
        if (!code || used.has(code)) {
            let next = index + 1;
            do { code = `${aliasPrefix}0D0-${next++}`; } while (used.has(code));
        }
        used.add(code);
        sample.alias_code = code;
        sample.id = sample.id || sample.sample_id || `wb_sample_${index + 1}`;
        return sample;
    });
}

function wbSampleLabel(sample, index = 0) {
    if (!sample) return `WT0D0-${index + 1}`;
    if (!sample.alias_code) sample.alias_code = sample.run_alias_code || `WT0D0-${index + 1}`;
    return sample.run_alias_code || sample.alias_code;
}

function wbDefaultSteps(category) {
    const map = {
        extract: ['加入裂解液并冰上裂解', '离心取上清', 'BCA测定蛋白浓度', '按目标上样量配平', '加入上样缓冲液并加热变性'],
        electrophoresis: ['制胶或准备预制胶', '上样并记录泳道', '恒压电泳', '转膜并标记膜面', '封闭备用'],
        detection: ['一抗孵育', '洗膜', '二抗孵育', '显色/曝光', '保存原始图像']
    };
    return map[category] || [];
}

function wbBuildGroupsFromSampleLibrary(samples) {
    let proteinSamples = (samples || []).filter(sample => wbIsProteinSample(sample) && !wbIsDenaturedSample(sample));
    if (proteinSamples.length === 0) return [];
    let map = new Map();
    proteinSamples.forEach(sample => {
        let groupId = sample.collection_id || sample.group_record_id || sample.source_id || sample.source_label || sample.source_type || 'sample_library';
        let groupName = sample.collection_name || sample.source_label || sample.source_type || '样本库蛋白样本';
        if (!map.has(groupId)) map.set(groupId, { id: `library:${groupId}`, name: groupName, samples: [] });
        map.get(groupId).samples.push({
            id: sample.id || sample.sample_id || `wb_${map.get(groupId).samples.length + 1}`,
            name: sample.display_name || sample.name || sample.sample_name || '未命名样本',
            alias_code: sample.alias_code || '',
            group: sample.group || sample.treatment_group || '-',
            tissue: sample.tissue || sample.material_type || sample.sample_category || '',
            day: sample.duration || sample.induction_days || sample.harvest_days || sample.harvested_at || '-',
            sample_id: sample.id,
            source: sample.source_label || sample.source_type || '样本库',
            induction_scheme: sample.induction_scheme || sample.intervention_scheme || ''
        });
    });
    return Array.from(map.values()).map(group => ({ ...group, samples: wbAssignSampleAliases(group.samples) }));
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

function wbBuildStepChecklist(steps, checks, inputPrefix, onchangeName, title, timers = []) {
    return buildWorkflowStepChecklist(steps, checks, inputPrefix, onchangeName, title || '实验流程步骤', timers);
}

function wbBuildReadonlySteps(steps, checks, timers = []) {
    return buildReadonlyWorkflowSteps(steps, checks, '操作步骤（只读）', timers);
}

function wbNormalizeStepTimers(timers, length) {
    if (typeof labTimerNormalizeList === 'function') return labTimerNormalizeList(timers, length);
    let source = Array.isArray(timers) ? timers : [];
    return Array.from({ length }, (_, index) => Math.max(0, Math.round(Number(source[index] || 0))));
}

function wbAttr(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function wbSampleKey(sample, fallbackIndex = 0) {
    if (!sample) return `sample_${fallbackIndex}`;
    return String(sample.electro_key || sample.sample_id || sample.id || sample.original_id || sample.name || `sample_${fallbackIndex}`);
}

function wbElectroExtractIds(e) {
    if (!e) return [];
    if (Array.isArray(e.extract_ids) && e.extract_ids.length) return e.extract_ids.filter(Boolean);
    return e.extract_id ? [e.extract_id] : [];
}

function wbEnsureLaneArray(laneMap, wells) {
    let count = parseInt(wells) || 15;
    let arr = Array.isArray(laneMap) ? laneMap.slice(0, count) : [];
    while (arr.length < count) arr.push(null);
    return arr;
}

function wbNormalizeElectroState(e) {
    if (!e) return e;
    e.extract_ids = wbElectroExtractIds(e);
    e.extract_id = e.extract_ids[0] || '';
    if (!Array.isArray(e.gels) || e.gels.length === 0) {
        let wells = String(e.numWells || 15);
        e.gels = [{ id: 'gel_1', name: '胶 1', numWells: wells, laneMap: wbEnsureLaneArray(e.laneMap, wells) }];
    }
    e.gels.forEach((gel, index) => {
        gel.id = gel.id || `gel_${index + 1}`;
        gel.name = gel.name || `胶 ${index + 1}`;
        gel.numWells = String(gel.numWells || e.numWells || 15);
        gel.laneMap = wbEnsureLaneArray(gel.laneMap, gel.numWells);
    });
    e.numWells = e.gels[0]?.numWells || e.numWells || '15';
    e.laneMap = e.gels[0]?.laneMap || wbEnsureLaneArray([], e.numWells);
    return e;
}

function wbBuildElectroSamplePool(e) {
    wbNormalizeElectroState(e);
    let selectedIds = new Set((e.denatured_sample_ids || []).map(String));
    let source = Array.isArray(e.imported_samples) && e.imported_samples.length
        ? e.imported_samples
        : (WB_STATE.denaturedSamples || []).filter(sample => selectedIds.has(String(sample.id)));
    let raw = source.map((sample, index) => {
        let sampleId = sample.id || sample.denatured_sample_id || `denatured_${index + 1}`;
        return {
            ...sample,
            id: sampleId,
            sample_id: sampleId,
            denatured_sample_id: sampleId,
            original_id: sample.derived_from_id || sample.source_sample_id || sampleId,
            original_alias_code: sample.alias_code || sample.run_alias_code || '',
            alias_code: sample.run_alias_code || '',
            electro_key: sample.electro_key || sampleId,
            extract_id: sample.wb_extract_id || sample.collection_id || '',
            extract_name: sample.wb_extract_name || sample.collection_name || sample.source_label || '-',
            name: sample.original_sample_name || sample.name || `Sample-${index + 1}`,
            group: sample.group || sample.treatment_group || '-',
            day: sample.duration || sample.intervention_duration || sample.induction_days || '-'
        };
    });
    wbAssignSampleAliases(raw, 'WP');
    raw.forEach(sample => { sample.run_alias_code = sample.alias_code; });
    return raw;
}

function wbFindElectroSample(pool, laneId) {
    if (!laneId || laneId === 'MARKER') return null;
    return (pool || []).find(sample =>
        sample.electro_key === laneId ||
        sample.id === laneId ||
        sample.original_id === laneId ||
        sample.sample_id === laneId
    ) || null;
}

function wbAssignedLaneKeys(e) {
    wbNormalizeElectroState(e);
    return new Set((e.gels || []).flatMap(gel => gel.laneMap || []).filter(key => key && key !== 'MARKER'));
}

function wbSampleInductionText(sample) {
    return sample.induction_scheme || sample.intervention_scheme || sample.group || sample.note || '-';
}

function wbSampleDurationText(sample) {
    return sample.day || sample.duration || sample.induction_days || sample.harvested_at || '-';
}

function wbPruneElectroLanes(e) {
    let poolKeys = new Set(wbBuildElectroSamplePool(e).map(sample => sample.electro_key));
    (e.gels || []).forEach(gel => {
        gel.laneMap = (gel.laneMap || []).map(value => (value === 'MARKER' || !value || poolKeys.has(value)) ? value : null);
    });
    wbNormalizeElectroState(e);
}

function wbRenderElectroExtractChooser(allEx, e) {
    let selected = new Set(wbElectroExtractIds(e));
    if (!allEx.length) return '<div class="empty-state" style="padding:12px">暂无已完成提取记录</div>';
    return `<div class="wb-extract-picker">
        ${allEx.map(log => `<label class="wb-extract-option ${selected.has(log.id) ? 'selected' : ''}">
            <input type="checkbox" ${selected.has(log.id) ? 'checked' : ''} onchange="wbToggleElectroExtract('${log.id}', this.checked)">
            <span><b>${log.name || '未命名提取'}</b><small>${(log.samples || []).length} 个蛋白样本</small></span>
        </label>`).join('')}
    </div>`;
}

function wbRenderElectroSampleTable(pool, e) {
    let assigned = wbAssignedLaneKeys(e);
    let rows = (pool || []).map((sample, index) => `<tr>
        <td><b>${sample.run_alias_code || wbSampleLabel(sample, index)}</b></td>
        <td>${sample.name || '-'}</td>
        <td>${wbSampleInductionText(sample)}</td>
        <td>${wbSampleDurationText(sample)}</td>
        <td>${sample.extract_name || '-'}</td>
        <td>${assigned.has(sample.electro_key) ? '<span class="badge badge-success">已上样</span>' : '<span class="badge badge-info">待上样</span>'}</td>
    </tr>`).join('');
    return `<div class="card wb-electro-sample-card">
        <div class="card-header"><i class="ti ti-list-details"></i> 跑胶样本列表</div>
        <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
            <table class="cal-data-table wb-electro-sample-table">
                <thead><tr><th>新代号</th><th>样本</th><th>诱导方案</th><th>时间</th><th>来源提取</th><th>状态</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="6">没有可上样的蛋白样本</td></tr>'}</tbody>
            </table>
        </div>
    </div>`;
}

function wbRenderElectroGels(e, pool) {
    wbNormalizeElectroState(e);
    return (e.gels || []).map((gel, gelIndex) => {
        let lanesHtml = gel.laneMap.map((laneId, laneIndex) => {
            let cls = 'empty';
            let label = '空';
            let sub = '';
            if (laneId === 'MARKER') {
                cls = 'marker';
                label = 'Marker';
            } else if (laneId) {
                let sample = wbFindElectroSample(pool, laneId);
                cls = 'sample';
                label = sample ? (sample.run_alias_code || wbSampleLabel(sample, laneIndex)) : 'Unknown';
                sub = sample ? (sample.name || '') : laneId;
            }
            return `<button type="button" class="wb-gel-lane ${cls}" onclick="wbOpenLanePicker(${gelIndex}, ${laneIndex}, this)" title="${wbAttr(sub || label)}">
                <span>#${laneIndex + 1}</span><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}
            </button>`;
        }).join('');
        return `<div class="wb-gel-card">
            <div class="wb-gel-head">
                <div><b><i class="ti ti-layout-columns"></i> ${gel.name || `胶 ${gelIndex + 1}`}</b><small>${gel.numWells} 孔，点击泳道选择 Marker 或样本</small></div>
                <div class="wb-gel-tools">
                    <select class="form-select" onchange="wbUpdateGelWells(${gelIndex}, this.value)">
                        <option value="10" ${gel.numWells === '10' ? 'selected' : ''}>10孔</option>
                        <option value="12" ${gel.numWells === '12' ? 'selected' : ''}>12孔</option>
                        <option value="15" ${gel.numWells === '15' ? 'selected' : ''}>15孔</option>
                    </select>
                    ${e.gels.length > 1 ? `<button class="btn btn-sm btn-danger" onclick="wbRemoveGel(${gelIndex})"><i class="ti ti-trash"></i></button>` : ''}
                </div>
            </div>
            <div class="wb-gel-lanes">${lanesHtml}</div>
        </div>`;
    }).join('');
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
    let markers = [];

    (items || []).forEach(item => {
        if (item && item.kind === 'workflow') workflows.push(item);
        else if (item && item.kind === 'marker') markers.push(item);
        else antibodies.push(item || {});
    });

    return { antibodies, workflows, markers };
}

function wbGetRangeText(item, field) {
    if (!item) return '';
    if (item[field]) return item[field];
    if (field === 'wb_range' && item.ratio) return `1:${item.ratio}`;
    return '';
}

function wbGetAntibodyRole(item) {
    return item?.antibody_role || item?.role || item?.type || 'primary';
}

function wbIsSecondaryAntibody(item) {
    return /secondary|二抗/i.test(wbGetAntibodyRole(item));
}

function wbAntibodyRoleLabel(item) {
    return wbIsSecondaryAntibody(item) ? '二抗' : '一抗';
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
    let bits = [item.name, wbAntibodyRoleLabel(item), item.host, item.vendor].filter(Boolean);
    return bits.join(' | ') || '未命名抗体';
}

function wbHydrateDetectLog(log) {
    if (!log) return log;
    if (!Array.isArray(log.strips)) log.strips = [];
    if (!Array.isArray(log.membranes)) log.membranes = [];

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
            fetch('/api/protocols'),                 // 6 (药物)
            fetch('/api/samples')                    // 7 统一样本库
        ]);
        
        WB_STATE.protocols.extract = await rs[0].json();
        WB_STATE.protocols.electrophoresis = await rs[1].json();
        let detectionItems = await rs[2].json();
        let detectionSplit = wbSplitDetectionProtocols(detectionItems);
        WB_STATE.protocols.detection = detectionSplit.antibodies;
        WB_STATE.protocols.detectionWorkflows = detectionSplit.workflows;
        WB_STATE.protocols.markerSchemes = detectionSplit.markers;
        
        WB_STATE.logs.extract = await rs[3].json();
        WB_STATE.logs.electrophoresis = await rs[4].json();
        WB_STATE.logs.detection = (await rs[5].json()).map(wbHydrateDetectLog);
        
        let sampleInventory = await rs[7].json();
        WB_STATE.denaturedSamples = sampleInventory.filter(wbIsDenaturedSample);
        WB_STATE.sampleGroups = wbBuildGroupsFromSampleLibrary(sampleInventory);
        
        // 渲染对应的视图
        if (typeof renderWbProtocolsBox === 'function') renderWbProtocolsBox();
        if (typeof renderProtocolLibraryHub === 'function') renderProtocolLibraryHub();
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
        if (category === 'detection' && document.getElementById('mod-primer_antibody')?.style.display !== 'none' && typeof loadPrimerAntibodyLibrary === 'function') {
            await loadPrimerAntibodyLibrary();
        } else {
            await loadWbData();
        }
    } catch(e) {
        showToast(e.message, "error");
    }
}

function wbRefreshAntibodyLibraryAfterSave() {
    if (document.getElementById('mod-primer_antibody')?.style.display !== 'none' && typeof loadPrimerAntibodyLibrary === 'function') {
        return loadPrimerAntibodyLibrary();
    }
    return loadWbData();
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
                        <div class="list-item-subtitle">${wbAntibodyRoleLabel(p)}${hostVendor ? ' · ' + hostVendor : ''}</div>
                        <div class="list-item-subtitle">${ranges || '未填写实验稀释范围'}${p.target_mw ? ' · ' + p.target_mw + ' kDa' : ''}</div>
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

    let markerItems = (WB_STATE.protocols.markerSchemes || []).length === 0
        ? '<div class="empty-state">暂无 Marker 方案</div>'
        : WB_STATE.protocols.markerSchemes.map(p => `
            <div class="list-item" style="padding:8px;margin-top:6px;align-items:flex-start;">
                <div class="list-item-content">
                    <div class="list-item-title" style="font-size:13px;">${p.name || '-'}</div>
                    <div class="list-item-subtitle">${(p.bands || []).map(b => `${b.mw}kDa`).join(' / ') || '未设置条带'}</div>
                </div>
                <div>
                    <button class="btn btn-sm btn-secondary" style="padding:2px 7px; margin-right:4px;" onclick="editWbMarkerScheme('${p.id}')"><i class="ti ti-pencil"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="deleteWbItem('detection','protocols','${p.id}',event)"><i class="ti ti-x"></i></button>
                </div>
            </div>`).join('');

    container.innerHTML = `
        <div class="card">
            <div class="card-header"><i class="ti ti-droplet-half-2"></i> WB 提取与配平方案</div>
            <div class="form-group"><label class="form-label">方案名称</label><input class="form-input" id="wbPExName" placeholder="RIPA + 5x Loading"></div>
            ${protocolStepEditor('wbPExSteps')}
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
            <div class="form-group"><label class="form-label">方案名称</label><input class="form-input" id="wbPElName" placeholder="10% 预制胶 + 湿转"></div>
            ${protocolStepEditor('wbPElSteps')}
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
            <div class="form-row">
                <div class="form-group"><label class="form-label">抗体名称</label><input class="form-input" id="wbPAbName" placeholder="GAPDH"></div>
                <div class="form-group"><label class="form-label">抗体类型</label><select class="form-select" id="wbPAbRole"><option value="primary">一抗</option><option value="secondary">二抗</option></select></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">宿主</label><input class="form-input" id="wbPAbHost" placeholder="Mouse / Rabbit"></div>
                <div class="form-group"><label class="form-label">厂家</label><input class="form-input" id="wbPAbVendor" placeholder="CST / Abcam"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">WB 稀释比范围</label><input class="form-input" id="wbPAbWbRange" placeholder="1:500-1:2000"></div>
                <div class="form-group"><label class="form-label">IF 稀释比范围</label><input class="form-input" id="wbPAbIfRange" placeholder="1:100-1:500"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">IHC 稀释比范围</label><input class="form-input" id="wbPAbIhcRange" placeholder="1:100-1:300"></div>
                <div class="form-group"><label class="form-label">目标分子量(kDa)</label><input type="number" class="form-input" id="wbPAbTargetMw" placeholder="42"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">备注</label><input class="form-input" id="wbPAbNote" placeholder="4C 过夜, PVDF 推荐"></div>
            </div>
            <button class="btn btn-secondary btn-block" onclick="saveWbPAb()"><i class="ti ti-device-floppy"></i> 保存抗体条目</button>
            <div class="divider"></div>
            ${antibodyItems}
        </div>

        <div class="card">
            <div class="card-header"><i class="ti ti-list-check"></i> WB 检测流程方案</div>
            <div class="form-group"><label class="form-label">方案名称</label><input class="form-input" id="wbDWfName" placeholder="常规 ECL 洗膜流程"></div>
            ${protocolStepEditor('wbDWfSteps')}
            <button class="btn btn-secondary btn-block" onclick="saveWbDWorkflow()"><i class="ti ti-device-floppy"></i> 保存检测流程方案</button>
            <div class="divider"></div>
            ${workflowItems}
        </div>

        <div class="card">
            <div class="card-header"><i class="ti ti-ruler-2"></i> Marker 方案</div>
            <div class="form-group"><label class="form-label">方案名称</label><input class="form-input" id="wbMarkerName" placeholder="彩虹预染 Marker"></div>
            <div class="form-group"><label class="form-label">条带（每行：颜色,分子量kDa）</label><textarea class="form-textarea" id="wbMarkerBands" placeholder="#0057ff,180\n#0057ff,130\n#d71920,100\n#0057ff,70\n#1a9d55,55\n#f28c28,35\n#0057ff,25\n#d71920,15"></textarea></div>
            <button class="btn btn-secondary btn-block" onclick="saveWbMarkerScheme()"><i class="ti ti-device-floppy"></i> 保存 Marker 方案</button>
            <div class="divider"></div>
            ${markerItems}
        </div>
    `;
}

// 方案保存函数
window.saveWbPEx = async function() {
    let name = document.getElementById('wbPExName').value.trim();
    let steps = typeof protocolReadSteps === 'function'
        ? protocolReadSteps('wbPExSteps')
        : (document.getElementById('wbPExSteps')?.value || '').split('\n').map(s => s.trim()).filter(Boolean);
    let lb = document.getElementById('wbPExLb').value;
    if(!name) return showToast("需填写方案名称","error");
    
    let payload = { name, steps, step_timers: typeof protocolReadStepTimers === 'function' ? protocolReadStepTimers('wbPExSteps') : [], lb_factor: parseInt(lb) };
    if(window._editingWbPExId) { payload.id = window._editingWbPExId; }
    
    await fetch('/api/wb/extract/protocols', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    window._editingWbPExId = null;
    if (typeof protocolFinishSave === 'function') await protocolFinishSave();
    showToast("提取方案保存成功");
    loadWbData();
}
window.editWbPEx = function(id) {
    let p = WB_STATE.protocols.extract.find(x => x.id === id);
    if(p) {
        document.getElementById('wbPExName').value = p.name;
        if (typeof protocolSetSteps === 'function' && protocolSetSteps('wbPExSteps', p.steps || [], p.step_timers || [])) {}
        else if (document.getElementById('wbPExSteps')) document.getElementById('wbPExSteps').value = (p.steps || []).join('\n');
        document.getElementById('wbPExLb').value = p.lb_factor || '5';
        window._editingWbPExId = id;
    }
}

window.saveWbPEl = async function() {
    let name = document.getElementById('wbPElName').value.trim();
    let steps = typeof protocolReadSteps === 'function'
        ? protocolReadSteps('wbPElSteps')
        : (document.getElementById('wbPElSteps')?.value || '').split('\n').map(s => s.trim()).filter(Boolean);
    if(!name) return showToast("需填写方案名称","error");
    
    let payload = { name, steps, step_timers: typeof protocolReadStepTimers === 'function' ? protocolReadStepTimers('wbPElSteps') : [] };
    if(window._editingWbPElId) { payload.id = window._editingWbPElId; }
    
    await fetch('/api/wb/electrophoresis/protocols', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    window._editingWbPElId = null;
    if (typeof protocolFinishSave === 'function') await protocolFinishSave();
    showToast("电泳方案保存成功");
    loadWbData();
}
window.editWbPEl = function(id) {
    let p = WB_STATE.protocols.electrophoresis.find(x => x.id === id);
    if(p) {
        document.getElementById('wbPElName').value = p.name;
        if (typeof protocolSetSteps === 'function' && protocolSetSteps('wbPElSteps', p.steps || [], p.step_timers || [])) {}
        else if (document.getElementById('wbPElSteps')) document.getElementById('wbPElSteps').value = (p.steps || []).join('\n');
        window._editingWbPElId = id;
    }
}

window.saveWbPAb = async function() {
    let name = document.getElementById('wbPAbName').value.trim();
    let antibodyRole = document.getElementById('wbPAbRole').value;
    let host = document.getElementById('wbPAbHost').value.trim();
    let vendor = document.getElementById('wbPAbVendor').value.trim();
    let wbRange = document.getElementById('wbPAbWbRange').value.trim();
    let ifRange = document.getElementById('wbPAbIfRange').value.trim();
    let ihcRange = document.getElementById('wbPAbIhcRange').value.trim();
    let targetMw = parseFloat(document.getElementById('wbPAbTargetMw').value) || '';
    let note = document.getElementById('wbPAbNote').value.trim();
    if(!name) return showToast("需填写抗体名称","error");
    
    let payload = {
        kind: 'antibody',
        name,
        antibody_role: antibodyRole,
        host,
        vendor,
        wb_range: wbRange,
        if_range: ifRange,
        ihc_range: ihcRange,
        target_mw: targetMw,
        note
    };
    if(window._editingWbPAbId) { payload.id = window._editingWbPAbId; }
    
    await fetch('/api/wb/detection/protocols', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    window._editingWbPAbId = null;
    if (typeof WORKFLOW_STATE !== 'undefined') WORKFLOW_STATE.antibodyFormOpen = false;
    showToast("抗体条目保存成功");
    await wbRefreshAntibodyLibraryAfterSave();
    if (typeof loadPrimerAntibodyLibrary === 'function' && document.getElementById('primerAntibodyView')) await loadPrimerAntibodyLibrary();
}
window.editWbPAb = function(id) {
    let p = WB_STATE.protocols.detection.find(x => x.id === id);
    if(p) {
        if (!document.getElementById('wbPAbName') && typeof WORKFLOW_STATE !== 'undefined' && typeof loadPrimerAntibodyLibrary === 'function') {
            WORKFLOW_STATE.antibodyFormOpen = true;
            loadPrimerAntibodyLibrary().then(() => editWbPAb(id));
            return;
        }
        document.getElementById('wbPAbName').value = p.name;
        document.getElementById('wbPAbRole').value = wbIsSecondaryAntibody(p) ? 'secondary' : 'primary';
        document.getElementById('wbPAbHost').value = p.host || '';
        document.getElementById('wbPAbVendor').value = p.vendor || '';
        document.getElementById('wbPAbWbRange').value = p.wb_range || (p.ratio ? `1:${p.ratio}` : '');
        document.getElementById('wbPAbIfRange').value = p.if_range || '';
        document.getElementById('wbPAbIhcRange').value = p.ihc_range || '';
        document.getElementById('wbPAbTargetMw').value = p.target_mw || '';
        document.getElementById('wbPAbNote').value = p.note || '';
        window._editingWbPAbId = id;
    }
}

const WB_MARKER_COLOR_PRESETS = ['#0057ff', '#d71920', '#1a9d55', '#f28c28', '#f2d21b', '#7a3cff', '#00a6d6', '#1f2933'];

function wbEnsureMarkerBandDraft() {
    if (!Array.isArray(window._wbMarkerBandDraft) || window._wbMarkerBandDraft.length === 0) {
        window._wbMarkerBandDraft = [{ mw: '', color: WB_MARKER_COLOR_PRESETS[0] }];
    }
    return window._wbMarkerBandDraft;
}

function wbMarkerBandRowsHtml() {
    let draft = wbEnsureMarkerBandDraft();
    return draft.map((band, index) => {
        let selectedColor = band.color || WB_MARKER_COLOR_PRESETS[index % WB_MARKER_COLOR_PRESETS.length];
        let colors = WB_MARKER_COLOR_PRESETS.map(color => `<button type="button" class="marker-color-swatch ${color === selectedColor ? 'active' : ''}" style="background:${color}" onclick="wbSetMarkerBandColor(${index}, '${color}')" title="${color}"></button>`).join('');
        return `<div class="marker-band-row">
            <div class="marker-band-index">${index + 1}</div>
            <div class="marker-band-fields">
                <label class="form-label">分子量(kDa)</label>
                <input type="number" class="form-input" data-marker-mw="${index}" value="${band.mw || ''}" placeholder="70" oninput="wbUpdateMarkerBandMw(${index}, this.value)">
            </div>
            <div class="marker-band-colors"><label class="form-label">条带颜色</label><div class="marker-color-grid">${colors}</div></div>
            <button class="btn btn-sm btn-danger" onclick="wbRemoveMarkerBand(${index})" title="删除条带"><i class="ti ti-x"></i></button>
        </div>`;
    }).join('');
}

function wbRenderMarkerBandRows() {
    let box = document.getElementById('wbMarkerBandRows');
    if (box) box.innerHTML = wbMarkerBandRowsHtml();
}

window.wbMarkerSchemeForm = function() {
    wbEnsureMarkerBandDraft();
    let body = `
        <div class="form-group"><label class="form-label">方案名称</label><input class="form-input" id="wbMarkerName" placeholder="彩虹预染 Marker"></div>
        <div id="wbMarkerBandRows" class="marker-band-editor">${wbMarkerBandRowsHtml()}</div>
        <button class="btn btn-sm btn-secondary" style="margin-bottom:10px" onclick="wbAddMarkerBand()"><i class="ti ti-plus"></i> 添加条带</button>`;
    let action = `<button class="btn btn-primary" onclick="saveWbMarkerScheme()"><i class="ti ti-device-floppy"></i> 保存 Marker 方案</button>`;
    if (typeof protocolFormShell === 'function') return protocolFormShell('新建 Marker 方案', 'ti-plus', body, action);
    return `<div class="card inline-form-panel"><div class="inline-form-head"><b><i class="ti ti-plus"></i> 新建 Marker 方案</b><button class="btn btn-sm btn-secondary" onclick="protocolCancelForm()"><i class="ti ti-x"></i></button></div>${body}<div class="protocol-form-actions">${action}</div></div>`;
};

window.wbAddMarkerBand = function() {
    let draft = wbEnsureMarkerBandDraft();
    draft.push({ mw: '', color: WB_MARKER_COLOR_PRESETS[draft.length % WB_MARKER_COLOR_PRESETS.length] });
    wbRenderMarkerBandRows();
};

window.wbRemoveMarkerBand = function(index) {
    let draft = wbEnsureMarkerBandDraft();
    draft.splice(index, 1);
    if (!draft.length) draft.push({ mw: '', color: WB_MARKER_COLOR_PRESETS[0] });
    wbRenderMarkerBandRows();
};

window.wbUpdateMarkerBandMw = function(index, value) {
    let draft = wbEnsureMarkerBandDraft();
    if (!draft[index]) return;
    draft[index].mw = value;
};

window.wbSetMarkerBandColor = function(index, color) {
    let draft = wbEnsureMarkerBandDraft();
    if (!draft[index]) return;
    draft[index].color = color;
    wbRenderMarkerBandRows();
};

function wbParseMarkerBands(text) {
    return String(text || '').split('\n').map(line => line.trim()).filter(Boolean).map(line => {
        let parts = line.split(/[,，\s]+/).map(x => x.trim()).filter(Boolean);
        let color = parts[0] || '#5a67d8';
        let mwText = parts[1] || parts[0] || '';
        let mw = parseFloat(String(mwText).replace(/kda/i, ''));
        return mw ? { color, mw } : null;
    }).filter(Boolean).sort((a, b) => b.mw - a.mw);
}

function wbReadMarkerBands() {
    if (!document.getElementById('wbMarkerBandRows')) {
        return wbParseMarkerBands(document.getElementById('wbMarkerBands')?.value || '');
    }
    let draft = wbEnsureMarkerBandDraft();
    document.querySelectorAll('[data-marker-mw]').forEach(input => {
        let index = parseInt(input.dataset.markerMw);
        if (draft[index]) draft[index].mw = input.value;
    });
    return draft.map(band => ({ color: band.color || WB_MARKER_COLOR_PRESETS[0], mw: parseFloat(band.mw) }))
        .filter(band => Number.isFinite(band.mw) && band.mw > 0)
        .sort((a, b) => b.mw - a.mw);
}

window.saveWbMarkerScheme = async function() {
    let name = document.getElementById('wbMarkerName').value.trim();
    let bands = wbReadMarkerBands();
    if (!name || !bands.length) return showToast('需填写 Marker 名称和至少一个条带', 'error');
    let payload = { kind: 'marker', name, bands };
    if (window._editingWbMarkerId) payload.id = window._editingWbMarkerId;
    await fetch('/api/wb/detection/protocols', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    window._editingWbMarkerId = null;
    window._wbMarkerBandDraft = [];
    if (typeof protocolFinishSave === 'function') await protocolFinishSave();
    showToast('Marker 方案保存成功');
    loadWbData();
};

window.editWbMarkerScheme = function(id) {
    let p = (WB_STATE.protocols.markerSchemes || []).find(x => x.id === id);
    if (!p) return;
    if (!document.getElementById('wbMarkerName') && typeof protocolStartCreate === 'function') protocolStartCreate('wb_marker');
    document.getElementById('wbMarkerName').value = p.name || '';
    window._wbMarkerBandDraft = (p.bands || []).map((band, index) => ({ mw: band.mw || '', color: band.color || WB_MARKER_COLOR_PRESETS[index % WB_MARKER_COLOR_PRESETS.length] }));
    wbRenderMarkerBandRows();
    window._editingWbMarkerId = id;
};

window.saveWbDWorkflow = async function() {
    let name = document.getElementById('wbDWfName').value.trim();
    let steps = typeof protocolReadSteps === 'function'
        ? protocolReadSteps('wbDWfSteps')
        : (document.getElementById('wbDWfSteps')?.value || '').split('\n').map(s => s.trim()).filter(Boolean);
    if(!name) return showToast("需填写流程方案名称","error");

    let payload = {
        kind: 'workflow',
        name,
        steps,
        step_timers: typeof protocolReadStepTimers === 'function' ? protocolReadStepTimers('wbDWfSteps') : []
    };
    if(window._editingWbDWorkflowId) { payload.id = window._editingWbDWorkflowId; }

    await fetch('/api/wb/detection/protocols', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    window._editingWbDWorkflowId = null;
    if (typeof protocolFinishSave === 'function') await protocolFinishSave();
    showToast("检测流程方案保存成功");
    loadWbData();
}

window.editWbDWorkflow = function(id) {
    let p = WB_STATE.protocols.detectionWorkflows.find(x => x.id === id);
    if(p) {
        document.getElementById('wbDWfName').value = p.name || '';
        if (typeof protocolSetSteps === 'function' && protocolSetSteps('wbDWfSteps', p.steps || [], p.step_timers || [])) {}
        else if (document.getElementById('wbDWfSteps')) document.getElementById('wbDWfSteps').value = (p.steps || []).join('\n');
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
            <div class="card-header"><i class="ti ti-users"></i> 创建 WB 独立样本组</div>
            <div class="form-group"><input class="form-input" id="wbSmpGroupName" placeholder="样本组名称：A549 缺氧模型蛋白提取"></div>
            <div class="form-group"><input class="form-input" id="wbSmpGroupSource" placeholder="样本来源 / 分组备注"></div>
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
                <button class="btn btn-sm btn-secondary" onclick="window._curWbSampleGroup=null;window._editingWbSmpGroupId=null;renderWbSamples()"><i class="ti ti-x"></i> 取消</button>
            </div>
            
            <div class="divider"></div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
                <label class="form-label" style="margin:0;">样本清单</label>
                <button class="btn btn-sm btn-secondary" onclick="addWbSampleRow()"><i class="ti ti-plus"></i> 添加样本</button>
            </div>
            
            <div class="rt-table-wrapper">
                <table class="rt-table" id="wbSmpGroupTable">
                    <thead><tr><th>代号</th><th style="width:50px;">操作</th><th>样本名称标识</th><th>处理/组别</th><th>备注(时间等)</th></tr></thead>
                    <tbody id="wbSmpGroupTbody"></tbody>
                </table>
            </div>
            <button class="btn btn-success btn-block" style="margin-top:12px;" onclick="saveWbSampleGroup()"><i class="ti ti-circle-check"></i> 保存样本组</button>
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
    if(!name) return showToast('需填写样本组名称','error');
    
    window._curWbSampleGroup = {
        name, source,
        samples: [
            { id: wbCreateId(), name: 'Sample-1', group: 'Control', note: '' },
            { id: wbCreateId(), name: 'Sample-2', group: 'Treat', note: '' }
        ]
    };
    wbAssignSampleAliases(window._curWbSampleGroup.samples);
    renderWbSamples();
}

window.addWbSampleRow = function() {
    if(!window._curWbSampleGroup) return;
    let n = window._curWbSampleGroup.samples.length + 1;
    let lastGroup = n > 1 ? window._curWbSampleGroup.samples[n-2].group : '';
    window._curWbSampleGroup.samples.push({ id: wbCreateId(), name: `Sample-${n}`, group: lastGroup, note: '' });
    wbAssignSampleAliases(window._curWbSampleGroup.samples);
    _renderWbSmpTbody();
}

function _renderWbSmpTbody() {
    let tb = document.getElementById('wbSmpGroupTbody');
    if(!tb || !window._curWbSampleGroup) return;
    wbAssignSampleAliases(window._curWbSampleGroup.samples);
    tb.innerHTML = window._curWbSampleGroup.samples.map((s, i) => `
        <tr>
            <td><input type="text" class="cal-cell-input sample-code-input" style="text-align:left;padding-left:4px;" value="${wbSampleLabel(s, i)}" onchange="window._curWbSampleGroup.samples[${i}].alias_code=this.value.trim();if(!window._curWbSampleGroup.samples[${i}].alias_code)wbAssignSampleAliases(window._curWbSampleGroup.samples)"></td>
            <td><button class="btn btn-sm btn-danger" onclick="window._curWbSampleGroup.samples.splice(${i},1);_renderWbSmpTbody()"><i class="ti ti-x"></i></button></td>
            <td><input type="text" class="cal-cell-input" style="text-align:left;padding-left:4px;" value="${s.name}" onchange="window._curWbSampleGroup.samples[${i}].name=this.value"></td>
            <td><input type="text" class="cal-cell-input" style="text-align:left;padding-left:4px;" value="${s.group}" onchange="window._curWbSampleGroup.samples[${i}].group=this.value"></td>
            <td><input type="text" class="cal-cell-input" style="text-align:left;padding-left:4px;" value="${s.note}" onchange="window._curWbSampleGroup.samples[${i}].note=this.value"></td>
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
        samples: wbAssignSampleAliases(g.samples).map(x => ({id: x.id, alias_code: x.alias_code, name: x.name.trim(), group: x.group.trim(), note: x.note.trim()}))
    };
    if (window._editingWbSmpGroupId) payload.id = window._editingWbSmpGroupId;
    
    await fetch('/api/wb/samples/groups', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    window._curWbSampleGroup = null;
    window._editingWbSmpGroupId = null;
    
    // Refresh WB extract input dropdown immediately if exist
    if (typeof _refreshWbExtractSelect === 'function') _refreshWbExtractSelect();
    
    showToast("WB 样本组已保存");
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
    e.samples = wbAssignSampleAliases(e.samples || []);
    let p = WB_STATE.protocols.extract.find(x => x.id === e.protocol_id) || { id: '', name: e.p_name || '默认参数', steps: [], lb_factor: e.bufferX || 5 };
    let st = (p.steps && p.steps.length) ? p.steps : wbDefaultSteps('extract');
    
    let checkArr = e.activeCheck || [];
    let stepsHtml = wbBuildStepChecklist(st, checkArr, 'wbexStep', 'wbUpdateExCheck', '实验流程步骤', wbNormalizeStepTimers(e.step_timers || p.step_timers, st.length));

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
                <thead><tr><th>代号</th><th style="width:70px">样本</th><th style="width:60px">净OD</th><th>浓度(μg/μl)</th><th style="min-width:140px;color:var(--accent)">配平加液表 (μl)<br><span style="font-size:9px">原液 / RIPA / Buffer</span></th></tr></thead>
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
                            <td><input class="cal-cell-input sample-code-input" value="${wbSampleLabel(s, i)}" onchange="window._curWbExtract.samples[${i}].alias_code=this.value.trim();if(!window._curWbExtract.samples[${i}].alias_code)wbAssignSampleAliases(window._curWbExtract.samples)"></td>
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
                <button class="btn btn-secondary btn-block" onclick="wbOpenExtractSamplePicker()"><i class="ti ti-database-import"></i> 导入样本</button>
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
            return wbNotifyBlocked("需先保存样本组配置");
        }
        return wbNotifyBlocked("需先在样本库登记或取材生成蛋白样本");
    }
    let sg = sampleGroups[0];
    let p = WB_STATE.protocols.extract[0] || { id: '', name: '默认提取配平参数', steps: [], lb_factor: 5 };
    
    window._curWbExtract = {
        name: `WB 提取配平 (基于 ${sg.name})`,
        status: '进行中',
        protocol_id: p.id,
        p_name: p.name,
        group_id: sg.id,
        step_timers: wbNormalizeStepTimers(p.step_timers, (p.steps || []).length),
        activeCheck: [],
        stds: ['', '', '', '', '', ''],
        targetMass: 30,
        targetVol: 15,
        bufferX: p.lb_factor || 5,
        samples: wbAssignSampleAliases(JSON.parse(JSON.stringify(sg.samples))),
        eq_k: 0,
        eq_b: 0,
        r2: 0
    };
    renderWbExtract();
    if (WB_STATE.protocols.extract.length === 0 && typeof showToast === 'function') {
        showToast("未配置提取方案，已使用默认 5x Loading Buffer", "warning");
    }
    autoSaveWbEx();
}

window.wbOpenExtractSamplePicker = function() {
    let e = window._curWbExtract;
    if (!e) return;
    if (typeof wfOpenSampleGroupPicker !== 'function') return showToast('样本组选择器未加载', 'error');
    let librarySamples = wbGetUsableSampleGroups().flatMap(group => (group.samples || []).map((sample, index) => ({
        ...sample,
        id: sample.sample_id || sample.id || `${group.id}_${index}`,
        collection_id: group.id,
        collection_name: group.name,
        display_name: sample.name,
        alias_code: sample.alias_code || '',
    })));
    wfOpenSampleGroupPicker({
        title: '导入样本',
        samples: librarySamples,
        aliasPrefix: 'W',
        emptyText: '没有可导入的蛋白/WB样本组',
        onImport(selected, group) {
            e.group_id = group?.id || e.group_id;
            e.name = `WB 提取配平 (基于 ${group?.name || '自选样本'})`;
            e.samples = wbAssignSampleAliases(selected.map(sample => ({ ...sample, alias_code: sample.alias_code || '' })));
            renderWbExtract();
            autoSaveWbEx();
        }
    });
};

window.wbUpdateExConfig = function(gid, pid) {
    let e = window._curWbExtract;
    if(!e) return;
    
    if(gid) {
        let sg = WB_STATE.sampleGroups.find(x => x.id === gid);
        if (!sg || !Array.isArray(sg.samples) || !sg.samples.some(sample => String(sample.name || '').trim())) return wbNotifyBlocked("所选 WB 样本组没有可用样本");
        e.group_id = gid;
        e.name = `WB 提取配平 (基于 ${sg.name})`;
        e.samples = wbAssignSampleAliases(JSON.parse(JSON.stringify(sg.samples)));
    }
    if(pid !== null) {
        if (!pid) {
            e.protocol_id = '';
            e.p_name = '默认提取配平参数';
            e.bufferX = 5;
            e.step_timers = [];
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
        e.step_timers = wbNormalizeStepTimers(p.step_timers, (p.steps || []).length);
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

function wbBuildDenaturedPayload(exp, sample, index, existing) {
    let sourceId = sample.sample_id || sample.source_sample_id || sample.id || '';
    return {
        ...(existing || {}),
        id: existing?.id,
        name: `${exp.name || 'WB提取变性'}-${sample.name || `样本${index + 1}`}-变性蛋白`,
        sample_category: '变性蛋白',
        material_category: '变性蛋白',
        material_type: '变性蛋白',
        source_category: sample.source_category || 'WB',
        source_type: 'WB提取变性',
        source_label: exp.name || 'WB提取变性',
        source_id: exp.id,
        collection_id: exp.id,
        collection_name: exp.name || 'WB提取变性',
        derived_from_id: sourceId,
        source_sample_id: sourceId,
        original_sample_name: sample.name || sample.original || '',
        group: sample.group || sample.treatment_group || '',
        induction_scheme: sample.induction_scheme || sample.intervention_scheme || sample.group || '',
        intervention_scheme: sample.intervention_scheme || sample.induction_scheme || sample.group || '',
        duration: sample.day || sample.duration || sample.intervention_duration || sample.induction_days || '',
        intervention_duration: sample.day || sample.duration || sample.intervention_duration || sample.induction_days || '',
        tissue: sample.tissue || sample.material_type || '',
        preservation: sample.preservation || '-20C 变性蛋白',
        wb_extract_id: exp.id,
        wb_extract_name: exp.name || '',
        protocol_name: exp.p_name || exp.protocol_name || '',
        alias_code: sample.alias_code || sample.run_alias_code || '',
        run_alias_code: sample.alias_code || sample.run_alias_code || '',
        conc: sample.conc || '',
        od: sample.od || '',
        targetMass: exp.targetMass || '',
        targetVol: exp.targetVol || '',
        bufferX: exp.bufferX || '',
        tags: ['WB', '变性蛋白'],
        status: '可用'
    };
}

async function wbUpsertDenaturedSamples(exp) {
    if (!exp?.id) return;
    let existing = [];
    try {
        let res = await fetch('/api/samples');
        existing = await res.json();
    } catch (e) {}
    let denaturedExisting = (existing || []).filter(sample => sample.wb_extract_id === exp.id || (sample.source_type === 'WB提取变性' && sample.source_id === exp.id));
    await Promise.all((exp.samples || []).map((sample, index) => {
        let sourceId = sample.sample_id || sample.source_sample_id || sample.id || '';
        let prior = denaturedExisting.find(item => (item.source_sample_id || item.derived_from_id || '') === sourceId || item.original_sample_name === sample.name);
        let payload = wbBuildDenaturedPayload(exp, sample, index, prior);
        return fetch('/api/samples', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    }));
    let refreshed = await fetch('/api/samples');
    let samples = await refreshed.json();
    WB_STATE.denaturedSamples = samples.filter(wbIsDenaturedSample);
}

window.autoSaveWbEx = async function(silent=false) {
    if(!window._curWbExtract) return;
    let protocol = WB_STATE.protocols.extract.find(x => x.id === window._curWbExtract.protocol_id) || { steps: [] };
    let steps = protocol.steps && protocol.steps.length ? protocol.steps : wbDefaultSteps('extract');
    window._curWbExtract.step_timers = wbNormalizeStepTimers(window._curWbExtract.step_timers || protocol.step_timers, steps.length);
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
    await wbUpsertDenaturedSamples(window._curWbExtract);
    
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

    let e = wbNormalizeElectroState(window._curWbElectro);
    let p = WB_STATE.protocols.electrophoresis.find(x => x.id === e.protocol_id) || { id: '', name: e.p_name || '默认跑胶转膜参数', steps: [] };
    let st = (p.steps && p.steps.length) ? p.steps : wbDefaultSteps('electrophoresis');
    
    let checkArr = e.activeCheck || [];
    let stepsHtml = wbBuildStepChecklist(st, checkArr, 'wbelStep', 'wbUpdateElCheck', '实验流程步骤', wbNormalizeStepTimers(e.step_timers || p.step_timers, st.length));
    let samplePool = wbBuildElectroSamplePool(e);
    let protoOptions = WB_STATE.protocols.electrophoresis.length === 0
        ? '<option value="">默认参数（无流程步骤）</option>'
        : WB_STATE.protocols.electrophoresis.map(p => `<option value="${p.id}" ${p.id === e.protocol_id?'selected':''}>${p.name}</option>`).join('');

    c.innerHTML = `
        <div class="workflow-panel" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div style="font-weight:700; font-size:16px;"><i class="ti ti-layout-columns" style="color:var(--primary)"></i> 跑胶与转膜实验</div>
            <button class="btn btn-sm btn-secondary" onclick="window._curWbElectro=null;renderWbElectro()"><i class="ti ti-x"></i></button>
        </div>
        
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">变性蛋白样本</label>
                <button class="btn btn-secondary btn-block" onclick="wbOpenElectroDenaturedPicker()"><i class="ti ti-database-import"></i> 导入样本</button>
                <div style="font-size:11px;color:var(--text-secondary);margin-top:6px;">${samplePool.length ? `已导入 ${samplePool.length} 个样本` : '尚未导入样本'}</div>
            </div>
            <div class="form-group">
                <label class="form-label">制胶跑胶配置</label>
                <select class="form-select" onchange="wbUpdateElConfig(null, this.value, null)">
                    ${protoOptions}
                </select>
            </div>
        </div>
        ${stepsHtml}
        ${wbRenderElectroSampleTable(samplePool, e)}
        
        <div class="card wb-gel-workbench" style="margin-top:12px">
            <div class="wb-gel-workbench-head">
                <div style="font-size:13px; font-weight:600;"><i class="ti ti-layout-columns"></i> 虚拟凝胶加样排版</div>
                <div class="wb-gel-workbench-actions">
                    <button class="btn btn-sm btn-secondary" onclick="wbAddGel()"><i class="ti ti-plus"></i> 加一块胶</button>
                    <button class="btn btn-sm btn-secondary" onclick="wbAutoFillLanes()"><i class="ti ti-wand"></i> 一键顺序排布</button>
                </div>
            </div>
            ${wbRenderElectroGels(e, samplePool)}
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
    if ((WB_STATE.denaturedSamples || []).length === 0) {
        return wbNotifyBlocked("需先完成 WB 提取变性并生成变性蛋白样本");
    }
    let p = WB_STATE.protocols.electrophoresis[0] || { id: '', name: '默认跑胶转膜参数', steps: [] };
    let w = "15";
    
    window._curWbElectro = {
        name: 'WB 凝胶电泳',
        status: '进行中',
        protocol_id: p.id,
        denatured_sample_ids: [],
        imported_samples: [],
        p_name: p.name,
        numWells: w,
        step_timers: wbNormalizeStepTimers(p.step_timers, (p.steps || []).length),
        activeCheck: [],
        gels: [{ id: 'gel_1', name: '胶 1', numWells: w, laneMap: new Array(parseInt(w)).fill(null) }],
        laneMap: new Array(parseInt(w)).fill(null)
    };
    renderWbElectro();
    if (WB_STATE.protocols.electrophoresis.length === 0 && typeof showToast === 'function') {
        showToast("未配置跑胶转膜方案，流程步骤为空", "warning");
    }
    autoSaveWbEl();
}

window.wbOpenElectroDenaturedPicker = function() {
    let e = wbNormalizeElectroState(window._curWbElectro);
    if (!e) return;
    if (typeof wfOpenSampleGroupPicker !== 'function') return showToast('样本组选择器未加载', 'error');
    wfOpenSampleGroupPicker({
        title: '导入样本',
        samples: WB_STATE.denaturedSamples || [],
        allowMultiGroup: true,
        aliasPrefix: 'WP',
        emptyText: '样本库中还没有变性蛋白样本',
        onImport(selected, groups) {
            e.imported_samples = selected.map(sample => ({
                ...sample,
                name: sample.original_sample_name || sample.name || sample.display_name,
                alias_code: '',
                run_alias_code: '',
                denatured_sample_id: sample.id,
                sample_id: sample.id,
                group: sample.group || '-',
                day: sample.duration || sample.intervention_duration || '-',
                induction_scheme: sample.induction_scheme || sample.intervention_scheme || '',
                wb_extract_id: sample.wb_extract_id || sample.collection_id || '',
                wb_extract_name: sample.wb_extract_name || sample.collection_name || ''
            }));
            e.denatured_sample_ids = e.imported_samples.map(sample => sample.denatured_sample_id || sample.sample_id).filter(Boolean);
            let groupNames = (Array.isArray(groups) ? groups : [groups]).filter(Boolean).map(group => group.name);
            e.source_groups = groupNames;
            e.name = groupNames.length ? `WB 凝胶电泳 (${groupNames.join(' + ')})` : 'WB 凝胶电泳';
            e.gels.forEach(gel => { gel.laneMap = new Array(parseInt(gel.numWells) || 15).fill(null); });
            wbNormalizeElectroState(e);
            renderWbElectro();
            autoSaveWbEl();
        }
    });
};

window.wbUpdateElConfig = function(exid, pid, wells) {
    let e = wbNormalizeElectroState(window._curWbElectro);
    if(!e) return;
    
    if(exid) {
        let ex = WB_STATE.logs.extract.find(x => x.id === exid);
        if (!ex) return;
        e.extract_id = exid;
        e.extract_ids = [exid];
        e.name = `WB 凝胶电泳 (${ex.name})`;
        e.gels.forEach(gel => { gel.laneMap = new Array(parseInt(gel.numWells)).fill(null); });
    }
    if(pid !== null) {
        if (!pid) {
            e.protocol_id = '';
            e.p_name = '默认跑胶转膜参数';
            e.step_timers = [];
            e.activeCheck = [];
            renderWbElectro();
            autoSaveWbEl();
            return;
        }
        let p = WB_STATE.protocols.electrophoresis.find(x => x.id === pid);
        if (!p) return;
        e.protocol_id = pid;
        e.p_name = p.name;
        e.step_timers = wbNormalizeStepTimers(p.step_timers, (p.steps || []).length);
        e.activeCheck = [];
    }
    if(wells) {
        e.gels.forEach(gel => { gel.numWells = String(wells); gel.laneMap = new Array(parseInt(wells)).fill(null); });
        wbNormalizeElectroState(e);
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
    let id = ev.dataTransfer.getData("text");
    if(id) wbAssignLane(0, laneIdx, id);
}
window.wbClearLane = function(laneIdx) {
    wbAssignLane(0, laneIdx, null);
}

window.wbToggleElectroExtract = function(extractId, checked) {
    let e = wbNormalizeElectroState(window._curWbElectro);
    if(!e) return;
    let ids = new Set(wbElectroExtractIds(e));
    if (checked) ids.add(extractId);
    else ids.delete(extractId);
    if (ids.size === 0) return wbNotifyBlocked('至少选择一个提取记录');
    e.extract_ids = Array.from(ids);
    e.extract_id = e.extract_ids[0];
    let names = (WB_STATE.logs.extract || []).filter(log => e.extract_ids.includes(log.id)).map(log => log.name);
    e.name = `WB 凝胶电泳 (${names.join(' + ')})`;
    wbPruneElectroLanes(e);
    renderWbElectro();
    autoSaveWbEl();
}

window.wbAddGel = function() {
    let e = wbNormalizeElectroState(window._curWbElectro);
    if (!e) return;
    let index = e.gels.length + 1;
    let wells = String(e.gels[0]?.numWells || e.numWells || 15);
    e.gels.push({ id: wbCreateId(), name: `胶 ${index}`, numWells: wells, laneMap: new Array(parseInt(wells)).fill(null) });
    wbNormalizeElectroState(e);
    renderWbElectro();
    autoSaveWbEl(true);
}

window.wbRemoveGel = function(gelIndex) {
    let e = wbNormalizeElectroState(window._curWbElectro);
    if (!e || e.gels.length <= 1) return;
    e.gels.splice(gelIndex, 1);
    e.gels.forEach((gel, index) => { gel.name = gel.name || `胶 ${index + 1}`; });
    wbNormalizeElectroState(e);
    renderWbElectro();
    autoSaveWbEl(true);
}

window.wbUpdateGelWells = function(gelIndex, wells) {
    let e = wbNormalizeElectroState(window._curWbElectro);
    if (!e || !e.gels[gelIndex]) return;
    e.gels[gelIndex].numWells = String(wells);
    e.gels[gelIndex].laneMap = wbEnsureLaneArray(e.gels[gelIndex].laneMap, wells);
    wbNormalizeElectroState(e);
    renderWbElectro();
    autoSaveWbEl(true);
}

window.wbOpenLanePicker = function(gelIndex, laneIndex, el) {
    let old = document.getElementById('wbLanePicker');
    if (old) old.remove();
    let e = wbNormalizeElectroState(window._curWbElectro);
    let pool = wbBuildElectroSamplePool(e);
    let pop = document.createElement('div');
    pop.id = 'wbLanePicker';
    pop.className = 'well-proto-popup wb-lane-picker';
    pop.innerHTML = `
        <div class="well-proto-popup-title">${e.gels[gelIndex]?.name || '胶'} · 泳道 ${laneIndex + 1}</div>
        <div class="well-proto-option" data-lane-value="MARKER" onclick="wbAssignLaneFromOption(${gelIndex}, ${laneIndex}, this)"><span class="well-proto-color" style="background:#5a67d8"></span>Marker</div>
        ${pool.map((sample, index) => `<div class="well-proto-option" data-lane-value="${wbAttr(sample.electro_key)}" onclick="wbAssignLaneFromOption(${gelIndex}, ${laneIndex}, this)"><span class="well-proto-color" style="background:var(--accent)"></span><span><b>${sample.run_alias_code || wbSampleLabel(sample, index)}</b> ${sample.name}</span></div>`).join('')}
        <div class="well-proto-option" style="color:var(--danger)" data-lane-value="" onclick="wbAssignLaneFromOption(${gelIndex}, ${laneIndex}, this)"><span class="well-proto-color" style="background:var(--danger)"></span>置空</div>`;
    document.body.appendChild(pop);
    let rect = el.getBoundingClientRect();
    pop.style.left = Math.min(rect.left + window.scrollX, window.scrollX + window.innerWidth - 260) + 'px';
    pop.style.top = (rect.bottom + window.scrollY + 6) + 'px';
    setTimeout(() => {
        let close = event => { if (!pop.contains(event.target)) { pop.remove(); document.removeEventListener('click', close); } };
        document.addEventListener('click', close);
    }, 10);
}

window.wbAssignLaneFromOption = function(gelIndex, laneIndex, option) {
    wbAssignLane(gelIndex, laneIndex, option.dataset.laneValue || null);
}

window.wbAssignLane = function(gelIndex, laneIndex, value) {
    let e = wbNormalizeElectroState(window._curWbElectro);
    if (!e || !e.gels[gelIndex]) return;
    if (value && value !== 'MARKER') {
        e.gels.forEach(gel => {
            gel.laneMap = (gel.laneMap || []).map(existing => existing === value ? null : existing);
        });
    }
    e.gels[gelIndex].laneMap[laneIndex] = value || null;
    let pop = document.getElementById('wbLanePicker');
    if (pop) pop.remove();
    wbNormalizeElectroState(e);
    renderWbElectro();
    autoSaveWbEl(true);
}
window.wbAutoFillLanes = function() {
    let e = wbNormalizeElectroState(window._curWbElectro);
    if(!e) return;
    let pool = wbBuildElectroSamplePool(e);
    e.gels.forEach(gel => { gel.laneMap = new Array(parseInt(gel.numWells) || 15).fill(null); });
    if (e.gels[0] && e.gels[0].laneMap.length) e.gels[0].laneMap[0] = 'MARKER';
    let gelIndex = 0;
    let laneIndex = e.gels[0]?.laneMap[0] === 'MARKER' ? 1 : 0;
    pool.forEach(sample => {
        while (gelIndex < e.gels.length) {
            let gel = e.gels[gelIndex];
            while (laneIndex < gel.laneMap.length && gel.laneMap[laneIndex] !== null) laneIndex++;
            if (laneIndex < gel.laneMap.length) {
                gel.laneMap[laneIndex] = sample.electro_key;
                laneIndex++;
                return;
            }
            gelIndex++;
            laneIndex = 0;
        }
    });
    wbNormalizeElectroState(e);
    renderWbElectro();
    autoSaveWbEl(true);
}

window.autoSaveWbEl = async function(silent=false) {
    if(!window._curWbElectro) return;
    wbNormalizeElectroState(window._curWbElectro);
    let protocol = WB_STATE.protocols.electrophoresis.find(x => x.id === window._curWbElectro.protocol_id) || { steps: [] };
    let steps = protocol.steps && protocol.steps.length ? protocol.steps : wbDefaultSteps('electrophoresis');
    window._curWbElectro.step_timers = wbNormalizeStepTimers(window._curWbElectro.step_timers || protocol.step_timers, steps.length);
    window._curWbElectro.run_samples = wbBuildElectroSamplePool(window._curWbElectro);
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

function wbCurrentElectroLog(log = window._curWbDetect) {
    return (WB_STATE.logs.electrophoresis || []).find(x => x.id === log?.electro_id) || null;
}

function wbBuildDetectMembranes(log, electro) {
    if (!log) return [];
    let gels = electro?.gels || [];
    let pool = Array.isArray(electro?.run_samples) ? electro.run_samples : wbBuildElectroSamplePool(electro || {});
    let existing = new Map((log.membranes || []).map(m => [m.gel_id || m.id, m]));
    return gels.map((gel, index) => {
        let key = gel.id || `gel_${index + 1}`;
        let prev = existing.get(key) || {};
        return {
            id: prev.id || wbCreateId(),
            gel_id: key,
            name: prev.name || `膜 ${index + 1}`,
            gel_name: gel.name || `胶 ${index + 1}`,
            lanes: gel.laneMap || [],
            ab_id: prev.ab_id || '',
            ratio: prev.ratio || '',
            vol: prev.vol || 10,
            marker_id: prev.marker_id || '',
            cut_points: Array.isArray(prev.cut_points) ? prev.cut_points : [],
            note: prev.note || '',
            lane_samples: pool
        };
    });
}

function wbMwToPosition(mw) {
    let value = Math.max(5, Math.min(250, Number(mw) || 40));
    let min = Math.log10(5);
    let max = Math.log10(250);
    return Math.max(3, Math.min(97, ((max - Math.log10(value)) / (max - min)) * 100));
}

function wbMarkerOptions(selected = '') {
    let markers = WB_STATE.protocols.markerSchemes || [];
    if (!markers.length) return '<option value="">未配置 Marker</option>';
    return '<option value="">选择 Marker</option>' + markers.map(marker => `<option value="${marker.id}" ${marker.id === selected ? 'selected' : ''}>${marker.name}</option>`).join('');
}

function wbPrimaryOptions(selected = '') {
    let antibodies = (WB_STATE.protocols.detection || []).filter(p => !wbIsSecondaryAntibody(p));
    if (!antibodies.length) return '<option value="">未配置一抗</option>';
    return '<option value="">选择一抗</option>' + antibodies.map(p => `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${wbBuildAntibodyTitle(p)}${p.target_mw ? ` · ${p.target_mw}kDa` : ''}</option>`).join('');
}

function wbRenderMembraneLaneMap(membrane) {
    let samples = membrane.lane_samples || [];
    let lanes = (membrane.lanes || []).map((laneId, index) => {
        let label = '空';
        let sub = '';
        let cls = 'empty';
        if (laneId === 'MARKER') {
            label = 'Marker';
            cls = 'marker';
        } else if (laneId) {
            let sample = wbFindElectroSample(samples, laneId);
            label = sample ? (sample.run_alias_code || sample.alias_code || sample.name) : laneId;
            sub = sample ? sample.name : '';
            cls = 'sample';
        }
        return `<div class="wb-membrane-lane ${cls}"><span>#${index + 1}</span><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
    }).join('');
    return `<div class="wb-membrane-lanes">${lanes}</div>`;
}

function wbRenderCutIndicator(membrane, membraneIndex, antibody, marker) {
    let bands = marker?.bands || [];
    let targetMw = Number(antibody?.target_mw || membrane.target_mw || 0);
    let targetTop = targetMw ? wbMwToPosition(targetMw) : null;
    let bandHtml = bands.map(band => {
        let top = wbMwToPosition(band.mw);
        return `<div class="wb-marker-band" style="top:${top}%;background:${band.color || '#5a67d8'}"><span>${band.mw}kDa</span></div>`;
    }).join('');
    let targetHtml = targetTop == null ? '' : `<div class="wb-target-line" style="top:${targetTop}%"><span>${antibody?.name || '目标'} · ${targetMw}kDa</span></div>`;
    let cuts = (membrane.cut_points || []).map((point, pointIndex) => `<button type="button" class="wb-cut-point" style="top:${point}%" onpointerdown="wbCutPointPointerDown(event, ${membraneIndex}, ${pointIndex})"><span>${Number(point).toFixed(1)}%</span></button>`).join('');
    return `<div class="wb-cut-indicator">
        <div class="wb-membrane-scale">${bandHtml}${targetHtml}${cuts}</div>
        <div class="wb-cut-actions">
            <button class="btn btn-sm btn-secondary" onclick="wbAddMembraneCut(${membraneIndex})"><i class="ti ti-cut"></i> 添加裁切点</button>
            <button class="btn btn-sm btn-secondary" onclick="wbClearMembraneCuts(${membraneIndex})"><i class="ti ti-eraser"></i> 清空裁切点</button>
        </div>
    </div>`;
}

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
    let electro = wbCurrentElectroLog(e);
    e.membranes = wbBuildDetectMembranes(e, electro);
    let workflow = WB_STATE.protocols.detectionWorkflows.find(x => x.id === e.workflow_id) || { id: '', name: e.workflow_name || '默认检测流程', steps: [] };
    let workflowSteps = workflow && workflow.steps && workflow.steps.length ? workflow.steps : wbDefaultSteps('detection');
    let workflowChecks = Array.isArray(e.activeCheck) ? e.activeCheck : new Array(workflowSteps.length).fill(false);
    
    let membranesHtml = e.membranes.map((membrane, index) => {
        let antibody = (WB_STATE.protocols.detection || []).find(x => x.id === membrane.ab_id);
        let marker = (WB_STATE.protocols.markerSchemes || []).find(x => x.id === membrane.marker_id);
        let ratio = membrane.ratio || (antibody ? wbGetAntibodyDefaultRatio(antibody) : '');
        let stockVol = ratio ? (Number(membrane.vol || 0) * 1000 / Number(ratio)).toFixed(1) : '-';
        return `<div class="card wb-membrane-card">
            <div class="card-header"><i class="ti ti-rectangle-vertical"></i> ${membrane.name} · ${membrane.gel_name}</div>
            ${wbRenderMembraneLaneMap(membrane)}
            <div class="form-row" style="margin-top:10px;">
                <div class="form-group"><label class="form-label">一抗</label><select class="form-select" onchange="wbUpdateMembraneAb(${index}, this.value)">${wbPrimaryOptions(membrane.ab_id)}</select></div>
                <div class="form-group"><label class="form-label">Marker方案</label><select class="form-select" onchange="wbUpdateMembraneMarker(${index}, this.value)">${wbMarkerOptions(membrane.marker_id)}</select></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">孵育液体积(mL)</label><input type="number" class="form-input" value="${membrane.vol || 10}" onchange="wbUpdateMembraneVol(${index}, this.value)"></div>
                <div class="form-group"><label class="form-label">本次稀释比例 1:</label><input type="number" class="form-input" value="${ratio || ''}" placeholder="1000" onchange="wbUpdateMembraneRatio(${index}, this.value)"></div>
                <div class="form-group"><label class="form-label">原液用量(μL)</label><div class="rd-readonly-val">${stockVol}</div></div>
            </div>
            ${wbRenderCutIndicator(membrane, index, antibody, marker)}
        </div>`;
    }).join('');

    let allEl = WB_STATE.logs.electrophoresis.filter(l => l.status === '已完成');
    let srcOptions = allEl.map(l => `<option value="${l.id}" ${l.id === e.electro_id?'selected':''}>${l.name}</option>`).join('');
    let workflowOptions = WB_STATE.protocols.detectionWorkflows.length === 0
        ? '<option value="">默认检测流程（无流程步骤）</option>'
        : WB_STATE.protocols.detectionWorkflows.map(l => `<option value="${l.id}" ${l.id === e.workflow_id?'selected':''}>${l.name}</option>`).join('');
    let workflowHtml = wbBuildStepChecklist(workflowSteps, workflowChecks, 'wbdtFlowStep', 'wbUpdateDtCheck', '实验流程步骤', wbNormalizeStepTimers(e.step_timers || workflow.step_timers, workflowSteps.length));

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
            <label class="form-label"><i class="ti ti-cut"></i> 裁膜备注</label>
            <textarea class="form-textarea" placeholder="记录实际裁切、孵育与显影观察" oninput="wbUpdateDtCutNote(this.value)">${e.cut_note || ''}</textarea>
        </div>
        ${membranesHtml || '<div class="empty-state" style="margin-bottom:16px;">来源转膜记录中没有膜/胶信息</div>'}
        
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
    if (allEl.length === 0) return wbNotifyBlocked("需先完成至少一块胶的跑胶转膜流程");
    
    let el = allEl[0];
    let workflow = WB_STATE.protocols.detectionWorkflows[0] || { id: '', name: '默认检测流程', steps: [] };
    
    window._curWbDetect = {
        name: `WB 裁膜显影 (${el.name})`,
        status: '进行中',
        electro_id: el.id,
        workflow_id: workflow.id,
        workflow_name: workflow.name,
        step_timers: wbNormalizeStepTimers(workflow.step_timers, (workflow.steps || []).length),
        activeCheck: new Array((workflow.steps || []).length).fill(false),
        cut_note: '',
        membranes: []
    };
    window._curWbDetect.membranes = wbBuildDetectMembranes(window._curWbDetect, el);
    renderWbDetect();
    if (WB_STATE.protocols.detectionWorkflows.length === 0 && typeof showToast === 'function') {
        showToast("未配置检测流程方案，流程步骤为空", "warning");
    }
    autoSaveWbDt(true);
}

window.wbUpdateDtConfig = function(elid) {
    let e = window._curWbDetect;
    if(!e || !elid) return;
    
    let el = WB_STATE.logs.electrophoresis.find(x => x.id === elid);
    if(el) {
        e.electro_id = el.id;
        e.name = `WB 裁膜显影 (${el.name})`;
        e.membranes = wbBuildDetectMembranes(e, el);
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
        e.step_timers = [];
        e.activeCheck = [];
        renderWbDetect();
        autoSaveWbDt();
        return;
    }

    let workflow = WB_STATE.protocols.detectionWorkflows.find(x => x.id === workflowId);
    if(workflow) {
        e.workflow_id = workflow.id;
        e.workflow_name = workflow.name;
        e.step_timers = wbNormalizeStepTimers(workflow.step_timers, (workflow.steps || []).length);
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

function wbEnsureMembrane(index) {
    let e = window._curWbDetect;
    if (!e) return null;
    let electro = wbCurrentElectroLog(e);
    e.membranes = wbBuildDetectMembranes(e, electro);
    return e.membranes[index] || null;
}

window.wbUpdateMembraneAb = function(index, value) {
    let membrane = wbEnsureMembrane(index);
    if (!membrane) return;
    membrane.ab_id = value;
    let antibody = (WB_STATE.protocols.detection || []).find(x => x.id === value);
    membrane.ratio = antibody ? (wbGetAntibodyDefaultRatio(antibody) || membrane.ratio || '') : '';
    membrane.target_mw = antibody?.target_mw || '';
    window._curWbDetect.membranes[index] = membrane;
    renderWbDetect();
    autoSaveWbDt(true);
};

window.wbUpdateMembraneMarker = function(index, value) {
    let membrane = wbEnsureMembrane(index);
    if (!membrane) return;
    membrane.marker_id = value;
    window._curWbDetect.membranes[index] = membrane;
    renderWbDetect();
    autoSaveWbDt(true);
};

window.wbUpdateMembraneVol = function(index, value) {
    let membrane = wbEnsureMembrane(index);
    if (!membrane) return;
    membrane.vol = parseFloat(value) || 0;
    window._curWbDetect.membranes[index] = membrane;
    renderWbDetect();
    autoSaveWbDt(true);
};

window.wbUpdateMembraneRatio = function(index, value) {
    let membrane = wbEnsureMembrane(index);
    if (!membrane) return;
    membrane.ratio = parseFloat(value) || '';
    window._curWbDetect.membranes[index] = membrane;
    renderWbDetect();
    autoSaveWbDt(true);
};

window.wbAddMembraneCut = function(index) {
    let membrane = wbEnsureMembrane(index);
    if (!membrane) return;
    let antibody = (WB_STATE.protocols.detection || []).find(x => x.id === membrane.ab_id);
    let target = antibody?.target_mw ? wbMwToPosition(antibody.target_mw) : 50;
    membrane.cut_points = [...(membrane.cut_points || []), Number(target.toFixed(1))].sort((a, b) => a - b);
    window._curWbDetect.membranes[index] = membrane;
    renderWbDetect();
    autoSaveWbDt(true);
};

window.wbClearMembraneCuts = function(index) {
    let membrane = wbEnsureMembrane(index);
    if (!membrane) return;
    membrane.cut_points = [];
    window._curWbDetect.membranes[index] = membrane;
    renderWbDetect();
    autoSaveWbDt(true);
};

window.wbCutPointPointerDown = function(event, membraneIndex, pointIndex) {
    event.preventDefault();
    let scale = event.currentTarget.closest('.wb-membrane-scale');
    if (!scale) return;
    window._wbCutDrag = { membraneIndex, pointIndex, scale };
    document.addEventListener('pointermove', wbCutPointPointerMove);
    document.addEventListener('pointerup', wbCutPointPointerUp, { once: true });
};

function wbCutPointPointerMove(event) {
    let drag = window._wbCutDrag;
    if (!drag) return;
    let rect = drag.scale.getBoundingClientRect();
    let percent = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
    let membrane = wbEnsureMembrane(drag.membraneIndex);
    if (!membrane) return;
    membrane.cut_points[drag.pointIndex] = Number(percent.toFixed(1));
    window._curWbDetect.membranes[drag.membraneIndex] = membrane;
    let point = drag.scale.querySelectorAll('.wb-cut-point')[drag.pointIndex];
    if (point) {
        point.style.top = `${percent}%`;
        let label = point.querySelector('span');
        if (label) label.textContent = `${percent.toFixed(1)}%`;
    }
}

function wbCutPointPointerUp() {
    document.removeEventListener('pointermove', wbCutPointPointerMove);
    window._wbCutDrag = null;
    if (window._curWbDetect) {
        window._curWbDetect.membranes.forEach(membrane => { membrane.cut_points = (membrane.cut_points || []).sort((a, b) => a - b); });
        renderWbDetect();
        autoSaveWbDt(true);
    }
}

window.autoSaveWbDt = async function(silent=false) {
    if(!window._curWbDetect) return;
    let electro = wbCurrentElectroLog(window._curWbDetect);
    let workflow = WB_STATE.protocols.detectionWorkflows.find(x => x.id === window._curWbDetect.workflow_id) || { steps: [] };
    let workflowSteps = workflow.steps && workflow.steps.length ? workflow.steps : wbDefaultSteps('detection');
    window._curWbDetect.step_timers = wbNormalizeStepTimers(window._curWbDetect.step_timers || workflow.step_timers, workflowSteps.length);
    window._curWbDetect.membranes = wbBuildDetectMembranes(window._curWbDetect, electro);
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
    ${wbBuildReadonlySteps(steps, d.activeCheck || [], d.step_timers || [])}`;
}

function _buildWbElectroDetail(d) {
    let detailData = wbNormalizeElectroState(JSON.parse(JSON.stringify(d || {})));
    let samples = Array.isArray(detailData.run_samples) && detailData.run_samples.length ? detailData.run_samples : wbBuildElectroSamplePool(detailData);
    let steps = wbResolveSteps('electrophoresis', d);
    let gels = detailData.gels || [];
    let gelHtml = gels.map((gel, gelIndex) => {
        let lanes = Array.isArray(gel.laneMap) ? gel.laneMap : [];
        let laneHtml = lanes.map((id, i) => {
            let label = '空';
            let sub = '';
            let style = 'background:var(--surface-hover);color:var(--text-tertiary);border:1px solid var(--border);';
            if (id === 'MARKER') {
                label = 'Marker';
                style = 'background:#5a67d8;color:#fff;border:1px solid #4c51bf;';
            } else if (id) {
                let sample = wbFindElectroSample(samples, id);
                label = sample ? (sample.run_alias_code || sample.alias_code || sample.name) : id;
                sub = sample ? sample.name : '';
                style = 'background:var(--accent);color:#fff;border:1px solid var(--accent);';
            }
            return `<div style="min-width:58px;flex:1;border:1px dashed var(--border);border-radius:6px;padding:5px;text-align:center;">
                <div style="font-size:10px;color:var(--text-secondary);margin-bottom:4px;">#${i + 1}</div>
                <div style="${style}border-radius:5px;padding:6px 4px;font-size:10px;font-weight:700;min-height:34px;display:flex;align-items:center;justify-content:center;word-break:break-word;">${label}</div>
                ${sub ? `<div style="font-size:9px;color:var(--text-secondary);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${sub}</div>` : ''}
            </div>`;
        }).join('');
        return `<div style="margin-bottom:10px;"><div style="font-size:12px;font-weight:700;margin-bottom:6px;">${gel.name || `胶 ${gelIndex + 1}`}</div><div style="display:flex;gap:4px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:4px;">${laneHtml}</div></div>`;
    }).join('');

    return `
    <div class="card" style="margin-bottom:8px;">
        <div class="card-header"><i class="ti ti-layout-columns"></i> WB 跑胶转膜</div>
        ${wbRdRow(wbRdField('实验名称', d.name), wbRdField('时间', (d.created_at || d.timestamp || '').substring(0, 16)))}
        ${wbRdRow(wbRdField('状态', wbStatusBadge(d.status)), wbRdField('来源变性蛋白组', (d.source_groups || []).join(' / ') || samples.map(s => s.extract_name).filter(Boolean).join(' / ') || '-'))}
        ${wbRdRow(wbRdField('跑胶转膜方案', d.p_name || '默认参数'), wbRdField('凝胶数量', `${gels.length || 1} 块`))}
    </div>
    <div class="card" style="margin-bottom:8px;">
        <div class="card-header"><i class="ti ti-layout-grid"></i> 凝胶孔位排版</div>
        ${gelHtml || '<span style="font-size:12px;color:var(--text-tertiary)">无排版数据</span>'}
    </div>
    ${wbBuildReadonlySteps(steps, d.activeCheck || [], d.step_timers || [])}`;
}

function _buildWbDetectDetail(d) {
    let electro = (WB_STATE.logs.electrophoresis || []).find(x => x.id === d.electro_id);
    let steps = wbResolveSteps('detection', d);
    let membranes = d.membranes || [];
    let membraneRows = membranes.map((membrane, i) => {
        let antibody = (WB_STATE.protocols.detection || []).find(x => x.id === membrane.ab_id);
        let marker = (WB_STATE.protocols.markerSchemes || []).find(x => x.id === membrane.marker_id);
        let ratio = membrane.ratio || (antibody ? wbGetAntibodyDefaultRatio(antibody) : '');
        let stockVol = ratio ? (Number(membrane.vol || 0) * 1000 / Number(ratio)).toFixed(1) : '-';
        return `<tr>
            <td style="font-weight:700">${membrane.name || `膜${i + 1}`}</td>
            <td>${antibody ? wbBuildAntibodyTitle(antibody) : (membrane.ab_id || '未选择')}</td>
            <td>${antibody?.target_mw ? antibody.target_mw + ' kDa' : '-'}</td>
            <td>${marker ? marker.name : '-'}</td>
            <td>${ratio ? '1:' + ratio : '-'}</td>
            <td>${stockVol}</td>
            <td>${(membrane.cut_points || []).map(point => Number(point).toFixed(1) + '%').join(' / ') || '-'}</td>
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
        <div class="card-header"><i class="ti ti-swatches"></i> 每膜抗体与裁切记录</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">原液用量单位为 μL。</div>
        <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
            <table class="cal-data-table" style="font-size:12px;text-align:center;">
                <thead><tr><th>膜</th><th>一抗</th><th>目标分子量</th><th>Marker</th><th>比例</th><th>原液</th><th>裁切点</th></tr></thead>
                <tbody>${membraneRows || '<tr><td colspan="7">无膜记录</td></tr>'}</tbody>
            </table>
        </div>
    </div>
    ${wbBuildReadonlySteps(steps, d.activeCheck || [], d.step_timers || [])}`;
}
