import random


def generate_proactive_recommendations(df):
    """
    Generates proactive savings ideas/opportunities based on usage patterns.
    Returns list of { title, estimated_savings, provider, service, reasoning }.
    """
    groups = df.groupby(["provider", "service"])["cost"].agg(["min", "mean", "max"]).reset_index()
    recommendations = []

    for _, row in groups.iterrows():
        min_daily = row["min"]
        mean_daily = row["mean"]
        max_daily = row["max"]

        if mean_daily <= 0:
            continue

        variance = (max_daily - min_daily) / mean_daily

        if min_daily > 100:
            commitment = round(min_daily * 0.8, 2)
            savings = round(commitment * 0.32, 2)
            recommendations.append({
                "title": f"Reserved {row['service']} capacity",
                "estimated_savings": savings,
                "provider": row["provider"],
                "service": row["service"],
                "reasoning": f"Baseline of ₹{min_daily:.0f}/day qualifies for reserved capacity at 32% discount."
            })

        if variance < 0.3 and mean_daily > 20:
            downsized = round(mean_daily * 0.2, 2)
            recommendations.append({
                "title": f"Right-size {row['service']} resources",
                "estimated_savings": downsized,
                "provider": row["provider"],
                "service": row["service"],
                "reasoning": f"Low variance ({variance:.1f}) suggests stable usage pattern eligible for right-sizing."
            })

        if max_daily > mean_daily * 1.8 and mean_daily > 10:
            spot = round(mean_daily * 0.15, 2)
            recommendations.append({
                "title": f"Use spot instances for {row['service']}",
                "estimated_savings": spot,
                "provider": row["provider"],
                "service": row["service"],
                "reasoning": f"Spiky usage pattern (max ₹{max_daily:.0f}) suggests spot/flexible capacity opportunities."
            })

    return sorted(recommendations, key=lambda x: x["estimated_savings"], reverse=True)[:10]


def generate_savings_recommendations(df):
    """
    Generates mock RI & Savings Plan recommendations with confidence scores
    based on historical usage patterns.
    """
    summary = df.groupby(["provider", "service"])["cost"].agg(["min", "mean", "max"]).reset_index()
    recommendations = []

    for _, row in summary.iterrows():
        if row["min"] > 0:
            potential_commitment = round(row["min"] * 0.8, 2)
            estimated_savings = round(potential_commitment * 0.32, 2)

            variance_factor = (row["max"] - row["min"]) / row["mean"]
            confidence_score = max(50, min(99, int(100 - (variance_factor * 25))))

            recommendations.append({
                "provider": row["provider"],
                "service": row["service"],
                "recommendation_type": "Compute Savings Plan" if row["provider"] == "AWS" else "Reserved Instance Commit",
                "recommended_commitment_monthly": potential_commitment,
                "estimated_monthly_savings": estimated_savings,
                "confidence_score": confidence_score,
                "reasoning": f"Consistent baseline utilization discovered. Minimum spend of ₹{row['min']}/day indicates continuous baseline workload profile."
            })

    return sorted(recommendations, key=lambda x: x["estimated_monthly_savings"], reverse=True)


def get_savings_details_for_service(df, provider, service):
    """
    Returns detailed savings analysis for a specific provider/service combination.
    """
    filtered = df[(df["provider"] == provider) & (df["service"] == service)]
    if filtered.empty:
        return {
            "provider": provider,
            "service": service,
            "applicable": False,
            "reasoning": "No billing data found for this service."
        }

    daily_costs = filtered["cost"]
    current_daily_avg = round(daily_costs.mean(), 2)
    current_monthly = round(daily_costs.sum(), 2)
    min_daily = daily_costs.min()
    max_daily = daily_costs.max()

    commitment_type = "Compute Savings Plan" if provider == "AWS" else "Reserved Instance Commit"
    commitment_monthly = round(min_daily * 0.8 * 30, 2)
    savings_monthly = round(commitment_monthly * 0.32, 2)
    savings_annual = round(savings_monthly * 12, 2)

    variance_factor = (max_daily - min_daily) / current_daily_avg if current_daily_avg > 0 else 1
    confidence_score = max(50, min(99, int(100 - (variance_factor * 25))))

    applicable = min_daily > 100
    if applicable:
        reasoning = (
            f"Consistent baseline of ₹{current_daily_avg}/day qualifies for {commitment_type}. "
            f"Recommended commitment of ₹{commitment_monthly}/mo at 32% discount "
            f"yields ₹{savings_monthly}/mo (₹{savings_annual}/yr) in savings."
        )
    else:
        reasoning = (
            f"Average daily spend of ₹{current_daily_avg}/day is below the ₹100/day threshold "
            f"for commitment plans. Current spending is too low for meaningful savings."
        )

    return {
        "provider": provider,
        "service": service,
        "current_daily_avg": current_daily_avg,
        "current_monthly": current_monthly,
        "min_daily": round(min_daily, 2),
        "max_daily": round(max_daily, 2),
        "commitment_type": commitment_type,
        "commitment_monthly": commitment_monthly,
        "savings_monthly": savings_monthly,
        "savings_annual": savings_annual,
        "confidence_score": confidence_score,
        "applicable": applicable,
        "reasoning": reasoning
    }


def get_full_savings_analysis(df):
    """
    Returns detailed savings analysis for all provider/service groups.
    """
    groups = df.groupby(["provider", "service"]).size().reset_index().drop(columns=[0])
    services = []

    for _, row in groups.iterrows():
        detail = get_savings_details_for_service(df, row["provider"], row["service"])
        services.append(detail)

    qualifying = [s for s in services if s["applicable"]]
    non_qualifying = [s for s in services if not s["applicable"]]

    total_monthly = sum(s["savings_monthly"] for s in qualifying)
    total_annual = sum(s["savings_annual"] for s in qualifying)

    return {
        "services": services,
        "summary": {
            "total_monthly_savings": round(total_monthly, 2),
            "total_annual_savings": round(total_annual, 2),
            "qualifying_count": len(qualifying),
            "non_qualifying_count": len(non_qualifying)
        }
    }
