/* ============================================================
   records.js — 统一实验记录详情渲染（表单风格只读视图）
   ============================================================ */

const _RECORD_EXPANDED = {};

window.toggleRecordDetail = function (key) {
    _RECORD_EXPANDED[key] = !_RECORD_EXPANDED[key];
    let el = document.getElementById(`rd-${key}`);
    let arrow = document.getElementById(`rd-arrow-${key}`);
    if (!el) return;
    if (_RECORD_EXPANDED[key]) {
        el.style.display = 'block';
        el.classList.remove('closing');
        el.style.height = '0px';
        el.style.opacity = '0';
        void el.offsetHeight;
        el.classList.add('open');
        el.style.height = `${el.scrollHeight}px`;
        el.style.opacity = '1';
        setTimeout(() => {
            if (_RECORD_EXPANDED[key]) el.style.height = 'auto';
        }, 220);
        if (arrow) arrow.style.transform = 'rotate(90deg)';
    } else {
        el.style.height = `${el.scrollHeight}px`;
        el.style.opacity = '1';
        el.classList.remove('open');
        void el.offsetHeight;
        el.classList.add('closing');
        el.style.height = '0px';
        el.style.opacity = '0';
        setTimeout(() => {
            if (!_RECORD_EXPANDED[key]) {
                el.style.display = 'none';
                el.style.height = '';
                el.style.opacity = '';
            }
            el.classList.remove('closing');
        }, 220);
        if (arrow) arrow.style.transform = '';
    }
};

/* 只读字段行 — 复用 .form-group / .form-label 样式 */
function _rdField(label, val, full) {
    if (val == null || val === '') return '';
    return `<div class="form-group" style="margin-bottom:8px;">
        <label class="form-label" style="font-size:11px;">${label}</label>
        <div class="rd-readonly-val${full ? ' rd-full' : ''}">${val}</div>
    </div>`;
}
function _rdRow(...fields) {
    let fs = fields.filter(Boolean);
    return fs.length ? `<div class="form-row" style="margin-bottom:0;">${fs.join('')}</div>` : '';
}

function _rdSampleId(sample = {}) {
    return sample.sample_id || sample.cdna_sample_id || sample.denatured_sample_id || sample.source_sample_id || sample.derived_from_id || sample.id || '';
}

function _rdIntervention(sample = {}) {
    return sample.intervention_scheme || sample.induction_scheme || sample.protocol_name || sample.treatment_group || sample.group || '-';
}

function _rdDuration(sample = {}) {
    return sample.intervention_duration || sample.duration || sample.induction_days || sample.harvest_days || sample.day || sample.timepoint || '-';
}

function _rdCollectTraceSamples(data = {}) {
    let sources = [data.rt_samples, data.run_samples, data.imported_samples, data.all_samples, data.source_samples, data.samples, data.structured_samples];
    let rows = [];
    let used = new Set();
    sources.forEach(source => {
        if (!Array.isArray(source)) return;
        source.forEach((sample, index) => {
            if (!sample || typeof sample !== 'object') return;
            let name = sample.name || sample.sample_name || sample.original || sample.display_name || '';
            if (!name) return;
            let id = _rdSampleId(sample);
            let key = id || `${name}:${index}`;
            if (used.has(key)) return;
            used.add(key);
            rows.push({ ...sample, _trace_id: id, _trace_name: name });
        });
    });
    if (Array.isArray(data.membranes)) {
        data.membranes.forEach(membrane => {
            (membrane.lane_samples || []).forEach((sample, index) => {
                if (!sample || typeof sample !== 'object') return;
                let name = sample.name || sample.sample_name || sample.original || sample.display_name || '';
                if (!name) return;
                let id = _rdSampleId(sample);
                let key = id || `${name}:membrane:${index}`;
                if (used.has(key)) return;
                used.add(key);
                rows.push({ ...sample, _trace_id: id, _trace_name: name });
            });
        });
    }
    return rows;
}

function _rdTraceSampleTable(data = {}) {
    let samples = _rdCollectTraceSamples(data);
    if (!samples.length) return '';
    let rows = samples.map(sample => {
        let id = sample._trace_id || '';
        let clickable = id ? ` class="rd-sample-link" onclick="event.stopPropagation(); if (typeof wfJumpToSample === 'function') wfJumpToSample('${String(id).replace(/'/g, "\\'")}')" title="跳转到样本库"` : '';
        return `<tr${clickable}>
            <td>${sample._trace_name || '-'}</td>
            <td style="font-weight:700">${sample.run_alias_code || sample.alias_code || sample.sample_code || '-'}</td>
            <td>${_rdIntervention(sample)}</td>
            <td>${_rdDuration(sample)}</td>
        </tr>`;
    }).join('');
    return `<div class="card" style="margin-bottom:8px;">
        <div class="card-header"><i class="ti ti-route"></i> 样本与本次代号</div>
        <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
            <table class="cal-data-table" style="font-size:12px;text-align:center;">
                <thead><tr><th>样本</th><th>本次代号</th><th>干预方案</th><th>干预时长</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    </div>`;
}

