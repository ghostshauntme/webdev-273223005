
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

        if (event.location) {
          const location = document.createElement('p');
          location.textContent = event.location;
          article.append(location);
        }

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

  async function setupOrganizer() {
    try {
      const { user } = await api('/api/me');

      if (user.role !== 'organizer') return;

      const panel = document.querySelector('#organizer-panel');
      const createForm = document.querySelector('#create-event');
      const status = document.querySelector('#create-message');

      panel.hidden = false;

      const posterButton = document.querySelector('#suggest-poster');
      const posterStatus = document.querySelector('#poster-message');

      posterButton.addEventListener('click', async () => {
        const file = document.querySelector('#poster-file').files[0];

        if (!file || file.size > 2 * 1024 * 1024 ||
            !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
          posterStatus.textContent =
            'Choose a PNG, JPEG or WebP image up to 2 MB.';
          return;
        }

        posterButton.disabled = true;
        posterStatus.textContent = 'Generating suggestions...';

        try {
          const image = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          const response = await fetch('/api/poster/suggest', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              image,
              mimeType: file.type
            })
          });

          const result = await response.json();

          if (!response.ok || !result.ok) {
            throw new Error(result.message || result.error);
          }

          const suggestion = result.suggestions;
          const date = new Date(suggestion.date);

          const localDate = new Date(
            date.getTime() - date.getTimezoneOffset() * 60000
          ).toISOString().slice(0, 16);

          document.querySelector('#event-title').value =
            suggestion.title;

          document.querySelector('#event-date').value =
            localDate;

          document.querySelector('#event-location').value =
            suggestion.location;

          posterStatus.textContent =
            'Review the suggestions before creating the event.';
        } catch {
          posterStatus.textContent =
            'Automatic suggestions unavailable; enter event details manually.';
        } finally {
          posterButton.disabled = false;
        }
      });


      createForm.addEventListener('submit', async event => {
        event.preventDefault();

        const button = createForm.querySelector('button');
        button.disabled = true;
        status.textContent = 'Creating event...';

        try {
          const response = await fetch('/api/events', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: document.querySelector('#event-title').value,
              location: document.querySelector('#event-location').value,
              date: new Date(
                document.querySelector('#event-date').value
              ).toISOString(),
              capacity: Number(
                document.querySelector('#event-capacity').value
              )
            })
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || 'Creation failed');
          }

          createForm.reset();
          status.textContent = 'Event created successfully!';
          await load();
        } catch (error) {
          status.textContent = error.message;
        } finally {
          button.disabled = false;
        }
      });
    } catch (error) {
      message.textContent = error.message;
    }
  }

  setupOrganizer();
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
