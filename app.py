# ============================================================
# app.py — 实验小助手 FastAPI 后端
# ============================================================

import uuid
import re
import numpy as np
from datetime import datetime, timedelta
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional

from database import load_data, save_data, load_cell_db, save_cell_db
from config import AREA_MAP, PLATE_CONFIGS, CONCENTRATION_UNITS
from models import logistic_model, calculate_inverse_N0

app = FastAPI(title="实验小助手 v2")

# 静态文件
app.mount("/static", StaticFiles(directory="static"), name="static")


# ── HTML 入口 ──
@app.get("/", response_class=HTMLResponse)
async def index():
    with open("templates/index.html", "r", encoding="utf-8") as f:
        return HTMLResponse(f.read())


# ══════════════════════════════════════════════
#  首页统计 & 日程
# ══════════════════════════════════════════════

@app.get("/api/stats")
async def get_stats():
    from datetime import date
    today_str = date.today().isoformat()
    schedule = load_data("schedule", [])
    experiments = load_data("experiment_logs", [])
    passages = load_data("passage_history", [])
    pcr_logs = load_data("pcr_rna_logs", []) + load_data("pcr_rt_logs", []) + load_data("pcr_qpcr_logs", [])

    today_items = [s for s in schedule if s.get("obs_time", "")[:10] == today_str]
    pending = [s for s in schedule
               if s.get("obs_time", "")[:10] > today_str
               and s.get("status", "") not in ("✅ 已完成", "已完成")]
    total_exp = len(experiments) + len(passages) + len(pcr_logs)
    active_induction = len([e for e in experiments if e.get("status") != "已完成"])

    return {
        "today_schedules": len(today_items),
        "pending_schedules": len(pending),
        "total_experiments": total_exp,
        "active_experiments": active_induction,
    }


@app.get("/api/schedule")
async def get_schedule():
    return load_data("schedule", [])


@app.get("/api/schedule/date/{date_str}")
async def get_schedule_by_date(date_str: str):
    """获取某天的排期、实验、传代记录"""
    schedule = load_data("schedule", [])
    experiments = load_data("experiment_logs", [])
    passages = load_data("passage_history", [])

    day_schedules = [s for s in schedule if s.get("obs_time", "")[:10] == date_str]
    day_experiments = [e for e in experiments if e.get("created_at", "")[:10] == date_str]
    day_passages = [p for p in passages if p.get("timestamp", "")[:10] == date_str]

    return {
        "schedules": sorted(day_schedules, key=lambda x: x.get("obs_time", "")),
        "experiments": sorted(day_experiments, key=lambda x: x.get("created_at", "")),
        "passages": sorted(day_passages, key=lambda x: x.get("timestamp", ""), reverse=True),
    }

class ScheduleIn(BaseModel):
    profile: str
    obs_time: str
    details: str

@app.post("/api/schedule")
async def create_schedule(s: ScheduleIn):
    schedule = load_data("schedule", [])
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    new_s = {
        "id": str(uuid.uuid4()),
        "profile": s.profile,
        "start_time": now_str,
        "obs_time": s.obs_time,
        "details": s.details,
        "status": "未开始"
    }
    schedule.append(new_s)
    save_data("schedule", schedule)
    return new_s

@app.delete("/api/schedule/{schedule_id}")
async def delete_schedule(schedule_id: str):
    schedule = load_data("schedule", [])
    schedule = [s for s in schedule if s.get("id") != schedule_id]
    save_data("schedule", schedule)
    return {"ok": True}



@app.get("/api/records/all")
async def get_all_records():
    """返回所有实验记录，按类型分组，供日志引用"""
    from datetime import date
    today_str = date.today().isoformat()
    passages = load_data("passage_history", [])
    experiments = load_data("experiment_logs", [])
    rna_logs = load_data("pcr_rna_logs", [])
    rt_logs = load_data("pcr_rt_logs", [])
    qpcr_logs = load_data("pcr_qpcr_logs", [])

    def tag(records, rtype, label_key, time_key):
        result = []
        for r in records:
            label = r.get(label_key) or r.get("id", "")
            ts = r.get(time_key, "")
            result.append({"type": rtype, "id": r["id"], "label": label,
                           "date": ts[:10], "timestamp": ts, "data": r})
        return result

    all_records = (
        tag(passages, "passage", "profile", "timestamp") +
        tag(experiments, "experiment", "name", "created_at") +
        tag(rna_logs, "pcr_rna", "name", "timestamp") +
        tag(rt_logs, "pcr_rt", "name", "timestamp") +
        tag(qpcr_logs, "pcr_qpcr", "name", "timestamp")
    )
    all_records.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return all_records


