# Group Study Scheduler

A web application designed to help students coordinate study groups, schedule sessions, assign tasks, and share notes in real-time. Built with a Node.js backend and a simple HTML/CSS/JS frontend, it uses Supabase for database and storage, Socket.io for real-time updates, and FullCalendar for visualizing tasks.

- *Date Created*: 01 Sep 2025
- *Last Modification Date*: 29 Sep 2025
- *Lab URL*: https://github.com/aamanlalawala/group-study-scheduler

## Authors

- Aaman Lalawala - Lead Developer

## Built With

- Node.js - JavaScript runtime for the backend
- Express.js - Web framework for building the API
- Supabase - Database and storage for user data and file uploads
- Socket.io - Real-time task notifications
- FullCalendar - Calendar view for task scheduling
- Nodemailer - Email notifications for user signups
- Multer - File upload handling
- jsonwebtoken - JWT-based authentication
- bcryptjs - Password hashing
- nanoid - Unique ID generation for group join codes
- dotenv - Environment variable management

## Sources Used

### index.js

*Lines 13-20*

```
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

// Supabase setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
```

The code above was created by adapting the code in Supabase Node.js Quickstart as shown below:

```
const { createClient } = require('@supabase/supabase-js')
const supabase = createClient('https://xyzcompany.supabase.co', 'public-anon-key')
```

- **How**: The code from Supabase Node.js Quickstart was implemented by initializing the Supabase client with environment variables for URL and service key.
- **Why**: Supabase's code was used because it provides a straightforward way to connect to a PostgreSQL-based database and storage system, essential for managing users, groups, and tasks.
- **How Modified**: The original code was modified to use environment variables (`process.env.SUPABASE_URL` and `process.env.SUPABASE_SERVICE_ROLE_KEY`) for secure configuration and added options to disable auto-refresh and session persistence for better control in a server environment.

### index.js

*Lines 46-58*

```
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
```

The code above was created by adapting the code in jsonwebtoken npm guide as shown below:

```
const jwt = require('jsonwebtoken');
function verifyToken(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) return res.status(403).send('Token required');
  jwt.verify(token, 'secret', (err, decoded) => {
    if (err) return res.status(401).send('Invalid token');
    req.user = decoded;
    next();
  });
}
```

- **How**: The code from jsonwebtoken npm guide was implemented by creating a middleware function to verify JWT tokens in incoming requests.
- **Why**: The JWT middleware was used to secure API endpoints by ensuring only authenticated users can access protected routes.
- **How Modified**: The original code was modified to use a synchronous `jwt.verify` call, simplify error responses, and use the `JWT_SECRET` from environment variables for better security.

### script.js

*Lines 139-157*

```
const calendar = new FullCalendar.Calendar(calendarEl, {
  initialView: 'dayGridMonth',
  events: tasks.map(task => ({
    title: task.title + (task.file_path ? ' (with note)' : ''),
    start: task.due_date,
    allDay: true,
    url: task.file_path ? `${task.file_path}` : null
  })),
  eventClick: function(info) {
    if (info.event.url) {
      window.open(info.event.url);
      info.jsEvent.preventDefault();
    }
  }
});
calendar.render();
```

The code above was created by adapting the code in FullCalendar Basic Usage as shown below:

```
import { Calendar } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
let calendar = new Calendar(calendarEl, {
  plugins: [ dayGridPlugin ],
  initialView: 'dayGridMonth',
  events: [
    { title: 'Event', date: '2023-01-01' }
  ]
});
calendar.render();
```

- **How**: The code from FullCalendar Basic Usage was implemented to render a monthly calendar view with task events.
- **Why**: FullCalendar's code was used because it provides a robust and customizable calendar interface for displaying tasks with due dates.
- **How Modified**: The original code was adapted to use the non-module version (since the project uses `<script>` tags), map tasks from the API to calendar events, add file links, and include an `eventClick` handler to open attached notes in a new tab.

### style.css

*Lines 8-23*

```
:root {
  --bg-color: #1c2526;
  --text-color: #f5f6f5;
  --section-bg: rgba(255, 255, 255, 0.15);
  --border-color: rgba(255, 255, 255, 0.3);
  --hover-bg: rgba(255, 255, 255, 0.25);
  --button-bg: #f5f6f5;
  --button-text: #1c2526;
  --badge-bg: #ff6b6b;
  --badge-text: #1c2526;
  --bg-image: url('https://www.transparenttextures.com/patterns/stardust.png');
  --calendar-bg: rgba(255, 255, 255, 0.1);
  --calendar-text: #f5f6f5;
  --calendar-border: rgba(255, 255, 255, 0.2);
  --calendar-event-bg: rgba(255, 255, 255, 0.3);
}
```

