/* ============================================================
   animal_module.js  ģ&ȡģ
   ============================================================ */

const ANIMAL_STATE = {
    calc: {
        weight: 25, // gram
        dose: 10,   // mg/kg
        stock: 5    // mg/ml
    }
};

function renderAnimalCalc() {
    let html = `
    <div class="card" style="margin-bottom:12px;">
        <div class="card-header"><i class="ti ti-vaccine"></i> ҩע</div>
        
        <div class="form-row">
            <div class="form-group">
                <label class="form-label"> (g)</label>
                <input type="number" class="form-input" id="anWeight" value="${ANIMAL_STATE.calc.weight}" onchange="anUpdateCalc()">
            </div>
            <div class="form-group">
                <label class="form-label">Ŀҩ (mg/kg)</label>
                <input type="number" class="form-input" id="anDose" value="${ANIMAL_STATE.calc.dose}" onchange="anUpdateCalc()">
            </div>
        </div>

        <div class="form-row">
            <div class="form-group">
                <label class="form-label">ҩҺĸҺŨ (mg/mL)</label>
                <input type="number" class="form-input" id="anStock" value="${ANIMAL_STATE.calc.stock}" onchange="anUpdateCalc()">
            </div>
            <div class="form-group">
                <label class="form-label">ע (L)</label>
                <div class="rd-readonly-val" id="anVolRes" style="color:var(--danger);font-weight:bold">-</div>
            </div>
        </div>
        
        <div class="rd-note">
            <i class="ti ti-info-circle"></i> ʽ(kg)  (mg/kg)  Ũ(mg/mL) = ע(mL) -> 1000  L ʾ
        </div>
    </div>
    `;
    document.getElementById('animalCalc').innerHTML = html;
    anUpdateCalc();
}

window.anUpdateCalc = function() {
    let w_g = parseFloat(document.getElementById('anWeight').value) || 0;
    let d = parseFloat(document.getElementById('anDose').value) || 0;
    let c = parseFloat(document.getElementById('anStock').value) || 1;
    
    // w_g in grams -> w_kg = w_g / 1000
    // total mg = w_kg * d
    // vol ml = total mg / c
    // vol ul = vol ml * 1000
    
    let vol_ul = ((w_g / 1000) * d / c) * 1000;
    
    document.getElementById('anVolRes').innerText = vol_ul.toFixed(1) + ' L';
    
    ANIMAL_STATE.calc.weight = w_g;
    ANIMAL_STATE.calc.dose = d;
    ANIMAL_STATE.calc.stock = c;
};

function renderAnimalLog() {
    let html = `
    <div class="card" style="margin-bottom:12px;">
        <div class="card-header"><i class="ti ti-clipboard-list"></i> ȡĵǼǱ</div>
        
        <div class="form-row">
            <div class="form-group">
                <label class="form-label">ȡ</label>
                <input type="date" class="form-input" id="anLogDate">
            </div>
            <div class="form-group">
                <label class="form-label">ʵ / λ</label>
                <input type="text" class="form-input" id="anLogGroup" placeholder=": Model 1">
            </div>
        </div>

        <div class="form-group">
            <label class="form-label">ż</label>
            <input type="text" class="form-input" id="anLogIds" placeholder=": M1, M2, M3">
        </div>
        
        <div class="form-group">
            <label class="form-label">ȡ/֯</label>
            <div style="display:flex; flex-wrap:wrap; gap:8px;">
                <label style="font-size:13px"><input type="checkbox" checked> ѪҺ (Ѫ/Ѫ)</label>
                <label style="font-size:13px"><input type="checkbox" checked> </label>
                <label style="font-size:13px"><input type="checkbox" checked> </label>
                <label style="font-size:13px"><input type="checkbox"> Ƣ</label>
                <label style="font-size:13px"><input type="checkbox"> </label>
                <label style="font-size:13px"><input type="checkbox"> </label>
                <label style="font-size:13px"><input type="checkbox"> </label>
            </div>
        </div>

        <div class="form-group">
            <label class="form-label">淽ʽλ</label>
            <input type="text" class="form-input" placeholder=": -80  12źУвַ4%ۼȩ">
        </div>

        <button class="btn btn-primary btn-block" style="margin-top:12px;" onclick="anSaveLog()">
            <i class="ti ti-device-floppy"></i> ¼ ()
        </button>
    </div>
    `;
    document.getElementById('animalLog').innerHTML = html;
    let d = document.getElementById('anLogDate');
    if (d) d.value = new Date().toISOString().slice(0, 10);
}

window.anSaveLog = function() {
    showToast('ȡļ¼ѱ棨ʾ');
};

document.addEventListener('DOMContentLoaded', () => {
    renderAnimalCalc();
    renderAnimalLog();
});
