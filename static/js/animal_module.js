/* ============================================================
   animal_module.js — 动物造模、日程排期与取材入库
   ============================================================ */

let ANIMAL_STATE = {
    protocols: [],
    logs: [],
    samples: [],
    calc: { dose: 10, stock: 5, route: 'i.p.', obsDays: '1,3,7' }
};

window.loadAnimalData = async function() {
    let responses = await Promise.all([
        fetch('/api/workflows/animal/protocols'),
        fetch('/api/workflows/animal/logs'),
        fetch('/api/samples')
    ]);
    ANIMAL_STATE.protocols = await responses[0].json();
    ANIMAL_STATE.logs = await responses[1].json();
    ANIMAL_STATE.samples = await responses[2].json();
    if (typeof WORKFLOW_STATE !== 'undefined') WORKFLOW_STATE.samples = ANIMAL_STATE.samples;
    renderAnimalCalc();
};

function animalModelLogs() {
    return (ANIMAL_STATE.logs || []).filter(x => x.kind === 'modeling');
}

function anPad(n) {
    return String(n).padStart(2, '0');
}

function anFormatLocalDateTime(date) {
    return `${date.getFullYear()}-${anPad(date.getMonth() + 1)}-${anPad(date.getDate())}T${anPad(date.getHours())}:${anPad(date.getMinutes())}`;
}

function anReadableDateTime(value) {
    return value ? String(value).replace('T', ' ') : '';
}

function anDateInput(value) {
    if (!value) return '';
    return String(value).substring(0, 16).replace(' ', 'T');
}

function anDateFromStart(startDate, days, hour = 9) {
    let date = startDate ? new Date(`${startDate}T${anPad(hour)}:00`) : new Date();
    date.setDate(date.getDate() + (parseInt(days) || 0));
    date.setHours(hour, 0, 0, 0);
    return anFormatLocalDateTime(date);
}

function anProtocolName(id) {
    let protocol = ANIMAL_STATE.protocols.find(p => p.id === id);
    return protocol ? protocol.name : id;
}

function anProtocolCheckboxes(selected = []) {
    if (!ANIMAL_STATE.protocols.length) return '<div class="empty-state" style="padding:12px">未配置动物诱导方案</div>';
    return ANIMAL_STATE.protocols.map(p => `
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;">
            <input type="checkbox" class="an-proto-cb" value="${p.id}" ${selected.includes(p.id) ? 'checked' : ''} onchange="anProtocolSelectionChanged()">
            ${p.name}
        </label>`).join('');
}

function anGroupSchemeOptions(selected = '') {
    let ids = window._curAnimalExp ? (window._curAnimalExp.protocol_ids || []) : [];
    let options = ['<option value="对照组">对照组</option>'];
    ids.forEach(id => options.push(`<option value="${anProtocolName(id)}">${anProtocolName(id)}</option>`));
    if (selected && !options.some(opt => opt.includes(`value="${selected}"`))) options.push(`<option value="${selected}">${selected}</option>`);
    return options.join('');
}

