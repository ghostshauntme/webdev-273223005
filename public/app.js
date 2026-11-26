async function responseJson(response, fallback) {
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.error || fallback);
  return data;
}

function errorMessage(error, fallback) {
  return error instanceof TypeError ? fallback : error.message;
}

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

      await responseJson(response, 'Sign-in is unavailable. Try again.');

      window.location.assign('/events');
    } catch (error) {
      message.textContent = errorMessage(error, 'Could not connect. Try again.');
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

    return responseJson(response, 'The request failed. Try again.');
  }

  async function load(notice = '', focusEventId) {
    message.textContent = 'Loading events...';

    try {
      const [{ events }, { registrations }] = await Promise.all([
        api('/api/events'),
        api('/api/registrations')
      ]);

      const cards = document.createDocumentFragment();
      let nextFocus;
      const registered = new Set(
        registrations.map(r => r.event_id)
      );

      if (!events.length) {
        list.replaceChildren();
        message.textContent = 'There are no upcoming events. Check back later.';
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
          const restoreFocus = document.activeElement === button;
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
                : 'Registration confirmed!',
              restoreFocus ? event.id : undefined
            );
          } catch (error) {
            message.textContent = errorMessage(error, 'Could not connect. Try again.');
          } finally {
            button.disabled = false;
            if (restoreFocus && button.isConnected && document.activeElement === document.body) {
              button.focus();
            }
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
        cards.append(article);
        if (event.id === focusEventId) nextFocus = button;
      }

      const focusCanBeRestored = list.contains(document.activeElement) ||
        document.activeElement === document.body;
      list.replaceChildren(cards);
      if (focusCanBeRestored) nextFocus?.focus();
      message.textContent = notice ||
        `${events.length} upcoming events`;

    } catch (error) {
      message.textContent = errorMessage(error, 'Could not connect. Try again.');
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

          await responseJson(response, 'Could not create the event. Try again.');

          createForm.reset();
          posterStatus.textContent = '';
          status.textContent = 'Event created successfully!';
          await load();
        } catch (error) {
          status.textContent = errorMessage(error, 'Could not connect. Try again.');
        } finally {
          button.disabled = false;
        }
      });
    } catch (error) {
      document.querySelector('#account-message').textContent =
        errorMessage(error, 'Could not load account details. Refresh to retry.');
    }
  }

  setupOrganizer();
  load();

  document.querySelector('#logout').addEventListener(
    'click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      document.querySelector('#account-message').textContent = 'Signing out...';
      try {
        await api('/api/logout', 'POST');
        window.location.assign('/login');
      } catch (error) {
        document.querySelector('#account-message').textContent =
          errorMessage(error, 'Could not connect. Try again.');
        button.disabled = false;
      }
    }
  );
}
