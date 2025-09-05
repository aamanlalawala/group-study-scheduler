fetch('http://localhost:3000/groups')
    .then(response => response.json())
    .then(groups => {
        const groupList = document.getElementById('group-list');
        groups.forEach(group => {
            const li = document.createElement('li');
            li.className = 'list-group-item d-flex justify-content-between align-items-center';
            li.innerHTML = `${group.name}: ${group.description || 'No description'} <span class="badge bg-primary rounded-pill">${group.id}</span>`;
      groupList.appendChild(li);
    });
  })
  .catch(error => console.error('Error fetching groups:', error));