const socket = io('http://localhost:3000');
document.querySelector('.content').classList.add('loading');

let userId = null;
let username = null;
let selectedGroupId = null;

// Handle new task notifications via WebSocket
socket.on('newTask', newTask => {
  alert(`New task added: ${newTask.title}`);
  if (newTask.group_id == selectedGroupId) loadCalendar(newTask.group_id);
});

// Fetch and display user analytics
function loadAnalytics() {
  fetch('http://localhost:3000/analytics', {
    headers: { 'Authorization': localStorage.getItem('jwtToken') }
  })
    .then(response => {
      if (!response.ok) throw new Error('Failed to fetch analytics');
      return response.json();
    })
    .then(data => {
      document.getElementById('groups-joined').textContent = data.groupsJoined;
      document.getElementById('groups-created').textContent = data.groupsCreated;
      document.getElementById('pending-tasks').textContent = data.pendingTasks;
      document.getElementById('total-tasks').textContent = data.totalTasks;
    })
    .catch(error => {
      console.error('Error:', error);
      document.getElementById('analytics-container').innerHTML = '<p>Error loading analytics</p>';
    });
}

// Fetch and display groups for the user
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
        li.innerHTML = `${group.name}: ${group.description || 'No description'} <span class="badge">${group.id}</span> <span class="join-code">Join Code: ${group.join_code}</span>`;
        const membersDiv = document.createElement('div');
        membersDiv.className = 'members-list';
        li.appendChild(membersDiv);
        const leaveButton = document.createElement('button');
        leaveButton.textContent = 'Leave Group';
        leaveButton.className = 'leave-button';
        leaveButton.onclick = () => leaveGroup(group.id, group.creator_id);
        li.appendChild(leaveButton);
        if (group.creator_id == userId) {
          const deleteButton = document.createElement('button');
          deleteButton.textContent = 'Delete Group';
          deleteButton.className = 'delete-button';
          deleteButton.onclick = () => deleteGroup(group.id);
          li.appendChild(deleteButton);
        }
        groupList.appendChild(li);
        fetch(`http://localhost:3000/groups/${group.id}/members`, {
          headers: { 'Authorization': localStorage.getItem('jwtToken') }
        })
          .then(resp => resp.json())
          .then(members => {
            membersDiv.innerHTML = '<strong>Members:</strong> ' + members.map(m => m.username).join(', ') || 'No members yet';
          })
          .catch(error => console.error('Error:', error));
      });
      const groupSelect = document.getElementById('task-group-id');
      groupSelect.innerHTML = '';
      groups.forEach(group => {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.name;
        groupSelect.appendChild(option);
      });
      if (groups.length > 0) {
        selectedGroupId = groupSelect.value;
        loadAssignedToOptions(selectedGroupId);
        loadCalendar(selectedGroupId);
      }
      document.querySelector('.content').classList.remove('loading');
    })
    .catch(error => {
      console.error('Error:', error);
      document.querySelector('.content').classList.remove('loading');
    });
}

// Populate assigned_to dropdown with group members
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
          option.value = member.username;
          option.textContent = member.username;
          assignedSelect.appendChild(option);
        });
      }
    })
    .catch(error => {
      console.error('Error:', error);
      const assignedSelect = document.getElementById('assigned-to');
      assignedSelect.innerHTML = '<option disabled>Error loading members</option>';
    });
}

// Handle leaving a group
function leaveGroup(group_id, creator_id) {
  if (!userId) return alert('Error: User not logged in. Please log in again.');
  if (confirm('Are you sure you want to leave this group?')) {
    fetch(`http://localhost:3000/groups/${group_id}/leave`, {
      method: 'DELETE',
      headers: { 'Authorization': localStorage.getItem('jwtToken') }
    })
      .then(response => {
        if (!response.ok) throw new Error(response.status === 403 ? 'Group creator must delete the group instead' : response.statusText);
        return response.json();
      })
      .then(data => {
        alert(data.message);
        loadGroups();
        loadAnalytics();
      })
      .catch(error => {
        console.error('Error:', error);
        alert('Error: ' + error.message);
      });
  }
}

// Handle group deletion
function deleteGroup(group_id) {
  if (confirm('Are you sure you want to delete this group? This will remove all members and tasks.')) {
    fetch(`http://localhost:3000/groups/${group_id}`, {
      method: 'DELETE',
      headers: { 'Authorization': localStorage.getItem('jwtToken') }
    })
      .then(response => {
        if (!response.ok) throw new Error(response.statusText);
        return response.json();
      })
      .then(data => {
        alert(data.message);
        loadGroups();
        loadAnalytics();
      })
      .catch(error => {
        console.error('Error:', error);
        alert('Error: ' + error.message);
      });
  }
}

