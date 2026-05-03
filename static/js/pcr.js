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
    #mod-pcr .rt-input, #pcrProtocolsContainer .rt-input { width: 68px; padding: 4px 6px; border: 1.5px solid var(--border); border-radius: 4px; text-align: center; font-size: 13px; }
    #mod-pcr .rt-input:focus, #pcrProtocolsContainer .rt-input:focus { border-color: var(--accent); outline: none; }
    #mod-pcr .rt-input.error, #pcrProtocolsContainer .rt-input.error { border-color: var(--danger); background: rgba(255,59,48,0.05); }
    
    .strips-container { display: flex; flex-wrap: wrap; gap: 18px; margin: 12px 0; align-items: flex-start; }
    .strip-wrapper { display: flex; flex-direction: column; align-items: center; }
    .strip-8 { display: flex; flex-direction: row; gap: 6px; background: rgba(0,0,0,0.04); padding: 10px; border-radius: 10px; align-items: center; }
    .strip-tube { width: 42px; height: 42px; flex: 0 0 42px; border-radius: 50%; border: 2px solid rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: center; font-size: 10px; background: var(--surface); color: var(--text); font-weight: 700; overflow: hidden; line-height: 1.05; word-break: break-word; transition: background 0.2s, transform 0.15s, opacity 0.15s; cursor: pointer; text-align: center; padding: 2px; }
    .strip-tube.filled { background: var(--accent); color: white; border-color: transparent; }
    .strip-tube:active { transform: scale(0.94); }
    .strip-actions { display: flex; flex-direction: row; gap: 8px; padding: 10px; align-items: center; min-height: 62px; }
    .strip-round-btn { width: 42px; height: 42px; min-height: 42px; border-radius: 50%; padding: 0 !important; display: inline-flex; align-items: center; justify-content: center; }
    .strip-round-btn .ti { font-size: 18px; }
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
    
    .qpcr-sample-strip-section { border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-hover); padding: 10px; margin: 10px 0 12px; }
    .qpcr-sample-strip-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }
    .qpcr-sample-strip-head b { font-size: 13px; }
    .qpcr-sample-strip-actions { display: flex; gap: 6px; flex-wrap: wrap; }
    .qpcr-sample-tube { position: relative; }
    .qpcr-sample-tube:not(.selected) { background: var(--surface); color: var(--text-tertiary); border-style: dashed; opacity: 0.55; }
    .qpcr-sample-tube:not(.selected)::after { content: ''; position: absolute; width: 28px; height: 2px; background: var(--danger); transform: rotate(-35deg); opacity: 0.75; }
    .qpcr-toolbar { display: grid; grid-template-columns: 1fr; gap: 8px; background: var(--surface-hover); padding: 12px; border-radius: var(--radius-sm); margin-bottom: 12px; }
    .qpcr-toolbar-title { font-size:12px; font-weight:600; }
    .qpcr-paint-controls { display: grid; grid-template-columns: minmax(110px, 1fr) minmax(110px, 1fr) auto auto; gap: 8px; align-items: center; }
    .qpcr-paint-controls .btn { min-width: 72px; }
    .history-card { cursor: pointer; border-left: 3px solid transparent; }
    .history-card:hover { border-color: var(--accent); background: var(--surface-hover); }
    @media (max-width: 620px) {
        .qpcr-paint-controls { grid-template-columns: 1fr 1fr; }
        .qpcr-paint-controls .form-select { width: 100% !important; }
    }
