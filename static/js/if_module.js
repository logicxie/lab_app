/* ============================================================
   if_module.js — 免疫荧光实验模块
   ============================================================ */

let IF_STATE = {
    protocols: [],
    logs: [],
    samples: [],
    antibodies: [],
    calc: { wells: 8, volume: 200, primaryRatio: 200, secondaryRatio: 500, excess: 10 }
};

window.loadIfData = async function() {
    let responses = await Promise.all([
        fetch('/api/workflows/if/protocols'),
        fetch('/api/workflows/if/logs'),
        fetch('/api/samples'),
        fetch('/api/wb/detection/protocols')
    ]);
    IF_STATE.protocols = await responses[0].json();
    IF_STATE.logs = await responses[1].json();
    IF_STATE.samples = await responses[2].json();
    if (typeof WORKFLOW_STATE !== 'undefined') WORKFLOW_STATE.samples = IF_STATE.samples;
    let antibodyItems = await responses[3].json();
    IF_STATE.antibodies = (antibodyItems || []).filter(x => !x.kind || x.kind === 'antibody');
    renderIfCalc();
};

function ifParseRatio(text, fallback) {
    let raw = String(text || '').replace(/1\s*[：:]/g, '');
    let match = raw.match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : fallback;
}

function ifDefaultSteps() {
    return ['固定样本', 'PBS 清洗', '通透/抗原修复', '封闭', '一抗孵育', '二抗避光孵育', 'DAPI 复染', '封片拍照'];
}

function ifProtocolOptions(selectedId = '') {
    if (!IF_STATE.protocols.length) return '<option value="">默认 IF 流程</option>';
    return IF_STATE.protocols.map(p => `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${p.name}</option>`).join('');
}

function ifResolveProtocol(id) {
    return IF_STATE.protocols.find(p => p.id === id) || null;
}

function ifStepsFor(protocolId) {
    let protocol = ifResolveProtocol(protocolId);
    return protocol && protocol.steps && protocol.steps.length ? protocol.steps : ifDefaultSteps();
}

function ifAntibodyOptions(selectedId = '') {
    return ifAntibodyOptionsByRole(selectedId, 'primary');
}

function ifAntibodyRole(item) {
    return item?.antibody_role || item?.role || item?.type || 'primary';
}

function ifRoleLabel(role) {
    return /secondary|二抗/i.test(role || '') ? '二抗' : '一抗';
}

function ifAntibodyOptionsByRole(selectedId = '', role = 'primary') {
    let wantSecondary = /secondary|二抗/i.test(role || '');
    let items = (IF_STATE.antibodies || []).filter(a => {
        let itemRole = ifAntibodyRole(a);
        let isSecondary = /secondary|二抗/i.test(itemRole);
        if (a.id === selectedId) return true;
        return wantSecondary ? isSecondary : !isSecondary;
    });
    let label = wantSecondary ? '未选择二抗' : '未选择一抗';
    return `<option value="">${label}</option>` + items.map(a => {
        let range = a.if_range ? ` · IF ${a.if_range}` : '';
        return `<option value="${a.id}" ${a.id === selectedId ? 'selected' : ''}>${a.name}${range}</option>`;
    }).join('');
}

function ifGetAntibodyById(id) {
    return (IF_STATE.antibodies || []).find(a => a.id === id) || null;
}

function ifDateInput(value) {
    if (!value) return '';
    return String(value).substring(0, 16).replace(' ', 'T');
}

function ifReadableDate(value) {
    return value ? String(value).replace('T', ' ') : '';
}

function ifSampleText(sample) {
    let tags = Array.isArray(sample.tags) ? sample.tags.join(' ') : (sample.tags || '');
    return [sample.name, sample.sample_category, sample.material_category, sample.material_type, sample.preservation, sample.source_category, sample.source_type, sample.source_label, sample.tissue, sample.body_part, tags].filter(Boolean).join(' ').toLowerCase();
}

function ifIsRnaOrProteinSample(sample) {
    let text = [sample.sample_category, sample.material_category, sample.material_type].filter(Boolean).join(' ').toLowerCase();
    return text.includes('rna') || text.includes('蛋白') || text.includes('protein');
}

function ifIsEligibleSample(sample) {
    if (ifIsRnaOrProteinSample(sample)) return false;
    let text = ifSampleText(sample);
    let isSlice = /切片|section|slide|玻片/.test(text);
    let isCoverslip = /爬片|coverslip|cover slip|coverglass|盖玻片/.test(text);
    let isFixed = /固定|fixed|pfa|formalin|甲醛|多聚甲醛|4%/.test(text);
    let isCell = /细胞|cell/.test(text);
    return isSlice || isCoverslip || (isFixed && isCell);
}

function ifResolveSampleLayout(sample) {
    let text = ifSampleText(sample);
    if (/爬片|coverslip|cover slip|coverglass|盖玻片/.test(text)) return '爬片';
    if (/切片|section|slide|玻片/.test(text)) return '切片';
    if (/细胞|cell/.test(text)) return '固定细胞';
    return '切片';
}

function ifLayoutOptions(selected = '切片') {
    return ['切片', '固定细胞', '爬片', '细胞板'].map(item => `<option value="${item}" ${item === selected ? 'selected' : ''}>${item}</option>`).join('');
}

function ifPlateTypeOptions(selected = '24孔板') {
    let plateTypes = Object.keys(CONFIG?.plate_configs || {});
    return plateTypes.map(type => `<option value="${type}" ${type === selected ? 'selected' : ''}>${type}</option>`).join('');
}

function ifSlideFormatValue(sample = {}) {
    let raw = String(sample.slide_format || sample.section_layout || sample.slice_layout || sample.slide_layout || sample.sections_per_slide || sample.section_count || '').toLowerCase();
    if (/double|two|2|双|两|二/.test(raw)) return 'double';
    return 'single';
}

function ifSlideSectionCount(sample = {}) {
    let count = parseInt(sample.sections_per_slide || sample.section_count || sample.slice_count || sample.sections_count);
    if (count >= 2) return 2;
    return ifSlideFormatValue(sample) === 'double' ? 2 : 1;
}

function ifSlideFormatLabel(sample = {}) {
    return ifSlideSectionCount(sample) >= 2 ? '1玻片2切片' : '单个切片';
}

function ifSlideFormatOptions(selected = 'single') {
    return [
        { value: 'single', label: '单个切片' },
        { value: 'double', label: '1玻片2切片' }
    ].map(item => `<option value="${item.value}" ${item.value === selected ? 'selected' : ''}>${item.label}</option>`).join('');
}

function ifDefaultSlideUnits(sample = {}) {
    let count = ifSlideSectionCount(sample);
    if (count >= 2) return ['切片1', '切片2'];
    return [sample.unit_id || (sample.layout === '爬片' ? '爬片1' : '切片1')];
}

function ifStructuredFromSample(sample) {
    let layout = ifResolveSampleLayout(sample);
    let slideId = sample.slide_id || sample.section_id || sample.plate_name || sample.container_id || sample.name || '';
    let unitId = sample.region || sample.well_id || sample.unit_id || sample.body_part || sample.tissue || '';
    let structured = {
        sample_id: sample.id || '',
        name: typeof wfSampleDisplayName === 'function' ? wfSampleDisplayName(sample) : (sample.name || ''),
        alias_code: sample.alias_code || sample.sample_code || '',
        source: sample.source_label || sample.source_type || '样本库',
        group: sample.group || sample.induction_group || '',
        induction_scheme: sample.induction_scheme || sample.protocol_name || sample.group || '',
        duration: sample.duration || sample.induction_days || sample.day || '',
        harvested_at: ifDateInput(sample.harvested_at || sample.harvest_time || sample.created_at),
        material_type: sample.material_type || sample.tissue || '',
        layout,
        slide_format: ifSlideFormatValue(sample),
        sections_per_slide: ifSlideSectionCount(sample),
        slide_id: slideId,
        plate_type: sample.plate_type || sample.container_type || '24孔板',
        unit_id: unitId,
        antibody_plan_id: ifFirstAntibodyPlanId(),
        antibody_plan: ifFirstAntibodyPlanName(),
        note: sample.notes || ''
    };
    return ifEnsureSampleAssignments(structured);
}