// Handle joining a group by code
document.getElementById('join-button').addEventListener('click', () => {
  const join_code = document.getElementById('join-group-code').value;
  const errorElement = document.getElementById('join-error') || document.createElement('span');
  errorElement.id = 'join-error';
  errorElement.className = 'error-message';
  document.getElementById('join-group-code').after(errorElement);
  errorElement.textContent = '';
  if (!join_code) {
    errorElement.textContent = 'Please enter a join code';
    return;
  }
  fetch(`http://localhost:3000/groups/join/code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': localStorage.getItem('jwtToken') },
    body: JSON.stringify({ join_code })
  })
    .then(response => {
      if (!response.ok) throw new Error(response.status === 404 ? 'Invalid join code' : response.status === 400 ? 'Already a member' : 'Join failed');
      return response.json();
    })
    .then(data => {
      alert(data.message);
      loadGroups();
      loadAnalytics();
    })
    .catch(error => {
      console.error('Error:', error);
      errorElement.textContent = error.message;
    });
});

// Handle doodle button click
const doodleButton = document.querySelector('.doodle-button');
if (doodleButton) {
  doodleButton.addEventListener('click', () => alert('Doodle button clicked! Add new group soon!'));
}

// Manage SPA navigation and authentication
function showSection(section) {
  const sections = ['home-section', 'login-section', 'signup-section', 'groups-section', 'calendar-section'];
  if (!localStorage.getItem('jwtToken') && section !== 'login-section' && section !== 'signup-section') {
    alert('Please log in or sign up first!');
    showSection('login-section');
    return;
  }
  sections.forEach(sec => document.getElementById(sec).style.display = 'none');
  document.getElementById(section).style.display = 'block';
  if (localStorage.getItem('jwtToken')) {
    if (section === 'home-section' || section === 'groups-section') loadGroups();
    if (section === 'home-section' || section === 'calendar-section') loadCalendar(selectedGroupId);
    if (section === 'home-section') loadAnalytics();
  }
}

document.getElementById('home-link').addEventListener('click', e => { e.preventDefault(); showSection('home-section'); });
document.getElementById('groups-link').addEventListener('click', e => { e.preventDefault(); showSection('groups-section'); });
document.getElementById('calendar-link').addEventListener('click', e => { e.preventDefault(); showSection('calendar-section'); });
document.getElementById('login-link').addEventListener('click', e => { e.preventDefault(); showSection('login-section'); });
document.getElementById('signup-link').addEventListener('click', e => { e.preventDefault(); showSection('signup-section'); });
document.getElementById('logout-link').addEventListener('click', e => { e.preventDefault(); logout(); });

document.getElementById('switch-to-signup').addEventListener('click', e => { e.preventDefault(); showSection('signup-section'); });
document.getElementById('switch-to-login').addEventListener('click', e => { e.preventDefault(); showSection('login-section'); });

if (localStorage.getItem('jwtToken')) {
  const tokenPayload = JSON.parse(atob(localStorage.getItem('jwtToken').split('.')[1]));
  userId = tokenPayload.id;
  username = tokenPayload.username;
  document.getElementById('username-span').textContent = username;
  document.getElementById('user-info').style.display = 'list-item';
  showSection('home-section');
  document.getElementById('login-link').style.display = 'none';
  document.getElementById('signup-link').style.display = 'none';
  document.getElementById('logout-link').style.display = 'list-item';
  loadGroups();
  loadCalendar(selectedGroupId);
  loadAnalytics();
} else {
  showSection('login-section');
}

// Handle user logout
function logout() {
  localStorage.removeItem('jwtToken');
  userId = null;
  username = null;
  document.getElementById('username-span').textContent = '';
  document.getElementById('user-info').style.display = 'none';
  showSection('login-section');
  document.getElementById('login-link').style.display = 'list-item';
  document.getElementById('signup-link').style.display = 'list-item';
  document.getElementById('logout-link').style.display = 'none';
}

// Handle login form submission
document.getElementById('login-form').addEventListener('submit', e => {
  e.preventDefault();
  const usernameInput = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const errorElement = document.getElementById('login-error');
  errorElement.textContent = '';
  if (!usernameInput || !password) {
    errorElement.textContent = 'Please fill in all fields';
    return;
  }
  fetch('http://localhost:3000/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: usernameInput, password })
  })
    .then(response => {
      if (!response.ok) throw new Error(response.status === 401 ? response.statusText : 'Login failed');
      return response.json();
    })
    .then(data => {
      if (data.token) {
        localStorage.setItem('jwtToken', data.token);
        userId = data.user.id;
        username = data.user.username;
        document.getElementById('username-span').textContent = username;
        document.getElementById('user-info').style.display = 'list-item';
        showSection('home-section');
        document.getElementById('login-link').style.display = 'none';
        document.getElementById('signup-link').style.display = 'none';
        document.getElementById('logout-link').style.display = 'list-item';
        loadGroups();
        loadCalendar(selectedGroupId);
        loadAnalytics();
      }
    })
    .catch(error => {
      console.error('Error:', error);
      errorElement.textContent = error.message === 'Login failed' ? 'An error occurred. Please try again.' : error.message;
    });
});

// Handle signup form submission
document.getElementById('signup-form').addEventListener('submit', e => {
  e.preventDefault();
  const username = document.getElementById('signup-username').value;
  const password = document.getElementById('signup-password').value;
  const email = document.getElementById('signup-email').value;
  const full_name = document.getElementById('signup-full_name').value;
  const usernameError = document.getElementById('signup-username-error');
  const emailError = document.getElementById('signup-email-error');
  usernameError.textContent = '';
  emailError.textContent = '';
  if (!username || !password || !email || !full_name) {
    if (!username) usernameError.textContent = 'Username is required';
    if (!email) emailError.textContent = 'Email is required';
    return;
  }
  fetch('http://localhost:3000/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, email, full_name })
  })
    .then(response => {
      if (!response.ok) throw new Error(response.status === 409 ? response.statusText : 'Signup failed');
      return response.json();
    })
    .then(data => {
      alert('Signup successful! Please login.');
      showSection('login-section');
    })
    .catch(error => {
      console.error('Error:', error);
      if (error.message === 'Username already exists') {
        usernameError.textContent = error.message;
      } else if (error.message === 'Email already exists') {
        emailError.textContent = error.message;
      } else {
        usernameError.textContent = 'An error occurred. Please try again.';
      }
    });
});

// Update selected group for tasks
document.getElementById('task-group-id').addEventListener('change', e => {
  selectedGroupId = e.target.value;
  loadAssignedToOptions(selectedGroupId);
  loadCalendar(selectedGroupId);
});

// Handle task creation form submission
document.getElementById('task-form').addEventListener('submit', e => {
  e.preventDefault();
  const title = document.getElementById('task-title').value;
  const assigned_to = document.getElementById('assigned-to').value;
  const due_date = document.getElementById('due-date').value;
  selectedGroupId = document.getElementById('task-group-id').value;
  const file = document.getElementById('task-note').files[0];
  if (!localStorage.getItem('jwtToken')) return alert('Please log in to create tasks.');
  if (!selectedGroupId) return alert('Please select a group.');
  if (!title) return alert('Title is required.');
  const formData = new FormData();
  formData.append('title', title);
  formData.append('assigned_to', assigned_to);
  formData.append('due_date', due_date);
  if (file) formData.append('note', file);
  fetch(`http://localhost:3000/groups/${selectedGroupId}/tasks`, {
    method: 'POST',
    headers: { 'Authorization': localStorage.getItem('jwtToken') },
    body: formData
  })
    .then(response => {
      if (!response.ok) throw new Error('Task creation failed');
      return response.json();
    })
    .then(data => {
      alert('Task created successfully!' + (data.file_path ? ` Note attached: ${data.file_path}` : ''));
      loadCalendar(selectedGroupId);
      loadAnalytics();
    })
    .catch(error => console.error('Error:', error));
});