`;
document.head.appendChild(pcrStyle);

let PCR_STATE = {
    sampleGroups: [], drugProtocols: [],
    rnaProtocols: [], rnaLogs: [],
    rtProtocols: [], rtLogs: [],
    qpcrProtocols: [], qpcrLogs: [],
    cdnaSamples: [],
    activeRnaStepsCheck: [],
    rtCurrentSamples: [],
    rtStripMap: [],
    qpcrSelectedWells: new Set(),
    qpcrPlateMap: {},
    qpcrGenes: [],
    qpcrSamples: [],
    qpcrAllSamples: [],
    activeRtStepsCheck: [],
    activeQpcrStepsCheck: []
};

const M_COLORS = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8", "#FFD93D", "#FF8B94", "#A8E6CF", "#3498DB", "#9B59B6"];
function getColor(index) { return M_COLORS[index % M_COLORS.length]; }

function pcrDefaultSteps(category) {
    const map = {
        rna: ['加入裂解液并充分裂解', '相分离或柱纯化', '洗涤并去除残留试剂', '洗脱 RNA 并记录浓度', '保存 RNA 样本'],
        rt: ['按样本计算 RNA 与水体积', '加入逆转录反应体系', '混匀离心并置入 PCR 仪', '完成逆转录程序', '保存 cDNA 样本'],
        qpcr: ['准备引物与 Master Mix', '按板图加入 cDNA 与反应体系', '封板离心并检查气泡', '运行荧光定量程序', '导出 CT 并完成分析']
    };
    return map[category] || [];
}

function pcrIsRnaSample(sample) {
    let tags = Array.isArray(sample.tags) ? sample.tags.join(' ') : (sample.tags || '');
    let text = [sample.sample_category, sample.material_category, sample.material_type, tags].join(' ').toLowerCase();
    return text.includes('rna') && !text.includes('cdna');
}

function pcrIsCdnaSample(sample) {
    let tags = Array.isArray(sample.tags) ? sample.tags.join(' ') : (sample.tags || '');
    let text = [sample.sample_category, sample.material_category, sample.material_type, tags].join(' ').toLowerCase();
    return text.includes('cdna') || text.includes('cDNA'.toLowerCase());
}

function pcrRouteCategory(cat, type = '') {
    return type === 'logs' && cat === 'rna' ? 'extract' : cat;
}

function pcrBuildGroupsFromSampleLibrary(samples) {
    let rnaSamples = (samples || []).filter(pcrIsRnaSample);
    if (rnaSamples.length === 0) return [];
    let map = new Map();
    rnaSamples.forEach(sample => {
        let groupId = sample.collection_id || sample.group_record_id || sample.source_id || sample.source_label || sample.source_type || 'sample_library';
        let groupName = sample.collection_name || sample.source_label || sample.source_type || '样本库 RNA 样本';
        if (!map.has(groupId)) map.set(groupId, { id: `library:${groupId}`, name: groupName, samples: [] });
        map.get(groupId).samples.push({
            id: sample.id || sample.sample_id || `rna_${map.get(groupId).samples.length + 1}`,
            name: sample.display_name || sample.name || sample.sample_name || '未命名样本',
            alias_code: sample.alias_code || '',
            group: sample.group || sample.treatment_group || '-',
            day: sample.duration || sample.induction_days || sample.harvest_days || sample.harvested_at || '-',
            sample_id: sample.id,
            source: sample.source_label || sample.source_type || '样本库',
            induction_scheme: sample.induction_scheme || sample.intervention_scheme || '',
            material_type: sample.material_type || sample.sample_category || ''
        });
    });
    return Array.from(map.values());
}

function pcrAssignSampleAliases(samples = [], prefix = 'PN') {
    if (typeof wfAssignSampleAliases === 'function') return wfAssignSampleAliases(samples, prefix);
    let used = new Set();
    let aliasPrefix = String(prefix || 'PN').toUpperCase();
    return (samples || []).map((sample, index) => {
        let code = String(sample.alias_code || sample.sample_code || '').trim();
        if (!code || used.has(code)) {
            let next = index + 1;
            do { code = `${aliasPrefix}0D0-${next++}`; } while (used.has(code));
        }
        used.add(code);
        sample.alias_code = code;
        return sample;
    });
}

function pcrSampleLabel(sample, fallbackIndex = 0) {
    if (!sample) return `PN0D0-${fallbackIndex + 1}`;
    if (!sample.alias_code) sample.alias_code = sample.run_alias_code || `PN0D0-${fallbackIndex + 1}`;
    return sample.run_alias_code || sample.alias_code;
}

function pcrRenderSampleAliasTable(samples = []) {
    if (!Array.isArray(samples) || samples.length === 0) return '';
    pcrAssignSampleAliases(samples);
    return `<div class="rt-table-wrapper sample-alias-table-wrap"><table class="rt-table sample-alias-table"><thead><tr><th>代号</th><th>样本</th><th>组别</th><th>时长</th><th>来源</th></tr></thead><tbody>
        ${samples.map((sample, index) => `<tr><td><input class="rt-input sample-code-input" value="${pcrSampleLabel(sample, index)}" onchange="pcrUpdateSampleAlias(${index}, this.value)"></td><td>${sample.name || '-'}</td><td>${sample.group || '-'}</td><td>${sample.day || sample.duration || '-'}</td><td>${sample.source || '-'}</td></tr>`).join('')}
    </tbody></table></div>`;
}

function pcrAttr(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function pcrBuildStepChecklist(steps, checks, inputPrefix, onchangeName, title = '实验流程步骤', timers = []) {
    return buildWorkflowStepChecklist(steps, checks, inputPrefix, onchangeName, title, timers);
}

function pcrDefaultRnaProtocol() {
    return { id: '', name: '默认 RNA 提取流程', steps: pcrDefaultSteps('rna') };
}

function pcrDefaultRtProtocol() {
    return { id: '', name: '默认逆转录流程', total_vol: 20, enzyme_vol: 4, required_rna_ng: 1000, rna_vol: 1000, steps: pcrDefaultSteps('rt') };
}

function pcrDefaultQpcrProtocol() {
    return { id: '', name: '默认 qPCR 体系', well_vol: 10, sybr_vol: 5, primer_vol: 1, cdna_vol: 1, steps: pcrDefaultSteps('qpcr') };
}

function pcrResolveRnaProtocol(id) {
    return PCR_STATE.rnaProtocols.find(protocol => protocol.id === id) || PCR_STATE.rnaProtocols[0] || pcrDefaultRnaProtocol();
}

function pcrResolveRtProtocol(id) {
    return PCR_STATE.rtProtocols.find(protocol => protocol.id === id) || PCR_STATE.rtProtocols[0] || pcrDefaultRtProtocol();
}

function pcrResolveQpcrProtocol(id) {
    return PCR_STATE.qpcrProtocols.find(protocol => protocol.id === id) || PCR_STATE.qpcrProtocols[0] || pcrDefaultQpcrProtocol();
}

function pcrRnaProtocolOptions(selectedId) {
    let protocols = PCR_STATE.rnaProtocols.length ? PCR_STATE.rnaProtocols : [pcrDefaultRnaProtocol()];
    return protocols.map(protocol => `<option value="${protocol.id}" ${protocol.id === selectedId ? 'selected' : ''}>${protocol.name}</option>`).join('');
}

function pcrRtProtocolOptions(selectedId) {
    let protocols = PCR_STATE.rtProtocols.length ? PCR_STATE.rtProtocols : [pcrDefaultRtProtocol()];
    return protocols.map(protocol => `<option value="${protocol.id}" ${protocol.id === selectedId ? 'selected' : ''}>${protocol.name} (${protocol.total_vol || 20}μl)</option>`).join('');
}

function pcrEnsureCheckLength(checks, length) {
    let arr = Array.isArray(checks) ? checks.slice(0, length) : [];
    while (arr.length < length) arr.push(false);
    return arr;
}

function pcrNormalizeStepTimers(timers, length) {
    if (typeof labTimerNormalizeList === 'function') return labTimerNormalizeList(timers, length);
    let source = Array.isArray(timers) ? timers : [];
    return Array.from({ length }, (_, index) => Math.max(0, Math.round(Number(source[index] || 0))));
}

function pcrCombinedRnaSteps() {
    let exp = window._curRnaExp || {};
    let rnaProtocol = pcrResolveRnaProtocol(exp.protocol_id);
    let rnaSteps = (exp.steps && exp.steps.length) ? exp.steps : (rnaProtocol.steps || pcrDefaultSteps('rna'));
    let rtProtocol = pcrResolveRtProtocol(window._curRtExp?.protocol_id || exp.rt_protocol_id);
    let rtSteps = rtProtocol.steps && rtProtocol.steps.length ? rtProtocol.steps : pcrDefaultSteps('rt');
    let rnaTimers = pcrNormalizeStepTimers(exp.rna_step_timers || exp.step_timers || rnaProtocol.step_timers, rnaSteps.length);
    let rtTimers = pcrNormalizeStepTimers(window._curRtExp?.step_timers || exp.rt_step_timers || rtProtocol.step_timers, rtSteps.length);
    PCR_STATE.activeRnaStepsCheck = pcrEnsureCheckLength(PCR_STATE.activeRnaStepsCheck, rnaSteps.length);
    PCR_STATE.activeRtStepsCheck = pcrEnsureCheckLength(PCR_STATE.activeRtStepsCheck, rtSteps.length);
    return {
        rnaSteps,
        rtSteps,
        rnaTimers,
        rtTimers,
        combinedSteps: [
            ...rnaSteps.map(step => `RNA提取 · ${step}`),
            ...rtSteps.map(step => `逆转录 · ${step}`)
        ],
        combinedTimers: [...rnaTimers, ...rtTimers],
        combinedChecks: [...PCR_STATE.activeRnaStepsCheck, ...PCR_STATE.activeRtStepsCheck]
    };
}

function pcrSyncCombinedName(value) {
    if (window._curRnaExp) window._curRnaExp.name = value;
    if (window._curRtExp) window._curRtExp.name = value ? `${value} · 逆转录` : '';
}

function pcrRtSampleFromRna(sample, prior, index, rtProtocol) {
    let name = sample.name || sample.original || String(sample || '');
    let keys = [sample.sample_id, sample.id, sample.original, sample.name, sample.alias_code, name].filter(Boolean).map(key => String(key));
    let keep = keys.map(key => prior.get(key)).find(Boolean) || {};
    return {
        ...sample,
        ...keep,
        original: sample.original || name,
        name,
        alias_code: sample.alias_code || keep.alias_code || '',
        group: sample.group || keep.group || '-',
        day: sample.day || sample.duration || keep.day || '-',
        tube: keep.tube || '-',
        conc: keep.conc || '',
        ratio: keep.ratio || '',
        rna_vol: keep.rna_vol || 0,
        enzyme_vol: rtProtocol.enzyme_vol || keep.enzyme_vol || 4,
        water_vol: keep.water_vol || 0,
        id: sample.id || sample.sample_id || keep.id || `rt_sample_${index + 1}`
    };
}

function pcrSyncRtFromRnaSamples(resetStrip = false) {
    if (!window._curRnaExp) return;
    let rtProtocol = pcrResolveRtProtocol(window._curRtExp?.protocol_id || window._curRnaExp.rt_protocol_id);
    if (!window._curRtExp) {
        window._curRtExp = {
            name: window._curRnaExp.name ? `${window._curRnaExp.name} · 逆转录` : '',
            rna_source_name: window._curRnaExp.name || '当前 RNA 提取',
            protocol_id: rtProtocol.id,
            req_ng: rtProtocol.required_rna_ng || rtProtocol.rna_vol || 1000,
            tot_vol: rtProtocol.total_vol || 20,
            enz_vol: rtProtocol.enzyme_vol || 4,
            status: '中途保存'
        };
    }
    window._curRtExp.protocol_id = rtProtocol.id;
    window._curRtExp.req_ng = rtProtocol.required_rna_ng || rtProtocol.rna_vol || 1000;
    window._curRtExp.tot_vol = rtProtocol.total_vol || 20;
    window._curRtExp.enz_vol = rtProtocol.enzyme_vol || 4;
    window._curRtExp.rna_source_name = window._curRnaExp.name || '当前 RNA 提取';
    let prior = new Map();
    (PCR_STATE.rtCurrentSamples || []).forEach(sample => {
        [sample.sample_id, sample.id, sample.original, sample.name, sample.alias_code].filter(Boolean).forEach(key => prior.set(String(key), sample));
    });
    PCR_STATE.rtCurrentSamples = pcrAssignSampleAliases((window._curRnaExp.samples || []).map((sample, index) => pcrRtSampleFromRna(sample, prior, index, rtProtocol)));
    let neededStrips = Math.ceil(PCR_STATE.rtCurrentSamples.length / 8) || 1;
    let currentSlots = (PCR_STATE.rtStripMap || []).flat().filter(index => index !== null && index < PCR_STATE.rtCurrentSamples.length).length;
    if (resetStrip || !Array.isArray(PCR_STATE.rtStripMap) || !PCR_STATE.rtStripMap.length || currentSlots === 0) {
        PCR_STATE.rtStripMap = Array.from({ length: neededStrips }, (_, stripIndex) => Array.from({ length: 8 }, (_, tubeIndex) => {
            let sampleIndex = stripIndex * 8 + tubeIndex;
            return sampleIndex < PCR_STATE.rtCurrentSamples.length ? sampleIndex : null;
        }));
    } else {
        PCR_STATE.rtStripMap = PCR_STATE.rtStripMap.map(strip => strip.map(index => index !== null && index < PCR_STATE.rtCurrentSamples.length ? index : null));
        while (PCR_STATE.rtStripMap.length < neededStrips) PCR_STATE.rtStripMap.push(new Array(8).fill(null));
    }
}

function pcrApplyExtractStateToExp(exp = window._curRnaExp) {
    if (!exp) return null;
    pcrSyncRtFromRnaSamples(false);
    let combined = pcrCombinedRnaSteps();
    let rnaProtocol = pcrResolveRnaProtocol(exp.protocol_id || '');
    let rtProtocol = pcrResolveRtProtocol(window._curRtExp?.protocol_id || exp.rt_protocol_id || '');
    exp.protocol_id = rnaProtocol.id || exp.protocol_id || '';
    exp.protocol_name = rnaProtocol.name || exp.protocol_name || '';
    exp.rt_protocol_id = rtProtocol.id || exp.rt_protocol_id || '';
    exp.rt_protocol_name = rtProtocol.name || exp.rt_protocol_name || '';
    exp.rna_steps = combined.rnaSteps;
    exp.rt_steps = combined.rtSteps;
    exp.steps = combined.combinedSteps;
    exp.rna_step_timers = combined.rnaTimers;
    exp.rt_step_timers = combined.rtTimers;
    exp.step_timers = combined.combinedTimers;
    exp.activeRnaCheck = PCR_STATE.activeRnaStepsCheck;
    exp.activeRtCheck = PCR_STATE.activeRtStepsCheck;
    exp.activeCheck = combined.combinedChecks;
    exp.source_samples = pcrAssignSampleAliases(exp.samples || [], 'PN').map(sample => ({ ...sample }));
    exp.rt_samples = pcrAssignSampleAliases(PCR_STATE.rtCurrentSamples || [], 'PN').map(sample => ({ ...sample, run_alias_code: sample.alias_code }));
    exp.stripMap = PCR_STATE.rtStripMap || [];
    exp.rt_config = {
        req_ng: window._curRtExp?.req_ng || rtProtocol.required_rna_ng || rtProtocol.rna_vol || 1000,
        tot_vol: window._curRtExp?.tot_vol || rtProtocol.total_vol || 20,
        enz_vol: window._curRtExp?.enz_vol || rtProtocol.enzyme_vol || 4
    };
    exp.timestamp = exp.timestamp || exp.created_at || new Date().toISOString().slice(0, 19).replace('T', ' ');
    return exp;
}

function pcrFindRtTubePosition(sampleIndex) {
    for (let stripIndex = 0; stripIndex < (PCR_STATE.rtStripMap || []).length; stripIndex++) {
        let strip = PCR_STATE.rtStripMap[stripIndex] || [];
        let tubeIndex = strip.findIndex(value => value === sampleIndex);
        if (tubeIndex >= 0) return { stripIndex, tubeIndex };
    }
    return { stripIndex: Math.floor(sampleIndex / 8), tubeIndex: sampleIndex % 8 };
}

function pcrBuildCdnaPayload(exp, sample, index, existing) {
    let pos = pcrFindRtTubePosition(index);
    let sourceId = sample.sample_id || sample.source_sample_id || sample.id || '';
    return {
        ...(existing || {}),
        id: existing?.id,
        name: `${exp.name || 'PCR提取逆转录'}-${sample.name || `样本${index + 1}`}-cDNA`,
        sample_category: 'cDNA',
        material_category: 'cDNA',
        material_type: 'cDNA',
        source_category: sample.source_category || 'PCR',
        source_type: 'PCR提取逆转录',
        source_label: exp.name || 'PCR提取逆转录',
        source_id: exp.id,
        collection_id: exp.id,
        collection_name: exp.name || 'PCR提取逆转录',
        derived_from_id: sourceId,
        source_sample_id: sourceId,
        original_sample_name: sample.name || sample.original || '',
        group: sample.group || sample.treatment_group || '',
        induction_scheme: sample.induction_scheme || sample.intervention_scheme || sample.group || '',
        intervention_scheme: sample.intervention_scheme || sample.induction_scheme || sample.group || '',
        duration: sample.day || sample.duration || sample.intervention_duration || sample.induction_days || '',
        intervention_duration: sample.day || sample.duration || sample.intervention_duration || sample.induction_days || '',
        tissue: sample.tissue || sample.material_type || '',
        preservation: sample.preservation || '-20C cDNA',
        pcr_extract_id: exp.id,
        pcr_extract_name: exp.name || '',
        rt_protocol_name: exp.rt_protocol_name || '',
        alias_code: sample.alias_code || sample.run_alias_code || '',
        run_alias_code: sample.alias_code || sample.run_alias_code || '',
        strip_index: pos.stripIndex,
        tube_index: pos.tubeIndex,
        tube_label: `管${pos.stripIndex + 1}`,
        tube_position: `管${pos.stripIndex + 1}-${pos.tubeIndex + 1}`,
        conc: sample.conc || '',
        rna_vol: sample.rna_vol || '',
        water_vol: sample.water_vol || '',
        enzyme_vol: sample.enzyme_vol || '',
        tags: ['qPCR', 'cDNA'],
        status: '可用'
    };
}

async function pcrUpsertCdnaSamples(exp) {
    if (!exp?.id) return;
    let existing = [];
    try {
        let res = await fetch('/api/samples');
        existing = await res.json();
    } catch (e) {}
    let cdnaExisting = (existing || []).filter(sample => sample.pcr_extract_id === exp.id || (sample.source_type === 'PCR提取逆转录' && sample.source_id === exp.id));
    let rows = exp.rt_samples || PCR_STATE.rtCurrentSamples || [];
    await Promise.all(rows.map((sample, index) => {
        let sourceId = sample.sample_id || sample.source_sample_id || sample.id || '';
        let prior = cdnaExisting.find(item => (item.source_sample_id || item.derived_from_id || '') === sourceId || item.original_sample_name === sample.name);
        let payload = pcrBuildCdnaPayload(exp, sample, index, prior);
        return fetch('/api/samples', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    }));
    let refreshed = await fetch('/api/samples');
    let samples = await refreshed.json();
    PCR_STATE.cdnaSamples = samples.filter(pcrIsCdnaSample);
}

function pcrSampleKey(sample, fallbackIndex = 0) {
    if (!sample) return `sample_${fallbackIndex}`;
    return String(sample.qpcr_key || sample.sample_id || sample.id || sample.original || sample.name || `sample_${fallbackIndex}`);
}

function pcrSetQpcrSourceSamples(samples = [], selectedKeys = null) {
    let used = new Map();
    let allSamples = (samples || []).map((sample, index) => {
        let item = {
            ...sample,
            name: sample.name || sample.original || String(sample || ''),
            original: sample.original || sample.name || String(sample || ''),
            alias_code: sample.run_alias_code || sample.alias_code || '',
            group: sample.group || '-',
            day: sample.day || sample.duration || sample.intervention_duration || '-',
            induction_scheme: sample.induction_scheme || sample.intervention_scheme || sample.group || '',
            sample_id: sample.sample_id || sample.id || '',
            cdna_sample_id: sample.id || sample.cdna_sample_id || '',
            source_experiment_name: sample.pcr_extract_name || sample.collection_name || sample.source_label || '',
            source_tube_label: sample.tube_label || sample.source_tube_label || '',
            source_tube_index: sample.strip_index ?? sample.source_tube_index ?? 0,
            source_tube_position: sample.tube_position || sample.source_tube_position || ''
        };
        let baseKey = pcrSampleKey(item, index);
        let count = used.get(baseKey) || 0;
        used.set(baseKey, count + 1);
        item.qpcr_key = count ? `${baseKey}#${count + 1}` : baseKey;
        return item;
    });
    PCR_STATE.qpcrAllSamples = pcrAssignSampleAliases(allSamples, 'PQ');
    let selectSet = selectedKeys ? new Set(Array.from(selectedKeys).map(String)) : new Set(PCR_STATE.qpcrAllSamples.map((sample, index) => pcrSampleKey(sample, index)));
    PCR_STATE.qpcrSamples = PCR_STATE.qpcrAllSamples.filter((sample, index) => selectSet.has(pcrSampleKey(sample, index)));
    pcrAssignSampleAliases(PCR_STATE.qpcrSamples, 'PQ');
    if (window._curQpcrExp) {
        window._curQpcrExp.all_samples = PCR_STATE.qpcrAllSamples;
        window._curQpcrExp.samples = PCR_STATE.qpcrSamples;
    }
}