function ifSampleImportOptions() {
    let source = (IF_STATE.samples || []).filter(ifIsEligibleSample);
    if (!source.length) return '<option value="">暂无切片、爬片或固定细胞样本</option>';
    return '<option value="">从样本库选择并导入</option>' + source.map(s => `<option value="${s.id}">${s.name} · ${s.material_type || s.sample_category || '-'} · ${s.preservation || '-'}</option>`).join('');
}

function ifRenderAssignmentGrid() {
    if (!window._curIfExp) return '';
    ifEnsureAllSamples();
    let samples = window._curIfExp.samples || [];
    if (!samples.length) return '<div class="empty-state" style="padding:12px">暂无关联样本</div>';
    return `
    ${ifRenderSampleList(samples)}
        <div class="if-board-list">${samples.map((sample, index) => ifRenderSampleBoardCard(sample, index)).join('')}</div>`;
}

function ifRenderPaintToolbar() {
    let exp = window._curIfExp;
    if (!exp) return '';
    let plans = ifNormalizeAntibodyPlans(exp);
    if (!exp.paint_plan_id || !plans.some(plan => plan.id === exp.paint_plan_id)) exp.paint_plan_id = plans[0]?.id || '';
    let colors = ifPlanColorMap(plans);
    return `<div class="if-paint-toolbar">
        ${plans.map((plan, index) => {
            let active = exp.paint_plan_id === plan.id ? 'active' : '';
            return `<button class="if-paint-chip ${active}" onclick="ifSelectPaintPlan('${plan.id}')" style="--plan-color:${colors[plan.id]};"><span></span>${ifPlanLabel(plan, index)}</button>`;
        }).join('')}
    </div>`;
}

function ifRenderSampleList(samples) {
    ifEnsureSampleCodes(samples);
    return `<div class="rt-table-wrapper if-sample-table-wrapper">
        <table class="rt-table if-sample-table">
            <thead><tr><th>代号</th><th>操作</th><th>样本</th><th>造模/干预</th><th>形式</th><th>载片/孔板</th><th>版式/板型</th><th>抗体组合</th><th>来源</th><th>组别</th><th>材料</th><th>备注</th></tr></thead>
            <tbody>${samples.map((sample, index) => ifRenderSampleRow(sample, index)).join('')}</tbody>
        </table>
    </div>`;
}

function ifEnsureSampleCodes(samples) {
    if (typeof wfAssignSampleAliases === 'function') return wfAssignSampleAliases(samples, 'I');
    (samples || []).forEach((sample, index) => { if (!sample.alias_code) sample.alias_code = `I0D0-${index + 1}`; });
    return samples;
}

function ifRenderSampleRow(sample, index) {
    ifEnsureSampleAssignments(sample);
    let layout = sample.layout || '切片';
    let isPlate = layout === '细胞板';
    let selectedPlanId = ifSampleMainPlanId(sample);
    let layoutDetail = isPlate
        ? `<select class="rt-input if-sample-input" data-field="plate_type" onchange="ifUpdateSampleField(${index}, 'plate_type', this.value, true)">${ifPlateTypeOptions(ifDefaultPlateType(sample))}</select>`
        : (layout === '切片'
            ? `<select class="rt-input if-sample-input" data-field="slide_format" onchange="ifUpdateSampleField(${index}, 'slide_format', this.value, true)">${ifSlideFormatOptions(ifSlideFormatValue(sample))}</select>`
            : `<span class="if-table-chip">${layout}</span>`);
    return `
        <tr class="if-sample-row" data-index="${index}">
            <td><input class="rt-input if-sample-input sample-code-input" data-field="alias_code" value="${sample.alias_code || `I0D0-${index + 1}`}" placeholder="I0D0-${index + 1}" oninput="ifUpdateSampleField(${index}, 'alias_code', this.value)"></td>
            <td><button class="btn btn-sm btn-danger" onclick="ifRemoveSample(${index})"><i class="ti ti-minus"></i></button></td>
            <td><input class="rt-input if-sample-input" data-field="name" value="${sample.name || ''}" placeholder="样本名" oninput="ifUpdateSampleField(${index}, 'name', this.value)"></td>
            <td><span class="sample-lineage-chip">${typeof wfSampleInterventionSummary === 'function' ? wfSampleInterventionSummary(sample) : [sample.induction_scheme, sample.duration].filter(Boolean).join(' · ')}</span></td>
            <td><select class="rt-input if-sample-input" data-field="layout" onchange="ifUpdateSampleField(${index}, 'layout', this.value, true)">${ifLayoutOptions(layout)}</select></td>
            <td><input class="rt-input if-sample-input" data-field="slide_id" value="${sample.slide_id || ''}" placeholder="载片/孔板" oninput="ifUpdateSampleField(${index}, 'slide_id', this.value)"></td>
            <td>${layoutDetail}</td>
            <td><select class="rt-input if-sample-plan-select" onchange="ifApplySamplePlan(${index}, this.value)">${ifSamplePlanOptions(selectedPlanId)}</select></td>
            <td><input class="rt-input if-sample-input" data-field="source" value="${sample.source || ''}" placeholder="来源" oninput="ifUpdateSampleField(${index}, 'source', this.value)"></td>
            <td><input class="rt-input if-sample-input" data-field="group" value="${sample.group || ''}" placeholder="组别" oninput="ifUpdateSampleField(${index}, 'group', this.value)"></td>
            <td><input class="rt-input if-sample-input" data-field="material_type" value="${sample.material_type || ''}" placeholder="材料" oninput="ifUpdateSampleField(${index}, 'material_type', this.value)"></td>
            <td><input class="rt-input if-sample-input" data-field="note" value="${sample.note || ''}" placeholder="备注" oninput="ifUpdateSampleField(${index}, 'note', this.value)"></td>
        </tr>`;
}

function ifRenderSampleBoardCard(sample, index) {
    ifEnsureSampleAssignments(sample);
    let layoutInfo = sample.layout === '切片' ? ifSlideFormatLabel(sample) : (sample.layout || '切片');
    let title = [sample.alias_code, sample.name || `样本${index + 1}`].filter(Boolean).join(' · ');
    return `
        <div class="if-board-card">
            <div class="if-board-card-head">
                <div>
                    <b>${title}</b>
                    <small>${[sample.slide_id, layoutInfo, sample.antibody_plan].filter(Boolean).join(' · ')}</small>
                </div>
                <select class="rt-input if-board-plan-select" onchange="ifApplySamplePlan(${index}, this.value)">${ifSamplePlanOptions(ifSampleMainPlanId(sample))}</select>
            </div>
            ${ifRenderSampleBoard(sample, index)}
        </div>`;
}

function ifRenderSampleBoard(sample, index) {
    return sample.layout === '细胞板' ? ifRenderPlateAssignment(sample, index) : ifRenderSlideAssignment(sample, index);
}

function ifRenderSlideAssignment(sample, index) {
    let plans = ifNormalizeAntibodyPlans();
    let colors = ifPlanColorMap(plans);
    return `<div class="if-layout-map">
        <div class="if-slide-visual" title="点击圆形样本点选择抗体组合">
            ${(sample.assignments || []).map((assignment, unitIndex) => {
                let plan = ifGetPlanById(assignment.antibody_plan_id);
                let color = colors[assignment.antibody_plan_id] || '#E8E8E8';
                let left = (sample.assignments || []).length > 1 ? (unitIndex === 0 ? '34%' : '66%') : '50%';
                return `<button class="if-slide-spot" style="--plan-color:${color};left:${left};" onclick="ifPickAssignmentPlan(event, ${index}, ${unitIndex})" title="${assignment.unit_id || `切片${unitIndex + 1}`}: ${plan ? ifPlanLabel(plan, plans.indexOf(plan)) : '未分配'}">
                    <span>${assignment.unit_id || `切片${unitIndex + 1}`}</span>
                    <small>${plan ? ifPlanLabel(plan, plans.indexOf(plan)) : '未分配'}</small>
                </button>`;
            }).join('')}
        </div>
    </div>`;
}

