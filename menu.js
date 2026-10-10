/* Meniu comun și permisiuni pe aplicații, folosit de index.html, distante.html și setari.html.
 *
 * Permisiuni (din allowedUsers/{email} în Firestore; aceeași logică e impusă de firestore.rules pentru date):
 *  - administratorul principal și conturile cu role == 'admin' au acces la tot, inclusiv Setări;
 *  - alte conturi au acces la aplicațiile bifate în câmpul apps = {titluri: bool, distante: bool}
 *    (dacă `apps` lipsește, au acces la ambele).
 * Ascunderea din meniu e doar interfață: datele titlurilor sunt protejate de regulile Firestore.
 */
(function(){
  const OWNER_EMAIL = 'borleavasi@gmail.com';

  const ITEMS = [
    {key: 'titluri',  title: 'Titluri',          desc: 'Registrul titlurilor de proprietate', href: '/?view=titluri'},
    {key: 'distante', title: 'Distanțe corecte', desc: 'Calculează distanțele laturilor din punctele TopoLT', href: '/distante.html'},
    {key: 'setari',   title: 'Setări',           desc: 'Conturi cu acces și permisiuni', href: '/setari.html'}
  ];

  function allowed(perms, key){
    if(!perms || !perms.member) return false;
    return key === 'setari' ? !!perms.admin : !!perms[key];
  }

  async function loadPerms(db, user){
    const email = ((user && user.email) || '').toLowerCase();
    const none = {email, member: false, owner: false, admin: false, titluri: false, distante: false};
    if(!email) return none;
    if(email === OWNER_EMAIL) return {email, member: true, owner: true, admin: true, titluri: true, distante: true};
    try{
      const d = await db.collection('allowedUsers').doc(email).get();
      if(!d.exists) return none;
      const data = d.data() || {};
      const admin = data.role === 'admin';
      const apps = data.apps || null;
      const has = k => admin || (apps ? apps[k] === true : true);
      return {email, member: true, owner: false, admin, titluri: has('titluri'), distante: has('distante')};
    }catch(e){
      return none;
    }
  }

  // ---- Submeniul (dropdown) de sub butonul „☰ Meniu” ----
  let panel = null, anchor = null, options = null, wired = false;

  function injectStyle(){
    if(document.getElementById('appmenu-style')) return;
    const s = document.createElement('style');
    s.id = 'appmenu-style';
    s.textContent = `
      .appmenu-panel{position:fixed; z-index:100000; width:340px; max-width:calc(100vw - 16px); background:var(--card,#fff);
        border:1px solid var(--line-strong,rgba(35,48,43,.28)); border-radius:6px; padding:8px;
        box-shadow:0 10px 28px rgba(35,48,43,.28); font-family:var(--serif,Georgia,serif);}
      .appmenu-item{display:flex; flex-direction:column; gap:3px; padding:11px 14px; border-radius:4px; text-decoration:none;
        color:var(--ink,#23302B); border:1px solid transparent;}
      .appmenu-item + .appmenu-item{margin-top:4px;}
      .appmenu-item:hover, .appmenu-item:focus-visible{background:var(--moss,#4B6B4A); color:#fff; outline:none;}
      .appmenu-item.current{border-color:var(--gold,#F3911A); background:rgba(243,145,26,.08);}
      .appmenu-item.current:hover, .appmenu-item.current:focus-visible{background:var(--moss,#4B6B4A);}
      .appmenu-title{font-size:18px; font-weight:600;}
      .appmenu-desc{font-family:var(--mono,Consolas,monospace); font-size:11px; opacity:.85;}
      .appmenu-badge{font-family:var(--mono,Consolas,monospace); font-size:10px; font-weight:700; text-transform:uppercase;
        letter-spacing:.6px; color:var(--gold,#F3911A);}
      .appmenu-item:hover .appmenu-badge, .appmenu-item:focus-visible .appmenu-badge{color:#fff;}
    `;
    document.head.appendChild(s);
  }

  function close(){
    if(panel){ panel.remove(); panel = null; }
    if(anchor) anchor.setAttribute('aria-expanded', 'false');
  }

  function open(){
    close();
    injectStyle();
    panel = document.createElement('div');
    panel.className = 'appmenu-panel';
    panel.setAttribute('role', 'menu');
    const perms = options.perms;
    for(const it of ITEMS){
      if(!allowed(perms, it.key)) continue;
      const a = document.createElement('a');
      a.className = 'appmenu-item' + (it.key === options.current ? ' current' : '');
      a.href = it.href;
      a.setAttribute('role', 'menuitem');
      a.innerHTML = (it.key === options.current ? '<span class="appmenu-badge">pagina curentă</span>' : '') +
        `<span class="appmenu-title">${it.title}</span><span class="appmenu-desc">${it.desc}</span>`;
      if(it.key === options.current){
        a.addEventListener('click', (e)=>{ e.preventDefault(); close(); });
      }
      panel.appendChild(a);
    }
    document.body.appendChild(panel);
    const r = anchor.getBoundingClientRect();
    const w = panel.offsetWidth;
    panel.style.top = (r.bottom + 6) + 'px';
    panel.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
    anchor.setAttribute('aria-expanded', 'true');
    const first = panel.querySelector('a');
    if(first) first.focus({preventScroll: true});
  }

  // btn = butonul „☰ Meniu”; opts = {current: 'titluri'|'distante'|'setari', perms}
  function mount(btn, opts){
    anchor = btn;
    options = opts;
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    if(wired) return;
    wired = true;
    btn.addEventListener('click', (e)=>{
      e.preventDefault();
      e.stopPropagation();
      panel ? close() : open();
    });
    document.addEventListener('click', (e)=>{
      if(panel && !panel.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) close();
    });
    document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') close(); });
    window.addEventListener('resize', close);
  }

  window.AppMenu = {OWNER_EMAIL, ITEMS, allowed, loadPerms, mount, close};
})();
