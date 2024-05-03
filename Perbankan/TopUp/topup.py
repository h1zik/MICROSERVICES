from flask import Flask, request, jsonify
import mysql.connector
from mysql.connector import Error
import requests

app = Flask(__name__)
NODEJS_BASE_URL = "http://localhost:3000"  # URL where your Node.js app is running

# Establish a database connection
def get_db_connection():
    try:
        return mysql.connector.connect(
            host='localhost',
            user='root',
            password='root',
            database='ponzi_skema'
        )
    except Error as e:
        print(f"Error connecting to MySQL Platform: {e}")
        return None

# Process top-up transactions
@app.route('/process_topup', methods=['POST'])
def process_topup():
    user_id = request.json['user_id']
    amount = request.json['amount']
    db = get_db_connection()
    if db is None:
        return jsonify({'error': 'Database connection could not be established'}), 500

    cursor = db.cursor()
    try:
        cursor.execute('INSERT INTO transactions (user_id, amount) VALUES (%s, %s)', (user_id, amount))
        db.commit()
        # After successful transaction, update balance through the Node.js service
        response = requests.post(f"{NODEJS_BASE_URL}/update-balance", json={'userId': user_id, 'amount': float(amount)})
        if response.status_code == 200:
            return jsonify({'success': True, 'user_id': user_id, 'amount': amount, 'new_balance': response.json().get('new_balance')}), 200
        else:
            db.rollback()  # Roll back the transaction if Node.js service fails
            return jsonify({'error': 'Failed to update balance in PostgreSQL', 'details': response.text}), 500
    except Error as e:
        db.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        db.close()

if __name__ == '__main__':
    app.run(debug=True, port=5001)