# ──────────────── 实验日志 ────────────────

@app.get("/api/journals")
async def get_journals():
    journals = load_data("lab_journals", [])
    journals.sort(key=lambda x: x.get("date", ""), reverse=True)
    return journals


@app.get("/api/journals/{date_str}")
async def get_journal_by_date(date_str: str):
    journals = load_data("lab_journals", [])
    for j in journals:
        if j.get("date") == date_str:
            return j
    return {}


@app.post("/api/journals")
async def save_journal(request: Request):
    body = await request.json()
    date_str = body.get("date", datetime.now().strftime("%Y-%m-%d"))
    journals = load_data("lab_journals", [])
    existing = next((j for j in journals if j.get("date") == date_str), None)
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    if existing:
        existing.update({
            "entries": body.get("entries", existing.get("entries", [])),
            "work": body.get("work", ""),
            "result": body.get("result", ""),
            "thinking": body.get("thinking", ""),
            "updated_at": now_str,
        })
    else:
        journals.append({
            "id": str(uuid.uuid4()),
            "date": date_str,
            "entries": body.get("entries", []),
            "work": body.get("work", ""),
            "result": body.get("result", ""),
            "thinking": body.get("thinking", ""),
            "created_at": now_str,
            "updated_at": now_str,
        })
    save_data("lab_journals", journals)
    return {"ok": True}


@app.delete("/api/journals/{date_str}")
async def delete_journal(date_str: str):
    journals = load_data("lab_journals", [])
    journals = [j for j in journals if j.get("date") != date_str]
    save_data("lab_journals", journals)
    return {"ok": True}


@app.get("/api/calendar-marks")
async def get_calendar_marks():
    """获取日历标记数据（每个日期的事项数量）"""
    schedule = load_data("schedule", [])

    marks = {}  # date_str -> count of pending items
    for s in schedule:
        d = s.get("obs_time", "")[:10]
        if not d:
            continue
        if s.get("status") in ("✅ 已完成", "已完成"):
            continue
        marks[d] = marks.get(d, 0) + 1

    return marks


# ══════════════════════════════════════════════
#  造模方案 (Drug Protocols)
# ══════════════════════════════════════════════

@app.get("/api/protocols")
async def get_protocols():
    return load_data("drug_protocols", [])


class ProtocolIn(BaseModel):
    name: str
    base_media: str = "DMEM"
    fbs_conc: str = "10%"
    drugs: list = []   # [{drug_name, work_conc, work_unit}, ...]
    note: str = ""


