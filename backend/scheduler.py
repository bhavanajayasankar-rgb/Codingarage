import logging
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)
scheduler = BackgroundScheduler()


def start_scheduler():
    if scheduler.running:
        logger.info("Scheduler already running")
        return

    from azure_cost import fetch_azure_cost
    from database import SessionLocal
    from models import CloudCost
    from datetime import date

    def fetch_and_store():
        logger.info("Scheduled task: fetching Azure cost data")
        try:
            records = fetch_azure_cost()
            if not records:
                logger.warning("Scheduled fetch returned no records")
                return

            db = SessionLocal()
            try:
                inserted = 0
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
                    else:
                        db.add(CloudCost(**rec))
                        inserted += 1
                db.commit()
                logger.info("Stored %d new Azure cost records", inserted)
            except Exception as e:
                db.rollback()
                logger.error("Database error in scheduler: %s", e)
            finally:
                db.close()
        except Exception as e:
            logger.error("Scheduled Azure fetch failed: %s", e)

    scheduler.add_job(
        fetch_and_store,
        trigger=DateTrigger(run_date=datetime.now()),
        id="azure_cost_fetch_startup",
        name="Fetch Azure cost data on startup",
        replace_existing=True,
    )

    scheduler.add_job(
        fetch_and_store,
        trigger=IntervalTrigger(hours=1),
        id="azure_cost_fetch",
        name="Fetch Azure cost data every hour",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("APScheduler started - Azure cost fetch every 1 hour")


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")
