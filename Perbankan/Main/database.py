from flask import Flask
import psycopg2

app = Flask(__name__)

# Database configuration
DB_NAME = 'Murid'
DB_USER = 'postgres'
DB_PASSWORD = 'root'
DB_HOST = 'localhost'  # Usually 'localhost' if the database is on the same machine
DB_PORT = '5432'  # Default PostgreSQL port

# Define a route to check database connection
@app.route('/check_db_connection')
def check_db_connection():
    try:
        # Attempt to connect to the PostgreSQL database
        conn = psycopg2.connect(
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            host=DB_HOST,
            port=DB_PORT
        )
        conn.close()
        return 'Database connection successful!'
    except Exception as e:
        return f'Database connection failed: {str(e)}'

if __name__ == '__main__':
    app.run(debug=True)