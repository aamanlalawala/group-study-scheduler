const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const app = express();
const port = 3000;
const JWT_SECRET = 'i@will*getco_op_hopefully';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'groupscheduler846@gmail.com', pass: 'ubkcahiwygrzblvb' 
  }
});

// MySQL connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'study_scheduler'
});

db.connect((err) => {
  if (err) console.error('Error connecting to MySQL:', err);
  else console.log('Connected to MySQL database');
});

// Middleware to parse JSON requests
app.use(express.json());

// Basic route
app.get('/', (req, res) => {
  res.send('Welcome to the Group Study Scheduler!');
});

// Signup route
app.post('/signup', async (req, res) => {
  const { username, password, email, full_name } = req.body;
  if (!username || !password || !email || !full_name) {
    return res.status(400).json({ error: 'All fields required' });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const query = 'INSERT INTO users (username, password, email, full_name) VALUES (?, ?, ?, ?)';
    db.query(query, [username, hashedPassword, email, full_name], (err, result) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Username or email exists' });
        return res.status(500).json({ error: 'Database error' });
      }
      // Send welcome email
      const mailOptions = {
        from: 'yourgmail@gmail.com',
        to: email,
        subject: 'Welcome to Group Study Scheduler!',
        text: `Hi ${full_name},\n\nThanks for signing up! Username: ${username}.\n\nStart coordinating groups.\n\nBest,\nGSS Team`
      };
      transporter.sendMail(mailOptions, (mailErr) => {
        if (mailErr) console.error('Email error:', mailErr);
      });
      res.status(201).json({ id: result.insertId, username, email, full_name, message: 'User created' });
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Login route
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const query = 'SELECT * FROM users WHERE username = ?';
  db.query(query, [username], async (err, results) => {
    if (err || results.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = results[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, user: { id: user.id, username: user.username, full_name: user.full_name } });
  });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});