/* ── 传代记录 ── */
function _buildPassageDetail(d) {
    return `
    <div class="card" style="margin-bottom:8px;">
        <div class="card-header"><i class="ti ti-cell"></i> 传前状态（源容器）</div>
        ${_rdRow(_rdField('容器类型', d.src_vessel), _rdField('容器数量', d.src_count != null ? d.src_count + ' 个' : null))}
        ${_rdField('当前密度', d.src_density != null ? d.src_density + ' %' : null)}
    </div>
    <div class="card" style="margin-bottom:8px;">
        <div class="card-header"><i class="ti ti-target"></i> 目标期望</div>
        ${_rdRow(_rdField('容器类型', d.tgt_vessel), _rdField('容器数量', d.tgt_count != null ? d.tgt_count + ' 个' : null))}
        ${_rdRow(_rdField('生长时间', d.tgt_time != null ? d.tgt_time + ' h' : null), _rdField('期望密度', d.tgt_density != null ? d.tgt_density + ' %' : null))}
    </div>
    <div class="card" style="margin-bottom:8px;">
        <div class="card-header"><i class="ti ti-calculator"></i> 计算结果</div>
        ${_rdRow(_rdField('接种密度', d.required_N0 != null ? d.required_N0.toFixed(2) + ' %' : null), _rdField('传代比例', d.passage_ratio != null ? (d.passage_ratio * 100).toFixed(1) + ' %' : null))}
        ${d.note ? _rdField('备注', d.note, true) : ''}
    </div>`;
}

/* ── 造模实验 ── */
function _buildExperimentDetail(d) {
    const WC = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#F39C12', '#DDA0DD', '#98D8C8', '#E91E63'];

    // 常见板型行列配置
    const PLATE_LAYOUT = {
        '6孔板': { rows: 2, cols: 3, rowLabels: ['A', 'B'] },
        '12孔板': { rows: 3, cols: 4, rowLabels: ['A', 'B', 'C'] },
        '24孔板': { rows: 4, cols: 6, rowLabels: ['A', 'B', 'C', 'D'] },
        '48孔板': { rows: 6, cols: 8, rowLabels: ['A', 'B', 'C', 'D', 'E', 'F'] },
        '96孔板': { rows: 8, cols: 12, rowLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] },
    };

    let platesHtml = (d.plates || []).map(pl => {
        // 协议 → 颜色映射
        let protoNames = [...new Set(Object.values(pl.wells || {}).map(w => w.protocol_name).filter(Boolean))];
        let colorMap = {};
        protoNames.forEach((pn, i) => { colorMap[pn] = WC[i % WC.length]; });

        // 图例 badges
        let badges = protoNames.map(pn =>
            `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:99px;background:${colorMap[pn]}22;border:1px solid ${colorMap[pn]};font-size:11px;font-weight:600;margin:2px;color:${colorMap[pn]}">` +
            `<span style="width:8px;height:8px;border-radius:50%;background:${colorMap[pn]};display:inline-block"></span>${pn}</span>`
        ).join('');

        // 板网格
        let layout = PLATE_LAYOUT[pl.plate_type];
        let gridHtml = '';
        if (layout) {
            let cellSize = layout.cols <= 4 ? 44 : layout.cols <= 6 ? 38 : layout.cols <= 8 ? 30 : layout.cols <= 12 ? 24 : 16;
            let fontSize = layout.cols <= 4 ? 13 : layout.cols <= 6 ? 11 : layout.cols <= 8 ? 10 : layout.cols <= 12 ? 9 : 8;
            let gridRows = '';
            for (let r = 0; r < layout.rows; r++) {
                let cells = '';
                for (let c = 1; c <= layout.cols; c++) {
                    let wid = layout.rowLabels[r] + c;
                    let w = (pl.wells || {})[wid];
                    let pn = w?.protocol_name || '';
                    let bg = colorMap[pn] || 'var(--surface-hover)';
                    let label = pn ? pn.substring(0, 3) : '';
                    cells += `<td title="${wid}: ${pn || '空'}" style="width:${cellSize}px;height:${cellSize}px;background:${bg};border-radius:50%;border:1px solid ${pn ? 'transparent' : 'var(--border)'};text-align:center;vertical-align:middle;font-size:${fontSize}px;font-weight:600;color:${pn ? '#fff' : 'var(--text-tertiary)'};cursor:default;padding:0">${label}</td>`;
                }
                gridRows += `<tr><td style="font-size:10px;color:var(--text-secondary);padding-right:4px;font-weight:600;white-space:nowrap">${layout.rowLabels[r]}</td>${cells}</tr>`;
            }
            // 列号行
            let colNums = `<tr><td></td>${Array.from({ length: layout.cols }, (_, i) => `<td style="font-size:10px;color:var(--text-secondary);text-align:center;">${i + 1}</td>`).join('')}</tr>`;
            gridHtml = `<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;margin-top:8px;">
                <table style="border-collapse:separate;border-spacing:3px;margin:0 auto;">
                    <tbody>${colNums}${gridRows}</tbody>
                </table>
            </div>`;
        }

        return `<div style="border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:8px;">
            <div style="font-size:13px;font-weight:700;margin-bottom:6px;">
                <i class="ti ti-layout-grid" style="color:var(--accent)"></i> ${pl.plate_name} (${pl.plate_type})
            </div>
            <div style="flex-wrap:wrap;display:flex;margin-bottom:4px">${badges || '<span style="font-size:11px;color:var(--text-tertiary)">无方案分配</span>'}</div>
            ${gridHtml}
            ${_rdRow(_rdField('收样时间', (pl.harvest_time || '').substring(0, 16)), _rdField('换液频率', pl.media_change_freq ? pl.media_change_freq + ' 天/次' : null))}
        </div>`;
    }).join('');

    return `
    <div class="card" style="margin-bottom:8px;">
        <div class="card-header"><i class="ti ti-pill"></i> 实验信息</div>
        ${_rdRow(_rdField('实验名称', d.name), _rdField('创建时间', (d.created_at || '').substring(0, 16)))}
        ${_rdRow(_rdField('板型总览', d.plate_type), _rdField('状态', `<span class="badge ${d.status === '已完成' ? 'badge-success' : 'badge-info'}">${d.status || '进行中'}</span>`))}
    </div>
    <div class="card" style="margin-bottom:8px;">
        <div class="card-header"><i class="ti ti-layout-grid"></i> 板详情</div>
        ${platesHtml || '<div style="color:var(--text-tertiary);font-size:12px;padding:4px">无板信息</div>'}
    </div>`;
}

