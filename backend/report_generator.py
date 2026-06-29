import os
import json
from openai import OpenAI

GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
GROQ_BASE_URL = "https://api.groq.com/openai/v1"
MODEL = "llama-3.3-70b-versatile"


def build_report_prompt(persona: str, df, anomalies, recs, team: str | None = None):
    summary_table = df.groupby(["provider", "service"])["cost"].agg(
        ["sum", "mean", "min", "max"]
    ).reset_index()
    summary_table.columns = ["provider", "service", "total_spend", "avg_daily", "min_daily", "max_daily"]
    data_str = summary_table.to_string(index=False)

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

    total_cost = df["cost"].sum()
    scope = f"Team: {team}" if team else "All teams"
    date_range = f"{df['date'].min()} to {df['date'].max()}" if not df.empty else "N/A"

    persona_configs = {
        "executive": {
            "role": "Senior Cloud Financial Advisor reporting to C-suite executives",
            "focus": (
                "High-level cloud financial health, strategic cost optimization, "
                "waste reduction opportunities, and projected savings targets. "
                "Focus on business impact, ROI, and strategic recommendations."
            ),
            "title_suggestion": "Executive Cloud Spend Briefing"
        },
        "finance": {
            "role": "Cloud Cost Analyst reporting to the Finance department",
            "focus": (
                "Detailed cost allocation, budget variance analysis, anomaly cost impact, "
                "amortization schedules, commitment breakdowns, and department-level chargebacks. "
                "Focus on financial accuracy, compliance, and budget adherence."
            ),
            "title_suggestion": "Finance Cost Allocation Report"
        },
        "engineering": {
            "role": "Infrastructure Cost Engineer reporting to Engineering leadership",
            "focus": (
                "Resource-level cost efficiency, infrastructure waste detection, "
                "service-level anomaly alerts, rightsizing opportunities, and "
                "technical optimization actions. Focus on actionable engineering tasks."
            ),
            "title_suggestion": "Engineering Infrastructure Cost Report"
        }
    }

    config = persona_configs.get(persona, persona_configs["executive"])

    system_prompt = f"""You are {config['role']}.

Generate a comprehensive cloud cost report. You MUST respond with valid JSON only, no markdown, no extra text.

Report focus: {config['focus']}

Response format (strict JSON):
{{
    "title": "Report title",
    "cadence": "Monthly|Weekly|Daily",
    "focus": "One-line focus description",
    "summary": "2-3 sentence executive summary of findings",
    "metrics": {{
        "service_count": <number>,
        "average_daily_selected_cost": <number>,
        "projected_monthly": <number>,
        "total_savings_potential": <number>,
        "anomaly_cost_impact": <number>,
        "anomaly_count": <number>
    }},
    "insights": [
        "Insight 1 with specific numbers",
        "Insight 2",
        "Insight 3"
    ],
    "recommendations": [
        "Recommendation 1 with actionable detail",
        "Recommendation 2",
        "Recommendation 3"
    ],
    "action_items": [
        "Action item 1",
        "Action item 2",
        "Action item 3"
    ]
}}

Use ONLY the actual data provided. Never fabricate numbers."""

    user_prompt = f"""Generate a {persona} report for {scope} with this data:

Date Range: {date_range}
Total Dataset Spend: ₹{round(total_cost, 2)}

Cost by Provider/Service:
{data_str}

Detected Anomalies:
{anomalies_str}

Savings Recommendations:
{recs_str}"""

    return system_prompt, user_prompt


def generate_ai_report(persona: str, df, anomalies, recs, team: str | None = None):
    """
    Generates an AI-powered persona report using Groq.
    Falls back to static template if API is unavailable.
    """
    if GROQ_API_KEY is None or os.getenv("FINOPS_USE_LLM_REPORTS") != "1":
        return get_fallback_report(persona, anomalies, recs, df, team=team)

    try:
        client = OpenAI(api_key=GROQ_API_KEY, base_url=GROQ_BASE_URL, timeout=6.0)
        system_prompt, user_prompt = build_report_prompt(persona, df, anomalies, recs, team=team)

        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3,
            max_tokens=4096,
        )

        raw = response.choices[0].message.content.strip()

        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()

        report = json.loads(raw)
        report["ai_generated"] = True
        return report

    except Exception:
        return get_fallback_report(persona, anomalies, recs, df, team=team)