function renderAnimalCalc() {
    let container = document.getElementById('animalCalc');
    if (!container) return;
    let hasExp = !!window._curAnimalExp;
    let modelingHtml = '';

    if (hasExp) {
        let exp = window._curAnimalExp;
        modelingHtml = `
        <div class="card" style="margin-top:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;">
                <div style="font-weight:700;font-size:15px;"><i class="ti ti-vaccine" style="color:var(--primary)"></i> 动物造模实验详情</div>
                <button class="btn btn-sm btn-secondary" onclick="anCancelModeling()"><i class="ti ti-x"></i></button>
            </div>
            <div class="form-group"><label class="form-label">实验名称</label><input class="form-input" id="anExpName" value="${exp.name || ''}" placeholder="ApoE 小鼠高脂造模" oninput="anSyncModeling()"></div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">动物类型/种属</label><input class="form-input" id="anSpecies" value="${exp.species || ''}" placeholder="C57BL/6J 小鼠 / SD 大鼠" oninput="anSyncModeling()"></div>
                <div class="form-group"><label class="form-label">造模开始日期</label><input type="date" class="form-input" id="anStartDate" value="${exp.start_date || new Date().toISOString().slice(0, 10)}" onchange="anSyncModeling();anRefreshGroupHarvestTimes()"></div>
            </div>
            <div class="form-group">
                <label class="form-label">涉及的诱导方案（从方案库选择，可多选）</label>
                <div style="background:var(--surface-hover);padding:10px;border-radius:8px;border:1px solid var(--border);display:flex;flex-wrap:wrap;gap:12px;">
                    ${anProtocolCheckboxes(exp.protocol_ids || [])}
                </div>
            </div>

            <div class="divider"></div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <div class="section-title" style="margin:0"><i class="ti ti-users-group"></i> 造模组别</div>
                <button class="btn btn-sm btn-secondary" onclick="anAddGroup()"><i class="ti ti-plus"></i> 添加组别</button>
            </div>
            <div id="anGroupCards" class="animal-group-card-list"></div>
            <div class="form-group"><label class="form-label">备注</label><textarea class="form-textarea" id="anModelNote" rows="2" placeholder="伦理编号、饲养条件、异常观察" oninput="anSyncModeling()">${exp.note || ''}</textarea></div>
            <div style="display:flex;gap:8px;margin-top:12px;">
                <button class="btn btn-secondary" style="flex:1" onclick="anSaveModeling('中途保存')"><i class="ti ti-device-floppy"></i> 暂存</button>
                <button class="btn btn-success" style="flex:1" onclick="anSaveModeling('进行中')"><i class="ti ti-calendar-plus"></i> 保存并生成日程</button>
            </div>
        </div>`;
    }

    container.innerHTML = `
        ${hasExp ? modelingHtml : `<div class="card" style="margin-top:8px;"><button class="btn btn-primary btn-block" onclick="anStartModeling()"><i class="ti ti-player-play"></i> 启动动物造模实验</button></div>`}
        <div class="divider"></div>
        <div class="section-title"><i class="ti ti-history"></i> 动物造模记录</div>
        ${renderAnimalHistory('modeling')}`;

    if (hasExp) {
        let list = document.getElementById('anGroupCards');
        if (list) {
            list.innerHTML = '';
            (window._curAnimalExp.groups || []).forEach(group => anAddGroup(group));
            if (!window._curAnimalExp.groups || window._curAnimalExp.groups.length === 0) anAddGroup();
        }
    }
}

window.anStartModeling = function() {
    window._curAnimalExp = {
        kind: 'modeling',
        name: '',
        species: '',
        start_date: new Date().toISOString().slice(0, 10),
        protocol_ids: [],
        protocol_name: '',
        groups: [],
        note: '',
        status: '中途保存'
    };
    renderAnimalCalc();
};

window.anCancelModeling = function() {
    window._curAnimalExp = null;
    renderAnimalCalc();
};

window.anProtocolSelectionChanged = function() {
    anSyncModeling();
    renderAnimalCalc();
};

