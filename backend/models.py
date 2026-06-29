from sqlalchemy import Column, Integer, String, Numeric, Date, DateTime, func
from database import Base


class CloudCost(Base):
    __tablename__ = "cloud_costs"

    id = Column(Integer, primary_key=True, index=True)
    cloud_provider = Column(String(50), nullable=False)
    service_name = Column(String(100), nullable=False)
    resource_name = Column(String(200), nullable=True)
    resource_group = Column(String(200), nullable=True)
    region = Column(String(100), nullable=True)
    date = Column(Date, nullable=False)
    cost = Column(Numeric(12, 4), nullable=False)
    currency = Column(String(10), default="USD")
    created_at = Column(DateTime, server_default=func.now())
