/* ============================================================
   if_module.js  ӫģ
   ============================================================ */

const IF_STATE = {
    calc: {
        totalVolume: 1000, // ul
        primaryRatio: 200, // 1:200
        secondaryRatio: 500 // 1:500
    },
    logs: [] // ¼
};

function renderIfCalc() {
    let html = `
    <div class="card" style="margin-bottom:12px;">
        <div class="card-header"><i class="ti ti-calculator"></i> </div>
        
        <div class="form-group">
            <label class="form-label"> (L)</label>
            <input type="number" class="form-input" id="ifTotVol" value="${IF_STATE.calc.totalVolume}" onchange="ifUpdateCalc()">
        </div>

        <div class="form-row">
            <div class="form-group">
                <label class="form-label">һϡͱ (1:X)</label>
                <input type="number" class="form-input" id="ifPriRatio" value="${IF_STATE.calc.primaryRatio}" onchange="ifUpdateCalc()">
            </div>
            <div class="form-group">
                <label class="form-label">һ (L)</label>
                <div class="rd-readonly-val" id="ifPriRes">-</div>
            </div>
        </div>

        <div class="form-row">
            <div class="form-group">
                <label class="form-label">ϡͱ (1:X)</label>
                <input type="number" class="form-input" id="ifSecRatio" value="${IF_STATE.calc.secondaryRatio}" onchange="ifUpdateCalc()">
            </div>
            <div class="form-group">
                <label class="form-label"> (L)</label>
                <div class="rd-readonly-val" id="ifSecRes">-</div>
            </div>
        </div>
        
        <div class="rd-note">
            <i class="ti ti-info-circle"></i> ʾΪʵʱ 5-10% 
        </div>
    </div>
    `;
    document.getElementById('ifCalc').innerHTML = html;
    ifUpdateCalc();
}

window.ifUpdateCalc = function() {
    let tot = parseFloat(document.getElementById('ifTotVol').value) || 0;
    let priR = parseFloat(document.getElementById('ifPriRatio').value) || 1;
    let secR = parseFloat(document.getElementById('ifSecRatio').value) || 1;
    
    document.getElementById('ifPriRes').innerText = (tot / priR).toFixed(2);
    document.getElementById('ifSecRes').innerText = (tot / secR).toFixed(2);
    
    IF_STATE.calc.totalVolume = tot;
    IF_STATE.calc.primaryRatio = priR;
    IF_STATE.calc.secondaryRatio = secR;
};

function renderIfLog() {
    let html = `
    <div class="card" style="margin-bottom:12px;">
        <div class="card-header"><i class="ti ti-checklist"></i> Ⱦɫ׷</div>
        <div class="form-group">
            <label class="form-label">ʵ/</label>
            <input type="text" class="form-input" id="ifLogName" placeholder="磺293T ϸƬ IF">
        </div>
        
        <div style="display:flex; flex-direction:column; gap:8px;">
            <label class="step-item"><input type="checkbox" class="step-checkbox" id="ifStep1"><div><b>ͨ͸:</b> Triton X-100 (10-15 Min)</div></label>
            <label class="step-item"><input type="checkbox" class="step-checkbox" id="ifStep2"><div><b>:</b> 5% BSA / Ѫ (1 Hour)</div></label>
            <label class="step-item"><input type="checkbox" class="step-checkbox" id="ifStep3"><div><b>һ:</b> 4C ҹ /  1-2h</div></label>
            <label class="step-item"><input type="checkbox" class="step-checkbox" id="ifStep4"><div><b>:</b> ±ܹ (1 Hour)</div></label>
            <label class="step-item"><input type="checkbox" class="step-checkbox" id="ifStep5"><div><b>DAPI Ⱦ:</b> ±ܹ (5-10 Min)</div></label>
            <label class="step-item"><input type="checkbox" class="step-checkbox" id="ifStep6"><div><b>Ƭ:</b> Ƭչ۲</div></label>
        </div>
        
        <button class="btn btn-primary btn-block" style="margin-top:12px;" onclick="ifSaveLog()">
            <i class="ti ti-device-floppy"></i> 洢¼ ()
        </button>
    </div>
    `;
    document.getElementById('ifLog').innerHTML = html;
}

window.ifSaveLog = function() {
    let name = document.getElementById('ifLogName').value || 'δ IF ʵ';
    showToast(`ʵ "${name}" ѱ棨ʾ`);
};

// Hook into module initialization
document.addEventListener('DOMContentLoaded', () => {
    // Need to trigger rendering when module is opened or initially
    renderIfCalc();
    renderIfLog();
});
