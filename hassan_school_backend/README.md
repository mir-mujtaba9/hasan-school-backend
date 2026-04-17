# Hassan School Backend

Node.js + Express + PostgreSQL backend for the Hassan School frontend.

## Tech Stack

- Node.js (JavaScript)
- Express
- PostgreSQL (`pg` driver)
- dotenv for environment variables
- CORS for frontend/backend communication
- nodemon for development

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file in the project root based on `.env.example` and fill in your PostgreSQL credentials and frontend URL.

   - `FRONTEND_URL` can be a single origin (`http://localhost:8080`) or a comma-separated allowlist (`http://localhost:5173,http://localhost:3000`).
   - In development, leaving `FRONTEND_URL` empty will allow any origin.

3. Run the development server:

   ```bash
   npm run dev
   ```

The API will start on `http://localhost:4000` by default.

## Health Endpoints

- `GET /` – Basic welcome message.
- `GET /api/v1/health` – Checks that the API is running.
- `GET /api/v1/db-health` – Simple database connectivity check (requires PostgreSQL to be reachable).
- `POST /api/v1/auth/login` – Auth login (JWT).

## Connecting Frontend

Point your frontend API calls to the backend base URL (for example `http://localhost:4000/api/v1`). Make sure `FRONTEND_URL` in your `.env` matches your frontend dev URL so CORS works correctly.

## Automatic Monthly Fee Records

The backend can automatically generate **monthly payable fee records** for all **Active** students.

- Runs on the **1st day of every month** (based on server local time)
- Safe catch-up: if the server was down on the 1st, it will still generate within the first **3 days** of the month (only for students missing a record)
- Creates a `fee_records` row with:
   - `paid_amount = 0`
   - `status = 'Unpaid'`
   - `monthly_fee = students.discounted_fee`
   - `prev_balance = latest fee_records.balance_remaining`
   - `receipt_number = RCP-YYYY-NNN` (sequential)

Optional env settings:

- `FEE_AUTOGEN_ENABLED=true` (set to `false` to disable)
- `FEE_AUTOGEN_CRON=10 0 * * *` (default: runs daily at 00:10)
- `FEE_AUTOGEN_CATCHUP_DAYS=3` (default: 3)
