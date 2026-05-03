/* ============================================================
   workflow_modules.js — 样本库、通用方案库、生信分析、其他实验
   ============================================================ */

const WORKFLOW_META = {
    animal: { label: '动物造模', icon: 'ti-vaccine', color: '#c87a3a' },
    if: { label: '免疫荧光', icon: 'ti-microscope', color: '#7c3aed' },
    bioinfo: { label: '生信分析', icon: 'ti-chart-dots-3', color: '#0a84ff' },
    other: { label: '其他实验', icon: 'ti-tool', color: '#629987' }
};

let WORKFLOW_STATE = {
    samples: [],
    protocols: { animal: [], if: [], bioinfo: [], other: [] },
    logs: { bioinfo: [], other: [] },
    otherFormOpen: false,
    sendoutFormOpen: false,
    primerAntibodyTab: 'antibody',
    primerFormOpen: false,
    antibodyFormOpen: false,
    reagentFormOpen: false
};

function wfLines(text) {
    return String(text || '').split('\n').map(s => s.trim()).filter(Boolean);
}

function wfSelectedValues(selector) {
    return Array.from(document.querySelectorAll(selector)).filter(x => x.checked).map(x => x.value);
}

async function wfFetchSamples() {
    let res = await fetch('/api/samples');
    WORKFLOW_STATE.samples = await res.json();
    return WORKFLOW_STATE.samples;
}

function wfSampleCheckboxes(name, selected = []) {
    if (!WORKFLOW_STATE.samples.length) {
        return '<div class="empty-state" style="padding:14px">无可用样本记录</div>';
    }
    return WORKFLOW_STATE.samples.map(s => {
        let checked = selected.includes(s.id) ? 'checked' : '';
        let tags = (s.tags || []).join(', ');
        return `
            <label class="sample-pick-item">
                <input type="checkbox" name="${name}" value="${s.id}" ${checked}>
                <span>
                    <b>${s.name}</b>
                    <small>${s.material_type || '-'} · ${s.preservation || '-'}${tags ? ' · ' + tags : ''}</small>
                </span>
            </label>`;
    }).join('');
}

function wfDateInput(value) {
    if (!value) return '';
    return String(value).substring(0, 16).replace(' ', 'T');
}

function wfReadableDate(value) {
    return value ? String(value).replace('T', ' ') : '';
}

function wfStructuredFromSample(sample) {
    return {
        sample_id: sample.id || '',
        name: wfSampleDisplayName(sample),
        alias_code: sample.alias_code || sample.sample_code || '',
        source: sample.source_label || sample.source_type || '样本库',
        group: sample.group || '',
        induction_scheme: sample.induction_scheme || sample.protocol_name || '',
        duration: sample.duration || sample.induction_days || sample.day || '',
        harvested_at: sample.harvested_at || sample.harvest_time || sample.created_at || '',
        material_type: sample.material_type || sample.tissue || ''
    };
}

const WF_ALIAS_PREFIX = { pcr: 'PN', qpcr: 'PQ', wb: 'WT', wb_run: 'WP', if: 'I', other: 'O', bio: 'O', send: 'O' };

function wfAliasPrefix(prefix = 'S') {
    let raw = String(prefix || 'S').trim().toUpperCase();
    if (['PN', 'PQ', 'WT', 'WP'].includes(raw)) return raw;
    if (raw.startsWith('P')) return 'P';
    if (raw.startsWith('W')) return 'W';
    if (raw.startsWith('I')) return 'I';
    if (raw.startsWith('O')) return 'O';
    if (raw.startsWith('B')) return 'O';
    return raw.charAt(0) || 'S';
}

function wfAliasDurationCode(sample = {}) {
    let raw = [sample.intervention_duration, sample.duration, sample.induction_days, sample.harvest_days, sample.day, sample.timepoint]
        .find(value => value != null && String(value).trim() !== '');
    if (raw == null) return '0D';
    let text = String(raw).trim();
    let dayMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:d|day|days|天)/i);
    if (dayMatch) return `${parseFloat(dayMatch[1]).toString()}D`;
    let hourMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hour|hours|小时)/i);
    if (hourMatch) return `${Math.max(0, Math.round(parseFloat(hourMatch[1]) / 24)).toString()}D`;
    if (/^\d+(?:\.\d+)?$/.test(text)) return `${parseFloat(text).toString()}D`;
    return '0D';
}

function wfAliasConditionLabel(sample = {}) {
    let fields = [sample.intervention_scheme, sample.induction_scheme, sample.protocol_name, sample.treatment, sample.treatment_group, sample.group]
        .map(value => String(value || '').trim())
        .filter(Boolean);
    return fields[0] || '对照组';
}

function wfAliasIsControl(label = '') {
    return /^(0|ctrl|control|normal|vehicle|sham)$/i.test(String(label).trim()) || /对照|空白|未处理|正常|溶媒|载体|假手术|control|ctrl|vehicle|sham|normal/i.test(label);
}

function wfAliasConditionKey(sample = {}) {
    let label = wfAliasConditionLabel(sample);
    if (wfAliasIsControl(label)) return 'control';
    return String(label).toLowerCase().replace(/[\s_\-，,;；:：()（）\[\]【】]+/g, '');
}

function wfAliasParse(code = '', prefix = '') {
    let p = wfAliasPrefix(prefix);
    let match = String(code || '').trim().toUpperCase().match(new RegExp(`^${p}(\\d+(?:\\.\\d+)?)D([0-9])-(\\d+)$`));
    return match ? { duration: `${parseFloat(match[1]).toString()}D`, condition: match[2], repeat: parseInt(match[3]) || 0 } : null;
}

function wfAliasNeedsScientificCode(code = '', prefix = '') {
    let p = wfAliasPrefix(prefix);
    let raw = String(code || '').trim().toUpperCase();
    if (!raw) return true;
    if (wfAliasParse(raw, p)) return false;
    return /^(PX|WX|IX|OX|BX|SX)?\d+$/.test(raw) || new RegExp(`^${p}X?\\d+$`).test(raw);
}

function wfBuildConditionMap(samples = [], prefix = 'S') {
    let map = new Map([['control', '0']]);
    let used = new Set(['0']);
    (samples || []).forEach(sample => {
        let parsed = wfAliasParse(sample.alias_code || sample.sample_code || '', prefix);
        let key = wfAliasConditionKey(sample);
        if (parsed && key !== 'control') {
            map.set(key, parsed.condition);
            used.add(parsed.condition);
        }
    });
    let next = 1;
    (samples || []).forEach(sample => {
        let key = wfAliasConditionKey(sample);
        if (map.has(key)) return;
        while (used.has(String(next)) && next < 9) next++;
        let code = String(Math.min(next, 9));
        map.set(key, code);
        used.add(code);
        if (next < 9) next++;
    });
    return map;
}

function wfSampleDisplayName(sample = {}) {
    return sample.display_name || sample.name || sample.sample_name || '未命名样本';
}

function wfSampleInterventionSummary(sample = {}) {
    let scheme = sample.intervention_scheme || sample.induction_scheme || sample.group || sample.treatment_group || '';
    let duration = sample.intervention_duration || sample.duration || sample.induction_days || sample.harvest_days || sample.day || '';
    if (duration && String(duration).replace('.', '').match(/^\d+$/)) duration = `${duration}d`;
    return [scheme, duration].filter(Boolean).join(' · ') || '未记录干预信息';
}

function wfSampleMetaSummary(sample = {}) {
    return [wfSampleInterventionSummary(sample), sample.material_type || sample.sample_category, sample.tissue || sample.body_part, sample.preservation, sample.harvested_at || sample.harvest_time]
        .filter(Boolean).join(' · ');
}

function wfSampleCollectionGroup(sample = {}) {
    let id = sample.collection_id || sample.group_record_id || sample.source_id || sample.source_label || sample.source_type || 'direct';
    let name = sample.collection_name || sample.source_label || sample.source_type || '直接登记样本';
    return { id: String(id), name };
}

function wfAssignSampleAliases(samples = [], prefix = 'S') {
    let aliasPrefix = wfAliasPrefix(prefix);
    let conditionMap = wfBuildConditionMap(samples, aliasPrefix);
    let repeatMap = new Map();
    let used = new Set();
    (samples || []).forEach(sample => {
        let parsed = wfAliasParse(sample.alias_code || sample.sample_code || '', aliasPrefix);
        if (!parsed) return;
        let key = `${parsed.duration}|${parsed.condition}`;
        repeatMap.set(key, Math.max(repeatMap.get(key) || 0, parsed.repeat));
    });
    return (samples || []).map(sample => {
        let copy = sample;
        let existingRaw = String(copy.alias_code || copy.sample_code || '').trim();
        let existing = existingRaw.toUpperCase();
        let parsed = wfAliasParse(existing, aliasPrefix);
        if (parsed && !used.has(existing)) {
            used.add(existing);
            copy.alias_code = existing;
            return copy;
        }
        if (existingRaw && !wfAliasNeedsScientificCode(existingRaw, aliasPrefix) && !used.has(existingRaw)) {
            used.add(existingRaw);
            copy.alias_code = existingRaw;
            return copy;
        }
        let duration = wfAliasDurationCode(copy);
        let condition = conditionMap.get(wfAliasConditionKey(copy)) || '0';
        let key = `${duration}|${condition}`;
        let repeat = repeatMap.get(key) || 0;
        let code = '';
        do {
            repeat += 1;
            code = `${aliasPrefix}${duration}${condition}-${repeat}`;
        } while (used.has(code));
        repeatMap.set(key, repeat);
        used.add(code);
        copy.alias_code = code;
        return copy;
    });
}

