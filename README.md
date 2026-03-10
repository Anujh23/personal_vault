# Personal Vault

A full-stack personal data management application built with Python/FastAPI and PostgreSQL, deployed on Render.

## Architecture

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Frontend   │──────▶│   FastAPI    │──────▶│  PostgreSQL  │
│  (Served by  │      │   Backend    │      │  (Render DB) │
│   FastAPI)   │      │              │      │              │
└──────────────┘      └──────────────┘      └──────────────┘
```

Single server serves both the API and frontend static files.

## Project Structure

```
personal_vault/
├── frontend/                # Static web UI
│   ├── index.html          # Main dashboard + login
│   ├── css/                # Stylesheets
│   └── js/                 # Frontend JS modules
│
├── src/
│   ├── app.js              # Core app logic
│   └── style.css           # Main styles
│
├── backend/                 # Python FastAPI backend
│   ├── main.py             # FastAPI app, middleware, static serving
│   ├── config.py           # Environment config (JWT, DB, port)
│   ├── database.py         # asyncpg connection pool
│   ├── requirements.txt    # Python dependencies
│   └── routes/
│       ├── auth_routes.py  # Login, register, password change
│       ├── crud_routes.py  # Generic CRUD for all tables
│       ├── file_routes.py  # File upload/download/delete
│       └── reminder_routes.py  # Reminders management
│
├── assets/                  # Static assets (icons, images)
├── render_python.yaml       # Render deployment config
└── .env                     # Environment variables (not committed)
```

## Tech Stack

- **FastAPI** - async web framework
- **asyncpg** - async PostgreSQL driver
- **python-jose** - JWT authentication
- **bcrypt** - password hashing
- **uvicorn** - ASGI server

## Local Development

### Prerequisites
- Python 3.11+
- PostgreSQL 14+

### Setup

```bash
# Install dependencies
pip install -r backend/requirements.txt

# Create .env in project root
cat > .env << EOF
DATABASE_URL=postgresql://localhost:5432/personal_vault
JWT_SECRET=your-secret-key-here
PORT=3000
EOF

# Run the server (serves both API + frontend)
cd backend && python main.py
```

App will be available at `http://localhost:3000`.

## Render Deployment

### Build Command
```
pip install -r backend/requirements.txt
```

### Start Command
```
cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT
```

### Environment Variables
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret key for JWT tokens (auto-generated on Render) |
| `FRONTEND_URL` | Frontend URL for CORS (optional, defaults to `*`) |
| `PORT` | Server port (default: 3000) |

### Using render_python.yaml (Blueprint)
1. Push code to GitHub
2. In Render Dashboard → Blueprints → New Blueprint Instance
3. Connect repo and select `render_python.yaml`
4. Render creates the service automatically

## API Endpoints

### Authentication
- `POST /auth/login` - Login
- `POST /auth/register` - Register new user
- `GET /auth/me` - Get current user
- `PUT /auth/change-password` - Change password

### CRUD
- `GET /api/:table` - List records
- `POST /api/:table` - Create record
- `GET /api/:table/:id` - Get record
- `PUT /api/:table/:id` - Update record
- `DELETE /api/:table/:id` - Delete record
- `GET /api/dashboard/stats` - Dashboard statistics

### Files
- `POST /files/upload` - Upload file
- `GET /files/:id` - Download file
- `GET /files/record/:table/:recordId` - List files for a record
- `DELETE /files/:id` - Delete file

### Reminders
- `GET /reminders` - List reminders
- `POST /reminders` - Create reminder
- `PUT /reminders/:id` - Update reminder
- `DELETE /reminders/:id` - Delete reminder

### Health
- `GET /health` - Health check (verifies DB connectivity)

## Security

- JWT authentication with 24h expiration
- bcrypt password hashing
- Security headers (X-Frame-Options, HSTS, XSS protection, etc.)
- Path traversal protection for static files
- Parameterized SQL queries (no SQL injection)
- CORS restricted to configured origins
- Structured JSON logging with request IDs
