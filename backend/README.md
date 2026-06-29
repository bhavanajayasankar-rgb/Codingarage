# CodingGarage FinOps Backend

## Database

The backend uses PostgreSQL through SQLAlchemy and `psycopg2`.

Default connection URL:

```bash
postgresql+psycopg2://postgres:postgres@localhost:5432/codingarage_finops
```

Start the local database from the project root if Docker is installed:

```bash
docker compose up -d postgres
```

If Docker is not installed, use your local PostgreSQL service instead:

```bash
sudo systemctl start postgresql
sudo -u postgres psql
```

Then inside `psql`:

```sql
ALTER USER postgres PASSWORD 'postgres';
CREATE DATABASE codingarage_finops;
\q
```

Run the API:

```bash
cd backend
source venv/bin/activate
export DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/codingarage_finops
python -m uvicorn main:app --reload
```

On startup, the app creates the required tables and starts the Azure Cost Management scheduler. Cost data is stored in `cloud_costs` from `azure_cost.py`; use `POST /api/costs/fetch` to fetch Azure costs immediately.
