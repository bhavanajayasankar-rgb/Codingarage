import os
import uuid
import time
from openai import OpenAI

GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
GROQ_BASE_URL = "https://api.groq.com/openai/v1"
MODEL = "llama-3.3-70b-versatile"

conversation_store: dict = {}
SESSION_TTL_SECONDS = 3600
MAX_HISTORY = 20


def detect_report_request(user_query: str) -> dict | None:
    q = user_query.lower()
    report_terms = ["report", "brief", "briefing", "summary", "pdf", "download", "export"]
    fresh_terms = ["updated", "latest", "current", "new", "fresh", "generate", "create", "download", "pdf", "export"]

    if not any(term in q for term in report_terms):
        return None

    # Keep ordinary "summary" questions as chat answers unless the user asks for a deliverable.
    if "summary" in q and not any(term in q for term in fresh_terms + ["report", "briefing"]):
        return None

    persona = "executive"
    if "finance" in q or "financial" in q or "budget" in q:
        persona = "finance"
    elif "engineering" in q or "engineer" in q or "technical" in q or "infra" in q or "infrastructure" in q:
        persona = "engineering"

    return {
        "persona": persona,
        "pdf_url": f"/api/reports/persona/pdf?persona={persona}",
        "filename": f"{persona}_report.pdf",
    }


def get_or_create_session(session_id: str | None = None) -> str:
    if session_id and session_id in conversation_store:
        return session_id
    new_id = str(uuid.uuid4())
    conversation_store[new_id] = {"messages": [], "created_at": time.time()}
    _cleanup_old_sessions()
    return new_id


def _cleanup_old_sessions():
    now = time.time()
    expired = [sid for sid, data in conversation_store.items()
               if now - data["created_at"] > SESSION_TTL_SECONDS]
    for sid in expired:
        del conversation_store[sid]