def get_fallback_report(persona: str, anomalies, recs, df, team: str | None = None):
    """
    Static fallback report when AI is unavailable.
    """
    total_cost = df["cost"].sum() if not df.empty else 0
    service_count = df.groupby(["provider", "service"]).ngroups if not df.empty else 0
    average_daily = df.groupby("date")["cost"].sum().mean() if not df.empty else 0
    total_savings = sum(r["estimated_monthly_savings"] for r in recs)
    anomaly_impact = sum(a["excess_amount"] for a in anomalies)
    scope = f"{team} Team " if team else ""
    service_lines = []
    if not df.empty:
        service_summary = df.groupby(["provider", "service"])["cost"].agg(["sum", "mean"]).reset_index()
        for _, row in service_summary.sort_values("sum", ascending=False).iterrows():
            share = (row["sum"] / total_cost) * 100 if total_cost else 0
            service_lines.append(
                f"{row['provider']} {row['service']}: ₹{round(row['mean'], 2)}/day, "
                f"₹{round(row['mean'] * 30, 2)}/mo projected, {round(share, 1)}% of selected spend"
            )

    if persona == "executive":
        return {
            "title": f"{scope}Executive Cloud Spend Briefing",
            "cadence": "Monthly",
            "focus": "High-level cost patterns, waste percentage, and savings targets.",
            "summary": "Cloud expenditure remains within baseline boundaries. "
                       "Commitment recommendations offer a stable path to footprint optimization.",
            "metrics": {
                "service_count": service_count,
                "average_daily_selected_cost": round(average_daily, 2),
                "projected_monthly": round(average_daily * 30, 2),
                "total_savings_potential": round(total_savings, 2),
                "anomaly_cost_impact": round(anomaly_impact, 2),
                "anomaly_count": len(anomalies)
            },
            "insights": [
                *(service_lines[:3] or ["No service-level cost data is available for the selected filters"]),
                f"{len(anomalies)} cost anomalies detected with ₹{round(anomaly_impact, 2)} excess spend",
                f"₹{round(total_savings, 2)}/mo in savings opportunities identified through commitment plans"
            ],
            "recommendations": [
                f"Adopt {r['recommendation_type']} for {r['provider']} {r['service']} "
                f"to save ₹{r['estimated_monthly_savings']}/mo"
                for r in recs[:3]
            ],
            "action_items": [
                "Review anomaly root causes for the flagged services",
                "Evaluate commitment plan options for qualifying workloads",
                "Schedule monthly cost review with engineering leads"
            ],
            "ai_generated": False
        }
    elif persona == "finance":
        return {
            "title": f"{scope}Finance Cost Allocation Detail Report",
            "cadence": "Weekly",
            "focus": "Cost allocations, anomaly cost impact, and commitment breakdowns.",
            "summary": "Cloud costs are tracked across provider and service dimensions. "
                       "Anomaly events have contributed to budget variance.",
            "metrics": {
                "service_count": service_count,
                "average_daily_selected_cost": round(average_daily, 2),
                "projected_monthly": round(average_daily * 30 + anomaly_impact, 2),
                "total_savings_potential": round(total_savings, 2),
                "anomaly_cost_impact": round(anomaly_impact, 2),
                "anomaly_count": len(anomalies)
            },
            "insights": [
                *(service_lines[:3] or ["No service-level cost data is available for the selected filters"]),
                f"Anomaly cost impact: ₹{round(anomaly_impact, 2)} excess charges",
                f"Commitment savings potential: ₹{round(total_savings, 2)}/mo"
            ],
            "recommendations": [
                f"Allocate {round(anomaly_impact, 2)} dollar anomaly cost to responsible service teams"
            ] + [
                f"Procure {r['recommendation_type']} for {r['provider']} {r['service']}"
                for r in recs[:3]
            ],
            "action_items": [
                "Reconcile anomaly costs with department budgets",
                "Initiate commitment plan procurement process",
                "Update monthly forecast with actuals"
            ],
            "ai_generated": False
        }
    else:
        return {
            "title": f"{scope}Engineering Infrastructure Alerts & Anomalies",
            "cadence": "Real-time / Daily",
            "focus": "Resource efficiency, cost spikes, and service-level waste.",
            "summary": "Infrastructure cost monitoring is active. "
                       "Several services show anomalous behavior requiring investigation.",
            "metrics": {
                "service_count": service_count,
                "average_daily_selected_cost": round(average_daily, 2),
                "projected_monthly": round(max(average_daily * 30 - total_savings, 0), 2),
                "total_savings_potential": round(total_savings, 2),
                "anomaly_cost_impact": round(anomaly_impact, 2),
                "anomaly_count": len(anomalies)
            },
            "insights": [
                *(service_lines[:3] or ["No service-level cost data is available for the selected filters"]),
                f"{len(anomalies)} service-level cost spikes detected",
                f"Anomaly excess spend: ₹{round(anomaly_impact, 2)}",
                f"Services with optimization potential: {len(recs)}"
            ],
            "recommendations": [
                f"Investigate {a['provider']} {a['service']} spike on {a['date']} "
                f"(₹{a['actual_cost']} vs expected ₹{a['expected_cost']})"
                for a in anomalies[:3]
            ],
            "action_items": [
                "Check CloudWatch/Azure Monitor for root cause of cost spikes",
                "Review auto-scaling policies on flagged services",
                "Rightsize underutilized instances identified in recommendations"
            ],
            "ai_generated": False
        }
