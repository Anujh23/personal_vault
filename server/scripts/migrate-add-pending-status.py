#!/usr/bin/env python3
"""
Migration script to add 'Pending' status to reminders table
Usage: python migrate-add-pending-status.py
"""

import os
import psycopg2
from psycopg2 import sql
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv('../../.env')

def migrate_database():
    """Add 'Pending' to reminders status constraint"""
    
    # Get database URL from environment
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        print("❌ DATABASE_URL not found in environment variables")
        return False
    
    try:
        # Connect to database
        print("🔌 Connecting to database...")
        conn = psycopg2.connect(database_url)
        cursor = conn.cursor()
        
        # Drop existing constraint if it exists
        print("🗑️ Dropping existing status constraint...")
        cursor.execute("""
            ALTER TABLE reminders DROP CONSTRAINT IF EXISTS reminders_status_check
        """)
        
        # Update any existing 'pending' (lowercase) to 'Pending' (proper case)
        print("🔄 Updating existing 'pending' status to 'Pending'...")
        cursor.execute("""
            UPDATE reminders SET status = 'Pending' WHERE status = 'pending'
        """)
        updated_rows = cursor.rowcount
        if updated_rows > 0:
            print(f"✅ Updated {updated_rows} reminders from 'pending' to 'Pending'")
        
        # Add new constraint with 'Pending' included
        print("➕ Adding new status constraint with 'Pending'...")
        cursor.execute("""
            ALTER TABLE reminders ADD CONSTRAINT reminders_status_check 
                CHECK (status IN ('Active', 'Pending', 'Completed', 'Cancelled'))
        """)
        
        # Verify the constraint was updated
        print("✅ Verifying constraint update...")
        cursor.execute("""
            SELECT conname, pg_get_constraintdef(oid) as constraint_definition
            FROM pg_constraint 
            WHERE conrelid = 'reminders'::regclass 
            AND conname = 'reminders_status_check'
        """)
        
        result = cursor.fetchone()
        if result:
            print(f"✅ Constraint updated: {result[1]}")
        else:
            print("⚠️ Could not verify constraint (might be normal)")
        
        # Commit changes
        conn.commit()
        print("✅ Migration completed successfully!")
        
        return True
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        if conn:
            conn.rollback()
        return False
        
    finally:
        if conn:
            cursor.close()
            conn.close()

if __name__ == "__main__":
    print("🚀 Starting migration: Add 'Pending' status to reminders")
    success = migrate_database()
    
    if success:
        print("🎉 Migration completed!")
    else:
        print("💥 Migration failed!")
        exit(1)