/* ── RNA 提取 ── */
function _buildRnaDetail(d) {
    let samples = (d.samples || []).map(s => s.original || s.name || s).join('、');
    let checks = d.activeCheck || [];
    let stepsHtml = (d.steps || []).map((s, i) => `
        <label class="step-item ${checks[i] ? 'checked' : ''}" style="pointer-events:none;opacity:${checks[i] ? 1 : 0.65};">
            <input type="checkbox" class="step-checkbox" ${checks[i] ? 'checked' : ''} disabled>
            <div><b>Step ${i + 1}.</b> ${s}</div>
        </label>`).join('');
    return `
    <div class="card" style="margin-bottom:8px;">
        <div class="card-header"><i class="ti ti-droplet"></i> RNA 提取</div>
        ${_rdRow(_rdField('实验名称', d.name), _rdField('时间', (d.created_at || d.timestamp || '').substring(0, 16)))}
        ${_rdField('方案', d.protocol, true)}
        ${_rdField('样本', samples, true)}
    </div>
    ${stepsHtml ? `<div class="card" style="margin-bottom:8px;"><div class="card-header"><i class="ti ti-checklist"></i> 操作步骤（只读）</div>${stepsHtml}</div>` : ''}`;
}

/* ── 逆转录 RT ── */
function _buildRtDetail(d) {
    let samples = d.samples || [];
    let tableRows = samples.map(s => `<tr>
        <td style="font-weight:600">${s.name || s}</td>
        <td>${s.conc || '-'}</td>
        <td style="color:var(--info);font-weight:600">${s.rna_vol > 0 ? Number(s.rna_vol).toFixed(2) : '-'}</td>
        <td>${s.enzyme_vol || '-'}</td>
        <td style="color:${s.water_vol < 0 ? 'var(--danger)' : 'var(--success)'};font-weight:600">${s.conc ? Number(s.water_vol).toFixed(2) : '-'}</td>
    </tr>`).join('');

    // Resolve RNA source name
    let rnaSourceLabel = d.rna_source_name || d.rna_source || d.rna_log_id;
    if (rnaSourceLabel && rnaSourceLabel.length > 30 && typeof PCR_STATE !== 'undefined') {
        let rnaLog = PCR_STATE.rnaLogs.find(l => l.id === rnaSourceLabel);
        if (rnaLog) rnaSourceLabel = rnaLog.name;
    }

    // Build strip layout visualization
    let stripHtml = '';
    let stripMap = d.stripMap || [];
    if (stripMap.length > 0 && samples.length > 0) {
        let stripCards = stripMap.map((strip, i) => {
            let tubes = strip.map((sx, j) => {
                let smp = (sx !== null && samples[sx]) ? samples[sx] : null;
                let label = smp ? (smp.name || '').substring(0, 3) : '';
                let filled = smp ? 'background:var(--accent);color:#fff;border-color:transparent;' : '';
                return `<div style="width:28px;height:28px;border-radius:50%;border:2px solid rgba(0,0,0,0.1);display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;${filled}" title="${smp ? smp.name : '空'}">${label}</div>`;
            }).join('');
            return `<div style="display:flex;flex-direction:column;align-items:center;">
                <div style="font-size:10px;color:#888;margin-bottom:2px">管 ${i + 1}</div>
                <div style="display:flex;gap:3px;background:rgba(0,0,0,0.04);padding:6px;border-radius:6px;">${tubes}</div>
            </div>`;
        }).join('');
        stripHtml = `<div class="card" style="margin-bottom:8px;">
            <div class="card-header"><i class="ti ti-test-pipe"></i> 八联管排布</div>
            <div style="display:flex;flex-wrap:wrap;gap:12px;padding:4px;">${stripCards}</div>
        </div>`;
    }

    // Build steps visually
    let checks = d.activeCheck || [];
    let pID = d.protocol_id;
    let proto = (typeof PCR_STATE !== 'undefined') ? PCR_STATE.rtProtocols.find(p => p.id === pID) : null;
    let stepsArr = proto ? (proto.steps || []) : [];
    let stepsHtml = stepsArr.map((s, i) => `
        <label class="step-item ${checks[i] ? 'checked' : ''}" style="pointer-events:none;opacity:${checks[i] ? 1 : 0.65};">
            <input type="checkbox" class="step-checkbox" ${checks[i] ? 'checked' : ''} disabled>
            <div><b>Step ${i + 1}.</b> ${s}</div>
        </label>`).join('');

    return `
    <div class="card" style="margin-bottom:8px;">
        <div class="card-header"><i class="ti ti-arrows-right-left"></i> 逆转录</div>
        ${_rdRow(_rdField('实验名称', d.name), _rdField('时间', (d.created_at || d.timestamp || '').substring(0, 16)))}
        ${_rdRow(_rdField('RNA 来源', rnaSourceLabel), _rdField('方案', d.protocol))}
        ${_rdRow(_rdField('总体积', d.tot_vol ? d.tot_vol + 'μL' : null), _rdField('目标量', d.req_ng ? d.req_ng + 'ng' : null))}
    </div>
    ${tableRows ? `<div class="card" style="margin-bottom:8px;">
        <div class="card-header"><i class="ti ti-table"></i> 样本浓度计算</div>
        <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
        <table class="cal-data-table" style="font-size:12px;">
            <thead><tr><th>样本</th><th>浓度(ng/μL)</th><th>RNA(μL)</th><th>酶(μL)</th><th>补水(μL)</th></tr></thead>
            <tbody>${tableRows}</tbody>
        </table></div>
    </div>`: ''}
    ${stripHtml}
    ${stepsHtml ? `<div class="card" style="margin-bottom:8px;"><div class="card-header"><i class="ti ti-checklist"></i> 操作步骤（只读）</div>${stepsHtml}</div>` : ''}`;
}

