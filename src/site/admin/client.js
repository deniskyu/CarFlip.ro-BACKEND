// ============================================================================
//  src/site/admin/client.js
// ----------------------------------------------------------------------------
//  JavaScript-ul panoului dealerului. Injectat inline, ~6 KB. Fără dependențe,
//  fără pas de build.
//
//  ── CE REZOLVĂ, ÎN ORDINEA IMPORTANȚEI ────────────────────────────────────
//
//  1. COMPRESIA ÎN BROWSER. Un telefon modern face poze de 8–12 MB. Treisprezece
//     bucăți înseamnă ~130 MB pe o conexiune 4G, cu o bară care pare blocată
//     minute în șir. Dealerul crede că s-a stricat, dă refresh, pierde tot.
//     După compresie: ~3 MB total, câteva secunde.
//
//  2. PROGRES REAL. `fetch()` nu raportează progresul încărcării. XMLHttpRequest
//     da — de aceea e folosit aici, deși e mai vechi. Fără procent real, orice
//     încărcare de peste zece secunde pare o pagină blocată.
//
//  3. CONFIRMARE LA ȘTERGERE. Ștergerea e definitivă și distruge fotografiile
//     din R2. Popup-ul cere o apăsare deliberată, nu una accidentală.
// ============================================================================

export const ADMIN_JS = `
(function(){
'use strict';

var MAX_W = 1600, QUALITY = 0.82, MAX_FILES = 13;

/* ── Contoare de caractere ─────────────────────────────────────────────── */
document.querySelectorAll('[data-count]').forEach(function(el){
  var box = el.closest('.af'), out = box && box.querySelector('.acount');
  if(!out) return;
  var max = parseInt(out.dataset.max, 10) || 100;
  function upd(){
    var n = el.value.length;
    out.textContent = n + '/' + max;
    out.className = 'acount' + (n > max ? ' over' : n > max * 0.85 ? ' near' : '');
  }
  el.addEventListener('input', upd); upd();
});

/* ── Marcă → model ────────────────────────────────────────────────────── */
var bs = document.getElementById('brand-sel'), ms = document.getElementById('model-sel');
if(bs && ms){
  function loadModels(keep){
    var id = bs.value;
    document.getElementById('brand-name').value =
      bs.options[bs.selectedIndex] ? (bs.options[bs.selectedIndex].dataset.name || '') : '';
    if(!id){ ms.innerHTML = '<option value="">Alege întâi marca</option>'; ms.disabled = true; return; }
    ms.disabled = true;
    ms.innerHTML = '<option value="">Se încarcă...</option>';
    fetch('/api/automobiles?brand_id=' + encodeURIComponent(id))
      .then(function(r){ return r.json(); })
      .then(function(d){
        var list = (d && d.carModels) || [];
        ms.innerHTML = '<option value="">Alege modelul...</option>';
        list.forEach(function(m){
          var o = document.createElement('option');
          o.value = m.id; o.textContent = m.name; o.dataset.name = m.name;
          if(keep && String(keep) === String(m.id)) o.selected = true;
          ms.appendChild(o);
        });
        ms.disabled = false;
        syncModelName();
      })
      .catch(function(){
        ms.innerHTML = '<option value="">Eroare la încărcare</option>';
        ms.disabled = false;
      });
  }
  function syncModelName(){
    var o = ms.options[ms.selectedIndex];
    document.getElementById('model-name').value = o ? (o.dataset.name || o.textContent) : '';
  }
  bs.addEventListener('change', function(){ loadModels(null); });
  ms.addEventListener('change', syncModelName);
  if(bs.value) loadModels(ms.dataset.current);
}

/* ── Previzualizarea iconiței de serviciu ──────────────────────────────── */
/* Iconițele sunt deja în pagină, în fiecare <select>. Le luăm de acolo la
   schimbare, în loc să cerem serverul — sunt 16 SVG-uri statice. */
[].slice.call(document.querySelectorAll('.svc-edit-icon select')).forEach(function(sel){
  sel.addEventListener('change', function(){
    var host = sel.parentNode.querySelector('.svc-edit-preview');
    if(!host) return;
    // Cerem markup-ul de la server o singură dată, prin reîncărcarea paginii
    // după salvare. Până atunci, marcăm vizual că s-a schimbat.
    host.style.opacity = '.45';
    host.title = 'Iconița se actualizează după salvare';
  });
});

/* ── Actualizarea listei de mașini ─────────────────────────────────────── */
var reloadBtn = document.getElementById('reload-btn');
if(reloadBtn){
  reloadBtn.addEventListener('click', function(){
    reloadBtn.disabled = true;
    var ico = reloadBtn.querySelector('.reload-ico');
    if(ico) ico.classList.add('spin');
    // Fără parametrii de mesaj din URL: altfel „Anunț publicat" reapare la
    // fiecare actualizare, deși nu s-a mai publicat nimic.
    window.location = window.location.pathname;
  });
}

/* Reîmprospătare automată cât timp există anunțuri în procesare.
   Pozele se optimizează în fundal, iar dealerul altfel ar trebui să apese
   refresh la nesfârșit ca să afle când e gata. Se oprește după 5 încercări
   (~2,5 minute) ca să nu reîncarce pagina la infinit dacă ceva s-a blocat. */
var procMsg = document.getElementById('processing-msg');
if(procMsg && procMsg.dataset.auto === '1'){
  var tries = parseInt(sessionStorage.getItem('cf_auto_reload') || '0', 10);
  if(tries < 5){
    setTimeout(function(){
      sessionStorage.setItem('cf_auto_reload', String(tries + 1));
      window.location = window.location.pathname;
    }, 30000);
  } else {
    var note = document.getElementById('auto-note');
    if(note) note.textContent = 'Durează mai mult decât de obicei. Apasă „Actualizează" peste câteva minute.';
  }
} else {
  sessionStorage.removeItem('cf_auto_reload');
}

/* ── Curățarea marcajului de eroare pe măsură ce se completează ────────── */
document.addEventListener('input', function(e){
  if(e.target.classList && e.target.classList.contains('is-invalid')) {
    e.target.classList.remove('is-invalid');
  }
}, true);
document.addEventListener('change', function(e){
  if(e.target.classList && e.target.classList.contains('is-invalid')) {
    e.target.classList.remove('is-invalid');
  }
}, true);

/* ── Județ → oraș ──────────────────────────────────────────────────────── */
/* Orașele vin dintr-un bloc JSON inline, nu dintr-un apel de rețea: lista e
   fixă, ~6 KB, iar un fetch în plus la fiecare deschidere de formular n-ar
   aduce nimic. */
var countySel = document.getElementById('county-sel');
var citySel   = document.getElementById('city-sel');
var locNode   = document.getElementById('loc-data');
if (countySel && citySel && locNode) {
  var LOC = {};
  try { LOC = JSON.parse(locNode.textContent); } catch (e) {}

  function fillCities(keep) {
    var list = LOC[countySel.value] || [];
    citySel.innerHTML = '';
    if (!countySel.value) {
      citySel.innerHTML = '<option value="">Alege întâi județul</option>';
      return;
    }
    var o0 = document.createElement('option');
    o0.value = ''; o0.textContent = 'Alege orașul...';
    citySel.appendChild(o0);
    list.forEach(function(c){
      var o = document.createElement('option');
      o.value = c; o.textContent = c;
      if (keep && keep === c) o.selected = true;
      citySel.appendChild(o);
    });
  }
  countySel.addEventListener('change', function(){ fillCities(null); });
  fillCities(citySel.dataset.current);
}

/* ── Combustibil ⇄ capacitate ──────────────────────────────────────────── */
/* Oglindește comportamentul din aplicație: alegerea unuia îl setează pe
   celălalt. Serverul verifică oricum coerența, deci asta e doar comoditate —
   nu o poate ocoli cineva care manipulează formularul. */
var fuelSel = document.getElementById('fuel-sel');
var capSel  = document.getElementById('cap-sel');
if (fuelSel && capSel) {
  var ELECTRIC_CAP = 'Fără (Electric)';
  fuelSel.addEventListener('change', function(){
    if (fuelSel.value === 'Electric') { capSel.value = ELECTRIC_CAP; }
    else if (capSel.value === ELECTRIC_CAP) { capSel.value = ''; }
  });
  capSel.addEventListener('change', function(){
    if (capSel.value === ELECTRIC_CAP) { fuelSel.value = 'Electric'; }
    else if (fuelSel.value === 'Electric') { fuelSel.value = ''; }
  });
}

/* ── Compresie ─────────────────────────────────────────────────────────── */
function compress(file){
  return new Promise(function(resolve){
    // Videoclipurile trec neatinse: nu pot fi comprimate în browser, iar
    // serverul le transcodează oricum cu ffmpeg.
    if(!file.type.indexOf('video')) return resolve(file);
    if(file.type.indexOf('image') !== 0) return resolve(file);

    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function(){
      try{
        var r = Math.min(MAX_W / img.naturalWidth, MAX_W / img.naturalHeight, 1);
        var w = Math.round(img.naturalWidth * r), h = Math.round(img.naturalHeight * r);
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var x = c.getContext('2d');
        x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
        // Fundal alb: JPEG nu are canal alfa, iar fără asta transparența devine NEAGRĂ.
        x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
        x.drawImage(img, 0, 0, w, h);
        c.toBlob(function(b){
          URL.revokeObjectURL(url);
          if(!b || b.size >= file.size) return resolve(file);
          resolve(new File([b], file.name.replace(/\\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }));
        }, 'image/jpeg', QUALITY);
      }catch(e){ URL.revokeObjectURL(url); resolve(file); }
    };
    img.onerror = function(){ URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

function kb(n){ return n < 1048576 ? Math.round(n/1024) + ' KB' : (n/1048576).toFixed(1) + ' MB'; }

/* ── Selecția fișierelor ───────────────────────────────────────────────── */
var inp = document.getElementById('files'), thumbs = document.getElementById('thumbs');
var info = document.getElementById('files-info');
var picked = [];

if(inp && thumbs){
  inp.addEventListener('change', function(){
    var files = Array.prototype.slice.call(inp.files);
    inp.value = '';
    if(!files.length) return;

    if(picked.length + files.length > MAX_FILES){
      alert('Maxim ' + MAX_FILES + ' fișiere. Ai deja ' + picked.length + '.');
      files = files.slice(0, MAX_FILES - picked.length);
    }
    var videos = picked.filter(function(f){ return f.type.indexOf('video') === 0; }).length;

    info.textContent = 'Se pregătesc pozele...';
    Promise.all(files.map(function(f){
      if(f.type.indexOf('video') === 0){
        if(videos >= 1){ return null; }
        videos++;
      }
      return compress(f);
    })).then(function(out){
      out.forEach(function(f){ if(f) picked.push(f); });
      render();
    });
  });

  function render(){
    thumbs.innerHTML = '';
    var total = 0;
    picked.forEach(function(f, i){
      total += f.size;
      var d = document.createElement('div'); d.className = 'th';
      if(f.type.indexOf('video') === 0){
        d.innerHTML = '<div class="th-v">▶</div>';
      }else{
        var im = document.createElement('img');
        im.src = URL.createObjectURL(f);
        im.onload = function(){ URL.revokeObjectURL(im.src); };
        d.appendChild(im);
      }
      var n = document.createElement('span');
      n.className = 'th-n'; n.textContent = i === 0 ? 'copertă' : (i + 1);
      d.appendChild(n);
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'th-x'; b.textContent = '×';
      b.setAttribute('aria-label', 'Elimină');
      b.onclick = function(){ picked.splice(i, 1); render(); };
      d.appendChild(b);
      thumbs.appendChild(d);
    });
    info.textContent = picked.length
      ? picked.length + ' fișiere · ' + kb(total) + ' după optimizare'
      : '';
  }
}

/* ── Trimiterea formularului, cu progres ───────────────────────────────── */
var form = document.getElementById('car-form');
if(form){
  form.addEventListener('submit', function(e){
    e.preventDefault();
    var isNew = form.dataset.mode === 'new';

    /* ── Verificarea proprie a câmpurilor ──────────────────────────────────
       Formularul are novalidate: bulele native apar sub antetul sticky și pe
       iOS Safari lipsesc complet la select. Aici arătăm TOATE câmpurile lipsă
       deodată, ca listă de linkuri, și marcăm fiecare câmp în roșu. */
    var box   = document.getElementById('form-errors');
    var title = document.getElementById('form-errors-title');
    var list  = document.getElementById('form-errors-list');
    var problems = [];

    // Etichetă lizibilă: textul din <span> al câmpului, fără contorul de caractere.
    function labelOf(el){
      var wrap = el.closest('.af');
      var sp = wrap && wrap.querySelector('span');
      if(!sp) return el.name || 'Câmp';
      var clone = sp.cloneNode(true);
      var c = clone.querySelector('.acount');
      if(c) c.remove();
      return clone.textContent.trim();
    }

    form.querySelectorAll('.is-invalid').forEach(function(el){ el.classList.remove('is-invalid'); });

    form.querySelectorAll('[required]').forEach(function(el){
      // Câmpurile dezactivate nu se validează (ex. modelul, până se alege marca).
      if(el.disabled) return;
      if(String(el.value || '').trim() === ''){
        el.classList.add('is-invalid');
        problems.push({ el: el, text: labelOf(el) });
      }
    });

    // Depășirile de lungime: le prinde și serverul, dar mai bine aici.
    form.querySelectorAll('[data-count]').forEach(function(el){
      var wrap = el.closest('.af'), out = wrap && wrap.querySelector('.acount');
      var max = out ? parseInt(out.dataset.max, 10) : 0;
      if(max && el.value.length > max){
        el.classList.add('is-invalid');
        problems.push({ el: el, text: labelOf(el) + ' — prea lung (' + el.value.length + '/' + max + ')' });
      }
    });

    if(isNew && picked.length === 0){
      problems.push({ el: document.getElementById('files'), text: 'Cel puțin o fotografie' });
    }

    if(problems.length){
      title.textContent = problems.length === 1
        ? 'Mai lipsește un câmp:'
        : 'Mai lipsesc ' + problems.length + ' câmpuri:';
      list.innerHTML = '';
      problems.forEach(function(p){
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = '#';
        a.textContent = p.text;
        a.onclick = function(ev){
          ev.preventDefault();
          if(!p.el) return;
          var target = p.el.id === 'files' ? p.el.closest('.ac') : p.el;
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if(p.el.focus && p.el.id !== 'files') setTimeout(function(){ p.el.focus(); }, 350);
        };
        li.appendChild(a);
        list.appendChild(li);
      });
      box.hidden = false;
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    box.hidden = true;

    var btn = document.getElementById('submit-btn');
    var bar = document.getElementById('pbar'), pinfo = document.getElementById('pinfo');
    var fd = new FormData(form);
    fd.delete('mediaFiles');
    picked.forEach(function(f){ fd.append('mediaFiles', f); });

    btn.disabled = true; btn.textContent = 'Se trimite...';
    bar.hidden = false; pinfo.hidden = false;
    var fill = bar.querySelector('i');

    var xhr = new XMLHttpRequest();
    xhr.open('POST', form.action, true);
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

    // XMLHttpRequest, nu fetch: doar el raportează progresul încărcării.
    xhr.upload.onprogress = function(ev){
      if(!ev.lengthComputable) return;
      var p = Math.round(ev.loaded / ev.total * 100);
      fill.style.width = p + '%';
      pinfo.textContent = p < 100
        ? 'Se încarcă... ' + p + '%'
        : 'Se procesează pe server...';
    };
    xhr.onload = function(){
      var d = {};
      try{ d = JSON.parse(xhr.responseText); }catch(err){}
      if(xhr.status >= 200 && xhr.status < 300 && d.success){
        window.location = d.redirect || '/admin/masini';
        return;
      }
      bar.hidden = true; pinfo.hidden = true;
      btn.disabled = false; btn.textContent = isNew ? 'Publică anunțul' : 'Salvează modificările';
      alert((d.errors && d.errors.join('\\n')) || d.message || 'Eroare la trimitere. Încearcă din nou.');
    };
    xhr.onerror = function(){
      bar.hidden = true; pinfo.hidden = true;
      btn.disabled = false; btn.textContent = isNew ? 'Publică anunțul' : 'Salvează modificările';
      alert('Conexiune întreruptă. Verifică internetul și încearcă din nou.');
    };
    xhr.send(fd);
  });
}

/* ── Bannerul din setări ───────────────────────────────────────────────── */
var bIn = document.getElementById('banner'), bTh = document.getElementById('banner-thumb');
if(bIn && bTh){
  bIn.addEventListener('change', function(){
    var f = bIn.files[0]; if(!f) return;
    compress(f).then(function(out){
      var dt = new DataTransfer(); dt.items.add(out); bIn.files = dt.files;
      bTh.innerHTML = '';
      var d = document.createElement('div'); d.className = 'th';
      var im = document.createElement('img'); im.src = URL.createObjectURL(out);
      d.appendChild(im);
      var n = document.createElement('span'); n.className = 'th-n'; n.textContent = kb(out.size);
      d.appendChild(n); bTh.appendChild(d);
    });
  });
}

/* ── Ștergere, cu confirmare ───────────────────────────────────────────── */
document.querySelectorAll('[data-del]').forEach(function(b){
  b.addEventListener('click', function(){
    var id = b.dataset.del, name = b.dataset.name || 'acest anunț';
    var ov = document.createElement('div');
    ov.className = 'ov';
    ov.innerHTML =
      '<div class="ov-b">' +
      '<h3>Ștergi definitiv?</h3>' +
      '<p><strong>' + name.replace(/</g,'&lt;') + '</strong><br><br>' +
      'Anunțul și toate fotografiile lui se șterg definitiv, de pe site și din ' +
      'aplicația CarFlip. <strong>Nu există recuperare.</strong></p>' +
      '<div class="arow-btn">' +
      '<button class="b b-danger" id="ov-yes">Șterge definitiv</button>' +
      '<button class="b b-ghost" id="ov-no">Renunță</button>' +
      '</div></div>';
    document.body.appendChild(ov);
    document.getElementById('ov-no').onclick = function(){ ov.remove(); };
    ov.onclick = function(e){ if(e.target === ov) ov.remove(); };
    document.getElementById('ov-yes').onclick = function(){
      var f = document.getElementById('del-form');
      f.action = '/admin/masina/' + id + '/sterge';
      f.submit();
    };
  });
});

})();`;

export default { ADMIN_JS };
