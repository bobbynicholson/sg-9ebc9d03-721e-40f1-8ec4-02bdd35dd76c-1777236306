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

    // Per course: one roomy card with a dropdown ("Add a starter...").
    // Picking a dish adds it straight away as a removable chip, so there
    // are no empty select rows or separate "Add line" steps to manage.
    var wrap = el('div', { class: 'cms-course-picker', role: 'group', tabindex: '-1', 'aria-label': f.label || 'Menu' });
    var grid = el('div', { class: 'cms-course-grid' });
    var hidden = el('div', { class: 'cms-course-hidden' });
    var summary = el('div', { class: 'cms-course-summary', 'aria-live': 'polite' });
    wrap.appendChild(grid);
    wrap.appendChild(summary);
    wrap.appendChild(hidden);
    var sections = [];

    function sync() {
      hidden.innerHTML = '';
      var total = 0;
      sections.forEach(function (section) {
        total += section.picked.length;
        section.card.classList.toggle('has-picks', section.picked.length > 0);
        section.count.textContent = section.picked.length ? String(section.picked.length) : '';
        // Dropdown lists only dishes not yet chosen in this course.
        var left = 0;
        Array.prototype.forEach.call(section.select.options, function (opt) {
          if (!opt.value) return;
          var taken = section.picked.indexOf(opt.value) !== -1;
          opt.hidden = taken;
          opt.disabled = taken;
          if (!taken) left++;
        });
        section.select.disabled = left === 0;
        section.select.options[0].text = left === 0
          ? 'All ' + section.name.toLowerCase() + ' added'
          : (section.picked.length ? 'Add another ' : 'Add a ') + singular(section.name).toLowerCase() + '...';
        section.chips.innerHTML = '';
        section.picked.forEach(function (value) {
          var opt = section.items.find(function (o) { return o.value === value; });
          var remove = el('button', { type: 'button', class: 'cms-chip-x', 'aria-label': 'Remove ' + (opt ? opt.label : value), html: '&times;' });
          remove.addEventListener('click', function () {
            section.picked.splice(section.picked.indexOf(value), 1);
            sync();
            wrap.dispatchEvent(new Event('change', { bubbles: true }));
            try { section.select.focus(); } catch (e) { /* ignore */ }
          });
          section.chips.appendChild(el('span', { class: 'cms-chip' }, [el('span', { class: 'cms-chip-label', text: opt ? opt.label : value }), remove]));
          var cb = el('input', { type: 'checkbox', name: f.id, value: value, class: 'cms-sr', tabindex: '-1', 'aria-hidden': 'true' });
          cb.checked = true;
          hidden.appendChild(cb);
        });
      });
      summary.textContent = total
        ? total + ' dish' + (total === 1 ? '' : 'es') + ' chosen'
        : 'Pick from any course. You can choose several dishes per course.';
    }

    order.forEach(function (name) {
      var section = { name: name, items: groups[name], picked: [] };
      section.count = el('span', { class: 'cms-course-count' });
      section.chips = el('div', { class: 'cms-chips' });
      section.select = el('select', { class: 'cms-select cms-course-select', 'aria-label': 'Add from ' + name });
      section.select.appendChild(el('option', { value: '', text: '' }));
      section.items.forEach(function (o) { section.select.appendChild(el('option', { value: o.value, text: o.label })); });
      section.select.addEventListener('change', function () {
        var v = section.select.value;
        if (v && section.picked.indexOf(v) === -1) section.picked.push(v);
        section.select.value = '';
        sync();
        wrap.dispatchEvent(new Event('change', { bubbles: true }));
      });
      section.card = el('div', { class: 'cms-course' }, [
        el('div', { class: 'cms-course-head' }, [
          el('span', { class: 'cms-course-name', text: name }),
          el('span', { class: 'cms-course-meta' }, [section.count, el('span', { class: 'cms-course-avail', text: section.items.length + ' option' + (section.items.length === 1 ? '' : 's') })])
        ]),
        section.select,
        section.chips
      ]);
      grid.appendChild(section.card);
      sections.push(section);
    });
    sync();
    return wrap;
  }