The code above was created by adapting the code in CSS Variables Tutorial as shown below:

```
:root {
  --blue: #1e90ff;
  --white: #ffffff;
}
body { background-color: var(--blue); }
h2 { border: 2px solid var(--white); }
```

- **How**: The code from CSS Variables Tutorial was implemented to define theme variables for colors and backgrounds.
- **Why**: CSS variables were used to enable easy theme switching (light/dark mode) and maintain consistent styling across the application.
- **How Modified**: The original code was expanded to include a comprehensive set of variables for background, text, buttons, badges, and calendar elements, with specific values tailored to the app's aesthetic. It also incorporates a texture background from Transparent Textures.

### index.js

*Lines 60-77*

```
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

app.post('/signup', async (req, res) => {
  const { username, password, email, full_name } = req.body;
  if (!username || !password || !email || !full_name)
    return res.status(400).json({ error: 'All fields required' });
  // ... (other signup logic)
  transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Welcome to Group Study Scheduler!',
    text: `Hi ${full_name},\n\nThanks for signing up! Username: ${username}.\n\nBest,\nGSS Team`
  });
  // ... (rest of signup logic)
});
```

The code above was created by adapting the code in Nodemailer Usage Guide as shown below:

```
const nodemailer = require('nodemailer');
let transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: 'user@gmail.com', pass: 'password' }
});
transporter.sendMail({
  from: '"Sender" <user@gmail.com>',
  to: 'recipient@example.com',
  subject: 'Hello',
  text: 'Hello world!'
});
```

- **How**: The code from Nodemailer Usage Guide was implemented to set up email notifications for new user signups.
- **Why**: Nodemailer's code was used to send welcome emails, enhancing user experience by confirming account creation.
- **How Modified**: The original code was adapted to use environment variables for email credentials, integrated into the signup endpoint, and customized the email content to include the user's full name and username.

## Acknowledgments

- Thanks to the Supabase team for their excellent documentation and quickstart guides.
- Inspiration from online tutorials like Traversy Media's Socket.io video for real-time functionality.
- The FullCalendar community for providing a robust calendar library.
- Transparent Textures for the background pattern used in styling.

## References

* [Supabase — Getting Started / Node.js Quickstart](https://supabase.com/docs/guides/getting-started)  
  https://supabase.com/docs/guides/getting-started  
* [jsonwebtoken — npm Package](https://www.npmjs.com/package/jsonwebtoken)  
  https://www.npmjs.com/package/jsonwebtoken  
* [FullCalendar — Basic Usage Documentation](https://fullcalendar.io/docs/v1/usage)  
  https://fullcalendar.io/docs/v1/usage  
* [FullCalendar — Getting Started](https://fullcalendar.io/docs/getting-started)  
  https://fullcalendar.io/docs/getting-started  
* [CSS Custom Properties (CSS Variables) — W3Schools Tutorial](https://www.w3schools.com/css/css_custom_properties.asp)  
  https://www.w3schools.com/css/css_custom_properties.asp  
* [Nodemailer — Official Documentation](https://nodemailer.com/about/)  
  https://nodemailer.com/about/  
* [Transparent Textures — Background Pattern Resource](https://www.transparenttextures.com/)  
  https://www.transparenttextures.com/  
* [DigitalOcean — How To Use JSON Web Tokens (JWT) in Express.js](https://www.digitalocean.com/community/tutorials/nodejs-jwt-expressjs)  
  https://www.digitalocean.com/community/tutorials/nodejs-jwt-expressjs
  
### YouTube Video Tutorials
* [Realtime Chat With Users & Rooms – Socket.io, Node & Express (Traversy Media)](https://www.youtube.com/watch?v=jD7FnbI76Hg)  
  https://www.youtube.com/watch?v=jD7FnbI76Hg  
* [WebSockets Beginners Tutorial with Socket.IO (freeCodeCamp.org)](https://www.youtube.com/watch?v=CzcfeL7ymbU)  
  https://www.youtube.com/watch?v=CzcfeL7ymbU  
* [Build A Booking Calendar App From Scratch (Step by Step Tutorial)](https://www.youtube.com/watch?v=DD2Ds3NOOXQ)  
  https://www.youtube.com/watch?v=DD2Ds3NOOXQ  
* [Subscribe to events with @Supabase — Course part 10](https://www.youtube.com/watch?v=vUBYq-99TsE)  
  https://www.youtube.com/watch?v=vUBYq-99TsE  