function pcrRemoveQpcrSampleFromPlate(sample) {
    let key = pcrSampleKey(sample);
    Object.keys(PCR_STATE.qpcrPlateMap || {}).forEach(well => {
        let value = PCR_STATE.qpcrPlateMap[well];
        let valueKey = value.sampleObj ? pcrSampleKey(value.sampleObj) : '';
        if (valueKey === key || value.sample === sample.name) {
            delete value.sample;
            delete value.sampleObj;
            if (!value.gene) delete PCR_STATE.qpcrPlateMap[well];
        }
    });
}

function pcrRenderQpcrSampleStrips() {
    let allSamples = PCR_STATE.qpcrAllSamples.length ? PCR_STATE.qpcrAllSamples : PCR_STATE.qpcrSamples;
    if (!allSamples.length) return `<div class="empty-state" style="padding:12px">没有可用 cDNA 样本</div>`;
    let selected = new Set(PCR_STATE.qpcrSamples.map((sample, index) => pcrSampleKey(sample, index)));
    let groupMap = new Map();
    allSamples.forEach((sample, index) => {
        let sourceId = sample.pcr_extract_id || sample.collection_id || sample.source_id || 'cdna';
        let tubeIndex = Number(sample.source_tube_index ?? sample.strip_index ?? Math.floor(index / 8));
        let key = `${sourceId}::${tubeIndex}`;
        if (!groupMap.has(key)) {
            groupMap.set(key, {
                name: sample.source_experiment_name || sample.collection_name || sample.source_label || 'cDNA来源',
                tubeIndex,
                samples: []
            });
        }
        groupMap.get(key).samples.push({ sample, absoluteIndex: index });
    });
    let groups = Array.from(groupMap.values()).sort((a, b) => (a.name || '').localeCompare(b.name || '') || a.tubeIndex - b.tubeIndex);
    let showExperimentName = groups.some((group, _, arr) => arr.filter(x => x.name === group.name).length !== arr.length) || groups.length > 1;
    let stripHtml = groups.map((group, stripIndex) => `
        <div class="strip-wrapper">
            <div style="font-size:10px;text-align:center;color:#888;margin-bottom:2px">${showExperimentName ? `${group.name} · ` : ''}管 ${Number(group.tubeIndex || 0) + 1}</div>
            <div class="strip-8">
                ${Array.from({ length: 8 }, (_, tubeIndex) => {
                    let slot = group.samples.find(item => Number(item.sample.tube_index ?? item.sample.source_tube_position_index ?? item.absoluteIndex % 8) === tubeIndex) || group.samples[tubeIndex];
                    if (!slot) return `<button type="button" class="strip-tube qpcr-sample-tube" disabled title="空"></button>`;
                    let sample = slot.sample;
                    let absoluteIndex = slot.absoluteIndex;
                    let key = pcrSampleKey(sample, absoluteIndex);
                    let isSelected = selected.has(key);
                    return `<button type="button" class="strip-tube qpcr-sample-tube ${isSelected ? 'filled selected' : ''}" data-sample-key="${pcrAttr(key)}" onclick="toggleQpcrSample(this.dataset.sampleKey)" title="${pcrAttr(sample.name || '-')}">${pcrSampleLabel(sample, absoluteIndex)}</button>`;
                }).join('')}
            </div>
        </div>`).join('');
    return `<div class="qpcr-sample-strip-section">
        <div class="qpcr-sample-strip-head">
            <b><i class="ti ti-test-pipe"></i> cDNA 样本（8联管）</b>
            <div class="qpcr-sample-strip-actions">
                <button class="btn btn-sm btn-secondary" onclick="pcrOpenQpcrCdnaPicker()"><i class="ti ti-database-import"></i> 导入样本</button>
                <button class="btn btn-sm btn-secondary" onclick="selectAllQpcrSamples(true)"><i class="ti ti-checks"></i> 全选</button>
                <button class="btn btn-sm btn-secondary" onclick="selectAllQpcrSamples(false)"><i class="ti ti-square"></i> 清空</button>
            </div>
        </div>
        <div class="strips-container">${stripHtml}</div>
    </div>`;
}

window.pcrUpdateSampleAlias = function(index, value) {
    let target = window._curRnaExp?.samples?.[index] || window._curRtExp?.rna_samples?.[index] || window._curQpcrExp?.samples?.[index];
    if (target) {
        target.alias_code = String(value || '').trim();
        if (!target.alias_code) pcrAssignSampleAliases([target]);
        if (window._curRnaExp && window._curRnaExp.samples?.[index]) {
            pcrSyncRtFromRnaSamples(false);
            renderRtTable();
            autoSaveExp('rna');
        }
    }
};

window.toggleQpcrSample = function(key) {
    let allSamples = PCR_STATE.qpcrAllSamples.length ? PCR_STATE.qpcrAllSamples : PCR_STATE.qpcrSamples;
    let selected = new Set(PCR_STATE.qpcrSamples.map((sample, index) => pcrSampleKey(sample, index)));
    if (selected.has(key)) {
        let sample = allSamples.find((item, index) => pcrSampleKey(item, index) === key);
        if (sample) pcrRemoveQpcrSampleFromPlate(sample);
        selected.delete(key);
    } else {
        selected.add(key);
    }
    pcrSetQpcrSourceSamples(allSamples, selected);
    renderPcrQpcr();
    autoSaveExp('qpcr');
};

window.selectAllQpcrSamples = function(checked) {
    let allSamples = PCR_STATE.qpcrAllSamples.length ? PCR_STATE.qpcrAllSamples : PCR_STATE.qpcrSamples;
    if (!checked) {
        allSamples.forEach(sample => pcrRemoveQpcrSampleFromPlate(sample));
        pcrSetQpcrSourceSamples(allSamples, new Set());
    } else {
        pcrSetQpcrSourceSamples(allSamples);
    }
    renderPcrQpcr();
    autoSaveExp('qpcr');
};

let autoSaveTimers = {};
window.autoSaveExp = function (cat, immediate = false) {
    if (autoSaveTimers[cat]) {
        clearTimeout(autoSaveTimers[cat]);
        autoSaveTimers[cat] = null;
    }
    if (immediate) {
        return _doAutoSave(cat);
    } else {
        autoSaveTimers[cat] = setTimeout(() => {
            autoSaveTimers[cat] = null;
            _doAutoSave(cat);
        }, 300);
    }
    return Promise.resolve();
}

