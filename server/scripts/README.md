# Database Schema Management

## Overview
This directory contains database scripts for the Personal Dashboard application.

## Primary Schema Script

### `init-render-db.js` ⭐ **USE THIS FOR NEW DATABASES**
- **Purpose**: Complete database schema initialization
- **Creates all tables**:
  - `users` - User accounts with authentication
  - `personal_info` - Personal information records
  - `family_members` - Family member details
  - `shareholdings` - Shareholding information
  - `properties` - Property records
  - `assets` - Asset inventory
  - `banking_details` - Bank account information
  - `stocks` - Stock/investment records
  - `policies` - Insurance policies (includes insurance_type column)
  - `loans` - Loan information
  - `business_info` - Business details
  - `income_sheet` - Income/expense records
  - `reminders` - Reminder system (includes snooze columns)
  - `reminder_files` - Files attached to reminders
  - `files` - General file storage
  - `activity_logs` - User activity tracking
- **Creates all indexes** for performance
- **Safe to run multiple times** (uses `IF NOT EXISTS`)

### Usage
```bash
# Navigate to project root
cd personal_db

# Run schema initialization
node server/scripts/init-render-db.js
```

## Utility Scripts (Keep)

### `inspect-db.js`
- Quick database inspection
- Shows table list and row counts
- Useful for debugging

### `run_migration.js`
- Generic migration runner
- For future schema updates

## Archived Migrations

Old migration scripts have been moved to `archived-migrations/` folder:
- `add_loans_table.sql` - Now included in init-render-db.js
- `add-insurance-type.sql` - Now included in init-render-db.js
- `fix-policies-schema.sql` - Now included in init-render-db.js
- `migrate-loans.js` - Now included in init-render-db.js
- `migrate-policies.js` - Now included in init-render-db.js
- `add_family_member_id_links.sql` - For legacy database upgrades only

These are kept for reference but not needed for new installations.

## Database Schema Overview

```
users (1)
  ├── personal_info (N)
  ├── family_members (N)
  │     └── linked to: shareholdings, properties, assets, banking_details, 
  │                    stocks, policies, loans, business_info, income_sheet
  ├── shareholdings (N)
  ├── properties (N)
  ├── assets (N)
  ├── banking_details (N)
  ├── stocks (N)
  ├── policies (N)
  ├── loans (N)
  ├── business_info (N)
  ├── income_sheet (N)
  ├── reminders (N)
  │     └── reminder_files (N)
  ├── files (N)
  └── activity_logs (N)
```

## Environment Setup

Ensure `.env` file in server directory contains:
```env
DATABASE_URL=postgresql://username:password@host:port/database
JWT_SECRET=your-strong-secret-key
PORT=3000
```

## For Production Deployment

1. **New Database**: Run `init-render-db.js` once
2. **Existing Database**: No action needed (schema already exists)
3. **Backup**: Always backup before running any schema changes

## Schema Changes

For future schema updates:
1. Modify `init-render-db.js` for new installations
2. Create specific migration file for existing databases
3. Test on staging first
4. Document changes in this README
