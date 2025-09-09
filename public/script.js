// Loading state and group fetch
const socket = io('http://localhost:3000');
document.querySelector('.content').classList.add('loading');

let userId = null; // Store user ID globally
let selectedGroupId = null; // Initialized dynamically

socket.on('newTask', (newTask) => {
  alert(`New task added: ${newTask.title}`);
  if (newTask.group_id == selectedGroupId) {
    loadCalendar(newTask.group_id); // Refresh if matching current group
  }
});

function loadGroups() {
  fetch('http://localhost:3000/groups', {
    headers: { 'Authorization': localStorage.getItem('jwtToken') }
  })
    .then(response => {
      if (!response.ok) throw new Error('Network response was not ok');
      return response.json();
    })
    .then(groups => {
      const groupList = document.getElementById('group-list');
      groupList.innerHTML = '';
      groups.forEach((group, index) => {
        const li = document.createElement('li');
        li.className = 'group-item';
        li.style.setProperty('--order', index);
        li.innerHTML = `${group.name}: ${group.description || 'No description'} <span class="badge">${group.id}</span>`;
        const membersDiv = document.createElement('div');
        membersDiv.className = 'members-list';
        li.appendChild(membersDiv);
        groupList.appendChild(li);

        // Fetch members for this group
        fetch(`http://localhost:3000/groups/${group.id}/members`, {
          headers: { 'Authorization': localStorage.getItem('jwtToken') }
        })
          .then(resp => resp.json())
          .then(members => {
            membersDiv.innerHTML = '<strong>Members:</strong> ' + members.map(m => m.username).join(', ') || 'No members yet';
          })
          .catch(err => console.error('Error fetching members:', err));
      });

      // Populate group dropdown for tasks
      const groupSelect = document.getElementById('task-group-id');
      groupSelect.innerHTML = '';
      groups.forEach(group => {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.name;
        groupSelect.appendChild(option);
      });
      if (groups.length > 0) {
        selectedGroupId = groupSelect.value; // Set to first option
        loadAssignedToOptions(selectedGroupId); // Populate assigned_to for initial group
        loadCalendar(selectedGroupId);
      }

      document.querySelector('.content').classList.remove('loading');
      console.log('Groups loaded successfully');
    })
    .catch(error => {
      console.error('Error fetching groups:', error);
      document.querySelector('.content').classList.remove('loading');
    });
}

// New function to populate assigned_to dropdown with group members
function loadAssignedToOptions(group_id) {
  fetch(`http://localhost:3000/groups/${group_id}/members`, {
    headers: { 'Authorization': localStorage.getItem('jwtToken') }
  })
    .then(response => {
      if (!response.ok) throw new Error('Failed to fetch members');
      return response.json();
    })
    .then(members => {
      const assignedSelect = document.getElementById('assigned-to');
      assignedSelect.innerHTML = '';
      if (members.length === 0) {
        const option = document.createElement('option');
        option.textContent = 'No members';
        option.disabled = true;
        option.selected = true;
        assignedSelect.appendChild(option);
      } else {
        members.forEach(member => {
          const option = document.createElement('option');
          option.value = member.username; // Or member.id if preferring ID
          option.textContent = member.username;
          assignedSelect.appendChild(option);
        });
      }
    })
    .catch(error => {
      console.error('Error fetching members for assigned_to:', error);
      const assignedSelect = document.getElementById('assigned-to');
      assignedSelect.innerHTML = '<option disabled>Error loading members</option>';
    });
}

// Join group button
document.getElementById('join-button').addEventListener('click', () => {
  const group_id = document.getElementById('join-group-id').value;
  if (!group_id) return alert('Enter a group ID');
  fetch(`http://localhost:3000/groups/${group_id}/join`, {
    method: 'POST',
    headers: { 'Authorization': localStorage.getItem('jwtToken') }
  })
    .then(response => {
      if (!response.ok) throw new Error('Join failed');
      return response.json();
    })
    .then(data => {
      alert(data.message);
      loadGroups(); // Refresh groups list
    })
    .catch(error => alert('Error: ' + error.message));
});

// Doodle button interaction
const doodleButton = document.querySelector('.doodle-button');
if (doodleButton) {
  doodleButton.addEventListener('click', () => {
    alert('Doodle button clicked! Add new group soon!');
  });
}

