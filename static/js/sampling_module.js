/* ============================================================
   sampling_module.js — 细胞/动物/患者取材与样本库联通
   ============================================================ */

const HARVEST_MATERIALS = ['RNA', '蛋白', '固定', '蜡块', '切片'];
const DEFAULT_TISSUES = ['主动脉', '心脏', '肝', '肾', '肺', '血', '血清', '血浆'];

let HARVEST_STATE = {
    experiments: [],
    animalLogs: [],
    cellHarvestLogs: [],
    animalHarvestLogs: [],
    samples: [],
    cellSourceId: '',
    cellFormOpen: false,
    cellSelected: new Set(),
    cellBatches: [],
    animalSourceId: '',
    animalFormOpen: false,
    animalSelected: new Set(),
    animalBatches: []
};

function hvId(prefix) {
    if (window.crypto && crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function hvDateTimeNow() {
    return new Date().toISOString().substring(0, 16).replace('T', ' ');
}

function hvMaterialOptions(selected = 'RNA') {
    return HARVEST_MATERIALS.map(x => `<option ${x === selected ? 'selected' : ''}>${x}</option>`).join('');
}

function hvFetchJson(url) {
    return fetch(url).then(res => res.json());
}

function hvSampleMaterial(sample) {
    return sample.sample_category || sample.material_category || sample.material_type || '';
}

function hvCellTakenMap(expId) {
    let map = new Map();
    (HARVEST_STATE.samples || []).forEach(sample => {
        if (sample.source_category !== '细胞') return;
        if (sample.source_id !== expId && sample.source_model_id !== expId) return;
        let key = `${sample.plate_name || ''}|${sample.well_id || ''}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(hvSampleMaterial(sample));
    });
    return map;
}

function hvAnimalTakenMap(logId) {
    let map = new Map();
    (HARVEST_STATE.samples || []).forEach(sample => {
        if (sample.source_category !== '动物') return;
        if (sample.source_id !== logId && sample.source_model_id !== logId) return;
        let key = `${sample.animal_id || ''}|${sample.tissue || ''}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(hvSampleMaterial(sample));
    });
    return map;
}

async function hvRefreshBaseData() {
    let responses = await Promise.all([
        hvFetchJson('/api/samples'),
        hvFetchJson('/api/experiments'),
        hvFetchJson('/api/workflows/animal/logs'),
        hvFetchJson('/api/workflows/cell_harvest/logs'),
        hvFetchJson('/api/workflows/animal_harvest/logs')
    ]);
    HARVEST_STATE.samples = responses[0] || [];
    HARVEST_STATE.experiments = responses[1] || [];
    HARVEST_STATE.animalLogs = responses[2] || [];
    HARVEST_STATE.cellHarvestLogs = responses[3] || [];
    HARVEST_STATE.animalHarvestLogs = responses[4] || [];
}

function hvRenderHarvestHistory(module) {
    let logs = module === 'cell_harvest' ? HARVEST_STATE.cellHarvestLogs : HARVEST_STATE.animalHarvestLogs;
    let icon = module === 'cell_harvest' ? 'ti-vials' : 'ti-database-plus';
    let color = module === 'cell_harvest' ? '#629987' : '#c87a3a';
    let label = module === 'cell_harvest' ? '细胞取样' : '动物取材';
    if (!logs.length) return `<div class="empty-state">暂无${label}记录</div>`;
    return logs.map(log => buildRecordCard({
        key: `${module}:${log.id}`,
        type: `${module}_log`,
        data: log,
        meta: { icon, color, typeLabel: `${label} · ${log.status || '已记录'}` },
        extraButtons: `<button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteHarvestLog('${module}','${log.id}')"><i class="ti ti-x"></i></button>`
    })).join('');
}

window.deleteHarvestLog = async function(module, id) {
    if (!confirm('确定删除该取样记录？')) return;
    await fetch(`/api/workflows/${module}/logs/${id}`, { method: 'DELETE' });
    showToast('已删除');
    if (module === 'cell_harvest') await loadCellHarvestModule();
    if (module === 'animal_harvest') await loadAnimalHarvestModule();
};

window.loadCellHarvestModule = async function() {
    await hvRefreshBaseData();
    renderCellHarvestModule();
};

function hvCellSourceOptions() {
    let options = (HARVEST_STATE.experiments || []).filter(exp => Array.isArray(exp.plates) && exp.plates.length > 0 && exp.status !== '已取样');
    if (!HARVEST_STATE.cellSourceId && options[0]) HARVEST_STATE.cellSourceId = options[0].id;
    return options.map(exp => `<option value="${exp.id}" ${exp.id === HARVEST_STATE.cellSourceId ? 'selected' : ''}>${exp.name || '未命名造模'} · ${exp.cell_line || '-'}</option>`).join('');
}

function renderCellHarvestModule() {
    let container = document.getElementById('dtHarvest');
    if (!container) return;
    let sourceOptions = hvCellSourceOptions();
    let exp = HARVEST_STATE.experiments.find(x => x.id === HARVEST_STATE.cellSourceId);
    let historyHtml = `<div class="divider"></div><div class="section-title"><i class="ti ti-history"></i> 细胞取样记录</div>${hvRenderHarvestHistory('cell_harvest')}`;
    if (!HARVEST_STATE.cellFormOpen) {
        container.innerHTML = `${sourceOptions && exp ? `<div class="card"><button class="btn btn-primary btn-block" onclick="HARVEST_STATE.cellFormOpen=true;renderCellHarvestModule()"><i class="ti ti-player-play"></i> 创建细胞取样记录</button></div>` : '<div class="empty-state">暂无可取样的细胞造模记录</div>'}${historyHtml}`;
        return;
    }
    if (!sourceOptions || !exp) {
        container.innerHTML = `<div class="empty-state">暂无可取样的细胞造模记录</div>${historyHtml}`;
        return;
    }
    let taken = hvCellTakenMap(exp.id);
    let plateHtml = (exp.plates || []).map((plate, plateIndex) => hvRenderCellPlate(exp, plate, plateIndex, taken)).join('');
    container.innerHTML = `
        <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;">
                <div style="font-weight:700;font-size:15px;"><i class="ti ti-vials" style="color:var(--primary)"></i> 创建细胞取样记录</div>
                <button class="btn btn-sm btn-secondary" onclick="HARVEST_STATE.cellFormOpen=false;HARVEST_STATE.cellSelected.clear();HARVEST_STATE.cellBatches=[];renderCellHarvestModule()"><i class="ti ti-x"></i></button>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">取样实验名称</label><input class="form-input" id="cellHarvestName" value="${exp.name || ''} 取样"></div>
                <div class="form-group"><label class="form-label">来源造模记录</label><select class="form-select" onchange="HARVEST_STATE.cellSourceId=this.value;HARVEST_STATE.cellSelected.clear();HARVEST_STATE.cellBatches=[];renderCellHarvestModule()">${sourceOptions}</select></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">取样时间</label><input type="datetime-local" class="form-input" id="cellHarvestAt" value="${hvDateTimeNow().replace(' ', 'T')}"></div>
                <div class="form-group"><label class="form-label">批量材料</label><select class="form-select" id="cellBatchMaterial">${hvMaterialOptions('RNA')}</select></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">保存方式/位置</label><input class="form-input" id="cellBatchPres" placeholder="-80C / 4% PFA / 蜡块盒"></div>
                <div class="form-group"><label class="form-label">批次后缀</label><input class="form-input" id="cellBatchSuffix" placeholder="batch1"></div>
            </div>
            <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
                <button class="btn btn-sm btn-secondary" onclick="cellSelectAvailableWells()"><i class="ti ti-checks"></i> 选择未取样孔</button>
                <button class="btn btn-sm btn-secondary" onclick="HARVEST_STATE.cellSelected.clear();renderCellHarvestModule()"><i class="ti ti-square"></i> 清空选择</button>
                <button class="btn btn-sm btn-primary" onclick="cellAddSampleBatch()"><i class="ti ti-plus"></i> 加入取样批次</button>
            </div>
            ${plateHtml}
            <div class="divider"></div>
            <div class="section-title"><i class="ti ti-list-check"></i> 待保存批次</div>
            ${hvRenderCellBatches()}
            <button class="btn btn-success btn-block" style="margin-top:12px" onclick="saveCellHarvest()"><i class="ti ti-device-floppy"></i> 保存细胞取样并入库</button>
        </div>${historyHtml}`;
}

function hvRenderCellPlate(exp, plate, plateIndex, taken) {
    let cfg = CONFIG.plate_configs[plate.plate_type];
    if (!cfg) return '';
    let cells = '';
    for (let r = 0; r < cfg.rows; r++) {
        cells += '<tr>';
        for (let c = 0; c < cfg.cols; c++) {
            let wellId = `${cfg.row_labels[r]}${c + 1}`;
            let key = `${plateIndex}|${wellId}`;
            let takenKey = `${plate.plate_name}|${wellId}`;
            let takenList = taken.get(takenKey) || [];
            let checked = HARVEST_STATE.cellSelected.has(key);
            let protocol = plate.wells?.[wellId]?.protocol_name || '对照';
            let disabled = takenList.length ? 'disabled' : '';
            let cls = takenList.length ? 'sampled' : (checked ? 'selected' : '');
            cells += `<td><button class="harvest-well ${cls}" ${disabled} onclick="cellToggleWell('${key}')" title="${takenList.length ? '已取样' + takenList.join('/') : protocol}"><b>${wellId}</b><small>${takenList.length ? '已取样' + takenList.join('/') : protocol}</small></button></td>`;
        }
        cells += '</tr>';
    }
    return `<div style="margin-top:12px"><div class="section-subtitle" style="font-weight:700">${plate.plate_name} · ${plate.plate_type}</div><div class="plate-grid-container"><table class="harvest-plate"><tbody>${cells}</tbody></table></div></div>`;
}

window.cellToggleWell = function(key) {
    if (HARVEST_STATE.cellSelected.has(key)) HARVEST_STATE.cellSelected.delete(key);
    else HARVEST_STATE.cellSelected.add(key);
    renderCellHarvestModule();
};

window.cellSelectAvailableWells = function() {
    let exp = HARVEST_STATE.experiments.find(x => x.id === HARVEST_STATE.cellSourceId);
    if (!exp) return;
    let taken = hvCellTakenMap(exp.id);
    (exp.plates || []).forEach((plate, plateIndex) => {
        let cfg = CONFIG.plate_configs[plate.plate_type];
        if (!cfg) return;
        for (let r = 0; r < cfg.rows; r++) for (let c = 0; c < cfg.cols; c++) {
            let wellId = `${cfg.row_labels[r]}${c + 1}`;
            if (!taken.has(`${plate.plate_name}|${wellId}`)) HARVEST_STATE.cellSelected.add(`${plateIndex}|${wellId}`);
        }
    });
    renderCellHarvestModule();
};

window.cellAddSampleBatch = function() {
    if (HARVEST_STATE.cellSelected.size === 0) return showToast('需选择孔位', 'error');
    HARVEST_STATE.cellBatches.push({
        id: hvId('cell_batch'),
        material: document.getElementById('cellBatchMaterial').value,
        preservation: document.getElementById('cellBatchPres').value.trim(),
        suffix: document.getElementById('cellBatchSuffix').value.trim(),
        wells: Array.from(HARVEST_STATE.cellSelected)
    });
    HARVEST_STATE.cellSelected.clear();
    renderCellHarvestModule();
};

function hvRenderCellBatches() {
    if (!HARVEST_STATE.cellBatches.length) return '<div class="empty-state" style="padding:12px">尚未加入取样批次</div>';
    return HARVEST_STATE.cellBatches.map((batch, index) => `<div class="sample-row"><div><b>${batch.material}</b><small>${batch.wells.length} 孔 · ${batch.preservation || '-'}${batch.suffix ? ' · ' + batch.suffix : ''}</small></div><button class="btn btn-sm btn-danger" onclick="HARVEST_STATE.cellBatches.splice(${index},1);renderCellHarvestModule()"><i class="ti ti-x"></i></button></div>`).join('');
}

window.saveCellHarvest = async function() {
    let exp = HARVEST_STATE.experiments.find(x => x.id === HARVEST_STATE.cellSourceId);
    if (!exp) return showToast('需选择来源造模记录', 'error');
    if (!HARVEST_STATE.cellBatches.length) return showToast('需加入至少一个取样批次', 'error');
    let collectionId = hvId('cell_harvest');
    let collectionName = document.getElementById('cellHarvestName').value.trim() || `${exp.name} 取样`;
    let harvestedAt = (document.getElementById('cellHarvestAt').value || '').replace('T', ' ') || hvDateTimeNow();
    let createdSamples = [];
    for (let batch of HARVEST_STATE.cellBatches) {
        for (let item of batch.wells) {
            let [plateIndexStr, wellId] = item.split('|');
            let plate = exp.plates[parseInt(plateIndexStr)];
            let well = plate.wells?.[wellId] || {};
            let group = well.protocol_name || '对照';
            let payload = {
                name: `${exp.name}_${plate.plate_name}_${wellId}_${batch.material}${batch.suffix ? '_' + batch.suffix : ''}`,
                sample_category: batch.material,
                material_category: batch.material,
                material_type: batch.material,
                source_category: '细胞',
                source_type: '细胞取样',
                source_label: exp.name,
                source_id: exp.id,
                source_model_id: exp.id,
                collection_id: collectionId,
                collection_name: collectionName,
                plate_name: plate.plate_name,
                plate_type: plate.plate_type,
                well_id: wellId,
                group,
                induction_scheme: group,
                induction_days: plate.induction_days || '',
                induction_frequency: plate.induction_frequency || '',
                harvest_days: plate.harvest_days || '',
                duration: plate.harvest_days ? `${plate.harvest_days}d` : '',
                harvested_at: harvestedAt,
                preservation: batch.preservation,
                status: '可用',
                tags: batch.material === 'RNA' ? ['qPCR'] : batch.material === '蛋白' ? ['WB'] : ['IF']
            };
            let res = await fetch('/api/samples', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            createdSamples.push(await res.json());
        }
    }
    await fetch('/api/workflows/cell_harvest/logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: collectionName, kind: 'cell_harvest', source_id: exp.id, source_label: exp.name, harvested_at: harvestedAt, samples: createdSamples, status: '已取样' }) });
    await hvRefreshBaseData();
    if (cellAllWellsSampled(exp)) {
        await fetch(`/api/experiments/${exp.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...exp, status: '已取样' }) });
    }
    HARVEST_STATE.cellBatches = [];
    HARVEST_STATE.cellSelected.clear();
    HARVEST_STATE.cellFormOpen = false;
    showToast('细胞取样已入库');
    await loadCellHarvestModule();
};

function cellAllWellsSampled(exp) {
    let taken = hvCellTakenMap(exp.id);
    return (exp.plates || []).every(plate => {
        let cfg = CONFIG.plate_configs[plate.plate_type];
        if (!cfg) return true;
        for (let r = 0; r < cfg.rows; r++) for (let c = 0; c < cfg.cols; c++) {
            if (!taken.has(`${plate.plate_name}|${cfg.row_labels[r]}${c + 1}`)) return false;
        }
        return true;
    });
}

window.loadAnimalHarvestModule = async function() {
    await hvRefreshBaseData();
    renderAnimalHarvestModule();
};

function hvAnimalModelLogs() {
    return (HARVEST_STATE.animalLogs || []).filter(log => log.kind === 'modeling' && log.status !== '已取样');
}

function hvAnimalSourceOptions() {
    let logs = hvAnimalModelLogs();
    if (!HARVEST_STATE.animalSourceId && logs[0]) HARVEST_STATE.animalSourceId = logs[0].id;
    return logs.map(log => `<option value="${log.id}" ${log.id === HARVEST_STATE.animalSourceId ? 'selected' : ''}>${log.name || '未命名动物造模'} · ${log.species || '-'}</option>`).join('');
}

function hvExpandAnimals(log) {
    let animals = [];
    (log.groups || []).forEach(group => {
        let count = parseInt(group.count) || 0;
        for (let i = 1; i <= count; i++) {
            let animalId = `${group.prefix || group.name || 'A'}${String(i).padStart(2, '0')}`;
            animals.push({ animal_id: animalId, group: group.name || '', induction_scheme: group.induction_scheme || '', induction_days: group.induction_days || group.duration_days || '', induction_frequency: group.induction_frequency || group.route || '', harvest_days: group.harvest_days || group.duration_days || '', harvest_time: group.harvest_time || '' });
        }
    });
    return animals;
}

function renderAnimalHarvestModule() {
    let container = document.getElementById('animalHarvestView');
    if (!container) return;
    let sourceOptions = hvAnimalSourceOptions();
    let log = HARVEST_STATE.animalLogs.find(x => x.id === HARVEST_STATE.animalSourceId);
    let historyHtml = `<div class="divider"></div><div class="section-title"><i class="ti ti-history"></i> 动物取材记录</div>${hvRenderHarvestHistory('animal_harvest')}`;
    if (!HARVEST_STATE.animalFormOpen) {
        container.innerHTML = `${sourceOptions && log ? `<div class="card"><button class="btn btn-primary btn-block" onclick="HARVEST_STATE.animalFormOpen=true;renderAnimalHarvestModule()"><i class="ti ti-player-play"></i> 创建动物取材记录</button></div>` : '<div class="empty-state">暂无可取材的动物造模记录</div>'}${historyHtml}`;
        return;
    }
    if (!sourceOptions || !log) {
        container.innerHTML = `<div class="empty-state">暂无可取材的动物造模记录</div>${historyHtml}`;
        return;
    }
    let animals = hvExpandAnimals(log);
    let taken = hvAnimalTakenMap(log.id);
    let animalRows = animals.map(animal => {
        let checked = HARVEST_STATE.animalSelected.has(animal.animal_id);
        let takenBits = Array.from(taken.entries()).filter(([key]) => key.startsWith(`${animal.animal_id}|`)).map(([key, materials]) => `${key.split('|')[1]}${materials.join('/')}`);
        return `<label class="sample-pick-item ${checked ? 'active' : ''}"><input type="checkbox" value="${animal.animal_id}" ${checked ? 'checked' : ''} onchange="animalToggleSubject('${animal.animal_id}', this.checked)"><span><b>${animal.animal_id}</b><small>${animal.group || '-'} · ${animal.induction_scheme || '-'}${takenBits.length ? ' · 已取样' + takenBits.join('，') : ''}</small></span></label>`;
    }).join('');
    container.innerHTML = `
        <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;">
                <div style="font-weight:700;font-size:15px;"><i class="ti ti-database-plus" style="color:var(--primary)"></i> 创建动物取材记录</div>
                <button class="btn btn-sm btn-secondary" onclick="HARVEST_STATE.animalFormOpen=false;HARVEST_STATE.animalSelected.clear();HARVEST_STATE.animalBatches=[];renderAnimalHarvestModule()"><i class="ti ti-x"></i></button>
            </div>
            <div class="form-row"><div class="form-group"><label class="form-label">取材实验名称</label><input class="form-input" id="animalHarvestName" value="${log.name || ''} 取材"></div><div class="form-group"><label class="form-label">来源动物造模</label><select class="form-select" onchange="HARVEST_STATE.animalSourceId=this.value;HARVEST_STATE.animalSelected.clear();HARVEST_STATE.animalBatches=[];renderAnimalHarvestModule()">${sourceOptions}</select></div></div>
            <div class="form-row"><div class="form-group"><label class="form-label">取材时间</label><input type="datetime-local" class="form-input" id="animalHarvestAt" value="${hvDateTimeNow().replace(' ', 'T')}"></div><div class="form-group"><label class="form-label">部位</label><input class="form-input" id="animalBatchTissue" list="animalTissueList" placeholder="主动脉/心脏/肝/血"><datalist id="animalTissueList">${DEFAULT_TISSUES.map(x => `<option value="${x}"></option>`).join('')}</datalist></div></div>
            <div class="form-row"><div class="form-group"><label class="form-label">材料类型</label><select class="form-select" id="animalBatchMaterial">${hvMaterialOptions('RNA')}</select></div><div class="form-group"><label class="form-label">保存方式/位置</label><input class="form-input" id="animalBatchPres" placeholder="-80C / 4% PFA / 石蜡盒"></div></div>
            <div class="sample-pick-list" style="max-height:280px;overflow:auto;">${animalRows || '<div class="empty-state">无动物编号</div>'}</div>
            <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;"><button class="btn btn-sm btn-secondary" onclick="animalSelectAllSubjects()"><i class="ti ti-checks"></i> 全选动物</button><button class="btn btn-sm btn-secondary" onclick="HARVEST_STATE.animalSelected.clear();renderAnimalHarvestModule()"><i class="ti ti-square"></i> 清空选择</button><button class="btn btn-sm btn-primary" onclick="animalAddSampleBatch()"><i class="ti ti-plus"></i> 加入取材批次</button></div>
            <div class="divider"></div>
            <div class="section-title"><i class="ti ti-list-check"></i> 待保存批次</div>
            ${hvRenderAnimalBatches()}
            <button class="btn btn-success btn-block" style="margin-top:12px" onclick="saveAnimalHarvest()"><i class="ti ti-device-floppy"></i> 保存动物取材并入库</button>
        </div>${historyHtml}`;
}

window.animalToggleSubject = function(animalId, checked) {
    if (checked) HARVEST_STATE.animalSelected.add(animalId);
    else HARVEST_STATE.animalSelected.delete(animalId);
};

window.animalSelectAllSubjects = function() {
    let log = HARVEST_STATE.animalLogs.find(x => x.id === HARVEST_STATE.animalSourceId);
    hvExpandAnimals(log || {}).forEach(animal => HARVEST_STATE.animalSelected.add(animal.animal_id));
    renderAnimalHarvestModule();
};

window.animalAddSampleBatch = function() {
    if (HARVEST_STATE.animalSelected.size === 0) return showToast('需选择动物编号', 'error');
    let tissue = document.getElementById('animalBatchTissue').value.trim();
    if (!tissue) return showToast('需填写取材部位', 'error');
    let taken = hvAnimalTakenMap(HARVEST_STATE.animalSourceId);
    let duplicated = Array.from(HARVEST_STATE.animalSelected).filter(animalId => taken.has(`${animalId}|${tissue}`));
    if (duplicated.length && !confirm(`${duplicated.join('、')} 已有 ${tissue} 取材记录。是否继续登记本批取材？`)) return;
    HARVEST_STATE.animalBatches.push({ id: hvId('animal_batch'), tissue, material: document.getElementById('animalBatchMaterial').value, preservation: document.getElementById('animalBatchPres').value.trim(), animals: Array.from(HARVEST_STATE.animalSelected) });
    HARVEST_STATE.animalSelected.clear();
    renderAnimalHarvestModule();
};

function hvRenderAnimalBatches() {
    if (!HARVEST_STATE.animalBatches.length) return '<div class="empty-state" style="padding:12px">尚未加入取材批次</div>';
    return HARVEST_STATE.animalBatches.map((batch, index) => `<div class="sample-row"><div><b>${batch.tissue} · ${batch.material}</b><small>${batch.animals.length} 只 · ${batch.preservation || '-'}</small></div><button class="btn btn-sm btn-danger" onclick="HARVEST_STATE.animalBatches.splice(${index},1);renderAnimalHarvestModule()"><i class="ti ti-x"></i></button></div>`).join('');
}

window.saveAnimalHarvest = async function() {
    let log = HARVEST_STATE.animalLogs.find(x => x.id === HARVEST_STATE.animalSourceId);
    if (!log) return showToast('需选择来源动物造模记录', 'error');
    if (!HARVEST_STATE.animalBatches.length) return showToast('需加入取材批次', 'error');
    let animals = hvExpandAnimals(log);
    let byId = new Map(animals.map(item => [item.animal_id, item]));
    let collectionId = hvId('animal_harvest');
    let collectionName = document.getElementById('animalHarvestName').value.trim() || `${log.name} 取材`;
    let harvestedAt = (document.getElementById('animalHarvestAt').value || '').replace('T', ' ') || hvDateTimeNow();
    let createdSamples = [];
    for (let batch of HARVEST_STATE.animalBatches) {
        for (let animalId of batch.animals) {
            let animal = byId.get(animalId) || { animal_id: animalId };
            let payload = { name: `${animalId}_${batch.tissue}_${batch.material}`, sample_category: batch.material, material_category: batch.material, material_type: batch.material, source_category: '动物', source_type: '动物取材', source_label: log.name, source_id: log.id, source_model_id: log.id, collection_id: collectionId, collection_name: collectionName, animal_id: animalId, tissue: batch.tissue, group: animal.group || '', induction_scheme: animal.induction_scheme || '', induction_days: animal.induction_days || '', induction_frequency: animal.induction_frequency || '', harvest_days: animal.harvest_days || '', duration: animal.harvest_days ? `${animal.harvest_days}d` : '', harvested_at: harvestedAt, preservation: batch.preservation, status: '可用', tags: batch.material === 'RNA' ? ['qPCR'] : batch.material === '蛋白' ? ['WB'] : ['IF'] };
            let res = await fetch('/api/samples', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            createdSamples.push(await res.json());
        }
    }
    await fetch('/api/workflows/animal_harvest/logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: collectionName, kind: 'animal_harvest', source_id: log.id, source_label: log.name, harvested_at: harvestedAt, samples: createdSamples, status: '已取样' }) });
    HARVEST_STATE.animalBatches = [];
    HARVEST_STATE.animalSelected.clear();
    HARVEST_STATE.animalFormOpen = false;
    showToast('动物取材已入库');
    await loadAnimalHarvestModule();
};

window.loadPatientHarvestModule = async function() {
    await hvRefreshBaseData();
    let container = document.getElementById('patientHarvestView');
    if (!container) return;
    container.innerHTML = `
        <div class="card">
            <div class="card-header"><i class="ti ti-user-heart"></i> 创建患者取材记录</div>
            <div class="form-row"><div class="form-group"><label class="form-label">取材实验名称</label><input class="form-input" id="patientCollectionName" placeholder="AS 患者血样 2025-01"></div><div class="form-group"><label class="form-label">样本名称</label><input class="form-input" id="patientSampleName" placeholder="P001 plasma"></div></div>
            <div class="form-row"><div class="form-group"><label class="form-label">患者/来源编号</label><input class="form-input" id="patientSourceCode" placeholder="P001 / 门诊编号"></div><div class="form-group"><label class="form-label">部位/样本来源</label><input class="form-input" id="patientBodyPart" placeholder="血液 / 斑块 / 皮肤"></div></div>
            <div class="form-row"><div class="form-group"><label class="form-label">材料类型</label><select class="form-select" id="patientMaterial">${hvMaterialOptions('RNA')}</select></div><div class="form-group"><label class="form-label">保存方式/位置</label><input class="form-input" id="patientPres" placeholder="-80C / FFPE / 4% PFA"></div></div>
            <div class="form-row"><div class="form-group"><label class="form-label">分组/诊断</label><input class="form-input" id="patientGroup" placeholder="Control / AS / AMI"></div><div class="form-group"><label class="form-label">取材时间</label><input type="datetime-local" class="form-input" id="patientHarvestAt" value="${hvDateTimeNow().replace(' ', 'T')}"></div></div>
            <div class="form-group"><label class="form-label">备注</label><textarea class="form-textarea" id="patientNote" rows="2"></textarea></div>
            <button class="btn btn-primary btn-block" onclick="savePatientHarvest()"><i class="ti ti-device-floppy"></i> 保存患者样本并入库</button>
        </div>
        <div class="section-title"><i class="ti ti-database"></i> 患者样本</div>
        ${renderPatientSamples()}`;
};

function renderPatientSamples() {
    let samples = (HARVEST_STATE.samples || []).filter(sample => sample.source_category === '患者');
    if (!samples.length) return '<div class="empty-state">暂无患者样本</div>';
    return samples.map(sample => `<div class="sample-row"><div><b>${sample.name}</b><small>${[sample.sample_category || sample.material_type, sample.body_part || sample.tissue, sample.group, sample.preservation].filter(Boolean).join(' · ')}</small></div><button class="btn btn-sm btn-danger" onclick="deleteSample('${sample.id}')"><i class="ti ti-x"></i></button></div>`).join('');
}

window.savePatientHarvest = async function() {
    let name = document.getElementById('patientSampleName').value.trim();
    let collectionName = document.getElementById('patientCollectionName').value.trim() || '患者取材';
    if (!name) return showToast('需填写样本名称', 'error');
    let material = document.getElementById('patientMaterial').value;
    let collectionId = hvId('patient_harvest');
    let payload = { name, sample_category: material, material_category: material, material_type: material, source_category: '患者', source_type: '患者取材', source_label: collectionName, source_id: document.getElementById('patientSourceCode').value.trim(), collection_id: collectionId, collection_name: collectionName, patient_code: document.getElementById('patientSourceCode').value.trim(), body_part: document.getElementById('patientBodyPart').value.trim(), tissue: document.getElementById('patientBodyPart').value.trim(), group: document.getElementById('patientGroup').value.trim(), harvested_at: (document.getElementById('patientHarvestAt').value || '').replace('T', ' '), preservation: document.getElementById('patientPres').value.trim(), notes: document.getElementById('patientNote').value.trim(), status: '可用', tags: material === 'RNA' ? ['qPCR'] : material === '蛋白' ? ['WB'] : ['IF'] };
    let res = await fetch('/api/samples', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    let sample = await res.json();
    await fetch('/api/workflows/patient_harvest/logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: collectionName, kind: 'patient_harvest', sample, status: '已取样' }) });
    showToast('患者样本已入库');
    await loadPatientHarvestModule();
};
