const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = 3000;
const JWT_SECRET = 'i@will*getco_op_hopefully';

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|doc|docx|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only .pdf, .doc, .docx, .txt allowed!'));
    }
  }
});

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
app.use(express.static(path.join(__dirname, 'public')));

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

// Create group route
app.post('/groups', authenticateToken, (req, res) => {
  const { name, description } = req.body;
  const creator_id = req.user.id;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const query = 'INSERT INTO groups (name, description, creator_id) VALUES (?, ?, ?)';
  db.query(query, [name, description || null, creator_id], (err, result) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    // Automatically add creator as member
    const memberQuery = 'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)';
    db.query(memberQuery, [result.insertId, creator_id], (memberErr) => {
      if (memberErr) console.error('Error adding creator to members:', memberErr);
    });
    res.status(201).json({ id: result.insertId, name, description });
  });
});

// Get groups route (filtered by user's membership)
app.get('/groups', authenticateToken, (req, res) => {
  const user_id = req.user.id;
  const query = `
    SELECT g.* FROM groups g
    JOIN group_members gm ON g.id = gm.group_id
    WHERE gm.user_id = ?
  `;
  db.query(query, [user_id], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

// Join group route (new)
app.post('/groups/:group_id/join', authenticateToken, (req, res) => {
  const group_id = req.params.group_id;
  const user_id = req.user.id;
  const checkQuery = 'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?';
  db.query(checkQuery, [group_id, user_id], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (results.length > 0) return res.status(400).json({ error: 'Already a member' });
    const joinQuery = 'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)';
    db.query(joinQuery, [group_id, user_id], (joinErr) => {
      if (joinErr) return res.status(500).json({ error: 'Database error' });
      res.json({ message: 'Joined group successfully' });
    });
  });
});

// Get group members route (new)
app.get('/groups/:group_id/members', authenticateToken, (req, res) => {
  const group_id = req.params.group_id;
  const query = `
    SELECT u.username, u.full_name FROM users u
    JOIN group_members gm ON u.id = gm.user_id
    WHERE gm.group_id = ?
  `;
  db.query(query, [group_id], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

// Create task route with optional file upload and WebSocket
app.post('/groups/:group_id/tasks', authenticateToken, upload.single('note'), (req, res) => {
  const group_id = req.params.group_id;
  const { title, assigned_to, due_date } = req.body;
  const filePath = req.file ? `/uploads/${req.file.filename}` : null;

  if (!title) return res.status(400).json({ error: 'Title is required' });
  if (due_date) {
    const currentDate = new Date();
    const taskDueDate = new Date(due_date);
    if (taskDueDate <= currentDate) return res.status(400).json({ error: 'Due date must be in the future' });
  }

  const query = 'INSERT INTO tasks (group_id, title, assigned_to, due_date, file_path) VALUES (?, ?, ?, ?, ?)';
  db.query(query, [group_id, title, assigned_to || null, due_date || null, filePath], (err, result) => {
    if (err) {
      console.error('Task creation error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    const newTask = { id: result.insertId, group_id, title, assigned_to, due_date, file_path: filePath };
    io.emit('newTask', newTask); // Broadcast to all connected clients
    res.status(201).json(newTask);
  });
});

// Get tasks for a group
app.get('/groups/:group_id/tasks', authenticateToken, (req, res) => {
  const group_id = req.params.group_id;
  const query = 'SELECT * FROM tasks WHERE group_id = ?';
  db.query(query, [group_id], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});