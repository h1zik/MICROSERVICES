from flask import Flask, render_template, request, redirect, session, url_for, jsonify, flash
import requests
import psycopg2

app = Flask(__name__)
app.secret_key = 'your_secret_key_here'  # Use a secure, unique secret key.

# Set up database connection
conn = psycopg2.connect(
    dbname="Murid",
    user="postgres",
    password="root",
    host="localhost",
    port="5432"
)

NODEJS_BASE_URL = "http://localhost:3000"  # URL where your Node.js app is running

@app.route('/register', methods=['GET', 'POST'])
def register():
    error = None
    if request.method == 'POST':
        response = requests.post(f"{NODEJS_BASE_URL}/register", data=request.form)
        if response.status_code != 200:
            error = "An error occurred during registration. Please try again."
            return render_template('register.html', error=error)
        return response.text  # Proxy the response from Node.js directly
    return render_template('register.html', error=error)

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'GET':
        return render_template('login.html')
    elif request.method == 'POST':
        try:
            response = requests.post(f"{NODEJS_BASE_URL}/login", data=request.form)
            response.raise_for_status()  # This will raise an HTTPError for bad responses (4XX, 5XX)
            user_data = response.json()  # Try to decode JSON
            if user_data.get('success'):
                session['user_id'] = user_data.get('userId')  # Adjust this line based on the actual JSON structure
                
                # Fetch the username and balance from the database
                cursor = conn.cursor()
                cursor.execute("SELECT username FROM users WHERE user_id = %s", (session['user_id'],))
                username = cursor.fetchone()[0]  # Fetch the username
                cursor.execute("SELECT balance FROM accounts WHERE user_id = %s", (session['user_id'],))
                balance = cursor.fetchone()[0]  # Fetch the balance
                cursor.execute("SELECT email FROM users WHERE user_id = %s", (session['user_id'],))
                email = cursor.fetchone()[0]  # Fetch the balance
                cursor.close()
                
                # Pass the username and balance to the dashboard template
                return render_template('dashboard.html', username=username, balance=balance, email=email)
            else:
                return render_template('login.html', error=user_data.get('message'))
        except requests.HTTPError as http_err:
            return f"HTTP error occurred: {http_err}", 500
        except ValueError as json_err:
            return f"Invalid JSON response: {response.text}", 500

@app.route('/dashboard')
def dashboard():
    # Check if user is logged in
    if 'user_id' not in session:
        # If no user_id in session, redirect to login page
        return redirect('/login')

    # Assuming user is logged in, render the dashboard page
    # You might retrieve additional user data from the database here
    return render_template('dashboard.html')


@app.route('/logout')
def logout():
    session.pop('user_id', None)
    return redirect('/login')

@app.route('/topup', methods=['POST'])
def top_up():
    user_id = request.form['user_id']
    amount = request.form['amount']
    response = requests.post('http://localhost:5001/process_topup', json={'user_id': user_id, 'amount': amount})
    if response.status_code == 200:
        return jsonify(response.json()), 200
    else:
        return jsonify({'error': 'Failed to process topup'}), 500
    
@app.route('/topup-form')
def show_topup_form():
    # Check if user is logged in
    if 'user_id' not in session:
        # If no user_id in session, redirect to login page
        flash("You must be logged in to access this page.", "info")
        return redirect('/login')
    
    # If logged in, render the top-up form
    return render_template('topup_form.html')

if __name__ == "__main__":
    app.run(debug=True, port=5000)