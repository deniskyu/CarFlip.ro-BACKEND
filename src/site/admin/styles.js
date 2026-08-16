// ============================================================================
//  src/site/admin/stylesAdmin.js
// ----------------------------------------------------------------------------
//  REDENUMIT din `styles.js` ca să nu se confunde cu `src/site/styles.js`,
//  care e foaia de stil a SITE-URILOR publice. Sunt două fișiere complet
//  diferite, cu roluri diferite:
//
//    src/site/styles.js        → site-urile dealerilor (public, 6 presetări)
//    src/site/admin/stylesAdmin.js → panoul dealerului (privat, temă unică)
// ----------------------------------------------------------------------------
//  Foaia de stil a panoului dealerului. Independentă de tema site-ului:
//  panoul e o unealtă de lucru, nu o vitrină. Aceeași interfață pentru toate
//  parcurile, indiferent de presetarea aleasă.
//
//  ── MOBILE-FIRST, DIN NECESITATE ──────────────────────────────────────────
//  Dealerul face pozele cu telefonul, în parc, lângă mașină. Dacă trebuie să
//  ajungă la laptop ca să adauge un anunț, panoul moare în două săptămâni.
//  Toate țintele de atingere au minimum 46px.
// ============================================================================

export const ADMIN_CSS = `
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:#f4f4f5;color:#18181b;font-size:16px;line-height:1.55;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  -webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;
  padding-bottom:env(safe-area-inset-bottom,0)}
img{display:block;max-width:100%}
a{color:inherit;text-decoration:none}
button{font:inherit;cursor:pointer}
h1,h2,h3{margin:0;line-height:1.2}

.aw{width:min(920px,100% - 1.6rem);margin-inline:auto}

/* ── Antet ─────────────────────────────────────────────────────────────── */
.ah{position:sticky;top:0;z-index:30;background:#18181b;color:#fff;
  box-shadow:0 1px 3px rgba(0,0,0,.2)}
.ah-in{display:flex;align-items:center;gap:.75rem;min-height:58px}
.ah-logo{width:34px;height:34px;border-radius:50%;background:#fff;object-fit:contain;padding:2px}
.ah-name{font-weight:700;font-size:.95rem;flex:1;min-width:0;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ah-name span{display:block;font-weight:400;font-size:.72rem;opacity:.55}
.ah-out{padding:.45rem .8rem;border-radius:8px;border:1px solid #3f3f46;
  background:none;color:#d4d4d8;font-size:.82rem}
.ah-out:hover{border-color:#71717a;color:#fff}

.an{display:flex;gap:.3rem;overflow-x:auto;background:#27272a;
  padding:0 .8rem;scrollbar-width:none}
.an::-webkit-scrollbar{display:none}
.an a{padding:.85rem .9rem;color:#a1a1aa;font-size:.9rem;font-weight:600;
  border-bottom:3px solid transparent;white-space:nowrap}
.an a[aria-current]{color:#fff;border-bottom-color:#60a5fa}

/* ── Structură ─────────────────────────────────────────────────────────── */
.ap{padding-block:1.3rem 3rem}
.ac{background:#fff;border:1px solid #e4e4e7;border-radius:14px;
  padding:1.1rem;margin-bottom:1rem}
.ac h2{font-size:1.05rem;margin-bottom:.9rem}
.ahead{display:flex;flex-wrap:wrap;gap:.8rem;align-items:center;
  justify-content:space-between;margin-bottom:1.1rem}
.ahead h1{font-size:1.35rem}
.amuted{color:#71717a;font-size:.87rem}

/* ── Formulare ─────────────────────────────────────────────────────────── */
.af{display:block;margin-bottom:.95rem}
.af>span{display:flex;justify-content:space-between;align-items:baseline;
  font-size:.8rem;font-weight:700;color:#52525b;margin-bottom:.35rem}
.af input,.af select,.af textarea{
  width:100%;padding:.75rem .85rem;min-height:46px;
  border:1px solid #d4d4d8;border-radius:10px;background:#fff;
  color:#18181b;font-size:16px;font-family:inherit;
}
.af textarea{resize:vertical;min-height:110px;line-height:1.55}
.af input:focus,.af select:focus,.af textarea:focus{
  outline:none;border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.12)}
.af small{display:block;color:#71717a;font-size:.76rem;margin-top:.3rem;line-height:1.5}
.arow{display:grid;gap:.85rem;grid-template-columns:1fr}
@media(min-width:640px){.arow{grid-template-columns:1fr 1fr}.arow-3{grid-template-columns:1fr 1fr 1fr}}
.acount{font-weight:400;color:#a1a1aa;font-size:.75rem}
.acount.near{color:#b45309}
.acount.over{color:#dc2626;font-weight:700}
.achk{display:flex;align-items:center;gap:.6rem;padding:.7rem .2rem;font-size:.92rem}
.achk input{width:20px;height:20px;min-height:0;flex-shrink:0;accent-color:#2563eb}

/* ── Butoane ───────────────────────────────────────────────────────────── */
.b{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;
  padding:.8rem 1.3rem;min-height:46px;border-radius:10px;border:1px solid transparent;
  font-size:.94rem;font-weight:700;transition:background .12s,border-color .12s}
.b:disabled{opacity:.5;cursor:default}
.b-pri{background:#2563eb;color:#fff}
.b-pri:hover:not(:disabled){background:#1d4ed8}
.b-ghost{border-color:#d4d4d8;color:#3f3f46;background:#fff}
.b-ghost:hover:not(:disabled){border-color:#a1a1aa}
.b-danger{background:#dc2626;color:#fff}
.b-danger:hover:not(:disabled){background:#b91c1c}
.b-full{width:100%}
.b-sm{padding:.5rem .8rem;min-height:38px;font-size:.85rem}
.arow-btn{display:flex;gap:.6rem;flex-wrap:wrap}
.arow-btn .b{flex:1;min-width:130px}

/* ── Mesaje ────────────────────────────────────────────────────────────── */
.msg{padding:.85rem 1rem;border-radius:10px;font-size:.9rem;margin-bottom:1rem;line-height:1.55}
.msg-err{background:#fef2f2;border:1px solid #fecaca;color:#991b1b}
.msg-ok{background:#f0fdf4;border:1px solid #bbf7d0;color:#166534}
.msg-info{background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af}
.msg ul{margin:.4rem 0 0;padding-left:1.1rem}

/* ── Listă anunțuri ────────────────────────────────────────────────────── */
.alist{display:grid;gap:.8rem;grid-template-columns:1fr}
@media(min-width:700px){.alist{grid-template-columns:1fr 1fr}}
.ai{display:flex;gap:.85rem;background:#fff;border:1px solid #e4e4e7;
  border-radius:12px;padding:.7rem;align-items:flex-start}
.ai-img{width:96px;height:72px;flex-shrink:0;border-radius:8px;object-fit:cover;background:#e4e4e7}
.ai-b{flex:1;min-width:0}
.ai-t{font-weight:700;font-size:.93rem;line-height:1.35;margin-bottom:.2rem;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ai-m{color:#71717a;font-size:.79rem}
.ai-p{font-weight:800;color:#2563eb;font-size:1rem;margin-top:.25rem}
.ai-a{display:flex;gap:.4rem;margin-top:.55rem;flex-wrap:wrap}
.ai-a .b{flex:1;min-width:74px}
.tag{display:inline-block;padding:.15rem .5rem;border-radius:20px;
  font-size:.7rem;font-weight:700;background:#f4f4f5;color:#71717a;border:1px solid #e4e4e7}
.tag-warn{background:#fffbeb;color:#92400e;border-color:#fde68a}

/* ── Încărcare imagini ─────────────────────────────────────────────────── */
.up{border:2px dashed #d4d4d8;border-radius:12px;padding:1.6rem 1rem;
  text-align:center;background:#fafafa;cursor:pointer;display:block}
.up:hover{border-color:#2563eb;background:#f8fafc}
.up strong{display:block;font-size:.95rem;margin-bottom:.25rem}
.up span{color:#71717a;font-size:.82rem}
.thumbs{display:grid;gap:.5rem;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));
  margin-top:.8rem}
.th{position:relative;aspect-ratio:4/3;border-radius:8px;overflow:hidden;
  background:#e4e4e7;border:1px solid #d4d4d8}
.th img{width:100%;height:100%;object-fit:cover}
.th-x{position:absolute;top:3px;right:3px;width:24px;height:24px;border-radius:50%;
  background:rgba(0,0,0,.68);color:#fff;border:none;font-size:14px;line-height:1;
  display:flex;align-items:center;justify-content:center}
.th-n{position:absolute;left:3px;bottom:3px;padding:1px 6px;border-radius:20px;
  background:rgba(0,0,0,.68);color:#fff;font-size:.66rem;font-weight:700}
.th-v{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  color:#fff;font-size:22px;background:#3f3f46}

.pbar{height:7px;border-radius:20px;background:#e4e4e7;overflow:hidden;margin-top:.7rem}
.pbar i{display:block;height:100%;width:0;background:#2563eb;transition:width .2s}
.pinfo{font-size:.82rem;color:#52525b;margin-top:.4rem;text-align:center}

/* ── Login ─────────────────────────────────────────────────────────────── */
.lw{min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:1.2rem}
.lb{width:100%;max-width:390px;background:#fff;border:1px solid #e4e4e7;
  border-radius:16px;padding:1.6rem}
.lb-head{text-align:center;margin-bottom:1.4rem}
.lb-head img{width:60px;height:60px;border-radius:50%;object-fit:contain;
  background:#fff;border:1px solid #e4e4e7;margin:0 auto .7rem;padding:3px}
.lb-head h1{font-size:1.15rem;margin-bottom:.2rem}
.lb-head p{color:#71717a;font-size:.85rem}
.lb-foot{margin-top:1.2rem;padding-top:1rem;border-top:1px solid #e4e4e7;
  text-align:center;font-size:.8rem;color:#a1a1aa;line-height:1.6}
.lb-foot a{color:#2563eb}

/* ── Confirmare ștergere ───────────────────────────────────────────────── */
.ov{position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.55);
  display:flex;align-items:center;justify-content:center;padding:1.2rem}
.ov-b{background:#fff;border-radius:14px;padding:1.4rem;max-width:400px;width:100%}
.ov-b h3{font-size:1.05rem;margin-bottom:.6rem;color:#991b1b}
.ov-b p{font-size:.9rem;color:#3f3f46;margin-bottom:1.1rem;line-height:1.6}

/* ── Editorul de servicii ──────────────────────────────────────────────── */
.svc-edit{
  border:1px solid #e4e4e7;
  border-radius:12px;
  padding:1rem;
  margin-bottom:.9rem;
  background:#fafafa;
}
.svc-edit-head{
  display:flex;
  align-items:center;
  gap:.7rem;
  margin-bottom:.9rem;
}
.svc-edit-no{
  width:26px;height:26px;flex-shrink:0;
  border-radius:50%;
  background:#e4e4e7;
  color:#52525b;
  font-size:13px;font-weight:700;
  display:flex;align-items:center;justify-content:center;
}
.svc-edit-icon{
  display:flex;align-items:center;gap:.6rem;
  flex:1;min-width:0;
}
.svc-edit-preview{
  display:inline-flex;align-items:center;justify-content:center;
  width:38px;height:38px;flex-shrink:0;
  border-radius:10px;
  background:#e0edff;
  color:#2563eb;
}
.svc-edit-icon select{
  flex:1;min-width:0;
  padding:.6rem .7rem;min-height:42px;
  border:1px solid #d4d4d8;border-radius:10px;
  background:#fff;font-size:15px;
}
.svc-edit .af:last-child{ margin-bottom:0; }

/* ── Câmpuri invalide ──────────────────────────────────────────────────── */
.af input.is-invalid, .af select.is-invalid, .af textarea.is-invalid{
  border-color:#dc2626;
  background:#fef2f2;
  box-shadow:0 0 0 3px rgba(220,38,38,.10);
}

/* Sumarul de erori. 'scroll-margin-top' compensează antetul sticky: fără el,
   derularea către un câmp l-ar ascunde exact sub bara de sus. */
#form-errors{ scroll-margin-top:120px; }
#form-errors ul{ margin:.5rem 0 0; padding-left:1.15rem; }
#form-errors li{ margin-bottom:.3rem; }
#form-errors a{
  color:#991b1b;
  text-decoration:underline;
  text-underline-offset:2px;
}
#form-errors a:hover{ color:#7f1d1d; }
.af, .ac{ scroll-margin-top:120px; }

/* ── Butonul de actualizare ────────────────────────────────────────────── */
.reload-ico{ display:inline-block; font-size:1.05em; line-height:1; }
.reload-ico.spin{ animation:cf-spin 700ms linear infinite; }
@keyframes cf-spin{ to{ transform:rotate(360deg); } }

@media(prefers-reduced-motion:reduce){
  .reload-ico.spin{ animation:none; }
}

@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;

export default { ADMIN_CSS };