def build_system_context(df, anomalies, recs, savings_analysis=None, budgets=None) -> str:
    budgets_str = ""
    if budgets:
        budgets_str = "\nConfigure Budgets (Period Limits):\n"
        for provider, limit in budgets.items():
            budgets_str += f"- {provider}: ₹{limit}\n"
    else:
        budgets_str = "No budgets configured."

    summary_table = df.groupby(["provider", "service"])["cost"].agg(
        ["sum", "mean", "min", "max"]
    ).reset_index()
    summary_table.columns = ["provider", "service", "total_spend", "avg_daily", "min_daily", "max_daily"]
    summary_str = summary_table.to_string(index=False)

    anomalies_str = ""
    for a in anomalies[:10]:
        anomalies_str += (
            f"- {a['date']} | {a['provider']} {a['service']} | "
            f"Actual: ₹{a['actual_cost']} | Expected: ₹{a['expected_cost']} | "
            f"Excess: ₹{a['excess_amount']}\n"
        )
    if not anomalies_str:
        anomalies_str = "No anomalies detected."

    recs_str = ""
    for r in recs[:5]:
        recs_str += (
            f"- {r['provider']} {r['service']} | Type: {r['recommendation_type']} | "
            f"Commitment: ₹{r['recommended_commitment_monthly']}/mo | "
            f"Savings: ₹{r['estimated_monthly_savings']}/mo | "
            f"Confidence: {r['confidence_score']}%\n"
        )
    if not recs_str:
        recs_str = "No savings recommendations available."

    savings_str = ""
    if savings_analysis and "services" in savings_analysis:
        qualifying = [s for s in savings_analysis["services"] if s["applicable"]]
        non_qualifying = [s for s in savings_analysis["services"] if not s["applicable"]]
        savings_str = "\nSavings Plan Applicability:\n"
        for s in qualifying:
            savings_str += (
                f"- QUALIFIES: {s['provider']} {s['service']} | "
                f"Current avg: ₹{s['current_daily_avg']}/day | "
                f"Recommended commitment: ₹{s['commitment_monthly']}/mo | "
                f"Estimated savings: ₹{s['savings_monthly']}/mo ({s['savings_annual']}/yr) | "
                f"Confidence: {s['confidence_score']}%\n"
            )
        for s in non_qualifying:
            savings_str += (
                f"- DOES NOT QUALIFY: {s['provider']} {s['service']} | "
                f"Current avg: ₹{s['current_daily_avg']}/day | "
                f"Reason: {s['reasoning']}\n"
            )
        summary = savings_analysis.get("summary", {})
        savings_str += (
            f"\nTotal potential monthly savings: ₹{summary.get('total_monthly_savings', 0)}\n"
            f"Total potential annual savings: ₹{summary.get('total_annual_savings', 0)}\n"
            f"Services qualifying: {summary.get('qualifying_count', 0)}\n"
            f"Services not qualifying: {summary.get('non_qualifying_count', 0)}\n"
        )

    total_cost = df["cost"].sum()
    providers = df["provider"].unique().tolist()
    date_range = f"{df['date'].min()} to {df['date'].max()}" if not df.empty else "N/A"

    return f"""
You are FinOps AI, an expert AI FinOps Consultant for FinOps Intelligence.
You help engineering managers, executives, and finance teams interpret multi-cloud costs across AWS, Azure, and GCP.

You can answer questions about:
- Cost breakdowns by provider, service, or time period
- Anomaly explanations (what happened, likely causes, impact)
- Savings plan recommendations and ROI projections
- Provider comparisons and optimization strategies
- Budget forecasting and trend analysis
- Specific service-level cost details

Always use the actual data below. Never hallucinate figures.
Give comprehensive, detailed answers covering all relevant aspects. Do not truncate or summarize — include the full analysis, all numbers, explanations, and actionable recommendations. Use bullet points, sections, and tables where helpful.

--- CURRENT DATASET ---
Date Range: {date_range}
Cloud Providers: {', '.join(providers)}
Total Spend (dataset): ₹{round(total_cost, 2)}
{budgets_str}

Cost Summary by Provider/Service:
{summary_str}

Detected Cost Anomalies:
{anomalies_str}
Savings Plan / RI Recommendations:
{recs_str}
{savings_str}
--- END DATASET ---
"""


def _build_provider_summary(df) -> dict:
    """Build per-provider cost summaries for data-driven responses."""
    provider_costs = df.groupby("provider")["cost"].sum().to_dict()
    total = sum(provider_costs.values())
    result = {}
    for p, c in provider_costs.items():
        result[p] = {"total": round(c, 2), "percentage": round((c / total) * 100, 1) if total > 0 else 0}
    return result


def _build_service_summary(df) -> dict:
    """Build per-service cost summaries."""
    service_costs = df.groupby(["provider", "service"])["cost"].agg(["sum", "mean"]).reset_index()
    total = df["cost"].sum()
    result = {}
    for _, row in service_costs.iterrows():
        key = f"{row['provider']} {row['service']}"
        result[key] = {
            "total": round(row["sum"], 2),
            "avg_daily": round(row["mean"], 2),
            "monthly": round(row["mean"] * 30, 2),
            "percentage": round((row["sum"] / total) * 100, 1) if total else 0,
        }
    return result


def _build_daily_summary(df) -> dict:
    """Build per-day cost summaries."""
    daily = df.groupby("date")["cost"].sum().to_dict()
    return {str(k): round(v, 2) for k, v in daily.items()}


