// -------------------- CONFIG --------------------
const API_URL = window.location.hostname.includes('localhost')
  ? 'http://localhost:3000'
  : 'http://group-study-scheduler-1.onrender.com'; 

const socket = io(API_URL);
document.querySelector('.content').classList.add('loading');

let userId = null;
let username = null;
let selectedGroupId = null;

// Helper to include auth header
function authHeaders(extra = {}) {
  const token = localStorage.getItem('jwtToken');
  return token ? { Authorization: token, ...extra } : { ...extra };
}

// -------------------- SOCKET HANDLERS --------------------
socket.on('newTask', newTask => {
  try {
    alert(`New task added: ${newTask.title}`);
    if (newTask.group_id == selectedGroupId) loadCalendar(newTask.group_id);
  } catch (e) { console.warn(e); }
});

// -------------------- ANALYTICS --------------------
function loadAnalytics() {
  fetch(`${API_URL}/analytics`, { headers: authHeaders() })
    .then(response => {
      if (!response.ok) throw new Error('Failed to fetch analytics');
      return response.json();
    })
    .then(data => {
      document.getElementById('groups-joined').textContent = data.groupsJoined ?? 0;
      document.getElementById('groups-created').textContent = data.groupsCreated ?? 0;
      document.getElementById('pending-tasks').textContent = data.pendingTasks ?? 0;
      document.getElementById('total-tasks').textContent = data.totalTasks ?? 0;
    })
    .catch(error => {
      console.error('Analytics error:', error);
      document.getElementById('analytics-container').innerHTML = '<p>Error loading analytics</p>';
    });
}

// -------------------- GROUPS --------------------
function loadGroups() {
  fetch(`${API_URL}/groups`, { headers: authHeaders() })
    .then(response => {
      if (!response.ok) throw new Error('Failed to fetch groups');
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

        // load members
        fetch(`${API_URL}/groups/${group.id}/members`, { headers: authHeaders() })
          .then(resp => resp.json())
          .then(members => {
            membersDiv.innerHTML = '<strong>Members:</strong> ' + (members.map(m => m.username).join(', ') || 'No members yet');
          })
          .catch(err => {
            console.error('Members load error:', err);
            membersDiv.innerHTML = '<strong>Members:</strong> Error loading';
          });
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
      console.error('Error fetching groups:', error);
      document.querySelector('.content').classList.remove('loading');
    });
}

// load assigned to options
function loadAssignedToOptions(group_id) {
  fetch(`${API_URL}/groups/${group_id}/members`, { headers: authHeaders() })
    .then(response => {
      if (!response.ok) throw new Error('Failed to fetch members');
      return response.json();
    })
    .then(members => {
      const assignedSelect = document.getElementById('assigned-to');
      assignedSelect.innerHTML = '';
      if (!members || members.length === 0) {
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
      console.error('Error loading assigned-to:', error);
      const assignedSelect = document.getElementById('assigned-to');
      assignedSelect.innerHTML = '<option disabled>Error loading members</option>';
    });
}

// leave group
function leaveGroup(group_id, creator_id) {
  if (!userId) return alert('Error: User not logged in. Please log in again.');
  if (confirm('Are you sure you want to leave this group?')) {
    fetch(`${API_URL}/groups/${group_id}/leave`, {
      method: 'DELETE',
      headers: authHeaders()
    })
      .then(response => {
        if (!response.ok) throw new Error(response.status === 403 ? 'Group creator must delete the group instead' : response.statusText);
        return response.json();
      })
      .then(data => {
        alert(data.message);
        loadGroups();
        loadAnalytics();
        loadCalendar();
        loadAssignedToOptions();
      })
      .catch(error => {
        console.error('Leave group error:', error);
        alert('Error: ' + error.message);
      });
  }
}

// delete group
function deleteGroup(group_id) {
  if (!confirm('Are you sure you want to delete this group? This will remove all members and tasks.')) return;
  fetch(`${API_URL}/groups/${group_id}`, {
    method: 'DELETE',
    headers: authHeaders()
  })
    .then(response => {
      if (!response.ok) throw new Error(response.statusText);
      return response.json();
    })
    .then(data => {
      alert(data.message);
      loadGroups();
      loadAnalytics();
      loadCalendar();
      loadAssignedToOptions();
    })
    .catch(error => {
      console.error('Delete group error:', error);
      alert('Error: ' + error.message);
    });
}

// join group by code
document.getElementById('join-button').addEventListener('click', (e) => {
  e.preventDefault();
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

  fetch(`${API_URL}/groups/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
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
      console.error('Join error:', error);
      errorElement.textContent = error.message;
    });
});

// -------------------- AUTH UI --------------------
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

// Initialize UI depending on token
if (localStorage.getItem('jwtToken')) {
  try {
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
  } catch (e) {
    console.warn('Invalid token in storage:', e);
    logout();
  }
} else {
  showSection('login-section');
}

// logout
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

// -------------------- LOGIN / SIGNUP FORMS --------------------
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
  fetch(`${API_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: usernameInput, password })
  })
    .then(response => {
      if (!response.ok) throw new Error(response.status === 401 ? 'Incorrect credentials' : 'Login failed');
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
      console.error('Login error:', error);
      errorElement.textContent = error.message === 'Login failed' ? 'An error occurred. Please try again.' : error.message;
    });
});

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
  fetch(`${API_URL}/signup`, {
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
      console.error('Signup error:', error);
      const msg = error.message || 'An error occurred. Please try again.';
      if (msg.toLowerCase().includes('username')) usernameError.textContent = msg;
      else if (msg.toLowerCase().includes('email')) emailError.textContent = msg;
      else usernameError.textContent = 'An error occurred. Please try again.';
    });
});

