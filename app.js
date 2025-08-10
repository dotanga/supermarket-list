/*
 * Vanilla JavaScript implementation of the Hebrew grocery list PWA.
 *
 * GitHub Pages restricts remote scripts and inline eval via a strict
 * Content‑Security‑Policy.  To comply we serve all scripts from the same
 * origin and avoid JSX or Babel at runtime.  This file encapsulates all
 * behaviour needed for adding, editing, removing and persisting grocery
 * items.  Data is saved to localStorage under the same keys as previous
 * iterations (he-grocery.*) to enable seamless upgrades.
 */

(() => {
  // Categories in Hebrew.  Used both for the select dropdown and grouping.
  const CATS = [
    'ירקות','פירות','חלב','בשר ועוף','מאפים','משקאות','ניקיון','טואלטיקה','קפואים','שימורים','מתוקים','תבלינים','אחרים'
  ];
  // Commonly purchased items to seed the suggestion list.
  const STARTER_SUGGESTIONS = [
    'חלב','לחם','ביצים','גבינה לבנה','אשל','קוטג\'','טחינה','קפה','סוכר','שמן זית','אורז','פסטה','טונה','תירס','חמאה','יוגורט',
    'מלפפונים','עגבניות','בצל','שום','תפוחי אדמה','בננות','תפוחים','עוף','סטייק','טחינה גולמית','פיתות','לאפה','נייר טואלט','סבון','שמפו',
    'אבקת כביסה','טבליות למדיח','מיונז','קטשופ','חרדל','שוקולד','חטיפים','ירקות מוקפאים'
  ];

  // Generate a unique identifier for items and lists.
  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback: timestamp and random number concatenated.
    return String(Date.now() + Math.random()).replace('.', '');
  }

  // Load persisted state from localStorage.  If parsing fails we fall back
  // gracefully to defaults.  This also preserves backwards compatibility.
  function loadState() {
    let items = [];
    let dark = false;
    let listName = 'קניות לבית';
    let listId = uuid();
    try {
      const rawItems = localStorage.getItem('he-grocery.items');
      if (rawItems) items = JSON.parse(rawItems);
    } catch {}
    try {
      dark = JSON.parse(localStorage.getItem('he-grocery.dark') || 'false');
    } catch {}
    try {
      const name = localStorage.getItem('he-grocery.listName');
      if (name) listName = name;
    } catch {}
    try {
      const id = localStorage.getItem('he-grocery.listId');
      if (id) listId = id;
    } catch {}
    return { items, dark, listName, listId };
  }

  // Save state back into localStorage.  Accepts a partial state object so
  // unrelated properties are left untouched.  localStorage operations are
  // synchronous—avoid frequent writes where possible.
  function saveState(partial) {
    if (partial.items !== undefined) {
      localStorage.setItem('he-grocery.items', JSON.stringify(partial.items));
    }
    if (partial.dark !== undefined) {
      localStorage.setItem('he-grocery.dark', JSON.stringify(partial.dark));
    }
    if (partial.listName !== undefined) {
      localStorage.setItem('he-grocery.listName', partial.listName);
    }
    if (partial.listId !== undefined) {
      localStorage.setItem('he-grocery.listId', partial.listId);
    }
  }

  // Initial state values.
  let { items, dark, listName, listId } = loadState();

  // DOM elements.  Query them once and cache the references.
  const listNameInput  = document.getElementById('listName');
  const itemNameInput  = document.getElementById('itemName');
  const itemQtyInput   = document.getElementById('itemQty');
  const itemCatSelect  = document.getElementById('itemCat');
  const itemNoteInput  = document.getElementById('itemNote');
  const addBtn         = document.getElementById('addBtn');
  const voiceBtn       = document.getElementById('voiceBtn');
  const stopVoiceBtn   = document.getElementById('stopVoiceBtn');
  const darkToggleBtn  = document.getElementById('darkToggle');
  const clearDoneBtn   = document.getElementById('clearDone');
  const filterSelect   = document.getElementById('filterSelect');
  const suggestionsDiv = document.getElementById('suggestions');
  const itemsContainer = document.getElementById('itemsContainer');
  const emptyMessage   = document.getElementById('emptyMessage');
  const importBtn      = document.getElementById('importBtn');
  const importFile     = document.getElementById('importFile');
  const exportBtn      = document.getElementById('exportBtn');

  // Populate the category select dropdown.
  function populateCategories() {
    itemCatSelect.innerHTML = '';
    CATS.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      itemCatSelect.appendChild(opt);
    });
    // Ensure the selected category is valid after repopulating.
    if (!CATS.includes(itemCatSelect.value)) itemCatSelect.value = CATS[0];
  }

  // Apply the dark mode class to the html element and update the toggle
  // button text accordingly.  Persist the dark setting.
  function applyDark() {
    if (dark) {
      document.documentElement.classList.add('dark');
      darkToggleBtn.textContent = 'מצב בהיר';
    } else {
      document.documentElement.classList.remove('dark');
      darkToggleBtn.textContent = 'מצב כהה';
    }
  }

  // Toggle dark mode state and persist.
  function toggleDark() {
    dark = !dark;
    applyDark();
    saveState({ dark });
  }

  // Build and display the suggestions list based on the current input.  A
  // maximum of 12 suggestions are shown.  Each suggestion is clickable and
  // will immediately insert that item.
  function updateSuggestions() {
    const query = itemNameInput.value.trim();
    const pool = Array.from(new Set([...STARTER_SUGGESTIONS, ...items.map(i => i.name)]));
    let results;
    if (!query) {
      results = pool.slice(0, 12);
    } else {
      results = pool.filter(name => name.includes(query)).slice(0, 12);
    }
    suggestionsDiv.innerHTML = '';
    results.forEach(name => {
      const btn = document.createElement('button');
      btn.className = 'suggestion-btn';
      btn.textContent = name;
      btn.addEventListener('click', () => {
        itemNameInput.value = name;
        addItem();
      });
      suggestionsDiv.appendChild(btn);
    });
    suggestionsDiv.style.display = results.length ? 'flex' : 'none';
  }

  // Add or update an item based on current input fields.  If the name is
  // empty the function returns early.  If an unfinished item with the same
  // name exists its quantity is incremented instead of adding a duplicate.
  function addItem() {
    const name = itemNameInput.value.trim();
    if (!name) return;
    const qty = parseInt(itemQtyInput.value, 10) || 1;
    const cat = itemCatSelect.value || 'אחרים';
    const note = itemNoteInput.value.trim();
    // Find existing unfinished item
    const existing = items.find(it => it.name === name && !it.done);
    if (existing) {
      existing.qty = (existing.qty || 1) + qty;
    } else {
      items.unshift({ id: uuid(), name, qty, category: cat, note, done: false, createdAt: Date.now(), listId });
    }
    // Clear inputs
    itemNameInput.value = '';
    itemQtyInput.value = '1';
    itemNoteInput.value = '';
    // Persist and update UI
    saveState({ items });
    updateSuggestions();
    render();
  }

  // Toggle the done state of an item by id.
  function toggleDone(id) {
    items = items.map(it => it.id === id ? { ...it, done: !it.done } : it);
    saveState({ items });
    render();
  }

  // Remove an item completely.
  function removeItem(id) {
    items = items.filter(it => it.id !== id);
    saveState({ items });
    render();
  }

  // Clear all completed items from the list.
  function clearDoneItems() {
    items = items.filter(it => !it.done);
    saveState({ items });
    render();
  }

  // Export the current list to a downloadable JSON file.  The file is named
  // after the listName with underscores for spaces.
  function exportJSON() {
    const payload = { version: 1, listName, listId, items };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = (listName.replace(/\s+/g, '_') || 'list') + '.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  // Import items from a JSON file.  The file should match the exported
  // structure.  Items are given new IDs to avoid collisions.  The list name
  // and id are updated if present in the file.
  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (Array.isArray(data.items)) {
          // Map items to ensure they all have IDs
          items = data.items.map(it => ({ ...it, id: it.id || uuid() }));
          if (data.listName) listName = data.listName;
          if (data.listId) listId = data.listId;
          saveState({ items, listName, listId });
          listNameInput.value = listName;
          render();
          updateSuggestions();
        } else {
          alert('קובץ לא תקין');
        }
      } catch (e) {
        alert('שגיאה בטעינת הקובץ');
      }
    };
    reader.readAsText(file);
  }

  // Voice recognition support.  We use the Web Speech API if available.
  let recognizer = null;
  function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert('זיהוי קול לא נתמך בדפדפן הזה');
      return;
    }
    recognizer = new SR();
    recognizer.lang = 'he-IL';
    recognizer.interimResults = false;
    recognizer.maxAlternatives = 1;
    recognizer.onresult = (event) => {
      const text = event.results[0][0].transcript.trim();
      // Simple pattern: number before or after the name
      const m1 = text.match(/^(\d{1,3})\s+(.+)$/);
      const m2 = text.match(/^(.+)\s+(\d{1,3})$/);
      if (m1) {
        itemQtyInput.value = m1[1];
        itemNameInput.value = m1[2];
      } else if (m2) {
        itemQtyInput.value = m2[2];
        itemNameInput.value = m2[1];
      } else {
        itemNameInput.value = text;
     }
      addItem();
      stopVoice();
    };
    recognizer.onerror = () => stopVoice();
    recognizer.onend = () => stopVoice();
    voiceBtn.style.display = 'none';
    stopVoiceBtn.style.display = '';
    recognizer.start();
  }
  function stopVoice() {
    if (recognizer) {
      try { recognizer.stop(); } catch {}
      recognizer = null;
    }
    voiceBtn.style.display = '';
    stopVoiceBtn.style.display = 'none';
  }

  // Render the list of items according to the current filter.  Items are
  // grouped by category and categories appear in the order defined in CATS.
  function render() {
    // Filter items based on the selected filter option.
    const filter = filterSelect.value;
    let filtered = [];
    if (filter === 'todo') {
      filtered = items.filter(it => !it.done);
    } else if (filter === 'done') {
      filtered = items.filter(it => it.done);
    } else {
      filtered = items.slice();
    }
    // Group items by category preserving order.
    const groups = new Map();
    filtered.forEach(it => {
      const key = it.category || 'אחרים';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
    });
    // Clear previous content
    itemsContainer.innerHTML = '';
    // Render categories in defined order
    let hasItems = false;
    CATS.forEach(cat => {
      const group = groups.get(cat);
      if (group && group.length) {
        hasItems = true;
        // Category header
        const header = document.createElement('h2');
        header.textContent = `${cat}`;
        header.style.margin = '0.5rem 0 0.25rem';
        itemsContainer.appendChild(header);
        // Each item in the category
        group.forEach(it => {
          const card = document.createElement('div');
          card.className = 'item-card' + (it.done ? ' done' : '');
          // Checkbox
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = it.done;
          checkbox.addEventListener('change', () => toggleDone(it.id));
          card.appendChild(checkbox);
          // Name and note
          const info = document.createElement('div');
          info.style.flex = '1';
          const nameEl = document.createElement('div');
          nameEl.textContent = it.name;
          nameEl.style.fontWeight = '500';
          const sub = document.createElement('div');
          sub.style.fontSize = '0.8rem';
          sub.style.color = 'var(--border)';
          sub.textContent = `כמות: ${it.qty || 1}` + (it.note ? ` · ${it.note}` : '');
          info.appendChild(nameEl);
          info.appendChild(sub);
          card.appendChild(info);
          // Category pill
          const catSpan = document.createElement('span');
          catSpan.className = 'category-pill';
          catSpan.textContent = it.category || 'אחרים';
          card.appendChild(catSpan);
          // Remove button
          const rm = document.createElement('button');
          rm.textContent = '✖';
          rm.className = 'btn-danger';
          rm.style.padding = '0.25rem 0.5rem';
          rm.style.fontSize = '0.8rem';
          rm.addEventListener('click', () => removeItem(it.id));
          card.appendChild(rm);
          itemsContainer.appendChild(card);
        });
      }
    });
    // If there are items not in predefined categories, render them after
    groups.forEach((group, cat) => {
      if (!CATS.includes(cat)) {
        hasItems = true;
        const header = document.createElement('h2');
        header.textContent = cat;
        header.style.margin = '0.5rem 0 0.25rem';
        itemsContainer.appendChild(header);
        group.forEach(it => {
          const card = document.createElement('div');
          card.className = 'item-card' + (it.done ? ' done' : '');
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = it.done;
          checkbox.addEventListener('change', () => toggleDone(it.id));
          card.appendChild(checkbox);
          const info = document.createElement('div');
          info.style.flex = '1';
          const nameEl = document.createElement('div');
          nameEl.textContent = it.name;
          nameEl.style.fontWeight = '500';
          const sub = document.createElement('div');
          sub.style.fontSize = '0.8rem';
          sub.style.color = 'var(--border)';
          sub.textContent = `כמות: ${it.qty || 1}` + (it.note ? ` · ${it.note}` : '');
          info.appendChild(nameEl);
          info.appendChild(sub);
          card.appendChild(info);
          const catSpan = document.createElement('span');
          catSpan.className = 'category-pill';
          catSpan.textContent = it.category || 'אחרים';
          card.appendChild(catSpan);
          const rm = document.createElement('button');
          rm.textContent = '✖';
          rm.className = 'btn-danger';
          rm.style.padding = '0.25rem 0.5rem';
          rm.style.fontSize = '0.8rem';
          rm.addEventListener('click', () => removeItem(it.id));
          card.appendChild(rm);
          itemsContainer.appendChild(card);
        });
      }
    });
    // Update empty state message visibility
    emptyMessage.style.display = hasItems ? 'none' : '';
  }

  // Initial setup
  function init() {
    populateCategories();
    applyDark();
    listNameInput.value = listName;
    updateSuggestions();
    render();
    // Event bindings
    listNameInput.addEventListener('input', () => {
      listName = listNameInput.value || 'קניות לבית';
      saveState({ listName });
    });
    itemNameInput.addEventListener('input', updateSuggestions);
    addBtn.addEventListener('click', addItem);
    darkToggleBtn.addEventListener('click', toggleDark);
    clearDoneBtn.addEventListener('click', clearDoneItems);
    filterSelect.addEventListener('change', render);
    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) importJSON(file);
      importFile.value = '';
    });
    exportBtn.addEventListener('click', exportJSON);
    voiceBtn.addEventListener('click', startVoice);
    stopVoiceBtn.addEventListener('click', stopVoice);
    // Keyboard shortcuts: Ctrl/Cmd+Enter to add item
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        addItem();
      }
    });
  }

  // Kick off the app once the DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