window.anAddGroup = function(existing = null) {
    let list = document.getElementById('anGroupCards');
    if (!list) return;
    let index = list.children.length + 1;
    let startDate = document.getElementById('anStartDate')?.value || (window._curAnimalExp?.start_date || new Date().toISOString().slice(0, 10));
    let group = existing || {
        name: `组${index}`,
        count: 6,
        week_age: 8,
        prefix: `G${index}-`,
        induction_scheme: '对照组',
        induction_days: 7,
        induction_frequency: '每日',
        harvest_days: 7,
        duration_days: 7,
        obs_days: ANIMAL_STATE.calc.obsDays,
        harvest_time: anDateFromStart(startDate, 7, 9)
    };
    let card = document.createElement('div');
    card.className = 'card animal-group-card';
    card.innerHTML = `
        <div class="card-header" style="justify-content:space-between"><span><i class="ti ti-users-group"></i> 组别 ${index}</span><button class="btn btn-sm btn-danger" onclick="this.closest('.animal-group-card').remove();anSyncGroups()"><i class="ti ti-minus"></i></button></div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">组别</label><input class="form-input an-group-input" data-field="name" value="${group.name || ''}" oninput="anSyncGroups()"></div>
            <div class="form-group"><label class="form-label">数量</label><input type="number" class="form-input an-group-input" data-field="count" value="${group.count || 0}" oninput="anSyncGroups()"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">周龄</label><input type="number" class="form-input an-group-input" data-field="week_age" value="${group.week_age || ''}" oninput="anSyncGroups()"></div>
            <div class="form-group"><label class="form-label">编号前缀</label><input class="form-input an-group-input" data-field="prefix" value="${group.prefix || ''}" oninput="anSyncGroups()"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">诱导方案</label><select class="form-select an-group-input" data-field="induction_scheme" onchange="anSyncGroups()">${anGroupSchemeOptions(group.induction_scheme)}</select></div>
            <div class="form-group"><label class="form-label">诱导频率</label><input class="form-input an-group-input" data-field="induction_frequency" value="${group.induction_frequency || ''}" placeholder="每日 / 隔日 / 每周" oninput="anSyncGroups()"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">诱导天数</label><input type="number" class="form-input an-group-input" data-field="induction_days" value="${group.induction_days || group.duration_days || 0}" oninput="anSyncGroups()"></div>
            <div class="form-group"><label class="form-label">收样天数</label><input type="number" class="form-input an-group-input" data-field="harvest_days" value="${group.harvest_days || group.duration_days || 0}" oninput="anHarvestDaysChanged(this)"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">提醒日</label><input class="form-input an-group-input" data-field="obs_days" value="${group.obs_days || ''}" placeholder="1,3,7" oninput="anSyncGroups()"></div>
            <div class="form-group"><label class="form-label">预计收样时间</label><input type="datetime-local" class="form-input an-group-input" data-field="harvest_time" value="${anDateInput(group.harvest_time)}" oninput="anSyncGroups()"></div>
        </div>`;
    list.appendChild(card);
    card.querySelector('[data-field="induction_scheme"]').value = group.induction_scheme || '对照组';
    anSyncGroups();
};

window.anHarvestDaysChanged = function(input) {
    let row = input.closest('.animal-group-card');
    let startDate = document.getElementById('anStartDate')?.value || new Date().toISOString().slice(0, 10);
    let harvest = row.querySelector('[data-field="harvest_time"]');
    if (harvest) harvest.value = anDateFromStart(startDate, input.value, 9);
    anSyncGroups();
};

window.anRefreshGroupHarvestTimes = function() {
    let startDate = document.getElementById('anStartDate')?.value || new Date().toISOString().slice(0, 10);
    document.querySelectorAll('#anGroupCards .animal-group-card').forEach(row => {
        let days = row.querySelector('[data-field="harvest_days"]')?.value || 0;
        let harvest = row.querySelector('[data-field="harvest_time"]');
        if (harvest) harvest.value = anDateFromStart(startDate, days, 9);
    });
    anSyncGroups();
};

function anSyncGroups() {
    if (!window._curAnimalExp) return;
    let groups = [];
    document.querySelectorAll('#anGroupCards .animal-group-card').forEach(row => {
        let group = {};
        row.querySelectorAll('.an-group-input').forEach(input => {
            let field = input.dataset.field;
            let value = input.value;
            if (['count', 'week_age', 'induction_days', 'harvest_days'].includes(field)) value = parseFloat(value) || 0;
            if (field === 'harvest_time') value = anReadableDateTime(value);
            group[field] = value;
        });
        group.duration_days = group.induction_days || group.harvest_days || 0;
        if (group.name) groups.push(group);
    });
    window._curAnimalExp.groups = groups;
    anSyncModeling(false);
}

