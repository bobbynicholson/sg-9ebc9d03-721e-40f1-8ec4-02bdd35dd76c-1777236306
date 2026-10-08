  // Shared type-ahead list anchored under an input. `source(term, cb)`
  // supplies items ({value,label,hint}); `onPick(item)` runs on click /
  // Enter. Keyboard: Up/Down to move, Enter to pick, Escape to close.
  function attachSuggestions(input, source, onPick, opts) {
    opts = opts || {};
    var list = el('div', { class: 'cms-suggest', role: 'listbox', hidden: 'hidden' });
    var items = [];
    var active = -1;
    var seq = 0;
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');

    function mountList() {
      if (list.parentNode) return;
      var parent = input.parentNode;
      if (!parent) return;
      parent.classList.add('cms-suggest-anchor');
      if (input.nextSibling) parent.insertBefore(list, input.nextSibling);
      else parent.appendChild(list);
    }
    function close() {
      list.hidden = true;
      active = -1;
      input.setAttribute('aria-expanded', 'false');
    }
    function highlight(i) {
      active = i;
      Array.prototype.forEach.call(list.children, function (node, idx) {
        node.classList.toggle('is-active', idx === i);
        if (idx === i) { try { node.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ } }
      });
    }
    function render(next, status) {
      items = next || [];
      list.innerHTML = '';
      if (!items.length) {
        if (status) {
          list.appendChild(el('div', { class: 'cms-suggest-status', text: status }));
          list.hidden = false;
        } else {
          close();
        }
        return;
      }
      items.forEach(function (item, i) {
        var row = el('div', { class: 'cms-suggest-item', role: 'option', id: input.id + '__opt' + i });
        row.appendChild(el('span', { class: 'cms-suggest-label', text: item.label }));
        if (item.hint) row.appendChild(el('span', { class: 'cms-suggest-hint', text: item.hint }));
        // mousedown (not click) so the input's blur doesn't close first.
        row.addEventListener('mousedown', function (ev) { ev.preventDefault(); pick(i); });
        list.appendChild(row);
      });
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      active = -1;
    }
    function pick(i) {
      var item = items[i];
      if (!item) return;
      close();
      onPick(item);
    }
    var run = debounce(function () {
      var mine = ++seq;
      var term = input.value.trim();
      if (opts.loadingText && term.length >= (opts.minChars || 0)) render([], opts.loadingText);
      source(term, function (result, status) {
        if (mine !== seq) return; // a newer keystroke won
        if (document.activeElement !== input && !(input.getRootNode && input.getRootNode().activeElement === input)) return;
        render(result, status);
      });
    }, opts.delay || 0);
    input.addEventListener('focus', function () { mountList(); if (opts.openOnFocus) run(); });
    input.addEventListener('input', function () { mountList(); run(); });
    input.addEventListener('blur', function () { setTimeout(close, 120); });
    input.addEventListener('keydown', function (ev) {
      if (list.hidden || !items.length) {
        if (ev.key === 'ArrowDown') { mountList(); run(); }
        return;
      }
      if (ev.key === 'ArrowDown') { ev.preventDefault(); highlight(Math.min(items.length - 1, active + 1)); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); highlight(Math.max(0, active - 1)); }
      else if (ev.key === 'Enter') { ev.preventDefault(); pick(active >= 0 ? active : 0); }
      else if (ev.key === 'Escape') { close(); }
    });
    return { close: close, refresh: run };
  }

  // Venue address: suggestions from /address-suggest while typing. The
  // visitor can always ignore them and type the full address.
  function attachAddressSuggest(input, url) {
    attachSuggestions(input, function (term, cb) {
      if (term.length < 4) { cb([]); return; }
      fetch(url + '?q=' + encodeURIComponent(term), { credentials: 'omit', mode: 'cors' })
        .then(function (r) { return r.ok ? r.json() : { suggestions: [] }; })
        .then(function (data) {
          cb((data.suggestions || []).map(function (s) { return { value: s, label: s }; }));
        })
        .catch(function () { cb([]); });
    }, function (item) {
      input.value = item.value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, { delay: 300, minChars: 4 });
  }

  // Menu / equipment picker: type to search (or just click to browse),
  // pick from the list, chosen items appear below with Remove.
  function buildCataloguePicker(f, id) {
    var options = normalizeOptions(f.options);
    var selected = new Map();
    var isMenu = f.id === 'menu_item_ids';
    var wrap = el('div', {
      class: 'cms-catalogue-picker',
      role: 'group',
      tabindex: '-1',
      'aria-label': f.label || 'Catalogue items'
    });
    var search = el('input', {
      class: 'cms-input',
      type: 'search',
      id: id,
      placeholder: isMenu ? 'Type a dish, e.g. lamb, salad, dessert...' : 'Type an item, e.g. plates, chafing dish...',
      autocomplete: 'off'
    });
    var searchWrap = el('div', { class: 'cms-catalogue-search' }, [search]);
    var resultStatus = el('div', { class: 'cms-catalogue-status', 'aria-live': 'polite' });
    var picked = el('div', { class: 'cms-catalogue-selected', 'aria-live': 'polite' });
    wrap.appendChild(searchWrap);
    wrap.appendChild(resultStatus);
    wrap.appendChild(picked);

    function matches(term) {
      var words = term.toLowerCase().split(/\s+/).filter(Boolean);
      return options.filter(function (option) {
        if (selected.has(String(option.value))) return false;
        var hay = (String(option.label || option.value) + ' ' + (option.group || '')).toLowerCase();
        return words.every(function (w) { return hay.indexOf(w) !== -1; });
      });
    }
    function updateStatus() {
      resultStatus.textContent = selected.size > 0
        ? selected.size + ' added'
        : options.length + ' to choose from';
    }
    function renderSelected() {
      picked.innerHTML = '';
      if (selected.size === 0) {
        picked.appendChild(el('div', { class: 'cms-catalogue-empty', text: 'Nothing added yet.' }));
        updateStatus();
        return;
      }
      selected.forEach(function (option, value) {
        var hidden = el('input', {
          type: 'checkbox',
          name: f.id,
          value: value,
          checked: 'checked',
          class: 'cms-sr',
          tabindex: '-1',
          'aria-hidden': 'true'
        });
        hidden.checked = true;
        var remove = el('button', {
          class: 'cms-catalogue-remove',
          type: 'button',
          text: 'Remove',
          'aria-label': 'Remove ' + (option.label || value)
        });
        remove.addEventListener('click', function () {
          selected.delete(value);
          renderSelected();
          wrap.dispatchEvent(new Event('change', { bubbles: true }));
        });
        var text = el('span', { class: 'cms-catalogue-name' }, [option.label || value]);
        if (option.group) text.appendChild(el('small', { text: option.group }));
        picked.appendChild(el('div', { class: 'cms-catalogue-row' }, [hidden, text, remove]));
      });
      updateStatus();
    }
    attachSuggestions(search, function (term, cb) {
      var found = matches(term).slice(0, 60);
      cb(found.map(function (o) { return { value: o.value, label: o.label, hint: o.group || '', option: o }; }),
        term ? 'No matches for "' + term + '"' : 'Everything is already added');
    }, function (item) {
      selected.set(String(item.value), item.option);
      search.value = '';
      renderSelected();
      wrap.dispatchEvent(new Event('change', { bubbles: true }));
      // Keep the list open so several items can be added in a row.
      setTimeout(function () { search.focus(); }, 0);
    }, { openOnFocus: true });
    renderSelected();
    return wrap;
  }

