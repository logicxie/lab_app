# ============================================================
# app.py — 实验小助手 FastAPI 后端
# ============================================================

import uuid
import re
import numpy as np
from datetime import datetime, timedelta
from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional

from database import (
    authenticate_user,
    change_password,
    create_session,
    create_user,
    delete_session,
    ensure_admin_user,
    get_user_by_session,
    list_users,
    load_data,
    save_data,
    load_cell_db,
    save_cell_db,
    reset_current_owner,
    set_current_owner,
)
from config import AREA_MAP, PLATE_CONFIGS, CONCENTRATION_UNITS
from models import gompertz_model, calculate_inverse_N0

app = FastAPI(title="实验小助手 v2")
ensure_admin_user()

AUTH_COOKIE = "lab_session"
PUBLIC_API_PATHS = {
    "/api/auth/session",
    "/api/auth/login",
    "/api/config",
}
WORKFLOW_MODULES = {
    "animal", "if", "bioinfo", "other",
    "cell_harvest", "animal_harvest", "patient_harvest", "sendout",
    "primer_antibody", "reagent"
}
WORKFLOW_TYPES = {"protocols", "logs"}


def _parse_lab_datetime(value) -> Optional[datetime]:
    if not value:
        return None
    text = str(value).strip().replace("T", " ")
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1]
    if "." in text:
        text = text.split(".", 1)[0]
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    try:
        parsed = datetime.fromisoformat(text)
        return parsed.replace(tzinfo=None) if parsed.tzinfo else parsed
    except ValueError:
        return None


def _positive_int(value, default: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed > 0 else default


def _public_user(user):
    if not user:
        return None
    return {
        "username": user.get("username"),
        "display_name": user.get("display_name") or user.get("username"),
        "is_admin": bool(user.get("is_admin")),
    }


def _current_user_from_request(request: Request):
    return getattr(request.state, "user", None)


@app.middleware("http")
async def auth_and_owner_scope(request: Request, call_next):
    path = request.url.path
    token = request.cookies.get(AUTH_COOKIE)
    user = get_user_by_session(token) if token else None

    if path.startswith("/api/") and path not in PUBLIC_API_PATHS and not path.startswith("/api/auth/logout"):
        if not user:
            return JSONResponse({"error": "未登录或登录已过期"}, status_code=401)

    owner_token = set_current_owner(user["username"] if user else "admin")
    request.state.user = user
    try:
        response = await call_next(request)
    finally:
        reset_current_owner(owner_token)
    return response


# ══════════════════════════════════════════════
#  账户认证
# ══════════════════════════════════════════════

class LoginIn(BaseModel):
    username: str
    password: str


class UserCreateIn(BaseModel):
    username: str
    password: str
    display_name: str = ""
    is_admin: bool = False


class PasswordChangeIn(BaseModel):
    old_password: str = ""
    new_password: str


@app.get("/api/auth/session")
async def auth_session(request: Request):
    user = _current_user_from_request(request)
    return {"authenticated": bool(user), "user": _public_user(user)}


@app.post("/api/auth/login")
async def auth_login(payload: LoginIn, response: Response):
    username = payload.username.strip()
    user = authenticate_user(username, payload.password)
    if not user:
        return JSONResponse({"error": "账号或密码错误"}, status_code=401)
    token, expires = create_session(user["username"])
    response.set_cookie(
        AUTH_COOKIE,
        token,
        httponly=True,
        samesite="lax",
        expires=expires.strftime("%a, %d %b %Y %H:%M:%S GMT"),
    )
    return {"ok": True, "user": _public_user(user)}


@app.post("/api/auth/logout")
async def auth_logout(request: Request, response: Response):
    token = request.cookies.get(AUTH_COOKIE)
    delete_session(token)
    response.delete_cookie(AUTH_COOKIE)
    return {"ok": True}


@app.get("/api/auth/users")
async def auth_users(request: Request):
    user = _current_user_from_request(request)
    if not user or not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return list_users()


@app.post("/api/auth/users")
async def auth_create_user(payload: UserCreateIn, request: Request):
    user = _current_user_from_request(request)
    if not user or not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="需要管理员权限")
    username = payload.username.strip()
    if not re.match(r"^[A-Za-z0-9_\-.]{2,32}$", username):
        return JSONResponse({"error": "用户名仅支持 2-32 位字母、数字、下划线、短横线或点"}, status_code=400)
    if len(payload.password) < 6:
        return JSONResponse({"error": "初始密码至少 6 位"}, status_code=400)
    new_user = create_user(username, payload.password, payload.display_name.strip(), payload.is_admin)
    if not new_user:
        return JSONResponse({"error": "用户已存在"}, status_code=400)
    return new_user