window.anSyncModeling = function(syncGroups = true) {
    if (!window._curAnimalExp) return;
    if (syncGroups) anSyncGroups();
    window._curAnimalExp.name = document.getElementById('anExpName')?.value.trim() || window._curAnimalExp.name || '';
    window._curAnimalExp.species = document.getElementById('anSpecies')?.value.trim() || window._curAnimalExp.species || '';
    window._curAnimalExp.start_date = document.getElementById('anStartDate')?.value || window._curAnimalExp.start_date;
    window._curAnimalExp.note = document.getElementById('anModelNote')?.value.trim() || '';
    window._curAnimalExp.protocol_ids = Array.from(document.querySelectorAll('.an-proto-cb:checked')).map(cb => cb.value);
    window._curAnimalExp.protocol_name = window._curAnimalExp.protocol_ids.map(anProtocolName).join('、');
};

function anUpdateDoseSummary() {}

window.anSaveModeling = async function(status) {
    if (!window._curAnimalExp) return;
    anSyncModeling();
    let exp = window._curAnimalExp;
    if (!exp.name) return showToast('需填写实验名称', 'error');
    if (status === '进行中') {
        if (!exp.species) return showToast('需填写动物类型/种属', 'error');
        if (!exp.groups || exp.groups.length === 0) return showToast('需添加至少一个组别', 'error');
    }
    exp.kind = 'modeling';
    exp.status = status;
    let res = await fetch('/api/workflows/animal/logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(exp) });
    let saved = await res.json();
    if (!res.ok) return showToast(saved.error || '保存失败', 'error');
    if (status === '进行中' && !exp.schedule_created) {
        await anCreateSchedules(saved);
        saved.schedule_created = true;
        await fetch('/api/workflows/animal/logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(saved) });
    }
    showToast(status === '进行中' ? '动物造模记录已保存，日程已生成' : '动物造模已暂存');
    window._curAnimalExp = status === '进行中' ? null : saved;
    await loadAnimalData();
};

async function anCreateSchedules(log) {
    let startDate = log.start_date || new Date().toISOString().slice(0, 10);
    for (let group of (log.groups || [])) {
        let days = String(group.obs_days || '').split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x));
        for (let day of days) {
            await fetch('/api/schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    profile: log.name,
                    obs_time: anReadableDateTime(anDateFromStart(startDate, day, 9)),
                    details: `[动物造模] ${group.name} 第 ${day} 天观察/处理：${group.induction_scheme} ${group.induction_frequency || ''}`
                })
            });
        }
        if (group.harvest_time) {
            await fetch('/api/schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    profile: log.name,
                    obs_time: group.harvest_time,
                    details: `[动物造模] ${group.name} 收样：${group.induction_scheme} ${group.duration_days || ''}天`
                })
            });
        }
    }
}

function renderAnimalHarvestSection() {
    let models = animalModelLogs();
    let modelOptions = models.length ? models.map(m => `<option value="${m.id}">${m.name}</option>`).join('') : '<option value="">暂无造模记录</option>';
    return `
        <div class="section-title"><i class="ti ti-database-plus"></i> 取材分流与样本入库</div>
        <div class="card">
            <div class="form-row">
                <div class="form-group"><label class="form-label">取材名称</label><input class="form-input" id="anHarvestName" placeholder="ApoE 第8周取材"></div>
                <div class="form-group"><label class="form-label">来源造模记录</label><select class="form-select" id="anHarvestModel">${modelOptions}</select></div>
            </div>
            <div style="display:flex;gap:8px;margin-bottom:8px;">
                <button class="btn btn-secondary" style="flex:1" onclick="anGenerateHarvestRows()"><i class="ti ti-database-import"></i> 按组别生成样本行</button>
                <button class="btn btn-secondary" style="flex:1" onclick="anAddHarvestRow()"><i class="ti ti-plus"></i> 添加样本</button>
            </div>
            <div class="rt-table-wrapper">
                <table class="rt-table"><thead><tr><th>操作</th><th>样本</th><th>来源</th><th>组别</th><th>诱导</th><th>时长</th><th>收样时间</th><th>组织</th><th>类型</th><th>保存</th><th>用途</th></tr></thead><tbody id="anHarvestTbody"></tbody></table>
            </div>
            <div class="form-group"><label class="form-label">取材备注/异常</label><textarea class="form-textarea" id="anHarvestNote" rows="2" placeholder="灌流、取材顺序、坏死/溶血/样本量不足等..."></textarea></div>
            <button class="btn btn-primary btn-block" onclick="anSaveHarvest()"><i class="ti ti-database-plus"></i> 保存取材记录并入库样本</button>
        </div>
        <div class="section-title"><i class="ti ti-history"></i> 动物取材记录</div>
        ${renderAnimalHistory('harvest')}`;
}