// Load and render calendar with tasks
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
          url: task.file_path ? `http://localhost:3000${task.file_path}` : null
        })),
        eventClick: function(info) {
          if (info.event.url) {
            window.open(info.event.url);
            info.jsEvent.preventDefault();
          }
        }
      });
      calendar.render();
      const taskList = document.createElement('ul');
      taskList.id = 'task-list';
      tasks.forEach(task => {
        const li = document.createElement('li');
        li.innerHTML = `${task.title} (Due: ${task.due_date || 'None'}) Assigned to: ${task.assigned_to || 'None'}`;
        const completeBtn = document.createElement('button');
        completeBtn.textContent = 'Mark Complete';
        completeBtn.onclick = () => markTaskComplete(task.id, group_id);
        li.appendChild(completeBtn);
        taskList.appendChild(li);
      });
      calendarEl.appendChild(taskList);
    })
    .catch(error => {
      console.error('Error:', error);
      document.getElementById('calendar-container').innerHTML = '<p class="text-center">Error loading calendar.</p>';
    });
}

// Mark a task as complete
function markTaskComplete(task_id, group_id) {
  if (confirm('Mark this task as complete? It will be removed.')) {
    fetch(`http://localhost:3000/tasks/${task_id}`, {
      method: 'DELETE',
      headers: { 'Authorization': localStorage.getItem('jwtToken') }
    })
      .then(response => {
        if (!response.ok) throw new Error('Complete failed');
        return response.json();
      })
      .then(data => {
        alert(data.message);
        loadCalendar(group_id);
        loadAnalytics();
      })
      .catch(error => {
        console.error('Error:', error);
        alert('Error: ' + error.message);
      });
  }
}

// Handle theme toggle
const themeToggle = document.getElementById('theme-toggle');
const body = document.body;

function setTheme(theme) {
  if (theme === 'light') {
    body.classList.add('light-mode');
    themeToggle.textContent = '☀️';
    localStorage.setItem('theme', 'light');
  } else {
    body.classList.remove('light-mode');
    themeToggle.textContent = '🌙';
    localStorage.setItem('theme', 'dark');
  }
}

const savedTheme = localStorage.getItem('theme');
setTheme(savedTheme || 'dark');

themeToggle.addEventListener('click', () => {
  const currentTheme = body.classList.contains('light-mode') ? 'light' : 'dark';
  setTheme(currentTheme === 'light' ? 'dark' : 'light');
});