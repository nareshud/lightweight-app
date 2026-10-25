const form = document.querySelector('#note-form');
const status = document.querySelector('#status');
const list = document.querySelector('#notes');
const submit = form.querySelector('button');

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

async function loadNotes() {
  const notes = await request('/api/notes');
  list.replaceChildren();
  for (const note of notes) {
    const item = document.createElement('li');
    const body = document.createElement('p');
    body.textContent = note.body;
    const date = document.createElement('time');
    date.dateTime = note.created_at;
    date.textContent = new Date(note.created_at).toLocaleString();
    item.append(body, date);
    list.append(item);
  }
  status.textContent = notes.length ? `${notes.length} recent note(s). Database connected.` : 'Database connected. Add your first note.';
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  submit.disabled = true;
  status.textContent = 'Saving…';
  try {
    await request('/api/notes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: form.elements.body.value })
    });
    form.reset();
    status.textContent = 'Note saved.';
    try { await loadNotes(); }
    catch { status.textContent = 'Note saved. Refresh to reload the list.'; }
  } catch (error) {
    status.textContent = error.message;
  } finally { submit.disabled = false; }
});
document.querySelector('#refresh').addEventListener('click', () => {
  loadNotes().catch(error => { status.textContent = error.message; });
});
loadNotes().catch(() => { status.textContent = 'Could not load notes. Check that the backend and database are running.'; });