function ifRenderPlateAssignment(sample, index) {
    let plateType = ifDefaultPlateType(sample);
    let cfg = CONFIG?.plate_configs?.[plateType] || CONFIG?.plate_configs?.['24孔板'];
    if (!cfg) return '<div class="empty-state" style="padding:12px">未配置板型</div>';
    let plans = ifNormalizeAntibodyPlans();
    let colors = ifPlanColorMap(plans);
    let assignments = new Map((sample.assignments || []).map(a => [a.unit_id, a]));
    let wellSizeMap = { '6孔板': 64, '12孔板': 50, '24孔板': 38, '96孔板': 28 };
    let fontSizeMap = { '6孔板': 12, '12孔板': 11, '24孔板': 10, '96孔板': 9 };
    let ws = wellSizeMap[plateType] || 34;
    let fs = fontSizeMap[plateType] || 10;
    let html = `<div class="if-layout-map"><div class="plate-grid-container"><table class="plate-grid if-plate-grid"><tbody><tr>`;
    html += `<td class="plate-header plate-corner" title="全板" onclick="ifPickPlateAll(event, ${index})" style="width:${Math.max(26, Math.round(ws * 0.55))}px;height:${Math.max(26, Math.round(ws * 0.55))}px">■</td>`;
    for (let c = 0; c < cfg.cols; c++) html += `<td class="plate-header plate-col-header" onclick="ifPickPlateColumn(event, ${index}, ${c})" style="width:${ws}px;font-size:${fs}px"><b>${c + 1}</b></td>`;
    html += '</tr>';
    for (let r = 0; r < cfg.rows; r++) {
        html += '<tr>';
        html += `<td class="plate-header plate-row-header" onclick="ifPickPlateRow(event, ${index}, ${r})" style="height:${ws}px;font-size:${fs}px"><b>${cfg.row_labels[r]}</b></td>`;
        for (let c = 0; c < cfg.cols; c++) {
            let unit = `${cfg.row_labels[r]}${c + 1}`;
            let assignment = assignments.get(unit) || ifNormalizeAssignment({}, unit);
            let plan = ifGetPlanById(assignment.antibody_plan_id);
            let color = colors[assignment.antibody_plan_id] || '#E8E8E8';
            let label = plan ? ifPlanLabel(plan, plans.indexOf(plan)).slice(0, ws >= 50 ? 4 : 2) : unit;
            html += `<td class="plate-cell if-plate-cell" onclick="ifPickPlateWell(event, ${index}, '${unit}')" title="${unit}: ${plan ? ifPlanLabel(plan, plans.indexOf(plan)) : '未分配'}" style="--plan-color:${color};background:${color};width:${ws}px;height:${ws}px;font-size:${fs}px">${label}</td>`;
        }
        html += '</tr>';
    }
    html += '</tbody></table></div></div>';
    return html;
}