/* ── PCR 提取/逆转录一体 ── */
function _buildPcrExtractDetail(d) {
    let samples = d.rt_samples || d.samples || [];
    let rtConfig = d.rt_config || {};
    let tableRows = samples.map(s => `<tr>
        <td style="font-weight:700">${s.run_alias_code || s.alias_code || '-'}</td>
        <td>${s.name || s.original || '-'}</td>
        <td>${s.conc || '-'}</td>
        <td>${s.rna_vol > 0 ? Number(s.rna_vol).toFixed(2) : '-'}</td>
        <td>${s.enzyme_vol || rtConfig.enz_vol || '-'}</td>
        <td style="color:${Number(s.water_vol || 0) < 0 ? 'var(--danger)' : 'var(--success)'};font-weight:600">${s.conc ? Number(s.water_vol || 0).toFixed(2) : '-'}</td>
    </tr>`).join('');
    let stripMap = d.stripMap || [];
    let stripHtml = stripMap.length ? `<div class="card" style="margin-bottom:8px;">
        <div class="card-header"><i class="ti ti-test-pipe"></i> cDNA 八联管位置</div>
        <div style="display:flex;flex-wrap:wrap;gap:12px;padding:4px;">
            ${stripMap.map((strip, i) => `<div style="display:flex;flex-direction:column;align-items:center;">
                <div style="font-size:10px;color:#888;margin-bottom:2px">管 ${i + 1}</div>
                <div style="display:flex;gap:3px;background:rgba(0,0,0,0.04);padding:6px;border-radius:6px;">
                    ${(strip || []).map((sx) => {
                        let smp = (sx !== null && samples[sx]) ? samples[sx] : null;
                        let label = smp ? (smp.run_alias_code || smp.alias_code || smp.name || '').substring(0, 6) : '';
                        let filled = smp ? 'background:var(--accent);color:#fff;border-color:transparent;' : '';
                        return `<div style="width:32px;height:32px;border-radius:50%;border:2px solid rgba(0,0,0,0.1);display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;${filled}" title="${smp ? smp.name : '空'}">${label}</div>`;
                    }).join('')}
                </div>
            </div>`).join('')}
        </div>
    </div>` : '';
    let checks = d.activeCheck || [];
    let stepsHtml = (d.steps || []).map((step, i) => `
        <label class="step-item ${checks[i] ? 'checked' : ''}" style="pointer-events:none;opacity:${checks[i] ? 1 : 0.65};">
            <input type="checkbox" class="step-checkbox" ${checks[i] ? 'checked' : ''} disabled>
            <div><b>Step ${i + 1}.</b> ${step}</div>
        </label>`).join('');

    return `
    <div class="card" style="margin-bottom:8px;">
        <div class="card-header"><i class="ti ti-arrows-right-left"></i> PCR提取/逆转录</div>
        ${_rdRow(_rdField('实验名称', d.name), _rdField('时间', (d.created_at || d.timestamp || '').substring(0, 16)))}
        ${_rdRow(_rdField('RNA提取方案', d.protocol_name || d.protocol), _rdField('逆转录方案', d.rt_protocol_name))}
        ${_rdRow(_rdField('RT总体积', rtConfig.tot_vol ? rtConfig.tot_vol + 'μL' : null), _rdField('目标RNA量', rtConfig.req_ng ? rtConfig.req_ng + 'ng' : null))}
    </div>
    ${tableRows ? `<div class="card" style="margin-bottom:8px;"><div class="card-header"><i class="ti ti-table"></i> 逆转录配液</div><div style="overflow-x:auto;-webkit-overflow-scrolling:touch;"><table class="cal-data-table" style="font-size:12px;text-align:center;"><thead><tr><th>代号</th><th>样本</th><th>浓度</th><th>RNA(μL)</th><th>酶(μL)</th><th>补水(μL)</th></tr></thead><tbody>${tableRows}</tbody></table></div></div>` : ''}
    ${stripHtml}
    ${stepsHtml ? `<div class="card" style="margin-bottom:8px;"><div class="card-header"><i class="ti ti-checklist"></i> 操作步骤（只读）</div>${stepsHtml}</div>` : ''}`;
}