function wfNextAliasCode(prefix, containerSelector) {
    let aliasPrefix = wfAliasPrefix(prefix);
    let used = new Set(Array.from(document.querySelectorAll(`${containerSelector} [data-field="alias_code"]`)).map(input => input.value.trim()).filter(Boolean));
    let index = 1;
    while (used.has(`${aliasPrefix}0D0-${index}`)) index++;
    return `${aliasPrefix}0D0-${index}`;
}

function wfGroupSamples(samples = []) {
    let map = new Map();
    (samples || []).forEach(sample => {
        let group = wfSampleCollectionGroup(sample);
        if (!map.has(group.id)) map.set(group.id, { id: group.id, name: group.name, samples: [] });
        map.get(group.id).samples.push(sample);
    });
    return Array.from(map.values());
}

window.wfOpenSampleGroupPicker = function(options = {}) {
    let samples = (options.samples || WORKFLOW_STATE.samples || []).filter(options.filter || (() => true));
    let groups = wfGroupSamples(samples);
    if (!groups.length) return showToast(options.emptyText || '没有可导入的样本', 'warning');
    window._wfSamplePicker = { ...options, groups, groupIndex: 0, selectedIds: new Set((options.selectedIds || []).map(String)) };
    wfOpenSheet(options.modalId || 'wfSampleGroupPickerModal', options.title || '导入样本', `
        <div class="form-group"><label class="form-label">样本组</label><select class="form-select" id="wfSamplePickerGroup" onchange="wfSamplePickerRenderGroup(parseInt(this.value))">
            ${groups.map((group, index) => `<option value="${index}">${group.name} (${group.samples.length}样)</option>`).join('')}
        </select></div>
        ${options.allowMultiGroup ? '<div class="sample-lineage-chip" style="margin-bottom:8px;display:inline-flex;">可跨样本组连续勾选</div>' : ''}
        <div id="wfSamplePickerBody"></div>
        <div style="display:flex;gap:8px;margin-top:12px;">
            <button class="btn btn-secondary" style="flex:1" onclick="wfSamplePickerToggleAll(true)"><i class="ti ti-checks"></i> 全选</button>
            <button class="btn btn-secondary" style="flex:1" onclick="wfSamplePickerToggleAll(false)"><i class="ti ti-square"></i> 清空</button>
            <button class="btn btn-primary" style="flex:1.4" onclick="wfSamplePickerImport()"><i class="ti ti-database-import"></i> 导入样本</button>
        </div>`);
    wfSamplePickerRenderGroup(0);
};

window.wfSamplePickerRenderGroup = function(index = 0) {
    let picker = window._wfSamplePicker;
    if (!picker) return;
    let prevIndex = picker.groupIndex;
    wfSamplePickerSyncVisible();
    if (!picker.allowMultiGroup && index !== prevIndex) picker.selectedIds.clear();
    picker.groupIndex = index;
    let group = picker.groups[index] || picker.groups[0];
    let body = document.getElementById('wfSamplePickerBody');
    if (!body || !group) return;
    body.innerHTML = `<div class="sample-pick-list sample-group-pick-list">
        ${group.samples.map(sample => `<label class="sample-pick-item sample-group-pick-item">
            <input type="checkbox" name="wfSamplePickerItem" value="${sample.id}" ${picker.selectedIds.has(String(sample.id)) ? 'checked' : ''} onchange="wfSamplePickerRemember(this)">
            <span><b>${wfSampleDisplayName(sample)}</b><small>${wfSampleMetaSummary(sample)}</small></span>
        </label>`).join('')}
    </div>`;
};

window.wfSamplePickerRemember = function(input) {
    let picker = window._wfSamplePicker;
    if (!picker || !input) return;
    let id = String(input.value);
    if (input.checked) picker.selectedIds.add(id);
    else picker.selectedIds.delete(id);
};

function wfSamplePickerSyncVisible() {
    let picker = window._wfSamplePicker;
    if (!picker) return;
    document.querySelectorAll('input[name="wfSamplePickerItem"]').forEach(input => wfSamplePickerRemember(input));
}

window.wfSamplePickerToggleAll = function(checked) {
    document.querySelectorAll('input[name="wfSamplePickerItem"]').forEach(input => { input.checked = checked; wfSamplePickerRemember(input); });
};

window.wfSamplePickerImport = function() {
    let picker = window._wfSamplePicker;
    if (!picker) return;
    wfSamplePickerSyncVisible();
    let group = picker.groups[picker.groupIndex] || picker.groups[0];
    let selectedIds = picker.selectedIds;
    let selectedGroups = picker.groups.map(group => ({ ...group, samples: (group.samples || []).filter(sample => selectedIds.has(String(sample.id))) })).filter(group => group.samples.length);
    let selected = selectedGroups.flatMap(group => group.samples);
    if (!selected.length) return showToast('请先勾选样本', 'warning');
    if (typeof picker.onImport === 'function') picker.onImport(selected, picker.allowMultiGroup ? selectedGroups : group);
    document.querySelectorAll('input[name="wfSamplePickerItem"]').forEach(input => { input.checked = false; });
    wfCloseSheet(picker.modalId || 'wfSampleGroupPickerModal');
    window._wfSamplePicker = null;
    showToast(`已导入 ${selected.length} 个样本`);
};

function wfLineageScalar(value) {
    if (value == null || value === '') return '';
    if (typeof value === 'object') return '';
    return String(value);
}

function wfLineageRecordHtml(value, depth = 0) {
    if (value == null || value === '') return '';
    if (Array.isArray(value)) {
        let rows = value.slice(0, 12).map((item, index) => `<div class="sample-lineage-record-row"><b>#${index + 1}</b>${wfLineageRecordHtml(item, depth + 1)}</div>`).join('');
        return rows || '';
    }
    if (typeof value === 'object') {
        let entries = Object.entries(value).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length));
        if (!entries.length) return '';
        return `<div class="sample-lineage-record-grid ${depth ? 'nested' : ''}">${entries.map(([key, v]) => {
            let scalar = wfLineageScalar(v);
            if (scalar) return `<div><span>${key}</span><b>${scalar}</b></div>`;
            return `<div class="sample-lineage-record-wide"><span>${key}</span>${wfLineageRecordHtml(v, depth + 1)}</div>`;
        }).join('')}</div>`;
    }
    return `<b>${String(value)}</b>`;
}

window.wfOpenSampleLineage = async function(sampleId) {
    let res = await fetch(`/api/samples/${sampleId}/lineage`);
    let data = await res.json();
    if (!res.ok) return showToast(data.error || '无法读取样本溯源', 'error');
    let sample = data.sample || {};
    let events = data.events || [];
    wfOpenSheet('sampleLineageModal', `样本溯源 · ${wfSampleDisplayName(sample)}`, `
        <div class="sample-lineage-head">
            <b>${wfSampleDisplayName(sample)}</b>
            <span>${wfSampleMetaSummary(sample)}</span>
        </div>
        <div class="sample-lineage-list">
            ${events.map(event => `<details class="sample-lineage-item">
                <summary>
                    <div class="sample-lineage-dot"></div>
                    <div><b>${event.stage} · ${event.title}</b><small>${[event.record_name, event.time].filter(Boolean).join(' · ') || '-'}</small></div>
                </summary>
                <div class="sample-lineage-record">${(typeof buildRecordDetailHTML === 'function' && event.record_type) ? buildRecordDetailHTML(event.record_type, event.record_detail || {}) : wfLineageRecordHtml(event.record_detail)}</div>
            </details>`).join('') || '<div class="empty-state" style="padding:12px">暂无可追溯事件</div>'}
        </div>`);
};

window.wfOpenStructuredSamplePicker = function(prefix) {
    let aliasPrefix = WF_ALIAS_PREFIX[prefix] || 'S';
    wfOpenSampleGroupPicker({
        title: '导入样本',
        aliasPrefix,
        onImport(selected) {
            let existing = wfReadStructuredSamples(prefix);
            let rows = selected.map(sample => wfStructuredFromSample(sample));
            let assigned = wfAssignSampleAliases([...existing, ...rows], aliasPrefix).slice(existing.length);
            assigned.forEach(row => wfAddStructuredSampleRow(prefix, row));
        }
    });
};

const SAMPLE_CATEGORY_OPTIONS = ['RNA', 'cDNA', '蛋白', '变性蛋白', '固定', '蜡块', '切片'];
const SAMPLE_SOURCE_OPTIONS = ['细胞', '动物', '患者', '其他'];