window.pcrAutoSaveRtContext = function (immediate = false) {
    return autoSaveExp(window._curRnaExp ? 'rna' : 'rt', immediate);
}

// 离开页面时自动将进行中的实验即时保存（使用 sendBeacon 保证退出时不丢失数据）
window.addEventListener('beforeunload', function () {
    ['sg', 'rna', 'rt', 'qpcr'].forEach(cat => {
        let exp;
        if (cat === 'sg') { exp = window._curPcrSampleGroup; }
        else if (cat === 'rna') { exp = window._curRnaExp; if (exp) pcrApplyExtractStateToExp(exp); }
        else if (cat === 'rt') { exp = window._curRtExp; if (exp) { let proto = pcrResolveRtProtocol(exp.protocol_id || ''); let steps = proto.steps && proto.steps.length ? proto.steps : pcrDefaultSteps('rt'); exp.protocol_name = proto.name || exp.protocol_name || ''; exp.step_timers = pcrNormalizeStepTimers(exp.step_timers || proto.step_timers, steps.length); exp.samples = PCR_STATE.rtCurrentSamples; exp.stripMap = PCR_STATE.rtStripMap; exp.activeCheck = PCR_STATE.activeRtStepsCheck; } }
        else if (cat === 'qpcr') { exp = window._curQpcrExp; if (exp) { let proto = pcrResolveQpcrProtocol(exp.protocol_id || ''); let steps = proto.steps && proto.steps.length ? proto.steps : pcrDefaultSteps('qpcr'); exp.step_timers = pcrNormalizeStepTimers(exp.step_timers || proto.step_timers, steps.length); exp.plate_map = PCR_STATE.qpcrPlateMap; exp.samples = PCR_STATE.qpcrSamples; exp.all_samples = PCR_STATE.qpcrAllSamples; exp.activeCheck = PCR_STATE.activeQpcrStepsCheck; } }

        if (exp) {
            const blob = new Blob([JSON.stringify(exp)], { type: 'application/json' });
            let url = cat === 'sg' ? '/api/pcr/samples/groups' : `/api/pcr/${pcrRouteCategory(cat, 'logs')}/logs`;
            navigator.sendBeacon(url, blob);
        }
    });
});
async function _doAutoSave(cat) {
    let exp;
    let url = `/api/pcr/${pcrRouteCategory(cat, 'logs')}/logs`;
    if (cat === 'sg') {
        exp = window._curPcrSampleGroup;
        url = `/api/pcr/samples/groups`;
    } else if (cat === 'rna') {
        exp = window._curRnaExp;
        if (exp) pcrApplyExtractStateToExp(exp);
    } else if (cat === 'rt') {
        exp = window._curRtExp;
        if (exp) { let proto = pcrResolveRtProtocol(exp.protocol_id || ''); let steps = proto.steps && proto.steps.length ? proto.steps : pcrDefaultSteps('rt'); exp.protocol_name = proto.name || exp.protocol_name || ''; exp.step_timers = pcrNormalizeStepTimers(exp.step_timers || proto.step_timers, steps.length); exp.samples = PCR_STATE.rtCurrentSamples; exp.stripMap = PCR_STATE.rtStripMap; exp.activeCheck = PCR_STATE.activeRtStepsCheck; }
    } else if (cat === 'qpcr') {
        exp = window._curQpcrExp;
        if (exp) { let proto = pcrResolveQpcrProtocol(exp.protocol_id || ''); let steps = proto.steps && proto.steps.length ? proto.steps : pcrDefaultSteps('qpcr'); exp.step_timers = pcrNormalizeStepTimers(exp.step_timers || proto.step_timers, steps.length); exp.plate_map = PCR_STATE.qpcrPlateMap; exp.samples = PCR_STATE.qpcrSamples; exp.all_samples = PCR_STATE.qpcrAllSamples; exp.activeCheck = PCR_STATE.activeQpcrStepsCheck; }
    }
    if (!exp) return;
    try {
        exp.timestamp = exp.timestamp || exp.created_at || new Date().toISOString().slice(0, 19).replace('T', ' ');
        let res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(exp) });
        let data = await res.json();
        if (data && data.id && !exp.id) exp.id = data.id;

        if (cat !== 'sg') {
            let rs = await fetch(`/api/pcr/${pcrRouteCategory(cat, 'logs')}/logs`);
            PCR_STATE[`${cat}Logs`] = await rs.json();
            renderPcrHistory(cat);
            // 上游数据更新时，同步刷新下游模块的来源下拉
            if (cat === 'rna') _refreshQpcrRtSelect();
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
    if (!sel) {
        let qCard = document.getElementById('pcrQpcr');
        if (qCard && PCR_STATE.cdnaSamples.length > 0 && qCard.querySelector('.empty-state')) renderPcrQpcr();
        return;
    }
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
            fetch('/api/pcr/rna/protocols'),
            fetch('/api/pcr/rt/protocols'),
            fetch('/api/pcr/rt/logs'),
            fetch('/api/pcr/qpcr/protocols'), fetch('/api/pcr/qpcr/logs'),
            fetch('/api/protocols'), fetch('/api/samples'),
            fetch('/api/pcr/extract/logs')
        ]);
        PCR_STATE.rnaProtocols = await rs[0].json();
        PCR_STATE.rtProtocols = await rs[1].json();
        PCR_STATE.rtLogs = await rs[2].json();
        PCR_STATE.qpcrProtocols = await rs[3].json();
        PCR_STATE.qpcrLogs = await rs[4].json();
        PCR_STATE.drugProtocols = await rs[5].json();
        let sampleInventory = await rs[6].json();
        PCR_STATE.cdnaSamples = sampleInventory.filter(pcrIsCdnaSample);
        PCR_STATE.sampleGroups = pcrBuildGroupsFromSampleLibrary(sampleInventory);
        PCR_STATE.rnaLogs = await rs[7].json();

        if (typeof renderPcrSamples === 'function') renderPcrSamples();
        renderPcrRna();
        renderPcrQpcr();
        if (typeof renderPcrProtocols === 'function') renderPcrProtocols();
        if (typeof renderProtocolLibraryHub === 'function') renderProtocolLibraryHub();
    } catch (e) { }
}

