# CCCTSeminary

Website for the Celestial Church of Christ Theological Seminary.

The static site lives in `USERS FRONT END/`. A small Node.js + SQLite server
(`server.js`) hosts the site **and** powers the contact form, user registration,
and login.

## Requirements

- Node.js 18+ (developed on Node 22)

## Setup & Run

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
cp .env.example .env
#    then edit .env and set a long random JWT_SECRET

# 3. Start the server
npm start
```

The site is now available at <http://localhost:3000>.

For development with auto-reload:

```bash
npm run dev
```

## How it works

- `server.js` serves the static files in `USERS FRONT END/` and exposes a small JSON API.
- Data is stored in a local SQLite database at `data/ccctseminary.db` (created
  automatically, ignored by git).
- Passwords are hashed with bcrypt; login state is kept in a signed, httpOnly
  cookie (JWT).

### API endpoints

| Method | Path            | Purpose                                   |
| ------ | --------------- | ----------------------------------------- |
| POST   | `/api/register` | Create an account (`name`, `email`, `password`) |
| POST   | `/api/login`    | Log in (`email`, `password`)              |
| POST   | `/api/logout`   | Log out                                   |
| GET    | `/api/me`       | Return the currently logged-in user       |
| POST   | `/api/contact`  | Save a contact message (`name`, `email`, `phone`, `subject`, `message`) |

### Viewing contact messages

Contact submissions are stored in the `messages` table. To read them:

```bash
sqlite3 data/ccctseminary.db "SELECT created_at, name, email, subject, message FROM messages ORDER BY id DESC;"
```

## Deployment notes

This runs on any host that supports a long-running Node process (Render, Railway,
Fly.io, a VPS, etc.). Set `NODE_ENV=production` and a strong `JWT_SECRET`. The
`data/` directory must be on persistent storage so accounts and messages survive
restarts.

> Note: GitHub Pages and other static-only hosts cannot run this server, so the
> contact form and login/register would not work there.