def get_mock_response(user_query: str, anomalies: list, recs: list, df, savings_analysis: dict | None = None, budgets: dict | None = None) -> str:
    q = user_query.lower()
    provider_summary = _build_provider_summary(df)
    service_summary = _build_service_summary(df)
    daily_summary = _build_daily_summary(df)
    total_cost = round(df["cost"].sum(), 2)

    # --- Domain check: reject questions not related to this project's cloud cost data ---
    project_keywords = [
        "cost", "spend", "spending", "bill", "billing", "budget", "expense",
        "anomaly", "spike", "surge", "unusual", "alert", "jump",
        "saving", "save", "recommend", "commitment", "reserved", "savings",
        "discount", "roi", "optimize", "reduce",
        "provider", "aws", "azure", "gcp", "cloud",
        "service", "vm", "virtual machine",
        "report", "summary", "brief", "overview", "dashboard",
        "total", "overall", "daily", "monthly",
        "trend", "forecast", "projection", "analysis", "detail", "breakdown",
        "team", "department", "utilization", "storage", "waste",
        "finops", "infrastructure",
        "hello", "hi", "hey", "help", "what can you", "who are you", "what is this"
    ]

    is_project_related = any(kw in q for kw in project_keywords)
    if not is_project_related:
        return ("I can only answer questions about this project's cloud cost data.\n\n"
                "This question is not related to the project. Please ask about:\n"
                "- Cloud cost analysis\n"
                "- Anomaly detection\n"
                "- Savings recommendations\n"
                "- Provider comparisons\n"
                "- Budget and spending reports")

    # --- Greeting ---
    if any(w in q for w in ["hello", "hi", "hey", "help", "what can you", "who are you", "what is this"]):
        return ("Hello! I'm FinOps AI, your FinOps assistant. I can help you with:\n\n"
                "- Cost analysis: 'What is my total spending?'\n"
                "- Provider breakdown: 'Show me AWS costs'\n"
                "- Anomaly investigation: 'Why did costs spike?'\n"
                "- Savings plans: 'How much can I save?'\n"
                "- Comparisons: 'Compare AWS vs Azure'\n"
                "- Reports: 'Summary report for finance'\n"
                "- Date queries: 'What happened on June 10?'\n\n"
                "Ask me anything about your cloud costs!")

    # --- Budget specific queries ---
    if "budget" in q:
        if budgets:
            lines = ["Current Budget Allocations and Status:\n"]
            for provider, limit in budgets.items():
                spend = provider_summary.get(provider, 0)
                pct = round((spend / limit) * 100, 1) if limit > 0 else 0
                status = "Exceeded" if spend >= limit else "Warning" if spend >= limit * 0.8 else "Within Budget"
                lines.append(
                    f"- {provider} Cloud: Spent ₹{round(spend, 2)} of ₹{limit} budget ({pct}% used - {status})"
                )
            return "\n".join(lines)
        else:
            return "No budget allocations have been configured yet. You can set them up on the 'Budget Management' page."

    # --- Report / Summary queries ---
    if any(w in q for w in ["report", "summary", "brief", "overview", "executive summary"]):
        persona = "executive"
        if "finance" in q or "financial" in q:
            persona = "finance"
        elif "engineer" in q or "technical" in q or "infra" in q:
            persona = "engineering"

        anomaly_impact = sum(a["excess_amount"] for a in anomalies)
        total_savings = sum(r["estimated_monthly_savings"] for r in recs)
        num_days = len(daily_summary)
        avg_daily = round(total_cost / num_days, 2) if num_days > 0 else 0

        if persona == "finance":
            projected = round(avg_daily * 30 + anomaly_impact, 2)
            lines = [f"Finance Cost Allocation Report:\n"]
            lines.append(f"Total tracked spend: ₹{total_cost}")
            lines.append(f"Projected monthly run-rate (incl. anomaly impact): ₹{projected}")
            lines.append(f"Anomaly cost impact: ₹{round(anomaly_impact, 2)} excess charges")
            lines.append(f"Commitment savings potential: ₹{round(total_savings, 2)}/mo")
            lines.append(f"\nAnomalies ({len(anomalies)}):")
            for a in anomalies[:5]:
                lines.append(f"- {a['provider']} {a['service']} on {a['date']}: excess ₹{a['excess_amount']}")
            lines.append(f"\nRecommendations:")
            for r in recs[:3]:
                lines.append(f"- {r['provider']} {r['service']}: {r['recommendation_type']} -> Save ₹{r['estimated_monthly_savings']}/mo")
            lines.append(f"\nAction: Reconcile ₹{round(anomaly_impact, 2)} anomaly costs with department budgets.")
            return "\n".join(lines)

        elif persona == "engineering":
            projected = round(max(avg_daily * 30 - total_savings, 0), 2)
            lines = [f"Engineering Infrastructure Cost Report:\n"]
            lines.append(f"Total spend: ₹{total_cost}")
            lines.append(f"Projected monthly run-rate (post-optimization): ₹{projected}")
            lines.append(f"Anomalies detected: {len(anomalies)}")
            lines.append(f"\nInfrastructure Alerts:")
            for a in anomalies[:5]:
                lines.append(f"- {a['provider']} {a['service']} on {a['date']}: "
                             f"₹{a['actual_cost']} (expected ₹{a['expected_cost']})")
            lines.append(f"\nOptimization opportunities: {len(recs)}")
            for r in recs[:3]:
                lines.append(f"- {r['service']}: {r['recommendation_type']} ({r['confidence_score']}% confidence)")
            lines.append(f"\nAction: Review CloudWatch/Azure Monitor for root cause of spikes.")
            return "\n".join(lines)

        else:  # executive
            lines = [f"Executive Cloud Spend Briefing:\n"]
            lines.append(f"Total dataset spend: ₹{total_cost}")
            lines.append(f"Projected monthly run-rate: ₹{round(avg_daily * 30, 2)}")
            lines.append(f"Active anomalies: {len(anomalies)} (₹{round(anomaly_impact, 2)} excess)")
            lines.append(f"Savings potential: ₹{round(total_savings, 2)}/mo (₹{round(total_savings * 12, 2)}/yr)")
            lines.append(f"\nProvider breakdown:")
            for p, data in sorted(provider_summary.items(), key=lambda x: x[1]["total"], reverse=True):
                lines.append(f"- {p}: ₹{data['total']} ({data['percentage']}%)")
            lines.append(f"\nAction: Review anomaly root causes and evaluate commitment plan options.")
            return "\n".join(lines)

    # --- Anomaly-specific queries ---
    if any(w in q for w in ["anomaly", "spike", "surge", "unusual", "alert", "jump", "high"]):
        if not anomalies:
            return "No cost anomalies were detected in the current dataset. All spending is within expected baseline thresholds."

        matched = anomalies
        for a in anomalies:
            if a["provider"].lower() in q or a["service"].lower() in q:
                matched = [a for a in anomalies if a["provider"].lower() in q or a["service"].lower() in q]
                break

        lines = [f"Found {len(matched)} cost anomal{'y' if len(matched) == 1 else 'ies'}:\n"]
        for a in matched[:5]:
            pct_over = round((a["actual_cost"] / a["expected_cost"] - 1) * 100, 0) if a["expected_cost"] > 0 else 0
            lines.append(
                f"- {a['provider']} {a['service']} on {a['date']}: "
                f"Spent ₹{a['actual_cost']} vs expected ₹{a['expected_cost']} "
                f"(+₹{a['excess_amount']} over baseline, {pct_over:.0f}% increase)"
            )
        total_excess = sum(a["excess_amount"] for a in matched)
        lines.append(f"\nTotal excess spend: ₹{round(total_excess, 2)}")
        lines.append("Likely causes: unexpected traffic surge, misconfigured auto-scaling, "
                      "one-time batch job, or new deployment. Check CloudWatch/Azure Monitor "
                      "for the specific service on the anomaly date.")
        return "\n".join(lines)

    # --- Utilization / waste queries ---
    if any(w in q for w in ["utilization", "cpu", "memory", "disk", "network", "connections", "storage", "waste", "wasted"]):
        if df.empty:
            return "No utilization data is available for the selected filters."
        rows = []
        for (provider, service), group in df.groupby(["provider", "service"]):
            resource_type = group["resource_type"].iloc[0] if "resource_type" in group else service
            if resource_type not in ["EC2", "RDS"]:
                continue
            avg_cost = group["cost"].mean()
            cpu = group["cpu_utilization"].mean()
            memory = group["memory_utilization"].mean()
            disk = group["disk_utilization"].mean()
            network = group["network_usage"].mean()
            connections = group["connections"].mean()
            storage = group["storage_utilization"].mean()
            if resource_type == "RDS":
                waste = []
                if cpu < 35:
                    waste.append("low CPU")
                if connections < 100:
                    waste.append("low connections")
                rows.append(
                    f"- {provider} {service}: CPU {cpu:.1f}%, connections {connections:.0f}, "
                    f"storage {storage:.1f}%, daily cost ₹{avg_cost:.2f}. "
                    f"Status: {'waste risk - ' + ', '.join(waste) if waste else 'healthy'}"
                )
            else:
                waste = []
                if cpu < 25:
                    waste.append("low CPU")
                if memory < 45:
                    waste.append("low memory")
                if network < 200:
                    waste.append("low network")
                rows.append(
                    f"- {provider} {service}: CPU {cpu:.1f}%, memory {memory:.1f}%, disk {disk:.1f}%, "
                    f"network {network:.0f} GB/day, daily cost ₹{avg_cost:.2f}. "
                    f"Status: {'waste risk - ' + ', '.join(waste) if waste else 'healthy'}"
                )
        return "Resource Utilization Dashboard:\n\n" + ("\n".join(rows) if rows else "No EC2 or RDS utilization rows match the selected filters.")

    # --- Savings-specific queries ---
    if any(w in q for w in ["saving", "save", "recommend", "commitment", "reserved",
                              "savings plan", "discount", "roi", "optimize", "reduce",
                              "cost reduction", "lower cost", "cheaper"]):
        if savings_analysis and "services" in savings_analysis:
            qualifying = [s for s in savings_analysis["services"] if s["applicable"]]
            non_qualifying = [s for s in savings_analysis["services"] if not s["applicable"]]
            summary = savings_analysis.get("summary", {})

            lines = ["Savings Plan Analysis:\n"]

            if qualifying:
                lines.append("Services that QUALIFY for savings plans:")
                for s in qualifying:
                    lines.append(
                        f"- {s['provider']} {s['service']}: "
                        f"Avg ₹{s['current_daily_avg']}/day -> "
                        f"Commit ₹{s['commitment_monthly']}/mo -> "
                        f"Save ₹{s['savings_monthly']}/mo (₹{s['savings_annual']}/yr) "
                        f"[{s['confidence_score']}% confidence]"
                    )

            if non_qualifying:
                lines.append("\nServices that do NOT qualify:")
                for s in non_qualifying:
                    lines.append(
                        f"- {s['provider']} {s['service']}: Avg ₹{s['current_daily_avg']}/day - "
                        f"{s['reasoning']}"
                    )

            lines.append(f"\nTotal potential: ₹{summary.get('total_monthly_savings', 0)}/mo "
                         f"(₹{summary.get('total_annual_savings', 0)}/yr)")
            return "\n".join(lines)

        if not recs:
            return "No savings recommendations are currently available. All services are either below the commitment threshold or have highly variable spending patterns."

        lines = ["Savings Opportunities:\n"]
        for r in recs[:3]:
            lines.append(
                f"- {r['provider']} {r['service']}: {r['recommendation_type']} | "
                f"Commit: ₹{r['recommended_commitment_monthly']}/mo | "
                f"Save: ₹{r['estimated_monthly_savings']}/mo | "
                f"Confidence: {r['confidence_score']}%"
            )
        total_savings = sum(r["estimated_monthly_savings"] for r in recs)
        lines.append(f"\nTotal potential savings: ₹{round(total_savings, 2)}/mo (₹{round(total_savings * 12, 2)}/yr)")
        return "\n".join(lines)

    # --- Provider comparison queries ---
    if any(w in q for w in ["compare", "which provider", "which cloud", "aws vs", "azure vs", "gcp vs"]):
        lines = ["Provider Cost Comparison:\n"]
        for p, data in sorted(provider_summary.items(), key=lambda x: x[1]["total"], reverse=True):
            lines.append(f"- {p}: ₹{data['total']} total ({data['percentage']}% of spend)")
        most_expensive = max(provider_summary.items(), key=lambda x: x[1]["total"])
        least_expensive = min(provider_summary.items(), key=lambda x: x[1]["total"])
        lines.append(f"\nHighest spend: {most_expensive[0]} (₹{most_expensive[1]['total']})")
        lines.append(f"Lowest spend: {least_expensive[0]} (₹{least_expensive[1]['total']})")
        return "\n".join(lines)

    # --- Specific provider queries ---
    for provider_name in ["aws", "azure", "gcp", "google cloud"]:
        if provider_name in q:
            provider_key = provider_name.replace("google cloud", "gcp")
            provider_services = {k: v for k, v in service_summary.items()
                                 if k.lower().startswith(provider_key)}
            if provider_services:
                display_name = provider_key.upper()
                actual_key = [k for k in provider_summary if k.lower() == provider_key]
                share_pct = provider_summary[actual_key[0]]["percentage"] if actual_key else 0
                lines = [f"{display_name} Cost Breakdown:\n"]
                total_provider = 0
                for svc, data in sorted(provider_services.items(), key=lambda x: x[1]["total"], reverse=True):
                    lines.append(f"- {svc}: ₹{data['total']} total, ₹{data['avg_daily']}/day avg")
                    total_provider += data["total"]
                lines.append(f"\nTotal {display_name} spend: ₹{round(total_provider, 2)}")
                lines.append(f"Share of total: {share_pct}%")
                return "\n".join(lines)
            else:
                return f"No data found for {provider_key.upper()} in the current dataset."

    # --- Team / ownership breakdown queries ---
    dimension_aliases = {
        "team": "team",
        "department": "department",
        "business unit": "business_unit",
        "environment": "environment",
        "application": "application",
        "owner": "owner",
        "project": "project",
    }
    for phrase, column in dimension_aliases.items():
        if phrase in q and column in df.columns:
            lines = [f"Cost breakdown by {phrase}:\n"]
            grouped = df.groupby([column, "provider", "service"])["cost"].agg(["sum", "mean"]).reset_index()
            grand_total = grouped["sum"].sum()
            for _, row in grouped.sort_values("sum", ascending=False).iterrows():
                share = (row["sum"] / grand_total) * 100 if grand_total else 0
                lines.append(
                    f"- {row[column]} / {row['provider']} {row['service']}: "
                    f"₹{round(row['mean'], 2)}/day, ₹{round(row['mean'] * 30, 2)}/mo, {round(share, 1)}%"
                )
            return "\n".join(lines)

    # --- Total cost / spend queries ---
    if any(w in q for w in ["total", "how much", "bill", "overall", "spend"]):
        lines = ["Service Cost Breakdown:\n"]
        for svc, data in sorted(service_summary.items(), key=lambda x: x[1]["total"], reverse=True):
            lines.append(
                f"- {svc}: ₹{data['avg_daily']}/day, ₹{data['monthly']}/mo projected, "
                f"{data['percentage']}% of selected spend"
            )
        if daily_summary:
            dates = sorted(daily_summary.keys())
            avg_daily = round(total_cost / len(daily_summary), 2)
            lines.append(f"\nDate range: {dates[0]} to {dates[-1]}")
            lines.append(f"Average daily selected spend: ₹{avg_daily}")
        return "\n".join(lines)

    # --- Specific service queries ---
    for svc_key, data in service_summary.items():
        svc_parts = svc_key.split(" ", 1)
        if len(svc_parts) == 2:
            svc_name = svc_parts[1].lower()
            if svc_name in q:
                lines = [f"{svc_key} Cost Details:\n"]
                lines.append(f"Daily average: ₹{data['avg_daily']}")
                lines.append(f"Monthly projection: ₹{data['monthly']}")
                lines.append(f"Share of selected spend: {data['percentage']}%")
                svc_anomalies = [a for a in anomalies if a["provider"].lower() in q or a["service"].lower() in q]
                if svc_anomalies:
                    lines.append(f"\nAnomalies detected: {len(svc_anomalies)}")
                    for a in svc_anomalies[:3]:
                        lines.append(f"- {a['date']}: ₹{a['actual_cost']} (excess: ₹{a['excess_amount']})")
                svc_recs = [r for r in recs if r["service"].lower() == svc_parts[1].lower() or r["provider"].lower() == svc_parts[0].lower()]
                if svc_recs:
                    lines.append(f"\nSavings available:")
                    for r in svc_recs:
                        lines.append(f"- {r['recommendation_type']}: Save ₹{r['estimated_monthly_savings']}/mo")
                return "\n".join(lines)

    # --- Date-specific queries ---
    month_map = {
        "jan": "01", "january": "01", "feb": "02", "february": "02",
        "mar": "03", "march": "03", "apr": "04", "april": "04",
        "may": "05", "jun": "06", "june": "06", "jul": "07", "july": "07",
        "aug": "08", "august": "08", "sep": "09", "september": "09",
        "oct": "10", "october": "10", "nov": "11", "november": "11",
        "dec": "12", "december": "12"
    }

    # Try to match "June 10" or "jun 10" or "6/10" or "06-10" or "2026-06-10"
    matched_date = None
    import re

    # Pattern 1: "month day" (e.g., "June 10", "jun 10")
    m = re.search(r'(\w+)\s+(\d{1,2})', q)
    if m:
        month_str = m.group(1)[:3].lower()
        day_str = m.group(2).zfill(2)
        if month_str in month_map:
            matched_date = f"2026-{month_map[month_str]}-{day_str}"

    # Pattern 2: "month day, year" (e.g., "June 10, 2026")
    if not matched_date:
        m = re.search(r'(\w+)\s+(\d{1,2}),?\s*(\d{4})', q)
        if m:
            month_str = m.group(1)[:3].lower()
            day_str = m.group(2).zfill(2)
            year_str = m.group(3)
            if month_str in month_map:
                matched_date = f"{year_str}-{month_map[month_str]}-{day_str}"

    # Pattern 3: "M/D" or "MM-DD" or "YYYY-MM-DD"
    if not matched_date:
        m = re.search(r'(\d{1,2})[/\-](\d{1,2})', q)
        if m:
            month_str = m.group(1).zfill(2)
            day_str = m.group(2).zfill(2)
            matched_date = f"2026-{month_str}-{day_str}"

    if not matched_date:
        m = re.search(r'(\d{4})-(\d{2})-(\d{2})', q)
        if m:
            matched_date = m.group(0)

    # Also check direct date string match
    if not matched_date:
        for date_str in sorted(daily_summary.keys()):
            if date_str in q:
                matched_date = date_str
                break

    if matched_date and matched_date in daily_summary:
        day_cost = daily_summary[matched_date]
        day_anomalies = [a for a in anomalies if a["date"] == matched_date]
        lines = [f"Cost on {matched_date}: ₹{day_cost}\n"]
        if day_anomalies:
            lines.append("Anomalies on this day:")
            for a in day_anomalies:
                lines.append(f"- {a['provider']} {a['service']}: ₹{a['actual_cost']} (expected ₹{a['expected_cost']}, excess ₹{a['excess_amount']})")
            total_excess = sum(a["excess_amount"] for a in day_anomalies)
            lines.append(f"\nTotal excess: ₹{round(total_excess, 2)}")
        else:
            lines.append("No anomalies detected on this day.")
        return "\n".join(lines)

    # --- Fallback for recognized FinOps queries that didn't match specific handlers ---
    return (f"Here's what I found in your data:\n\n"
            f"Total spend: ₹{total_cost}\n"
            f"Providers: {', '.join(provider_summary.keys())}\n"
            f"Anomalies: {len(anomalies)}\n"
            f"Savings recommendations: {len(recs)}\n\n"
            f"Could you rephrase? For example:\n"
            f"- 'What is my AWS spending?'\n"
            f"- 'Why did costs spike?'\n"
            f"- 'How much can I save?'\n"
            f"- 'Summary report for finance'\n"
            f"- 'What happened on June 10?'")


