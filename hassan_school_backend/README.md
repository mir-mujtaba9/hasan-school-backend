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