/* ── qPCR ── */
function _buildQpcrDetail(d) {
    let genes = d.genes || [], plateMap = d.plate_map || {};
    let samples = (d.samples || []).map(s => `${s.run_alias_code || s.alias_code || ''}${s.run_alias_code || s.alias_code ? ' ' : ''}${s.name || s}`).join('、');
    
    // Resolve RT (cDNA) source name
    let rtSourceLabel = (d.cdna_source_names || []).join(' / ') || d.rt_source_name || d.rt_source || d.rt_log_id || '';
    if (rtSourceLabel && rtSourceLabel.length > 30 && typeof PCR_STATE !== 'undefined') {
        let rtLog = PCR_STATE.rtLogs.find(l => l.id === rtSourceLabel);
        if (rtLog) rtSourceLabel = rtLog.name;
    }

    let lts = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'];
    const C = ['#E74C3C', '#3498DB', '#2ECC71', '#F39C12', '#9B59B6', '#1ABC9C', '#E67E22', '#34495E',
        '#E91E63', '#00BCD4', '#8BC34A', '#FF5722', '#607D8B', '#795548', '#9C27B0', '#03A9F4'];
    let legendHtml = genes.map((g, i) =>
        `<span style="display:inline-flex;padding:2px 8px;border-radius:99px;background:${C[i % C.length]}33;border:1px solid ${C[i % C.length]};font-size:11px;font-weight:600;margin:2px;color:${C[i % C.length]}">${g}</span>`
    ).join('');
    let plateHtml = `<table class="plate-384" style="pointer-events:none;"><tbody><tr><td></td>`;
    for (let c = 1; c <= 24; c++) plateHtml += `<td class="plate-nav-label">${c}</td>`;
    plateHtml += '</tr>';
    for (let r = 0; r < 16; r++) {
        plateHtml += `<tr><td class="plate-nav-label">${lts[r]}</td>`;
        for (let c = 1; c <= 24; c++) {
            let wid = lts[r] + c, info = plateMap[wid], bg = 'var(--surface-hover)', t = '', tt = wid;
            if (info && info.gene) { let gi = genes.indexOf(info.gene); bg = gi >= 0 ? C[gi % C.length] : 'var(--text-tertiary)'; t = info.sample ? info.sample.substring(0, 2) : ''; tt = `${wid}: ${info.sample || ''} (${info.gene})`; }
            plateHtml += `<td class="plate-384-cell" style="background:${bg};" title="${tt}"><div class="plate-384-cell-content" style="color:${info && info.gene ? '#fff' : 'var(--text-secondary)'}">${t}</div></td>`;
        }
        plateHtml += '</tr>';
    }
    plateHtml += '</tbody></table>';

    // Status badge
    let statusBadge = '';
    if (d.status) {
        let badgeClass = d.status === '已计算FC值' ? 'badge-success' : (d.status === '未计算FC' ? 'badge-info' : '');
        statusBadge = _rdField('状态', `<span class="badge ${badgeClass}">${d.status}</span>`);
    }

    // Build steps visually
    let checks = d.activeCheck || [];
    let pID = d.protocol_id;
    let proto = (typeof PCR_STATE !== 'undefined') ? PCR_STATE.qpcrProtocols.find(p => p.id === pID) : null;
    let stepsArr = proto ? (proto.steps || []) : [];
    let stepsHtml = stepsArr.map((s, i) => `
        <label class="step-item ${checks[i] ? 'checked' : ''}" style="pointer-events:none;opacity:${checks[i] ? 1 : 0.65};">
            <input type="checkbox" class="step-checkbox" ${checks[i] ? 'checked' : ''} disabled>
            <div><b>Step ${i + 1}.</b> ${s}</div>
        </label>`).join('');

    return `
    <div class="card" style="margin-bottom:8px;">
        <div class="card-header"><i class="ti ti-chart-line"></i> 荧光定量 (qPCR)</div>
        ${_rdRow(_rdField('实验名称', d.name), _rdField('时间', (d.created_at || d.timestamp || '').substring(0, 16)))}
        ${_rdRow(_rdField('cDNA来源', rtSourceLabel), statusBadge)}
        ${_rdField('样本', samples, true)}
        <div class="form-group" style="margin-bottom:0"><label class="form-label" style="font-size:11px">基因图例</label>
        <div style="flex-wrap:wrap;display:flex;margin-top:2px">${legendHtml || '<span style="color:var(--text-tertiary);font-size:12px">无基因信息</span>'}</div></div>
    </div>
    <div class="card" style="margin-bottom:8px;">
        <div class="card-header"><i class="ti ti-grid-dots"></i> 384孔板布局（只读）</div>
        <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">${plateHtml}</div>
    </div>
    ${stepsHtml ? `<div class="card" style="margin-bottom:8px;"><div class="card-header"><i class="ti ti-checklist"></i> 操作步骤（只读）</div>${stepsHtml}</div>` : ''}`;
}

/* ── PCR 样本组 ── */
function _buildPcrSampleGroupDetail(d) {
    let tbody = (d.samples || []).map(s => `<tr><td style="font-weight:bold">${s.name}</td><td>${s.group}</td><td>${s.day}</td></tr>`).join('');
    return `
    <div class="card" style="margin-bottom:8px;">
        <div class="card-header"><i class="ti ti-info-circle"></i> 基本信息</div>
        ${_rdRow(_rdField('来源', d.source), _rdField('包含样本数', (d.samples||[]).length + ' 个'))}
        ${_rdField('涉及方案', (d.induction_schemes||[]).map(id => {
            let p = STATE.drugProtocols.find(x => x.id === id);
            return p ? p.name : id;
        }).join(', '), true)}
    </div>
    <div class="card" style="margin-bottom:8px;">
        <div class="card-header"><i class="ti ti-list"></i> 样本列表</div>
        <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
        <table class="cal-data-table" style="font-size:12px;text-align:center;">
            <thead><tr><th>名称</th><th>分组 (方案)</th><th>时间点</th></tr></thead>
            <tbody>${tbody}</tbody>
        </table>
        </div>
    </div>`;
}

