
const form = document.querySelector('#login-form');
const message = document.querySelector('#message');

if (form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.textContent = 'Signing in...';
    const button = form.querySelector('button');
    button.disabled = true;

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: document.querySelector('#email').value,
          password: document.querySelector('#password').value
        })
      });

      if (!response.ok) {
        throw new Error((await response.json()).error);
      }

      window.location.assign('/events');
    } catch (error) {
      message.textContent = error.message;
      button.disabled = false;
    }
  });
}

const list = document.querySelector('#events');

if (list) {
  async function api(path, method = 'GET') {
    const response = await fetch(path, {
      method,
      credentials: 'same-origin'
    });

    if (response.status === 401) {
      window.location.assign('/login');
      throw new Error('Sign in first');
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data;
  }

  async function load(notice = '') {
    message.textContent = 'Loading events...';
    list.replaceChildren();

    try {
      const [{ events }, { registrations }] = await Promise.all([
        api('/api/events'),
        api('/api/registrations')
      ]);

      const registered = new Set(
        registrations.map(r => r.event_id)
      );

      if (!events.length) {
        message.textContent = 'There are no upcoming events.';
        return;
      }

      for (const event of events) {
        const article = document.createElement('article');
        article.className = 'event';

        const date = document.createElement('p');
        date.className = 'date';
        date.textContent = new Date(event.date).toLocaleString();

        const title = document.createElement('h2');
        title.textContent = event.title;

        const available = document.createElement('p');
        available.className = 'places';
        available.textContent =
          `${event.free_places} places available`;

        const own = registered.has(event.id);
        const button = document.createElement('button');
        button.type = 'button';

        button.textContent = own
          ? 'Cancel registration'
          : event.free_places > 0
            ? 'Reserve a place'
            : 'Event is full';

        button.disabled = !own && event.free_places <= 0;

        button.addEventListener('click', async () => {
          button.disabled = true;
          message.textContent = 'Please wait...';

          try {
            await api(
              `/api/events/${event.id}/register`,
              own ? 'DELETE' : 'POST'
            );

            await load(
              own
                ? 'Registration cancelled.'
                : 'Registration confirmed!'
            );
          } catch (error) {
            message.textContent = error.message;
            button.disabled = false;
          }
        });

        article.append(date, title, available);

        if (own) {
          const status = document.createElement('p');
          status.textContent = 'You are registered';
          article.append(status);
        }

        article.append(button);
        list.append(article);
      }

      message.textContent = notice ||
        `${events.length} upcoming events`;

    } catch (error) {
      message.textContent = error.message;
    }
  }

  load();

  document.querySelector('#logout').addEventListener(
    'click', async () => {
      try {
        await api('/api/logout', 'POST');
        window.location.assign('/login');
      } catch (error) {
        message.textContent = error.message;
      }
    }
  );
}