// SPA navigation with auth
function showSection(section) {
  const sections = ['home-section', 'login-section', 'signup-section', 'groups-section', 'calendar-section'];
  if (!localStorage.getItem('jwtToken') && section !== 'login-section' && section !== 'signup-section') {
    alert('Please log in or sign up first!');
    showSection('login-section');
    return;
  }
  sections.forEach(sec => document.getElementById(sec).style.display = 'none');
  document.getElementById(section).style.display = 'block';
  console.log('Switched to section:', section);
  if (localStorage.getItem('jwtToken')) {
    if (section === 'home-section' || section === 'groups-section') loadGroups();
    if (section === 'home-section' || section === 'calendar-section') loadCalendar(selectedGroupId);
  }
}

// Wire up nav links
document.getElementById('home-link').addEventListener('click', (e) => { e.preventDefault(); showSection('home-section'); });
document.getElementById('groups-link').addEventListener('click', (e) => { e.preventDefault(); showSection('groups-section'); });
document.getElementById('calendar-link').addEventListener('click', (e) => { e.preventDefault(); showSection('calendar-section'); });
document.getElementById('login-link').addEventListener('click', (e) => { e.preventDefault(); showSection('login-section'); });
document.getElementById('signup-link').addEventListener('click', (e) => { e.preventDefault(); showSection('signup-section'); });
document.getElementById('logout-link').addEventListener('click', (e) => { e.preventDefault(); logout(); });

// Switch links
document.getElementById('switch-to-signup').addEventListener('click', (e) => { e.preventDefault(); showSection('signup-section'); });
document.getElementById('switch-to-login').addEventListener('click', (e) => { e.preventDefault(); showSection('login-section'); });

// Check if logged in on load
if (localStorage.getItem('jwtToken')) {
  try {
    const payload = JSON.parse(atob(localStorage.getItem('jwtToken').split('.')[1]));
    userId = payload.id;
    const username = payload.username; // Ensure username is available in the token payload
    if (username) {
      document.getElementById('username-span').textContent = username;
      document.getElementById('user-info').style.display = 'list-item';
    } else {
      console.error('Username not found in JWT payload');
    }
    showSection('home-section');
    document.getElementById('login-link').style.display = 'none';
    document.getElementById('signup-link').style.display = 'none';
    document.getElementById('logout-link').style.display = 'list-item';
    loadGroups();
    loadCalendar(selectedGroupId);
  } catch (error) {
    console.error('Error parsing JWT:', error);
    localStorage.removeItem('jwtToken'); // Clear invalid token
    showSection('login-section');
  }
} else {
  showSection('login-section');
}

// Logout function
function logout() {
  localStorage.removeItem('jwtToken');
  userId = null;
  document.getElementById('user-info').style.display = 'none'; // Hide username on logout
  showSection('login-section');
  document.getElementById('login-link').style.display = 'list-item';
  document.getElementById('signup-link').style.display = 'list-item';
  document.getElementById('logout-link').style.display = 'none';
}

// Login form submission
document.getElementById('login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  fetch('http://localhost:3000/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
    .then(response => {
      if (!response.ok) throw new Error('Login failed');
      return response.json();
    })
    .then(data => {
      if (data.token) {
        localStorage.setItem('jwtToken', data.token);
        userId = data.user.id;
        console.log('User ID stored on login:', userId);
        document.getElementById('username-span').textContent = data.user.username; // Set username
        document.getElementById('user-info').style.display = 'list-item'; // Show username
        showSection('home-section');
        document.getElementById('login-link').style.display = 'none';
        document.getElementById('signup-link').style.display = 'none';
        document.getElementById('logout-link').style.display = 'list-item';
        loadGroups();
        loadCalendar(selectedGroupId);
      } else {
        alert('Invalid credentials');
      }
    })
    .catch(error => console.error('Error:', error));
});

// Signup form submission
document.getElementById('signup-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const username = document.getElementById('signup-username').value;
  const password = document.getElementById('signup-password').value;
  const email = document.getElementById('signup-email').value;
  const full_name = document.getElementById('signup-full_name').value;
  fetch('http://localhost:3000/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, email, full_name })
  })
    .then(response => {
      if (!response.ok) throw new Error('Signup failed');
      return response.json();
    })
    .then(data => {
      alert('Signup successful! Please login.');
      showSection('login-section');
    })
    .catch(error => console.error('Error:', error));
});

