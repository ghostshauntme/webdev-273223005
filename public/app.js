const form = document.querySelector('#login-form');
const message = document.querySelector('#message');
if (form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.textContent = 'Signing in...';
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const response = await fetch('/api/login', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: document.querySelector('#email').value,
          password: document.querySelector('#password').value }) });
      if (!response.ok) throw new Error((await response.json()).error || 'Sign-in failed');
      window.location.assign('/events');
    } catch (error) {
      message.textContent = error.message;
      button.disabled = false;
    }
  });
}
const list = document.querySelector('#events');
if (list) {
  const load = async () => {
    try {
      const response = await fetch('/api/events', { credentials: 'same-origin' });
      if (response.status === 401) { window.location.assign('/login'); return; }
      if (!response.ok) throw new Error('Could not load events');
      const { events } = await response.json();
      list.replaceChildren();
      if (!events.length) { message.textContent = 'There are no upcoming events.'; return; }
      for (const event of events) {
        const article = document.createElement('article'); article.className = 'event';
        const date = document.createElement('p'); date.className = 'date';
        date.textContent = new Date(event.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
        const title = document.createElement('h2'); title.textContent = event.title;
        const available = document.createElement('p'); available.className = 'places';
        available.textContent = `${event.free_places} places available`;
        article.append(date, title, available); list.append(article);
      }
      message.textContent = `${events.length} upcoming event${events.length === 1 ? '' : 's'}`;
    } catch (error) { message.textContent = error.message; }
  };
  load();
  document.querySelector('#logout').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    window.location.assign('/login');
  });
}