function ifPlanId() {
    if (window.crypto && crypto.randomUUID) return `if_plan_${crypto.randomUUID()}`;
    return `if_plan_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function ifPlanLabel(plan, index = 0) {
    let names = [
        plan?.primary_antibody || ifAntibodyName(plan?.primary_antibody_id),
        plan?.primary_antibody2 || ifAntibodyName(plan?.primary_antibody2_id)
    ].filter(Boolean);
    if (names.length) return names.join(' + ');
    if (plan?.name && !/^组合\d+$/.test(plan.name)) return plan.name;
    return `抗体组合${index + 1}`;
}

function ifPlanColorMap(plans = ifNormalizeAntibodyPlans()) {
    let colors = ['#4ECDC4', '#FF6B6B', '#45B7D1', '#96CEB4', '#DDA0DD', '#FFD93D', '#FF8B94', '#A8E6CF'];
    let map = {};
    plans.forEach((plan, index) => { map[plan.id] = colors[index % colors.length]; });
    return map;
}

function ifGetPlanById(planId) {
    let plans = ifNormalizeAntibodyPlans();
    return plans.find(plan => plan.id === planId) || plans[0] || null;
}

function ifPlanIdByName(name) {
    let plans = ifNormalizeAntibodyPlans();
    let found = plans.find((plan, index) => plan.name === name || ifPlanLabel(plan, index) === name);
    return found?.id || plans[0]?.id || '';
}

function ifFirstAntibodyPlanId() {
    return ifNormalizeAntibodyPlans()[0]?.id || '';
}

function ifRatioFromAntibodyId(id, mode = 'if', fallback = null) {
    let antibody = ifGetAntibodyById(id);
    if (!antibody) return fallback;
    let field = mode === 'ihc' ? 'ihc_range' : (mode === 'wb' ? 'wb_range' : 'if_range');
    return ifParseRatio(antibody[field], fallback);
}

function ifDefaultPlanRatios(plan, fallbackCalc = IF_STATE.calc) {
    return {
        primaryRatio: ifRatioFromAntibodyId(plan?.primary_antibody_id, 'if', fallbackCalc.primaryRatio || 200),
        secondaryRatio: ifRatioFromAntibodyId(plan?.secondary_antibody_id, 'if', fallbackCalc.secondaryRatio || 500),
        primary2Ratio: ifRatioFromAntibodyId(plan?.primary_antibody2_id, 'if', fallbackCalc.primary2Ratio || fallbackCalc.primaryRatio || 200),
        secondary2Ratio: ifRatioFromAntibodyId(plan?.secondary_antibody2_id, 'if', fallbackCalc.secondary2Ratio || fallbackCalc.secondaryRatio || 500)
    };
}

function ifAssignmentPlanLabel(assignment) {
    let plan = ifGetPlanById(assignment?.antibody_plan_id || ifPlanIdByName(assignment?.antibody_plan));
    return plan ? ifPlanLabel(plan, ifNormalizeAntibodyPlans().indexOf(plan)) : (assignment?.antibody_plan || '未分配');
}

function ifNormalizeAssignment(assignment = {}, fallbackUnit = '区域1') {
    let planId = assignment.antibody_plan_id || ifPlanIdByName(assignment.antibody_plan) || ifFirstAntibodyPlanId();
    let normalized = {
        unit_id: assignment.unit_id || fallbackUnit,
        antibody_plan_id: planId,
        antibody_plan: assignment.antibody_plan || ifAssignmentPlanLabel({ antibody_plan_id: planId })
    };
    normalized.antibody_plan = ifAssignmentPlanLabel(normalized);
    return normalized;
}

function ifDefaultPlateType(sample) {
    return sample?.plate_type || sample?.plate || '24孔板';
}

function ifEnsureSampleAssignments(sample) {
    if (!sample) return sample;
    sample.layout = sample.layout || window._curIfExp?.layout_mode || '切片';
    if (!sample.slide_id) sample.slide_id = sample.unit_id || sample.name || '载片1';
    if (sample.layout === '细胞板') {
        sample.plate_type = ifDefaultPlateType(sample);
        let cfg = CONFIG?.plate_configs?.[sample.plate_type] || CONFIG?.plate_configs?.['24孔板'];
        let oldAssignments = Array.isArray(sample.assignments) ? sample.assignments : [];
        if (!oldAssignments.length && sample.unit_id) {
            String(sample.unit_id).split(/[、,，;；\s]+/).filter(Boolean).forEach(unit => oldAssignments.push({ unit_id: unit, antibody_plan: sample.antibody_plan, antibody_plan_id: sample.antibody_plan_id }));
        }
        let byUnit = new Map(oldAssignments.map(a => [a.unit_id, a]));
        let assignments = [];
        if (cfg) {
            for (let r = 0; r < cfg.rows; r++) {
                for (let c = 0; c < cfg.cols; c++) {
                    let unit = `${cfg.row_labels[r]}${c + 1}`;
                    assignments.push(ifNormalizeAssignment(byUnit.get(unit), unit));
                }
            }
        }
        sample.assignments = assignments;
    } else {
        let assignments = Array.isArray(sample.assignments) && sample.assignments.length
            ? sample.assignments
            : ifDefaultSlideUnits(sample).map(unit => ({ unit_id: unit, antibody_plan: sample.antibody_plan, antibody_plan_id: sample.antibody_plan_id }));
        sample.assignments = assignments.map((assignment, index) => ifNormalizeAssignment(assignment, assignment.unit_id || `区域${index + 1}`));
    }
    ifSyncSampleAssignmentSummary(sample);
    return sample;
}

function ifSyncSampleAssignmentSummary(sample) {
    let assignments = sample?.assignments || [];
    let planLabels = Array.from(new Set(assignments.map(ifAssignmentPlanLabel).filter(Boolean)));
    if (sample.layout === '细胞板') sample.unit_id = `${assignments.length}孔`;
    else sample.unit_id = assignments.map(a => a.unit_id).filter(Boolean).join('、');
    sample.antibody_plan = planLabels.join('、') || ifPlanLabel(ifGetPlanById(ifFirstAntibodyPlanId()), 0);
}

function ifEnsureAllSamples() {
    if (!window._curIfExp) return;
    window._curIfExp.antibody_plans = ifNormalizeAntibodyPlans(window._curIfExp);
    window._curIfExp.samples = (window._curIfExp.samples || []).map(sample => ifEnsureSampleAssignments(sample));
}

function ifNormalizeAntibodyPlans(exp = window._curIfExp || {}) {
    if (Array.isArray(exp.antibody_plans) && exp.antibody_plans.length) {
        return exp.antibody_plans.map((plan, index) => {
            let normalized = {
                ...plan,
                id: plan.id || ifPlanId(),
                primary_antibody_id: plan.primary_antibody_id || '',
                secondary_antibody_id: plan.secondary_antibody_id || '',
                primary_antibody2_id: plan.primary_antibody2_id || '',
                secondary_antibody2_id: plan.secondary_antibody2_id || '',
                secondary_antibody: plan.secondary_antibody || '',
                secondary_antibody2: plan.secondary_antibody2 || '',
                note: plan.note || ''
            };
            normalized.primary_antibody = ifAntibodyName(normalized.primary_antibody_id) || plan.primary_antibody || '';
            normalized.primary_antibody2 = ifAntibodyName(normalized.primary_antibody2_id) || plan.primary_antibody2 || '';
            normalized.secondary_antibody = ifAntibodyName(normalized.secondary_antibody_id) || normalized.secondary_antibody;
            normalized.secondary_antibody2 = ifAntibodyName(normalized.secondary_antibody2_id) || normalized.secondary_antibody2;
            normalized.name = ifPlanLabel(normalized, index);
            return normalized;
        });
    }
    let blank = { id: ifPlanId(), primary_antibody_id: '', primary_antibody: '', secondary_antibody_id: '', secondary_antibody: '', primary_antibody2_id: '', primary_antibody2: '', secondary_antibody2_id: '', secondary_antibody2: '', note: '' };
    blank.name = ifPlanLabel(blank, 0);
    return [blank];
}

function ifFirstAntibodyPlanName() {
    let plans = ifNormalizeAntibodyPlans();
    return plans[0]?.name || '抗体组合1';
}

function ifAntibodyName(id) {
    return ifGetAntibodyById(id)?.name || '';
}

function ifAntibodyPlanOptions(selected = '') {
    let plans = ifNormalizeAntibodyPlans();
    let exists = plans.some(plan => plan.name === selected);
    let extra = selected && !exists ? `<option value="${selected}" selected>${selected}</option>` : '';
    return plans.map(plan => `<option value="${plan.name}" ${plan.name === selected ? 'selected' : ''}>${plan.name}</option>`).join('') + extra;
}

function ifSampleMainPlanId(sample) {
    let ids = Array.from(new Set((sample?.assignments || []).map(a => a.antibody_plan_id).filter(Boolean)));
    return ids.length === 1 ? ids[0] : '';
}

function ifSamplePlanOptions(selectedId = '') {
    let plans = ifNormalizeAntibodyPlans();
    return `<option value="" ${selectedId ? '' : 'selected'}>混合分配</option>` + plans.map((plan, index) => `<option value="${plan.id}" ${plan.id === selectedId ? 'selected' : ''}>${ifPlanLabel(plan, index)}</option>`).join('');
}

function ifRenderAntibodyPlans(exp) {
    let plans = ifNormalizeAntibodyPlans(exp);
    return `
        <div id="ifAntibodyPlanList" class="if-plan-list">
            ${plans.map((plan, index) => `
                <div class="if-plan-card" data-plan-id="${plan.id || ifPlanId()}">
                    <div class="if-plan-card-head">
                        <button class="btn btn-sm btn-danger" onclick="ifRemoveAntibodyPlan(${index})"><i class="ti ti-minus"></i></button>
                        <div>
                            <b>${ifPlanLabel(plan, index)}</b>
                            <small>${[plan.secondary_antibody || ifAntibodyName(plan.secondary_antibody_id), plan.secondary_antibody2 || ifAntibodyName(plan.secondary_antibody2_id)].filter(Boolean).join(' · ') || '未选择二抗'}</small>
                        </div>
                    </div>
                    <div class="if-plan-fields">
                        <label><span>一抗1</span><select class="rt-input if-plan-input" data-field="primary_antibody_id" onchange="ifSyncAntibodyPlans();ifAutofillCalcFromPlans(true);renderIfCalc()">${ifAntibodyOptionsByRole(plan.primary_antibody_id || '', 'primary')}</select></label>
                        <label><span>二抗1</span><select class="rt-input if-plan-input" data-field="secondary_antibody_id" onchange="ifSyncAntibodyPlans();ifAutofillCalcFromPlans(true);renderIfCalc()">${ifAntibodyOptionsByRole(plan.secondary_antibody_id || '', 'secondary')}</select></label>
                        <label><span>一抗2</span><select class="rt-input if-plan-input" data-field="primary_antibody2_id" onchange="ifSyncAntibodyPlans();ifAutofillCalcFromPlans(true);renderIfCalc()">${ifAntibodyOptionsByRole(plan.primary_antibody2_id || '', 'primary')}</select></label>
                        <label><span>二抗2</span><select class="rt-input if-plan-input" data-field="secondary_antibody2_id" onchange="ifSyncAntibodyPlans();ifAutofillCalcFromPlans(true);renderIfCalc()">${ifAntibodyOptionsByRole(plan.secondary_antibody2_id || '', 'secondary')}</select></label>
                        <label class="if-field-wide"><span>备注</span><input class="rt-input if-plan-input" data-field="note" value="${plan.note || ''}" placeholder="通道/曝光/孵育备注" oninput="ifSyncAntibodyPlans()"></label>
                    </div>
                </div>`).join('')}
        </div>
        <button class="btn btn-sm btn-secondary" style="margin-top:8px" onclick="ifAddAntibodyPlan()"><i class="ti ti-plus"></i> 添加抗体组合</button>`;
}

function ifRenderSteps() {
    let exp = window._curIfExp;
    let steps = exp ? (exp.steps || []) : [];
    let checks = exp ? (exp.activeCheck || []) : [];
    if (!steps.length) return '<div class="empty-state" style="padding:12px">未配置流程步骤</div>';
    return `<div class="step-list">${steps.map((step, i) => `
        <label class="step-item ${checks[i] ? 'checked' : ''}" id="ifStepItem_${i}">
            <input type="checkbox" class="step-checkbox if-step" ${checks[i] ? 'checked' : ''} onchange="ifToggleStep(${i}, this.checked)">
            <div><b>Step ${i + 1}.</b> ${step}</div>
        </label>`).join('')}</div>`;
}

function renderIfCalc() {
    let container = document.getElementById('ifCalc');
    if (!container) return;
    let hasExp = !!window._curIfExp;
    let workHtml = '';

    if (hasExp) {
        let exp = window._curIfExp;
        exp.antibody_plans = ifNormalizeAntibodyPlans(exp);
        ifEnsureAllSamples();
        let hasSecondChannel = exp.antibody_plans.some(plan => plan.primary_antibody2_id || plan.primary_antibody2 || plan.secondary_antibody2);
        let calc = exp.calc || IF_STATE.calc;
        workHtml = `
        <div class="card" style="margin-top:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;">
                <div style="font-weight:700;font-size:15px;"><i class="ti ti-microscope" style="color:var(--primary)"></i> IF 实验会话</div>
                <button class="btn btn-sm btn-secondary" onclick="ifCancelCurrent()"><i class="ti ti-x"></i></button>
            </div>

            <div class="form-group"><label class="form-label">实验名称</label><input class="form-input" id="ifExpName" value="${exp.name || ''}" placeholder="肝组织 alpha-SMA IF" oninput="ifSyncCurrent()"></div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">流程方案</label><select class="form-select" id="ifProtocolSelect" onchange="ifChangeProtocol()">${ifProtocolOptions(exp.protocol_id || '')}</select></div>
                <div class="form-group"><label class="form-label">默认样本形式</label><select class="form-select" id="ifLayoutMode" onchange="ifSyncCurrent()">${ifLayoutOptions(exp.layout_mode || '切片')}</select></div>
            </div>
            <div class="form-group"><label class="form-label">图片/数据路径</label><input class="form-input" id="ifImagePath" value="${exp.image_path || ''}" placeholder="显微图片文件夹或图像编号" oninput="ifSyncCurrent()"></div>

            <div class="divider"></div>
            <div class="section-title"><i class="ti ti-vaccine"></i> 抗体组合</div>
            ${ifRenderAntibodyPlans(exp)}

            <div class="divider"></div>
            <div class="section-title"><i class="ti ti-vials"></i> 关联样本与抗体分配</div>
            <div class="form-row">
                <div class="form-group"><button class="btn btn-secondary btn-block" onclick="ifOpenSamplePicker()"><i class="ti ti-database-import"></i> 导入样本</button></div>
                <div class="form-group"><button class="btn btn-secondary btn-block" onclick="ifAddSampleRow()"><i class="ti ti-plus"></i> 手动添加样本</button></div>
            </div>
            ${ifRenderPaintToolbar()}
            <div style="margin-top:10px">${ifRenderAssignmentGrid()}</div>

            <div class="divider"></div>
            <div class="section-title"><i class="ti ti-calculator"></i> 孵育液辅助计算</div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">备用孔/片数量</label><input type="number" class="form-input" id="ifWells" value="${calc.wells}" oninput="ifUpdateCalc()"></div>
                <div class="form-group"><label class="form-label">每孔/区域体积 (μL)</label><input type="number" class="form-input" id="ifVol" value="${calc.volume}" oninput="ifUpdateCalc()"></div>
                <div class="form-group"><label class="form-label">损耗 (%)</label><input type="number" class="form-input" id="ifExcess" value="${calc.excess}" oninput="ifUpdateCalc()"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">默认一抗稀释比 (1:X)</label><input type="number" class="form-input" id="ifPrimaryRatio" value="${calc.primaryRatio}" oninput="ifUpdateCalc()"></div>
                <div class="form-group"><label class="form-label">默认二抗稀释比 (1:X)</label><input type="number" class="form-input" id="ifSecondaryRatio" value="${calc.secondaryRatio}" oninput="ifUpdateCalc()"></div>
            </div>
            ${hasSecondChannel ? `<div class="form-row"><div class="form-group"><label class="form-label">默认一抗2稀释比 (1:X)</label><input type="number" class="form-input" id="ifPrimary2Ratio" value="${calc.primary2Ratio || calc.primaryRatio}" oninput="ifUpdateCalc()"></div><div class="form-group"><label class="form-label">默认二抗2稀释比 (1:X)</label><input type="number" class="form-input" id="ifSecondary2Ratio" value="${calc.secondary2Ratio || calc.secondaryRatio}" oninput="ifUpdateCalc()"></div></div>` : ''}
            <div id="ifCalcResult"></div>

            <div class="divider"></div>
            <details class="workflow-steps-details">
                <summary><i class="ti ti-checklist"></i> 流程步骤</summary>
                <div id="ifStepsBox">${ifRenderSteps()}</div>
            </details>
            <div class="form-group"><label class="form-label">结果记录</label><textarea class="form-textarea" id="ifResult" rows="3" placeholder="记录阳性区域、背景、曝光与异常情况" oninput="ifSyncCurrent()">${exp.result || ''}</textarea></div>
            <div style="display:flex;gap:8px;margin-top:12px;">
                <button class="btn btn-secondary" style="flex:1" onclick="ifSaveLog('中途保存')"><i class="ti ti-device-floppy"></i> 暂存</button>
                <button class="btn btn-success" style="flex:1" onclick="ifSaveLog('已完成')"><i class="ti ti-circle-check"></i> 完成并保存</button>
            </div>
        </div>`;
    }

    container.innerHTML = `
        ${hasExp ? workHtml : `<div class="card" style="margin-top:8px;"><button class="btn btn-primary btn-block" onclick="ifStartExperiment()"><i class="ti ti-player-play"></i> 启动 IF 实验</button></div>`}
        <div class="divider"></div>
        <div class="section-title"><i class="ti ti-history"></i> IF 记录</div>
        <div id="ifHistoryDiv">${renderIfHistory()}</div>`;

    if (hasExp) {
        ifUpdateCalc();
    }
}

function renderIfHistory() {
    if (!IF_STATE.logs.length) return '<div class="empty-state">暂无 IF 记录</div>';
    return IF_STATE.logs.map(log => buildRecordCard({
        key: `if:${log.id}`,
        type: 'if_log',
        data: log,
        meta: { icon: 'ti-microscope', color: '#7c3aed', typeLabel: `免疫荧光 · ${log.status || '已记录'}` },
        extraButtons: `<button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();ifEditLog('${log.id}')"><i class="ti ti-pencil"></i></button><button class="btn btn-sm btn-danger" onclick="event.stopPropagation();ifDeleteLog('${log.id}')"><i class="ti ti-x"></i></button>`
    })).join('');
}

