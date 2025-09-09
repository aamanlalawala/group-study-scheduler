const http = require('http');
const server = http.createServer(app);
const io = require('socket.io')(server)
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
    user: 'groupscheduler846@gmail.com',
    pass: 'ubkcahiwygrzblvb'
  }
});

// Middleware to parse JSON requests
app.use(express.json());
// Serve static files from public folder
app.use(express.static('./public')); // Move your frontend files here

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

// Auth middleware
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'Access denied' });
  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    res.status(400).json({ error: 'Invalid token' });
  }
};

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
      const mailOptions = {
        from: 'groupscheduler846@gmail.com',
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

// Create group route (added)
app.post('/groups', authenticateToken, (req, res) => {
  const { name, description } = req.body;
  const creator_id = req.user.id; // From JWT
  if (!name) return res.status(400).json({ error: 'Name required' });
  const query = 'INSERT INTO groups (name, description, creator_id) VALUES (?, ?, ?)';
  db.query(query, [name, description || null, creator_id], (err, result) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.status(201).json({ id: result.insertId, name, description });
  });
});

// Get groups route (added auth)
app.get('/groups', authenticateToken, (req, res) => {
  const query = 'SELECT * FROM groups'; // Optionally filter by req.user.id
  db.query(query, (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

// Create task (added auth)
app.post('/groups/:group_id/tasks', (req, res) => {
  const group_id = req.params.group_id;
  const { title, assigned_to, due_date } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  if (due_date) {
    const currentDate = new Date();
    const taskDueDate = new Date(due_date);
    if (taskDueDate <= currentDate) return res.status(400).json({ error: 'Due date must be in the future' });
  }
  const query = 'INSERT INTO tasks (group_id, title, assigned_to, due_date) VALUES (?, ?, ?, ?)';
  db.query(query, [group_id, title, assigned_to || null, due_date || null], (err, result) => {
    if (err) {
      console.error('Task creation error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    const newTask = { id: result.insertId, group_id, title, assigned_to, due_date };
    io.emit('newTask', newTask);
    res.status(201).json(newTask);
  });
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Get tasks for a group (added auth)
app.get('/groups/:group_id/tasks', authenticateToken, (req, res) => {
  const group_id = req.params.group_id;
  const query = 'SELECT * FROM tasks WHERE group_id = ?';
  db.query(query, [group_id], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});