async function savePcrItem(cat, type, payload) {
    await fetch(`/api/pcr/${pcrRouteCategory(cat, type)}/${type}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    await loadPcrData();
    showToast("保存成功！");
}

async function deletePcrItem(cat, type, id, e) {
    if (e) e.stopPropagation();
    if (!confirm("确定删除？")) return;
    await fetch(`/api/pcr/${pcrRouteCategory(cat, type)}/${type}/${id}`, { method: 'DELETE' });
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
        rna: { icon: 'ti-arrows-right-left', color: '#30d158', typeLabel: 'PCR提取/逆转录' },
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

        return buildRecordCard({ key, type: cat === 'rna' ? 'pcr_extract' : 'pcr_' + cat, data: l, meta: m, extraButtons: extras });
    }).join('');
}

window._pcrEditLog = function (cat, id) {
    let log = PCR_STATE[cat + 'Logs'].find(l => l.id === id);
    if (!log) return;
    let exp = JSON.parse(JSON.stringify(log));
    if (cat === 'rna') {
        window._curRnaExp = exp;
        PCR_STATE.activeRnaStepsCheck = exp.activeRnaCheck || new Array((exp.rna_steps || exp.steps || []).length).fill(false);
        PCR_STATE.activeRtStepsCheck = exp.activeRtCheck || [];
        PCR_STATE.rtCurrentSamples = exp.rt_samples || [];
        PCR_STATE.rtStripMap = exp.stripMap || [];
        window._curRtExp = {
            name: exp.name,
            protocol_id: exp.rt_protocol_id || '',
            protocol_name: exp.rt_protocol_name || '',
            req_ng: exp.rt_config?.req_ng || exp.req_ng || 1000,
            tot_vol: exp.rt_config?.tot_vol || exp.tot_vol || 20,
            enz_vol: exp.rt_config?.enz_vol || exp.enz_vol || 4,
            status: exp.status || '中途保存'
        };
        renderPcrRna();
        document.getElementById('pcrRna').scrollIntoView({ behavior: 'smooth' });
    } else if (cat === 'rt') {
        window._curRtExp = exp;
        PCR_STATE.rtCurrentSamples = exp.samples || [];
        PCR_STATE.rtStripMap = exp.stripMap || [];
        PCR_STATE.activeRtStepsCheck = exp.activeCheck || [];
        let relatedRna = PCR_STATE.rnaLogs.find(log => log.id === exp.rna_log_id || (exp.rna_source_name && log.name === exp.rna_source_name));
        window._curRnaExp = relatedRna ? JSON.parse(JSON.stringify(relatedRna)) : {
            name: exp.rna_source_name || String(exp.name || '').replace(/\s*·\s*逆转录$/, ''),
            protocol_id: '',
            protocol_name: '',
            rt_protocol_id: exp.protocol_id || '',
            rt_protocol_name: exp.protocol_name || '',
            samples: pcrAssignSampleAliases((exp.samples || []).map(sample => ({ ...sample }))),
            steps: pcrDefaultSteps('rna'),
            status: exp.status || '中途保存'
        };
        PCR_STATE.activeRnaStepsCheck = window._curRnaExp.activeCheck || new Array((window._curRnaExp.steps || []).length).fill(false);
        renderPcrRna();
        document.getElementById('pcrRna').scrollIntoView({ behavior: 'smooth' });
    } else if (cat === 'qpcr') {
        window._curQpcrExp = exp;
        PCR_STATE.qpcrPlateMap = exp.plate_map || {};
        PCR_STATE.qpcrGenes = exp.genes || [];
        PCR_STATE.qpcrSelectedWells = new Set();
        PCR_STATE.activeQpcrStepsCheck = exp.activeCheck || [];
        let selectedKeys = new Set((exp.samples || []).map((sample, index) => pcrSampleKey(sample, index)));
        pcrSetQpcrSourceSamples(exp.all_samples || exp.samples || [], selectedKeys);
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
            <div class="form-group"><input class="form-input" id="rnaPName" placeholder="方案名称：Trizol"></div>
            ${protocolStepEditor('rnaPSteps')}
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
            <div class="form-group"><input class="form-input" id="rtPName" placeholder="诺唯赞 RT Kit"></div>
            ${protocolStepEditor('rtPSteps')}
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
            <div class="form-group"><label class="form-label" style="font-size:12px;color:var(--text-secondary);">体系名称</label><input class="form-input" id="qPName" placeholder="10ul SYBR"></div>
            ${protocolStepEditor('qPSteps')}
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
            <div class="card-header"><i class="ti ti-users"></i> 创建样本组</div>
            <div class="form-group"><input class="form-input" id="smpGroupName" placeholder="样本组名称：A549 缺氧模型"></div>
            <div class="form-group"><input class="form-input" id="smpGroupSource" placeholder="样本来源：A549 细胞"></div>
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
                <button class="btn btn-sm btn-secondary" onclick="window._curPcrSampleGroup=null;window._currentEditingSmpGroup=null;renderPcrSamples()"><i class="ti ti-x"></i> 取消</button>
            </div>
            
            <div class="divider"></div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
                <label class="form-label" style="margin:0;">样本列表</label>
                <button class="btn btn-sm btn-secondary" onclick="addPcrSampleRow()"><i class="ti ti-plus"></i> 添加样本</button>
            </div>
            
            <div class="rt-table-wrapper">
                <table class="rt-table" id="smpGroupTable">
                    <thead><tr><th style="width:50px;">操作</th><th>样本名称</th><th>诱导方案/组别</th><th>时间点(天/时)</th></tr></thead>
                    <tbody id="smpGroupTbody"></tbody>
                </table>
            </div>
            <button class="btn btn-success btn-block" style="margin-top:12px;" onclick="saveSampleGroup()"><i class="ti ti-circle-check"></i> 保存样本组</button>
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
    if (!name) return showToast("需填写样本组名称", "error");

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
        <td style="width:50px;text-align:center;"><button class="btn btn-sm btn-danger" onclick="this.closest('tr').remove();sgSyncTable()"><i class="ti ti-minus"></i></button></td>
        <td><input type="text" class="rt-input" style="width:100%;box-sizing:border-box;" placeholder="样本名 S1" value="${existingSample ? existingSample.name : ''}" oninput="sgSyncTable()"></td>
        <td><select class="rt-input" style="width:100%;box-sizing:border-box;" onchange="sgSyncTable()">${schemeOpts}</select></td>
        <td><input type="text" class="rt-input" style="width:100%;box-sizing:border-box;" placeholder="数值(例:1)" value="${existingSample ? existingSample.day : '1'}" oninput="sgSyncTable()"></td>
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
        induction_days: [],
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
    let workHtml = '';
    if (hasExp) {
        let exp = window._curRnaExp;
        pcrSyncRtFromRnaSamples(false);
        let rtExp = window._curRtExp || {};
        let protoOptions = pcrRnaProtocolOptions(exp.protocol_id || '');
        let rtProtoOptions = pcrRtProtocolOptions(rtExp.protocol_id || exp.rt_protocol_id || '');
        let combined = pcrCombinedRnaSteps();
        let stepsHtml = pcrBuildStepChecklist(combined.combinedSteps, combined.combinedChecks, 'rnaRtStep', 'toggleRnaRtStep', 'RNA提取与逆转录流程步骤', combined.combinedTimers);
        workHtml = `
        <div class="card workflow-panel" style="margin-top:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <div style="font-weight:700;font-size:15px;"><i class="ti ti-arrows-right-left" style="color:var(--primary)"></i> RNA提取/逆转录联合实验</div>
                <button class="btn btn-sm btn-secondary" onclick="closeRnaRtExperiment()"><i class="ti ti-x"></i></button>
            </div>
            <div class="form-group"><label class="form-label">实验名称</label><input class="form-input" id="rnaExpName" value="${exp.name || ''}" placeholder="如：第一批RNA提取/逆转录" oninput="pcrSyncCombinedName(this.value)"></div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">RNA提取方案</label><select class="form-select" id="rnaExpProto" onchange="_onRnaProtoChange()">${protoOptions}</select></div>
                <div class="form-group"><label class="form-label">逆转录方案</label><select class="form-select" id="rtExpProto" onchange="_onRtProtoChange()">${rtProtoOptions}</select></div>
                <div class="form-group"><label class="form-label">样本</label><button class="btn btn-secondary btn-block" onclick="pcrOpenRnaSamplePicker()"><i class="ti ti-database-import"></i> 导入样本</button></div>
            </div>
            ${pcrRenderSampleAliasTable(exp.samples || [])}
            ${stepsHtml}
            <div class="section-title"><i class="ti ti-test-pipe"></i> 逆转录配液与八联管</div>
            <div style="font-size:12px;margin-bottom:8px;color:#888;" id="rtRunDesc">总量:${window._curRtExp?.tot_vol || '-'}μl, 目标:${window._curRtExp?.req_ng || '-'}ng</div>
            <div class="rt-table-wrapper">
                <table class="rt-table">
                    <thead><tr><th>操作</th><th>代号</th><th>样本</th><th>管孔</th><th>浓度(ng/µL)</th><th>260/280</th><th>RNA(µL)</th><th>酶(µL)</th><th>H2O(µL)</th></tr></thead>
                    <tbody id="rtTableBody"></tbody>
                </table>
            </div>
            <div class="strips-container" id="rtStripsBox"></div>
            <div style="display:flex;gap:10px;margin-top:12px;">
                <button class="btn btn-secondary" style="flex:1" onclick="autoSaveExp('rna', true)"><i class="ti ti-device-floppy"></i> 暂存进度</button>
                <button class="btn btn-success" style="flex:1" onclick="finishRnaExperiment()"><i class="ti ti-circle-check"></i> 完成并生成 cDNA 样本</button>
            </div>
        </div>`;
    }
    c.innerHTML = `
        ${hasExp ? workHtml : `<div class="card" style="margin-top:8px;">
            <button class="btn btn-primary btn-block" onclick="_startNewRna()"><i class="ti ti-player-play"></i> 启动 RNA提取/逆转录实验</button>
        </div>`}
        <div class="divider"></div>
        <div class="section-title"><i class="ti ti-history"></i> PCR提取/逆转录记录</div>
        <div id="pcrrnaHistoryDiv"></div>`;
    if (hasExp) renderRtTable();
    renderPcrHistory('rna');
}

window._startNewRna = function () {
    let proto = pcrResolveRnaProtocol('');
    let rtProto = pcrResolveRtProtocol('');
    let steps = proto.steps && proto.steps.length ? [...proto.steps] : pcrDefaultSteps('rna');
    let rtSteps = rtProto.steps && rtProto.steps.length ? [...rtProto.steps] : pcrDefaultSteps('rt');
    window._curRnaExp = { name: '', protocol_id: proto.id, protocol_name: proto.name, rt_protocol_id: rtProto.id, rt_protocol_name: rtProto.name, samples: [], steps, step_timers: pcrNormalizeStepTimers(proto.step_timers, steps.length), status: '中途保存' };
    window._curRtExp = { name: '', rna_source_name: '当前 RNA 提取', protocol_id: rtProto.id, protocol_name: rtProto.name, step_timers: pcrNormalizeStepTimers(rtProto.step_timers, rtSteps.length), req_ng: rtProto.required_rna_ng || rtProto.rna_vol || 1000, tot_vol: rtProto.total_vol || 20, enz_vol: rtProto.enzyme_vol || 4, status: '中途保存' };
    PCR_STATE.activeRnaStepsCheck = new Array(steps.length).fill(false);
    PCR_STATE.activeRtStepsCheck = new Array(rtSteps.length).fill(false);
    PCR_STATE.rtCurrentSamples = [];
    PCR_STATE.rtStripMap = [new Array(8).fill(null)];
    renderPcrRna();
    autoSaveExp('rna', true);
}

window.closeRnaRtExperiment = function() {
    window._curRnaExp = null;
    window._curRtExp = null;
    PCR_STATE.activeRnaStepsCheck = [];
    PCR_STATE.activeRtStepsCheck = [];
    PCR_STATE.rtCurrentSamples = [];
    PCR_STATE.rtStripMap = [];
    renderPcrRna();
};

window._onRnaProtoChange = function () {
    let pid = document.getElementById('rnaExpProto').value;
    let proto = pcrResolveRnaProtocol(pid);
    if (proto && window._curRnaExp) {
        _syncRnaSamples();
        window._curRnaExp.protocol_id = proto.id;
        window._curRnaExp.protocol_name = proto.name;
        window._curRnaExp.steps = proto.steps && proto.steps.length ? [...proto.steps] : pcrDefaultSteps('rna');
        window._curRnaExp.step_timers = pcrNormalizeStepTimers(proto.step_timers, window._curRnaExp.steps.length);
        PCR_STATE.activeRnaStepsCheck = new Array(window._curRnaExp.steps.length).fill(false);
        renderPcrRna();
        autoSaveExp('rna');
    }
}

function _syncRnaSamples() {
    if (!window._curRnaExp) return;
    let el = document.getElementById('rnaExpSamples');
    if (!el) {
        window._curRnaExp.samples = pcrAssignSampleAliases(window._curRnaExp.samples || []);
        return;
    }
    let prior = new Map();
    (window._curRnaExp.samples || []).forEach(sample => {
        [sample.original, sample.name, sample.alias_code].filter(Boolean).forEach(key => prior.set(String(key).trim(), sample));
    });
    window._curRnaExp.samples = el.value.split(/[,，]+/).map(s => s.trim()).filter(s => s).map(str => {
        let m = str.match(/^([^(]+)(?:\(([^-]+)-([^)]+)\))?$/);
        let name = m ? m[1].trim() : str;
        let keep = prior.get(str) || prior.get(name) || {};
        return {
            ...keep,
            original: str,
            name,
            group: m && m[2] ? m[2].trim().replace(/_/g, ',') : (keep.group || '对照组'),
            day: m && m[3] ? m[3].trim() : (keep.day || '-'),
        };
    });
    pcrAssignSampleAliases(window._curRnaExp.samples);
}

window.onRnaGroupSelect = function (gid) {
    let input = document.getElementById('rnaExpSamples');
    if (!gid) { if (input) input.value = ''; return; }
    let g = PCR_STATE.sampleGroups.find(x => x.id === gid);
    if (g) {
        window._curRnaExp.samples = pcrAssignSampleAliases((g.samples || []).map(sample => ({ ...sample, alias_code: sample.alias_code || '' })));
        if (input) input.value = window._curRnaExp.samples.map(s => `${s.name}(${String(s.group || '-').replace(/[,，]/g, '_')}-${s.day || '-'})`).join(', ');
    }
}

window.pcrOpenRnaSamplePicker = function() {
    if (!window._curRnaExp) return;
    if (typeof wfOpenSampleGroupPicker !== 'function') return showToast('样本组选择器未加载', 'error');
    let librarySamples = (PCR_STATE.sampleGroups || []).flatMap(group => (group.samples || []).map((sample, index) => ({
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
        aliasPrefix: 'PN',
        emptyText: '没有可导入的 RNA 样本组',
        onImport(selected) {
            window._curRnaExp.samples = pcrAssignSampleAliases(selected.map(sample => ({ ...sample, alias_code: sample.alias_code || '' })), 'PN');
            pcrSyncRtFromRnaSamples(true);
            renderPcrRna();
            autoSaveExp('rna');
        }
    });
};

window.saveRnaProtocol = async function () {
    let name = document.getElementById('rnaPName').value;
    let steps = typeof protocolReadSteps === 'function'
        ? protocolReadSteps('rnaPSteps')
        : (document.getElementById('rnaPSteps')?.value || '').split('\n').map(x => x.trim()).filter(x => x);
    if (!name || !steps.length) return showToast("信息不完整", "error");
    let payload = { name, steps, step_timers: typeof protocolReadStepTimers === 'function' ? protocolReadStepTimers('rnaPSteps') : [] };
    if (window._currentEditingRnaProtoId) { payload.id = window._currentEditingRnaProtoId; window._currentEditingRnaProtoId = null; }
    if (typeof protocolFinishSave === 'function') await protocolFinishSave();
    await savePcrItem('rna', 'protocols', payload);
}

window.editRnaP = function (id) {
    let p = PCR_STATE.rnaProtocols.find(x => x.id === id);
    if (!p) return;
    window._currentEditingRnaProtoId = p.id;
    document.getElementById('rnaPName').value = p.name;
    if (typeof protocolSetSteps === 'function' && protocolSetSteps('rnaPSteps', p.steps || [], p.step_timers || [])) {}
    else if (document.getElementById('rnaPSteps')) document.getElementById('rnaPSteps').value = (p.steps || []).join('\n');
    document.getElementById('rnaPName').scrollIntoView({ behavior: 'smooth' });
}

window.toggleRnaStep = function (i, checked) {
    PCR_STATE.activeRnaStepsCheck[i] = checked;
    let el = document.getElementById(`rnaStepItem_${i}`);
    if (el) { if (checked) el.classList.add('checked'); else el.classList.remove('checked'); }
    autoSaveExp('rna');
}

window.toggleRnaRtStep = function(i, checked) {
    let combined = pcrCombinedRnaSteps();
    if (i < combined.rnaSteps.length) {
        PCR_STATE.activeRnaStepsCheck[i] = checked;
        autoSaveExp('rna');
    } else {
        PCR_STATE.activeRtStepsCheck[i - combined.rnaSteps.length] = checked;
        autoSaveExp('rna');
    }
    let el = document.getElementById(`rnaRtStepItem_${i}`);
    if (el) el.classList.toggle('checked', checked);
};

window.toggleRtStep = function (i, checked) {
    PCR_STATE.activeRtStepsCheck[i] = checked;
    let el = document.getElementById(`rtStepItem_${i}`);
    if (el) { if (checked) el.classList.add('checked'); else el.classList.remove('checked'); }
    pcrAutoSaveRtContext();
}

window.toggleQpcrStep = function (i, checked) {
    PCR_STATE.activeQpcrStepsCheck[i] = checked;
    let el = document.getElementById(`qpcrStepItem_${i}`);
    if (el) { if (checked) el.classList.add('checked'); else el.classList.remove('checked'); }
    autoSaveExp('qpcr');
}

window.finishRnaExperiment = async function () {
    _syncRnaSamples();
    pcrSyncRtFromRnaSamples(false);
    let exp = window._curRnaExp;
    if (!exp.name) return showToast("需填写实验名称", "error");
    if (!exp.samples || exp.samples.length === 0) return showToast("需填写样本", "error");
    exp.status = "已完成";
    pcrApplyExtractStateToExp(exp);
    await autoSaveExp('rna', true);
    let existing = PCR_STATE.rnaLogs.find(l => l.id === exp.id);
    if (existing) existing.status = '已完成';
    await pcrUpsertCdnaSamples(exp);
    window._curRnaExp = null;
    window._curRtExp = null;
    PCR_STATE.activeRnaStepsCheck = [];
    PCR_STATE.activeRtStepsCheck = [];
    PCR_STATE.rtCurrentSamples = [];
    PCR_STATE.rtStripMap = [];
    renderPcrRna();
    _refreshQpcrRtSelect();
    showToast("PCR提取/逆转录记录已保存，cDNA样本已入库");
}

// -------------------------------------------------------- RT
function renderPcrRt() {
    let c = document.getElementById('pcrRt');
    if (!c) return;
    let hasExp = !!window._curRtExp;
    let noReady = PCR_STATE.rtProtocols.length === 0 || PCR_STATE.rnaLogs.length === 0;
    let disabledMsg = PCR_STATE.rtProtocols.length === 0 ? '需先建立 RT 方案' : (PCR_STATE.rnaLogs.length === 0 ? '需先完成 RNA 提取' : '');

    let workHtml = '';
    if (hasExp) {
        let exp = window._curRtExp;
        let protoOptions = PCR_STATE.rtProtocols.map(p => `<option value="${p.id}" ${p.id === exp.protocol_id ? 'selected' : ''}>${p.name} (${p.total_vol}μl)</option>`).join('');
        let rnaLogOptions = PCR_STATE.rnaLogs.map(l => `<option value="${l.id}" ${l.id === exp.rna_log_id ? 'selected' : ''}>${l.name} (${(l.samples||[]).length}样)</option>`).join('');

        workHtml = `
        <div class="card workflow-panel" style="margin-top:8px;">
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
                let steps = p && p.steps && p.steps.length ? p.steps : pcrDefaultSteps('rt');
                return pcrBuildStepChecklist(steps, PCR_STATE.activeRtStepsCheck || [], 'rtStep', 'toggleRtStep', '实验流程步骤', pcrNormalizeStepTimers(exp.step_timers || p?.step_timers, steps.length));
            })() }
            <div class="rt-table-wrapper">
                <table class="rt-table">
                    <thead><tr><th>操作</th><th>代号</th><th>样本</th><th>管孔</th><th>浓度(ng/µL)</th><th>260/280</th><th>RNA(µL)</th><th>酶(µL)</th><th>H2O(µL)</th></tr></thead>
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
            <button class="btn btn-primary btn-block" ${noReady ? 'disabled title="' + disabledMsg + '"' : ''} onclick="_startNewRt()"><i class="ti ti-player-play"></i> 启动逆转录实验</button>
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
    let steps = p.steps && p.steps.length ? p.steps : pcrDefaultSteps('rt');
    PCR_STATE.activeRtStepsCheck = new Array(steps.length).fill(false);
    PCR_STATE.rtCurrentSamples = rna.samples.map(s => {
        let nm = s.name ? s.name : s;
        return { ...s, original: s.original || nm, name: nm, alias_code: s.alias_code || '', group: s.group || '-', day: s.day || '-', tube: '-', conc: '', ratio: '', rna_vol: 0, enzyme_vol: p.enzyme_vol, water_vol: 0 };
    });
    pcrAssignSampleAliases(PCR_STATE.rtCurrentSamples);
    let ts = Math.ceil(PCR_STATE.rtCurrentSamples.length / 8) || 1;
    PCR_STATE.rtStripMap = Array.from({ length: ts }, (_, i) => Array.from({ length: 8 }, (_, j) => { let v = i * 8 + j; return v < PCR_STATE.rtCurrentSamples.length ? v : null; }));
    window._curRtExp = { name: '', rna_log_id: rna.id, rna_source_name: rna.name, protocol_id: p.id, step_timers: pcrNormalizeStepTimers(p.step_timers, steps.length), req_ng: p.required_rna_ng || p.rna_vol, tot_vol: p.total_vol, enz_vol: p.enzyme_vol, status: '中途保存' };
    renderPcrRt();
    pcrAutoSaveRtContext(true);
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
        return { ...s, original: s.original || nm, name: nm, alias_code: s.alias_code || '', group: s.group || '-', day: s.day || '-', tube: '-', conc: '', ratio: '', rna_vol: 0, enzyme_vol: p.enzyme_vol, water_vol: 0 };
    });
    pcrAssignSampleAliases(PCR_STATE.rtCurrentSamples);
    let ts = Math.ceil(PCR_STATE.rtCurrentSamples.length / 8) || 1;
    PCR_STATE.rtStripMap = Array.from({ length: ts }, (_, i) => Array.from({ length: 8 }, (_, j) => { let v = i * 8 + j; return v < PCR_STATE.rtCurrentSamples.length ? v : null; }));
    renderRtTable();
}