@app.post("/api/protocols")
async def add_protocol(proto: ProtocolIn):
    protocols = load_data("drug_protocols", [])
    new_proto = proto.dict()
    new_proto["id"] = str(uuid.uuid4())
    new_proto["created_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    protocols.append(new_proto)
    save_data("drug_protocols", protocols)
    return new_proto


@app.put("/api/protocols/{proto_id}")
async def update_protocol(proto_id: str, proto: ProtocolIn):
    protocols = load_data("drug_protocols", [])
    for p in protocols:
        if p["id"] == proto_id:
            p.update(proto.dict())
            save_data("drug_protocols", protocols)
            return p
    return JSONResponse({"error": "not found"}, 404)


@app.delete("/api/protocols/{proto_id}")
async def delete_protocol(proto_id: str):
    protocols = load_data("drug_protocols", [])
    protocols = [p for p in protocols if p["id"] != proto_id]
    save_data("drug_protocols", protocols)
    return {"ok": True}


# ══════════════════════════════════════════════
#  摩尔质量库 (MW Library)
# ══════════════════════════════════════════════

class MwIn(BaseModel):
    name: str
    mw: float

@app.get("/api/mw-library")
async def get_mws():
    return load_data("mw_library", [])

@app.post("/api/mw-library")
async def add_mw(m: MwIn):
    mws = load_data("mw_library", [])
    new_mw = {"id": str(uuid.uuid4()), "name": m.name, "mw": m.mw}
    mws.append(new_mw)
    save_data("mw_library", mws)
    return new_mw

@app.delete("/api/mw-library/{mid}")
async def delete_mw(mid: str):
    mws = load_data("mw_library", [])
    mws = [m for m in mws if m.get("id") != mid]
    save_data("mw_library", mws)
    return {"ok": True}


# ══════════════════════════════════════════════
#  浓度换算
# ══════════════════════════════════════════════

class DilutionIn(BaseModel):
    c1: float
    u1: str
    c2: float
    u2: str
    v2: float
    mw: Optional[float] = None

@app.post("/api/dilution")
async def calculate_dilution(d: DilutionIn):
    molar_units = {"nM": 1e-9, "μM": 1e-6, "mM": 1e-3, "M": 1}
    mass_units = {"ng/mL": 1e-3, "μg/mL": 1, "mg/mL": 1e3, "g/L": 1e3} # mapping to mg/L

    t1 = "molar" if d.u1 in molar_units else "mass"
    t2 = "molar" if d.u2 in molar_units else "mass"

    if t1 != t2:
        if not d.mw or d.mw <= 0:
            return JSONResponse({"error": "跨单位体系（质量与摩尔）换算，请在此配置或直接填写有效的试剂摩尔质量(MW)"}, 400)

    # Normalize to mg/L
    c1n = d.c1 * molar_units[d.u1] * (d.mw if d.mw else 1) * 1000 if t1 == "molar" else d.c1 * mass_units[d.u1]
    c2n = d.c2 * molar_units[d.u2] * (d.mw if d.mw else 1) * 1000 if t2 == "molar" else d.c2 * mass_units[d.u2]

    if c1n <= 0:
        return JSONResponse({"error": "原液浓度不能为 0"}, 400)
    if c2n > c1n:
        return JSONResponse({"error": "工作液浓度不能大于原液浓度"}, 400)

    v1 = (c2n * d.v2) / c1n
    return {"v1_ml": round(v1, 6), "v1_ul": round(v1 * 1000, 2)}

@app.get("/api/dilution/logs")
async def get_dilution_logs():
    return load_data("dilution_logs", [])

@app.post("/api/dilution/logs")
async def add_dilution_log(request: Request):
    data = await request.json()
    logs = load_data("dilution_logs", [])
    data["id"] = str(uuid.uuid4())
    if "created_at" not in data:
        data["created_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    logs.append(data)
    save_data("dilution_logs", logs)
    return data

@app.delete("/api/dilution/logs/{log_id}")
async def delete_dilution_log(log_id: str):
    logs = load_data("dilution_logs", [])
    logs = [l for l in logs if l.get("id") != log_id]
    save_data("dilution_logs", logs)
    return {"ok": True}


# ══════════════════════════════════════════════
#  加药实验日志
# ══════════════════════════════════════════════

@app.get("/api/experiments")
async def get_experiments():
    return load_data("experiment_logs", [])


@app.post("/api/experiments")
async def save_experiment(request: Request):
    body = await request.json()
    exp_name = body.get("name", "")
    plates = body.get("plates", [])
    cell_line = body.get("cell_line", "")
    protocols = body.get("protocols", [])

    if not exp_name:
        return JSONResponse({"error": "请输入实验名称"}, 400)

    now = datetime.now()
    type_counts = {}
    for p in plates:
        pt = p["plate_type"]
        type_counts[pt] = type_counts.get(pt, 0) + 1
    plate_type_summary = "、".join([f"{t}×{n}" for t, n in type_counts.items()])

    log_entry = {
        "id": str(uuid.uuid4()),
        "name": exp_name,
        "cell_line": cell_line,
        "protocols": protocols,
        "plate_type": plate_type_summary,
        "plates": plates,
        "status": "进行中",
        "created_at": now.strftime("%Y-%m-%d %H:%M:%S"),
    }
    logs = load_data("experiment_logs", [])
    logs.append(log_entry)
    save_data("experiment_logs", logs)
    return log_entry


@app.put("/api/experiments/{exp_id}")
async def update_experiment(exp_id: str, request: Request):
    body = await request.json()
    logs = load_data("experiment_logs", [])
    log_entry = next((l for l in logs if l["id"] == exp_id), None)
    if not log_entry:
        return JSONResponse({"error": "not found"}, 404)

    plates = body.get("plates", log_entry.get("plates", []))
    
    type_counts = {}
    for p in plates:
        pt = p["plate_type"]
        type_counts[pt] = type_counts.get(pt, 0) + 1
    plate_type_summary = "、".join([f"{t}×{n}" for t, n in type_counts.items()])

    old_status = log_entry.get("status")
    new_status = body.get("status", old_status)

    log_entry.update({
        "name": body.get("name", log_entry.get("name")),
        "cell_line": body.get("cell_line", log_entry.get("cell_line")),
        "protocols": body.get("protocols", log_entry.get("protocols")),
        "plate_type": plate_type_summary,
        "plates": plates,
        "status": new_status
    })

    save_data("experiment_logs", logs)

    # 如果由"进行中"转为"已完成"，则排期
    if old_status != "已完成" and new_status == "已完成":
        now = datetime.now()
        schedule = load_data("schedule", [])
        exp_name = log_entry.get("name", "")
        for plate in plates:
            if not plate.get("harvest_time"): continue
            harvest_dt = datetime.strptime(plate["harvest_time"], "%Y-%m-%d %H:%M")
            freq = plate.get("media_change_freq", 2)
            ratio = plate.get("media_change_ratio", "全换")

            current_dt = now + timedelta(days=freq)
            mc_count = 1
            while current_dt < harvest_dt:
                schedule.append({
                    "id": str(uuid.uuid4()),
                    "profile": exp_name,
                    "start_time": now.strftime("%Y-%m-%d %H:%M:%S"),
                    "obs_time": current_dt.strftime("%Y-%m-%d %H:%M:%S"),
                    "details": f"[{exp_name}] 💧 {plate['plate_name']}({plate['plate_type']}) 第{mc_count}次换液 ({ratio})",
                })
                current_dt += timedelta(days=freq)
                mc_count += 1

            schedule.append({
                "id": str(uuid.uuid4()),
                "profile": exp_name,
                "start_time": now.strftime("%Y-%m-%d %H:%M:%S"),
                "obs_time": harvest_dt.strftime("%Y-%m-%d %H:%M:%S"),
                "details": f"[{exp_name}] 🧬 {plate['plate_name']}({plate['plate_type']}) 收样",
            })
        save_data("schedule", schedule)

    return log_entry


@app.put("/api/experiments/{exp_id}/toggle_status")
async def toggle_experiment_status(exp_id: str):
    logs = load_data("experiment_logs", [])
    for log in logs:
        if log["id"] == exp_id:
            if log.get("status") != "已完成":
                log["status"] = "已完成"
            else:
                log["status"] = "进行中"
            log["force_status"] = True
            save_data("experiment_logs", logs)
            return log
    return JSONResponse({"error": "not found"}, 404)


@app.delete("/api/experiments/{exp_id}")
async def delete_experiment(exp_id: str):
    logs = load_data("experiment_logs", [])
    logs = [e for e in logs if e["id"] != exp_id]
    save_data("experiment_logs", logs)
    return {"ok": True}


# ══════════════════════════════════════════════
#  细胞档案 & 传代
# ══════════════════════════════════════════════

@app.get("/api/cell-db")
async def get_cell_db():
    return load_cell_db()


@app.post("/api/cell-db")
async def create_cell_profile(request: Request):
    body = await request.json()
    name = body.get("name", "")
    media = body.get("base_media", "")
    fbs = body.get("fbs", "")
    others = body.get("others", "")

    if not name or not media or not fbs:
        return JSONResponse({"error": "名称、培养基、FBS 为必填项"}, 400)

    profile_name = f"{name}_{fbs}"
    db = load_cell_db()
    if profile_name in db:
        return JSONResponse({"error": f"档案 [{profile_name}] 已存在"}, 400)

    db[profile_name] = {
        "params": {"name": name, "base_media": media, "fbs": fbs, "others": others},
        "data": [],
        "r": 0.05,
        "pre_passage_records": [],
    }
    save_cell_db(db)
    return {"name": profile_name, "profile": db[profile_name]}


@app.delete("/api/cell-db/{profile_name}")
async def delete_cell_profile(profile_name: str):
    db = load_cell_db()
    if profile_name in db:
        del db[profile_name]
        save_cell_db(db)
    return {"ok": True}


class PassageCalcIn(BaseModel):
    profile: str
    src_vessel: str
    src_count: int = 1
    src_density: float
    tgt_vessel: str
    tgt_count: int = 1
    tgt_time: float
    tgt_density: float


@app.post("/api/passage/calculate")
async def calculate_passage(c: PassageCalcIn):
    db = load_cell_db()
    if c.profile not in db:
        return JSONResponse({"error": "细胞档案不存在"}, 404)

    r_val = db[c.profile]["r"]
    # 每个目标容器需要的接种密度
    required_N0 = float(calculate_inverse_N0(c.tgt_density, c.tgt_time, r_val))
    # 传代比例 = (目标容器面积 * 目标接种密度 * 目标数量) / (源容器面积 * 源密度 * 源数量)
    passage_ratio = (
        AREA_MAP[c.tgt_vessel] * required_N0 * c.tgt_count
    ) / (
        AREA_MAP[c.src_vessel] * c.src_density * c.src_count
    )
    obs_time = (datetime.now() + timedelta(hours=c.tgt_time)).strftime("%Y-%m-%d %H:%M")

    return {
        "required_N0": round(required_N0, 2),
        "passage_ratio": round(passage_ratio, 6),
        "obs_time": obs_time,
        "r": r_val,
        "src_count": c.src_count,
        "tgt_count": c.tgt_count,
    }


class PassageConfirmIn(BaseModel):
    profile: str
    src_vessel: str
    src_count: int = 1
    src_density: float
    tgt_vessel: str
    tgt_count: int = 1
    tgt_time: float
    tgt_density: float
    required_N0: float
    passage_ratio: float
    note: str = ""


@app.post("/api/passage/confirm")
async def confirm_passage(c: PassageConfirmIn):
    now = datetime.now()
    obs_time = now + timedelta(hours=c.tgt_time)

    record = {
        "id": str(uuid.uuid4()),
        "profile": c.profile,
        "src_vessel": c.src_vessel, "src_count": c.src_count, "src_density": c.src_density,
        "tgt_vessel": c.tgt_vessel, "tgt_count": c.tgt_count, "tgt_time": c.tgt_time,
        "tgt_density": c.tgt_density,
        "required_N0": c.required_N0, "passage_ratio": c.passage_ratio,
        "timestamp": now.strftime("%Y-%m-%d %H:%M:%S"),
        "note": c.note,
    }
    passages = load_data("passage_history", [])
    passages.append(record)
    save_data("passage_history", passages)

    schedule = load_data("schedule", [])
    schedule.append({
        "id": str(uuid.uuid4()),
        "profile": c.profile,
        "start_time": now.strftime("%Y-%m-%d %H:%M:%S"),
        "obs_time": obs_time.strftime("%Y-%m-%d %H:%M:%S"),
        "details": f"从 {c.src_vessel} 传代至 {c.tgt_vessel}。"
                   f"目标密度：{c.tgt_density}%。传代比例: {c.passage_ratio*100:.1f}%。"
                   f"{'备注: ' + c.note if c.note else ''}",
    })
    save_data("schedule", schedule)

    return record


class CalibrationIn(BaseModel):
    profile: str
    src_vessel: str
    src_density: float
    passage_ratio: float
    tgt_vessel: str
    growth_time: float
    final_density: float


@app.post("/api/passage/calibrate")
async def calibrate_model(c: CalibrationIn):
    db = load_cell_db()
    if c.profile not in db:
        return JSONResponse({"error": "细胞档案不存在"}, 404)

    calc_N0 = (c.src_density * AREA_MAP[c.src_vessel] * (c.passage_ratio / 100.0)) / AREA_MAP[c.tgt_vessel]
    new_row = {
        "N0": calc_N0, "t": c.growth_time, "Nt": c.final_density,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    db[c.profile]["data"].append(new_row)

    data = db[c.profile]["data"]
    if len(data) >= 1:
        try:
            from scipy.optimize import curve_fit
            N0_arr = np.array([d["N0"] for d in data])
            t_arr = np.array([d["t"] for d in data])
            Nt_arr = np.array([d["Nt"] for d in data])
            weights = np.linspace(1.0, 5.0, len(data))
            popt, _ = curve_fit(
                logistic_model, (N0_arr, t_arr), Nt_arr,
                p0=[max(0.001, db[c.profile]["r"])],
                bounds=(0.001, 0.5), sigma=1.0 / np.sqrt(weights),
            )
            db[c.profile]["r"] = float(popt[0])
        except Exception:
            pass

    save_cell_db(db)
    return {"r": db[c.profile]["r"], "data_points": len(data)}


class CalibrationUpdateIn(BaseModel):
    profile: str
    data: list

@app.post("/api/passage/calibrate/update")
async def update_calibration_data(c: CalibrationUpdateIn):
    db = load_cell_db()
    if c.profile not in db:
        return JSONResponse({"error": "细胞档案不存在"}, 404)

    db[c.profile]["data"] = c.data
    data = db[c.profile]["data"]
    
    if len(data) >= 1:
        try:
            from scipy.optimize import curve_fit
            N0_arr = np.array([float(d["N0"]) for d in data])
            t_arr = np.array([float(d["t"]) for d in data])
            Nt_arr = np.array([float(d["Nt"]) for d in data])
            weights = np.linspace(1.0, 5.0, len(data))
            popt, _ = curve_fit(
                logistic_model, (N0_arr, t_arr), Nt_arr,
                p0=[max(0.001, db[c.profile]["r"])],
                bounds=(0.001, 0.5), sigma=1.0 / np.sqrt(weights),
            )
            db[c.profile]["r"] = float(popt[0])
        except Exception:
            pass

    save_cell_db(db)
    return {"r": db[c.profile]["r"], "data_points": len(data)}


@app.get("/api/passage/history")
async def get_passage_history():
    return load_data("passage_history", [])


@app.delete("/api/passage/history/{record_id}")
async def delete_passage_record(record_id: str):
    passages = load_data("passage_history", [])
    passages = [p for p in passages if p["id"] != record_id]
    save_data("passage_history", passages)
    return {"ok": True}


# ══════════════════════════════════════════════
#  PCR 模块通用 API (RNA 提取 / 逆转录 / qPCR)
# ══════════════════════════════════════════════

@app.get("/api/pcr/{category}/{type}")
async def get_pcr_data(category: str, type: str):
    # category: samples, rna, rt, qpcr
    # type: groups, protocols, logs
    if category not in ["samples", "rna", "rt", "qpcr"] or type not in ["groups", "protocols", "logs"]:
        return JSONResponse({"error": "Invalid path"}, 400)
    return load_data(f"pcr_{category}_{type}", [])

@app.post("/api/pcr/{category}/{type}")
async def save_pcr_data(category: str, type: str, req: Request):
    if category not in ["samples", "rna", "rt", "qpcr"] or type not in ["groups", "protocols", "logs"]:
        return JSONResponse({"error": "Invalid path"}, 400)
    key = f"pcr_{category}_{type}"
    data = await req.json()
    items = load_data(key, [])
    
    # 查找更新或插入
    if not data.get("id"):
        data["id"] = str(uuid.uuid4())
        if "created_at" not in data:
            data["created_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        items.append(data)
    else:
        found = False
        for i, item in enumerate(items):
            if item.get("id") == data["id"]:
                # preserve original created_at
                if "created_at" not in data and "created_at" in item:
                    data["created_at"] = item["created_at"]
                items[i] = data
                found = True
                break
        if not found:
            if "created_at" not in data:
                data["created_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            items.append(data)
            
    save_data(key, items)
    return data

@app.delete("/api/pcr/{category}/{type}/{item_id}")
async def delete_pcr_data(category: str, type: str, item_id: str):
    key = f"pcr_{category}_{type}"
    items = load_data(key, [])
    items = [i for i in items if i.get("id") != item_id]
    save_data(key, items)
    return {"ok": True}


# ══════════════════════════════════════════════
#  配置信息接口
# ══════════════════════════════════════════════

@app.get("/api/config")
async def get_config():
    return {
        "area_map": AREA_MAP,
        "plate_configs": PLATE_CONFIGS,
        "concentration_units": CONCENTRATION_UNITS,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8501, reload=True)
