require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const { nanoid } = require('nanoid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

// Supabase setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|doc|docx|txt/;
    const extname = allowedTypes.test(file.originalname.toLowerCase().split('.').pop());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) cb(null, true);
    else cb(new Error('Only .pdf, .doc, .docx, .txt allowed!'));
  }
});

// Nodemailer setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

app.use(express.json());
app.use(express.static('public'));

// JWT auth middleware
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

// Root
app.get('/', (req, res) => res.send('Welcome to the Group Study Scheduler!'));

/* -------------------- Auth -------------------- */

app.post('/signup', async (req, res) => {
  const { username, password, email, full_name } = req.body;
  if (!username || !password || !email || !full_name)
    return res.status(400).json({ error: 'All fields required' });

  try {
    const { data: existing } = await supabase
      .from('users')
      .select('username,email')
      .or(`username.eq.${username},email.eq.${email}`);

    if (existing.length > 0) {
      if (existing[0].username === username)
        return res.status(409).json({ error: 'Username already exists' });
      if (existing[0].email === email)
        return res.status(409).json({ error: 'Email already exists' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const { data, error } = await supabase
      .from('users')
      .insert([{ username, password: hashedPassword, email, full_name }])
      .select();

    if (error) {
      console.error('Supabase signup error:', error);
      return res.status(500).json({ error: 'DB error', details: error.message });
    }

    const user = data[0];
    transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Welcome to Group Study Scheduler!',
      text: `Hi ${full_name},\n\nThanks for signing up! Username: ${username}.\n\nBest,\nGSS Team`
    });

    res.status(201).json({ id: user.id, username, email, full_name, message: 'User created' });
  } catch (err) {
    console.error('Signup server error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });

  const { data: users, error } = await supabase.from('users').select('*').eq('username', username);
  if (error || users.length === 0)
    return res.status(401).json({ error: 'Username does not exist' });

  const user = users[0];
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(401).json({ error: 'Incorrect password' });

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ token, user: { id: user.id, username: user.username, full_name: user.full_name } });
});

/* -------------------- Groups -------------------- */

app.post('/groups', authenticateToken, async (req, res) => {
  try {
    const { name, description } = req.body;
    const creator_id = req.user.id;
    if (!name) return res.status(400).json({ error: 'Name required' });

    const join_code = nanoid(8);
    console.log('Generated join code:', name, description, creator_id);
    const { data, error } = await supabase
      .from('groups')
      .insert([{ name, description, creator_id, join_code }])
      .select();

    if (error) {
      console.error('Supabase group create error:', error);
      return res.status(500).json({ error: 'DB error', details: error.message });
    }

    const group = data[0];

    const { error: memberError } = await supabase.from('group_members').insert([{ group_id: group.id, user_id: creator_id }]);
    if (memberError) {
      console.error('Supabase member insert error:', memberError);
      return res.status(500).json({ error: 'DB error adding member', details: memberError.message });
    }

    res.status(201).json({ ...group, message: 'Group created successfully' });
  } catch (err) {
    console.error('Group create server error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

app.get('/groups', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.id;
    const { data: memberRows, error: gmError } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', user_id);

    if (gmError) {
      console.error('Supabase group members error:', gmError);
      return res.status(500).json({ error: 'DB error', details: gmError.message });
    }

    const groupIds = memberRows.map(r => r.group_id);
    if (groupIds.length === 0) return res.json([]);

    const { data: groups, error: groupsError } = await supabase
      .from('groups')
      .select('*')
      .in('id', groupIds);

    if (groupsError) {
      console.error('Supabase groups fetch error:', groupsError);
      return res.status(500).json({ error: 'DB error', details: groupsError.message });
    }

    res.json(groups);
  } catch (err) {
    console.error('Groups fetch server error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

app.post('/groups/join', authenticateToken, async (req, res) => {
  try {
    const { join_code } = req.body;
    const user_id = req.user.id;
    if (!join_code) return res.status(400).json({ error: 'Join code required' });

    const { data: groups, error: groupError } = await supabase.from('groups').select('id').eq('join_code', join_code);
    if (groupError || groups.length === 0) {
      console.error('Supabase join group error:', groupError);
      return res.status(404).json({ error: 'Invalid join code' });
    }

    const group_id = groups[0].id;

    const { data: member, error: memberError } = await supabase
      .from('group_members')
      .select('id')
      .eq('group_id', group_id)
      .eq('user_id', user_id);

    if (memberError) {
      console.error('Supabase member check error:', memberError);
      return res.status(500).json({ error: 'DB error', details: memberError.message });
    }
    if (member.length > 0) return res.status(400).json({ error: 'Already a member' });

    const { error: insertError } = await supabase.from('group_members').insert([{ group_id, user_id }]);
    if (insertError) {
      console.error('Supabase member insert error:', insertError);
      return res.status(500).json({ error: 'DB error', details: insertError.message });
    }

    res.json({ message: 'Joined group' });
  } catch (err) {
    console.error('Join group server error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

app.delete('/groups/:group_id/leave', authenticateToken, async (req, res) => {
  try {
    const group_id = Number(req.params.group_id);
    const user_id = req.user.id;

    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('creator_id')
      .eq('id', group_id)
      .single();

    if (groupError || !group) {
      console.error('Supabase group fetch error:', groupError);
      return res.status(404).json({ error: 'Group not found' });
    }
    if (group.creator_id === user_id) {
      return res.status(403).json({ error: 'Creators cannot leave their group. Delete it instead.' });
    }

    const { data: membership, error: memberError } = await supabase
      .from('group_members')
      .select('id')
      .eq('group_id', group_id)
      .eq('user_id', user_id)
      .single();

    if (memberError || !membership) {
      console.error('Supabase membership check error:', memberError);
      return res.status(404).json({ error: 'Not a member of this group' });
    }

    const { error: deleteError } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', group_id)
      .eq('user_id', user_id);

    if (deleteError) {
      console.error('Supabase leave group error:', deleteError);
      return res.status(500).json({ error: 'DB error', details: deleteError.message });
    }

    res.json({ message: 'Left group successfully' });
  } catch (err) {
    console.error('Leave group server error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

app.delete('/groups/:group_id', authenticateToken, async (req, res) => {
  try {
    const group_id = Number(req.params.group_id);
    const user_id = req.user.id;

    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('creator_id')
      .eq('id', group_id)
      .single();

    if (groupError || !group) {
      console.error('Supabase group fetch error:', groupError);
      return res.status(404).json({ error: 'Group not found' });
    }
    if (group.creator_id !== user_id) {
      return res.status(403).json({ error: 'Only the creator can delete the group' });
    }

    const { error: tasksError } = await supabase.from('tasks').delete().eq('group_id', group_id);
    if (tasksError) {
      console.error('Supabase tasks delete error:', tasksError);
      return res.status(500).json({ error: 'DB error deleting tasks', details: tasksError.message });
    }

    const { error: membersError } = await supabase.from('group_members').delete().eq('group_id', group_id);
    if (membersError) {
      console.error('Supabase members delete error:', membersError);
      return res.status(500).json({ error: 'DB error deleting members', details: membersError.message });
    }

    const { error: groupDeleteError } = await supabase.from('groups').delete().eq('id', group_id);
    if (groupDeleteError) {
      console.error('Supabase group delete error:', groupDeleteError);
      return res.status(500).json({ error: 'DB error deleting group', details: groupDeleteError.message });
    }

    res.json({ message: 'Group deleted successfully' });
  } catch (err) {
    console.error('Delete group server error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

app.get('/groups/:group_id/members', authenticateToken, async (req, res) => {
  try {
    const group_id = Number(req.params.group_id);
    const { data: memberRows, error: gmError } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', group_id);
    if (gmError) {
      console.error('Supabase group members fetch error:', gmError);
      return res.status(500).json({ error: 'DB error', details: gmError.message });
    }

    const userIds = memberRows.map(r => r.user_id);
    if (userIds.length === 0) return res.json([]);

    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, username')
      .in('id', userIds);
    if (usersError) {
      console.error('Supabase users fetch error:', usersError);
      return res.status(500).json({ error: 'DB error', details: usersError.message });
    }

    res.json(users);
  } catch (err) {
    console.error('Group members server error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

/* -------------------- Tasks -------------------- */

app.post('/groups/:group_id/tasks', authenticateToken, upload.single('note'), async (req, res) => {
  const group_id = req.params.group_id;
  const { title, assigned_to, due_date } = req.body;
  let file_path = null;

  if (!title) return res.status(400).json({ error: 'Title required' });
  if (due_date && new Date(due_date) <= new Date())
    return res.status(400).json({ error: 'Due date must be future' });

  if (req.file) {
    const fileName = `${Date.now()}-${req.file.originalname}`;
    const { error: uploadError } = await supabase.storage
      .from('task-notes')
      .upload(fileName, req.file.buffer, { contentType: req.file.mimetype });
    if (uploadError) {
      console.error('Supabase file upload error:', uploadError);
      return res.status(500).json({ error: 'File upload error', details: uploadError.message });
    }

    const { data: urlData } = supabase.storage.from('task-notes').getPublicUrl(fileName);
    file_path = urlData.publicUrl;
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert([{ group_id, title, assigned_to, due_date, file_path }])
    .select();
  if (error) {
    console.error('Supabase task insert error:', error);
    return res.status(500).json({ error: 'DB error', details: error.message });
  }

  const newTask = data[0];
  io.emit('newTask', newTask);
  res.status(201).json(newTask);
});

app.get('/groups/:group_id/tasks', authenticateToken, async (req, res) => {
  const group_id = req.params.group_id;
  const { data, error } = await supabase.from('tasks').select('*').eq('group_id', group_id);
  if (error) {
    console.error('Supabase tasks fetch error:', error);
    return res.status(500).json({ error: 'DB error', details: error.message });
  }
  res.json(data);
});

app.delete('/tasks/:task_id', authenticateToken, async (req, res) => {
  const task_id = req.params.task_id;
  const username = req.user.username;

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('group_id,title')
    .eq('id', task_id)
    .single();
  if (taskError || !task) {
    console.error('Supabase task fetch error:', taskError);
    return res.status(404).json({ error: 'Task not found' });
  }

  const { error: deleteError } = await supabase.from('tasks').delete().eq('id', task_id);
  if (deleteError) {
    console.error('Supabase task delete error:', deleteError);
    return res.status(500).json({ error: 'DB error', details: deleteError.message });
  }

  res.json({ message: `Task "${task.title}" completed and removed` });
});

/* -------------------- Analytics -------------------- */

app.get('/analytics', authenticateToken, async (req, res) => {
  const user_id = req.user.id;
  const username = req.user.username;

  const { count: groupsJoined } = await supabase
    .from('group_members')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user_id);

  const { count: groupsCreated } = await supabase
    .from('groups')
    .select('*', { count: 'exact', head: true })
    .eq('creator_id', user_id);

  const { count: totalTasks } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('assigned_to', username);

  const { count: pendingTasks } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('assigned_to', username)
    .gt('due_date', new Date().toISOString());

  res.json({ groupsJoined, groupsCreated, totalTasks, pendingTasks });
});

/* -------------------- Socket.IO -------------------- */

io.on('connection', socket => {
  console.log('User connected');
  socket.on('disconnect', () => console.log('User disconnected'));
});

server.listen(port, () => console.log(`Server running on port ${port}`));