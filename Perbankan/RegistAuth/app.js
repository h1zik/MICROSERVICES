const express = require('express');
const session = require('express-session');
const app = express()
const cors = require('cors');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Middleware
app.use(session({
    secret: 'your-secret-key', // Password Session
    resave: false,
    saveUninitialized: false
}));



const bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: true }));

const bcrypt = require('bcrypt');
const saltRounds = 10; // Untuk angka salt buat hashing

const client = require('./db')
app.set('view engine', 'ejs');

client.connect()
    .then(() => console.log('Connected to PostgreSQL database'))
    .catch(err => console.error('Connection error', err.stack));

// Route to render the registration form
app.get('/register', (req, res) => {
    res.render('register', { error: null });

});

// Route to handle user registration form submission
app.post('/register', (req, res) => {
    const { username, email, password } = req.body;

    // Check if the username already exists in the database
    const query = 'SELECT COUNT(*) AS count FROM users WHERE username = $1';
    const values = [username];

    client.query(query, values, (err, result) => {
        if (err) {
            console.error('Error executing query', err);
            res.status(500).send('Internal Server Error');
            return;
        }

        // Check if any rows were returned by the query
        if (result.rows.length > 0) {
            // Username already exists, send error message
            if (result.rows[0].count > 0) {
                res.render('register', { error: 'Username already exists' });
                return;
            }
        }

        // Hash the password
        bcrypt.hash(password, saltRounds, (err, hash) => {
            if (err) {
                console.error('Error hashing password', err);
                res.status(500).send('Internal Server Error');
                return;
            }

            // Begin a transaction
            client.query('BEGIN', (err) => {
                if (err) {
                    console.error('Error beginning transaction', err);
                    res.status(500).send('Internal Server Error');
                    return;
                }

                // Insert user data into the database with hashed password
                const insertUserQuery = 'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING user_id';
                const insertUserValues = [username, email, hash];

                client.query(insertUserQuery, insertUserValues, (err, userResult) => {
                    if (err) {
                        console.error('Error inserting user', err);
                        client.query('ROLLBACK', () => {
                            res.status(500).send('Internal Server Error');
                        });
                        return;
                    }

                    const userId = userResult.rows[0].user_id;

                    // Insert user into the accounts table
                    const insertAccountQuery = 'INSERT INTO accounts (user_id, balance) VALUES ($1, $2)';
                    const insertAccountValues = [userId, 0]; // Initialize balance to 0

                    client.query(insertAccountQuery, insertAccountValues, (err) => {
                        if (err) {
                            console.error('Error inserting account', err);
                            client.query('ROLLBACK', () => {
                                res.status(500).send('Internal Server Error');
                            });
                            return;
                        }

                        // Commit the transaction
                        client.query('COMMIT', (err) => {
                            if (err) {
                                console.error('Error committing transaction', err);
                                res.status(500).send('Internal Server Error');
                                return;
                            }

                            res.send('User registered successfully!');
                        });
                    });
                });
            });
        });
    });
});

// Login Form
app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

// Login Route
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    // Retrieve user from the database by username
    const query = 'SELECT * FROM users WHERE username = $1';
    const values = [username];

    client.query(query, values, (err, result) => {
        if (err) {
            console.error('Error executing query', err);
            res.status(500).json({ error: 'Internal Server Error' });
            return;
        }

        if (result.rows.length === 0) {
            // User not found
            res.status(401).json({ error: 'Invalid username or password' });
            return;
        }

        const user = result.rows[0];
        // Check if the password is correct
        bcrypt.compare(password, user.password, (err, passwordMatch) => {
            if (err) {
                console.error('Error comparing passwords', err);
                res.status(500).json({ error: 'Internal Server Error' });
                return;
            }

            if (!passwordMatch) {
                // Incorrect password
                res.status(401).json({ error: 'Invalid username or password' });
                return;
            }

            // Password is correct, store user ID in session
            req.session.userId = user.user_id;
            res.json({ success: true, message: 'Login successful', userId: user.user_id });
        });
    });
});

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        // User is authenticated, proceed to next middleware or route handler
        next();
    } else {
        // User is not authenticated, redirect to login page
        res.redirect('/login');
    }
}

// Protected route example
app.get('/dashboard', isAuthenticated, (req, res) => {
    const userId = req.session.userId;
    // Fetch username and balance from the database based on userId
    const query = 'SELECT username, balance FROM users INNER JOIN accounts ON users.user_id = accounts.user_id WHERE users.user_id = $1';
    const values = [userId];
    client.query(query, values, (err, result) => {
        if (err) {
            console.error('Error executing query', err);
            res.status(500).send('Internal Server Error');
            return;
        }
        if (result.rows.length === 0) {
            // User not found
            res.status(404).send('User not found');
            return;
        }
        const username = result.rows[0].username;
        let balance = parseFloat(result.rows[0].balance); // Convert balance to a number
        // Render the dashboard template with the username and balance
        res.render('dashboard', { username, balance });
    });
});

// Logout Route
app.get('/logout', (req, res) => {
    // Destroy session and redirect to login page
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session', err);
            res.status(500).send('Internal Server Error');
            return;
        }
        res.redirect('/login');
    });
});

// Update balance endpoint
app.post('/update-balance', async (req, res) => {
    const { userId, amount } = req.body;
    
    if (!userId || !amount) {
        return res.status(400).json({ error: 'Missing userId or amount' });
    }

    try {
        await client.query('BEGIN');
        const query = 'UPDATE accounts SET balance = balance + $1 WHERE user_id = $2 RETURNING balance';
        const values = [amount, userId];
        const { rows } = await client.query(query, values);
        await client.query('COMMIT');
        res.json({ success: true, new_balance: rows[0].balance });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error executing query', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.listen(3000, () => {
    console.log('Example app listening on port 3000!')
})