window.ifStartExperiment = function() {
    let proto = IF_STATE.protocols[0] || null;
    let steps = proto ? [...(proto.steps || [])] : ifDefaultSteps();
    window._curIfExp = {
        name: '',
        protocol_id: proto ? proto.id : '',
        protocol_name: proto ? proto.name : '默认 IF 流程',
        samples: [],
        sample_ids: [],
        steps,
        activeCheck: new Array(steps.length).fill(false),
        calc: { ...IF_STATE.calc },
        layout_mode: '切片',
        antibody_plans: ifNormalizeAntibodyPlans({}),
        paint_plan_id: '',
        status: '中途保存'
    };
    window._curIfExp.paint_plan_id = window._curIfExp.antibody_plans[0]?.id || '';
    renderIfCalc();
    ifAddSampleRow();
};

window.ifCancelCurrent = function() {
    window._curIfExp = null;
    renderIfCalc();
};

window.ifChangeProtocol = function() {
    if (!window._curIfExp) return;
    ifSyncSamples();
    ifSyncAntibodyPlans();
    let id = document.getElementById('ifProtocolSelect').value;
    let protocol = ifResolveProtocol(id);
    window._curIfExp.protocol_id = id;
    window._curIfExp.protocol_name = protocol ? protocol.name : '默认 IF 流程';
    window._curIfExp.steps = ifStepsFor(id);
    window._curIfExp.activeCheck = new Array(window._curIfExp.steps.length).fill(false);
    renderIfCalc();
};

window.ifToggleStep = function(index, checked) {
    if (!window._curIfExp) return;
    window._curIfExp.activeCheck[index] = checked;
    let el = document.getElementById(`ifStepItem_${index}`);
    if (el) el.classList.toggle('checked', checked);
};