/* ── 浓度换算 ── */
function _buildDilutionDetail(d) {
    if (d.kind === 'powder') {
        let assistRow = (d.mw || d.potency_iu_per_mg)
            ? _rdRow(_rdField('摩尔质量', d.mw ? d.mw + ' g/mol' : '-'), _rdField('效价', d.potency_iu_per_mg ? d.potency_iu_per_mg + ' IU/mg' : '-'))
            : '';
        return `
        <div class="card" style="margin-bottom:8px;">
            <div class="card-header"><i class="ti ti-scale"></i> 粉末配制详情</div>
            ${_rdRow(_rdField('工作液浓度', d.target_conc + ' ' + d.target_unit), _rdField('总体积', d.final_volume + ' ' + (d.volume_unit || 'mL')))}
            ${_rdRow(_rdField('需称取粉末', d.powder_mass_text || (d.powder_mass_mg + ' mg')), _rdField('目标总量', d.amount_text || '-'))}
            ${assistRow}
        </div>`;
    }
    let mwRow = d.mw ? _rdRow(_rdField('摩尔质量', d.mw + ' g/mol'), _rdField('', '')) : '';
    return `
    <div class="card" style="margin-bottom:8px;">
        <div class="card-header"><i class="ti ti-calculator"></i> 换算详情</div>
        ${_rdRow(_rdField('原液浓度 (C₁)', d.c1 + ' ' + d.u1), _rdField('工作液浓度 (C₂)', d.c2 + ' ' + d.u2))}
        ${_rdRow(_rdField('目的体积 (V₂)', d.v2 + ' mL'), _rdField('需加原液', d.v1_ul + ' μL'))}
        ${mwRow}
    </div>`;
}

/* ── 样本库 ── */
function _buildSampleDetail(d) {
    let tags = (d.tags || []).join('、');
    return `
    <div class="card" style="margin-bottom:8px;">
        <div class="card-header"><i class="ti ti-database"></i> 样本信息</div>
        ${_rdRow(_rdField('样本名称', d.name), _rdField('状态', d.status || '可用'))}
        ${_rdRow(_rdField('材料类型', d.material_type), _rdField('保存方式', d.preservation))}
        ${_rdRow(_rdField('来源', d.source_label || d.source_type), _rdField('动物编号', d.animal_id))}
        ${_rdRow(_rdField('组别', d.group), _rdField('诱导方案', d.induction_scheme))}
        ${_rdRow(_rdField('诱导/处理时长', d.duration || d.induction_days), _rdField('收样时间', d.harvested_at || d.harvest_time))}
        ${tags ? _rdField('用途标签', tags, true) : ''}
        ${d.notes ? _rdField('备注', d.notes, true) : ''}
    </div>`;
}

function _wfSampleNames(ids) {
    if (typeof resolveWorkflowSampleNames === 'function') return resolveWorkflowSampleNames(ids).join('、');
    return (ids || []).join('、');
}

function _buildWorkflowStepsDetail(d) {
    return (typeof wfBuildReadonlySteps === 'function') ? wfBuildReadonlySteps(d.steps || [], d.activeCheck || [], d.step_timers || []) : '';
}

function _buildStructuredSamplesDetail(samples) {
    if (!Array.isArray(samples) || samples.length === 0) return '';
    let rows = samples.map(s => `
        <tr>
            <td>${s.name || s.sample_name || '-'}</td>
            <td>${s.source || s.source_label || s.source_type || '-'}</td>
            <td>${s.group || '-'}</td>
            <td>${s.induction_scheme || s.protocol_name || '-'}</td>
            <td>${s.duration || s.induction_days || s.day || '-'}</td>
            <td>${s.harvested_at || s.harvest_time || '-'}</td>
            <td>${s.material_type || s.tissue || '-'}</td>
        </tr>`).join('');
    return `<div class="card" style="margin-bottom:8px;">
        <div class="card-header"><i class="ti ti-vials"></i> 结构化样本</div>
        <div style="overflow-x:auto"><table class="cal-data-table"><thead><tr><th>样本</th><th>来源</th><th>组别</th><th>诱导方案</th><th>时长</th><th>收样时间</th><th>材料</th></tr></thead><tbody>${rows}</tbody></table></div>
    </div>`;
}

function _buildAnimalLogDetail(d) {
    let animalRows = (d.animals || []).map(a => `<tr><td>${a.animal_id}</td><td>${a.group || '-'}</td><td>${a.weight || '-'}</td><td>${a.volume_ul || '-'}</td></tr>`).join('');
    let groupRows = (d.groups || []).map(g => `<tr><td>${g.name || '-'}</td><td>${g.count || '-'}</td><td>${g.induction_scheme || '-'}</td><td>${g.duration_days || '-'}</td><td>${g.harvest_time || '-'}</td></tr>`).join('');
    let sampleRows = (d.samples || []).map(s => `<tr><td>${s.animal_id || s.name || '-'}</td><td>${s.group || '-'}</td><td>${s.induction_scheme || '-'}</td><td>${s.duration || s.induction_days || '-'}</td><td>${s.tissue || '-'}</td><td>${s.material_type}</td><td>${s.preservation || '-'}</td><td>${(s.tags || []).join('、')}</td></tr>`).join('');
    return `
    <div class="card" style="margin-bottom:8px;">
        <div class="card-header"><i class="ti ti-vaccine"></i> ${d.kind === 'harvest' ? '动物取材' : '动物造模'}</div>
        ${_rdRow(_rdField('名称', d.name), _rdField('状态', d.status))}
        ${_rdRow(_rdField('动物类型/种属', d.species || d.animal_type), _rdField('方案', d.protocol_name || d.source_model_name))}
        ${d.note ? _rdField('备注', d.note, true) : ''}
    </div>
    ${groupRows ? `<div class="card" style="margin-bottom:8px;"><div class="card-header"><i class="ti ti-users-group"></i> 造模组别</div><div style="overflow-x:auto"><table class="cal-data-table"><thead><tr><th>组别</th><th>数量</th><th>诱导方案</th><th>天数</th><th>收样</th></tr></thead><tbody>${groupRows}</tbody></table></div></div>` : ''}
    ${animalRows ? `<div class="card" style="margin-bottom:8px;"><div class="card-header"><i class="ti ti-table"></i> 动物队列</div><div style="overflow-x:auto"><table class="cal-data-table"><thead><tr><th>编号</th><th>分组</th><th>体重(g)</th><th>给药(μL)</th></tr></thead><tbody>${animalRows}</tbody></table></div></div>` : ''}
    ${sampleRows ? `<div class="card" style="margin-bottom:8px;"><div class="card-header"><i class="ti ti-database-plus"></i> 取材样本</div><div style="overflow-x:auto"><table class="cal-data-table"><thead><tr><th>样本/编号</th><th>组别</th><th>诱导</th><th>时长</th><th>组织</th><th>类型</th><th>保存</th><th>用途</th></tr></thead><tbody>${sampleRows}</tbody></table></div></div>` : ''}
    ${_buildWorkflowStepsDetail(d)}`;
}