window._onRtProtoChange = function () {
    let pId = document.getElementById('rtExpProto').value;
    let p = pcrResolveRtProtocol(pId);
    if (!p || !window._curRtExp) return;
    window._curRtExp.protocol_id = p.id;
    window._curRtExp.protocol_name = p.name;
    if (window._curRnaExp) {
        window._curRnaExp.rt_protocol_id = p.id;
        window._curRnaExp.rt_protocol_name = p.name;
    }
    window._curRtExp.step_timers = pcrNormalizeStepTimers(p.step_timers, (p.steps && p.steps.length ? p.steps : pcrDefaultSteps('rt')).length);
    window._curRtExp.req_ng = p.required_rna_ng || p.rna_vol;
    window._curRtExp.tot_vol = p.total_vol;
    window._curRtExp.enz_vol = p.enzyme_vol;
    let steps = p.steps && p.steps.length ? p.steps : pcrDefaultSteps('rt');
    PCR_STATE.activeRtStepsCheck = new Array(steps.length).fill(false);
    PCR_STATE.rtCurrentSamples.forEach((s, i) => { s.enzyme_vol = p.enzyme_vol; if (s.conc) calcRtSample(i, s.conc); });
    if (window._curRnaExp) renderPcrRna();
    else renderPcrRt();
    pcrAutoSaveRtContext();
}

window.saveRtProtocol = async function () {
    let name = document.getElementById('rtPName').value;
    let total = parseFloat(document.getElementById('rtPTotal').value) || 20;
    let enz = parseFloat(document.getElementById('rtPEnz').value) || 4;
    let rna = parseFloat(document.getElementById('rtPRna').value) || 1000;
    let stepsArr = typeof protocolReadSteps === 'function'
        ? protocolReadSteps('rtPSteps')
        : (document.getElementById('rtPSteps')?.value || '').split('\n').map(x => x.trim()).filter(x => x);
    if (!name) return showToast("需填写方案名称", "error");
    let payload = { name, total_vol: total, enzyme_vol: enz, rna_vol: rna, steps: stepsArr, step_timers: typeof protocolReadStepTimers === 'function' ? protocolReadStepTimers('rtPSteps') : [] };
    if (window._currentEditingRtProtoId) { payload.id = window._currentEditingRtProtoId; window._currentEditingRtProtoId = null; }
    if (typeof protocolFinishSave === 'function') await protocolFinishSave();
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
    if (typeof protocolSetSteps === 'function' && protocolSetSteps('rtPSteps', p.steps || [], p.step_timers || [])) {}
    else if(document.getElementById('rtPSteps')) document.getElementById('rtPSteps').value = (p.steps || []).join('\n');
    document.getElementById('rtPName').scrollIntoView({ behavior: 'smooth' });
}

