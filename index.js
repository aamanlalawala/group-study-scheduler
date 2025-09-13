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
const { nanoid } = require('nanoid');
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
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|doc|docx|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) cb(null, true);
    else cb(new Error('Only .pdf, .doc, .docx, .txt allowed!'));
  }
});

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'groupscheduler846@gmail.com',
    pass: 'ubkcahiwygrzblvb'
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connect to MySQL database
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'study_scheduler'
});

db.connect(err => {
  if (err) throw err;
  console.log('Connected to MySQL database');
});

// Middleware to authenticate JWT token
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'Access denied' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(400).json({ error: 'Invalid token' });
  }
};

// Serve welcome message for root endpoint
app.get('/', (req, res) => res.send('Welcome to the Group Study Scheduler!'));

// Handle user signup with email notification
app.post('/signup', async (req, res) => {
  const { username, password, email, full_name } = req.body;
  if (!username || !password || !email || !full_name) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  try {
    // Check for existing username or email
    const checkQuery = 'SELECT username, email FROM users WHERE username = ? OR email = ?';
    db.query(checkQuery, [username, email], (err, results) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (results.length > 0) {
        const existing = results[0];
        if (existing.username === username) return res.status(409).json({ error: 'Username already exists' });
        if (existing.email === email) return res.status(409).json({ error: 'Email already exists' });
      }
      const hashedPassword = bcrypt.hashSync(password, 10);
      const query = 'INSERT INTO users (username, password, email, full_name) VALUES (?, ?, ?, ?)';
      db.query(query, [username, hashedPassword, email, full_name], (err, result) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        const mailOptions = {
          from: 'groupscheduler846@gmail.com',
          to: email,
          subject: 'Welcome to Group Study Scheduler!',
          text: `Hi ${full_name},\n\nThanks for signing up! Username: ${username}.\n\nStart coordinating groups.\n\nBest,\nGSS Team`
        };
        transporter.sendMail(mailOptions, mailErr => {
          if (mailErr) console.error('Email error:', mailErr);
        });
        res.status(201).json({ id: result.insertId, username, email, full_name, message: 'User created' });
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Handle user login with JWT generation
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
  const query = 'SELECT * FROM users WHERE username = ?';
  db.query(query, [username], async (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (results.length === 0) return res.status(401).json({ error: 'Username does not exist' });
    const user = results[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Incorrect password' });
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, user: { id: user.id, username: user.username, full_name: user.full_name } });
  });
});

// Create a new group with join code
app.post('/groups', authenticateToken, (req, res) => {
  const { name, description } = req.body;
  const creator_id = req.user.id;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const join_code = nanoid(8);
  const query = 'INSERT INTO groups (name, description, creator_id, join_code) VALUES (?, ?, ?, ?)';
  db.query(query, [name, description || null, creator_id, join_code], (err, result) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    const memberQuery = 'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)';
    db.query(memberQuery, [result.insertId, creator_id], memberErr => {
      if (memberErr) console.error('Error adding creator to members:', memberErr);
    });
    res.status(201).json({ id: result.insertId, name, description, join_code });
  });
});

// Fetch groups for authenticated user
app.get('/groups', authenticateToken, (req, res) => {
  const user_id = req.user.id;
  const query = `
    SELECT g.id, g.name, g.description, g.creator_id, g.join_code FROM groups g
    JOIN group_members gm ON g.id = gm.group_id
    WHERE gm.user_id = ?
  `;
  db.query(query, [user_id], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

// Join a group using join code
app.post('/groups/join/code', authenticateToken, (req, res) => {
  const { join_code } = req.body;
  const user_id = req.user.id;
  if (!join_code) return res.status(400).json({ error: 'Join code required' });
  db.query('SELECT id FROM groups WHERE join_code = ?', [join_code], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (results.length === 0) return res.status(404).json({ error: 'Invalid join code' });
    const group_id = results[0].id;
    const checkQuery = 'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?';
    db.query(checkQuery, [group_id, user_id], (err, results) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (results.length > 0) return res.status(400).json({ error: 'Already a member' });
      const joinQuery = 'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)';
      db.query(joinQuery, [group_id, user_id], joinErr => {
        if (joinErr) return res.status(500).json({ error: 'Database error' });
        res.json({ message: 'Joined group successfully' });
      });
    });
  });
});

// Allow user to leave a group
app.delete('/groups/:group_id/leave', authenticateToken, (req, res) => {
  const group_id = req.params.group_id;
  const user_id = req.user.id;
  // Check if user is creator
  db.query('SELECT creator_id FROM groups WHERE id = ?', [group_id], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (results.length === 0) return res.status(404).json({ error: 'Group not found' });
    if (results[0].creator_id === user_id) return res.status(403).json({ error: 'Group creator must delete the group instead' });
    const query = 'DELETE FROM group_members WHERE group_id = ? AND user_id = ?';
    db.query(query, [group_id, user_id], (err, result) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Not a member of this group' });
      res.json({ message: 'Left group successfully' });
    });
  });
});

