// -------------------------------------------------------- SAMPLE SETUP
let _builderSamples = [];
window._curSgExp = null;

window.renderPcrSample = function() {
    let c = document.getElementById('pcrSample');
    if(!c) return;
    
    // Cell profiles options
    let cellOptions = '<option value=\"\">--选择来源--</option>' + Object.keys(STATE.cellDb||{}).map(k=>'<option value=\"'+k+'\">'+k+'</option>').join('');
    // Drug protocols options
    let drugOptions = '<option value=\"\">--选择造模--</option>' + STATE.drugProtocols.map(p=>'<option value=\"'+p.name+'\">'+p.name+'</option>').join('');
    
    // Check if we are in draft mode
    if (window._curSgExp) {
        let exp = window._curSgExp;
        let tableRows = exp.samples.map((s, idx) => `
            <tr>
                <td><button class="btn btn-sm btn-danger" onclick="_removeSgRow(${idx})"><i class="ti ti-x"></i></button></td>
                <td style="font-weight:bold">${s.name}</td>
                <td>
                    <select class="form-select" onchange="window._curSgExp.samples[${idx}].group=this.value">
                        <option value="Control" ${s.group==='Control'?'selected':''}>对照组 (Control)</option>
                        ${STATE.drugProtocols.map(p=>`<option value="${p.name}" ${s.group===p.name?'selected':''}>${p.name}</option>`).join('')}
                    </select>
                </td>
                <td><input type="text" class="form-input" style="width:80px" value="${s.day||''}" placeholder="1d" onchange="window._curSgExp.samples[${idx}].day=this.value"></td>
            </tr>
        `).join('');

        c.innerHTML = `
            <div class="card" style="margin-top:8px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                    <div style="font-weight:700;font-size:15px;"><i class="ti ti-users" style="color:var(--primary)"></i> 样本组设定</div>
                    <button class="btn btn-sm btn-secondary" onclick="window._curSgExp=null;renderPcrSample()"><i class="ti ti-x"></i></button>
                </div>
                
                <div class="form-group">
                    <label class="form-label">样本组名称</label>
                    <input class="form-input" id="sgExpName" value="${exp.name}" oninput="window._curSgExp.name=this.value">
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">来源 (细胞/动物)</label>
                        <select class="form-select" onchange="window._curSgExp.source=this.value">
                            <option value="">--选择来源--</option>
                            ${Object.keys(STATE.cellDb||{}).map(k=>`<option value="${k}" ${exp.source===k?'selected':''}>${k}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">整体设计方案</label>
                        <input class="form-input" value="${exp.scheme||''}" placeholder="TGF-b诱导" oninput="window._curSgExp.scheme=this.value">
                    </div>
                </div>

                <div class="divider"></div>
                <div class="section-title"><i class="ti ti-list"></i> 样本详细信息</div>
                <div class="rt-table-wrapper">
                    <table class="rt-table">
                        <thead>
                            <tr>
                                <th>操作</th>
                                <th>样本名称</th>
                                <th>包含组别</th>
                                <th>诱导天数/时间</th>
                            </tr>
                        </thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>
                
                <!-- Quick Add single sample -->
                <div class="form-row" style="margin-top:12px;">
                    <div class="form-group"><input type="text" id="sgAddSn" class="form-input" placeholder="样本 S4"></div>
                    <button class="btn btn-secondary" onclick="_addSgRow()"><i class="ti ti-plus"></i> 添加一行</button>
                </div>
                
                <button class="btn btn-success btn-block" style="margin-top:16px;" onclick="finishSgExperiment()"><i class="ti ti-circle-check"></i> 完成并保存样本组</button>
            </div>
            
            <div class="divider"></div>
            <div class="section-title"><i class="ti ti-history"></i> 归档记录</div>
            <div id="sgHistoryDiv"></div>
        `;
    } else {
        c.innerHTML = `
            <div class="card" style="margin-top:8px;">
                <button class="btn btn-primary btn-block" onclick="startSgExperiment()">
                    <i class="ti ti-player-play"></i> 开始设定新样本组
                </button>
            </div>
            
            <div class="divider"></div>
            <div class="section-title"><i class="ti ti-history"></i> 归档记录</div>
            <div id="sgHistoryDiv"></div>
        `;
    }
    renderSgHistory();
}

window.startSgExperiment = function() {
    window._curSgExp = {
        name: "", 
        source: "", 
        scheme: "", 
        samples: [{ name: "S1", group: "Control", day: "" }], // Default 1 row
        created_at: new Date().toISOString()
    };
    renderPcrSample();
}

window._addSgRow = function() {
    if(!window._curSgExp) return;
    let sn = document.getElementById('sgAddSn').value.trim();
    if(!sn) { showToast('需填写样本名','warning'); return; }
    window._curSgExp.samples.push({ name: sn, group: "Control", day: "" });
    renderPcrSample();
}

window._removeSgRow = function(idx) {
    if(!window._curSgExp) return;
    window._curSgExp.samples.splice(idx, 1);
    renderPcrSample();
}

window.editSampleGroupP = function(id) {
    let g = PCR_STATE.sampleGroups.find(x => x.id === id);
    if (!g) return;
    window._curSgExp = JSON.parse(JSON.stringify(g));
    window._editingSgId = id;
    renderPcrSample();
    document.getElementById('pcrSample').scrollIntoView({ behavior: 'smooth' });
}

window.finishSgExperiment = async function() {
    if(!window._curSgExp) return;
    if(!window._curSgExp.name) return showToast("需填写样本组名称", "error");
    if(!window._curSgExp.samples || window._curSgExp.samples.length === 0) return showToast("请至少添加一个样本", "error");
    
    let groupData = window._curSgExp;
    if (window._editingSgId) {
        groupData.id = window._editingSgId;
        window._editingSgId = null;
    }
    
    await savePcrItem('sample', 'groups', groupData);
    window._curSgExp = null;
    renderPcrSample(); 
}

window.renderSgHistory = function() {
    let container = document.getElementById('sgHistoryDiv');
    if(!container) return;
    let groups = PCR_STATE.sampleGroups;
    if(!groups || groups.length === 0) {
        container.innerHTML = '<div class="empty-state">暂无归档记录</div>';
        return;
    }
    let sorted = [...groups].reverse();
    container.innerHTML = sorted.map(g => `
        <div class="list-item history-card">
            <div class="list-item-content">
                <div class="list-item-title">${g.name} ${g.status==='中途保存'?'<span class="badge badge-warning">中途保存</span>':''}</div>
                <div class="list-item-subtitle">${g.source || '未指定来源'} | ${g.scheme || '未指定方案'} | ${(g.samples||[]).length} 样本</div>
            </div>
            <div>
                <button class="btn btn-sm btn-secondary" style="padding:2px 7px; margin-right:4px;" onclick="editSampleGroupP('${g.id}')"><i class="ti ti-pencil"></i></button>
                <button class="btn btn-sm btn-danger" onclick="deletePcrItem('sample','groups','${g.id}', event)"><i class="ti ti-x"></i></button>
            </div>
        </div>
    `).join('');
}