window.ifUpdateCalc = function() {
    let wells = parseFloat(document.getElementById('ifWells')?.value) || 0;
    let volume = parseFloat(document.getElementById('ifVol')?.value) || 0;
    let excess = parseFloat(document.getElementById('ifExcess')?.value) || 0;
    let primaryRatio = parseFloat(document.getElementById('ifPrimaryRatio')?.value) || 1;
    let secondaryRatio = parseFloat(document.getElementById('ifSecondaryRatio')?.value) || 1;
    let primary2Ratio = parseFloat(document.getElementById('ifPrimary2Ratio')?.value) || primaryRatio;
    let secondary2Ratio = parseFloat(document.getElementById('ifSecondary2Ratio')?.value) || secondaryRatio;
    IF_STATE.calc = { wells, volume, primaryRatio, secondaryRatio, primary2Ratio, secondary2Ratio, excess };
    if (window._curIfExp) window._curIfExp.calc = { ...IF_STATE.calc };
    let result = document.getElementById('ifCalcResult');
    if (!result) return;
    if (window._curIfExp) ifEnsureAllSamples();
    let plans = ifNormalizeAntibodyPlans(window._curIfExp || {});
    let counts = new Map();
    (window._curIfExp?.samples || []).forEach(sample => {
        (sample.assignments || []).forEach(assignment => {
            let planId = assignment.antibody_plan_id || ifPlanIdByName(assignment.antibody_plan);
            counts.set(planId, (counts.get(planId) || 0) + 1);
        });
    });
    if (!counts.size && plans[0]) counts.set(plans[0].id, wells || 1);
    let rows = Array.from(counts.entries()).map(([planId, count]) => {
        let plan = ifGetPlanById(planId) || plans[0];
        let ratios = ifDefaultPlanRatios(plan, IF_STATE.calc);
        let total = count * volume * (1 + excess / 100);
        let hasSecondChannel = !!(plan.primary_antibody2_id || plan.primary_antibody2 || plan.secondary_antibody2_id || plan.secondary_antibody2);
        return `
            <div class="if-mix-card">
                <div class="if-mix-title">${ifPlanLabel(plan, plans.indexOf(plan))}<small>${count} 孔/区域</small></div>
                <div class="passage-result-grid">
                    <div class="passage-result-item"><div class="passage-result-label">总孵育液</div><div class="passage-result-value">${total.toFixed(0)}<span class="passage-result-unit">μL</span></div></div>
                    <div class="passage-result-item accent"><div class="passage-result-label">一抗1 1:${ratios.primaryRatio}</div><div class="passage-result-value">${(total / ratios.primaryRatio).toFixed(2)}<span class="passage-result-unit">μL</span></div></div>
                    <div class="passage-result-item"><div class="passage-result-label">二抗1 1:${ratios.secondaryRatio}</div><div class="passage-result-value">${(total / ratios.secondaryRatio).toFixed(2)}<span class="passage-result-unit">μL</span></div></div>
                    ${hasSecondChannel ? `<div class="passage-result-item accent"><div class="passage-result-label">一抗2 1:${ratios.primary2Ratio}</div><div class="passage-result-value">${(total / ratios.primary2Ratio).toFixed(2)}<span class="passage-result-unit">μL</span></div></div><div class="passage-result-item"><div class="passage-result-label">二抗2 1:${ratios.secondary2Ratio}</div><div class="passage-result-value">${(total / ratios.secondary2Ratio).toFixed(2)}<span class="passage-result-unit">μL</span></div></div>` : ''}
                </div>
            </div>`;
    }).join('');
    result.innerHTML = `
        <div class="if-mix-list">${rows}</div>`;
};

window.ifSyncAntibodyPlans = function() {
    if (!window._curIfExp) return;
    let rows = [];
    document.querySelectorAll('#ifAntibodyPlanList .if-plan-card').forEach((card, index) => {
        let plan = { id: card.dataset.planId || ifPlanId() };
        card.querySelectorAll('.if-plan-input').forEach(input => {
            plan[input.dataset.field] = input.value.trim ? input.value.trim() : input.value;
        });
        plan.primary_antibody = ifAntibodyName(plan.primary_antibody_id);
        plan.secondary_antibody = ifAntibodyName(plan.secondary_antibody_id) || '';
        plan.primary_antibody2 = ifAntibodyName(plan.primary_antibody2_id);
        plan.secondary_antibody2 = ifAntibodyName(plan.secondary_antibody2_id) || '';
        plan.name = ifPlanLabel(plan, index);
        rows.push(plan);
    });
    window._curIfExp.antibody_plans = rows.length ? rows : ifNormalizeAntibodyPlans({});
    ifEnsureAssignmentPlanIds();
};

function ifEnsureAssignmentPlanIds() {
    if (!window._curIfExp) return;
    let firstPlanId = ifFirstAntibodyPlanId();
    let validIds = new Set((window._curIfExp.antibody_plans || []).map(plan => plan.id));
    (window._curIfExp.samples || []).forEach(sample => {
        (sample.assignments || []).forEach(assignment => {
            if (!assignment.antibody_plan_id || !validIds.has(assignment.antibody_plan_id)) assignment.antibody_plan_id = firstPlanId;
            assignment.antibody_plan = ifAssignmentPlanLabel(assignment);
        });
        ifSyncSampleAssignmentSummary(sample);
    });
}

function ifAutofillCalcFromPlans(force = false) {
    if (!window._curIfExp) return;
    let firstPlan = window._curIfExp.antibody_plans?.[0];
    if (!firstPlan) return;
    let calc = window._curIfExp.calc || IF_STATE.calc;
    let ratios = ifDefaultPlanRatios(firstPlan, calc);
    ['primaryRatio', 'secondaryRatio', 'primary2Ratio', 'secondary2Ratio'].forEach(key => {
        if (force || !calc[key]) calc[key] = ratios[key];
    });
    window._curIfExp.calc = { ...calc };
    IF_STATE.calc = { ...IF_STATE.calc, ...calc };
    let inputMap = { primaryRatio: 'ifPrimaryRatio', secondaryRatio: 'ifSecondaryRatio', primary2Ratio: 'ifPrimary2Ratio', secondary2Ratio: 'ifSecondary2Ratio' };
    Object.entries(inputMap).forEach(([key, id]) => {
        let input = document.getElementById(id);
        if (input && (force || !input.value)) input.value = calc[key] || '';
    });
}

window.renderIfSampleAntibodyPlanSelects = function() {
    if (window._curIfExp) renderIfCalc();
};

window.ifAddAntibodyPlan = function() {
    if (!window._curIfExp) return;
    ifSyncSamples();
    ifSyncAntibodyPlans();
    let plans = window._curIfExp.antibody_plans || [];
    let plan = { id: ifPlanId(), primary_antibody_id: '', primary_antibody: '', secondary_antibody_id: '', secondary_antibody: '', primary_antibody2_id: '', primary_antibody2: '', secondary_antibody2_id: '', secondary_antibody2: '', note: '' };
    plan.name = ifPlanLabel(plan, plans.length);
    plans.push(plan);
    window._curIfExp.antibody_plans = plans;
    window._curIfExp.paint_plan_id = plan.id;
    renderIfCalc();
};

window.ifRemoveAntibodyPlan = function(index) {
    if (!window._curIfExp) return;
    ifSyncSamples();
    ifSyncAntibodyPlans();
    let removed = window._curIfExp.antibody_plans[index];
    window._curIfExp.antibody_plans.splice(index, 1);
    if (!window._curIfExp.antibody_plans.length) window._curIfExp.antibody_plans = ifNormalizeAntibodyPlans({});
    let fallbackId = window._curIfExp.antibody_plans[0]?.id || ifFirstAntibodyPlanId();
    (window._curIfExp.samples || []).forEach(sample => {
        (sample.assignments || []).forEach(assignment => {
            if (assignment.antibody_plan_id === removed?.id || assignment.antibody_plan === removed?.name) assignment.antibody_plan_id = fallbackId;
            assignment.antibody_plan = ifAssignmentPlanLabel(assignment);
        });
        ifSyncSampleAssignmentSummary(sample);
    });
    window._curIfExp.paint_plan_id = fallbackId;
    renderIfCalc();
};

window.ifImportSample = function() {
    let id = document.getElementById('ifImportSampleSelect')?.value;
    let sample = IF_STATE.samples.find(s => s.id === id);
    if (!sample) return showToast('需选择样本库记录', 'error');
    if (!window._curIfExp.samples) window._curIfExp.samples = [];
    window._curIfExp.samples.push(ifStructuredFromSample(sample));
    ifEnsureSampleCodes(window._curIfExp.samples);
    renderIfCalc();
};

window.ifOpenSamplePicker = function() {
    if (!window._curIfExp) return;
    ifSyncSamples();
    if (typeof wfOpenSampleGroupPicker !== 'function') return showToast('样本组选择器未加载', 'error');
    wfOpenSampleGroupPicker({
        title: '导入样本',
        samples: IF_STATE.samples || [],
        filter: ifIsEligibleSample,
        aliasPrefix: 'I',
        emptyText: '没有可用于 IF 的切片、爬片或固定细胞样本',
        onImport(selected) {
            if (!window._curIfExp.samples) window._curIfExp.samples = [];
            selected.forEach(sample => window._curIfExp.samples.push(ifStructuredFromSample(sample)));
            ifEnsureSampleCodes(window._curIfExp.samples);
            renderIfCalc();
        }
    });
};