def query_finops_ai(user_query: str, session_id: str | None, df, anomalies: list, recs: list, savings_analysis: dict | None = None, budgets: dict | None = None) -> dict:
    sid = get_or_create_session(session_id)
    session = conversation_store[sid]

    q = user_query.lower()
    project_keywords = [
        "cost", "spend", "spending", "bill", "billing", "budget", "expense",
        "anomaly", "spike", "surge", "unusual", "alert", "jump",
        "saving", "save", "recommend", "commitment", "reserved", "savings",
        "discount", "roi", "optimize", "reduce",
        "provider", "aws", "azure", "gcp", "cloud",
        "service", "vm", "virtual machine",
        "report", "summary", "brief", "overview", "dashboard",
        "total", "overall", "daily", "monthly",
        "trend", "forecast", "projection", "analysis", "detail", "breakdown",
        "team", "department", "utilization", "storage", "waste",
        "finops", "infrastructure",
        "hello", "hi", "hey", "help", "what can you", "who are you", "what is this"
    ]
    is_project_related = any(kw in q for kw in project_keywords)
    if not is_project_related:
        return {"response": "This question is not related to the project. I can only answer questions about cloud costs, anomalies, savings, budgets, and reports.", "session_id": sid}

    report_request = detect_report_request(user_query)

    system_context = build_system_context(df, anomalies, recs, savings_analysis, budgets)

    session["messages"].append({"role": "user", "content": user_query})

    if len(session["messages"]) > MAX_HISTORY * 2:
        session["messages"] = session["messages"][-MAX_HISTORY * 2:]

    try:
        client = OpenAI(api_key=GROQ_API_KEY, base_url=GROQ_BASE_URL)

        messages = [{"role": "system", "content": system_context}]
        messages.extend(session["messages"])

        response = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            temperature=0.3,
            max_tokens=4096,
        )
        assistant_msg = response.choices[0].message.content
        if report_request:
            assistant_msg = (
                f"{assistant_msg}\n\n"
                f"I prepared the latest {report_request['persona']} report as a PDF. "
                "Use the download button below to get the updated file."
            )
        session["messages"].append({"role": "assistant", "content": assistant_msg})
        result = {"response": assistant_msg, "session_id": sid}
        if report_request:
            result["report_pdf_url"] = report_request["pdf_url"]
            result["report_persona"] = report_request["persona"]
            result["report_filename"] = report_request["filename"]
        return result

    except Exception as e:
        mock = get_mock_response(user_query, anomalies, recs, df, savings_analysis)
        error_note = f"{mock}"
        if report_request:
            error_note = (
                f"{error_note}\n\n"
                f"I prepared the latest {report_request['persona']} report as a PDF. "
                "Use the download button below to get the updated file."
            )
        session["messages"].append({"role": "assistant", "content": error_note})
        result = {"response": error_note, "session_id": sid}
        if report_request:
            result["report_pdf_url"] = report_request["pdf_url"]
            result["report_persona"] = report_request["persona"]
            result["report_filename"] = report_request["filename"]
        return result
