import os
import logging
import re
import time
from datetime import datetime, date
from typing import Any, Dict, List, Optional

import requests
from azure.identity import ClientSecretCredential
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

GUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


def _env(name: str) -> str:
    return (os.getenv(name) or "").strip().strip('"').strip("'")


TENANT_ID = _env("AZURE_TENANT_ID")
CLIENT_ID = _env("AZURE_CLIENT_ID")
CLIENT_SECRET = _env("AZURE_CLIENT_SECRET")
SUBSCRIPTION_ID = _env("AZURE_SUBSCRIPTION_ID")

SCOPE = f"/subscriptions/{SUBSCRIPTION_ID}"
API_VERSION = "2023-03-01"
BASE_URL = "https://management.azure.com"

MAX_RETRIES = 3
RETRY_DELAY = 2


def _validate_config():
    missing = []
    if not TENANT_ID:
        missing.append("AZURE_TENANT_ID")
    if not CLIENT_ID:
        missing.append("AZURE_CLIENT_ID")
    if not CLIENT_SECRET:
        missing.append("AZURE_CLIENT_SECRET")
    if not SUBSCRIPTION_ID:
        missing.append("AZURE_SUBSCRIPTION_ID")
    if missing:
        raise ValueError(
            f"Missing Azure credentials: {', '.join(missing)}. "
            "Set them in the .env file."
        )
    invalid = []
    for name, value in (
        ("AZURE_TENANT_ID", TENANT_ID),
        ("AZURE_CLIENT_ID", CLIENT_ID),
        ("AZURE_SUBSCRIPTION_ID", SUBSCRIPTION_ID),
    ):
        if not GUID_RE.match(value):
            invalid.append(name)
    if invalid:
        raise ValueError(
            f"Invalid Azure credential format: {', '.join(invalid)}. "
            "Use the GUID values from Azure Portal, not names/placeholders."
        )


def get_access_token() -> str:
    _validate_config()
    credential = ClientSecretCredential(
        tenant_id=TENANT_ID,
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
    )
    token = credential.get_token("https://management.azure.com/.default")
    return token.token


def query_cost_management(payload: dict) -> Optional[dict]:
    url = f"{BASE_URL}{SCOPE}/providers/Microsoft.CostManagement/query?api-version={API_VERSION}"
    token = get_access_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=30)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            last_error = e
            logger.warning(
                "Azure API attempt %d/%d failed: %s",
                attempt, MAX_RETRIES, e,
            )
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY * attempt)

    logger.error("All %d Azure API attempts failed: %s", MAX_RETRIES, last_error)
    return None


def fetch_azure_cost() -> List[Dict[str, Any]]:
    _validate_config()
    logger.info("Fetching Azure cost data for subscription %s", SUBSCRIPTION_ID)

    payload = {
        "type": "ActualCost",
        "timeframe": "MonthToDate",
        "dataset": {
            "granularity": "Daily",
            "aggregation": {
                "totalCost": {
                    "name": "Cost",
                    "function": "Sum",
                },
            },
            "grouping": [
                {"type": "Dimension", "name": "ServiceName"},
                {"type": "Dimension", "name": "ResourceGroupName"},
                {"type": "Dimension", "name": "ResourceLocation"},
            ],
        },
    }

    data = query_cost_management(payload)
    if not data:
        logger.error("No data returned from Azure Cost Management API")
        return []

    return _transform_response(data)


def _extract_currency(data: dict) -> str:
    try:
        return data["properties"]["columns"][0]["name"]
    except (KeyError, IndexError):
        return "USD"


def _transform_response(data: dict) -> List[Dict[str, Any]]:
    rows = []
    try:
        properties = data["properties"]
        columns = [col["name"] for col in properties["columns"]]
        logger.info("Azure API columns: %s", columns)

        col_map = {name: idx for idx, name in enumerate(columns)}

        amount_idx = col_map.get("Cost", 0)
        date_idx = col_map.get("UsageDate", None)
        service_idx = col_map.get("ServiceName", None)
        resource_group_idx = col_map.get("ResourceGroupName", None)
        region_idx = col_map.get("ResourceLocation", None)
        currency_idx = col_map.get("Currency", None)

        for row in properties["rows"]:
            cost_value = float(row[amount_idx]) if row[amount_idx] is not None else 0.0

            usage_date = None
            if date_idx is not None:
                raw = str(row[date_idx])
                try:
                    usage_date = datetime.strptime(raw, "%Y%m%d").date()
                except ValueError:
                    try:
                        usage_date = datetime.strptime(raw[:10], "%Y-%m-%d").date()
                    except ValueError:
                        usage_date = date.today()

            rows.append({
                "cloud_provider": "Azure",
                "service_name": str(row[service_idx]) if service_idx is not None and row[service_idx] else "Unknown",
                "resource_name": None,
                "resource_group": str(row[resource_group_idx]) if resource_group_idx is not None and row[resource_group_idx] else None,
                "region": str(row[region_idx]) if region_idx is not None and row[region_idx] else None,
                "date": usage_date or date.today(),
                "cost": round(cost_value, 4),
                "currency": str(row[currency_idx]) if currency_idx is not None and row[currency_idx] else "USD",
            })

    except KeyError as e:
        logger.error("Unexpected Azure API response structure: %s", e)
        return []

    logger.info("Transformed %d Azure cost records", len(rows))
    return rows