window.ifAddSampleRow = function(existing = null) {
    if (!window._curIfExp) return;
    ifSyncSamples();
    let sample = existing || { name: '', source: '', group: '', induction_scheme: '', duration: '', harvested_at: '', material_type: '固定样本', layout: window._curIfExp?.layout_mode || '切片', slide_format: 'single', sections_per_slide: 1, slide_id: `载片${(window._curIfExp.samples || []).length + 1}`, unit_id: '切片1', antibody_plan_id: ifFirstAntibodyPlanId(), antibody_plan: ifFirstAntibodyPlanName(), note: '' };
    if (!window._curIfExp.samples) window._curIfExp.samples = [];
    window._curIfExp.samples.push(ifEnsureSampleAssignments(sample));
    ifEnsureSampleCodes(window._curIfExp.samples);
    renderIfCalc();
};

window.ifRemoveSample = function(index) {
    if (!window._curIfExp) return;
    ifSyncSamples();
    window._curIfExp.samples.splice(index, 1);
    renderIfCalc();
};

window.ifUpdateSampleField = function(index, field, value, rerender = false) {
    if (!window._curIfExp?.samples?.[index]) return;
    let sample = window._curIfExp.samples[index];
    sample[field] = value;
    if (field === 'slide_format') sample.sections_per_slide = value === 'double' ? 2 : 1;
    if (field === 'sections_per_slide') sample.sections_per_slide = parseInt(value) || 1;
    if (['layout', 'plate_type', 'slide_format', 'sections_per_slide'].includes(field)) {
        sample.assignments = [];
        ifEnsureSampleAssignments(sample);
    } else {
        ifEnsureSampleAssignments(sample);
    }
    if (rerender) renderIfCalc();
    else ifUpdateCalc();
};

window.ifSelectPaintPlan = function(planId) {
    if (!window._curIfExp) return;
    window._curIfExp.paint_plan_id = planId;
    renderIfCalc();
};

window.ifApplySamplePlan = function(sampleIndex, planId) {
    if (!window._curIfExp || !planId) return;
    ifSyncSamples();
    let sample = window._curIfExp.samples?.[sampleIndex];
    if (!sample) return;
    ifEnsureSampleAssignments(sample);
    sample.antibody_plan_id = planId;
    (sample.assignments || []).forEach(assignment => {
        assignment.antibody_plan_id = planId;
        assignment.antibody_plan = ifAssignmentPlanLabel(assignment);
    });
    window._curIfExp.paint_plan_id = planId;
    ifSyncSampleAssignmentSummary(sample);
    renderIfCalc();
};

function ifCurrentPaintPlanId() {
    if (!window._curIfExp) return ifFirstAntibodyPlanId();
    let plans = ifNormalizeAntibodyPlans(window._curIfExp);
    if (!window._curIfExp.paint_plan_id || !plans.some(plan => plan.id === window._curIfExp.paint_plan_id)) window._curIfExp.paint_plan_id = plans[0]?.id || '';
    return window._curIfExp.paint_plan_id;
}

let _ifPlanPopup = null;

function ifClosePlanPopup() {
    if (_ifPlanPopup) {
        _ifPlanPopup.remove();
        _ifPlanPopup = null;
    }
    document.removeEventListener('click', ifOutsidePlanPopupHandler);
}

function ifOutsidePlanPopupHandler(event) {
    if (_ifPlanPopup && !_ifPlanPopup.contains(event.target)) ifClosePlanPopup();
}

function ifShowPlanPopup(anchorEl, title, onSelect) {
    if (!anchorEl) return;
    ifClosePlanPopup();
    let plans = ifNormalizeAntibodyPlans(window._curIfExp);
    let colors = ifPlanColorMap(plans);
    let popup = document.createElement('div');
    popup.className = 'if-plan-popup';

    let titleEl = document.createElement('div');
    titleEl.className = 'if-plan-popup-title';
    titleEl.textContent = title;
    popup.appendChild(titleEl);

    plans.forEach((plan, index) => {
        let button = document.createElement('button');
        button.type = 'button';
        button.className = 'if-plan-popup-option';
        button.style.borderLeftColor = colors[plan.id] || '#E8E8E8';
        button.addEventListener('click', event => {
            event.stopPropagation();
            onSelect(plan.id);
            ifClosePlanPopup();
        });

        let dot = document.createElement('span');
        dot.className = 'if-plan-popup-dot';
        dot.style.background = colors[plan.id] || '#E8E8E8';
        button.appendChild(dot);

        let text = document.createElement('span');
        text.className = 'if-plan-popup-text';
        text.textContent = ifPlanLabel(plan, index);
        text.title = text.textContent;
        button.appendChild(text);

        popup.appendChild(button);
    });

    let cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'if-plan-popup-cancel';
    cancel.textContent = '取消';
    cancel.addEventListener('click', event => {
        event.stopPropagation();
        ifClosePlanPopup();
    });
    popup.appendChild(cancel);

    document.body.appendChild(popup);
    _ifPlanPopup = popup;

    let rect = anchorEl.getBoundingClientRect();
    let popW = popup.offsetWidth || 270;
    let popH = popup.offsetHeight || 280;
    let left = rect.left + window.scrollX;
    let top = rect.bottom + window.scrollY + 4;
    if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
    if (top + popH > window.scrollY + window.innerHeight - 8) top = rect.top + window.scrollY - popH - 4;
    popup.style.left = `${Math.max(8, left)}px`;
    popup.style.top = `${Math.max(8, top)}px`;

    setTimeout(() => document.addEventListener('click', ifOutsidePlanPopupHandler), 10);
}

function ifSetAssignmentPlan(assignment, planId = ifCurrentPaintPlanId()) {
    assignment.antibody_plan_id = planId;
    assignment.antibody_plan = ifAssignmentPlanLabel(assignment);
}

window.ifPickAssignmentPlan = function(event, sampleIndex, unitIndex) {
    if (event) event.stopPropagation();
    ifSyncSamples();
    let sample = window._curIfExp?.samples?.[sampleIndex];
    let assignment = sample?.assignments?.[unitIndex];
    if (!assignment) return;
    ifShowPlanPopup(event?.currentTarget || event?.target, `${sample.name || `样本${sampleIndex + 1}`} · ${assignment.unit_id || `切片${unitIndex + 1}`}`, planId => {
        window.ifSetAssignmentPlanById(sampleIndex, unitIndex, planId);
    });
};

window.ifSetAssignmentPlanById = function(sampleIndex, unitIndex, planId) {
    let sample = window._curIfExp?.samples?.[sampleIndex];
    let assignment = sample?.assignments?.[unitIndex];
    if (!assignment || !planId) return;
    ifSetAssignmentPlan(assignment, planId);
    window._curIfExp.paint_plan_id = planId;
    ifSyncSampleAssignmentSummary(sample);
    document.getElementById('ifPlanPickerModal')?.remove();
    ifClosePlanPopup();
    renderIfCalc();
};

window.ifAssignSampleUnit = function(sampleIndex, unitIndex) {
    ifSyncSamples();
    let sample = window._curIfExp?.samples?.[sampleIndex];
    if (!sample?.assignments?.[unitIndex]) return;
    ifSetAssignmentPlan(sample.assignments[unitIndex]);
    ifSyncSampleAssignmentSummary(sample);
    renderIfCalc();
};

window.ifAssignSampleAll = function(sampleIndex) {
    ifSyncSamples();
    let sample = window._curIfExp?.samples?.[sampleIndex];
    if (!sample) return;
    (sample.assignments || []).forEach(ifSetAssignmentPlan);
    ifSyncSampleAssignmentSummary(sample);
    renderIfCalc();
};

window.ifAddSampleUnit = function(sampleIndex) {
    ifSyncSamples();
    let sample = window._curIfExp?.samples?.[sampleIndex];
    if (!sample) return;
    ifEnsureSampleAssignments(sample);
    sample.assignments.push(ifNormalizeAssignment({}, `区域${sample.assignments.length + 1}`));
    ifSyncSampleAssignmentSummary(sample);
    renderIfCalc();
};

window.ifRemoveSampleUnit = function(sampleIndex, unitIndex) {
    ifSyncSamples();
    let sample = window._curIfExp?.samples?.[sampleIndex];
    if (!sample || sample.layout === '细胞板' || (sample.assignments || []).length <= 1) return;
    sample.assignments.splice(unitIndex, 1);
    ifSyncSampleAssignmentSummary(sample);
    renderIfCalc();
};

