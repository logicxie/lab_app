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
        if (arrow) arrow.style.transform = 'rotate(90deg)';
    } else {
        el.style.display = 'none';
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
    ${stripHtml}`;
}

/* ── qPCR ── */
function _buildQpcrDetail(d) {
    let genes = d.genes || [], plateMap = d.plate_map || {};
    let samples = (d.samples || []).map(s => s.name || s).join('、');
    
    // Resolve RT (cDNA) source name
    let rtSourceLabel = d.rt_source_name || d.rt_source || d.rt_log_id || '';
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
    </div>`;
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
    let mwRow = d.mw ? _rdRow(_rdField('摩尔质量', d.mw + ' g/mol'), _rdField('', '')) : '';
    return `
    <div class="card" style="margin-bottom:8px;">
        <div class="card-header"><i class="ti ti-calculator"></i> 换算详情</div>
        ${_rdRow(_rdField('原液浓度 (C₁)', d.c1 + ' ' + d.u1), _rdField('工作液浓度 (C₂)', d.c2 + ' ' + d.u2))}
        ${_rdRow(_rdField('目的体积 (V₂)', d.v2 + ' mL'), _rdField('需加原液', d.v1_ul + ' μL'))}
        ${mwRow}
    </div>`;
}

/* ── 统一入口 ── */
window.buildRecordDetailHTML = function (type, data) {
    if (!data) return '<div style="color:var(--text-tertiary);font-size:12px;padding:8px">无数据</div>';
    if (type === 'passage') return _buildPassageDetail(data);
    if (type === 'experiment') return _buildExperimentDetail(data);
    if (type === 'pcr_rna') return _buildRnaDetail(data);
    if (type === 'pcr_rt') return _buildRtDetail(data);
    if (type === 'pcr_qpcr') return _buildQpcrDetail(data);
    if (type === 'pcr_sample_group') return _buildPcrSampleGroupDetail(data);
    if (type === 'dilution') return _buildDilutionDetail(data);
    return `<div style="font-size:12px;color:var(--text-secondary);padding:8px">类型[${type}]暂无详情模板</div>`;
};

/* ── 通用卡片容器 ── */
window.buildRecordCard = function ({ key, type, data, meta, extraButtons, detailHtml }) {
    let m = meta || {}, isExpanded = !!_RECORD_EXPANDED[key];
    let htmlContent = detailHtml !== undefined ? detailHtml : buildRecordDetailHTML(type, data);
    let arrow = isExpanded ? 'rotate(90deg)' : '';
    let customBg = m.bgColor ? `background:${m.bgColor};` : '';
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
            <div style="display:flex;align-items:center;gap:4px;flex-shrink:0" onclick="event.stopPropagation()">
                ${extraButtons || ''}
                <i id="rd-arrow-${key}" class="ti ti-chevron-right" style="color:var(--text-tertiary);font-size:14px;transition:transform 0.2s;transform:${arrow};pointer-events:none"></i>
            </div>
        </div>
        <div id="rd-${key}" style="display:${isExpanded ? 'block' : 'none'};margin-top:10px;border-top:1px dashed var(--border);padding-top:10px;">
            ${htmlContent}
        </div>
    </div>`;
};

