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
    if(isNew && picked.length === 0){
      alert('Adaugă cel puțin o fotografie.');
      return;
    }
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