// -------------------- TASKS --------------------
document.getElementById('task-group-id').addEventListener('change', e => {
  selectedGroupId = e.target.value;
  loadAssignedToOptions(selectedGroupId);
  loadCalendar(selectedGroupId);
});

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
  if (file) formData.append('note', file); // 'note' matches multer upload.single('note')

  fetch(`${API_URL}/groups/${selectedGroupId}/tasks`, {
    method: 'POST',
    headers: authHeaders(), // don't set Content-Type; browser sets multipart boundary
    body: formData
  })
    .then(response => {
      if (!response.ok) return response.json().then(j => { throw new Error(j.error || 'Task creation failed'); });
      return response.json();
    })
    .then(data => {
      alert('Task created successfully!' + (data.file_path ? ` Note attached: ${data.file_path}` : ''));
      loadCalendar(selectedGroupId);
      loadAnalytics();
    })
    .catch(error => {
      console.error('Task create error:', error);
      alert('Error: ' + error.message);
    });
});

// load and render calendar with tasks
function loadCalendar(group_id) {
  if (!group_id) {
    document.getElementById('calendar-container').innerHTML = '<p class="text-center">No group selected.</p>';
    return;
  }
  fetch(`${API_URL}/groups/${group_id}/tasks`, { headers: authHeaders() })
    .then(response => {
      if (!response.ok) throw new Error('Task fetch failed');
      return response.json();
    })
    .then(tasks => {
      const calendarEl = document.getElementById('calendar-container');
      calendarEl.innerHTML = '';
      if (!tasks || tasks.length === 0) {
        calendarEl.innerHTML = '<p class="text-center">No tasks available for this group.</p>';
        return;
      }

      // render FullCalendar
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

      // task list
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
      console.error('Load calendar error:', error);
      document.getElementById('calendar-container').innerHTML = '<p class="text-center">Error loading calendar.</p>';
    });
}

// mark as complete
function markTaskComplete(task_id, group_id) {
  if (!confirm('Mark this task as complete? It will be removed.')) return;
  fetch(`${API_URL}/tasks/${task_id}`, {
    method: 'DELETE',
    headers: authHeaders()
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
      console.error('Complete error:', error);
      alert('Error: ' + error.message);
    });
}

document.getElementById('group-form').addEventListener('submit', e => {
  e.preventDefault();
  const name = document.getElementById('group-name').value;
  const description = document.getElementById('group-description').value;

  if (!localStorage.getItem('jwtToken')) return alert('Please log in to create a group.');
  if (!name) return alert('Group name is required.');

  fetch(`${API_URL}/groups/`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name, description })
  })
    .then(response => {
      if (!response.ok) return response.json().then(j => { throw new Error(j.error || 'Group creation failed'); });
      return response.json();
    })
    .then(data => {
      alert('Group created successfully!');
      document.getElementById('group-form').reset();
      loadGroups();
      loadAnalytics();
    })
    .catch(error => {
      console.error('Group create error:', error);
      alert('Error: ' + error.message);
    });
});

// -------------------- THEME + DOODLE --------------------
const doodleButton = document.querySelector('.doodle-button');
if (doodleButton) doodleButton.addEventListener('click', () => alert('Doodle button clicked! Add new group soon!'));

const themeToggle = document.getElementById('theme-toggle');
const body = document.body;
function setTheme(theme) {
  if (theme === 'light') {
    body.classList.add('light-mode'); themeToggle.textContent = '☀️'; localStorage.setItem('theme', 'light');
  } else {
    body.classList.remove('light-mode'); themeToggle.textContent = '🌙'; localStorage.setItem('theme', 'dark');
  }
}
const savedTheme = localStorage.getItem('theme');
setTheme(savedTheme || 'dark');
themeToggle.addEventListener('click', () => {
  const current = body.classList.contains('light-mode') ? 'light' : 'dark';
  setTheme(current === 'light' ? 'dark' : 'light');
});
// ----------------------------------------------------// END OF FILE //----------------------------------------------------//