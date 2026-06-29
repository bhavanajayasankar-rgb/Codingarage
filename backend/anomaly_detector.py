import pandas as pd

def fetch_cloud_costs_as_dataframe(db_records):
    """
    Converts Azure Cost Management records into the analytics dataframe shape.
    Legacy analytics still expect ownership and utilization fields, so real Azure
    records get neutral defaults until those dimensions are available.
    """
    data = []
    for r in db_records:
        data.append({
            "date": r.date.strftime("%Y-%m-%d"),
            "provider": r.cloud_provider,
            "service": r.service_name,
            "cost": float(r.cost),
            "currency": r.currency,
            "account_id": r.resource_group or r.region or "azure-subscription",
            "team": "Unassigned",
            "department": "Unassigned",
            "business_unit": "Unassigned",
            "environment": "Unassigned",
            "application": r.resource_group or r.service_name,
            "owner": "Unassigned",
            "project": r.resource_group or "Azure",
            "resource_type": r.service_name,
            "cpu_utilization": 0.0,
            "memory_utilization": 0.0,
            "disk_utilization": 0.0,
            "network_usage": 0.0,
            "connections": 0,
            "storage_utilization": 0.0,
            "resource_count": 1,
            "budget_daily": 0.0,
        })
    return pd.DataFrame(data)

def detect_anomalies(df, threshold_multiplier=2.0):
    """
    Evaluates historical daily time-series spend using a rolling standard-deviation algorithm.
    Optimized with a historical lag (.shift(1)) to prevent anomaly self-influence.
    """
    if df.empty:
        return []

    df = df.sort_values(by=["provider", "service", "date"]).reset_index(drop=True)
    anomalies = []
    
    for (provider, service), group in df.groupby(["provider", "service"]):
        group = group.copy()
        
        # Shift costs by 1 day so today's spike doesn't inflate today's rolling baseline limit
        historical_cost = group["cost"].shift(1)
        
        group["rolling_mean"] = historical_cost.rolling(window=7, min_periods=1).mean()
        group["rolling_std"] = historical_cost.rolling(window=7, min_periods=1).std().fillna(0)
        
        # Guard against zero standard deviation breaking thresholds
        group["rolling_std"] = group["rolling_std"].replace(0, group["cost"].mean() * 0.05)
        
        historical_resources = group["resource_count"].shift(1)
        group["resource_mean"] = historical_resources.rolling(window=7, min_periods=1).mean()
        group["network_mean"] = group["network_usage"].shift(1).rolling(window=7, min_periods=1).mean()

        for pos, (_, row) in enumerate(group.iterrows()):
            limit = row["rolling_mean"] + (threshold_multiplier * row["rolling_std"])
            signals = []
            if row["cost"] > limit and row["cost"] > (row["rolling_mean"] * 1.3):
                signals.append("Sudden cost spike")
            if row["budget_daily"] and row["cost"] > row["budget_daily"]:
                signals.append("Budget overrun")
            if row["resource_mean"] and row["resource_count"] > max(row["resource_mean"] * 1.5, row["resource_mean"] + 2):
                signals.append("Unexpected resource creation")
            network_mean = group["network_mean"].iloc[pos]
            if row["network_usage"] > 0 and network_mean > 0 and row["network_usage"] > network_mean * 2.5:
                signals.append("Unusual service usage")

            if signals:
                expected = row["rolling_mean"] if pd.notna(row["rolling_mean"]) else row["cost"]
                anomalies.append({
                    "date": row["date"],
                    "provider": provider,
                    "service": service,
                    "team": row.get("team", ""),
                    "department": row.get("department", ""),
                    "business_unit": row.get("business_unit", ""),
                    "environment": row.get("environment", ""),
                    "application": row.get("application", ""),
                    "owner": row.get("owner", ""),
                    "project": row.get("project", ""),
                    "actual_cost": round(row["cost"], 2),
                    "expected_cost": round(expected, 2),
                    "excess_amount": round(max(row["cost"] - expected, 0), 2),
                    "resource_count": int(row.get("resource_count", 0)),
                    "budget_daily": round(row.get("budget_daily", 0), 2),
                    "types": signals,
                    "severity": "high" if len(signals) > 1 or row["cost"] > limit * 1.4 else "medium",
                })
                
    return anomalies

def get_anomaly_trend(df, provider, service, anomaly_date, window_days=7):
    """
    Extracts daily spend trend data surrounding the anomaly date (X days before and after)
    to feed the frontend graphical line/area chart.
    """
    if df.empty:
        return []
        
    filtered = df[(df["provider"] == provider) & (df["service"] == service)].copy()
    filtered = filtered.sort_values(by="date").reset_index(drop=True)
    
    anomaly_indices = filtered[filtered["date"] == anomaly_date].index
    if anomaly_indices.empty:
        return []
    
    target_idx = anomaly_indices[0]
    
    # Slice the dataframe safely to prevent index overflows
    start_idx = max(0, target_idx - window_days)
    end_idx = min(len(filtered) - 1, target_idx + window_days)
    
    trend_slice = filtered.iloc[start_idx : end_idx + 1]
    
    # Calculate expected baseline on non-anomalous days inside the window
    non_anomalous_costs = trend_slice[trend_slice["date"] != anomaly_date]["cost"]
    baseline_val = round(non_anomalous_costs.mean() if not non_anomalous_costs.empty else trend_slice["cost"].mean(), 2)
    
    trend_data = []
    for _, row in trend_slice.iterrows():
        # Strip year if you prefer simpler X-Axis labels (e.g. "06-10" instead of "2026-06-10")
        formatted_day = row["date"][-5:]
        trend_data.append({
            "day": formatted_day,
            "spend": round(row["cost"], 2),
            "baseline": baseline_val,
            "isAnomaly": row["date"] == anomaly_date
        })
        
    return trend_data
