  // Course order for the menu sections. Unknown categories follow,
  // alphabetically, so any tenant's catalogue still renders sensibly.
  var COURSE_ORDER = ['starters', 'starter', 'appetisers', 'appetizers', 'canapes', 'mains', 'main', 'main course', 'sides', 'side', 'salads', 'salad', 'desserts', 'dessert', 'drinks', 'beverages', 'service', 'other'];
  function courseRank(name) {
    var i = COURSE_ORDER.indexOf(String(name || '').toLowerCase().trim());
    return i === -1 ? 50 : i;
  }
  function singular(name) {
    var n = String(name || '').trim();
    if (/ies$/i.test(n)) return n.slice(0, -3) + 'y';
    if (/s$/i.test(n) && !/ss$/i.test(n)) return n.slice(0, -1);
    return n;
  }

  // Menu picker laid out like the tenant's quote sheet: one section per
  // course (Starters, Mains, Sides, Salads, Desserts...), each with a
  // dropdown of that course's dishes and an "Add line" button for more.
  // Selected ids are mirrored into hidden checked checkboxes so the
  // form runner reads them like any multi-select.
  function buildCategoryPicker(f, id) {
    var options = normalizeOptions(f.options).map(function (o, i) {
      var raw = (f.options || [])[i];
      return { value: o.value, label: o.label, group: (raw && raw.group) || 'Other' };
    });
    var groups = {};
    var order = [];
    options.forEach(function (o) {
      if (!groups[o.group]) { groups[o.group] = []; order.push(o.group); }
      groups[o.group].push(o);
    });
    order.sort(function (a, b) {
      var ra = courseRank(a), rb = courseRank(b);
      return ra !== rb ? ra - rb : a.localeCompare(b);
    });

    var wrap = el('div', { class: 'cms-course-picker', role: 'group', tabindex: '-1', 'aria-label': f.label || 'Menu' });
    var hidden = el('div', { class: 'cms-course-hidden' });
    var summary = el('div', { class: 'cms-course-summary', 'aria-live': 'polite' });
    var grid = el('div', { class: 'cms-course-grid' });
    wrap.appendChild(grid);
    wrap.appendChild(summary);
    wrap.appendChild(hidden);
    var sections = [];

    function chosenIn(section) {
      return section.rows.map(function (r) { return r.select.value; }).filter(Boolean);
    }
    function sync() {
      hidden.innerHTML = '';
      var total = 0;
      sections.forEach(function (section) {
        var picked = chosenIn(section);
        total += picked.length;
        section.count.textContent = picked.length ? picked.length + ' chosen' : '';
        // Hide choices already picked in another line of the same course.
        section.rows.forEach(function (row) {
          Array.prototype.forEach.call(row.select.options, function (opt) {
            if (!opt.value) return;
            opt.disabled = opt.value !== row.select.value && picked.indexOf(opt.value) !== -1;
          });
          row.remove.hidden = section.rows.length === 1 && !row.select.value;
        });
        section.add.disabled = picked.length >= section.items.length || section.rows.some(function (r) { return !r.select.value; });
        picked.forEach(function (value) {
          var cb = el('input', { type: 'checkbox', name: f.id, value: value, class: 'cms-sr', tabindex: '-1', 'aria-hidden': 'true' });
          cb.checked = true;
          hidden.appendChild(cb);
        });
      });
      summary.textContent = total ? total + ' dish' + (total === 1 ? '' : 'es') + ' selected' : 'No dishes selected yet. Pick from any course above.';
    }
    function addRow(section, focus) {
      var select = el('select', { class: 'cms-select', 'aria-label': 'Choose from ' + section.name });
      select.appendChild(el('option', { value: '', text: 'Choose a ' + singular(section.name).toLowerCase() + '...' }));
      section.items.forEach(function (o) { select.appendChild(el('option', { value: o.value, text: o.label })); });
      var remove = el('button', { type: 'button', class: 'cms-course-remove', 'aria-label': 'Remove this line', html: '&times;' });
      var line = el('div', { class: 'cms-course-line' }, [select, remove]);
      var row = { select: select, remove: remove, line: line };
      select.addEventListener('change', function () { sync(); wrap.dispatchEvent(new Event('change', { bubbles: true })); });
      remove.addEventListener('click', function () {
        if (section.rows.length > 1) {
          section.rows.splice(section.rows.indexOf(row), 1);
          line.parentNode.removeChild(line);
        } else {
          select.value = '';
        }
        sync();
        wrap.dispatchEvent(new Event('change', { bubbles: true }));
      });
      section.rows.push(row);
      section.lines.appendChild(line);
      if (focus) setTimeout(function () { try { select.focus(); } catch (e) { /* ignore */ } }, 0);
    }
    order.forEach(function (name) {
      var section = { name: name, items: groups[name], rows: [] };
      section.count = el('span', { class: 'cms-course-count' });
      section.lines = el('div', { class: 'cms-course-lines' });
      section.add = el('button', { type: 'button', class: 'cms-course-add', text: '+ Add line' });
      section.add.addEventListener('click', function () { addRow(section, true); sync(); });
      var card = el('div', { class: 'cms-course' }, [
        el('div', { class: 'cms-course-head' }, [el('span', { class: 'cms-course-name', text: name }), section.count]),
        section.lines,
        section.add
      ]);
      grid.appendChild(card);
      sections.push(section);
      addRow(section, false);
    });
    sync();
    return wrap;
  }