@app.put("/api/auth/password")
async def auth_change_password(payload: PasswordChangeIn, request: Request):
    user = _current_user_from_request(request)
    if not user:
        raise HTTPException(status_code=401, detail="未登录")
    if len(payload.new_password) < 6:
        return JSONResponse({"error": "新密码至少 6 位"}, status_code=400)
    ok = change_password(user["username"], payload.old_password, payload.new_password, require_old=True)
    if not ok:
        return JSONResponse({"error": "原密码不正确"}, status_code=400)
    return {"ok": True}

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
    pcr_logs = load_data("pcr_extract_logs", []) + load_data("pcr_qpcr_logs", [])
    workflow_logs = (
        load_data("workflow_animal_logs", []) +
        load_data("workflow_if_logs", []) +
        load_data("workflow_bioinfo_logs", []) +
        load_data("workflow_other_logs", []) +
        load_data("workflow_cell_harvest_logs", []) +
        load_data("workflow_animal_harvest_logs", []) +
        load_data("workflow_patient_harvest_logs", []) +
        load_data("workflow_sendout_logs", []) +
        load_data("workflow_primer_antibody_logs", []) +
        load_data("workflow_reagent_logs", [])
    )

    today_items = [s for s in schedule if s.get("obs_time", "")[:10] == today_str]
    pending = [s for s in schedule
               if s.get("obs_time", "")[:10] > today_str
               and s.get("status", "") not in ("✅ 已完成", "已完成")]
    total_exp = len(experiments) + len(passages) + len(pcr_logs) + len(workflow_logs)
    active_induction = len([e for e in experiments if e.get("status") != "已完成"]) + len([w for w in workflow_logs if w.get("status") in ("进行中", "中途保存")])

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
    workflow_logs = (
        load_data("workflow_animal_logs", []) +
        load_data("workflow_if_logs", []) +
        load_data("workflow_bioinfo_logs", []) +
        load_data("workflow_other_logs", []) +
        load_data("workflow_cell_harvest_logs", []) +
        load_data("workflow_animal_harvest_logs", []) +
        load_data("workflow_patient_harvest_logs", []) +
        load_data("workflow_sendout_logs", []) +
        load_data("workflow_primer_antibody_logs", []) +
        load_data("workflow_reagent_logs", [])
    )

    day_schedules = [s for s in schedule if s.get("obs_time", "")[:10] == date_str]
    day_experiments = [e for e in experiments if e.get("created_at", "")[:10] == date_str]
    day_passages = [p for p in passages if p.get("timestamp", "")[:10] == date_str]
    day_workflows = [w for w in workflow_logs if w.get("created_at", "")[:10] == date_str]

    return {
        "schedules": sorted(day_schedules, key=lambda x: x.get("obs_time", "")),
        "experiments": sorted(day_experiments, key=lambda x: x.get("created_at", "")),
        "passages": sorted(day_passages, key=lambda x: x.get("timestamp", ""), reverse=True),
        "workflows": sorted(day_workflows, key=lambda x: x.get("created_at", ""), reverse=True),
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
    pcr_extract_logs = load_data("pcr_extract_logs", [])
    pcr_rt_logs = load_data("pcr_rt_logs", [])
    qpcr_logs = load_data("pcr_qpcr_logs", [])

    wb_extract = load_data("wb_extract_logs", [])
    wb_electro = load_data("wb_electrophoresis_logs", [])
    wb_detect = load_data("wb_detection_logs", [])
    samples = load_data("sample_inventory", [])
    animal_logs = load_data("workflow_animal_logs", [])
    if_logs = load_data("workflow_if_logs", [])
    bioinfo_logs = load_data("workflow_bioinfo_logs", [])
    other_logs = load_data("workflow_other_logs", [])
    cell_harvest_logs = load_data("workflow_cell_harvest_logs", [])
    animal_harvest_logs = load_data("workflow_animal_harvest_logs", [])
    patient_harvest_logs = load_data("workflow_patient_harvest_logs", [])
    sendout_logs = load_data("workflow_sendout_logs", [])
    primer_antibody_logs = load_data("workflow_primer_antibody_logs", [])
    reagent_logs = load_data("workflow_reagent_logs", [])

    def tag(records, rtype, label_key, time_key):
        result = []
        for r in records:
            if not r.get("id"):
                continue
            label = r.get(label_key) or r.get("id", "")
            ts = r.get(time_key) or r.get("created_at") or r.get("timestamp") or ""
            result.append({"type": rtype, "id": r["id"], "label": label,
                           "date": ts[:10], "timestamp": ts, "data": r})
        return result

    all_records = (
        tag(passages, "passage", "profile", "timestamp") +
        tag(experiments, "experiment", "name", "created_at") +
        tag(pcr_extract_logs, "pcr_extract", "name", "timestamp") +
        tag(pcr_rt_logs, "pcr_rt", "name", "timestamp") +
        tag(qpcr_logs, "pcr_qpcr", "name", "timestamp") +
        tag(wb_extract, "wb_extract", "name", "created_at") +
        tag(wb_electro, "wb_electro", "name", "created_at") +
        tag(wb_detect, "wb_detect", "name", "created_at") +
        tag(samples, "sample", "name", "created_at") +
        tag(animal_logs, "animal_log", "name", "created_at") +
        tag(if_logs, "if_log", "name", "created_at") +
        tag(bioinfo_logs, "bioinfo_log", "name", "created_at") +
        tag(other_logs, "other_log", "name", "created_at") +
        tag(cell_harvest_logs, "cell_harvest_log", "name", "created_at") +
        tag(animal_harvest_logs, "animal_harvest_log", "name", "created_at") +
        tag(patient_harvest_logs, "patient_harvest_log", "name", "created_at") +
        tag(sendout_logs, "sendout_log", "name", "created_at") +
        tag(primer_antibody_logs, "primer_antibody_log", "name", "created_at") +
        tag(reagent_logs, "reagent_log", "name", "created_at")
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
        pt = p.get("plate_type") or "未知板型"
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
        pt = p.get("plate_type") or "未知板型"
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
            harvest_dt = _parse_lab_datetime(plate.get("harvest_time"))
            if not harvest_dt:
                continue
            freq = _positive_int(plate.get("media_change_freq", 2), 2)
            ratio = plate.get("media_change_ratio", "全换")
            plate_name = plate.get("plate_name") or "培养板"
            plate_type = plate.get("plate_type") or "未知板型"

            current_dt = now + timedelta(days=freq)
            mc_count = 1
            while current_dt < harvest_dt:
                schedule.append({
                    "id": str(uuid.uuid4()),
                    "profile": exp_name,
                    "start_time": now.strftime("%Y-%m-%d %H:%M:%S"),
                    "obs_time": current_dt.strftime("%Y-%m-%d %H:%M:%S"),
                    "details": f"[{exp_name}] 💧 {plate_name}({plate_type}) 第{mc_count}次换液 ({ratio})",
                })
                current_dt += timedelta(days=freq)
                mc_count += 1

            schedule.append({
                "id": str(uuid.uuid4()),
                "profile": exp_name,
                "start_time": now.strftime("%Y-%m-%d %H:%M:%S"),
                "obs_time": harvest_dt.strftime("%Y-%m-%d %H:%M:%S"),
                "details": f"[{exp_name}] 🧬 {plate_name}({plate_type}) 收样",
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
                gompertz_model, (N0_arr, t_arr), Nt_arr,
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
                gompertz_model, (N0_arr, t_arr), Nt_arr,
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
    # category: samples, rna, rt, extract, qpcr
    # type: groups, protocols, logs
    if category not in ["samples", "rna", "rt", "extract", "qpcr"] or type not in ["groups", "protocols", "logs"]:
        return JSONResponse({"error": "Invalid path"}, 400)
    return load_data(f"pcr_{category}_{type}", [])

@app.post("/api/pcr/{category}/{type}")
async def save_pcr_data(category: str, type: str, req: Request):
    if category not in ["samples", "rna", "rt", "extract", "qpcr"] or type not in ["groups", "protocols", "logs"]:
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
#  WB (Western Blot) 模块 API
# ══════════════════════════════════════════════

@app.get("/api/wb/{category}/{type}")
async def get_wb_data(category: str, type: str):
    if category not in ["samples", "extract", "electrophoresis", "detection"] or type not in ["groups", "protocols", "logs"]:
        return JSONResponse({"error": "Invalid path"}, 400)
    return load_data(f"wb_{category}_{type}", [])

@app.post("/api/wb/{category}/{type}")
async def save_wb_data(category: str, type: str, req: Request):
    if category not in ["samples", "extract", "electrophoresis", "detection"] or type not in ["groups", "protocols", "logs"]:
        return JSONResponse({"error": "Invalid path"}, 400)
    key = f"wb_{category}_{type}"
    data = await req.json()
    items = load_data(key, [])
    
    if not data.get("id"):
        data["id"] = str(uuid.uuid4())
        if "created_at" not in data:
            data["created_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        items.append(data)
    else:
        found = False
        for i, item in enumerate(items):
            if item.get("id") == data["id"]:
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

@app.delete("/api/wb/{category}/{type}/{item_id}")
async def delete_wb_data(category: str, type: str, item_id: str):
    key = f"wb_{category}_{type}"
    items = load_data(key, [])
    items = [i for i in items if i.get("id") != item_id]
    save_data(key, items)
    return {"ok": True}


# ══════════════════════════════════════════════
#  全局样本库 & 通用实验工作流
# ══════════════════════════════════════════════

def _upsert_item(key: str, data: dict):
    items = load_data(key, [])
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    if not data.get("id"):
        data["id"] = str(uuid.uuid4())
        data.setdefault("created_at", now_str)
        data["updated_at"] = now_str
        items.append(data)
    else:
        found = False
        for idx, item in enumerate(items):
            if item.get("id") == data["id"]:
                data.setdefault("created_at", item.get("created_at", now_str))
                data["updated_at"] = now_str
                items[idx] = data
                found = True
                break
        if not found:
            data.setdefault("created_at", now_str)
            data["updated_at"] = now_str
            items.append(data)
    save_data(key, items)
    return data


def _as_list(value):
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        return [x.strip() for x in re.split(r"[,，;；/、]+", value) if x.strip()]
    return [value]


def _sample_intervention(sample: dict):
    return (
        sample.get("intervention_scheme") or sample.get("induction_scheme") or
        sample.get("treatment_group") or sample.get("group") or sample.get("protocol_name") or ""
    )


def _sample_duration(sample: dict):
    value = sample.get("intervention_duration") or sample.get("duration") or sample.get("induction_days") or sample.get("harvest_days") or ""
    if value in (None, ""):
        return ""
    text = str(value)
    if text and text.replace(".", "", 1).isdigit() and not re.search(r"[a-zA-Z天日周月hHdD]", text):
        return f"{text}d"
    return text


def _sample_unique_name(base_name: str, sample_id: str, existing_items: list):
    base_name = re.sub(r"\s+", " ", (base_name or "样本").strip()) or "样本"
    used = {str(item.get("name", "")).strip().lower() for item in existing_items if item.get("id") != sample_id}
    if base_name.lower() not in used:
        return base_name
    for index in range(2, 1000):
        candidate = f"{base_name}-{index:02d}"
        if candidate.lower() not in used:
            return candidate
    return f"{base_name}-{uuid.uuid4().hex[:6]}"


def _normalize_sample_record(data: dict, existing_items: list):
    data = dict(data or {})
    raw_name = str(data.get("name") or data.get("sample_name") or "样本").strip() or "样本"
    data.setdefault("original_name", raw_name)
    data["tags"] = _as_list(data.get("tags"))
    intervention = _sample_intervention(data)
    duration = _sample_duration(data)
    data["intervention_scheme"] = intervention
    data["intervention_duration"] = duration
    prefix_parts = [part for part in (intervention, duration) if part and part not in raw_name]
    base_name = "-".join(prefix_parts + [raw_name]) if prefix_parts else raw_name
    data["name"] = _sample_unique_name(base_name, data.get("id"), existing_items)
    data["display_name"] = data["name"]
    return data


def _normalize_sample_list(samples: list):
    normalized = []
    changed = False
    for sample in samples or []:
        item = _normalize_sample_record(sample, normalized)
        normalized.append(item)
        if item != sample:
            changed = True
    return normalized, changed


def _record_label(module: str, category: str = ""):
    labels = {
        "experiment_logs": "细胞造模",
        "workflow_animal_logs": "动物造模/取材",
        "workflow_cell_harvest_logs": "细胞取样",
        "workflow_animal_harvest_logs": "动物取材",
        "workflow_patient_harvest_logs": "患者取材",
        "workflow_if_logs": "免疫荧光",
        "workflow_bioinfo_logs": "生信分析",
        "workflow_other_logs": "其他实验",
        "pcr_samples_groups": "PCR样本组",
        "pcr_extract_logs": "PCR提取/逆转录",
        "pcr_qpcr_logs": "qPCR",
        "wb_samples_groups": "WB样本组",
        "wb_extract_logs": "WB提取",
        "wb_electrophoresis_logs": "WB电泳/转膜",
        "wb_detection_logs": "WB检测",
    }
    return labels.get(module, category or module)


def _record_matches_sample(record, sample: dict):
    sample_id = sample.get("id")
    names = {str(x).strip().lower() for x in [sample.get("name"), sample.get("original_name"), sample.get("display_name")] if x}

    def matches(value):
        if value is None:
            return False
        if isinstance(value, dict):
            if sample_id and any(value.get(k) == sample_id for k in ("sample_id", "id", "source_sample_id", "derived_from_id")):
                return True
            for key in ("name", "sample_name", "original", "display_name"):
                if str(value.get(key, "")).strip().lower() in names:
                    return True
            return any(matches(v) for v in value.values() if isinstance(v, (dict, list)))
        if isinstance(value, list):
            return any(matches(item) for item in value)
        text = str(value).strip().lower()
        return bool(text and text in names)

    if sample_id and sample_id in _as_list(record.get("sample_ids")):
        return True
    tracked_fields = (
        "samples", "source_samples", "rt_samples", "run_samples", "all_samples",
        "imported_samples", "membranes", "plate_map", "stripMap", "gels", "laneMap"
    )
    return any(matches(record.get(field)) for field in tracked_fields)


def _record_type_for_key(key: str):
    return {
        "experiment_logs": "experiment",
        "workflow_animal_logs": "animal_log",
        "workflow_cell_harvest_logs": "cell_harvest_log",
        "workflow_animal_harvest_logs": "animal_harvest_log",
        "workflow_patient_harvest_logs": "patient_harvest_log",
        "workflow_if_logs": "if_log",
        "workflow_bioinfo_logs": "bioinfo_log",
        "workflow_other_logs": "other_log",
        "workflow_sendout_logs": "sendout_log",
        "workflow_primer_antibody_logs": "primer_antibody_log",
        "workflow_reagent_logs": "reagent_log",
        "pcr_samples_groups": "pcr_sample_group",
        "pcr_extract_logs": "pcr_extract",
        "pcr_qpcr_logs": "pcr_qpcr",
        "wb_samples_groups": "wb_sample_group",
        "wb_extract_logs": "wb_extract",
        "wb_electrophoresis_logs": "wb_electro",
        "wb_detection_logs": "wb_detect",
    }.get(key, "sample")


def _lineage_record_detail(value, depth=0):
    if value is None or value == "":
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, list):
        items = [_lineage_record_detail(item, depth + 1) for item in value[:24]]
        return [item for item in items if item not in (None, "", [], {})]
    if isinstance(value, dict):
        result = {}
        for key, item in value.items():
            if key in {"password", "password_hash", "token", "session_token"}:
                continue
            if depth >= 3 and isinstance(item, (dict, list)):
                continue
            clean = _lineage_record_detail(item, depth + 1)
            if clean not in (None, "", [], {}):
                result[key] = clean
        return result
    return str(value)


def _build_sample_lineage(sample_id: str):
    samples, changed = _normalize_sample_list(load_data("sample_inventory", []))
    if changed:
        save_data("sample_inventory", samples)
    sample = next((item for item in samples if item.get("id") == sample_id), None)
    if not sample:
        return None

    events = []

    def add_event(stage, title, record=None, detail=None, at=None, record_type=None):
        events.append({
            "stage": stage,
            "title": title,
            "record_id": (record or {}).get("id"),
            "record_name": (record or {}).get("name") or (record or {}).get("source_label"),
            "time": at or (record or {}).get("created_at") or (record or {}).get("harvested_at") or (record or {}).get("harvest_time") or sample.get("created_at"),
            "detail": detail or {},
            "record_type": record_type or "sample",
            "record_detail": _lineage_record_detail(record or sample),
        })

    add_event("入库", "样本入库", sample, detail={
        "材料": sample.get("material_type") or sample.get("sample_category"),
        "干预方案": _sample_intervention(sample),
        "干预/收样时长": _sample_duration(sample),
        "收样时间": sample.get("harvested_at") or sample.get("harvest_time"),
        "保存位置": sample.get("preservation"),
    }, record_type="sample")

    source_ids = {sample.get("source_id"), sample.get("source_model_id"), sample.get("collection_id")}
    source_ids = {x for x in source_ids if x}
    parent_id = sample.get("derived_from_id") or (sample.get("source_id") if str(sample.get("source_type", "")).startswith("固定样本转") else "")
    parent = next((item for item in samples if item.get("id") == parent_id), None)
    if parent:
        add_event("派生", f"由样本 {parent.get('name')} 派生", parent, {"来源样本": parent.get("name"), "来源材料": parent.get("material_type")}, record_type="sample")

    source_keys = [
        "experiment_logs", "workflow_animal_logs", "workflow_cell_harvest_logs",
        "workflow_animal_harvest_logs", "workflow_patient_harvest_logs",
        "pcr_extract_logs", "wb_extract_logs"
    ]
    usage_keys = [
        "workflow_if_logs", "workflow_bioinfo_logs", "workflow_other_logs",
        "pcr_samples_groups", "pcr_extract_logs", "pcr_qpcr_logs",
        "wb_samples_groups", "wb_extract_logs", "wb_electrophoresis_logs", "wb_detection_logs"
    ]

    for key in source_keys:
        for record in load_data(key, []):
            direct_source = record.get("id") in source_ids or record.get("source_id") in source_ids or record.get("source_model_id") in source_ids
            matched = direct_source if key in {"pcr_extract_logs", "wb_extract_logs"} else (direct_source or _record_matches_sample(record, sample))
            if matched:
                add_event("上游", _record_label(key), record, {
                    "状态": record.get("status"),
                    "方案": record.get("protocol_name") or record.get("p_name") or record.get("workflow_name"),
                    "备注": record.get("note") or record.get("result") or record.get("params"),
                }, record_type=_record_type_for_key(key))

    for key in usage_keys:
        for record in load_data(key, []):
            if _record_matches_sample(record, sample):
                add_event("下游使用", _record_label(key), record, {
                    "状态": record.get("status"),
                    "方案": record.get("protocol_name") or record.get("p_name") or record.get("workflow_name"),
                    "结果/备注": record.get("result") or record.get("note") or record.get("params"),
                }, record_type=_record_type_for_key(key))

    events.sort(key=lambda item: item.get("time") or "")
    return {"sample": sample, "events": events}


@app.get("/api/samples")
async def get_samples():
    samples, changed = _normalize_sample_list(load_data("sample_inventory", []))
    if changed:
        save_data("sample_inventory", samples)
    samples.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return samples


@app.post("/api/samples")
async def save_sample(req: Request):
    data = await req.json()
    if not data.get("name"):
        return JSONResponse({"error": "样本名称必填"}, 400)
    data.setdefault("status", "可用")
    data.setdefault("tags", [])
    existing = load_data("sample_inventory", [])
    data = _normalize_sample_record(data, existing)
    return _upsert_item("sample_inventory", data)


@app.get("/api/samples/{sample_id}/lineage")
async def get_sample_lineage(sample_id: str):
    lineage = _build_sample_lineage(sample_id)
    if not lineage:
        return JSONResponse({"error": "样本不存在"}, 404)
    return lineage


@app.delete("/api/samples/{sample_id}")
async def delete_sample(sample_id: str):
    samples = load_data("sample_inventory", [])
    samples = [s for s in samples if s.get("id") != sample_id]
    save_data("sample_inventory", samples)
    return {"ok": True}


@app.get("/api/workflows/{module}/{type}")
async def get_workflow_data(module: str, type: str):
    if module not in WORKFLOW_MODULES or type not in WORKFLOW_TYPES:
        return JSONResponse({"error": "Invalid workflow path"}, 400)
    items = load_data(f"workflow_{module}_{type}", [])
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return items


@app.post("/api/workflows/{module}/{type}")
async def save_workflow_data(module: str, type: str, req: Request):
    if module not in WORKFLOW_MODULES or type not in WORKFLOW_TYPES:
        return JSONResponse({"error": "Invalid workflow path"}, 400)
    data = await req.json()
    if not data.get("name"):
        return JSONResponse({"error": "名称必填"}, 400)
    if type == "protocols":
        steps = data.get("steps", [])
        if isinstance(steps, str):
            data["steps"] = [s.strip() for s in steps.split("\n") if s.strip()]
    return _upsert_item(f"workflow_{module}_{type}", data)


@app.delete("/api/workflows/{module}/{type}/{item_id}")
async def delete_workflow_data(module: str, type: str, item_id: str):
    if module not in WORKFLOW_MODULES or type not in WORKFLOW_TYPES:
        return JSONResponse({"error": "Invalid workflow path"}, 400)
    key = f"workflow_{module}_{type}"
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
