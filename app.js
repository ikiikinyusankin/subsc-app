/* サブスク管理 — データは端末内（localStorage）にのみ保存します */
(function () {
  'use strict';

  var KEY = 'subsc-app-v1';
  var PALETTE = ['#3987E5', '#D95926', '#199E70', '#C98500', '#D55181', '#008300', '#9085E9', '#E66767'];
  var NEUTRAL = '#7C8696';
  var WEEK = '日月火水木金土';
  var NS = 'http://www.w3.org/2000/svg';
  var ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
    chart: '<path d="M11 4a8.5 8.5 0 1 0 8.5 8.5H11z"/><path d="M14.5 2.5a7 7 0 0 1 7 7h-7z"/>',
    settings: '<path d="M4 6h8M18 6h2M4 12h2M12 12h8M4 18h10M20 18h0"/><circle cx="15" cy="6" r="2.5"/><circle cx="9" cy="12" r="2.5"/><circle cx="17" cy="18" r="2.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    left: '<path d="M15 5l-7 7 7 7"/>',
    right: '<path d="M9 5l7 7-7 7"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
    down: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    up: '<path d="M12 16V5M7 9l5-5 5 5M5 20h14"/>'
  };

  /* ---------- データ ---------- */
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function defaults() {
    var names = ['仕事ツール', '動画', 'ニュース', '音楽', 'クラウド'];
    return {
      v: 1,
      rate: 150,
      categories: names.map(function (n, i) { return { id: 'c' + (i + 1), name: n, color: PALETTE[i] }; }),
      subs: []
    };
  }

  function normalize(d) {
    var out = defaults();
    if (!d || typeof d !== 'object') return out;
    var r = Number(d.rate);
    if (isFinite(r) && r > 0) out.rate = r;
    if (Array.isArray(d.categories)) {
      out.categories = d.categories.filter(function (c) {
        return c && typeof c.name === 'string' && c.name.trim();
      }).map(function (c) {
        return {
          id: String(c.id || uid()),
          name: c.name.trim().slice(0, 12),
          color: /^#[0-9a-fA-F]{6}$/.test(c.color) ? c.color : NEUTRAL
        };
      });
    }
    var ids = {};
    out.categories.forEach(function (c) { ids[c.id] = true; });
    if (Array.isArray(d.subs)) {
      out.subs = d.subs.filter(function (s) {
        return s && typeof s.name === 'string' && s.name.trim() &&
          isFinite(Number(s.amount)) && Number(s.amount) > 0 &&
          typeof s.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.date) && !isNaN(parseDate(s.date));
      }).map(function (s) {
        return {
          id: String(s.id || uid()),
          name: s.name.trim().slice(0, 40),
          amount: Number(s.amount),
          currency: s.currency === 'USD' ? 'USD' : 'JPY',
          cycle: s.cycle === 'year' ? 'year' : 'month',
          date: s.date,
          categoryId: s.categoryId != null && ids[String(s.categoryId)] ? String(s.categoryId) : null
        };
      });
    }
    return out;
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) { /* 保存領域が使えない環境ではメモリ上だけで動かす */ }
    return defaults();
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
    catch (e) { return false; }
  }

  var state = load();
  var ui = { tab: 'home', calY: 0, calM: 0, period: 'month', focus: undefined, newColor: null, form: null };

  /* ---------- 日付と金額 ---------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseDate(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function today() { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
  function daysIn(y, m) { return new Date(y, m + 1, 0).getDate(); }
  function diffDays(a, b) { return Math.round((a - b) / 86400000); }

  /* その月の支払日（なければ null）。開始日より前の月は対象外 */
  function occInMonth(sub, y, m) {
    var a = parseDate(sub.date);
    if (sub.cycle === 'year' && a.getMonth() !== m) return null;
    var d = new Date(y, m, Math.min(a.getDate(), daysIn(y, m)));
    return d < a ? null : d;
  }

  function nextDate(sub, t) {
    var a = parseDate(sub.date);
    if (a >= t) return a;
    for (var i = 0; i <= 24; i++) {
      var ref = new Date(t.getFullYear(), t.getMonth() + i, 1);
      var d = occInMonth(sub, ref.getFullYear(), ref.getMonth());
      if (d && d >= t) return d;
    }
    return a;
  }

  function toJPY(sub, amt) { return sub.currency === 'USD' ? amt * state.rate : amt; }
  function monthlyNative(sub) { return sub.cycle === 'year' ? sub.amount / 12 : sub.amount; }
  function monthlyJPY(sub) { return toJPY(sub, monthlyNative(sub)); }

  function yen(n) { return '¥' + Math.round(n).toLocaleString('ja-JP'); }
  function usd(n) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function money(sub, amt) { return sub.currency === 'USD' ? usd(amt) : yen(amt); }
  function rateText() { return state.rate.toLocaleString('ja-JP', { maximumFractionDigits: 2 }); }
  function pct(part, whole) { return whole > 0 ? (part / whole * 100).toFixed(1) + '%' : '0.0%'; }

  function parseNumber(s) {
    var t = String(s).replace(/[０-９．]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[,，\s¥￥$＄円]/g, '');
    if (!/^\d*\.?\d+$/.test(t) && !/^\d+\.$/.test(t)) return NaN;
    return parseFloat(t);
  }

  var UNCAT = { id: null, name: '未分類', color: NEUTRAL };
  function catById(id) {
    for (var i = 0; i < state.categories.length; i++) if (state.categories[i].id === id) return state.categories[i];
    return UNCAT;
  }

  function inkOn(hex) {
    var c = [1, 3, 5].map(function (i) {
      var v = parseInt(hex.substr(i, 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    var L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    return (L + 0.05) / 0.0548 >= 1.05 / (L + 0.05) ? '#0D1014' : '#FFFFFF';
  }

  function initials(name) {
    var m = name.match(/^[A-Za-z0-9]{1,2}/);
    if (m) return m[0].toUpperCase();
    return Array.from(name)[0] || '?';
  }

  /* ---------- DOM ヘルパー ---------- */
  function append(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(el, x); }); return; }
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }

  function h(tag, props) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v == null || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'value') el.value = v;
        else if (k === 'bg') el.style.background = v;
        else if (k === 'ink') el.style.color = v;
        else if (k === 'width') el.style.width = v;
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }

  function icon(name) {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', 'ic');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICONS[name];
    return s;
  }

  var $view = document.getElementById('view');
  var $tabs = document.getElementById('tabs');
  var $sheet = document.getElementById('sheet');
  var $dialog = document.getElementById('dialog');
  var $toast = document.getElementById('toast');
  var toastTimer = 0;

  function toast(msg) {
    $toast.textContent = msg;
    $toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $toast.classList.remove('show'); }, 1800);
  }

  function confirmBox(message, detail, okLabel, onOk) {
    function close() { $dialog.hidden = true; $dialog.textContent = ''; }
    $dialog.textContent = '';
    $toast.classList.remove('show');
    $dialog.appendChild(h('div', { class: 'box', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': message },
      h('p', { text: message }),
      detail ? h('p', { class: 'small', text: detail }) : null,
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn-plain', text: 'キャンセル', onclick: close }),
        h('button', { type: 'button', class: 'btn-plain danger', text: okLabel, onclick: function () { close(); onOk(); } })
      )
    ));
    $dialog.hidden = false;
  }

  /* ---------- 共通パーツ ---------- */
  var TABS = [
    { id: 'home', label: 'ホーム', icon: 'home' },
    { id: 'calendar', label: '支払日', icon: 'calendar' },
    { id: 'analytics', label: '分析', icon: 'chart' },
    { id: 'settings', label: '設定', icon: 'settings' }
  ];

  function renderTabs() {
    $tabs.textContent = '';
    TABS.forEach(function (t) {
      $tabs.appendChild(h('button', {
        type: 'button', class: 'tab', 'aria-current': ui.tab === t.id ? 'page' : null,
        onclick: function () { go(t.id); }
      }, icon(t.icon), h('span', { text: t.label })));
    });
  }

  function go(tab) {
    ui.tab = tab;
    ui.focus = undefined;
    if (tab === 'calendar') { var t = today(); ui.calY = t.getFullYear(); ui.calM = t.getMonth(); }
    render();
    $view.scrollTop = 0;
  }

  function addButton() {
    return h('button', { type: 'button', class: 'btn-accent', onclick: function () { openForm(null); } },
      icon('plus'), h('span', { text: '追加' }));
  }

  function emptyState(text) {
    return h('div', { class: 'empty' }, h('p', { text: text }), addButton());
  }

  function avatar(sub) {
    var c = catById(sub.categoryId), t = initials(sub.name);
    return h('div', { class: 'avatar' + (t.length > 1 ? ' two' : ''), bg: c.color, ink: inkOn(c.color), 'aria-hidden': 'true', text: t });
  }

  function untilText(n) { return n === 0 ? '今日' : 'あと' + n + '日'; }

  function dateText(d, t) {
    var s = (d.getMonth() + 1) + '/' + d.getDate() + '（' + WEEK[d.getDay()] + '）';
    return d.getFullYear() !== t.getFullYear() ? d.getFullYear() + '/' + s : s;
  }

  function amountSub(sub) {
    var parts = [];
    if (sub.currency === 'USD') parts.push('≈ ' + yen(toJPY(sub, sub.amount)));
    parts.push(sub.cycle === 'year' ? '毎年' : '毎月');
    if (sub.cycle === 'year' && sub.currency !== 'USD') parts.push('月あたり ' + yen(sub.amount / 12));
    return parts.join(' ・ ');
  }

  /* ---------- ホーム ---------- */
  function viewHome() {
    var t = today(), subs = state.subs;
    var total = 0, jpyM = 0, usdM = 0, nJ = 0, nU = 0;
    subs.forEach(function (s) {
      total += monthlyJPY(s);
      if (s.currency === 'USD') { usdM += monthlyNative(s); nU++; } else { jpyM += monthlyNative(s); nJ++; }
    });
    var items = subs.map(function (s) { return { sub: s, next: nextDate(s, t) }; })
      .sort(function (a, b) { return a.next - b.next || a.sub.name.localeCompare(b.sub.name, 'ja'); });

    var out = [
      h('div', { class: 'head' },
        h('div', null,
          h('div', { class: 'date', text: t.getFullYear() + '年' + (t.getMonth() + 1) + '月' + t.getDate() + '日（' + WEEK[t.getDay()] + '）' }),
          h('h1', { text: 'サブスク' })),
        addButton()),
      h('div', { class: 'hero' },
        h('div', { class: 'label', text: '毎月の支払い（円換算）' }),
        h('div', { class: 'total', text: yen(total) }),
        h('div', { class: 'sub', text: '年間 ' + yen(total * 12) + ' ・ ' + subs.length + '件を登録中' }))
    ];

    if (!subs.length) {
      out.push(emptyState('まだサブスクが登録されていません。\n「追加」から最初の1件を登録しましょう。'));
      return out;
    }

    out.push(h('div', { class: 'split' },
      h('div', { class: 'cell' },
        h('div', { class: 'k', text: '円建て ・ ' + nJ + '件' }),
        h('div', { class: 'v', text: yen(jpyM) })),
      h('div', { class: 'cell' },
        h('div', { class: 'k', text: 'ドル建て ・ ' + nU + '件' }),
        h('div', { class: 'v' }, usd(usdM), h('small', { text: '≈ ' + yen(usdM * state.rate) })))));

    out.push(h('div', { class: 'section' },
      h('div', { class: 'section-head' },
        h('h2', { text: '支払日が近い順' }),
        h('button', { type: 'button', class: 'link', text: '1ドル = ' + rateText() + '円', onclick: function () { go('settings'); } })),
      h('div', { class: 'list' }, items.map(function (it) {
        var s = it.sub, n = diffDays(it.next, t);
        return h('button', { type: 'button', class: 'row', onclick: function () { openForm(s.id); } },
          avatar(s),
          h('div', { class: 'mid' },
            h('div', { class: 'name', text: s.name }),
            h('div', { class: 'meta' },
              h('span', { text: dateText(it.next, t) }),
              n > 3 ? h('span', { text: '・ ' + untilText(n) }) : null,
              n <= 3 ? h('span', { class: 'pill', text: untilText(n) }) : null)),
          h('div', { class: 'end' },
            h('div', { class: 'amt', text: money(s, s.amount) }),
            h('div', { class: 'amt-sub', text: amountSub(s) })));
      }))));
    return out;
  }

  /* ---------- 支払日カレンダー ---------- */
  function viewCalendar() {
    var t = today(), y = ui.calY, m = ui.calM;
    var isThisMonth = y === t.getFullYear() && m === t.getMonth();
    var occ = [];
    state.subs.forEach(function (s) {
      var d = occInMonth(s, y, m);
      if (d) occ.push({ sub: s, date: d });
    });
    occ.sort(function (a, b) { return a.date - b.date || a.sub.name.localeCompare(b.sub.name, 'ja'); });

    var byDay = {};
    occ.forEach(function (o) { (byDay[o.date.getDate()] = byDay[o.date.getDate()] || []).push(o); });

    function shift(n) {
      var d = new Date(y, m + n, 1);
      ui.calY = d.getFullYear(); ui.calM = d.getMonth();
      render();
    }

    var cells = [], lead = new Date(y, m, 1).getDay(), dim = daysIn(y, m), i;
    for (i = 0; i < lead; i++) cells.push(h('div', { class: 'cell-day' }));
    for (i = 1; i <= dim; i++) {
      var d = new Date(y, m, i), list = byDay[i] || [];
      var cls = 'cell-day' + (d < t ? ' past' : '') + (d.getTime() === t.getTime() ? ' today' : '');
      var label = (m + 1) + '月' + i + '日' + (list.length ? '、支払い' + list.length + '件' : '');
      cells.push(h('div', { class: cls, 'aria-label': label },
        h('div', { class: 'num', text: i }),
        h('div', { class: 'dots' }, list.slice(0, 3).map(function (o) {
          return h('i', { bg: catById(o.sub.categoryId).color });
        }))));
    }

    var rest = occ.filter(function (o) { return !isThisMonth || o.date >= t; });
    var sum = rest.reduce(function (a, o) { return a + toJPY(o.sub, o.sub.amount); }, 0);

    var out = [
      h('div', { class: 'head' },
        h('h1', { text: '支払日' }),
        h('div', { class: 'month-nav' },
          h('button', { type: 'button', class: 'btn-icon', 'aria-label': '前の月', onclick: function () { shift(-1); } }, icon('left')),
          h('button', { type: 'button', class: 'label', 'aria-label': y + '年' + (m + 1) + '月（タップで今月に戻る）', text: y + '年' + (m + 1) + '月',
            onclick: function () { ui.calY = t.getFullYear(); ui.calM = t.getMonth(); render(); } }),
          h('button', { type: 'button', class: 'btn-icon', 'aria-label': '次の月', onclick: function () { shift(1); } }, icon('right')))),
      h('div', null,
        h('div', { class: 'weekdays' }, WEEK.split('').map(function (w) { return h('div', { text: w }); })),
        h('div', { class: 'grid' }, cells))
    ];

    var section = h('div', { class: 'section' },
      h('div', { class: 'section-head' },
        h('h2', { text: isThisMonth ? '今月の支払い' : (m + 1) + '月の支払い' }),
        h('div', { class: 'aside' }, isThisMonth ? '残り ' : '合計 ', h('b', { text: yen(sum) }), '（' + rest.length + '件）')));

    if (!occ.length) {
      section.appendChild(h('p', { class: 'note', text: 'この月に支払い予定はありません。' }));
    } else {
      section.appendChild(h('div', { class: 'list' }, occ.map(function (o) {
        var s = o.sub, c = catById(s.categoryId), n = diffDays(o.date, t), past = n < 0;
        return h('button', { type: 'button', class: 'row' + (past ? ' past' : ''), onclick: function () { openForm(s.id); } },
          h('div', { class: 'daybox' }, h('b', { text: o.date.getDate() }), h('span', { text: WEEK[o.date.getDay()] })),
          h('div', { class: 'dot', bg: c.color }),
          h('div', { class: 'mid' },
            h('div', { class: 'name', text: s.name }),
            h('div', { class: 'meta' },
              h('span', { text: c.name }),
              past || n > 3 ? h('span', { text: '・ ' + (past ? '支払い済み' : untilText(n)) }) : null,
              !past && n <= 3 ? h('span', { class: 'pill', text: untilText(n) }) : null)),
          h('div', { class: 'end' },
            h('div', { class: 'amt', text: money(s, s.amount) }),
            s.currency === 'USD' ? h('div', { class: 'amt-sub', text: '≈ ' + yen(toJPY(s, s.amount)) }) : null));
      })));
    }
    out.push(section);
    return out;
  }

  /* ---------- 分析 ---------- */
  function viewAnalytics() {
    var year = ui.period === 'year', mult = year ? 12 : 1, subs = state.subs;
    var head = h('div', { class: 'head' },
      h('h1', { text: '分析' }),
      h('div', { class: 'seg', role: 'group', 'aria-label': '集計期間' },
        h('button', { type: 'button', 'aria-pressed': String(!year), text: '月額', onclick: function () { ui.period = 'month'; render(); } }),
        h('button', { type: 'button', 'aria-pressed': String(year), text: '年額', onclick: function () { ui.period = 'year'; render(); } })));

    if (!subs.length) return [head, emptyState('登録するとカテゴリ別の内訳が表示されます。')];

    var map = {}, groups = [], total = 0, jpy = 0, usdNative = 0;
    subs.forEach(function (s) {
      var key = catById(s.categoryId).id, v = monthlyJPY(s);
      var k = key === null ? '_' : key;
      if (!map[k]) { map[k] = { cat: catById(s.categoryId), key: key, value: 0, count: 0 }; groups.push(map[k]); }
      map[k].value += v; map[k].count++;
      total += v;
      if (s.currency === 'USD') usdNative += monthlyNative(s); else jpy += v;
    });
    groups.sort(function (a, b) { return b.value - a.value; });

    var focus = null;
    groups.forEach(function (g) { if (ui.focus !== undefined && g.key === ui.focus) focus = g; });
    function toggle(g) { ui.focus = focus === g ? undefined : g.key; render(); }

    /* ドーナツ */
    var R = 76, C = 2 * Math.PI * R, svg = document.createElementNS(NS, 'svg'), acc = 0;
    svg.setAttribute('viewBox', '0 0 184 184');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'カテゴリ別の支出割合。' + groups.map(function (g) { return g.cat.name + pct(g.value, total); }).join('、'));
    groups.forEach(function (g) {
      var len = total > 0 ? g.value / total * C : 0;
      var gap = groups.length > 1 ? 2 : 0;
      var dash = Math.max(len - gap, 0.5);
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', 92); c.setAttribute('cy', 92); c.setAttribute('r', R);
      c.setAttribute('stroke', g.cat.color);
      c.setAttribute('stroke-dasharray', dash + ' ' + (C - dash));
      c.setAttribute('stroke-dashoffset', -(acc + gap / 2));
      if (focus && focus !== g) c.setAttribute('class', 'dim');
      c.addEventListener('click', function () { toggle(g); });
      svg.appendChild(c);
      acc += len;
    });
    var centerValue = yen((focus ? focus.value : total) * mult);
    var donut = h('div', { class: 'donut' }, svg,
      h('div', { class: 'center' },
        h('div', { class: 'k', text: focus ? focus.cat.name : (year ? '年額合計' : '月額合計') }),
        h('div', { class: 'v' + (centerValue.length > 8 ? ' long' : ''), text: centerValue }),
        h('div', { class: 's', text: focus ? pct(focus.value, total) + ' ・ ' + focus.count + '件' : subs.length + '件 ・ 円換算' })));

    var legend = h('div', { class: 'list legend' }, groups.map(function (g) {
      return h('button', { type: 'button', class: 'row' + (focus && focus !== g ? ' dim' : ''), 'aria-pressed': String(focus === g), onclick: function () { toggle(g); } },
        h('div', { class: 'sq', bg: g.cat.color }),
        h('div', { class: 'nm' }, h('b', { text: g.cat.name }), h('span', { text: g.count + '件' })),
        h('div', { class: 'pct', text: pct(g.value, total) }),
        h('div', { class: 'amt', text: yen(g.value * mult) }));
    }));

    var usdJ = usdNative * state.rate;
    var card = h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', { text: '通貨別' }), h('span', { text: '1ドル = ' + rateText() + '円で換算' })),
      h('div', { class: 'bar', role: 'img', 'aria-label': '円建て' + pct(jpy, total) + '、ドル建て' + pct(usdJ, total) },
        jpy > 0 ? h('i', { bg: '#F3F5F8', width: (jpy / total * 100) + '%' }) : null,
        usdJ > 0 ? h('i', { style: 'flex:1', bg: NEUTRAL }) : null),
      h('div', { class: 'kv' }, h('div', { class: 'dot', bg: '#F3F5F8' }),
        h('div', { class: 'grow' }, '円建て ', h('span', { text: pct(jpy, total) })), h('b', { text: yen(jpy * mult) })),
      h('div', { class: 'kv' }, h('div', { class: 'dot', bg: NEUTRAL }),
        h('div', { class: 'grow' }, 'ドル建て ', h('span', { text: pct(usdJ, total) })), h('b', { text: usd(usdNative * mult) + ' ≈ ' + yen(usdJ * mult) })));

    return [head, donut, legend, card];
  }

  /* ---------- 設定 ---------- */
  function usage(catId) {
    return state.subs.filter(function (s) { return s.categoryId === catId; }).length;
  }

  function nextColor() {
    var used = {};
    state.categories.forEach(function (c) { used[c.color.toUpperCase()] = true; });
    for (var i = 0; i < PALETTE.length; i++) if (!used[PALETTE[i]]) return PALETTE[i];
    return PALETTE[state.categories.length % PALETTE.length];
  }

  function viewSettings() {
    /* 為替レート */
    var rateErr = h('div', { class: 'error', role: 'alert' });
    var rateInput = h('input', { id: 'rate', class: 'input big on-card', type: 'text', inputmode: 'decimal', autocomplete: 'off', value: String(state.rate) });
    function applyRate() {
      var v = parseNumber(rateInput.value);
      if (!isFinite(v) || v <= 0) { rateErr.textContent = '0より大きい数字を入力してください。'; return; }
      v = Math.round(v * 100) / 100;
      rateErr.textContent = '';
      if (v === state.rate) { rateInput.value = String(v); return; }
      state.rate = v;
      save();
      rateInput.value = String(v);
      toast('レートを 1ドル = ' + rateText() + '円 に更新しました');
    }
    rateInput.addEventListener('change', applyRate);
    rateInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') rateInput.blur(); });
    var rateCard = h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', { text: 'ドル円レート' })),
      h('div', { class: 'inline' },
        h('label', { class: 'unit', for: 'rate', text: '1ドル =' }),
        rateInput,
        h('span', { class: 'unit', text: '円' }),
        h('button', { type: 'button', class: 'btn-small', text: '保存', onclick: applyRate })),
      rateErr,
      h('p', { class: 'note', text: 'ドル建てのサブスクは、このレートで円に換算して合計します。レートは自動では変わらないので、必要なときに書き換えてください。' }));

    /* カテゴリ */
    if (!ui.newColor) ui.newColor = nextColor();
    var catErr = h('div', { class: 'error', role: 'alert' });
    var catInput = h('input', { id: 'newcat', class: 'input on-card', type: 'text', maxlength: '12', placeholder: '例：ゲーム', autocomplete: 'off', enterkeyhint: 'done' });
    function addCategory() {
      var name = catInput.value.trim();
      if (!name) { catErr.textContent = 'カテゴリ名を入力してください。'; return; }
      if (name === UNCAT.name || state.categories.some(function (c) { return c.name === name; })) { catErr.textContent = '同じ名前のカテゴリがあります。'; return; }
      state.categories.push({ id: uid(), name: name, color: ui.newColor });
      save();
      ui.newColor = null;
      render();
      toast('「' + name + '」を追加しました');
    }
    catInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') addCategory(); });

    var swatches = h('div', { class: 'swatches', role: 'group', 'aria-label': 'カテゴリの色' }, PALETTE.map(function (col, i) {
      return h('button', { type: 'button', class: 'swatch', 'aria-label': '色' + (i + 1), 'aria-pressed': String(ui.newColor === col),
        onclick: function () {
          ui.newColor = col;
          Array.prototype.forEach.call(swatches.children, function (b, j) { b.setAttribute('aria-pressed', String(j === i)); });
        } }, h('i', { bg: col }));
    }));

    var catCard = h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', { text: 'カテゴリ' }), h('span', { text: state.categories.length + '件' })),
      state.categories.length
        ? h('div', null, state.categories.map(function (c) {
          var n = usage(c.id);
          return h('div', { class: 'cat-row' },
            h('div', { class: 'dot', bg: c.color }),
            h('div', { class: 'nm', text: c.name }),
            h('div', { class: 'cnt', text: n ? n + '件で使用中' : '未使用' }),
            h('button', { type: 'button', class: 'btn-icon', 'aria-label': c.name + 'を削除', onclick: function () {
              confirmBox('カテゴリ「' + c.name + '」を削除しますか？',
                n ? 'このカテゴリの' + n + '件は「未分類」になります。サブスク自体は消えません。' : null,
                '削除する', function () {
                  state.categories = state.categories.filter(function (x) { return x.id !== c.id; });
                  state.subs.forEach(function (s) { if (s.categoryId === c.id) s.categoryId = null; });
                  save();
                  ui.newColor = null;
                  render();
                  toast('「' + c.name + '」を削除しました');
                });
            } }, icon('trash')));
        }))
        : h('p', { class: 'note', text: 'カテゴリがありません。下から追加できます。' }),
      h('div', { class: 'field' },
        h('label', { for: 'newcat', text: '新しいカテゴリ' }),
        h('div', { class: 'inline' }, catInput, h('button', { type: 'button', class: 'btn-small', text: '追加', onclick: addCategory })),
        swatches,
        catErr));

    /* バックアップ */
    var file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, 'aria-hidden': 'true', tabindex: '-1' });
    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        var data;
        try { data = JSON.parse(String(reader.result)); } catch (e) { data = null; }
        file.value = '';
        if (!data || !Array.isArray(data.subs)) { toast('このファイルは読み込めませんでした'); return; }
        var next = normalize(data);
        confirmBox('バックアップを読み込みますか？', '今のデータ（' + state.subs.length + '件）は、ファイルの内容（' + next.subs.length + '件）に置き換わります。', '読み込む', function () {
          state = next;
          save();
          ui.newColor = null;
          render();
          toast('バックアップを読み込みました');
        });
      };
      reader.readAsText(f);
    });
    var dataCard = h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', { text: 'データ' })),
      h('p', { class: 'note', text: 'データはこの端末のブラウザ内だけに保存され、外部には送信されません。機種変更やアプリの入れ直しの前に、バックアップを書き出しておいてください。' }),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn-plain', onclick: exportData }, icon('down'), h('span', { text: '書き出す' })),
        h('button', { type: 'button', class: 'btn-plain', onclick: function () { file.click(); } }, icon('up'), h('span', { text: '読み込む' }))),
      file);

    return [h('div', { class: 'head' }, h('h1', { text: '設定' })), rateCard, catCard, dataCard];
  }

  function exportData() {
    var text = JSON.stringify(state, null, 2), name = 'subsc-backup-' + iso(today()) + '.json', file = null;
    try { file = new File([text], name, { type: 'application/json' }); } catch (e) { file = null; }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: name }).catch(function () { /* キャンセル */ });
      return;
    }
    var url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    var a = h('a', { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------- 追加・編集フォーム ---------- */
  function openForm(id) {
    var sub = null;
    state.subs.forEach(function (s) { if (s.id === id) sub = s; });
    ui.form = sub
      ? { id: sub.id, name: sub.name, amount: String(sub.amount), currency: sub.currency, cycle: sub.cycle, date: sub.date, categoryId: sub.categoryId, error: '' }
      : { id: null, name: '', amount: '', currency: 'JPY', cycle: 'month', date: iso(today()), categoryId: state.categories.length ? state.categories[0].id : null, error: '' };
    $toast.classList.remove('show');
    $sheet.hidden = false;
    renderForm();
  }

  function closeForm() {
    ui.form = null;
    $sheet.hidden = true;
    $sheet.textContent = '';
  }

  function seg(cls, label, options, current, onPick) {
    return h('div', { class: 'seg ' + cls, role: 'group', 'aria-label': label }, options.map(function (o) {
      return h('button', { type: 'button', 'aria-pressed': String(o.value === current), text: o.label, onclick: function () { onPick(o.value); } });
    }));
  }

  function renderForm() {
    var f = ui.form, editing = !!f.id;
    var hint = h('div', { class: 'hint' });
    function updateHint() {
      var n = parseNumber(f.amount);
      if (f.currency !== 'USD') hint.textContent = f.cycle === 'year' && isFinite(n) && n > 0 ? '月あたり ' + yen(n / 12) : '';
      else if (!isFinite(n) || n <= 0) hint.textContent = '1ドル = ' + rateText() + '円で換算します';
      else hint.textContent = '≈ ' + yen(n * state.rate) + (f.cycle === 'year' ? '（月あたり ' + yen(n * state.rate / 12) + '）' : '') + ' ・ 1ドル = ' + rateText() + '円';
    }
    updateHint();

    var body = h('div', { class: 'sheet-body' },
      h('div', { class: 'sheet-head' },
        h('button', { type: 'button', class: 'btn-icon', 'aria-label': '閉じる', onclick: closeForm }, icon('left')),
        h('h1', { text: editing ? 'サブスクを編集' : 'サブスクを追加' }),
        editing
          ? h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'このサブスクを削除', ink: '#FF8A80', onclick: removeCurrent }, icon('trash'))
          : h('div', { class: 'spacer' })),
      h('div', { class: 'field' },
        h('label', { for: 'f-name', text: 'サービス名' }),
        h('input', { id: 'f-name', class: 'input', type: 'text', maxlength: '40', autocomplete: 'off', placeholder: '例：動画配信サービス', value: f.name,
          oninput: function (e) { f.name = e.target.value; } })),
      h('div', { class: 'field' },
        h('label', { for: 'f-amount', text: '金額' }),
        h('div', { class: 'inline' },
          h('input', { id: 'f-amount', class: 'input big', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0', value: f.amount,
            oninput: function (e) { f.amount = e.target.value; updateHint(); } }),
          seg('cur', '通貨', [{ value: 'JPY', label: '円' }, { value: 'USD', label: 'ドル' }], f.currency, function (v) { f.currency = v; renderForm(); })),
        hint),
      h('div', { class: 'field' },
        h('div', { class: 'lbl', text: '支払いサイクル' }),
        seg('wide', '支払いサイクル', [{ value: 'month', label: '毎月' }, { value: 'year', label: '毎年' }], f.cycle, function (v) { f.cycle = v; renderForm(); })),
      h('div', { class: 'field' },
        h('label', { for: 'f-date', text: '次回の支払日' }),
        h('input', { id: 'f-date', class: 'input', type: 'date', value: f.date, oninput: function (e) { f.date = e.target.value; } })),
      h('div', { class: 'field' },
        h('div', { class: 'lbl', text: 'カテゴリ' }),
        h('div', { class: 'chips', role: 'group', 'aria-label': 'カテゴリ' }, state.categories.concat([UNCAT]).map(function (c) {
          return h('button', { type: 'button', class: 'chip', 'aria-pressed': String(f.categoryId === c.id), onclick: function () { f.categoryId = c.id; renderForm(); } },
            h('span', { class: 'dot', bg: c.color }), h('span', { text: c.name }));
        })),
        h('div', { class: 'hint', text: 'カテゴリの追加・削除は「設定」からできます。' })));

    var foot = h('div', { class: 'sheet-foot' },
      h('div', { class: 'error', role: 'alert', text: f.error }),
      h('button', { type: 'button', class: 'btn-primary', text: editing ? '変更を保存' : '保存する', onclick: submitForm }));

    var top = $sheet.firstChild ? $sheet.firstChild.scrollTop : 0;
    $sheet.textContent = '';
    $sheet.appendChild(body);
    $sheet.appendChild(foot);
    body.scrollTop = top;
  }

  function submitForm() {
    var f = ui.form, name = f.name.trim(), amount = parseNumber(f.amount);
    var err = '';
    if (!name) err = 'サービス名を入力してください。';
    else if (!isFinite(amount) || amount <= 0) err = '金額を数字で入力してください。';
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date) || isNaN(parseDate(f.date))) err = '次回の支払日を選んでください。';
    if (err) { f.error = err; renderForm(); return; }

    amount = f.currency === 'USD' ? Math.round(amount * 100) / 100 : Math.round(amount);
    if (amount <= 0) { f.error = '金額を数字で入力してください。'; renderForm(); return; }
    var data = { id: f.id || uid(), name: name, amount: amount, currency: f.currency, cycle: f.cycle, date: f.date, categoryId: f.categoryId };
    var replaced = false;
    state.subs = state.subs.map(function (s) { if (s.id === data.id) { replaced = true; return data; } return s; });
    if (!replaced) state.subs.push(data);
    var ok = save();
    closeForm();
    render();
    toast(ok ? (replaced ? '変更を保存しました' : '「' + name + '」を追加しました') : '保存できませんでした（この画面を閉じると消えます）');
  }

  function removeCurrent() {
    var f = ui.form;
    confirmBox('「' + f.name + '」を削除しますか？', 'この操作は取り消せません。', '削除する', function () {
      state.subs = state.subs.filter(function (s) { return s.id !== f.id; });
      save();
      closeForm();
      render();
      toast('削除しました');
    });
  }

  /* ---------- 描画 ---------- */
  var VIEWS = { home: viewHome, calendar: viewCalendar, analytics: viewAnalytics, settings: viewSettings };

  function render() {
    var top = $view.scrollTop;
    $view.textContent = '';
    append($view, VIEWS[ui.tab]());
    $view.scrollTop = top;
    renderTabs();
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!$dialog.hidden) { $dialog.hidden = true; $dialog.textContent = ''; }
    else if (ui.form) closeForm();
  });

  /* 日付が変わったあとに開き直したときは表示を更新 */
  var lastDay = iso(today());
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || ui.form || !$dialog.hidden) return;
    var now = iso(today());
    if (now !== lastDay) { lastDay = now; render(); }
  });

  var t0 = today();
  ui.calY = t0.getFullYear();
  ui.calM = t0.getMonth();
  render();

  if (navigator.storage && navigator.storage.persist) { navigator.storage.persist().catch(function () {}); }
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('./sw.js').catch(function () {}); });
  }
})();