// Group form submission
document.getElementById('group-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('group-name').value;
  const description = document.getElementById('group-description').value;
  if (!userId) {
    alert('User ID not found. Please log in again.');
    return;
  }
  fetch('http://localhost:3000/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': localStorage.getItem('jwtToken') },
    body: JSON.stringify({ name, description })
  })
    .then(response => {
      if (!response.ok) throw new Error('Group creation failed');
      return response.json();
    })
    .then(data => {
      console.log('Group created:', data);
      loadGroups(); // Reload filtered groups
    })
    .catch(error => console.error('Error creating group:', error));
});

// Task form submission and calendar load
function loadCalendar(group_id) {
  fetch(`http://localhost:3000/groups/${group_id}/tasks`, {
    headers: { 'Authorization': localStorage.getItem('jwtToken') }
  })
    .then(response => {
      if (!response.ok) throw new Error('Task fetch failed');
      return response.json();
    })
    .then(tasks => {
      const calendarEl = document.getElementById('calendar-container');
      calendarEl.innerHTML = '';
      if (tasks.length === 0) {
        calendarEl.innerHTML = '<p class="text-center">No tasks available for this group.</p>';
        return;
      }
      const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        events: tasks.map(task => ({
          title: task.title + (task.file_path ? ' (with note)' : ''),
          start: task.due_date,
          allDay: true,
          url: task.file_path ? `http://localhost:3000${task.file_path}` : null // Clickable note link
        })),
        eventClick: function(info) {
          if (info.event.url) {
            window.open(info.event.url);
            info.jsEvent.preventDefault(); // Prevent navigation
          }
        }
      });
      calendar.render();
      console.log('Calendar rendered with', tasks.length, 'tasks');
    })
    .catch(error => {
      console.error('Error fetching tasks:', error);
      document.getElementById('calendar-container').innerHTML = '<p class="text-center">Error loading calendar.</p>';
    });
}

// Update selectedGroupId when dropdown changes
document.getElementById('task-group-id').addEventListener('change', (e) => {
  selectedGroupId = e.target.value;
  loadAssignedToOptions(selectedGroupId); // Load members for new group
  loadCalendar(selectedGroupId); // Refresh calendar for selected group
});

document.getElementById('task-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = document.getElementById('task-title').value;
  const assigned_to = document.getElementById('assigned-to').value;
  const due_date = document.getElementById('due-date').value;
  selectedGroupId = document.getElementById('task-group-id').value;
  const file = document.getElementById('task-note').files[0]; // Optional file

  if (!localStorage.getItem('jwtToken')) {
    alert('Please log in to create tasks.');
    return;
  }
  if (!selectedGroupId) {
    alert('Please select a group.');
    return;
  }
  if (!title) {
    alert('Title is required.');
    return;
  }

  const formData = new FormData();
  formData.append('title', title);
  formData.append('assigned_to', assigned_to);
  formData.append('due_date', due_date);
  if (file) {
    formData.append('note', file); // Attach file if selected
  }

  fetch(`http://localhost:3000/groups/${selectedGroupId}/tasks`, {
    method: 'POST',
    headers: { 'Authorization': localStorage.getItem('jwtToken') },
    body: formData // No Content-Type header; browser sets multipart/form-data
  })
    .then(response => {
      if (!response.ok) throw new Error('Task creation failed');
      return response.json();
    })
    .then(data => {
      console.log('Task created:', data);
      alert('Task created successfully!' + (data.file_path ? ` Note attached: ${data.file_path}` : ''));
      loadCalendar(selectedGroupId);
    })
    .catch(error => console.error('Error:', error));
});

// Theme toggle logic
const themeToggle = document.getElementById('theme-toggle');
const body = document.body;

function setTheme(theme) {
  if (theme === 'light') {
    body.classList.add('light-mode');
    themeToggle.textContent = '☀️'; // Sun for light mode
    localStorage.setItem('theme', 'light');
  } else {
    body.classList.remove('light-mode');
    themeToggle.textContent = '🌙'; // Moon for dark mode
    localStorage.setItem('theme', 'dark');
  }
}

// Load saved theme on page load
const savedTheme = localStorage.getItem('theme');
setTheme(savedTheme || 'dark'); // Default to dark

// Toggle on click
themeToggle.addEventListener('click', () => {
  const currentTheme = body.classList.contains('light-mode') ? 'light' : 'dark';
  setTheme(currentTheme === 'light' ? 'dark' : 'light');
});