window.anGenerateHarvestRows = function() {
    let modelId = document.getElementById('anHarvestModel')?.value;
    let model = ANIMAL_STATE.logs.find(x => x.id === modelId);
    if (!model) return showToast('需选择来源造模记录', 'error');
    let tbody = document.getElementById('anHarvestTbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    (model.groups || []).forEach(group => {
        let count = Math.max(1, parseInt(group.count) || 1);
        for (let i = 1; i <= count; i++) {
            anAddHarvestRow({
                name: `${group.prefix || group.name}${i}-样本`,
                source: model.name,
                source_model_id: model.id,
                group: group.name,
                induction_scheme: group.induction_scheme,
                duration: `${group.duration_days || ''}d`,
                harvested_at: group.harvest_time,
                tissue: '肝脏',
                material_type: 'RNA',
                preservation: '-80C',
                tags: 'qPCR,WB'
            });
        }
    });
};

window.anAddHarvestRow = function(existing = null) {
    let tbody = document.getElementById('anHarvestTbody');
    if (!tbody) return;
    let row = existing || { name: '', source: '', group: '', induction_scheme: '', duration: '', harvested_at: '', tissue: '', material_type: 'RNA', preservation: '-80C', tags: '' };
    let tr = document.createElement('tr');
    tr.dataset.sourceModelId = row.source_model_id || '';
    tr.innerHTML = `
        <td><button class="btn btn-sm btn-danger" onclick="this.closest('tr').remove();anSyncHarvestRows()"><i class="ti ti-minus"></i></button></td>
        <td><input class="rt-input an-harvest-input" data-field="name" value="${row.name || ''}" oninput="anSyncHarvestRows()"></td>
        <td><input class="rt-input an-harvest-input" data-field="source" value="${row.source || ''}" oninput="anSyncHarvestRows()"></td>
        <td><input class="rt-input an-harvest-input" data-field="group" value="${row.group || ''}" oninput="anSyncHarvestRows()"></td>
        <td><input class="rt-input an-harvest-input" data-field="induction_scheme" value="${row.induction_scheme || ''}" oninput="anSyncHarvestRows()"></td>
        <td><input class="rt-input an-harvest-input" data-field="duration" value="${row.duration || ''}" oninput="anSyncHarvestRows()"></td>
        <td><input type="datetime-local" class="rt-input an-harvest-input" data-field="harvested_at" value="${anDateInput(row.harvested_at)}" oninput="anSyncHarvestRows()"></td>
        <td><input class="rt-input an-harvest-input" data-field="tissue" value="${row.tissue || ''}" oninput="anSyncHarvestRows()"></td>
        <td><input class="rt-input an-harvest-input" data-field="material_type" value="${row.material_type || ''}" oninput="anSyncHarvestRows()"></td>
        <td><input class="rt-input an-harvest-input" data-field="preservation" value="${row.preservation || ''}" oninput="anSyncHarvestRows()"></td>
        <td><input class="rt-input an-harvest-input" data-field="tags" value="${row.tags || ''}" oninput="anSyncHarvestRows()"></td>`;
    tbody.appendChild(tr);
};

