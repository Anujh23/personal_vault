# Personal Dashboard - Online Version with PostgreSQL

A full-stack personal data management application deployed on Render with Node.js + Python microservices architecture.

## Architecture

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Frontend   │──────▶│  Node.js API │──────▶│  PostgreSQL  │
│  (Static)    │      │  (Express)    │      │  (Render DB) │
└──────────────┘      └──────┬───────┘      └──────────────┘
                              │
                     ┌────────▼────────┐
                     │  Python Service │
                     │  (FastAPI)      │
                     │  Analytics      │
                     └─────────────────┘
```

## Project Structure

```
Dashboard NEW 2.0/
├── frontend/                 # Static web UI
│   ├── index.html          # Main dashboard
│   ├── style.css           # Styles
│   └── app.js              # API-based app logic
│
├── server/                   # Node.js API
│   ├── index.js             # Express server
│   ├── package.json         # Dependencies
│   ├── config/
│   │   ├── database.js      # PostgreSQL pool
│   │   └── auth.js          # JWT config
│   ├── middleware/
│   │   └── auth.js          # Authentication
│   └── routes/
│       ├── auth.js          # Login/register
│       ├── crud.js          # CRUD operations
│       └── files.js         # File upload/download
│
├── python_service/           # Python analytics
│   ├── main.py              # FastAPI app
│   ├── requirements.txt     # Python deps
│   └── ...
│
├── server/models/
│   └── schema.sql          # PostgreSQL schema
│
├── render.yaml              # Render deployment config
└── ARCHITECTURE.md          # Detailed architecture docs
```

## Technology Stack

### Backend (Node.js)
- **Express.js** - Web framework
- **PostgreSQL** - Database (via `pg`)
- **JWT** - Authentication (`jsonwebtoken`)
- **bcrypt** - Password hashing
- **Multer** - File uploads
- **Helmet** - Security headers
- **CORS** - Cross-origin requests

### Backend (Python)
- **FastAPI** - High-performance API
- **asyncpg** - Async PostgreSQL
- **Pandas** - Data processing
- **OpenPyXL** - Excel export

### Database (PostgreSQL)
- **Tables**: users, personal_info, family_members, properties, assets, banking_details, stocks, policies, business_info, reminders, files, activity_logs
- **Features**: UUID primary keys, foreign keys, indexes, triggers for updated_at
- **File Storage**: BYTEA columns for binary data

## Local Development Setup

### Prerequisites
- Node.js 18+
- Python 3.11+
- PostgreSQL 14+

### 1. Database Setup

```bash
# Create PostgreSQL database
createdb dashboard

# Run schema
psql -d dashboard -f server/models/schema.sql
```

### 2. Node.js API Setup

```bash
cd server
npm install

# Create .env file
cat > .env << EOF
NODE_ENV=development
DATABASE_URL=postgresql://localhost:5432/dashboard
JWT_SECRET=your-secret-key-here
FRONTEND_URL=http://localhost:5500
PORT=3000
EOF

# Start server
npm run dev
```

### 3. Python Service Setup

```bash
cd python_service
pip install -r requirements.txt

# Create .env file
cat > .env << EOF
DATABASE_URL=postgresql://localhost:5432/dashboard
PORT=8000
EOF

