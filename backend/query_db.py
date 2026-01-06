"""
Simple script to query the SQLite database interactively.
Usage: python query_db.py
"""
import sqlite3
from pathlib import Path
from database import DB_PATH, get_db_connection, get_data_statistics

def print_table_info(cursor, table_name):
    """Print information about a table."""
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = cursor.fetchall()
    print(f"\n{table_name} table structure:")
    print("-" * 60)
    for col in columns:
        print(f"  {col[1]:20s} {col[2]:15s} {'NOT NULL' if col[3] else ''} {'PRIMARY KEY' if col[5] else ''}")

def show_tables(cursor):
    """Show all tables in the database."""
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = cursor.fetchall()
    print("\nTables in database:")
    print("-" * 60)
    for table in tables:
        print(f"  - {table[0]}")

def query_examples(cursor):
    """Show some example queries."""
    print("\n" + "=" * 60)
    print("Example Queries")
    print("=" * 60)
    
    # Count records by parameter
    print("\n1. Count records by parameter:")
    cursor.execute("""
        SELECT parameter, COUNT(*) as count 
        FROM panel_timeseries 
        GROUP BY parameter
    """)
    for row in cursor.fetchall():
        print(f"   {row[0]:10s}: {row[1]:,} records")
    
    # Count panels
    print("\n2. Unique panels with data:")
    cursor.execute("SELECT COUNT(DISTINCT panel_id) FROM panel_timeseries")
    panel_count = cursor.fetchone()[0]
    print(f"   {panel_count} panels")
    
    # Date range
    print("\n3. Date range:")
    cursor.execute("SELECT MIN(date), MAX(date) FROM panel_timeseries")
    date_range = cursor.fetchone()
    if date_range[0]:
        print(f"   From: {date_range[0]} to {date_range[1]}")
    
    # Sample data
    print("\n4. Sample data (first 5 records):")
    cursor.execute("""
        SELECT panel_id, parameter, date, value, unit 
        FROM panel_timeseries 
        LIMIT 5
    """)
    print("   Panel ID | Parameter | Date       | Value    | Unit")
    print("   " + "-" * 55)
    for row in cursor.fetchall():
        print(f"   {row[0]:9d} | {row[1]:9s} | {row[2]:10s} | {row[3]:8.2f} | {row[4]}")

def interactive_query(cursor):
    """Run an interactive query."""
    print("\n" + "=" * 60)
    print("Interactive Query Mode")
    print("=" * 60)
    print("Enter SQL queries (type 'exit' to quit, 'help' for examples)")
    print()
    
    while True:
        try:
            query = input("SQL> ").strip()
            
            if query.lower() == 'exit':
                break
            elif query.lower() == 'help':
                print("\nExample queries:")
                print("  SELECT * FROM panel_timeseries WHERE panel_id = 1 LIMIT 10;")
                print("  SELECT COUNT(*) FROM panel_timeseries;")
                print("  SELECT parameter, COUNT(*) FROM panel_timeseries GROUP BY parameter;")
                print("  SELECT * FROM panel_soiling LIMIT 5;")
                continue
            elif not query:
                continue
            
            cursor.execute(query)
            
            # Check if it's a SELECT query
            if query.strip().upper().startswith('SELECT'):
                rows = cursor.fetchall()
                if rows:
                    # Get column names
                    column_names = [description[0] for description in cursor.description]
                    print("\n" + " | ".join(column_names))
                    print("-" * 80)
                    for row in rows:
                        print(" | ".join(str(val) for val in row))
                    print(f"\n{len(rows)} row(s) returned")
                else:
                    print("No rows returned")
            else:
                print("Query executed successfully")
                
        except KeyboardInterrupt:
            print("\nExiting...")
            break
        except Exception as e:
            print(f"Error: {e}")

def main():
    """Main function."""
    print("=" * 60)
    print("SQLite Database Query Tool")
    print("=" * 60)
    print(f"Database: {DB_PATH}")
    
    if not Path(DB_PATH).exists():
        print(f"\nERROR: Database file not found at {DB_PATH}")
        print("Please run the migration script first to create the database.")
        return
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Show database info
        show_tables(cursor)
        
        # Show statistics
        print("\n" + "=" * 60)
        print("Database Statistics")
        print("=" * 60)
        stats = get_data_statistics()
        print(f"Timeseries records by parameter:")
        for param, count in stats.get('timeseries_counts', {}).items():
            print(f"  {param}: {count:,} records")
        print(f"Soiling records: {stats.get('soiling_count', 0):,}")
        print(f"Unique panels (timeseries): {stats.get('unique_panels_timeseries', 0)}")
        print(f"Unique panels (soiling): {stats.get('unique_panels_soiling', 0)}")
        if 'date_range' in stats:
            print(f"Date range: {stats['date_range']['min']} to {stats['date_range']['max']}")
        
        # Show table structures
        print("\n" + "=" * 60)
        print("Table Structures")
        print("=" * 60)
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = cursor.fetchall()
        for table in tables:
            print_table_info(cursor, table[0])
        
        # Example queries
        query_examples(cursor)
        
        # Interactive mode
        interactive_query(cursor)
        
    finally:
        conn.close()
        print("\nConnection closed.")

if __name__ == "__main__":
    main()




