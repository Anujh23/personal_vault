#!/usr/bin/env python3
"""
Migration script to create cards table
Usage: python migrate-create-cards-table.py
"""

import os
import psycopg2
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv('../../.env')

def migrate_database():
    """Create cards table in database"""
    
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
        
        # Create cards table
        print("🗂️ Creating cards table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS cards (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                family_member_id INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
                card_type VARCHAR(20) CHECK (card_type IN ('Credit', 'Debit', 'Prepaid', 'Forex')),
                card_network VARCHAR(20) CHECK (card_network IN ('Visa', 'MasterCard', 'Amex', 'Rupay', 'Diners Club')),
                bank_name VARCHAR(100),
                card_holder_name VARCHAR(200),
                card_number VARCHAR(50) NOT NULL,
                expiry_date DATE NOT NULL,
                cvv VARCHAR(10),
                status VARCHAR(20) CHECK (status IN ('Active', 'Blocked', 'Expired', 'Lost', 'Stolen')),
                daily_limit DECIMAL(15, 2),
                bill_generation_date INTEGER CHECK (bill_generation_date >= 1 AND bill_generation_date <= 31),
                payment_due_date INTEGER CHECK (payment_due_date >= 1 AND payment_due_date <= 31),
                notes TEXT,
                files JSONB DEFAULT '[]'::jsonb,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Create indexes
        print("📇 Creating indexes...")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_cards_family_member ON cards(family_member_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_cards_type ON cards(card_type)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status)")
        
        # Verify table was created
        print("✅ Verifying table...")
        cursor.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'cards' 
            ORDER BY ordinal_position
        """)
        
        columns = cursor.fetchall()
        if columns:
            print(f"✅ Cards table created with {len(columns)} columns:")
            for col in columns:
                print(f"  - {col[0]}: {col[1]}")
        else:
            print("⚠️ Could not verify table columns")
        
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
    print("🚀 Starting migration: Create cards table")
    success = migrate_database()
    
    if success:
        print("🎉 Migration completed!")
    else:
        print("💥 Migration failed!")
        exit(1)