function _buildIfLogDetail(d) {
    let planMap = new Map((d.antibody_plans || []).map(plan => [plan.id, plan]));
    let planLabel = (plan, index = 0) => {
        let names = [plan?.primary_antibody, plan?.primary_antibody2].filter(Boolean);
        if (names.length) return names.join(' + ');
        return plan?.name || `抗体组合${index + 1}`;
    };
    let planRows = (d.antibody_plans || []).map(plan => `
        <tr>
            <td>${planLabel(plan, (d.antibody_plans || []).indexOf(plan))}</td>
            <td>${plan.primary_antibody || '-'}</td>
            <td>${plan.secondary_antibody || '-'}</td>
            <td>${plan.primary_antibody2 || '-'}</td>
            <td>${plan.secondary_antibody2 || '-'}</td>
            <td>${plan.note || '-'}</td>
        </tr>`).join('');
    let assignmentRows = (d.samples || []).flatMap(sample => {
        let assignments = Array.isArray(sample.assignments) && sample.assignments.length
            ? sample.assignments
            : [{ unit_id: sample.unit_id, antibody_plan: sample.antibody_plan, antibody_plan_id: sample.antibody_plan_id }];
        return assignments.map(assignment => {
            let plan = planMap.get(assignment.antibody_plan_id);
            let label = plan ? planLabel(plan, (d.antibody_plans || []).indexOf(plan)) : (assignment.antibody_plan || sample.antibody_plan || '-');
            return `<tr>
                <td>${sample.slide_id || '-'}</td>
                <td>${assignment.unit_id || sample.unit_id || '-'}</td>
                <td>${sample.name || '-'}</td>
                <td>${sample.layout || '-'}</td>
                <td>${label}</td>
                <td>${sample.group || '-'}</td>
                <td>${sample.material_type || '-'}</td>
                <td>${sample.note || '-'}</td>
            </tr>`;
        });
    }).join('');
    return `
    <div class="card" style="margin-bottom:8px;">
        <div class="card-header"><i class="ti ti-microscope"></i> 免疫荧光</div>
        ${_rdRow(_rdField('实验名称', d.name), _rdField('状态', d.status))}
        ${_rdRow(_rdField('方案', d.protocol_name), _rdField('图片路径', d.image_path))}
        ${_rdField('关联样本', _wfSampleNames(d.sample_ids), true)}
        ${d.result ? _rdField('结果记录', d.result, true) : ''}
    </div>
    ${planRows ? `<div class="card" style="margin-bottom:8px;"><div class="card-header"><i class="ti ti-vaccine"></i> 抗体组合</div><div style="overflow-x:auto"><table class="cal-data-table"><thead><tr><th>组合</th><th>一抗1</th><th>二抗1</th><th>一抗2</th><th>二抗2</th><th>备注</th></tr></thead><tbody>${planRows}</tbody></table></div></div>` : ''}
    ${assignmentRows ? `<div class="card" style="margin-bottom:8px;"><div class="card-header"><i class="ti ti-layout-grid"></i> 样本与载片/孔位分配</div><div style="overflow-x:auto"><table class="cal-data-table"><thead><tr><th>载片/孔板</th><th>区域/孔位</th><th>样本</th><th>形式</th><th>抗体组合</th><th>组别</th><th>材料</th><th>备注</th></tr></thead><tbody>${assignmentRows}</tbody></table></div></div>` : ''}
    ${_buildWorkflowStepsDetail(d)}`;
}

function _buildGenericWorkflowDetail(d, label, icon) {
    return `
    <div class="card" style="margin-bottom:8px;">
        <div class="card-header"><i class="ti ${icon}"></i> ${label}</div>
        ${_rdRow(_rdField('名称', d.name), _rdField('方案', d.protocol_name))}
        ${_rdField('关联样本/数据', _wfSampleNames(d.sample_ids), true)}
        ${d.data_path ? _rdRow(_rdField('原始数据', d.data_path), _rdField('输出目录', d.output_path)) : ''}
        ${d.reference || d.environment ? _rdRow(_rdField('参考/数据库', d.reference), _rdField('软件环境', d.environment)) : ''}
        ${d.params ? _rdField('关键参数/观察', d.params, true) : ''}
        ${d.result ? _rdField('结果记录', d.result, true) : ''}
    </div>
    ${_buildStructuredSamplesDetail(d.samples || d.structured_samples || [])}
    ${_buildWorkflowStepsDetail(d)}`;
}