window.anSyncHarvestRows = function() {
    return anCollectHarvestRows();
};

function anCollectHarvestRows() {
    let rows = [];
    document.querySelectorAll('#anHarvestTbody tr').forEach(tr => {
        let row = { source_model_id: tr.dataset.sourceModelId || '' };
        tr.querySelectorAll('.an-harvest-input').forEach(input => {
            row[input.dataset.field] = input.dataset.field === 'harvested_at' ? anReadableDateTime(input.value) : input.value.trim();
        });
        if (row.name) rows.push(row);
    });
    return rows;
}

window.anSaveHarvest = async function() {
    let name = document.getElementById('anHarvestName').value.trim();
    if (!name) return showToast('需填写取材名称', 'error');
    let rows = anCollectHarvestRows();
    if (!rows.length) return showToast('需生成或添加样本行', 'error');
    let modelId = document.getElementById('anHarvestModel').value;
    let model = ANIMAL_STATE.logs.find(x => x.id === modelId);
    let payload = {
        kind: 'harvest',
        name,
        source_model_id: modelId,
        source_model_name: model ? model.name : '',
        samples: rows.map(row => ({ ...row, tags: String(row.tags || '').split(/[,，;；/、]+/).map(x => x.trim()).filter(Boolean) })),
        note: document.getElementById('anHarvestNote').value.trim(),
        status: '已完成'
    };
    let res = await fetch('/api/workflows/animal/logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    let saved = await res.json();
    if (!res.ok) return showToast(saved.error || '保存失败', 'error');
    for (let row of payload.samples) {
        await fetch('/api/samples', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: row.name,
                source_type: '动物取材',
                source_id: saved.id,
                source_label: name,
                source_model_id: row.source_model_id || modelId,
                group: row.group,
                induction_scheme: row.induction_scheme,
                duration: row.duration,
                harvested_at: row.harvested_at,
                tissue: row.tissue,
                material_type: row.material_type,
                preservation: row.preservation,
                tags: row.tags,
                status: '可用',
                notes: payload.note
            })
        });
    }
    showToast(`取材已保存，入库 ${rows.length} 个结构化样本`);
    await loadAnimalData();
};

function renderAnimalHistory(kind) {
    let logs = (ANIMAL_STATE.logs || []).filter(x => x.kind === kind);
    if (!logs.length) return '<div class="empty-state">暂无记录</div>';
    return logs.map(log => buildRecordCard({
        key: `animal:${log.id}`,
        type: 'animal_log',
        data: log,
        meta: { icon: kind === 'modeling' ? 'ti-vaccine' : 'ti-database-plus', color: '#c87a3a', typeLabel: kind === 'modeling' ? `动物造模 · ${log.status || '进行中'}` : `动物取材 · ${log.status || '已完成'}` },
        extraButtons: `${kind === 'modeling' ? `<button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();anEditModeling('${log.id}')"><i class="ti ti-pencil"></i></button>` : ''}<button class="btn btn-sm btn-danger" onclick="event.stopPropagation();anDeleteLog('${log.id}')"><i class="ti ti-x"></i></button>`
    })).join('');
}

window.anEditModeling = function(id) {
    let log = ANIMAL_STATE.logs.find(x => x.id === id);
    if (!log) return;
    window._curAnimalExp = JSON.parse(JSON.stringify(log));
    window._curAnimalExp.groups = window._curAnimalExp.groups || [];
    renderAnimalCalc();
};

window.anDeleteLog = async function(id) {
    if (!confirm('确定删除该动物实验记录？已入库样本不会自动删除。')) return;
    await fetch(`/api/workflows/animal/logs/${id}`, { method: 'DELETE' });
    showToast('已删除');
    await loadAnimalData();
};

window.renderAnimalLog = renderAnimalCalc;