window.finishRtExperiment = async function () {
    if (!window._curRtExp.name) return showToast("需填写实验名称", "error");
    window._curRtExp.status = "已完成";
    window._curRtExp.activeCheck = PCR_STATE.activeRtStepsCheck;
    let exp = window._curRtExp;
    await pcrAutoSaveRtContext(true);
    await pcrUpsertCdnaSamples(exp);
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
            <td><button class="btn btn-sm btn-danger" style="padding:2px 6px;" onclick="deleteRtSample(${idx})" title="从此实验中剔除该样本"><i class="ti ti-trash"></i></button></td>
            <td><input class="rt-input sample-code-input" value="${pcrSampleLabel(s, idx)}" onchange="PCR_STATE.rtCurrentSamples[${idx}].alias_code=this.value.trim();if(!PCR_STATE.rtCurrentSamples[${idx}].alias_code)pcrAssignSampleAliases(PCR_STATE.rtCurrentSamples,'PN');renderRtStrips();pcrAutoSaveRtContext()"></td>
            <td style="font-weight:400;font-size:11px;line-height:1.25;max-width:120px;white-space:normal;word-break:break-word;">${s.name}</td>
            <td style="color:#666;font-size:12px;" class="tube-lbl">${s.tube}</td>
            <td><input type="number" class="rt-input" placeholder="0.0" value="${s.conc}" oninput="calcRtSample(${idx},this.value,'conc')"></td>
            <td><input type="number" class="rt-input" placeholder="1.8" value="${s.ratio}" oninput="PCR_STATE.rtCurrentSamples[${idx}].ratio=this.value; pcrAutoSaveRtContext();"></td>
            <td class="rna-vol" style="font-weight:bold;color:var(--info)">${s.rna_vol > 0 ? Number(s.rna_vol).toFixed(2) : '-'}</td>
            <td>${s.enzyme_vol}</td>
            <td class="water-vol ${s.water_vol < 0 ? 'error' : ''}" style="font-weight:bold;color:${s.water_vol < 0 ? 'var(--danger)' : 'var(--success)'}">${s.conc ? Number(s.water_vol).toFixed(2) : '-'}</td>
        </tr>
    `).join('');

    renderRtStrips();
}

window.deleteRtSample = function (idx) {
    if (!confirm(`确定要从本轮逆转录(RT)中剔除样本 ${PCR_STATE.rtCurrentSamples[idx].name} 吗？`)) return;
    if (window._curRnaExp && Array.isArray(window._curRnaExp.samples)) {
        window._curRnaExp.samples.splice(idx, 1);
    }
    PCR_STATE.rtCurrentSamples.splice(idx, 1);
    let ts = Math.ceil(PCR_STATE.rtCurrentSamples.length / 8) || 1;
    PCR_STATE.rtStripMap = Array.from({ length: ts }, (_, i) => Array.from({ length: 8 }, (_, j) => { let v = i * 8 + j; return v < PCR_STATE.rtCurrentSamples.length ? v : null; }));
    if (window._curRnaExp) renderPcrRna();
    else renderPcrRt();
    pcrAutoSaveRtContext();
}

function renderRtStrips() {
    let box = document.getElementById('rtStripsBox');
    let sh = '';
    PCR_STATE.rtStripMap.forEach((s, i) => {
        sh += `<div class="strip-wrapper"><div style="font-size:10px;text-align:center;color:#888;margin-bottom:2px">管 ${i + 1}</div><div class="strip-8">`;
        s.forEach((sx, j) => {
            let smp = (sx !== null) ? PCR_STATE.rtCurrentSamples[sx] : null;
            let c = smp ? pcrSampleLabel(smp, sx) : (sx !== null ? '?' : '');
            sh += `<div class="strip-tube ${smp ? 'filled' : ''}" title="${smp ? smp.name : '空'}" onclick="showRtAssign(${i},${j},this)">${c}</div>`;
        });
        sh += `</div></div>`;
    });
    sh += `<div class="strip-wrapper" style="justify-content:center;"><div style="font-size:10px;text-align:center;color:#888;margin-bottom:2px">&nbsp;</div><div class="strip-actions"><button class="btn btn-sm btn-secondary strip-round-btn" onclick="addRtStrip()" title="添加八联管"><i class="ti ti-plus"></i></button>`;
    if (PCR_STATE.rtStripMap.length > 1) sh += `<button class="btn btn-sm btn-danger strip-round-btn" onclick="removeRtStrip()" title="删除最后一排八联管"><i class="ti ti-minus"></i></button>`;
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
    pcrAutoSaveRtContext();
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
    pcrAutoSaveRtContext();
}
window.addRtStrip = function () { PCR_STATE.rtStripMap.push(new Array(8).fill(null)); renderRtTable(); pcrAutoSaveRtContext(); }
window.removeRtStrip = function () { PCR_STATE.rtStripMap.pop(); renderRtTable(); pcrAutoSaveRtContext(); }



// -------------------------------------------------------- qPCR
function renderPcrQpcr() {
    let c = document.getElementById('pcrQpcr');
    if (!c) return;
    let hasExp = !!window._curQpcrExp;
    let noReady = PCR_STATE.cdnaSamples.length === 0;
    let disabledMsg = PCR_STATE.cdnaSamples.length === 0 ? '需先完成 PCR提取/逆转录并生成 cDNA 样本' : '';

    let workHtml = '';
    if (hasExp) {
        let exp = window._curQpcrExp;
        let protocols = PCR_STATE.qpcrProtocols.length ? PCR_STATE.qpcrProtocols : [{ id: '', name: '默认 qPCR 体系', well_vol: 10, sybr_vol: 5, primer_vol: 1, cdna_vol: 1, steps: pcrDefaultSteps('qpcr') }];
        let protoOptions = protocols.map(p => `<option value="${p.id}" ${p.id === exp.protocol_id ? 'selected' : ''}>${p.name} (${p.well_vol || 10}μL体系)</option>`).join('');
        let genesStr = (exp.genes || PCR_STATE.qpcrGenes || []).join(', ');
        let geneSelectOpts = '<option value="">选择基因</option>' + (PCR_STATE.qpcrGenes || []).map(g => `<option>${g}</option>`).join('');
        let sampleSelectOpts = '<option value="">选择样本</option>' + (PCR_STATE.qpcrSamples || []).map((s, idx) => `<option value="${s.name || s}">${pcrSampleLabel(s, idx)} · ${s.name || s}</option>`).join('');

        // Build FC/CT section
        let hkOpts = (PCR_STATE.qpcrGenes || []).map(g => `<option value="${g}" ${exp.hk_gene === g ? 'selected' : ''}>${g}</option>`).join('');

        workHtml = `
        <div class="card workflow-panel" style="margin-top:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <div style="font-weight:700;font-size:15px;"><i class="ti ti-chart-line" style="color:var(--primary)"></i> qPCR 荧光定量实验</div>
                <button class="btn btn-sm btn-secondary" onclick="window._curQpcrExp=null;PCR_STATE.qpcrGenes=[];PCR_STATE.qpcrSamples=[];PCR_STATE.qpcrAllSamples=[];PCR_STATE.qpcrPlateMap={};PCR_STATE.qpcrSelectedWells=new Set();renderPcrQpcr()"><i class="ti ti-x"></i></button>
            </div>
            <div class="form-group"><label class="form-label">实验名称</label><input class="form-input" id="qExpName" value="${exp.name || ''}" placeholder="如：第一批qPCR" oninput="if(window._curQpcrExp)window._curQpcrExp.name=this.value"></div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">cDNA样本</label><button class="btn btn-secondary btn-block" onclick="pcrOpenQpcrCdnaPicker()"><i class="ti ti-database-import"></i> 导入样本</button></div>
                <div class="form-group"><label class="form-label">qPCR方案</label><select class="form-select" id="qExpProto" onchange="_onQpcrProtoChange()">${protoOptions}</select></div>
            </div>
            ${pcrRenderQpcrSampleStrips()}
            <div class="form-row">
                <div class="form-group" style="flex:2"><label class="form-label">测试基因 (逗号分隔)</label><input class="form-input" id="qExpGenes" value="${genesStr}" placeholder="GAPDH, IL-6, TNF-a" onchange="_onQpcrGenesChange()"></div>
                <div class="form-group" style="flex:1"><label class="form-label">复孔数</label><input type="number" class="form-input" id="qExpReps" value="${exp.reps || 3}" min="1" style="width:80px;"></div>
                <div class="form-group" style="display:flex;align-items:flex-end"><button class="btn btn-secondary" onclick="_autoAssignQpcr()" title="根据基因和样本自动排布384板"><i class="ti ti-wand"></i> 自动排布</button></div>
            </div>
            <div class="divider"></div>
            ${ (() => {
                let p = protocols.find(x => x.id === exp.protocol_id) || protocols[0];
                let steps = p && p.steps && p.steps.length ? p.steps : pcrDefaultSteps('qpcr');
                return pcrBuildStepChecklist(steps, PCR_STATE.activeQpcrStepsCheck || [], 'qpcrStep', 'toggleQpcrStep', '实验流程步骤', pcrNormalizeStepTimers(exp.step_timers || p?.step_timers, steps.length));
            })() }
            <div class="qpcr-toolbar">
                <div class="qpcr-toolbar-title"><i class="ti ti-palette"></i> 孔位分配模式</div>
                <div class="qpcr-paint-controls">
                    <select class="form-select" id="qPaintGene">${geneSelectOpts}</select>
                    <select class="form-select" id="qPaintSample">${sampleSelectOpts}</select>
                    <button class="btn btn-sm btn-secondary" onclick="applyPaint()"><i class="ti ti-circle-check"></i> 应用</button>
                    <button class="btn btn-sm btn-secondary" onclick="clearSelectedWells()"><i class="ti ti-eraser"></i> 清除</button>
                </div>
            </div>
            <div id="qPlateLegend" class="color-legend"></div>
            <div class="plate-384-wrapper" id="qPlateWrapper"></div>
            <button class="btn btn-secondary btn-block" onclick="saveQpcrDraft()"><i class="ti ti-device-floppy"></i> 暂存进度</button>

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
            <button class="btn btn-primary btn-block" ${noReady ? 'disabled title="' + disabledMsg + '"' : ''} onclick="_startNewQpcr()"><i class="ti ti-player-play"></i> 启动 qPCR 实验</button>
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
    if (PCR_STATE.cdnaSamples.length === 0) return showToast('需先完成 PCR提取/逆转录并生成 cDNA 样本', 'warning');
    let p = PCR_STATE.qpcrProtocols[0] || { id: '', name: '默认 qPCR 体系', steps: pcrDefaultSteps('qpcr'), well_vol: 10, sybr_vol: 5, primer_vol: 1, cdna_vol: 1 };
    let steps = p.steps && p.steps.length ? p.steps : pcrDefaultSteps('qpcr');
    PCR_STATE.activeQpcrStepsCheck = new Array(steps.length).fill(false);
    PCR_STATE.qpcrGenes = [];
    PCR_STATE.qpcrPlateMap = {};
    PCR_STATE.qpcrSelectedWells = new Set();
    window._curQpcrExp = { name: '', protocol_id: p.id, step_timers: pcrNormalizeStepTimers(p.step_timers, steps.length), genes: [], reps: 3, status: '中途保存', cdna_sample_ids: [], cdna_groups: [] };
    pcrSetQpcrSourceSamples(PCR_STATE.cdnaSamples || []);
    renderPcrQpcr();
    autoSaveExp('qpcr', true);
}

