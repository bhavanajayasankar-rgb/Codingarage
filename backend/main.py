from fastapi import FastAPI, Query, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
import io
from typing import List, Optional
from dotenv import load_dotenv
import os

load_dotenv()

groq_api_key = os.getenv("GROQ_API_KEY")


from database import get_db, init_db, User
from models import CloudCost
from schemas import CloudCostResponse, DailyCostResponse, ServiceCostResponse, CostSummaryResponse, BudgetSmsRequest
from auth import SignupRequest, LoginRequest, AuthResponse, authenticate_user, create_user, create_session_token, get_email_for_token, active_sessions
from anomaly_detector import fetch_cloud_costs_as_dataframe, detect_anomalies, get_anomaly_trend
from recommendations import generate_savings_recommendations, get_full_savings_analysis, generate_proactive_recommendations
from ai_agent import query_finops_ai
from report_generator import generate_ai_report
from pdf_generator import generate_report_pdf
from ppt_generator import generate_report_ppt
from excel_generator import generate_report_excel
from azure_cost import fetch_azure_cost
from scheduler import start_scheduler
from sms_service import send_budget_alert

app = FastAPI(title="CodingGarage FinOps Postgres Engine API")

@app.on_event("startup")
def on_startup():
    print("Application starting...")
    # init_db()
    # start_scheduler()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None
    filters: dict | None = None
    budgets: dict[str, float] | None = None


FILTER_FIELDS = ["team", "department", "business_unit", "environment", "application", "owner", "project"]


def apply_filters(df, filters: dict | None = None, **query_filters):
    active_filters = {**{k: v for k, v in query_filters.items() if v}, **(filters or {})}
    if df.empty:
        return df

    filtered = df.copy()
    for field in FILTER_FIELDS:
        value = active_filters.get(field)
        if value and value != "All" and field in filtered.columns:
            filtered = filtered[filtered[field] == value]
    return filtered