window.ifUpdateSampleUnit = function(sampleIndex, unitIndex, value) {
    let sample = window._curIfExp?.samples?.[sampleIndex];
    if (!sample?.assignments?.[unitIndex]) return;
    sample.assignments[unitIndex].unit_id = value || `区域${unitIndex + 1}`;
    ifSyncSampleAssignmentSummary(sample);
    ifUpdateCalc();
};

window.ifPickPlateWell = function(event, sampleIndex, unitId) {
    if (event) event.stopPropagation();
    ifShowPlanPopup(event?.currentTarget || event?.target, `孔位 ${unitId} 抗体组合`, planId => {
        window.ifAssignPlateWell(sampleIndex, unitId, planId);
    });
};

window.ifPickPlateAll = function(event, sampleIndex) {
    if (event) event.stopPropagation();
    ifShowPlanPopup(event?.currentTarget || event?.target, '全板抗体组合', planId => {
        window.ifAssignPlateAll(sampleIndex, planId);
    });
};

window.ifPickPlateRow = function(event, sampleIndex, rowIndex) {
    if (event) event.stopPropagation();
    let sample = window._curIfExp?.samples?.[sampleIndex];
    let cfg = CONFIG?.plate_configs?.[ifDefaultPlateType(sample)];
    let rowLabel = cfg?.row_labels?.[rowIndex] || rowIndex + 1;
    ifShowPlanPopup(event?.currentTarget || event?.target, `第 ${rowLabel} 行抗体组合`, planId => {
        window.ifAssignPlateRow(sampleIndex, rowIndex, planId);
    });
};

window.ifPickPlateColumn = function(event, sampleIndex, colIndex) {
    if (event) event.stopPropagation();
    ifShowPlanPopup(event?.currentTarget || event?.target, `第 ${colIndex + 1} 列抗体组合`, planId => {
        window.ifAssignPlateColumn(sampleIndex, colIndex, planId);
    });
};

window.ifAssignPlateWell = function(sampleIndex, unitId, planId = ifCurrentPaintPlanId()) {
    ifSyncSamples();
    let sample = window._curIfExp?.samples?.[sampleIndex];
    if (!sample) return;
    let assignment = (sample.assignments || []).find(item => item.unit_id === unitId);
    if (!assignment) return;
    ifSetAssignmentPlan(assignment, planId);
    window._curIfExp.paint_plan_id = planId;
    ifSyncSampleAssignmentSummary(sample);
    renderIfCalc();
};

window.ifAssignPlateAll = function(sampleIndex, planId = ifCurrentPaintPlanId()) {
    ifSyncSamples();
    let sample = window._curIfExp?.samples?.[sampleIndex];
    if (!sample) return;
    (sample.assignments || []).forEach(assignment => ifSetAssignmentPlan(assignment, planId));
    window._curIfExp.paint_plan_id = planId;
    ifSyncSampleAssignmentSummary(sample);
    renderIfCalc();
};

window.ifAssignPlateRow = function(sampleIndex, rowIndex, planId = ifCurrentPaintPlanId()) {
    ifSyncSamples();
    let sample = window._curIfExp?.samples?.[sampleIndex];
    let cfg = CONFIG?.plate_configs?.[ifDefaultPlateType(sample)];
    if (!sample || !cfg) return;
    let rowLabel = cfg.row_labels[rowIndex];
    (sample.assignments || []).filter(item => String(item.unit_id).startsWith(rowLabel)).forEach(assignment => ifSetAssignmentPlan(assignment, planId));
    window._curIfExp.paint_plan_id = planId;
    ifSyncSampleAssignmentSummary(sample);
    renderIfCalc();
};

window.ifAssignPlateColumn = function(sampleIndex, colIndex, planId = ifCurrentPaintPlanId()) {
    ifSyncSamples();
    let sample = window._curIfExp?.samples?.[sampleIndex];
    let cfg = CONFIG?.plate_configs?.[ifDefaultPlateType(sample)];
    if (!sample || !cfg) return;
    let colNo = colIndex + 1;
    (sample.assignments || []).filter(item => item.unit_id.match(/\d+$/)?.[0] == colNo).forEach(assignment => ifSetAssignmentPlan(assignment, planId));
    window._curIfExp.paint_plan_id = planId;
    ifSyncSampleAssignmentSummary(sample);
    renderIfCalc();
};

function ifSyncSamples() {
    if (!window._curIfExp) return;
    document.querySelectorAll('.if-sample-row').forEach(row => {
        let index = parseInt(row.dataset.index);
        let sample = window._curIfExp.samples[index];
        if (!sample) return;
        row.querySelectorAll('.if-sample-input').forEach(input => {
            sample[input.dataset.field] = input.dataset.field === 'harvested_at' ? ifReadableDate(input.value) : input.value.trim();
        });
        ifEnsureSampleAssignments(sample);
    });
    window._curIfExp.sample_ids = (window._curIfExp.samples || []).map(s => s.sample_id).filter(Boolean);
}

window.ifSyncCurrent = function() {
    if (!window._curIfExp) return;
    ifSyncSamples();
    ifSyncAntibodyPlans();
    let protocol = ifResolveProtocol(document.getElementById('ifProtocolSelect')?.value || '');
    let firstPlan = window._curIfExp.antibody_plans?.[0] || {};
    window._curIfExp.name = document.getElementById('ifExpName')?.value.trim() || '';
    window._curIfExp.protocol_id = document.getElementById('ifProtocolSelect')?.value || '';
    window._curIfExp.protocol_name = protocol ? protocol.name : '默认 IF 流程';
    window._curIfExp.layout_mode = document.getElementById('ifLayoutMode')?.value || '切片';
    window._curIfExp.primary_antibody_id = firstPlan.primary_antibody_id || '';
    window._curIfExp.primary_antibody = firstPlan.primary_antibody || '';
    window._curIfExp.secondary_antibody_id = firstPlan.secondary_antibody_id || '';
    window._curIfExp.secondary_antibody = firstPlan.secondary_antibody || '';
    window._curIfExp.primary_antibody2_id = firstPlan.primary_antibody2_id || '';
    window._curIfExp.primary_antibody2 = firstPlan.primary_antibody2 || '';
    window._curIfExp.secondary_antibody2_id = firstPlan.secondary_antibody2_id || '';
    window._curIfExp.secondary_antibody2 = firstPlan.secondary_antibody2 || '';
    window._curIfExp.image_path = document.getElementById('ifImagePath')?.value.trim() || '';
    window._curIfExp.result = document.getElementById('ifResult')?.value.trim() || '';
    ifEnsureAllSamples();
};

window.ifSaveLog = async function(status) {
    if (!window._curIfExp) return;
    ifSyncCurrent();
    let exp = window._curIfExp;
    if (!exp.name) return showToast('需填写实验名称', 'error');
    if (status === '已完成' && (!exp.samples || !exp.samples.some(sample => sample.name))) return showToast('需添加至少一个样本', 'error');
    exp.status = status;
    let res = await fetch('/api/workflows/if/logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(exp) });
    let saved = await res.json();
    if (!res.ok) return showToast(saved.error || '保存失败', 'error');
    showToast(status === '已完成' ? 'IF 记录已完成' : 'IF 记录已暂存');
    window._curIfExp = status === '已完成' ? null : saved;
    await loadIfData();
};

window.ifEditLog = function(id) {
    let log = IF_STATE.logs.find(x => x.id === id);
    if (!log) return;
    window._curIfExp = JSON.parse(JSON.stringify(log));
    window._curIfExp.samples = window._curIfExp.samples || [];
    window._curIfExp.antibody_plans = ifNormalizeAntibodyPlans(window._curIfExp);
    if (!window._curIfExp.paint_plan_id) window._curIfExp.paint_plan_id = window._curIfExp.antibody_plans[0]?.id || '';
    ifEnsureAllSamples();
    window._curIfExp.steps = window._curIfExp.steps && window._curIfExp.steps.length ? window._curIfExp.steps : ifStepsFor(window._curIfExp.protocol_id);
    window._curIfExp.activeCheck = window._curIfExp.activeCheck || new Array(window._curIfExp.steps.length).fill(false);
    renderIfCalc();
};

window.ifDeleteLog = async function(id) {
    if (!confirm('确定删除该 IF 记录？')) return;
    await fetch(`/api/workflows/if/logs/${id}`, { method: 'DELETE' });
    showToast('已删除');
    await loadIfData();
};

window.renderIfLog = renderIfCalc;