window._onQpcrProtoChange = function() {
    if (!window._curQpcrExp) return;
    let protocolId = document.getElementById('qExpProto').value;
    let protocol = pcrResolveQpcrProtocol(protocolId);
    let steps = protocol.steps && protocol.steps.length ? protocol.steps : pcrDefaultSteps('qpcr');
    window._curQpcrExp.protocol_id = protocol.id;
    window._curQpcrExp.step_timers = pcrNormalizeStepTimers(protocol.step_timers, steps.length);
    PCR_STATE.activeQpcrStepsCheck = new Array(steps.length).fill(false);
    renderPcrQpcr();
    autoSaveExp('qpcr');
};

window._onQpcrRtChange = function () {
    pcrOpenQpcrCdnaPicker();
}

window.pcrOpenQpcrCdnaPicker = function() {
    if (!window._curQpcrExp) return;
    if (typeof wfOpenSampleGroupPicker !== 'function') return showToast('样本组选择器未加载', 'error');
    wfOpenSampleGroupPicker({
        title: '导入样本',
        samples: PCR_STATE.cdnaSamples || [],
        allowMultiGroup: true,
        aliasPrefix: 'PQ',
        emptyText: '样本库中还没有 cDNA 样本',
        onImport(selected, groups) {
            let selectedRows = selected.map(sample => ({
                ...sample,
                name: sample.original_sample_name || sample.name || sample.display_name,
                alias_code: '',
                run_alias_code: '',
                sample_id: sample.id,
                cdna_sample_id: sample.id,
                group: sample.group || '-',
                day: sample.duration || sample.intervention_duration || '-',
                induction_scheme: sample.induction_scheme || sample.intervention_scheme || '',
                source_experiment_name: sample.pcr_extract_name || sample.collection_name || '',
                source_tube_label: sample.tube_label || '',
                source_tube_index: Number(sample.strip_index || 0),
                source_tube_position: sample.tube_position || '',
                tube_index: Number(sample.tube_index || 0),
                pcr_extract_id: sample.pcr_extract_id || sample.collection_id || ''
            }));
            window._curQpcrExp.cdna_sample_ids = selectedRows.map(sample => sample.cdna_sample_id || sample.sample_id).filter(Boolean);
            window._curQpcrExp.cdna_groups = (Array.isArray(groups) ? groups : [groups]).filter(Boolean).map(group => ({ id: group.id, name: group.name }));
            window._curQpcrExp.cdna_source_names = [...new Set(selectedRows.map(sample => sample.source_experiment_name).filter(Boolean))];
            PCR_STATE.qpcrPlateMap = {};
            PCR_STATE.qpcrSelectedWells = new Set();
            pcrSetQpcrSourceSamples(selectedRows);
            renderPcrQpcr();
            autoSaveExp('qpcr');
        }
    });
};

window.deleteQpcrSample = function (idx) {
    let smp = PCR_STATE.qpcrSamples[idx];
    if (!confirm(`确定要在本次 qPCR 中剔除样本 ${smp.name || smp} 吗？\n(这也会将已画在其孔位上的该样本清空)`)) return;
    let selected = new Set(PCR_STATE.qpcrSamples.map((sample, index) => pcrSampleKey(sample, index)));
    selected.delete(pcrSampleKey(smp, idx));
    pcrRemoveQpcrSampleFromPlate(smp);
    pcrSetQpcrSourceSamples(PCR_STATE.qpcrAllSamples.length ? PCR_STATE.qpcrAllSamples : PCR_STATE.qpcrSamples, selected);
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
    if (genes.length === 0) return showToast("需输入基因", "warning");
    let reps = parseInt(document.getElementById('qExpReps').value) || 3;
    PCR_STATE.qpcrGenes = genes;
    if (window._curQpcrExp) { window._curQpcrExp.genes = genes; window._curQpcrExp.reps = reps; }
    PCR_STATE.qpcrPlateMap = {};
    let smps = PCR_STATE.qpcrSamples;
    if (!smps.length) return showToast("需先选择至少一个 cDNA 样本", "warning");
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
            if (info && info.gene) { let gi = genes.indexOf(info.gene); bg = gi !== -1 ? getColor(gi) : '#cacaca'; t = info.sampleObj ? pcrSampleLabel(info.sampleObj, 0) : (info.sample ? info.sample.substring(0, 2) : ''); tt = `${wid}: ${info.sampleObj?.alias_code || ''} ${info.sample || ''} (${info.gene})`; }
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
    if (!window._curQpcrExp.name) return showToast('需填写实验名称', 'error');
    window._curQpcrExp.status = "未计算FC";
    window._curQpcrExp.plate_map = PCR_STATE.qpcrPlateMap;
    window._curQpcrExp.samples = PCR_STATE.qpcrSamples;
    window._curQpcrExp.all_samples = PCR_STATE.qpcrAllSamples;
    window._curQpcrExp.genes = PCR_STATE.qpcrGenes;
    window._curQpcrExp.step_timers = pcrNormalizeStepTimers(window._curQpcrExp.step_timers || pcrResolveQpcrProtocol(window._curQpcrExp.protocol_id || '').step_timers, PCR_STATE.activeQpcrStepsCheck.length);
    window._curQpcrExp.activeCheck = PCR_STATE.activeQpcrStepsCheck;
    autoSaveExp('qpcr', true);
    showToast('进度已暂存');
}

window.saveQpcrProtocol = async function () {
    let name = document.getElementById('qPName').value;
    let tv = parseFloat(document.getElementById('qPTotal').value) || 10;
    let sybr = parseFloat(document.getElementById('qPSybr').value) || 5;
    let primer = parseFloat(document.getElementById('qPPrimer').value) || 1;
    let cdna = parseFloat(document.getElementById('qPCdna').value) || 1;
    let stepsArr = typeof protocolReadSteps === 'function'
        ? protocolReadSteps('qPSteps')
        : (document.getElementById('qPSteps')?.value || '').split('\n').map(x => x.trim()).filter(x => x);
    if (!name || !tv) return showToast("信息不完整", "error");
    let payload = { name, well_vol: tv, sybr_vol: sybr, primer_vol: primer, cdna_vol: cdna, steps: stepsArr, step_timers: typeof protocolReadStepTimers === 'function' ? protocolReadStepTimers('qPSteps') : [] };
    if (window._currentEditingQpcrProtoId) { payload.id = window._currentEditingQpcrProtoId; window._currentEditingQpcrProtoId = null; }
    if (typeof protocolFinishSave === 'function') await protocolFinishSave();
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
    if (typeof protocolSetSteps === 'function' && protocolSetSteps('qPSteps', p.steps || [], p.step_timers || [])) {}
    else if(document.getElementById('qPSteps')) document.getElementById('qPSteps').value = (p.steps || []).join('\n');
    document.getElementById('qPName').scrollIntoView({ behavior: 'smooth' });
}

window.loadExpHistory = function (cat, id) {
    let log = PCR_STATE[cat + 'Logs'].find(l => l.id === id); if (!log) return;
    let exp = JSON.parse(JSON.stringify(log));
    if (cat === 'rna') { window._curRnaExp = exp; PCR_STATE.activeRnaStepsCheck = exp.activeCheck || []; renderPcrRna(); }
    if (cat === 'rt') { window._curRtExp = exp; PCR_STATE.rtCurrentSamples = exp.samples || []; PCR_STATE.rtStripMap = exp.stripMap || []; PCR_STATE.activeRtStepsCheck = exp.activeCheck || []; renderPcrRt(); }
    if (cat === 'qpcr') {
        window._curQpcrExp = exp;
        PCR_STATE.qpcrPlateMap = exp.plate_map || {};
        PCR_STATE.qpcrGenes = exp.genes || [];
        PCR_STATE.qpcrSelectedWells = new Set();
        PCR_STATE.activeQpcrStepsCheck = exp.activeCheck || [];
        let selectedKeys = new Set((exp.samples || []).map((sample, index) => pcrSampleKey(sample, index)));
        pcrSetQpcrSourceSamples(exp.all_samples || exp.samples || [], selectedKeys);
        renderPcrQpcr();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.renderQpcrMasterMix = function () {
    let wrap = document.getElementById('qPlateWrapper');
    if (!wrap) return;
    let existing = document.getElementById('qMasterMixPanel');
    if (existing) existing.remove();

    if (!window._curQpcrExp) return;
    let p = PCR_STATE.qpcrProtocols.find(x => x.id === window._curQpcrExp.protocol_id) || { well_vol: 10, sybr_vol: 5, primer_vol: 1, cdna_vol: 1 };
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
            <div style="font-size:12px; color:var(--info); margin-top:6px;"><b>加样方案：</b>每孔 Mix <b>${mix}</b> μL，cDNA <b>${p.cdna_vol}</b> μL</div>
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
            <td><input type="text" class="rt-input ct-input" style="width:160px; text-align:left;" id="ctInput_${idx}" placeholder="21.0, 21.2" value="${savedVal}" oninput="calcRowCT('${k}', ${idx})"></td>
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
        window._curQpcrExp.all_samples = PCR_STATE.qpcrAllSamples;
        window._curQpcrExp.activeCheck = PCR_STATE.activeQpcrStepsCheck;
        autoSaveExp('qpcr', true);
        showToast('FC计算完成，数据及步骤状态已保存！');
    }
}


