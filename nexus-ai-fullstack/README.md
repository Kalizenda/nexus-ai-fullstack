# NEXUS AI — Express + MongoDB backend

This project contains the existing NEXUS AI landing-page/terminal UI and a Node.js + Express API using MongoDB/Mongoose. User registration and login are real database-backed flows. The protected admin API supports overview stats, user search, account suspension/reactivation, activity logs, notifications, and JSON export.

> **Important:** The robot terminal is a paper-market simulator. Its wallet connection is read-only: it can display the connected public account and ETH balance, but it does not sign or send transactions. Never put seed phrases, private keys, exchange secrets, or wallet credentials in this website or `.env`.

## Requirements
- Node.js 20 or newer
- MongoDB local service or a MongoDB Atlas database

## Setup
1. Extract the ZIP and open a terminal in the project folder.
2. Install packages: `npm install`
3. Copy `.env.example` to `.env`.
4. Edit `.env` and set `MONGODB_URI`, `JWT_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`. Use a unique admin password and a random JWT secret of at least 32 characters. Keep `.env` private; it is excluded by `.gitignore`.
5. Start MongoDB, or create a MongoDB Atlas database and use its connection string.
6. Start the site and API: `npm start`
7. Open `http://localhost:3000`.

For a publicly deployed site, set `NODE_ENV=production`, `APP_ORIGIN` to the exact HTTPS site origin, use a strong unique database credential, enable HTTPS, and configure a trusted reverse proxy only if applicable. Restrict MongoDB network access to your server. Back up the database and keep dependencies patched.

## API routes
All responses are JSON unless the route is an export.

### Public
- `GET /api/health` — service and database status
- `POST /api/auth/register` — `{ "name", "email", "password" }`
- `POST /api/auth/login` — `{ "email", "password" }`; returns a JWT and user profile
- `POST /api/auth/admin/login` — `{ "email", "password" }`; validates `ADMIN_EMAIL` and `ADMIN_PASSWORD` from server environment
- `POST /api/auth/forgot-password` — generic response only; actual reset email/token flow is **not implemented**
- `GET /api/auth/me` — current user/admin profile with `Authorization: Bearer <token>`

### Admin (requires admin bearer token)
- `GET /api/admin/overview`
- `GET /api/admin/users?page=1&limit=50&search=term`
- `PATCH /api/admin/users/:id/status` with `{ "status": "active" }` or `{ "status": "suspended" }`
- `GET /api/admin/activity?limit=100`
- `GET /api/admin/notifications`
- `PATCH /api/admin/notifications/:id/read`
- `GET /api/admin/export/users`

## Admin notifications
In-app admin notification records are stored in MongoDB for registrations and successful user logins. Optional email alerts work when `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `ADMIN_NOTIFICATION_EMAIL` are configured. SMTP is not required for the site to run.

## Security notes
- User passwords are hashed with bcrypt; raw user passwords are never stored.
- Admin credentials are read only on the server from `.env`; there is no public admin registration endpoint.
- Authentication endpoints are rate-limited. JWT secret is mandatory.
- Activity includes event type, account email, result, time, and IP address for security auditing. Tell users about this in a privacy notice and set an appropriate retention policy before launch.
- Use HTTPS in production. Do not expose `.env`, MongoDB, or database backups publicly.
- Password reset currently returns a safe generic response but does not send reset emails. Add a secure, expiring, single-use reset token workflow before offering that feature.
- Before public launch, add automated tests, monitoring, backup/restore checks, privacy/terms pages, and review account suspension/session revocation behavior.

## Frontend and robot script slot

The full website frontend is `public.html`; Express serves it at `/`. The same project folder contains the API, MongoDB models, and administrator dashboard. You do not need to run a separate frontend server.

Your full-page robot frontend insertion point is:

`robot/robot-frontend.html`

Replace the contents of that file with your complete HTML document, including its `<style>` and `<script>` sections, then save it. The terminal reports an explicit error rather than loading a blank frame if the file is empty. After verifying the signed-in user's session, the app issues a short-lived page ticket and loads the robot document at its own `/robot/robot-frontend.html` URL. Same-folder resources can load through the authenticated robot path. The document runs in an unsandboxed iframe with the same origin as the main site. This lets its JavaScript use browser features that require a normal page, but also gives it access to the parent page and browser session. Only use code you trust; never put private keys, seed phrases, exchange API secrets, or passwords in browser code. Restart the backend after changing its server routes, then reload the terminal. Typing `#terminal` into the URL does not bypass authentication. Logging out revokes the browser's robot-page session.

Important: authentication controls access when the website loads the page, but code already delivered to a browser cannot be treated as secret or remotely revoked from that browser. Do not put private keys, seed phrases, exchange API secrets, or any other credentials in the robot frontend. Real trade execution and authorization should be handled by a separately secured backend, with explicit user consent and risk limits.

## Quick setup recap

1. Install Node.js 20 or newer and have MongoDB running, or create a MongoDB Atlas database.
2. Copy `.env.example` to `.env` and set the database URI, a random JWT secret, and your own `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
3. Run `npm install`.
4. Run `npm start`.
5. Open `http://localhost:3000`, register a user, then sign in. Only after successful sign-in and server-side session verification does the trading workspace fetch the robot frontend.
6. Open the Admin link and sign in with the admin credentials from `.env` to view registered users, activity, and notifications.

The password-reset endpoint is still a placeholder and does not send reset emails. Run and test the app in a safe non-live environment before deploying it publicly.
