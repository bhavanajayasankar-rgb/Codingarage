from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional


class CloudCostResponse(BaseModel):
    id: int
    cloud_provider: str
    service_name: str
    resource_name: Optional[str] = None
    resource_group: Optional[str] = None
    region: Optional[str] = None
    date: date
    cost: float
    currency: str
    created_at: datetime

    class Config:
        from_attributes = True


class DailyCostResponse(BaseModel):
    date: date
    total_cost: float
    currency: str


class ServiceCostResponse(BaseModel):
    service_name: str
    total_cost: float
    currency: str


class CostSummaryResponse(BaseModel):
    total_cost: float
    current_month_spend: float
    highest_cost_service: str
    cost_trend: str
    currency: str


class BudgetSmsRequest(BaseModel):
    current_cost: float
    budget: float
