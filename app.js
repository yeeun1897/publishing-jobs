(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var safeUrl = function (u) { return /^https?:\/\//i.test(u || '') ? u : ''; };

  /* ---------- 브라우저 저장 (localStorage만 사용, 실패해도 동작) ---------- */
  var mem = {};
  var store = {
    get: function (k, d) {
      try { var v = localStorage.getItem('pj.' + k); return v ? JSON.parse(v) : d; }
      catch (e) { return mem[k] !== undefined ? mem[k] : d; }
    },
    set: function (k, v) {
      mem[k] = v;
      try { localStorage.setItem('pj.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ }
    }
  };
  var favs = store.get('favs', {});     // id -> {status, memo}
  var custom = store.get('custom', []); // 직접 추가한 공고
  var notes = store.get('notes', {});   // id -> {jd, kpiRaw, fills:{i:{...}}}
  var exps = store.get('exps', []);     // 내 실제 경험(선택)

  /* ---------- 유틸 ---------- */
  var DAY = 86400000;
  function today() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function parseDate(s) {
    if (!s) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function dday(job) {
    var d = parseDate(job.deadline);
    if (!d) return null;
    return Math.round((d - today()) / DAY);
  }
  function ddayBadge(job) {
    var n = dday(job);
    if (n === null) return '<span class="badge">상시·확인 필요</span>';
    if (n < 0) return '<span class="badge closed">마감 ' + job.deadline + '</span>';
    if (n === 0) return '<span class="badge urgent">오늘 마감</span>';
    return '<span class="badge' + (n <= 3 ? ' urgent' : '') + '">D-' + n + ' · ' + job.deadline + '</span>';
  }
  function isClosed(job) { var n = dday(job); return n !== null && n < 0; }
  function allJobs() {
    return (window.JOBS || []).concat(custom.map(function (c) { c.custom = true; return c; }));
  }
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    if (!ok) throw new Error('copy failed');
  }

  /* ---------- 탭 ---------- */
  var tabNames = ['jobs', 'pubs', 'saved'];
  $('#tabs').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-tab]'); if (!b) return;
    tabNames.forEach(function (n) { $('#tab-' + n).hidden = n !== b.dataset.tab; });
    $$('#tabs button').forEach(function (x) { x.classList.toggle('on', x === b); });
    if (b.dataset.tab === 'saved') renderSaved();
    if (b.dataset.tab === 'pubs') renderPubs();
  });

  /* ---------- 공고 목록 ---------- */
  var ROLES = ['편집', '전체', '마케팅', '영업', '저작권', '기타'];
  var state = { role: '편집' };

  function renderRoles() {
    $('#roles').innerHTML = ROLES.map(function (r) {
      return '<button class="pill' + (state.role === r ? ' on' : '') + '" data-role="' + r + '">' + r + '</button>';
    }).join('');
  }
  $('#roles').addEventListener('click', function (e) {
    var b = e.target.closest('[data-role]'); if (!b) return;
    state.role = b.dataset.role; renderRoles(); renderJobs();
  });

  function fillRegions() {
    var set = {};
    allJobs().forEach(function (j) { if (j.region) set[j.region] = 1; });
    var cur = $('#region').value;
    $('#region').innerHTML = '<option value="">지역 전국</option>' +
      Object.keys(set).sort().map(function (r) { return '<option>' + esc(r) + '</option>'; }).join('');
    $('#region').value = cur;
  }

  function matchCareer(j, mode) {
    if (!mode || !j.career) return true;
    var c = j.career;
    var isNew = /신입|무관/.test(c);
    return mode === 'new' ? isNew : /경력/.test(c);
  }

  function filtered() {
    var q = $('#q').value.trim().toLowerCase();
    var career = $('#career').value, region = $('#region').value;
    var showClosed = $('#showClosed').checked, sort = $('#sort').value;
    var list = allJobs().filter(function (j) {
      if (state.role !== '전체' && j.role !== state.role) return false;
      if (!showClosed && isClosed(j)) return false;
      if (!matchCareer(j, career)) return false;
      if (region && j.region !== region) return false;
      if (q && (j.company + ' ' + j.title).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    list.sort(function (a, b) {
      if (sort === 'company') return a.company.localeCompare(b.company, 'ko');
      var ca = isClosed(a), cb = isClosed(b);
      if (ca !== cb) return ca ? 1 : -1;
      var da = parseDate(a.deadline), db = parseDate(b.deadline);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return ca ? db - da : da - db;
    });
    return list;
  }

  function cardHtml(j) {
    var chips = [j.role, j.career || '경력 확인 필요', j.region || '지역 확인 필요'];
    if (j.employment) chips.push(j.employment);
    return '<article class="card' + (isClosed(j) ? ' closed' : '') + '" data-id="' + esc(j.id) + '" tabindex="0">' +
      '<div class="ctop"><span class="company">' + esc(j.company) + '</span>' + ddayBadge(j) + '</div>' +
      '<div class="title">' + esc(j.title) + '</div>' +
      '<div class="chips">' + chips.map(function (c) { return '<span class="chip">' + esc(c) + '</span>'; }).join('') + '</div>' +
      '<div class="foot2">' +
      (safeUrl(j.sourceUrl) ? '<a class="src" href="' + esc(j.sourceUrl) + '" target="_blank" rel="noopener noreferrer">출처: ' + esc(j.source || '원문') + ' ↗</a>' : '<span class="muted">출처 링크 없음</span>') +
      '<button class="star' + (favs[j.id] ? ' on' : '') + '" data-star="' + esc(j.id) + '" aria-label="보관함에 담기" aria-pressed="' + (!!favs[j.id]) + '">' + (favs[j.id] ? '★' : '☆') + '</button>' +
      '</div></article>';
  }

  function renderJobs() {
    var list = filtered();
    var open = allJobs().filter(function (j) { return !isClosed(j); }).length;
    $('#summary').textContent = '표시 ' + list.length + '건 · 진행 중(마감 전) 공고 전체 ' + open + '건';
    if (!list.length) {
      var totalClosed = allJobs().filter(isClosed).length;
      $('#list').innerHTML = '<div class="empty"><p><b>조건에 맞는 진행 중 공고가 없습니다.</b></p>' +
        '<p>이 페이지에는 출처 링크로 직접 확인된 공고만 올라옵니다.' +
        (totalClosed ? ' 마감된 공고 ' + totalClosed + '건은 “마감 포함”으로 볼 수 있습니다.' : '') + '</p>' +
        '<p>아래 “채용사이트에서 직접 검색하기”로 찾은 공고는 “공고 직접 추가”로 넣어 두세요.</p></div>';
      return;
    }
    $('#list').innerHTML = list.map(cardHtml).join('');
  }

  ['q', 'career', 'region', 'sort', 'showClosed'].forEach(function (id) {
    $('#' + id).addEventListener('input', renderJobs);
  });

  $('#list').addEventListener('click', listClick);
  $('#savedList').addEventListener('click', function (e) {
    var star = e.target.closest('[data-star]');
    if (star) toggleFav(star.dataset.star);
  });
  $('#list').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.classList.contains('card')) openDetail(e.target.dataset.id);
  });
  function listClick(e) {
    var star = e.target.closest('[data-star]');
    if (star) { toggleFav(star.dataset.star); e.stopPropagation(); return; }
    if (e.target.closest('a')) return;
    var card = e.target.closest('.card');
    if (card && card.dataset.id) openDetail(card.dataset.id);
  }
  function toggleFav(id) {
    if (favs[id]) delete favs[id]; else favs[id] = { status: '관심', memo: '' };
    store.set('favs', favs); refreshAll();
  }
  function refreshAll() {
    $('#favCount').textContent = Object.keys(favs).length;
    renderJobs();
    if (!$('#tab-saved').hidden) renderSaved();
  }

  /* ---------- 채용사이트 바로가기 ---------- */
  function renderSites() {
    var kw = encodeURIComponent('편집자 신입');
    var sites = [
      ['북잡 (출판 전문)', 'https://www.bookjob.co.kr/job'],
      ['잡코리아 출판편집', 'https://www.jobkorea.co.kr/Search/?stext=' + encodeURIComponent('출판편집')],
      ['사람인', 'https://www.saramin.co.kr/zf_user/search?searchword=' + kw],
      ['잡코리아', 'https://www.jobkorea.co.kr/Search/?stext=' + kw],
      ['인크루트', 'https://search.incruit.com/list/search.asp?col=job&kw=' + kw],
      ['워크넷(고용24)', 'https://www.work24.go.kr'],
      ['링커리어', 'https://linkareer.com'],
      ['자소설닷컴', 'https://jasoseol.com']
    ];
    $('#siteLinks').innerHTML = sites.map(function (s) {
      return '<a class="btn" href="' + s[1] + '" target="_blank" rel="noopener noreferrer">' + s[0] + ' ↗</a>';
    }).join('');
  }

  /* ---------- 출판사 ---------- */
  function renderPubs() {
    var jobs = allJobs();
    $('#pubList').innerHTML = (window.PUBLISHERS || []).map(function (p) {
      var openCnt = jobs.filter(function (j) { return j.company === p.name && !isClosed(j); }).length;
      var search = 'https://search.naver.com/search.naver?query=' + encodeURIComponent(p.name + ' 채용');
      var links = [];
      links.push(p.homepage ? '<a class="btn small" href="' + esc(p.homepage) + '" target="_blank" rel="noopener noreferrer">홈페이지 ↗</a>' : '<span class="chip">홈페이지 주소 확인 필요</span>');
      links.push(p.careerUrl ? '<a class="btn small" href="' + esc(p.careerUrl) + '" target="_blank" rel="noopener noreferrer">공식 채용 페이지 ↗</a>' : '<span class="chip">공식 채용 페이지 확인 필요</span>');
      links.push(p.instagram ? '<a class="btn small" href="' + esc(p.instagram) + '" target="_blank" rel="noopener noreferrer">Instagram ↗</a>' : '<span class="chip">공식 Instagram 확인 필요</span>');
      (p.refs || []).forEach(function (r) {
        links.push('<a class="btn small" href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer">' + esc(r.label) + ' ↗</a>');
      });
      links.push('<a class="btn small" href="' + search + '" target="_blank" rel="noopener noreferrer">채용 검색 ↗</a>');
      return '<article class="card" style="cursor:default"><div class="ctop"><h2>' + esc(p.name) + '</h2>' +
        '<span class="badge' + (openCnt ? '' : ' closed') + '">' + (openCnt ? '진행 중 ' + openCnt + '건' : '확인된 진행 공고 없음') + '</span></div>' +
        '<div class="row">' + links.join('') + '</div></article>';
    }).join('');
  }

  /* ---------- 보관함 ---------- */
  var STATUSES = ['관심', '지원완료', '서류합격', '불합격'];
  function renderSaved() {
    var ids = Object.keys(favs);
    var jobs = allJobs().filter(function (j) { return favs[j.id]; });
    if (!ids.length) {
      $('#savedList').innerHTML = '<div class="empty">아직 담은 공고가 없어요. 공고 카드의 ☆를 눌러 보세요.</div>';
      return;
    }
    jobs.sort(function (a, b) {
      var da = parseDate(a.deadline), db = parseDate(b.deadline);
      if (!da) return 1; if (!db) return -1; return da - db;
    });
    $('#savedList').innerHTML = jobs.map(function (j) {
      var f = favs[j.id];
      return '<article class="card" data-id="' + esc(j.id) + '" style="cursor:default">' +
        '<div class="ctop"><span class="company">' + esc(j.company) + '</span>' + ddayBadge(j) + '</div>' +
        '<div class="title">' + esc(j.title) + '</div>' +
        '<select data-status="' + esc(j.id) + '" aria-label="지원 상태">' + STATUSES.map(function (s) {
          return '<option' + (f.status === s ? ' selected' : '') + '>' + s + '</option>';
        }).join('') + '</select>' +
        '<textarea data-memo="' + esc(j.id) + '" placeholder="메모 (이 브라우저에만 저장)">' + esc(f.memo || '') + '</textarea>' +
        '<div class="foot2"><button class="btn small" data-open="' + esc(j.id) + '">상세·KPI</button>' +
        '<button class="star on" data-star="' + esc(j.id) + '" aria-label="보관함에서 빼기">★</button></div></article>';
    }).join('');
  }
  $('#savedList').addEventListener('change', function (e) {
    var id = e.target.dataset.status;
    if (id && favs[id]) { favs[id].status = e.target.value; store.set('favs', favs); }
  });
  $('#savedList').addEventListener('input', function (e) {
    var id = e.target.dataset.memo;
    if (id && favs[id]) { favs[id].memo = e.target.value; store.set('favs', favs); }
  });
  $('#savedList').addEventListener('click', function (e) {
    var o = e.target.closest('[data-open]'); if (o) openDetail(o.dataset.open);
  });

  $('#exportBtn').addEventListener('click', function () {
    var data = { favs: favs, custom: custom, notes: notes, exps: exps, exportedAt: new Date().toISOString() };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'publishing-jobs-backup.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast('내 컴퓨터에 파일로 저장했어요');
  });
  $('#importFile').addEventListener('change', function (e) {
    var file = e.target.files[0]; if (!file) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var d = JSON.parse(r.result);
        favs = d.favs || {}; custom = d.custom || []; notes = d.notes || {}; exps = d.exps || [];
        store.set('favs', favs); store.set('custom', custom); store.set('notes', notes); store.set('exps', exps);
        fillRegions(); refreshAll(); toast('가져왔어요');
      } catch (err) { toast('파일을 읽지 못했어요'); }
    };
    r.readAsText(file); e.target.value = '';
  });

  /* ---------- 공고 직접 추가 ---------- */
  $('#addBtn').addEventListener('click', function () { $('#addDlg').showModal(); });
  $('#addClose').addEventListener('click', function () { $('#addDlg').close(); });
  $('#addForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = new FormData(e.target);
    var url = safeUrl(f.get('sourceUrl'));
    if (!url) { toast('출처 링크는 http(s)로 시작해야 해요'); return; }
    var always = f.get('always');
    custom.push({
      id: 'c' + Date.now(), company: f.get('company').trim(), title: f.get('title').trim(),
      role: f.get('role'), career: f.get('career'), region: f.get('region').trim() || null,
      employment: f.get('employment').trim() || null,
      deadline: always ? null : (f.get('deadline') || null),
      source: f.get('source').trim() || '출처', sourceUrl: url, homepage: null,
      checkedAt: new Date().toISOString().slice(0, 10), note: '직접 추가한 공고입니다. 마감일은 원문에서 확인하세요.',
      jd: { duties: [], requirements: [], preferred: [] }, company3y: []
    });
    store.set('custom', custom);
    e.target.reset(); $('#addDlg').close(); fillRegions(); renderJobs(); toast('공고를 추가했어요');
  });

  /* ---------- 상세 ---------- */
  var cur = null, curTab = 'jd';
  function findJob(id) { return allJobs().filter(function (j) { return j.id === id; })[0]; }
  function noteOf(id) {
    if (!notes[id]) notes[id] = { jd: '', kpiRaw: '', fills: {} };
    return notes[id];
  }
  function openDetail(id) {
    cur = findJob(id); if (!cur) return;
    $('#dCompany').textContent = cur.company;
    $('#dTitle').textContent = cur.title;
    var chips = [cur.role, cur.career || '경력 확인 필요', cur.region || '지역 확인 필요'];
    if (cur.employment) chips.push(cur.employment);
    $('#dMeta').innerHTML = ddayBadge(cur) + chips.map(function (c) { return '<span class="chip">' + esc(c) + '</span>'; }).join('') +
      (cur.checkedAt ? '<span class="chip">확인일 ' + esc(cur.checkedAt) + '</span>' : '');
    var links = '';
    if (safeUrl(cur.sourceUrl)) links += '<a class="btn primary" href="' + esc(cur.sourceUrl) + '" target="_blank" rel="noopener noreferrer">원본 공고 보기 (출처: ' + esc(cur.source || '원문') + ') ↗</a>';
    if (safeUrl(cur.homepage)) links += '<a class="btn" href="' + esc(cur.homepage) + '" target="_blank" rel="noopener noreferrer">회사 홈페이지 ↗</a>';
    links += '<button class="btn" id="dStar">' + (favs[cur.id] ? '★ 보관함에서 빼기' : '☆ 보관함에 담기') + '</button>';
    $('#dLinks').innerHTML = links;
    curTab = 'jd'; setDTab('jd');
    if (!$('#detail').open) $('#detail').showModal();
  }
  $('#dClose').addEventListener('click', function () { $('#detail').close(); });
  $('#detail').addEventListener('close', refreshAll);
  $('#detail').addEventListener('click', function (e) { if (e.target === $('#detail')) $('#detail').close(); });
  $('#dLinks').addEventListener('click', function (e) {
    if (e.target.id === 'dStar') {
      toggleFav(cur.id);
      e.target.textContent = favs[cur.id] ? '★ 보관함에서 빼기' : '☆ 보관함에 담기';
    }
  });
  $('#dTabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-d]'); if (b) setDTab(b.dataset.d);
  });
  function setDTab(t) {
    curTab = t;
    $$('#dTabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.d === t); });
    if (t === 'jd') renderJD(); else if (t === 'co') renderCompany(); else renderKpi();
  }

  function listHtml(arr) {
    return arr.length ? '<ul>' + arr.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '';
  }
  function renderJD() {
    var n = noteOf(cur.id), jd = cur.jd || {};
    var has = (jd.duties && jd.duties.length) || (jd.requirements && jd.requirements.length) || (jd.preferred && jd.preferred.length);
    var userLines = (n.jd || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    var html = '<p class="note">출처: ' + (safeUrl(cur.sourceUrl) ? '<a href="' + esc(cur.sourceUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(cur.source || '원문') + ' 원본 공고 ↗</a>' : '링크 없음') +
      ' · 아래 정리는 원문 취지를 줄인 것이며, 지원 전 원문을 꼭 확인하세요.</p>';
    if (cur.note) html += '<p class="note warn">' + esc(cur.note) + '</p>';
    if (has) {
      html += '<div class="sec"><h3>담당업무</h3>' + (listHtml(jd.duties || []) || '<p class="muted">원문 확인 필요</p>') + '</div>' +
        '<div class="sec"><h3>자격요건</h3>' + (listHtml(jd.requirements || []) || '<p class="muted">원문 확인 필요</p>') + '</div>' +
        '<div class="sec"><h3>우대사항</h3>' + (listHtml(jd.preferred || []) || '<p class="muted">원문 확인 필요</p>') + '</div>';
    } else {
      html += '<div class="sec"><h3>JD 정리</h3><p class="muted">이 공고의 담당업무·자격요건은 아직 정리되지 않았습니다. 원본 공고에서 복사해 아래에 붙여 넣으면 줄 단위로 정리해 보여줍니다. (내 브라우저에만 저장)</p></div>';
    }
    html += '<div class="sec"><h3>내가 붙여 넣은 JD</h3>' +
      '<textarea id="jdText" placeholder="원본 공고의 담당업무·자격요건·우대사항을 붙여 넣으세요 (한 줄에 한 항목)">' + esc(n.jd || '') + '</textarea>' +
      '<div id="jdOut">' + listHtml(userLines) + '</div></div>';
    $('#dBody').innerHTML = html;
    $('#jdText').addEventListener('input', function (e) {
      n.jd = e.target.value; store.set('notes', notes);
      $('#jdOut').innerHTML = listHtml(e.target.value.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean));
    });
  }
  function renderCompany() {
    var pub = (window.PUBLISHERS || []).filter(function (p) { return p.name === cur.company; })[0];
    var items = cur.company3y || [];
    var html = '<p class="note">최근 3년 정보는 출처 링크가 있는 것만 넣습니다. 확인하지 못한 항목은 비워 둡니다.</p><div class="sec"><h3>최근 3년 정보</h3>';
    html += items.length ? '<ul>' + items.map(function (it) {
      return '<li>' + esc(it.year || '') + ' ' + esc(it.text) + (safeUrl(it.url) ? ' <a href="' + esc(it.url) + '" target="_blank" rel="noopener noreferrer">출처 ↗</a>' : '') + '</li>';
    }).join('') + '</ul>' : '<p class="muted">아직 확인된 정보가 없습니다. (조사 예정)</p>';
    html += '</div><div class="sec"><h3>바로가기</h3><div class="row">';
    var hp = safeUrl(cur.homepage) || (pub && safeUrl(pub.homepage));
    html += hp ? '<a class="btn" href="' + esc(hp) + '" target="_blank" rel="noopener noreferrer">홈페이지 ↗</a>' : '<span class="chip">홈페이지 주소 확인 필요</span>';
    if (pub && pub.refs) pub.refs.forEach(function (r) {
      html += '<a class="btn" href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer">' + esc(r.label) + ' ↗</a>';
    });
    html += '</div></div>';
    $('#dBody').innerHTML = html;
  }

  /* ---------- KPI → 연결 경험 질문 → 빈칸 채우기 ---------- */
  var FIELDS = [
    ['act', '활동·경험 이름', '예: 대학 독서 동아리 소식지 제작'],
    ['period', '기간', '예: 6개월'],
    ['role', '내 역할', '예: 교정·편집 담당'],
    ['sit', '당시 상황', '예: 발행 때마다 오탈자가 반복되고 있었습니다'],
    ['a1', '한 일 ①', '예: 교정 체크리스트를 만들어 검수 단계를 나눴습니다'],
    ['a2', '한 일 ②', '예: 발행 전 동료와 교차 교정 일정을 조율했습니다'],
    ['res', '결과', '예: 오탈자 제보가 눈에 띄게 줄었습니다'],
    ['learn', '배운 점', '예: 마감 안에서 품질 기준을 세우는 방법을 배웠습니다']
  ];
  // 가상 예시입니다. 그대로 자소서에 쓰지 말고 내 실제 경험으로 바꿔 쓰세요.
  var SAMPLE = {
    act: '대학 독서 동아리 소식지 제작', period: '6개월', role: '교정·편집 담당',
    sit: '발행 때마다 오탈자가 반복되고 있었습니다',
    a1: '교정 체크리스트를 만들어 원고 검수 단계를 나눴습니다',
    a2: '발행 전에 동료와 교차 교정 일정을 조율했습니다',
    res: '오탈자 제보가 눈에 띄게 줄었습니다',
    learn: '마감 안에서 품질 기준을 세우는 방법을 배웠습니다'
  };

  function parseKpis(raw) {
    var lines = raw.split(/\r?\n/).map(function (s) {
      return s.replace(/^\s*(?:KPI\s*)?\d+\s*[\.\)\:：]\s*/i, '').replace(/^\s*[-•·*▪●]+\s*/, '').replace(/\*\*/g, '').trim();
    }).filter(function (s) { return s.length > 1; });
    return { kpis: lines.slice(0, 3), extra: Math.max(0, lines.length - 3) };
  }
  function endSentence(s) {
    s = s.trim();
    return /[.!?。…]$/.test(s) ? s : s + '.';
  }
  function buildSentences(job, kpi, f) {
    function v(k, label) { return (f[k] || '').trim() || '[' + label + ']'; }
    function vs(k, label) { return endSentence(v(k, label)); }
    var k = '“' + kpi + '”';
    return [
      '저는 ' + v('act', '활동 이름') + '에서 ' + k + '와 연결되는 경험을 했습니다.',
      v('period', '기간') + ' 동안 ' + v('role', '역할') + ' 역할로 참여했습니다.',
      '당시 ' + vs('sit', '당시 상황'),
      '저는 ' + k + '를 기준으로 목표를 세우고 문제를 풀어 보기로 했습니다.',
      '먼저 ' + vs('a1', '한 일 ①'),
      '이어서 ' + vs('a2', '한 일 ②'),
      '그 결과 ' + vs('res', '결과'),
      '이 경험으로 ' + vs('learn', '배운 점'),
      '편집자로서 ' + k + '를 다룰 때도 같은 방식으로 접근하겠습니다.',
      '입사 후 ' + job.company + '의 ' + job.role + ' 직무에서 이 경험을 바탕으로 기여하겠습니다.'
    ];
  }
  function questionsFor(kpi) {
    var k = '“' + kpi + '”';
    return [
      k + '와 관련해 숫자나 결과로 말할 수 있는 경험이 있나요?',
      k + '를 위해 다른 사람과 협업하거나 일정을 조율한 경험이 있나요?',
      k + '와 관련해 실수나 실패를 겪고 고쳐 본 경험이 있나요?'
    ];
  }

  function renderKpi() {
    var n = noteOf(cur.id);
    var html = '<p class="note">직무 KPI는 채용공고에 거의 적혀 있지 않습니다. 챗GPT에게 “' + esc(cur.company) + ' ' + esc(cur.role) + ' 직무의 KPI 3개를 알려줘”라고 물어본 뒤 답을 아래에 붙여 넣으세요. 붙여 넣은 내용은 이 브라우저 밖으로 나가지 않습니다.</p>' +
      '<div class="sec"><h3>KPI 붙여넣기</h3>' +
      '<textarea id="kpiRaw" placeholder="1. 신간 기획 건수&#10;2. 교정 오류율&#10;3. 일정 준수율">' + esc(n.kpiRaw || '') + '</textarea>' +
      '<div class="row" style="margin-top:8px"><button class="btn primary" id="kpiGo">KPI 정리하기</button><button class="btn" id="kpiClear">지우기</button></div></div>' +
      '<div id="kpiOut"></div>';
    $('#dBody').innerHTML = html;
    $('#kpiGo').addEventListener('click', function () {
      n.kpiRaw = $('#kpiRaw').value; store.set('notes', notes); drawKpis();
    });
    $('#kpiClear').addEventListener('click', function () {
      n.kpiRaw = ''; n.fills = {}; store.set('notes', notes); $('#kpiRaw').value = ''; drawKpis();
    });
    drawKpis();
  }

  function expOptions() {
    return '<option value="">저장한 내 경험 불러오기 (선택)</option>' + exps.map(function (x, i) {
      return '<option value="' + i + '">' + esc(x.name) + '</option>';
    }).join('');
  }

  function drawKpis() {
    var n = noteOf(cur.id), out = $('#kpiOut');
    var p = parseKpis(n.kpiRaw || '');
    if (!p.kpis.length) { out.innerHTML = '<p class="muted">KPI를 붙여 넣고 “KPI 정리하기”를 누르면 질문과 문장 틀이 나옵니다.</p>'; return; }
    var html = '';
    if (p.extra) html += '<p class="note warn">KPI가 ' + (p.kpis.length + p.extra) + '줄이라 앞의 3개만 정리했습니다.</p>';
    p.kpis.forEach(function (kpi, i) {
      var f = n.fills[i] || (n.fills[i] = {});
      html += '<div class="sec" data-i="' + i + '"><h3>KPI ' + (i + 1) + '. ' + esc(kpi) + '</h3>' +
        '<p class="muted">연결할 경험 질문</p><ol class="qs">' + questionsFor(kpi).map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ol>' +
        '<div class="row"><select data-load style="max-width:320px">' + expOptions() + '</select>' +
        '<button class="btn small" data-sample>예시 채우기</button></div>' +
        '<p class="muted" style="margin-top:6px">예시는 가상의 내용입니다. 그대로 쓰지 말고 내 실제 경험으로 바꿔 쓰세요.</p>' +
        '<div class="fill"><div class="two">' + FIELDS.map(function (fd) {
          return '<label>' + fd[1] + '<input data-k="' + fd[0] + '" value="' + esc(f[fd[0]] || '') + '" placeholder="' + esc(fd[2]) + '"></label>';
        }).join('') + '</div></div>' +
        '<div class="row"><input data-expname placeholder="이 경험 이름 (선택 저장용)" style="max-width:240px"><button class="btn small" data-saveexp>내 경험으로 저장</button></div>' +
        '<div class="result" style="margin-top:12px"><ol data-result></ol></div>' +
        '<div class="row" style="margin-top:10px"><button class="btn primary" data-copy>결과 복사</button><button class="btn" data-reset>입력 비우기</button></div></div>';
    });
    out.innerHTML = html;
    $$('.sec[data-i]', out).forEach(function (sec) { paintResult(sec, p.kpis[+sec.dataset.i]); });
  }

  function paintResult(sec, kpi) {
    var n = noteOf(cur.id), f = n.fills[sec.dataset.i] || {};
    var s = buildSentences(cur, kpi, f);
    $('[data-result]', sec).innerHTML = s.map(function (t) {
      return '<li>' + esc(t).replace(/\[([^\]]+)\]/g, '<mark>[$1]</mark>') + '</li>';
    }).join('');
    return s;
  }

  $('#dBody').addEventListener('input', function (e) {
    var k = e.target.dataset.k; if (!k) return;
    var sec = e.target.closest('.sec[data-i]');
    var n = noteOf(cur.id), i = sec.dataset.i;
    (n.fills[i] = n.fills[i] || {})[k] = e.target.value;
    store.set('notes', notes);
    paintResult(sec, parseKpis(n.kpiRaw).kpis[+i]);
  });
  $('#dBody').addEventListener('change', function (e) {
    if (!e.target.hasAttribute('data-load') || e.target.value === '') return;
    var sec = e.target.closest('.sec[data-i]'), n = noteOf(cur.id);
    var x = exps[+e.target.value]; if (!x) return;
    n.fills[sec.dataset.i] = JSON.parse(JSON.stringify(x.data));
    store.set('notes', notes); drawKpis(); toast('내 경험을 불러왔어요');
  });
  $('#dBody').addEventListener('click', function (e) {
    var sec = e.target.closest('.sec[data-i]'); if (!sec) return;
    var n = noteOf(cur.id), i = sec.dataset.i, kpi = parseKpis(n.kpiRaw).kpis[+i];
    if (e.target.hasAttribute('data-sample')) {
      n.fills[i] = JSON.parse(JSON.stringify(SAMPLE)); store.set('notes', notes); drawKpis();
      toast('가상 예시를 채웠어요. 내 경험으로 바꿔 쓰세요');
    } else if (e.target.hasAttribute('data-reset')) {
      n.fills[i] = {}; store.set('notes', notes); drawKpis();
    } else if (e.target.hasAttribute('data-copy')) {
      var s = buildSentences(cur, kpi, n.fills[i] || {});
      var blanks = s.join(' ').match(/\[[^\]]+\]/g);
      Promise.resolve().then(function () { return copyText(s.join(' ')); }).then(function () {
        toast(blanks ? '복사했어요. 빈칸 ' + blanks.length + '곳이 남아 있어요' : '복사했어요');
      }).catch(function () { toast('복사하지 못했어요. 직접 선택해서 복사해 주세요'); });
    } else if (e.target.hasAttribute('data-saveexp')) {
      var name = $('[data-expname]', sec).value.trim();
      var f = n.fills[i] || {};
      if (!name) { toast('경험 이름을 먼저 적어 주세요'); return; }
      if (!f.act) { toast('입력칸을 먼저 채워 주세요'); return; }
      exps.push({ name: name, data: JSON.parse(JSON.stringify(f)) });
      store.set('exps', exps); drawKpis(); toast('내 경험으로 저장했어요');
    }
  });

  /* ---------- 시작 ---------- */
  $('#updated').textContent = '공고 확인일 ' + (window.JOBS_UPDATED || '-');
  renderRoles(); fillRegions(); renderSites(); renderJobs();
  $('#favCount').textContent = Object.keys(favs).length;
})();