function wfSampleCategory(sample) {
    let raw = [sample.sample_category, sample.material_category, sample.material_type].filter(Boolean).join(' ').toLowerCase();
    if (raw.includes('cdna')) return 'cDNA';
    if (raw.includes('变性')) return '变性蛋白';
    if (raw.includes('rna')) return 'RNA';
    if (raw.includes('蛋白') || raw.includes('protein')) return '蛋白';
    if (raw.includes('蜡') || raw.includes('paraffin') || raw.includes('block')) return '蜡块';
    if (raw.includes('切片') || raw.includes('section') || raw.includes('slide')) return '切片';
    if (raw.includes('固定') || raw.includes('fixed') || raw.includes('pfa') || raw.includes('formalin')) return '固定';
    return sample.sample_category || sample.material_category || sample.material_type || '其他';
}

window.wfJumpToSample = async function(sampleId) {
    if (!sampleId) return;
    if (typeof openModule === 'function') openModule('samples');
    if (!WORKFLOW_STATE.samples.length) await wfFetchSamples();
    let sample = WORKFLOW_STATE.samples.find(item => item.id === sampleId || item.sample_id === sampleId);
    if (sample) {
        window._sampleLibraryCategory = wfSampleCategory(sample);
        renderSampleLibrary();
        setTimeout(() => {
            let escapedId = window.CSS && CSS.escape ? CSS.escape(sample.id) : String(sample.id).replace(/"/g, '\\"');
            let row = document.querySelector(`[data-sample-id="${escapedId}"]`);
            if (row) {
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                row.classList.add('sample-row-highlight');
                setTimeout(() => row.classList.remove('sample-row-highlight'), 1600);
            }
        }, 80);
    } else if (typeof showToast === 'function') {
        showToast('没有在样本库中找到该样本', 'warning');
    }
};

function wfSampleSourceCategory(sample) {
    let raw = [sample.source_category, sample.source_type, sample.source_label].filter(Boolean).join(' ');
    if (raw.includes('细胞')) return '细胞';
    if (raw.includes('动物')) return '动物';
    if (raw.includes('患者')) return '患者';
    return '其他';
}

function wfSampleCollectionKey(sample) {
    return sample.collection_id || sample.group_record_id || sample.source_id || sample.source_label || sample.source_type || '直接登记';
}

function wfSampleCollectionName(sample) {
    return sample.collection_name || sample.source_label || sample.source_type || '直接登记';
}

function wfFixedSampleOptions() {
    let fixed = (WORKFLOW_STATE.samples || []).filter(sample => wfSampleCategory(sample) === '固定');
    if (!fixed.length) return '<option value="">暂无固定样本</option>';
    return fixed.map(sample => `<option value="${sample.id}">${sample.name} · ${sample.source_label || '-'} · ${sample.tissue || sample.body_part || '-'}</option>`).join('');
}

function wfSlideFormatOptions(selected = 'single') {
    return [
        { value: 'single', label: '单个切片' },
        { value: 'double', label: '1玻片2切片' }
    ].map(item => `<option value="${item.value}" ${item.value === selected ? 'selected' : ''}>${item.label}</option>`).join('');
}

function wfSlideSectionsFromFormat(format) {
    return format === 'double' ? 2 : 1;
}

function wfSampleSlideFormatLabel(sample) {
    if (wfSampleCategory(sample) !== '切片') return '';
    let raw = String(sample.slide_format || sample.section_layout || sample.slice_layout || sample.sections_per_slide || '').toLowerCase();
    return /double|two|2|双|两|二/.test(raw) ? '1玻片2切片' : '单个切片';
}

function wfStructuredSampleEditor(prefix) {
    let aliasPrefix = WF_ALIAS_PREFIX[prefix] || 'S';
    return `
        <div class="form-row" style="margin-top:8px;">
            <div class="form-group"><button class="btn btn-secondary btn-block" onclick="wfOpenStructuredSamplePicker('${prefix}')"><i class="ti ti-database-import"></i> 导入样本</button></div>
            <div class="form-group"><button class="btn btn-secondary btn-block" onclick="wfAddStructuredSampleRow('${prefix}')"><i class="ti ti-plus"></i> 手动添加样本</button></div>
        </div>
        <div class="rt-table-wrapper">
            <table class="rt-table wf-structured-sample-table"><thead><tr><th>代号</th><th>操作</th><th>样本</th><th>造模/干预信息</th><th>来源</th><th>组别</th><th>诱导方案</th><th>时长</th><th>收样时间</th><th>材料</th></tr></thead><tbody id="${prefix}StructuredTbody" data-alias-prefix="${aliasPrefix}"></tbody></table>
        </div>`;
}

window.wfImportStructuredSample = function(prefix) {
    let id = document.getElementById(`${prefix}ImportSample`)?.value;
    let sample = WORKFLOW_STATE.samples.find(s => s.id === id);
    if (!sample) return showToast('需选择样本库记录', 'error');
    wfAddStructuredSampleRow(prefix, wfStructuredFromSample(sample));
};

window.wfAddStructuredSampleRow = function(prefix, existing = null) {
    let tbody = document.getElementById(`${prefix}StructuredTbody`);
    if (!tbody) return;
    let aliasPrefix = tbody.dataset.aliasPrefix || WF_ALIAS_PREFIX[prefix] || 'S';
    let sample = existing || { name: '', source: '', group: '', induction_scheme: '', duration: '', harvested_at: '', material_type: '' };
    if (!sample.alias_code) sample.alias_code = wfNextAliasCode(aliasPrefix, `#${prefix}StructuredTbody`);
    let tr = document.createElement('tr');
    tr.dataset.sampleId = sample.sample_id || '';
    tr.innerHTML = `
        <td><input class="rt-input ${prefix}-structured-input sample-code-input" data-field="alias_code" value="${sample.alias_code || ''}" placeholder="${wfAliasPrefix(aliasPrefix)}0D0-1"></td>
        <td><button class="btn btn-sm btn-danger" onclick="this.closest('tr').remove()"><i class="ti ti-minus"></i></button></td>
        <td><input class="rt-input ${prefix}-structured-input" data-field="name" value="${sample.name || ''}" placeholder="样本名"></td>
        <td><span class="sample-lineage-chip">${wfSampleInterventionSummary(sample)}</span></td>
        <td><input class="rt-input ${prefix}-structured-input" data-field="source" value="${sample.source || ''}" placeholder="来源"></td>
        <td><input class="rt-input ${prefix}-structured-input" data-field="group" value="${sample.group || ''}" placeholder="组别"></td>
        <td><input class="rt-input ${prefix}-structured-input" data-field="induction_scheme" value="${sample.induction_scheme || ''}" placeholder="诱导方案"></td>
        <td><input class="rt-input ${prefix}-structured-input" data-field="duration" value="${sample.duration || ''}" placeholder="7d"></td>
        <td><input type="datetime-local" class="rt-input ${prefix}-structured-input" data-field="harvested_at" value="${wfDateInput(sample.harvested_at)}"></td>
        <td><input class="rt-input ${prefix}-structured-input" data-field="material_type" value="${sample.material_type || ''}" placeholder="材料"></td>`;
    tbody.appendChild(tr);
};

function wfReadStructuredSamples(prefix) {
    let rows = [];
    document.querySelectorAll(`#${prefix}StructuredTbody tr`).forEach(tr => {
        let sample = { sample_id: tr.dataset.sampleId || '' };
        tr.querySelectorAll(`.${prefix}-structured-input`).forEach(input => {
            sample[input.dataset.field] = input.dataset.field === 'harvested_at' ? wfReadableDate(input.value) : input.value.trim();
        });
        if (sample.name) rows.push(sample);
    });
    return rows;
}

function wfProtocolOptions(module, selectedId = '') {
    let protocols = WORKFLOW_STATE.protocols[module] || [];
    if (!protocols.length) return '<option value="">未配置方案</option>';
    return protocols.map(p => `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${p.name}</option>`).join('');
}

function wfResolveProtocol(module, id) {
    return (WORKFLOW_STATE.protocols[module] || []).find(p => p.id === id) || null;
}

function wfNormalizeStepTimers(timers, length) {
    if (typeof labTimerNormalizeList === 'function') return labTimerNormalizeList(timers, length);
    let source = Array.isArray(timers) ? timers : [];
    return Array.from({ length }, (_, index) => Math.max(0, Math.round(Number(source[index] || 0))));
}

function wfBuildEditableSteps(module, protocolId, className, checked = []) {
    let proto = wfResolveProtocol(module, protocolId);
    let steps = proto ? (proto.steps || []) : [];
    let timers = wfNormalizeStepTimers(proto ? proto.step_timers : [], steps.length);
    if (!steps.length) return '<div class="empty-state" style="padding:12px">该方案未配置流程步骤</div>';
    return `<div class="step-list">${steps.map((step, i) => {
        let key = `${className}:${i}`;
        let label = `Step ${i + 1} · ${step}`;
        return `
        <div class="step-item ${checked[i] ? 'checked' : ''}" id="${protocolSafe(`${className}Item_${i}`)}">
            <label class="step-item-main">
                <input type="checkbox" class="step-checkbox ${className}" ${checked[i] ? 'checked' : ''} onchange="labTimerHandleStepCheck('${protocolJsAttr(key)}', ${timers[i]}, '${protocolJsAttr(label)}', this.checked);this.closest('.step-item').classList.toggle('checked', this.checked)">
                <span><b>Step ${i + 1}.</b> ${protocolSafe(step)}</span>
            </label>
            ${typeof labTimerWidgetHtml === 'function' ? labTimerWidgetHtml(key, timers[i], label) : ''}
        </div>`;
    }).join('')}</div>`;
}

function wfBuildReadonlySteps(steps, checks, timers = []) {
    return buildReadonlyWorkflowSteps(steps, checks, '操作步骤', timers);
}

window.loadSampleLibrary = async function() {
    await wfFetchSamples();
    renderSampleLibrary();
};

function wfOpenSheet(id, title, bodyHtml) {
    if (typeof uiOpenSheet === 'function') return uiOpenSheet(id, title, bodyHtml);
}

window.wfCloseSheet = function(id) {
    if (typeof uiCloseSheet === 'function') return uiCloseSheet(id);
};

function wfManualSampleForm(activeCategory) {
    let slideFormatField = activeCategory === '切片'
        ? `<div class="form-row"><div class="form-group"><label class="form-label">切片版式</label><select class="form-select" id="sampleSlideFormat">${wfSlideFormatOptions('single')}</select></div><div class="form-group"><label class="form-label">玻片编号</label><input class="form-input" id="sampleSlideId" placeholder="Slide-1"></div></div>`
        : '';
    return `
        <div class="form-row">
            <div class="form-group"><label class="form-label">样本名称</label><input class="form-input" id="sampleName" placeholder="M1 liver RNA"></div>
            <div class="form-group"><label class="form-label">材料类型</label><select class="form-select" id="sampleType">${SAMPLE_CATEGORY_OPTIONS.map(cat => `<option ${cat === activeCategory ? 'selected' : ''}>${cat}</option>`).join('')}</select></div>
        </div>
        ${slideFormatField}
        <div class="form-row">
            <div class="form-group"><label class="form-label">来源类型</label><select class="form-select" id="sampleSourceCategory">${SAMPLE_SOURCE_OPTIONS.map(x => `<option>${x}</option>`).join('')}</select></div>
            <div class="form-group"><label class="form-label">来源记录</label><input class="form-input" id="sampleSource" placeholder="动物取材 / 细胞造模 / 患者取材"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">部位/孔位</label><input class="form-input" id="sampleTissue" placeholder="主动脉 / A1 / 肝"></div>
            <div class="form-group"><label class="form-label">保存位置</label><input class="form-input" id="samplePres" placeholder="-80C A盒 / 4% PFA"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">组别</label><input class="form-input" id="sampleGroup" placeholder="Control / Model"></div>
            <div class="form-group"><label class="form-label">诱导方案</label><input class="form-input" id="sampleInduction" placeholder="高脂饮食 / TGF-b"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">处理时长</label><input class="form-input" id="sampleDuration" placeholder="7d / 24h"></div>
            <div class="form-group"><label class="form-label">收样时间</label><input type="datetime-local" class="form-input" id="sampleHarvestedAt"></div>
        </div>
        <div class="form-group"><label class="form-label">用途标签</label><input class="form-input" id="sampleTags" placeholder="qPCR, WB, IF, RNA-seq"></div>
        <div class="form-group"><label class="form-label">备注</label><textarea class="form-textarea" id="sampleNote" rows="2"></textarea></div>
        <button class="btn btn-primary btn-block" onclick="saveManualSample()"><i class="ti ti-device-floppy"></i> 保存样本</button>`;
}

window.openManualSampleForm = function(category = '') {
    let activeCategory = category || window._sampleLibraryCategory || 'RNA';
    window._sampleLibraryCreating = activeCategory;
    window._sampleLibraryDerivedCategory = '';
    renderSampleLibrary();
};

function wfDerivedSampleForm(category) {
    let slideFormatField = category === '切片'
        ? `<div class="form-row"><div class="form-group"><label class="form-label">切片版式</label><select class="form-select" id="derivedSlideFormat">${wfSlideFormatOptions('single')}</select></div><div class="form-group"><label class="form-label">玻片编号前缀</label><input class="form-input" id="derivedSlideIdPrefix" placeholder="Slide"></div></div>`
        : '';
    return `
        <div class="form-row">
            <div class="form-group"><label class="form-label">固定样本</label><select class="form-select" id="fixedSourceSample">${wfFixedSampleOptions()}</select></div>
            <div class="form-group"><label class="form-label">生成数量</label><input type="number" class="form-input" id="derivedSampleQty" value="1" min="1"></div>
        </div>
        ${slideFormatField}
        <div class="form-row">
            <div class="form-group"><label class="form-label">命名前缀</label><input class="form-input" id="derivedSamplePrefix" placeholder="默认使用固定样本名"></div>
            <div class="form-group"><label class="form-label">保存位置</label><input class="form-input" id="derivedSamplePres" placeholder="蜡块盒 / 切片盒"></div>
        </div>
            <button class="btn btn-primary btn-block" onclick="saveDerivedSampleFromFixed('${category}')"><i class="ti ti-device-floppy"></i> 保存记录</button>`;
        }

        window.openDerivedSampleForm = function(category) {
            window._sampleLibraryDerivedCategory = category;
            window._sampleLibraryCreating = '';
            renderSampleLibrary();
};

function renderSampleLibrary() {
    let container = document.getElementById('sampleLibraryView');
    if (!container) return;
    let activeCategory = window._sampleLibraryCategory || 'RNA';
    let tabs = SAMPLE_CATEGORY_OPTIONS.map(cat => `<button class="tab-btn ${cat === activeCategory ? 'active' : ''}" onclick="window._sampleLibraryCategory='${cat}';window._sampleLibraryCreating='';window._sampleLibraryDerivedCategory='';renderSampleLibrary()">${cat}</button>`).join('');
    let manualOpen = window._sampleLibraryCreating === activeCategory;
    let derivedOpen = window._sampleLibraryDerivedCategory === activeCategory;
    let manualButton = manualOpen ? '' : `<button class="btn btn-primary btn-block" onclick="openManualSampleForm('${activeCategory}')"><i class="ti ti-plus"></i> 登记${activeCategory}样本</button>`;
    let derivedButton = ['蜡块', '切片'].includes(activeCategory) && !derivedOpen ? `<button class="btn btn-secondary btn-block" onclick="openDerivedSampleForm('${activeCategory}')"><i class="ti ti-arrow-fork"></i> 由固定样本生成${activeCategory}</button>` : '';
    let manualPanel = manualOpen ? `<div class="inline-form-panel form-drop-enter"><div class="inline-form-head"><b>登记${activeCategory}样本</b><button class="btn btn-sm btn-secondary" onclick="window._sampleLibraryCreating='';renderSampleLibrary()"><i class="ti ti-x"></i></button></div>${wfManualSampleForm(activeCategory)}</div>` : '';
    let derivedPanel = derivedOpen ? `<div class="inline-form-panel form-drop-enter"><div class="inline-form-head"><b>由固定样本生成${activeCategory}</b><button class="btn btn-sm btn-secondary" onclick="window._sampleLibraryDerivedCategory='';renderSampleLibrary()"><i class="ti ti-x"></i></button></div>${wfDerivedSampleForm(activeCategory)}</div>` : '';
    let buildSections = (category) => SAMPLE_SOURCE_OPTIONS.map(source => {
        let filtered = WORKFLOW_STATE.samples.filter(sample => wfSampleCategory(sample) === category);
        let sourceSamples = filtered.filter(sample => wfSampleSourceCategory(sample) === source);
        if (!sourceSamples.length) return `<div style="margin-top:12px"><div class="section-subtitle" style="font-weight:700">${source}</div><div class="empty-state" style="padding:12px">暂无${source}${category}样本</div></div>`;
        let grouped = new Map();
        sourceSamples.forEach(sample => {
            let key = wfSampleCollectionKey(sample);
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(sample);
        });
        let cards = Array.from(grouped.entries()).map(([key, items]) => {
            let first = items[0] || {};
            let rows = items.map(sample => `
                <div class="sample-row sample-library-row" data-sample-id="${sample.id}" onclick="wfOpenSampleLineage('${sample.id}')" title="查看样本全流程溯源">
                    <div><b>${wfSampleDisplayName(sample)}</b><small>${[wfSampleSlideFormatLabel(sample), sample.slide_id, wfSampleInterventionSummary(sample), sample.tissue || sample.body_part, sample.preservation, sample.harvested_at].filter(Boolean).join(' · ') || '-'}</small></div>
                    <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteSample('${sample.id}')"><i class="ti ti-x"></i></button>
                </div>`).join('');
            return `<details class="card sample-group-card" style="margin-top:8px;">
                <summary style="cursor:pointer;font-weight:700;list-style:none;display:flex;justify-content:space-between;gap:8px;align-items:center;">
                    <span><i class="ti ti-folder"></i> ${wfSampleCollectionName(first)}</span>
                    <span class="badge badge-info">${items.length} 样</span>
                </summary>
                <div style="margin-top:10px">${rows}</div>
            </details>`;
        }).join('');
        return `<div style="margin-top:14px"><div class="section-subtitle" style="font-weight:700">${source}</div>${cards}</div>`;
    }).join('');
    let sections = buildSections(activeCategory);
    if (activeCategory === 'RNA') {
        sections += `<div class="divider"></div><div class="section-title"><i class="ti ti-test-pipe"></i> cDNA</div>${buildSections('cDNA')}`;
    }
    if (activeCategory === '蛋白') {
        sections += `<div class="divider"></div><div class="section-title"><i class="ti ti-vial"></i> 变性蛋白</div>${buildSections('变性蛋白')}`;
    }

    container.innerHTML = `
        <div class="card">
            <div class="card-header"><i class="ti ti-database-plus"></i> 样本入库</div>
            <div class="sample-action-grid">
                ${manualButton}
                ${derivedButton}
            </div>
            ${manualPanel}
            ${derivedPanel}
        </div>
        <div class="section-title"><i class="ti ti-database"></i> 样本清单</div>
        <div class="tabs scrollable-tabs" style="margin-top:8px">${tabs}</div>
        ${sections}`;
}

window.saveDerivedSampleFromFixed = async function(category) {
    let sourceId = document.getElementById('fixedSourceSample')?.value;
    let source = (WORKFLOW_STATE.samples || []).find(sample => sample.id === sourceId);
    if (!source) return showToast('需选择固定样本', 'error');
    let qty = Math.max(1, parseInt(document.getElementById('derivedSampleQty')?.value) || 1);
    let prefix = document.getElementById('derivedSamplePrefix')?.value.trim() || source.name;
    let preservation = document.getElementById('derivedSamplePres')?.value.trim();
    let slideFormat = document.getElementById('derivedSlideFormat')?.value || '';
    let slideIdPrefix = document.getElementById('derivedSlideIdPrefix')?.value.trim() || 'Slide';
    for (let i = 1; i <= qty; i++) {
        let payload = {
            ...source,
            id: undefined,
            name: qty > 1 ? `${prefix}-${i}` : `${prefix}-${category}`,
            sample_category: category,
            material_category: category,
            material_type: category,
            source_type: `固定样本转${category}`,
            source_id: source.id,
            source_label: source.name,
            collection_id: source.collection_id || source.id,
            collection_name: `${source.collection_name || source.source_label || source.name} 派生${category}`,
            preservation,
            status: '可用'
        };
        if (category === '切片') {
            payload.slide_format = slideFormat || 'single';
            payload.sections_per_slide = wfSlideSectionsFromFormat(payload.slide_format);
            payload.slide_id = qty > 1 ? `${slideIdPrefix}-${i}` : slideIdPrefix;
        }
        await fetch('/api/samples', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    }
    window._sampleLibraryDerivedCategory = '';
    showToast(`${category}记录已生成`);
    await loadSampleLibrary();
};

window.saveManualSample = async function() {
    let name = document.getElementById('sampleName').value.trim();
    if (!name) return showToast('需填写样本名称', 'error');
    let tags = document.getElementById('sampleTags').value.split(',').map(x => x.trim()).filter(Boolean);
    let materialType = document.getElementById('sampleType').value;
    let slideFormat = document.getElementById('sampleSlideFormat')?.value || '';
    let payload = {
        name,
        material_type: materialType,
        sample_category: materialType,
        material_category: materialType,
        source_category: document.getElementById('sampleSourceCategory').value,
        source_type: document.getElementById('sampleSource').value.trim() || '直接登记',
        source_label: document.getElementById('sampleSource').value.trim() || '直接登记',
        collection_name: document.getElementById('sampleSource').value.trim() || '直接登记',
        tissue: document.getElementById('sampleTissue').value.trim(),
        group: document.getElementById('sampleGroup').value.trim(),
        induction_scheme: document.getElementById('sampleInduction').value.trim(),
        duration: document.getElementById('sampleDuration').value.trim(),
        harvested_at: (document.getElementById('sampleHarvestedAt').value || '').replace('T', ' '),
        preservation: document.getElementById('samplePres').value.trim(),
        tags,
        status: '可用',
        notes: document.getElementById('sampleNote').value.trim()
    };
    if (materialType === '切片') {
        payload.slide_format = slideFormat || 'single';
        payload.sections_per_slide = wfSlideSectionsFromFormat(payload.slide_format);
        payload.slide_id = document.getElementById('sampleSlideId')?.value.trim() || name;
    }
    await fetch('/api/samples', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    window._sampleLibraryCreating = '';
    showToast('样本已保存');
    await loadSampleLibrary();
};

window.deleteSample = async function(id) {
    let warning = '确定删除该样本？';
    try {
        let res = await fetch(`/api/samples/${id}/lineage`);
        if (res.ok) {
            let data = await res.json();
            let used = (data.events || []).filter(event => event.stage === '下游使用');
            if (used.length) warning = `该样本已有 ${used.length} 条下游实验记录，删除后历史记录仍会保留但样本库不再可追溯。确定删除？`;
        }
    } catch (e) {}
    if (!confirm(warning)) return;
    await fetch(`/api/samples/${id}`, { method: 'DELETE' });
    showToast('样本已删除');
    await loadSampleLibrary();
};

window.loadWorkflowProtocols = async function() {
    let modules = Object.keys(WORKFLOW_META);
    let responses = await Promise.all(modules.map(m => fetch(`/api/workflows/${m}/protocols`)));
    for (let i = 0; i < modules.length; i++) WORKFLOW_STATE.protocols[modules[i]] = await responses[i].json();
    renderWorkflowProtocols();
    if (typeof renderProtocolLibraryHub === 'function') renderProtocolLibraryHub();
};

function renderWorkflowProtocols() {
    let container = document.getElementById('workflowProtocolsContainer');
    if (!container) return;
    let activeModule = window._workflowProtocolModule || '';
    if (!activeModule) {
        let cards = Object.keys(WORKFLOW_META).map(module => {
            let meta = WORKFLOW_META[module];
            let count = (WORKFLOW_STATE.protocols[module] || []).length;
            return `<button class="protocol-category-entry" onclick="window._workflowProtocolModule='${module}';renderWorkflowProtocols()">
                <span><i class="ti ${meta.icon}" style="color:${meta.color}"></i> ${meta.label}方案</span>
                <b>${count} 条</b>
            </button>`;
        }).join('');
        container.innerHTML = `<div class="card">
            <div class="card-header"><i class="ti ti-list-check"></i> 通用实验方案库</div>
            <div class="protocol-category-grid">${cards}</div>
        </div>`;
        return;
    }

    let groups = [activeModule].map(module => {
        let meta = WORKFLOW_META[module];
        let items = (WORKFLOW_STATE.protocols[module] || []).length === 0 ? '<div class="empty-state">暂无方案</div>' : WORKFLOW_STATE.protocols[module].map(p => `
            <div class="list-item" style="padding:8px;margin-top:6px;align-items:flex-start;">
                <div class="list-item-content">
                    <div class="list-item-title" style="font-size:13px;font-weight:600">${p.name}</div>
                    <div class="list-item-subtitle">${(p.steps || []).length} 个步骤${p.note ? ' · ' + p.note : ''}</div>
                </div>
                <div style="display:flex;gap:4px;">
                    <button class="btn btn-sm btn-secondary" onclick="editWorkflowProtocol('${module}','${p.id}')"><i class="ti ti-pencil"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="deleteWorkflowProtocol('${module}','${p.id}')"><i class="ti ti-x"></i></button>
                </div>
            </div>`).join('');
        return `<div style="margin-top:14px"><div class="section-subtitle" style="font-weight:700;color:${meta.color}"><i class="ti ${meta.icon}"></i> ${meta.label}</div>${items}</div>`;
    }).join('');

    container.innerHTML = `
        <div class="card">
            <div class="card-header" style="justify-content:space-between;">
                <span><i class="ti ${WORKFLOW_META[activeModule].icon}"></i> ${WORKFLOW_META[activeModule].label}方案</span>
                <button class="btn btn-sm btn-secondary" onclick="window._workflowProtocolModule='';renderWorkflowProtocols()"><i class="ti ti-chevron-left"></i> 返回分类</button>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">模块类型</label><select class="form-select" id="wfProtoModule"><option value="${activeModule}">${WORKFLOW_META[activeModule].label}</option></select></div>
                <div class="form-group"><label class="form-label">方案名称</label><input class="form-input" id="wfProtoName" placeholder="常规 IF 染色 / RNA-seq 差异分析"></div>
            </div>
            ${protocolStepEditor('wfProtoSteps')}
            <div class="form-group"><label class="form-label">备注</label><input class="form-input" id="wfProtoNote" placeholder="可写关键试剂、软件版本或注意事项"></div>
            <button class="btn btn-secondary btn-block" onclick="saveWorkflowProtocol()"><i class="ti ti-device-floppy"></i> 保存通用方案</button>
            <div class="divider"></div>
            ${groups}
        </div>`;
}

window.saveWorkflowProtocol = async function() {
    let module = document.getElementById('wfProtoModule').value;
    let name = document.getElementById('wfProtoName').value.trim();
    if (!name) return showToast('需填写方案名称', 'error');
    let payload = {
        name,
        steps: typeof protocolReadSteps === 'function' ? protocolReadSteps('wfProtoSteps') : wfLines(document.getElementById('wfProtoSteps').value),
        step_timers: typeof protocolReadStepTimers === 'function' ? protocolReadStepTimers('wfProtoSteps') : [],
        note: document.getElementById('wfProtoNote').value.trim()
    };
    if (window._editingWorkflowProtocolId && window._editingWorkflowModule === module) payload.id = window._editingWorkflowProtocolId;
    if (typeof protocolFinishSave === 'function') await protocolFinishSave();
    await fetch(`/api/workflows/${module}/protocols`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    window._editingWorkflowProtocolId = null;
    window._editingWorkflowModule = null;
    showToast('方案已保存');
    await loadWorkflowProtocols();
};

window.editWorkflowProtocol = function(module, id) {
    let protocol = wfResolveProtocol(module, id);
    if (!protocol) return;
    document.getElementById('wfProtoModule').value = module;
    document.getElementById('wfProtoName').value = protocol.name || '';
    if (typeof protocolSetSteps === 'function' && protocolSetSteps('wfProtoSteps', protocol.steps || [], protocol.step_timers || [])) {}
    else document.getElementById('wfProtoSteps').value = (protocol.steps || []).join('\n');
    document.getElementById('wfProtoNote').value = protocol.note || '';
    window._editingWorkflowProtocolId = id;
    window._editingWorkflowModule = module;
    document.getElementById('wfProtoName').scrollIntoView({ behavior: 'smooth' });
};

window.deleteWorkflowProtocol = async function(module, id) {
    if (!confirm('确定删除该方案？')) return;
    await fetch(`/api/workflows/${module}/protocols/${id}`, { method: 'DELETE' });
    showToast('已删除');
    await loadWorkflowProtocols();
};

async function wfLoadLogs(module) {
    let res = await fetch(`/api/workflows/${module}/logs`);
    WORKFLOW_STATE.logs[module] = await res.json();
}

window.loadBioinfoModule = async function() {
    await Promise.all([loadWorkflowProtocols(), wfFetchSamples(), wfLoadLogs('bioinfo')]);
    renderBioinfoModule();
};

window.bioinfoRefreshSteps = function() {
    let box = document.getElementById('bioinfoStepsBox');
    if (!box) return;
    box.innerHTML = wfBuildEditableSteps('bioinfo', document.getElementById('bioProtocol').value, 'bio-step');
};

function renderBioinfoModule() {
    let container = document.getElementById('bioinfoModuleView');
    if (!container) return;
    container.innerHTML = `
        <div class="card">
            <div class="card-header"><i class="ti ti-chart-dots-3"></i> 创建生信分析记录</div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">分析名称</label><input class="form-input" id="bioName" placeholder="肝组织 RNA-seq 差异分析"></div>
                <div class="form-group"><label class="form-label">流程方案</label><select class="form-select" id="bioProtocol" onchange="bioinfoRefreshSteps()">${wfProtocolOptions('bioinfo')}</select></div>
            </div>
            <div class="form-group"><label class="form-label">导入样本</label>${wfStructuredSampleEditor('bio')}</div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">原始数据路径</label><input class="form-input" id="bioDataPath" placeholder="FASTQ / count matrix / 项目路径"></div>
                <div class="form-group"><label class="form-label">输出目录</label><input class="form-input" id="bioOutPath" placeholder="结果文件夹"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">参考基因组/数据库</label><input class="form-input" id="bioRef" placeholder="mm10 / hg38 / KEGG"></div>
                <div class="form-group"><label class="form-label">软件环境</label><input class="form-input" id="bioEnv" placeholder="R 4.4, DESeq2, conda env"></div>
            </div>
            <div class="form-group"><label class="form-label">流程步骤</label><div id="bioinfoStepsBox">${wfBuildEditableSteps('bioinfo', (WORKFLOW_STATE.protocols.bioinfo[0] || {}).id, 'bio-step')}</div></div>
            <div class="form-group"><label class="form-label">结果摘要</label><textarea class="form-textarea" id="bioResult" rows="3" placeholder="差异基因数量、富集通路、关键图表路径..."></textarea></div>
            <button class="btn btn-primary btn-block" onclick="saveBioinfoLog()"><i class="ti ti-device-floppy"></i> 保存分析记录</button>
        </div>
        <div class="section-title"><i class="ti ti-history"></i> 生信分析记录</div>
        <div id="bioinfoHistory"></div>`;
    renderBioinfoHistory();
}

window.saveBioinfoLog = async function() {
    let name = document.getElementById('bioName').value.trim();
    if (!name) return showToast('需填写分析名称', 'error');
    let protocolId = document.getElementById('bioProtocol').value;
    let protocol = wfResolveProtocol('bioinfo', protocolId);
    let structuredSamples = wfReadStructuredSamples('bio');
    let payload = {
        name,
        protocol_id: protocolId,
        protocol_name: protocol ? protocol.name : '',
        steps: protocol ? (protocol.steps || []) : [],
        step_timers: protocol ? wfNormalizeStepTimers(protocol.step_timers, (protocol.steps || []).length) : [],
        activeCheck: Array.from(document.querySelectorAll('.bio-step')).map(x => x.checked),
        sample_ids: structuredSamples.map(sample => sample.sample_id).filter(Boolean),
        samples: structuredSamples,
        data_path: document.getElementById('bioDataPath').value.trim(),
        output_path: document.getElementById('bioOutPath').value.trim(),
        reference: document.getElementById('bioRef').value.trim(),
        environment: document.getElementById('bioEnv').value.trim(),
        result: document.getElementById('bioResult').value.trim(),
        status: '已记录'
    };
    await fetch('/api/workflows/bioinfo/logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    showToast('生信记录已保存');
    await loadBioinfoModule();
};

function renderBioinfoHistory() {
    let container = document.getElementById('bioinfoHistory');
    if (!container) return;
    let logs = WORKFLOW_STATE.logs.bioinfo || [];
    if (!logs.length) {
        container.innerHTML = '<div class="empty-state">暂无记录</div>';
        return;
    }
    container.innerHTML = logs.map(log => buildRecordCard({
        key: `bioinfo:${log.id}`,
        type: 'bioinfo_log',
        data: log,
        meta: { icon: 'ti-chart-dots-3', color: '#0a84ff', typeLabel: `生信分析 · ${log.protocol_name || '自定义流程'}` },
        extraButtons: `<button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteWorkflowLog('bioinfo','${log.id}')"><i class="ti ti-x"></i></button>`
    })).join('');
}

window.loadOtherModule = async function() {
    await Promise.all([loadWorkflowProtocols(), wfFetchSamples(), wfLoadLogs('other')]);
    renderOtherModule();
};

window.otherRefreshSteps = function() {
    let box = document.getElementById('otherStepsBox');
    if (!box) return;
    box.innerHTML = wfBuildEditableSteps('other', document.getElementById('otherProtocol').value, 'other-step');
};

function renderOtherModule() {
    let container = document.getElementById('otherModuleView');
    if (!container) return;
    let formHtml = WORKFLOW_STATE.otherFormOpen ? `
        <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;">
                <div style="font-weight:700;font-size:15px;"><i class="ti ti-tool" style="color:var(--primary)"></i> 其他实验记录</div>
                <button class="btn btn-sm btn-secondary" onclick="WORKFLOW_STATE.otherFormOpen=false;renderOtherModule()"><i class="ti ti-x"></i></button>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">实验名称</label><input class="form-input" id="otherName" placeholder="ELISA / 流式 / HE染色"></div>
                <div class="form-group"><label class="form-label">选择方案</label><select class="form-select" id="otherProtocol" onchange="otherRefreshSteps()">${wfProtocolOptions('other')}</select></div>
            </div>
            <div class="form-group"><label class="form-label">导入样本</label>${wfStructuredSampleEditor('other')}</div>
            <div class="form-group"><label class="form-label">流程步骤</label><div id="otherStepsBox">${wfBuildEditableSteps('other', (WORKFLOW_STATE.protocols.other[0] || {}).id, 'other-step')}</div></div>
            <div class="form-group"><label class="form-label">关键参数/观察</label><textarea class="form-textarea" id="otherParams" rows="2" placeholder="试剂批号、仪器参数、异常情况..."></textarea></div>
            <div class="form-group"><label class="form-label">结果记录</label><textarea class="form-textarea" id="otherResult" rows="3" placeholder="读数、图片路径、结论..."></textarea></div>
            <button class="btn btn-primary btn-block" onclick="saveOtherLog()"><i class="ti ti-device-floppy"></i> 保存实验记录</button>
        </div>` : `
        <div class="card">
            <button class="btn btn-primary btn-block" onclick="WORKFLOW_STATE.otherFormOpen=true;renderOtherModule()"><i class="ti ti-player-play"></i> 创建其他实验记录</button>
        </div>`;
    container.innerHTML = `
        ${formHtml}
        <div class="section-title"><i class="ti ti-history"></i> 其他实验记录</div>
        <div id="otherHistory"></div>`;
    renderOtherHistory();
}

window.saveOtherLog = async function() {
    let name = document.getElementById('otherName').value.trim();
    if (!name) return showToast('需填写实验名称', 'error');
    let protocolId = document.getElementById('otherProtocol').value;
    let protocol = wfResolveProtocol('other', protocolId);
    let structuredSamples = wfReadStructuredSamples('other');
    let payload = {
        name,
        protocol_id: protocolId,
        protocol_name: protocol ? protocol.name : '',
        steps: protocol ? (protocol.steps || []) : [],
        step_timers: protocol ? wfNormalizeStepTimers(protocol.step_timers, (protocol.steps || []).length) : [],
        activeCheck: Array.from(document.querySelectorAll('.other-step')).map(x => x.checked),
        sample_ids: structuredSamples.map(sample => sample.sample_id).filter(Boolean),
        samples: structuredSamples,
        params: document.getElementById('otherParams').value.trim(),
        result: document.getElementById('otherResult').value.trim(),
        status: '已记录'
    };
    await fetch('/api/workflows/other/logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    WORKFLOW_STATE.otherFormOpen = false;
    showToast('实验记录已保存');
    await loadOtherModule();
};

function renderOtherHistory() {
    let container = document.getElementById('otherHistory');
    if (!container) return;
    let logs = WORKFLOW_STATE.logs.other || [];
    if (!logs.length) {
        container.innerHTML = '<div class="empty-state">暂无记录</div>';
        return;
    }
    container.innerHTML = logs.map(log => buildRecordCard({
        key: `other:${log.id}`,
        type: 'other_log',
        data: log,
        meta: { icon: 'ti-tool', color: '#629987', typeLabel: `其他实验 · ${log.protocol_name || '自定义流程'}` },
        extraButtons: `<button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteWorkflowLog('other','${log.id}')"><i class="ti ti-x"></i></button>`
    })).join('');
}

window.deleteWorkflowLog = async function(module, id) {
    if (!confirm('确定删除该记录？')) return;
    await fetch(`/api/workflows/${module}/logs/${id}`, { method: 'DELETE' });
    showToast('已删除');
    if (module === 'bioinfo') await loadBioinfoModule();
    if (module === 'other') await loadOtherModule();
};

window.resolveWorkflowSampleNames = function(ids) {
    return (ids || []).map(id => (WORKFLOW_STATE.samples || []).find(s => s.id === id)?.name || id);
};

async function wfLoadSimpleModule(module) {
    await Promise.all([wfFetchSamples(), wfLoadLogs(module)]);
}

function wfRenderSimpleHistory(module, containerId, icon, color, emptyText) {
    let container = document.getElementById(containerId);
    if (!container) return;
    let logs = WORKFLOW_STATE.logs[module] || [];
    if (!logs.length) {
        container.innerHTML = `<div class="empty-state">${emptyText}</div>`;
        return;
    }
    container.innerHTML = logs.map(log => buildRecordCard({
        key: `${module}:${log.id}`,
        type: `${module}_log`,
        data: log,
        meta: { icon, color, typeLabel: log.status || '已记录' },
        extraButtons: `<button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteSimpleWorkflowLog('${module}','${log.id}')"><i class="ti ti-x"></i></button>`
    })).join('');
}

window.deleteSimpleWorkflowLog = async function(module, id) {
    if (!confirm('确定删除该记录？')) return;
    await fetch(`/api/workflows/${module}/logs/${id}`, { method: 'DELETE' });
    showToast('已删除');
    if (module === 'sendout') await loadSendoutModule();
    if (module === 'primer_antibody') await loadPrimerAntibodyLibrary();
    if (module === 'reagent') await loadReagentLibrary();
};

window.loadSendoutModule = async function() {
    await wfLoadSimpleModule('sendout');
    let container = document.getElementById('sendoutModuleView');
    if (!container) return;
    let formHtml = WORKFLOW_STATE.sendoutFormOpen ? `
        <div class="card inline-form-panel form-drop-enter">
            <div class="inline-form-head"><b><i class="ti ti-truck-delivery"></i> 公司送样记录</b><button class="btn btn-sm btn-secondary" onclick="WORKFLOW_STATE.sendoutFormOpen=false;loadSendoutModule()"><i class="ti ti-x"></i></button></div>
            <div class="form-row"><div class="form-group"><label class="form-label">送样批次</label><input class="form-input" id="sendName" placeholder="2025-01 RNA-seq"></div><div class="form-group"><label class="form-label">公司/平台</label><input class="form-input" id="sendCompany" placeholder="公司名称 / 测序平台"></div></div>
            <div class="form-row"><div class="form-group"><label class="form-label">项目类型</label><input class="form-input" id="sendProject" placeholder="RNA-seq / 蛋白组 / 代谢组"></div><div class="form-group"><label class="form-label">送样时间</label><input type="date" class="form-input" id="sendDate"></div></div>
            <div class="form-group"><label class="form-label">导入样本</label>${wfStructuredSampleEditor('send')}</div>
            <div class="form-group"><label class="form-label">备注/要求</label><textarea class="form-textarea" id="sendNote" rows="3"></textarea></div>
            <button class="btn btn-primary btn-block" onclick="saveSendoutLog()"><i class="ti ti-device-floppy"></i> 保存送样记录</button>
        </div>` : `<div class="card"><button class="btn btn-primary btn-block" onclick="WORKFLOW_STATE.sendoutFormOpen=true;loadSendoutModule()"><i class="ti ti-plus"></i> 新建送样记录</button></div>`;
    container.innerHTML = `
        ${formHtml}
        <div class="section-title"><i class="ti ti-history"></i> 送样记录</div><div id="sendoutHistory"></div>`;
    wfRenderSimpleHistory('sendout', 'sendoutHistory', 'ti-truck-delivery', '#6a9bcc', '暂无送样记录');
};

window.saveSendoutLog = async function() {
    let name = document.getElementById('sendName').value.trim();
    if (!name) return showToast('需填写送样批次', 'error');
    let structuredSamples = wfReadStructuredSamples('send');
    let payload = { name, company: document.getElementById('sendCompany').value.trim(), project: document.getElementById('sendProject').value.trim(), submitted_at: document.getElementById('sendDate').value, sample_ids: structuredSamples.map(sample => sample.sample_id).filter(Boolean), samples: structuredSamples, sample_names: structuredSamples.map(sample => sample.name).filter(Boolean), note: document.getElementById('sendNote').value.trim(), status: '已送样' };
    await fetch('/api/workflows/sendout/logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    WORKFLOW_STATE.sendoutFormOpen = false;
    showToast('送样记录已保存');
    await loadSendoutModule();
};

window.loadPrimerAntibodyLibrary = async function() {
    await Promise.all([wfLoadLogs('primer_antibody'), wfLoadWbAntibodyProtocols()]);
    let container = document.getElementById('primerAntibodyView');
    if (!container) return;
    let activeTab = WORKFLOW_STATE.primerAntibodyTab || 'antibody';
    let tabs = `<div class="tabs" style="margin-bottom:12px;">
        <button class="tab-btn ${activeTab === 'antibody' ? 'active' : ''}" onclick="WORKFLOW_STATE.primerAntibodyTab='antibody';WORKFLOW_STATE.primerFormOpen=false;loadPrimerAntibodyLibrary()">抗体</button>
        <button class="tab-btn ${activeTab === 'primer' ? 'active' : ''}" onclick="WORKFLOW_STATE.primerAntibodyTab='primer';WORKFLOW_STATE.antibodyFormOpen=false;loadPrimerAntibodyLibrary()">引物</button>
    </div>`;
    container.innerHTML = `
        ${tabs}
        ${activeTab === 'antibody' ? wfRenderWbAntibodyLibrary() : wfRenderPrimerLibrary()}`;
};

function wfRenderPrimerLibrary() {
    let formHtml = WORKFLOW_STATE.primerFormOpen ? `
        <div class="card inline-form-panel form-drop-enter">
            <div class="inline-form-head"><b><i class="ti ti-dna-2"></i> 引物条目</b><button class="btn btn-sm btn-secondary" onclick="WORKFLOW_STATE.primerFormOpen=false;loadPrimerAntibodyLibrary()"><i class="ti ti-x"></i></button></div>
            <div class="form-row"><div class="form-group"><label class="form-label">引物名称</label><input class="form-input" id="paName" placeholder="Gapdh-F/R"></div><div class="form-group"><label class="form-label">靶标/基因</label><input class="form-input" id="paTarget"></div></div>
            <div class="form-row"><div class="form-group"><label class="form-label">应用</label><input class="form-input" id="paApplication" placeholder="qPCR / PCR"></div><div class="form-group"><label class="form-label">供应商/货号</label><input class="form-input" id="paVendor"></div></div>
            <div class="form-group"><label class="form-label">位置/序列</label><input class="form-input" id="paLocation"></div>
            <div class="form-group"><label class="form-label">备注</label><textarea class="form-textarea" id="paNote" rows="2"></textarea></div>
            <button class="btn btn-primary btn-block" onclick="savePrimerAntibodyItem()"><i class="ti ti-device-floppy"></i> 保存引物</button>
        </div>` : `<div class="card"><button class="btn btn-primary btn-block" onclick="WORKFLOW_STATE.primerFormOpen=true;loadPrimerAntibodyLibrary()"><i class="ti ti-plus"></i> 新建引物</button></div>`;
    let primerLogs = (WORKFLOW_STATE.logs.primer_antibody || []).filter(item => item.kind === '引物');
    let history = primerLogs.length ? primerLogs.map(log => buildRecordCard({
        key: `primer_antibody:${log.id}`,
        type: 'primer_antibody_log',
        data: log,
        meta: { icon: 'ti-dna-2', color: '#817993', typeLabel: '引物' },
        extraButtons: `<button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteSimpleWorkflowLog('primer_antibody','${log.id}')"><i class="ti ti-x"></i></button>`
    })).join('') : '<div class="empty-state">暂无引物记录</div>';
    return `${formHtml}<div class="section-title"><i class="ti ti-list"></i> 引物记录</div><div>${history}</div>`;
}

async function wfLoadWbAntibodyProtocols() {
    if (typeof WB_STATE === 'undefined') return [];
    try {
        let res = await fetch('/api/wb/detection/protocols');
        let items = await res.json();
        let split = typeof wbSplitDetectionProtocols === 'function'
            ? wbSplitDetectionProtocols(items)
            : { antibodies: (items || []).filter(item => item.kind !== 'workflow' && item.kind !== 'marker'), workflows: (items || []).filter(item => item.kind === 'workflow'), markers: (items || []).filter(item => item.kind === 'marker') };
        WB_STATE.protocols.detection = split.antibodies || [];
        WB_STATE.protocols.detectionWorkflows = split.workflows || [];
        WB_STATE.protocols.markerSchemes = split.markers || [];
        return WB_STATE.protocols.detection;
    } catch (e) {
        return [];
    }
}

function wfRenderWbAntibodyLibrary() {
    let antibodies = (typeof WB_STATE !== 'undefined' ? WB_STATE.protocols.detection : []) || [];
    let items = antibodies.length === 0
        ? '<div class="empty-state">暂无 WB/IF 抗体条目</div>'
        : antibodies.map(p => {
            let hostVendor = [p.host, p.vendor].filter(Boolean).join(' | ');
            let ranges = [
                ['WB', typeof wbGetRangeText === 'function' ? wbGetRangeText(p, 'wb_range') : p.wb_range],
                ['IF', typeof wbGetRangeText === 'function' ? wbGetRangeText(p, 'if_range') : p.if_range],
                ['IHC', typeof wbGetRangeText === 'function' ? wbGetRangeText(p, 'ihc_range') : p.ihc_range]
            ].filter(([, value]) => value).map(([label, value]) => `${label} ${value}`).join(' · ');
            let role = typeof wbAntibodyRoleLabel === 'function' ? wbAntibodyRoleLabel(p) : (p.antibody_role === 'secondary' ? '二抗' : '一抗');
            return `<div class="list-item" style="align-items:flex-start;">
                <div class="list-item-content">
                    <div class="list-item-title">${p.name || '-'}</div>
                    <div class="list-item-subtitle">${role}${hostVendor ? ' · ' + hostVendor : ''}</div>
                    <div class="list-item-subtitle">${ranges || '未填写实验稀释范围'}${p.target_mw ? ' · ' + p.target_mw + ' kDa' : ''}</div>
                </div>
                <div class="list-item-actions">
                    <button class="btn btn-sm btn-secondary" onclick="editWbPAb('${p.id}')"><i class="ti ti-pencil"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="deleteWbItem('detection','protocols','${p.id}',event)"><i class="ti ti-x"></i></button>
                </div>
            </div>`;
        }).join('');
    let formHtml = WORKFLOW_STATE.antibodyFormOpen ? `
        <div class="card inline-form-panel form-drop-enter">
            <div class="inline-form-head"><b><i class="ti ti-vaccine"></i> 抗体条目</b><button class="btn btn-sm btn-secondary" onclick="WORKFLOW_STATE.antibodyFormOpen=false;loadPrimerAntibodyLibrary()"><i class="ti ti-x"></i></button></div>
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
            <div class="form-group"><label class="form-label">备注</label><input class="form-input" id="wbPAbNote" placeholder="4C 过夜, PVDF 推荐"></div>
            <button class="btn btn-primary btn-block" onclick="saveWbPAb()"><i class="ti ti-device-floppy"></i> 保存抗体</button>
        </div>` : `<div class="card"><button class="btn btn-primary btn-block" onclick="WORKFLOW_STATE.antibodyFormOpen=true;loadPrimerAntibodyLibrary()"><i class="ti ti-plus"></i> 新建抗体</button></div>`;
    return `${formHtml}<div class="section-title"><i class="ti ti-list"></i> 抗体记录</div><div class="card">${items}</div>`;
}

window.savePrimerAntibodyItem = async function() {
    let name = document.getElementById('paName').value.trim();
    if (!name) return showToast('需填写名称', 'error');
    let payload = { name, kind: '引物', target: document.getElementById('paTarget').value.trim(), application: document.getElementById('paApplication').value.trim(), vendor: document.getElementById('paVendor').value.trim(), location: document.getElementById('paLocation').value.trim(), note: document.getElementById('paNote').value.trim(), status: '可用' };
    await fetch('/api/workflows/primer_antibody/logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    WORKFLOW_STATE.primerFormOpen = false;
    showToast('已保存');
    await loadPrimerAntibodyLibrary();
};

window.loadReagentLibrary = async function() {
    await wfLoadLogs('reagent');
    let container = document.getElementById('reagentLibraryView');
    if (!container) return;
    let formHtml = WORKFLOW_STATE.reagentFormOpen ? `
        <div class="card inline-form-panel form-drop-enter">
            <div class="inline-form-head"><b><i class="ti ti-bottle"></i> 试剂/耗材条目</b><button class="btn btn-sm btn-secondary" onclick="WORKFLOW_STATE.reagentFormOpen=false;loadReagentLibrary()"><i class="ti ti-x"></i></button></div>
            <div class="form-row"><div class="form-group"><label class="form-label">名称</label><input class="form-input" id="rgName"></div><div class="form-group"><label class="form-label">类型</label><input class="form-input" id="rgKind" placeholder="试剂 / 耗材 / 试剂盒"></div></div>
            <div class="form-row"><div class="form-group"><label class="form-label">批号/规格</label><input class="form-input" id="rgBatch"></div><div class="form-group"><label class="form-label">位置</label><input class="form-input" id="rgLocation"></div></div>
            <div class="form-row"><div class="form-group"><label class="form-label">库存</label><input class="form-input" id="rgStock"></div><div class="form-group"><label class="form-label">有效期</label><input type="date" class="form-input" id="rgExpiry"></div></div>
            <div class="form-group"><label class="form-label">备注</label><textarea class="form-textarea" id="rgNote" rows="2"></textarea></div>
            <button class="btn btn-primary btn-block" onclick="saveReagentItem()"><i class="ti ti-device-floppy"></i> 保存试剂</button>
        </div>` : `<div class="card"><button class="btn btn-primary btn-block" onclick="WORKFLOW_STATE.reagentFormOpen=true;loadReagentLibrary()"><i class="ti ti-plus"></i> 新建试剂</button></div>`;
    container.innerHTML = `
        ${formHtml}
        <div class="section-title"><i class="ti ti-list"></i> 试剂记录</div><div id="reagentHistory"></div>`;
    wfRenderSimpleHistory('reagent', 'reagentHistory', 'ti-bottle', '#629987', '暂无试剂记录');
};

window.saveReagentItem = async function() {
    let name = document.getElementById('rgName').value.trim();
    if (!name) return showToast('需填写名称', 'error');
    let payload = { name, kind: document.getElementById('rgKind').value.trim(), batch: document.getElementById('rgBatch').value.trim(), location: document.getElementById('rgLocation').value.trim(), stock: document.getElementById('rgStock').value.trim(), expiry: document.getElementById('rgExpiry').value, note: document.getElementById('rgNote').value.trim(), status: '可用' };
    await fetch('/api/workflows/reagent/logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    WORKFLOW_STATE.reagentFormOpen = false;
    showToast('已保存');
    await loadReagentLibrary();
};