// Fetch members of a group
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

// Delete a group (creator only)
app.delete('/groups/:group_id', authenticateToken, (req, res) => {
  const group_id = req.params.group_id;
  const user_id = req.user.id;
  const checkQuery = 'SELECT * FROM groups WHERE id = ? AND creator_id = ?';
  db.query(checkQuery, [group_id, user_id], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (results.length === 0) return res.status(403).json({ error: 'Only the group creator can delete this group' });
    const deleteTasksQuery = 'DELETE FROM tasks WHERE group_id = ?';
    db.query(deleteTasksQuery, [group_id], taskErr => {
      if (taskErr) return res.status(500).json({ error: 'Error deleting tasks' });
      const deleteMembersQuery = 'DELETE FROM group_members WHERE group_id = ?';
      db.query(deleteMembersQuery, [group_id], memberErr => {
        if (memberErr) return res.status(500).json({ error: 'Error deleting group members' });
        const deleteGroupQuery = 'DELETE FROM groups WHERE id = ?';
        db.query(deleteGroupQuery, [group_id], groupErr => {
          if (groupErr) return res.status(500).json({ error: 'Error deleting group' });
          res.json({ message: 'Group deleted successfully' });
        });
      });
    });
  });
});

// Create a task with optional file upload
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
    if (err) return res.status(500).json({ error: 'Database error' });
    const newTask = { id: result.insertId, group_id, title, assigned_to, due_date, file_path: filePath };
    io.emit('newTask', newTask);
    res.status(201).json(newTask);
  });
});

// Fetch tasks for a group
app.get('/groups/:group_id/tasks', authenticateToken, (req, res) => {
  const group_id = req.params.group_id;
  const query = 'SELECT * FROM tasks WHERE group_id = ?';
  db.query(query, [group_id], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

// Mark a task as complete and notify group
app.delete('/tasks/:task_id', authenticateToken, (req, res) => {
  const task_id = req.params.task_id;
  const user_id = req.user.id;
  const username = req.user.username;
  db.query('SELECT group_id, title FROM tasks WHERE id = ?', [task_id], (err, results) => {
    if (err || results.length === 0) return res.status(404).json({ error: 'Task not found' });
    const { group_id, title } = results[0];
    db.query('DELETE FROM tasks WHERE id = ?', [task_id], deleteErr => {
      if (deleteErr) return res.status(500).json({ error: 'Database error' });
      const emailQuery = `
        SELECT u.email FROM users u
        JOIN group_members gm ON u.id = gm.user_id
        WHERE gm.group_id = ?
      `;
      db.query(emailQuery, [group_id], (emailErr, emailResults) => {
        if (emailErr) return res.json({ message: 'Task completed and removed' });
        const emails = emailResults.map(row => row.email).join(',');
        const mailOptions = {
          from: 'groupscheduler846@gmail.com',
          to: emails,
          subject: `Task Completed: ${title}`,
          text: `Hi team,\n\n${username} has completed the task "${title}" in your group.\n\nBest,\nGSS Team`
        };
        transporter.sendMail(mailOptions, mailErr => {
          if (mailErr) console.error('Email error:', mailErr);
        });
        res.json({ message: 'Task completed and removed' });
      });
    });
  });
});

// Fetch user analytics
app.get('/analytics', authenticateToken, (req, res) => {
  const user_id = req.user.id;
  const username = req.user.username;
  db.query('SELECT COUNT(*) as count FROM group_members WHERE user_id = ?', [user_id], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    const groupsJoined = results[0].count;
    db.query('SELECT COUNT(*) as count FROM groups WHERE creator_id = ?', [user_id], (err, results) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      const groupsCreated = results[0].count;
      db.query('SELECT COUNT(*) as count FROM tasks WHERE assigned_to = ?', [username], (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        const totalTasks = results[0].count;
        db.query(
          'SELECT COUNT(*) as count FROM tasks WHERE assigned_to = ? AND (due_date > NOW() OR due_date IS NULL)',
          [username],
          (err, results) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            const pendingTasks = results[0].count;
            res.json({ groupsJoined, groupsCreated, totalTasks, pendingTasks });
          }
        );
      });
    });
  });
});

io.on('connection', socket => {
  console.log('User connected:', socket.id);
  socket.on('disconnect', () => console.log('User disconnected:', socket.id));
});

server.listen(port, () => console.log(`Server running at http://localhost:${port}`));