# Start service
uvicorn main:app --reload --port 8000
```

### 4. Frontend Setup

```bash
# Serve frontend folder with any static server
# VS Code Live Server, Python http.server, etc.
cd frontend
python -m http.server 5500
```

## Render Deployment

### Step 1: Create PostgreSQL Database
1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "PostgreSQL"
3. Name: `dashboard-db`
4. Plan: Starter ($7/month) or Free (if available)
5. Create

### Step 2: Deploy Node.js API
1. Click "New +" → "Web Service"
2. Connect your GitHub repo
3. Name: `dashboard-api`
4. Root Directory: `server`
5. Build Command: `npm install`
6. Start Command: `node index.js`
7. Add Environment Variables:
   - `NODE_ENV=production`
   - `JWT_SECRET` (generate random string)
   - `DATABASE_URL` (copy from PostgreSQL service)
8. Deploy

### Step 3: Deploy Python Service
1. Click "New +" → "Web Service"
2. Name: `dashboard-python`
3. Root Directory: `python_service`
4. Runtime: Python 3
5. Build Command: `pip install -r requirements.txt`
6. Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
7. Add Environment Variables:
   - `DATABASE_URL` (same as above)
8. Deploy

### Step 4: Deploy Frontend
1. Click "New +" → "Static Site"
2. Name: `dashboard-ui`
3. Root Directory: `frontend`
4. Build Command: `echo "Ready"` (or leave empty)
5. Publish Directory: `.`
6. Deploy

### Alternative: Using render.yaml (Blueprints)
1. Push code to GitHub
2. In Render Dashboard → "Blueprints" → "New Blueprint Instance"
3. Connect repo
4. Render will create all services automatically

## API Endpoints

### Authentication
- `POST /auth/login` - Login with username/password
- `POST /auth/register` - Create new user (admin only)
- `GET /auth/me` - Get current user
- `PUT /auth/change-password` - Change password

### CRUD Operations
- `GET /api/:table` - List records (with pagination)
- `POST /api/:table` - Create record
- `GET /api/:table/:id` - Get single record
- `PUT /api/:table/:id` - Update record
- `DELETE /api/:table/:id` - Delete record

### Files
- `POST /files/upload` - Upload file
- `GET /files/:id` - Download file
- `GET /files/record/:table/:recordId` - List files
- `DELETE /files/:id` - Delete file

### Dashboard
- `GET /api/dashboard/stats` - Get dashboard statistics

## Python Analytics Endpoints

- `GET /health` - Service health check
- `GET /analytics/dashboard-stats/{user_id}` - Comprehensive stats
- `GET /analytics/family-tree/{user_id}` - Hierarchical family tree
- `GET /analytics/portfolio-summary/{user_id}` - Investment summary
- `POST /analytics/export/{user_id}` - Export data (JSON/CSV/Excel)
- `GET /analytics/activity-timeline/{user_id}` - Recent activity

## Security Features

1. **JWT Authentication** - Stateless auth with 24h expiration
2. **Password Hashing** - bcrypt with 10 salt rounds
3. **Row-Level Security** - Users only access their own data
4. **Rate Limiting** - 100 requests per 15 minutes per IP
5. **Helmet** - Security headers (XSS, CSRF protection)
6. **Input Validation** - Required fields and data types
7. **SQL Injection Protection** - Parameterized queries throughout

## Database Schema Highlights

### Users Table
- UUID primary keys
- Username/email unique constraints
- bcrypt password hashes
- Role-based access (admin/user)
- Soft delete (is_active flag)

### Files Storage
- Files stored as BYTEA in PostgreSQL
- 10MB size limit per file
- Metadata tracking (name, mime_type, size)
- Related to specific records

### Activity Logging
- All CRUD operations logged
- IP address tracking
- JSON details for audit trail

## Frontend API Configuration

Update `frontend/index.html`:

```javascript
// For local development
window.API_BASE_URL = 'http://localhost:3000';
window.PYTHON_API_URL = 'http://localhost:8000';

// For production (after Render deployment)
window.API_BASE_URL = 'https://dashboard-api.onrender.com';
window.PYTHON_API_URL = 'https://dashboard-python.onrender.com';
```

## Troubleshooting

### Database Connection Issues
```bash
# Check if PostgreSQL is running
pg_isready -h localhost -p 5432

# Test connection
psql -d dashboard -c "SELECT 1;"
```

### API Not Responding
- Check `DATABASE_URL` is correct
- Verify JWT_SECRET is set
- Check Render logs in dashboard

### CORS Errors
- Ensure `FRONTEND_URL` matches your actual frontend URL
- Check CORS configuration in `server/index.js`

### Python Service Issues
```bash
# Test Python API locally
curl http://localhost:8000/health

# Check logs
render logs --service dashboard-python
```

## Next Steps

1. **Implement frontend API calls** in `frontend/app.js`
2. **Add file upload progress** indicator
3. **Implement real-time notifications** with WebSockets
4. **Add data visualization** charts with Python matplotlib
5. **Set up automated backups** for PostgreSQL
6. **Add 2FA authentication** for enhanced security

## Cost Estimate (Render)

- **PostgreSQL**: $7/month (Starter)
- **Node.js API**: $7/month (Starter)
- **Python Service**: $7/month (Starter)
- **Static Site**: Free
- **Total**: ~$21/month

Use Render's free tier for development (services sleep after 15 min inactivity).
