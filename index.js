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

// Middleware to parse JSON requests
app.use(express.json());

// Basic route
app.get('/', (req, res) => {
  res.send('Welcome to the Group Study Scheduler!');
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});