def require_auth(authorization: str | None = Header(None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
    token = authorization.removeprefix("Bearer ").strip()
    email = get_email_for_token(token)
    if not email:
        raise HTTPException(status_code=401, detail="Invalid or expired auth token")
    return email


@app.post("/api/auth/signup", response_model=AuthResponse)
def signup(auth_req: SignupRequest, db: Session = Depends(get_db)):
    if not auth_req.name.strip() or not auth_req.email.strip() or not auth_req.password:
        raise HTTPException(status_code=400, detail="Name, email, and password are required.")
    if "@" not in auth_req.email or "." not in auth_req.email:
        raise HTTPException(status_code=400, detail="Enter a valid email address.")
    try:
        user = create_user(db, auth_req.name, auth_req.email, auth_req.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    token = create_session_token(user.email)
    return AuthResponse(name=user.name, email=user.email, auth_token=token, message="Signup successful.")


@app.post("/api/auth/login", response_model=AuthResponse)
def login(auth_req: LoginRequest, db: Session = Depends(get_db)):
    if not auth_req.email.strip() or not auth_req.password:
        raise HTTPException(status_code=400, detail="Email and password are required.")
    user, error = authenticate_user(db, auth_req.email, auth_req.password)
    if not user:
        raise HTTPException(status_code=401, detail=error or "Authentication failed.")

    token = create_session_token(user.email)
    return AuthResponse(name=user.name, email=user.email, auth_token=token, message="Login successful.")


class ProfileUpdate(BaseModel):
    name: str
    email: str
    avatar: str | None = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        if "@" not in v or "." not in v:
            raise ValueError("Enter a valid email address.")
        return v.strip().lower()

    @field_validator("name")
    @classmethod
    def validate_name(cls, v):
        if not v.strip():
            raise ValueError("Name cannot be empty.")
        return v.strip()

@app.get("/api/auth/validate")
def validate_auth(current_user: str = Depends(require_auth), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == current_user).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired auth token")
    return {"name": user.name, "email": user.email, "avatar": user.avatar}

@app.put("/api/auth/profile")
def update_profile(req: ProfileUpdate, current_user: str = Depends(require_auth), authorization: str | None = Header(None), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == current_user).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired auth token")
    existing = db.query(User).filter(User.email == req.email, User.id != user.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="This email is already in use.")
    user.name = req.name
    if req.email != current_user:
        token = authorization.removeprefix("Bearer ").strip() if authorization else None
        if token and token in active_sessions:
            active_sessions[token] = req.email
    user.email = req.email
    if req.avatar is not None:
        user.avatar = req.avatar if req.avatar != '' else None
    db.commit()
    db.refresh(user)
    return {"name": user.name, "email": user.email, "avatar": user.avatar, "message": "Profile updated successfully."}


def get_filter_options(df):
    return {
        field: sorted(df[field].dropna().unique().tolist()) if not df.empty and field in df.columns else []
        for field in FILTER_FIELDS
    }


def build_service_breakdown(df):
    if df.empty:
        return []

    total = df["cost"].sum()
    grouped = df.groupby(["provider", "service", "team", "department", "business_unit", "environment", "application", "owner", "project"]).agg(
        total_cost=("cost", "sum"),
        avg_daily_cost=("cost", "mean"),
        avg_daily_usage=("resource_count", "mean"),
        days=("date", "nunique"),
    ).reset_index()

    breakdown = []
    for _, row in grouped.iterrows():
        breakdown.append({
            "provider": row["provider"],
            "service": row["service"],
            "team": row["team"],
            "department": row["department"],
            "business_unit": row["business_unit"],
            "environment": row["environment"],
            "application": row["application"],
            "owner": row["owner"],
            "project": row["project"],
            "daily_cost": round(row["avg_daily_cost"], 2),
            "monthly_cost": round(row["avg_daily_cost"] * 30, 2),
            "period_cost": round(row["total_cost"], 2),
            "avg_daily_usage": round(row["avg_daily_usage"], 1),
            "percent_of_total": round((row["total_cost"] / total) * 100, 1) if total else 0,
        })
    return sorted(breakdown, key=lambda item: item["period_cost"], reverse=True)


def build_utilization_dashboard(df):
    if df.empty:
        return []

    supported = df[df["resource_type"].isin(["EC2", "RDS"])].copy()
    if supported.empty:
        return []

    rows = supported.groupby(["provider", "service", "resource_type", "team", "application", "owner"]).agg(
        avg_cost=("cost", "mean"),
        avg_cpu=("cpu_utilization", "mean"),
        avg_memory=("memory_utilization", "mean"),
        avg_disk=("disk_utilization", "mean"),
        avg_network=("network_usage", "mean"),
        avg_connections=("connections", "mean"),
        avg_storage=("storage_utilization", "mean"),
        avg_resources=("resource_count", "mean"),
    ).reset_index()

    result = []
    for _, row in rows.iterrows():
        waste_signals = []
        if row["resource_type"] == "EC2":
            if row["avg_cpu"] < 25:
                waste_signals.append("Low CPU")
            if row["avg_memory"] < 45:
                waste_signals.append("Low memory")
            if row["avg_network"] < 200:
                waste_signals.append("Low network")
        if row["resource_type"] == "RDS":
            if row["avg_cpu"] < 35:
                waste_signals.append("Low CPU")
            if row["avg_connections"] < 100:
                waste_signals.append("Low connections")
            if row["avg_storage"] > 85:
                waste_signals.append("Storage pressure")

        result.append({
            "provider": row["provider"],
            "service": row["service"],
            "resource_type": row["resource_type"],
            "team": row["team"],
            "application": row["application"],
            "owner": row["owner"],
            "daily_cost": round(row["avg_cost"], 2),
            "resource_count": round(row["avg_resources"], 1),
            "cpu_utilization": round(row["avg_cpu"], 1),
            "memory_utilization": round(row["avg_memory"], 1),
            "disk_utilization": round(row["avg_disk"], 1),
            "network_usage": round(row["avg_network"], 1),
            "connections": round(row["avg_connections"], 1),
            "storage_utilization": round(row["avg_storage"], 1),
            "waste_signals": waste_signals,
            "status": "Wasted" if waste_signals else "Healthy",
        })
    return result


@app.get("/api/dashboard/summary")
def get_dashboard_summary(
    threshold: float = Query(2.0, description="Anomaly standard deviation multiplier threshold"),
    team: str | None = None,
    department: str | None = None,
    business_unit: str | None = None,
    environment: str | None = None,
    application: str | None = None,
    owner: str | None = None,
    project: str | None = None,
    current_user: str = Depends(require_auth),
    db: Session = Depends(get_db)
):
    db_records = db.query(CloudCost).all()
    full_df = fetch_cloud_costs_as_dataframe(db_records)
    df = apply_filters(full_df, team=team, department=department, business_unit=business_unit, environment=environment, application=application, owner=owner, project=project)

    if df.empty:
        return {"total_cost": 0, "by_provider": {}, "anomaly_count": 0, "anomalies": [], "recommendations": [], "chart_data": [], "filter_options": get_filter_options(full_df), "service_breakdown": [], "utilization": []}

    provider_costs = df.groupby("provider")["cost"].sum().to_dict()
    total_cost = sum(provider_costs.values())

    anomalies = detect_anomalies(df, threshold_multiplier=threshold)
    recs = generate_savings_recommendations(df)

    timeline = df.groupby(["date", "service"])["cost"].sum().unstack().fillna(0).to_dict(orient="index")
    chart_data = [{"date": k, **v} for k, v in timeline.items()]

    return {
        "total_cost": round(total_cost, 2),
        "by_provider": {k: round(v, 2) for k, v in provider_costs.items()},
        "anomaly_count": len(anomalies),
        "anomalies": anomalies,
        "recommendations": recs,
        "chart_data": chart_data,
        "filter_options": get_filter_options(full_df),
        "service_breakdown": build_service_breakdown(df),
        "utilization": build_utilization_dashboard(df),
    }


@app.get("/api/anomalies/trend")
def get_anomaly_trend_data(
    provider: str = Query(..., description="Cloud provider (e.g. AWS)"),
    service: str = Query(..., description="Cloud service name (e.g. EC2)"),
    date: str = Query(..., description="Date when anomaly was registered (YYYY-MM-DD)"),
    current_user: str = Depends(require_auth),
    db: Session = Depends(get_db)
):
    db_records = db.query(CloudCost).all()
    df = fetch_cloud_costs_as_dataframe(db_records)

    trend = get_anomaly_trend(df, provider, service, date, window_days=7)
    if not trend:
        raise HTTPException(
            status_code=404,
            detail=f"Historical cost context for {provider} - {service} on {date} not found."
        )
    return trend


@app.post("/api/chat")
def post_chat_query(req: ChatRequest, current_user: str = Depends(require_auth), db: Session = Depends(get_db)):
    db_records = db.query(CloudCost).all()
    df = apply_filters(fetch_cloud_costs_as_dataframe(db_records), req.filters)

    anomalies = detect_anomalies(df)
    recs = generate_savings_recommendations(df)
    savings_analysis = get_full_savings_analysis(df)

    result = query_finops_ai(
        user_query=req.message,
        session_id=req.session_id,
        df=df,
        anomalies=anomalies,
        recs=recs,
        savings_analysis=savings_analysis,
        budgets=req.budgets
    )
    return result


@app.get("/api/reports/persona")
def get_persona_report(persona: str = Query("executive"), team: str | None = None, current_user: str = Depends(require_auth), db: Session = Depends(get_db)):
    db_records = db.query(CloudCost).all()
    df = apply_filters(fetch_cloud_costs_as_dataframe(db_records), {"team": team} if team else None)

    anomalies = detect_anomalies(df)
    recs = generate_savings_recommendations(df)

    report = generate_ai_report(persona, df, anomalies, recs, team=team)
    return report


@app.get("/api/reports/persona/pdf")
def get_persona_report_pdf(persona: str = Query("executive"), team: str | None = None, current_user: str = Depends(require_auth), db: Session = Depends(get_db)):
    db_records = db.query(CloudCost).all()
    df = apply_filters(fetch_cloud_costs_as_dataframe(db_records), {"team": team} if team else None)

    anomalies = detect_anomalies(df)
    recs = generate_savings_recommendations(df)

    report = generate_ai_report(persona, df, anomalies, recs, team=team)
    pdf_bytes = generate_report_pdf(report, persona)

    team_slug = f"_{team.lower().replace(' ', '_')}" if team else ""
    filename = f"{persona}{team_slug}_report.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )


@app.get("/api/reports/persona/ppt")
def get_persona_report_ppt(persona: str = Query("executive"), team: str | None = None, current_user: str = Depends(require_auth), db: Session = Depends(get_db)):
    db_records = db.query(CloudCost).all()
    df = apply_filters(fetch_cloud_costs_as_dataframe(db_records), {"team": team} if team else None)

    anomalies = detect_anomalies(df)
    recs = generate_savings_recommendations(df)

    report = generate_ai_report(persona, df, anomalies, recs, team=team)
    ppt_bytes = generate_report_ppt(report, persona)

    team_slug = f"_{team.lower().replace(' ', '_')}" if team else ""
    filename = f"{persona}{team_slug}_report.pptx"
    return StreamingResponse(
        io.BytesIO(ppt_bytes),
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )


@app.get("/api/reports/persona/xlsx")
def get_persona_report_xlsx(persona: str = Query("executive"), team: str | None = None, current_user: str = Depends(require_auth), db: Session = Depends(get_db)):
    db_records = db.query(CloudCost).all()
    df = apply_filters(fetch_cloud_costs_as_dataframe(db_records), {"team": team} if team else None)

    anomalies = detect_anomalies(df)
    recs = generate_savings_recommendations(df)

    report = generate_ai_report(persona, df, anomalies, recs, team=team)
    xlsx_bytes = generate_report_excel(report, persona)

    team_slug = f"_{team.lower().replace(' ', '_')}" if team else ""
    filename = f"{persona}{team_slug}_report.xlsx"
    return StreamingResponse(
        io.BytesIO(xlsx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )


@app.get("/api/savings/analysis")
def get_savings_analysis(current_user: str = Depends(require_auth), db: Session = Depends(get_db)):
    db_records = db.query(CloudCost).all()
    df = fetch_cloud_costs_as_dataframe(db_records)
    return get_full_savings_analysis(df)


@app.get("/api/recommendations/proactive")
def get_proactive_recommendations(
    current_user: str = Depends(require_auth),
    db: Session = Depends(get_db),
    team: str | None = None,
    department: str | None = None,
    business_unit: str | None = None,
    environment: str | None = None,
    application: str | None = None,
    owner: str | None = None,
    project: str | None = None,
):
    db_records = db.query(CloudCost).all()
    df = fetch_cloud_costs_as_dataframe(db_records)
    df = apply_filters(df, team=team, department=department, business_unit=business_unit, environment=environment, application=application, owner=owner, project=project)
    return generate_proactive_recommendations(df)


@app.get("/api/costs", response_model=List[CloudCostResponse])
def get_all_costs(
    cloud_provider: Optional[str] = Query(None, description="Filter by cloud provider"),
    service_name: Optional[str] = Query(None, description="Filter by service name"),
    date_from: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    limit: int = Query(100, ge=1, le=1000, description="Max records"),
    db: Session = Depends(get_db),
):
    query = db.query(CloudCost)
    if cloud_provider:
        query = query.filter(CloudCost.cloud_provider == cloud_provider)
    if service_name:
        query = query.filter(CloudCost.service_name.ilike(f"%{service_name}%"))
    if date_from:
        query = query.filter(CloudCost.date >= date_from)
    if date_to:
        query = query.filter(CloudCost.date <= date_to)
    return query.order_by(CloudCost.date.desc()).limit(limit).all()


@app.get("/api/costs/daily", response_model=List[DailyCostResponse])
def get_daily_costs(
    date_from: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    cloud_provider: Optional[str] = Query(None, description="Filter by cloud provider"),
    db: Session = Depends(get_db),
):
    query = db.query(
        CloudCost.date,
        func.sum(CloudCost.cost).label("total_cost"),
        CloudCost.currency,
    )
    if cloud_provider:
        query = query.filter(CloudCost.cloud_provider == cloud_provider)
    if date_from:
        query = query.filter(CloudCost.date >= date_from)
    if date_to:
        query = query.filter(CloudCost.date <= date_to)
    results = query.group_by(CloudCost.date, CloudCost.currency).order_by(CloudCost.date).all()
    return [
        DailyCostResponse(date=r.date, total_cost=float(r.total_cost), currency=r.currency)
        for r in results
    ]


@app.get("/api/costs/services", response_model=List[ServiceCostResponse])
def get_service_costs(
    cloud_provider: Optional[str] = Query(None, description="Filter by cloud provider"),
    db: Session = Depends(get_db),
):
    query = db.query(
        CloudCost.service_name,
        func.sum(CloudCost.cost).label("total_cost"),
        CloudCost.currency,
    )
    if cloud_provider:
        query = query.filter(CloudCost.cloud_provider == cloud_provider)
    results = query.group_by(CloudCost.service_name, CloudCost.currency).order_by(func.sum(CloudCost.cost).desc()).all()
    return [
        ServiceCostResponse(service_name=r.service_name, total_cost=float(r.total_cost), currency=r.currency)
        for r in results
    ]


@app.get("/api/costs/regions")
def get_region_costs(
    cloud_provider: Optional[str] = Query(None, description="Filter by cloud provider"),
    db: Session = Depends(get_db),
):
    query = db.query(
        CloudCost.region,
        func.sum(CloudCost.cost).label("total_cost"),
        CloudCost.currency,
    )
    if cloud_provider:
        query = query.filter(CloudCost.cloud_provider == cloud_provider)
    results = query.filter(CloudCost.region.isnot(None)).group_by(CloudCost.region, CloudCost.currency).order_by(func.sum(CloudCost.cost).desc()).all()
    return [
        {"region": r.region, "total_cost": float(r.total_cost), "currency": r.currency}
        for r in results
    ]


@app.get("/api/costs/resource-groups")
def get_resource_group_costs(
    cloud_provider: Optional[str] = Query(None, description="Filter by cloud provider"),
    db: Session = Depends(get_db),
):
    query = db.query(
        CloudCost.resource_group,
        func.sum(CloudCost.cost).label("total_cost"),
        CloudCost.currency,
    )
    if cloud_provider:
        query = query.filter(CloudCost.cloud_provider == cloud_provider)
    results = query.filter(CloudCost.resource_group.isnot(None)).group_by(CloudCost.resource_group, CloudCost.currency).order_by(func.sum(CloudCost.cost).desc()).all()
    return [
        {"resource_group": r.resource_group, "total_cost": float(r.total_cost), "currency": r.currency}
        for r in results
    ]


@app.get("/api/costs/summary")
def get_cost_summary(
    cloud_provider: Optional[str] = Query(None, description="Filter by cloud provider"),
    db: Session = Depends(get_db),
):
    query = db.query(CloudCost)
    if cloud_provider:
        query = query.filter(CloudCost.cloud_provider == cloud_provider)

    total_cost = query.with_entities(func.sum(CloudCost.cost)).scalar() or 0

    today = date.today()
    current_month_query = db.query(CloudCost).filter(
        func.extract("year", CloudCost.date) == today.year,
        func.extract("month", CloudCost.date) == today.month,
    )
    if cloud_provider:
        current_month_query = current_month_query.filter(CloudCost.cloud_provider == cloud_provider)
    current_month_spend = current_month_query.with_entities(func.sum(CloudCost.cost)).scalar() or 0

    top_service_query = db.query(
        CloudCost.service_name,
        func.sum(CloudCost.cost).label("total"),
    )
    if cloud_provider:
        top_service_query = top_service_query.filter(CloudCost.cloud_provider == cloud_provider)
    top_service = top_service_query.group_by(CloudCost.service_name).order_by(func.sum(CloudCost.cost).desc()).first()
    top_service_name = top_service.service_name if top_service else "N/A"

    currency_row = query.with_entities(CloudCost.currency).first()
    currency = currency_row.currency if currency_row else "USD"

    daily_trend = db.query(
        CloudCost.date,
        func.sum(CloudCost.cost).label("total"),
    )
    if cloud_provider:
        daily_trend = daily_trend.filter(CloudCost.cloud_provider == cloud_provider)
    daily_trend = daily_trend.group_by(CloudCost.date).order_by(CloudCost.date).all()

    if len(daily_trend) >= 2:
        mid = len(daily_trend) // 2
        first_half_avg = sum(float(r.total or 0) for r in daily_trend[:mid]) / mid
        second_half_avg = sum(float(r.total or 0) for r in daily_trend[mid:]) / (len(daily_trend) - mid)
        if second_half_avg > first_half_avg * 1.05:
            cost_trend = "increasing"
        elif second_half_avg < first_half_avg * 0.95:
            cost_trend = "decreasing"
        else:
            cost_trend = "stable"
    else:
        cost_trend = "stable"

    return {
        "total_cost": round(float(total_cost), 2),
        "current_month_spend": round(float(current_month_spend), 2),
        "highest_cost_service": top_service_name,
        "cost_trend": cost_trend,
        "currency": currency,
    }


@app.post("/api/costs/fetch")
def trigger_cost_fetch(db: Session = Depends(get_db)):
    try:
        records = fetch_azure_cost()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Azure cost fetch failed: {exc}")

    if not records:
        raise HTTPException(status_code=502, detail="Failed to fetch Azure cost data")

    inserted = 0
    updated = 0
    for rec in records:
        if isinstance(rec["date"], str):
            rec["date"] = date.fromisoformat(rec["date"])
        existing = db.query(CloudCost).filter(
            CloudCost.cloud_provider == rec["cloud_provider"],
            CloudCost.service_name == rec["service_name"],
            CloudCost.date == rec["date"],
            CloudCost.resource_group == rec.get("resource_group"),
            CloudCost.region == rec.get("region"),
        ).first()
        if existing:
            existing.cost = rec["cost"]
            existing.currency = rec["currency"]
            updated += 1
        else:
            db.add(CloudCost(**rec))
            inserted += 1
    db.commit()
    return {
        "status": "success",
        "inserted": inserted,
        "updated": updated,
        "total": len(records),
    }


@app.get("/api/costs/anomalies")
def get_cost_anomalies(
    threshold: float = Query(2.0, description="Standard deviation multiplier"),
    db: Session = Depends(get_db),
):
    records = db.query(CloudCost).all()
    if not records:
        return {"anomalies": [], "count": 0}

    import pandas as pd
    import numpy as np

    df = pd.DataFrame([
        {"date": r.date.strftime("%Y-%m-%d"), "service": r.service_name, "cost": float(r.cost), "provider": r.cloud_provider}
        for r in records
    ])

    if df.empty:
        return {"anomalies": [], "count": 0}

    df = df.sort_values(["provider", "service", "date"]).reset_index(drop=True)
    anomalies = []

    for (provider, service), group in df.groupby(["provider", "service"]):
        group = group.copy()
        historical = group["cost"].shift(1)
        rolling_mean = historical.rolling(window=7, min_periods=1).mean()
        rolling_std = historical.rolling(window=7, min_periods=1).std().fillna(0)
        rolling_std = rolling_std.replace(0, group["cost"].mean() * 0.05)

        for _, row in group.iterrows():
            limit = rolling_mean.loc[row.name] + (threshold * rolling_std.loc[row.name])
            if row["cost"] > limit and row["cost"] > (rolling_mean.loc[row.name] * 1.3):
                anomalies.append({
                    "date": row["date"],
                    "provider": provider,
                    "service": service,
                    "actual_cost": round(row["cost"], 2),
                    "expected_cost": round(rolling_mean.loc[row.name], 2),
                    "excess_amount": round(row["cost"] - rolling_mean.loc[row.name], 2),
                    "severity": "high" if row["cost"] > limit * 1.4 else "medium",
                })

    return {"anomalies": anomalies, "count": len(anomalies)}


@app.get("/api/costs/forecast")
def get_cost_forecast(db: Session = Depends(get_db)):
    daily = db.query(
        CloudCost.date,
        func.sum(CloudCost.cost).label("total_cost"),
    ).group_by(CloudCost.date).order_by(CloudCost.date).all()

    if len(daily) < 3:
        return {"forecast": None, "message": "Not enough data for forecasting (need at least 3 days)"}

    costs = [float(r.total_cost) for r in daily]
    n = len(costs)
    x = list(range(n))
    x_mean = sum(x) / n
    y_mean = sum(costs) / n

    numerator = sum((xi - x_mean) * (yi - y_mean) for xi, yi in zip(x, costs))
    denominator = sum((xi - x_mean) ** 2 for xi in x)
    slope = numerator / denominator if denominator else 0
    intercept = y_mean - slope * x_mean

    next_30 = [intercept + slope * (n + i) for i in range(30)]
    forecast_total = sum(max(0, v) for v in next_30)

    return {
        "forecast": {
            "next_30_days_total": round(forecast_total, 2),
            "daily_average": round(forecast_total / 30, 2),
            "trend_direction": "increasing" if slope > 0 else "decreasing" if slope < 0 else "stable",
            "slope": round(slope, 4),
        },
        "historical_days": n,
    }


@app.post("/api/budgets/send-sms-alert")
def budget_sms_alert(req: BudgetSmsRequest):
    from sms_service import send_budget_alert, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, USER_PHONE_NUMBER
    try:
        from twilio.rest import Client
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        diff = req.current_cost - req.budget
        body = (
            f"\u26a0\ufe0f Azure Budget Alert\n\n"
            f"Your Azure cloud spending has exceeded the configured budget.\n\n"
            f"Budget: \u20b9{req.budget:,.2f}\n"
            f"Current Cost: \u20b9{req.current_cost:,.2f}\n"
            f"Exceeded By: \u20b9{diff:,.2f}\n\n"
            f"Please review your Azure resources to avoid additional charges.\n\n"
            f"- FinOps Dashboard"
        )
        message = client.messages.create(body=body, from_=TWILIO_PHONE_NUMBER, to=USER_PHONE_NUMBER)
        print(f"[SMS] Sent successfully: SID={message.sid}, status={message.status}", flush=True)
        return {"status": "ok", "sid": message.sid, "twilio_status": message.status}
    except Exception as e:
        print(f"[SMS] FAILED: {e}", flush=True)
        return {"status": "error", "error": str(e)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