/* ── 统一入口 ── */
window.buildRecordDetailHTML = function (type, data) {
    if (!data) return '<div style="color:var(--text-tertiary);font-size:12px;padding:8px">无数据</div>';
    let html = '';
    if (type === 'passage') html = _buildPassageDetail(data);
    else if (type === 'experiment') html = _buildExperimentDetail(data);
    else if (type === 'pcr_extract') html = _buildPcrExtractDetail(data);
    else if (type === 'pcr_rna') html = _buildRnaDetail(data);
    else if (type === 'pcr_rt') html = _buildRtDetail(data);
    else if (type === 'pcr_qpcr') html = _buildQpcrDetail(data);
    else if (type === 'pcr_sample_group') html = _buildPcrSampleGroupDetail(data);
    else if (type === 'wb_sample_group') html = typeof _buildWbSampleGroupDetail === 'function' ? _buildWbSampleGroupDetail(data) : '';
    else if (type === 'dilution') html = _buildDilutionDetail(data);
    else if (type === 'wb_extract') html = typeof _buildWbExtractDetail === 'function' ? _buildWbExtractDetail(data) : '';
    else if (type === 'wb_electro') html = typeof _buildWbElectroDetail === 'function' ? _buildWbElectroDetail(data) : '';
    else if (type === 'wb_detect') html = typeof _buildWbDetectDetail === 'function' ? _buildWbDetectDetail(data) : '';
    else if (type === 'sample') html = _buildSampleDetail(data);
    else if (type === 'animal_log') html = _buildAnimalLogDetail(data);
    else if (type === 'if_log') html = _buildIfLogDetail(data);
    else if (type === 'bioinfo_log') html = _buildGenericWorkflowDetail(data, '生信分析', 'ti-chart-dots-3');
    else if (type === 'other_log') html = _buildGenericWorkflowDetail(data, '其他实验', 'ti-tool');
    else if (type === 'cell_harvest_log') html = _buildGenericWorkflowDetail(data, '细胞取样', 'ti-vials');
    else if (type === 'animal_harvest_log') html = _buildGenericWorkflowDetail(data, '动物取材', 'ti-database-plus');
    else if (type === 'patient_harvest_log') html = _buildGenericWorkflowDetail(data, '患者取材', 'ti-user-heart');
    else if (type === 'sendout_log') html = _buildGenericWorkflowDetail(data, '公司送样', 'ti-truck-delivery');
    else if (type === 'primer_antibody_log') html = _buildGenericWorkflowDetail(data, '抗体引物', 'ti-vaccine-bottle');
    else if (type === 'reagent_log') html = _buildGenericWorkflowDetail(data, '其他试剂', 'ti-bottle');
    else html = `<div style="font-size:12px;color:var(--text-secondary);padding:8px">类型[${type}]未配置详情模板</div>`;
    if (!['sample', 'passage', 'dilution'].includes(type)) html += _rdTraceSampleTable(data);
    return html;
};

/* ── 通用卡片容器 ── */
function _rdStatusStyle(data, meta) {
    let status = String((data && data.status) || (meta && meta.typeLabel) || '');
    if (/中途保存|暂存|草稿|需重复|失败/.test(status)) return 'background:#fff0f0;border-color:#f3b6b6;';
    if (/进行中|待处理|待观察|待收样/.test(status)) return 'background:#fff8dd;border-color:#ead58a;';
    if (/已完成|完成|已取材|已记录|可用/.test(status)) return 'background:#edf8ef;border-color:#aad8b2;';
    return '';
}

window.buildRecordCard = function ({ key, type, data, meta, extraButtons, detailHtml }) {
    let m = meta || {}, isExpanded = !!_RECORD_EXPANDED[key];
    let htmlContent = detailHtml !== undefined ? detailHtml : buildRecordDetailHTML(type, data);
    let arrow = isExpanded ? 'rotate(90deg)' : '';
    let customBg = _rdStatusStyle(data || {}, m) || (m.bgColor ? `background:${m.bgColor};` : '');
    return `
    <div class="rd-card" style="${customBg}">
        <div class="rd-card-header" onclick="toggleRecordDetail('${key}')" style="cursor:pointer">
            <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
                <i class="ti ${m.icon || 'ti-file'}" style="color:${m.color || 'var(--text-secondary)'};flex-shrink:0;font-size:17px"></i>
                <div style="flex:1;min-width:0">
                    <div class="rd-card-title">${data.name || data.profile || '记录'}</div>
                    <div class="rd-card-sub">${m.typeLabel || ''} · ${(data.timestamp || data.created_at || '').substring(0, 16)}</div>
                </div>
            </div>
            <div class="rd-card-actions" style="display:flex;align-items:center;gap:4px;flex-shrink:0" onclick="event.stopPropagation()">
                ${extraButtons || ''}
                <i id="rd-arrow-${key}" class="ti ti-chevron-right" style="color:var(--text-tertiary);font-size:14px;transition:transform 0.2s;transform:${arrow};pointer-events:none"></i>
            </div>
        </div>
        <div id="rd-${key}" class="rd-detail-panel ${isExpanded ? 'open' : ''}" style="display:${isExpanded ? 'block' : 'none'};margin-top:10px;border-top:1px dashed var(--border);padding-top:10px;">
            ${htmlContent}
        </div>
    </div>`;
};

