/* ════════════════════════════════════════════════════════
   CONFIG
════════════════════════════════════════════════════════ */
const API = 'https://link-cf-backend.dlsudhssc.workers.dev';

async function apiGet(params={}){
  const qs=new URLSearchParams(params).toString();
  const r=await fetch(`${API}?${qs}`);
  return r.json();
}
let _authWarned=false;
async function apiPost(body={}){
  // Signed-in staff requests carry a random session token (kept in memory only —
  // never in localStorage, and the password is never re-sent after login).
  if(typeof S!=='undefined'&&S.user&&S.user.token){body={...body,authToken:S.user.token}}
  const r=await fetch(API,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify(body)});
  const t=await r.text();
  let res;
  try{res=JSON.parse(t)}catch{res={ok:false,error:'Unexpected server response.'}}
  if(r.status===429&&res&&res.error)toast(res.error,'warn');
  if(res&&res.error==='unauthorized'&&typeof S!=='undefined'&&S.user&&S.user.token&&!_authWarned){
    _authWarned=true;
    toast('Your session expired. Please sign in again.','warn');
    setTimeout(()=>{try{doLogout()}catch(e){}},1200);
  }
  return res;
}

/* ── Output-safety helpers ─────────────────────────────────────────────
   Anything that came from the server (or from a student) and is placed
   into innerHTML MUST go through these:
     escHtml(x)   text  -> safe HTML text / attribute value
     safeUrl(u)   only http(s) URLs survive; quotes/spaces are %-encoded
     safeImg(u)   same, but also allows data:image/... previews
     safeVideo(u) only youtube.com/embed/<id>
     jsArg(x)     a value as a JS string literal inside an onclick="..."   */
function safeUrl(u){
  const s=String(u==null?'':u).trim();
  if(!/^https?:\/\//i.test(s))return '';
  return s.replace(/[\s"'<>`\\]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase().padStart(2,'0'));
}
function safeImg(u){
  const s=String(u==null?'':u).trim();
  if(/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(s))return s;
  return safeUrl(s);
}
function safeVideo(u){return /^https:\/\/www\.youtube\.com\/embed\/[A-Za-z0-9_-]{11}$/.test(String(u||''))?String(u):''}
function jsArg(x){return escHtml(JSON.stringify(String(x==null?'':x)))}

/* Guests have no account, so each browser gets a random ID that identifies
   it as one "user" for likes. Stored locally; cleared if site data is cleared. */
function getClientId(){
  try{
    let id=localStorage.getItem('dlinkClientId');
    if(!id||!/^[A-Za-z0-9_-]{8,64}$/.test(id)){
      id=(window.crypto&&crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2,12)).replace(/[^A-Za-z0-9_-]/g,'');
      localStorage.setItem('dlinkClientId',id);
    }
    return id;
  }catch(e){
    window._memClientId=window._memClientId||('m'+Math.random().toString(36).slice(2,14)+Date.now().toString(36));
    return window._memClientId;
  }
}

/* ════════════════════════════════════════════════════════
   LOCAL AUTH 
════════════════════════════════════════════════════════ */
const GUEST_STUDENT={username:'guest',pass:'',role:'student',name:'Student',initial:'S'};

/* Always show exactly one initial (first letter of the first name),
   regardless of what's stored — profile pics should never show 2 letters. */
function firstInitial(name){
  const s=(name||'').trim();
  return s?s.charAt(0).toUpperCase():'?';
}
let adminLoginRole='council';

/* ════════════════════════════════════════════════════════
   NAV 
════════════════════════════════════════════════════════ */
const NAV={
  student:[
    {id:'home',              icon:'fa-house',            label:'Home'},
    {id:'animo-voice',       icon:'fa-bell',             label:'Animo Voice'},
    {id:'sw-care',           icon:'fa-heart-pulse',      img:'assets/swc.png',            label:'SWCare Desk'},
    {id:'lasallian-insights',icon:'fa-star',             img:'assets/lasallian-star.png', label:'Lasallian Insights'},
    {id:'hssc-info',         icon:'fa-building-columns', img:'assets/sc.png',             label:'HS SC Information'},
    {id:'resources',         icon:'fa-folder-open',      label:'Resources'},
    {id:'settings',          icon:'fa-gear',             label:'Settings'},
  ],
  council:[
    {id:'home',              icon:'fa-house',            label:'Home'},
    {id:'animo-voice',       icon:'fa-bell',             label:'Animo Voice'},
    {id:'council-dash',      icon:'fa-chart-line',       label:'HSSC Dashboard'},
    {id:'lasallian-insights',icon:'fa-star',             img:'assets/lasallian-star.png', label:'Lasallian Insights'},
    {id:'hssc-info',         icon:'fa-building-columns', img:'assets/sc.png',             label:'HS SC Information'},
    {id:'resources',         icon:'fa-folder-open',      label:'Resources'},
    {id:'settings',          icon:'fa-gear',             label:'Settings'},
  ],
  admin:[
    {id:'home',              icon:'fa-house',            label:'Home'},
    {id:'admin',             icon:'fa-calendar-check',   label:'Appointments'},
    {id:'admin-about',       icon:'fa-circle-info',      label:'About SWC'},
    {id:'admin-counselors',  icon:'fa-user-doctor',      label:'Counselors'},
    {id:'settings',          icon:'fa-gear',             label:'Settings'},
  ],
};

/* ════════════════════════════════════════════════════════
   STATIC DATA
════════════════════════════════════════════════════════ */
const MEMBERS=[
  {name:'Jodie Estrella',   role:'President',            i:'JE'},
  {name:'Jones Sadiasa',    role:'Vice President',       i:'JS'},
  {name:'Edriah Milaor',    role:'Secretary',            i:'EM'},
  {name:'Soo Min Lee',      role:'Treasurer',            i:'SL'},
  {name:'James Dacillo',    role:'Auditor',              i:'JD'},
  {name:'Ashley Gado',      role:'Business Manager',     i:'AG'},
  {name:'Rhian Siton',      role:'Internal P.R.O.',      i:'RS'},
  {name:'Eleeyah Esguerra', role:'External P.R.O.',      i:'EE'},
  /* Representatives: alphabetical by strand, JHS last */
  {name:'Zna Soriano',      role:'ABM Representative',   i:'ZS'},
  {name:'Danielle Torres',  role:'ARD Representative',   i:'DT'},
  {name:'Winona Mercene',   role:'CUT Representative',   i:'WM'},
  {name:'Hailey Oppus',     role:'HUMSS Representative', i:'HO'},
  {name:'Miguel Cajigas',   role:'ICT Representative',   i:'MC'},
  {name:'Jean Barrientos',  role:'SPR Representative',   i:'JB'},
  {name:'Mhikaela Bonayon', role:'STEM Representative',  i:'MB'},
  {name:'Sofia Santarin',   role:'JHS Representative',   i:'SS'},
];

/* Guidance counselors are loaded from the server (see loadCounselors) so the SWC can add / edit / remove them. */

const RESOURCES_SEED=[];

/* Events are loaded from the server (see loadEvents) so the Council can add / edit / archive / delete them. */

const ALL_SLOTS=['7:00 AM','8:00 AM','9:00 AM','10:00 AM','11:00 AM','1:00 PM','2:00 PM','3:00 PM','4:00 PM'];

/* ════════════════════════════════════════════════════════
   STATE
════════════════════════════════════════════════════════ */
function freshState(){return {
  user:null,
  posts:[],concerns:[],evals:[],appointments:[],resources:[],team:{},events:[],showArchivedConcerns:false,showArchivedAppts:false,showArchivedEvents:false,editingEventId:null,
  bookedSlots:{},blocked:{},counselors:[],about:{},editingCounselorId:null,cnPhoto:'',cnPendingFile:null,aCalMonth:null,aCalYear:null,aCalSel:null,
  pendingImgs:[],
  calMonth:null,calYear:null,selectedDate:null,selectedTime:null,
  carouselImages:[],
  carouselIdx:0,
  carouselTimer:null,
  /* notification state */
  notifications:[],
  lastSeenPostId:null,
  notifOpen:false,
  menuOpen:false,
  sidebarOpen:false,
  /* person modal state */
  pmType:null, // 'member' | 'counselor'
  pmKey:null,
};}
let S=freshState();

function fmtTime(d){return d.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'})}
function fmtDate(d){const mm=String(d.getMonth()+1).padStart(2,'0');const dd=String(d.getDate()).padStart(2,'0');const yyyy=d.getFullYear();return `${mm}-${dd}-${yyyy}`}

/* ════════════════════════════════════════════════════════
   DARK MODE
════════════════════════════════════════════════════════ */
function toggleDarkMode(on){
  document.body.classList.toggle('dark-mode',on);
  localStorage.setItem('dlinkDark',on?'1':'0');
  updateDarkModeLoginLink();
}
function initDarkMode(){
  const saved=localStorage.getItem('dlinkDark');
  if(saved==='1')document.body.classList.add('dark-mode');
  updateDarkModeLoginLink();
}
/* Dark mode is chosen from the start screen (like "Forgot password?"),
   not from Settings. */
function toggleDarkModeFromLogin(){
  toggleDarkMode(!document.body.classList.contains('dark-mode'));
}
function updateDarkModeLoginLink(){
  const on=document.body.classList.contains('dark-mode');
  const link=document.getElementById('dark-mode-login-link');
  if(link)link.textContent=on?'Switch to light mode?':'Switch to dark mode?';
}

/* ════════════════════════════════════════════════════════
   SIDEBAR (mobile)
════════════════════════════════════════════════════════ */
function toggleSidebar(){
  S.sidebarOpen=!S.sidebarOpen;
  document.getElementById('sidebar').classList.toggle('open',S.sidebarOpen);
  document.getElementById('sidebar-overlay').classList.toggle('open',S.sidebarOpen);
}
function closeSidebar(){
  S.sidebarOpen=false;
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}

/* ════════════════════════════════════════════════════════
   WELCOME / ADMIN LOGIN UI
════════════════════════════════════════════════════════ */
function toggleAdminBox(){
  const box=document.getElementById('admin-login-box');
  box.style.display=box.style.display==='block'?'none':'block';
  hideAuthMessages();
}
function setAdminRole(role){
  adminLoginRole=role;
  document.getElementById('tab-role-council').classList.toggle('active',role==='council');
  document.getElementById('tab-role-admin').classList.toggle('active',role==='admin');
}

async function enterAsStudent(){
  S.user={...GUEST_STUDENT};
  document.getElementById('login-screen').style.display='none';
  document.getElementById('app').style.display='block';
  await initApp();
}

async function doLogin(){
  const u=document.getElementById('lu').value.trim();
  const p=document.getElementById('lp').value;
  const btn=document.getElementById('l-btn');
  hideAuthMessages();
  if(!u||!p){showAuthErr('Please enter your username and password.');return}
  btn.disabled=true;btn.innerHTML='<span class="spinner"></span> Signing in…';
  let authenticated=false,msg='';
  try{
    const res=await apiPost({action:'login',username:u,password:p});
    if(res&&res.ok&&res.token&&(res.role==='admin'||res.role==='council')){
      // Keep only what the UI needs. The password is NOT kept.
      S.user={username:res.username,role:res.role,name:res.name,initial:res.initial,avatar:res.avatar||'',token:res.token};
      authenticated=true;
    }else if(res&&res.error)msg=res.error;
  }catch(e){msg='Could not reach the server. Check your connection and try again.'}
  if(!authenticated){
    showAuthErr(msg||'Invalid username or password.');
    btn.disabled=false;btn.innerHTML='<i class="fa-solid fa-arrow-right-to-bracket"></i> Sign In';return;
  }
  document.getElementById('lp').value='';
  _authWarned=false;
  document.getElementById('login-screen').style.display='none';
  document.getElementById('app').style.display='block';
  await initApp();
  btn.disabled=false;btn.innerHTML='<i class="fa-solid fa-arrow-right-to-bracket"></i> Sign In';
}

function doLogout(){
  // Tell the server to kill this session (fire-and-forget), then wipe local state.
  try{if(S&&S.user&&S.user.token){fetch(API,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({action:'logout',authToken:S.user.token}),keepalive:true}).catch(()=>{})}}catch(e){}
  clearCarouselTimer();
  S=freshState();
  resetUI();
  _authWarned=false;
  document.getElementById('app').style.display='none';
  document.getElementById('login-screen').style.display='flex';
  document.getElementById('lu').value='';
  document.getElementById('lp').value='';
  document.getElementById('admin-login-box').style.display='none';
  closeMenuDropdown();
  closeSidebar();
  hideAuthMessages();
}

/* Council-only controls. They are shown for council and hidden for everyone
   else — both directions — so nothing leaks from a previous session. */
const STAFF_ONLY_IDS=['announce-composer','carousel-upload-ctrl','res-upload-card'];
function hideStaffControls(){
  STAFF_ONLY_IDS.forEach(id=>{const el=document.getElementById(id);if(el)el.classList.add('hidden')});
}

/* Run a step without letting one failure abort the whole startup/reset. */
function safeRun(fn,...args){try{return fn&&fn(...args)}catch(e){console.error('[safeRun]',fn&&fn.name,e)}}

/* Put the interface back to a clean, read-only, signed-out look. Called on
   logout and at the start of initApp so nothing from a previous session
   (staff buttons, open modals, rendered feeds) can linger. */
function resetUI(){
  document.querySelectorAll('.modal-overlay.open').forEach(m=>m.classList.remove('open'));
  hideStaffControls();
  const ac=document.querySelector('.tb-actions-col');if(ac)ac.classList.add('hidden');
  const iat=document.getElementById('insights-admin-tools');if(iat)iat.style.display='none';
  const sw=document.getElementById('sw-dashboard-btn-wrap');if(sw)sw.classList.add('hidden');
  const nav=document.getElementById('sidebar-nav');if(nav)nav.innerHTML='';
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const home=document.getElementById('page-home');if(home)home.classList.add('active');
  [renderPosts,renderCarousel,renderMembers,renderCounselors,renderInsights,renderResources,
   renderAppointmentsDashboard,renderAdminBookings,renderAdminCalendar,renderAdminDay].forEach(f=>safeRun(f));
}
function isCouncilUser(){return !!(S.user&&S.user.role==='council')}

function showAuthErr(msg){const e=document.getElementById('l-err');document.getElementById('l-err-msg').textContent=msg;e.style.display='flex'}
function showAuthSuccess(msg){const e=document.getElementById('l-success');document.getElementById('l-success-msg').textContent=msg;e.style.display='flex'}
function hideAuthMessages(){document.getElementById('l-err').style.display='none';document.getElementById('l-success').style.display='none'}

/* ════════════════════════════════════════════════════════
   MENU DROPDOWN (replaces sign-out button)
════════════════════════════════════════════════════════ */
function toggleMenuDropdown(){
  S.menuOpen=!S.menuOpen;
  document.getElementById('menu-dropdown').classList.toggle('open',S.menuOpen);
}
function closeMenuDropdown(){
  S.menuOpen=false;
  const d=document.getElementById('menu-dropdown');if(d)d.classList.remove('open');
}
function openAdminLoginFromMenu(){
  closeMenuDropdown();
  doLogout();
  setTimeout(()=>toggleAdminBox(),150);
}

/* ════════════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════════════ */
async function initApp(){
  const u=S.user;
  resetUI();
  initDarkMode();
  const isGuest=u.role==='student';
  const topAv=document.getElementById('top-av');
  document.getElementById('set-role').value=u.role==='admin'?'Administrator':u.role==='council'?'Student Council':'Student';
  refreshProfileUI();
  {
    // Staff can edit their own profile; guests see it read-only.
    const ed=!isGuest;
    document.getElementById('set-name').readOnly=!ed;
    document.getElementById('set-username').readOnly=!ed;
    ['set-name','set-username'].forEach(id=>{document.getElementById(id).style.background=ed?'':'var(--off)'});
    document.getElementById('avatar-controls').style.display=ed?'flex':'none';
    document.getElementById('set-curpw-wrap').style.display=ed?'':'none';
    document.getElementById('save-profile-btn').style.display=ed?'':'none';
    const iat=document.getElementById('insights-admin-tools');if(iat)iat.style.display=(u.role==='council')?'flex':'none';
    const ac=document.querySelector('.tb-actions-col');if(ac)ac.classList.toggle('hidden',u.role!=='council');
  }

  // Menu dropdown: show Sign Out only for council/admin; guests see Admin Login only
  // Sign Out is always available in the menu; Admin/Council Login only shows for guests
  document.getElementById('menu-signout').classList.remove('hidden');
  document.getElementById('menu-admin-login').classList.toggle('hidden',!isGuest);

  // Account/password sections only relevant for council/admin
  document.getElementById('password-section').classList.toggle('hidden',isGuest);
  {const pn=document.getElementById('pw-new');if(pn)pn.placeholder='Min. 8 characters'}

  // Build sidebar nav
  const nav=document.getElementById('sidebar-nav');
  nav.innerHTML='';
  const navItems=[...NAV[u.role]];if(u.role==='admin'){const aboutIndex=navItems.findIndex(n=>n.id==='admin-about');const counselorIndex=navItems.findIndex(n=>n.id==='admin-counselors');if(aboutIndex>=0&&counselorIndex>=0&&counselorIndex<aboutIndex){const [c]=navItems.splice(counselorIndex,1);navItems.splice(aboutIndex,0,c)}}
  navItems.forEach(n=>{
    const btn=document.createElement('button');
    btn.className='nav-item';btn.dataset.page=n.id;
    btn.innerHTML=n.img?`<span class="nav-ic has-logo"><img src="${n.img}" alt=""></span><span>${n.label}</span>`:`<span class="nav-ic"><i class="fa-solid ${n.icon}"></i></span><span>${n.label}</span>`;
    btn.onclick=()=>{navigate(n.id,btn);closeSidebar();};
    nav.appendChild(btn);
  });

  // Council/Admin composer — announcements & resource uploads are Council-only;
  // Admin (SWC) is restricted to the Appointments page only.
  hideStaffControls();
  if(u.role==='council'){
    STAFF_ONLY_IDS.forEach(id=>document.getElementById(id).classList.remove('hidden'));
    refreshProfileUI();
  }
  // Only Admin gets the "View Appointments" dashboard — Council must NOT see bookings
  if(u.role==='admin'){document.getElementById('sw-dashboard-btn-wrap').classList.remove('hidden')}
  else{document.getElementById('sw-dashboard-btn-wrap').classList.add('hidden')}

  [renderMembers,renderCounselors,renderInsights,initCalendar,initAdminCalendar].forEach(f=>safeRun(f));

  // Notification last-seen from storage
  S.lastSeenPostId=isGuest?null:(localStorage.getItem('dlinkLastSeen_'+u.username)||null);

  navigate(u.role==='admin'?'admin':'home');
  await Promise.all([loadPosts,loadConcerns,loadEvals,loadAppointments,loadCarousel,loadResources,loadTeam,loadEvents,loadCounselors,loadAbout].map(f=>Promise.resolve().then(f).catch(e=>console.error('[init]',f.name,e))));

  // Start polling for new posts every 60s (once per page load, not once per login)
  if(!window._pollTimer)window._pollTimer=setInterval(pollForNewPosts, 60000);

  // Close dropdowns when clicking outside (bound once)
  if(window._outsideClickBound)return;
  window._outsideClickBound=true;
  document.addEventListener('click', e=>{
    const bell=document.getElementById('notif-bell');
    const drop=document.getElementById('notif-dropdown');
    if(S.notifOpen && !bell.contains(e.target) && !drop.contains(e.target)){
      closeNotifDropdown();
    }
    const menuBtn=document.querySelector('.tb-logout');
    const menuDrop=document.getElementById('menu-dropdown');
    if(S.menuOpen && menuBtn && !menuBtn.contains(e.target) && !menuDrop.contains(e.target)){
      closeMenuDropdown();
    }
  });
}

/* ════════════════════════════════════════════════════════
   NAVIGATION
════════════════════════════════════════════════════════ */
function navigate(pageId,clickedBtn){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
  const pg=document.getElementById('page-'+pageId);
  if(pg){
    pg.classList.add('active');
    pg.classList.remove('page-enter');
    void pg.offsetWidth; // restart the CSS animation each visit
    pg.classList.add('page-enter');
    reanimateChildren(pg);
  }
  if(clickedBtn)clickedBtn.classList.add('active');
  else document.querySelectorAll('.nav-item').forEach(b=>{if(b.dataset.page===pageId)b.classList.add('active')});
  document.querySelector('.main').scrollTop=0;
  if(pageId==='admin-counselors')safeRun(loadCounselors);
  if(pageId==='admin-about')safeRun(loadAbout);
  if(pageId==='admin')safeRun(renderAdminCalendar);
  closeNotifDropdown();
  closeMenuDropdown();
}

/* Staggered entrance for cards/rows inside the page that just became active —
   purely cosmetic, safe no-op if none of these selectors exist on a page. */
function reanimateChildren(pageEl){
  const items=pageEl.querySelectorAll('.card,.stat-card,.tbl-wrap,.empty-state,.form-field');
  items.forEach((el,i)=>{
    el.classList.remove('stagger-in');
    el.style.setProperty('--stagger-i', Math.min(i,10));
    void el.offsetWidth;
    el.classList.add('stagger-in');
  });
}

/* ════════════════════════════════════════════════════════
   NOTIFICATIONS
════════════════════════════════════════════════════════ */
function buildNotifications(){
  S.notifications=[];
  // Build from posts (newest first)
  S.posts.slice(0,10).forEach(p=>{
    S.notifications.push({
      id:'post_'+p.id,
      type:'announce',
      title: p.heading||'New Announcement',
      desc: (p.text||'').substring(0,70)+(p.text&&p.text.length>70?'…':''),
      time: p.time||'',
      unread: S.lastSeenPostId===null || String(p.id) > String(S.lastSeenPostId),
      postId: String(p.id),
    });
  });
  renderNotifList();
  updateNotifBell();
}

function renderNotifList(){
  const list=document.getElementById('notif-list');
  if(!S.notifications.length){
    list.innerHTML='<div class="notif-empty"><i class="fa-solid fa-bell-slash"></i>No notifications yet</div>';
    return;
  }
  list.innerHTML=S.notifications.map(n=>`
    <div class="notif-item ${n.unread?'unread':''}" onclick="clickNotif(${jsArg(n.id)})">
      <div class="notif-icon ${n.type}"><i class="fa-solid ${n.type==='announce'?'fa-bullhorn':n.type==='concern'?'fa-circle-exclamation':'fa-star'}"></i></div>
      <div class="notif-content">
        <div class="notif-title">${escHtml(n.title)}</div>
        <div class="notif-desc">${escHtml(n.desc||'')}</div>
        <div class="notif-time">${escHtml(n.time||'')}</div>
      </div>
      ${n.unread?'<div class="notif-unread-dot"></div>':''}
    </div>`).join('');
}

function updateNotifBell(){
  const unreadCount=S.notifications.filter(n=>n.unread).length;
  const dot=document.getElementById('notif-dot');
  dot.style.display=unreadCount>0?'block':'none';
}

function toggleNotifDropdown(){
  S.notifOpen=!S.notifOpen;
  document.getElementById('notif-dropdown').classList.toggle('open',S.notifOpen);
}
function closeNotifDropdown(){
  S.notifOpen=false;
  document.getElementById('notif-dropdown').classList.remove('open');
}

function clickNotif(id){
  // Mark this notif as read
  const n=S.notifications.find(x=>x.id===id);
  if(n){n.unread=false}
  renderNotifList();
  updateNotifBell();
  closeNotifDropdown();
  // Navigate to home/announcements
  navigate('home');
}

function markAllRead(){
  // Save the latest post id as last seen
  if(S.posts.length&&S.user&&S.user.role!=='student'){
    S.lastSeenPostId=String(S.posts[0].id);
    localStorage.setItem('dlinkLastSeen_'+S.user.username,S.lastSeenPostId);
  } else if(S.posts.length){
    S.lastSeenPostId=String(S.posts[0].id);
  }
  S.notifications.forEach(n=>n.unread=false);
  renderNotifList();
  updateNotifBell();
}

async function pollForNewPosts(){
  if(!S.user)return;
  try{
    const d=await apiGet({action:'getPosts',voter:getClientId()});
    if(d&&Array.isArray(d.posts)&&d.posts.length){
      const latestId=String(d.posts[0].id);
      if(S.lastSeenPostId && latestId > S.lastSeenPostId){
        // New posts since last seen — update feed and fire notification
        const prevLen=S.posts.length;
        S.posts=d.posts;
        if(S.posts.length>prevLen) renderPosts();
        buildNotifications();
        toast('New announcement posted!','ok');
      }
    }
  }catch(e){}
}

/* ════════════════════════════════════════════════════════
   CAROUSEL — synced via Google Sheets / Drive
════════════════════════════════════════════════════════ */
async function loadCarousel(){
  try{
    const res=await apiGet({action:'getCarouselSlides'});
    if(res&&Array.isArray(res.slides)&&res.slides.length){
      S.carouselImages=res.slides.map(s=>({url:s.src||s.url,caption:s.caption||''}));
    }
  }catch(e){/* offline — carousel stays empty */}
  renderCarousel();
}

function renderCarousel(){
  const track=document.getElementById('carousel-track');
  const empty=document.getElementById('carousel-empty');
  const prev=document.getElementById('carousel-prev');
  const next=document.getElementById('carousel-next');
  const dots=document.getElementById('carousel-dots');
  const countBadge=document.getElementById('carousel-count-badge');

  track.innerHTML='';
  dots.innerHTML='';
  clearCarouselTimer();

  if(!S.carouselImages.length){
    empty.style.display='flex';
    prev.classList.add('hidden');
    next.classList.add('hidden');
    dots.classList.add('hidden');
    countBadge.classList.add('hidden');
    return;
  }

  empty.style.display='none';
  countBadge.classList.remove('hidden');
  if(S.carouselImages.length>1){
    prev.classList.remove('hidden');
    next.classList.remove('hidden');
    dots.classList.remove('hidden');
  } else {
    prev.classList.add('hidden');
    next.classList.add('hidden');
    dots.classList.add('hidden');
  }

  S.carouselImages.forEach((img,i)=>{
    const slide=document.createElement('div');
    slide.className='carousel-slide';
    {
      const im=document.createElement('img');
      const u=safeImg(img.url);
      im.src=u;im.alt=img.caption||('Photo '+(i+1));im.loading='lazy';im.title=img.caption||'';
      im.draggable=false;
      im.addEventListener('click',()=>openLightbox(u));
      if(u)slide.style.setProperty('--slide-bg',`url(${JSON.stringify(u)})`);
      slide.appendChild(im);
    }
    track.appendChild(slide);
    if(S.carouselImages.length>1){
      const dot=document.createElement('button');
      dot.className='carousel-dot'+(i===0?' active':'');
      dot.onclick=()=>carouselGoTo(i);
      dots.appendChild(dot);
    }
  });

  carouselGoTo(S.carouselIdx < S.carouselImages.length ? S.carouselIdx : 0, false);
  startCarouselTimer();
}

function updateCarouselCountBadge(){
  const b=document.getElementById('carousel-count-badge');
  if(S.carouselImages.length){
    b.textContent=`${S.carouselIdx+1} / ${S.carouselImages.length}`;
    b.classList.remove('hidden');
  } else {
    b.classList.add('hidden');
  }
}

function carouselGoTo(idx, animate=true){
  S.carouselIdx=idx;
  const track=document.getElementById('carousel-track');
  if(!animate) track.style.transition='none';
  track.style.transform=`translateX(-${idx*100}%)`;
  if(!animate) requestAnimationFrame(()=>{track.style.transition='';});
  document.querySelectorAll('.carousel-dot').forEach((d,i)=>d.classList.toggle('active',i===idx));
  updateCarouselCountBadge();
}

(function bindCarouselSwipe(){
  const box=document.getElementById('hero-carousel');if(!box)return;
  let x0=null,y0=null;
  box.addEventListener('touchstart',e=>{const t=e.touches[0];x0=t.clientX;y0=t.clientY},{passive:true});
  box.addEventListener('touchend',e=>{
    if(x0===null)return;const t=e.changedTouches[0];const dx=t.clientX-x0,dy=t.clientY-y0;x0=null;
    if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy)*1.5)carouselMove(dx<0?1:-1);
  },{passive:true});
})();
function carouselMove(dir){
  const len=S.carouselImages.length;if(!len) return;
  carouselGoTo((S.carouselIdx+dir+len)%len);
  resetCarouselTimer();
}

function startCarouselTimer(){
  if(S.carouselImages.length<2) return;
  S.carouselTimer=setInterval(()=>carouselMove(1),4500);
}
function clearCarouselTimer(){if(S.carouselTimer){clearInterval(S.carouselTimer);S.carouselTimer=null}}
function resetCarouselTimer(){clearCarouselTimer();startCarouselTimer()}

/* Upload photos to Drive + save to Sheets so ALL users see them */
async function handleCarouselUpload(input){
  if(!isCouncilUser()){toast('Only Council accounts can edit the carousel.','warn');input.value='';return}
  const files=Array.from(input.files).slice(0,10); // max 10
  if(!files.length) return;

  // Enforce total cap of 10 slides
  const remaining=10-S.carouselImages.length;
  if(remaining<=0){toast('Maximum 10 photos in the carousel. Clear some first.','warn');input.value='';return}
  const toUpload=files.slice(0,remaining);
  if(files.length>remaining) toast(`Only ${remaining} photo(s) added — carousel limit is 10.`,'warn');

  const label=document.querySelector('.carousel-upload-label');
  const orig=label.innerHTML;
  label.innerHTML='<span class="spinner"></span> Uploading…';

  for(const f of toUpload){
    if(f.size>10*1024*1024){toast(`Skipped "${f.name}" (over 10 MB).`,'warn');continue}
    await new Promise(res=>{
      const r=new FileReader();
      r.onload=async e=>{
        const dataUrl=e.target.result;
        const caption=f.name.replace(/\.[^.]+$/,'');
        let src=dataUrl; // fallback
        try{
          // 1. Upload file to Google Drive
          const result=await apiPost({action:'uploadFile',base64:dataUrl.split(',')[1],fileName:f.name,mimeType:f.type});
          if(result&&result.fileUrl){
            src=result.fileUrl;
            // 2. Save slide URL to Google Sheets — THIS is what makes it visible to all users
            await apiPost({action:'addCarouselSlide',type:'photo',src,caption});
          }
        }catch(err){/* offline — slide only local this session */}
        S.carouselImages.push({url:src,caption});
        res();
      };
      r.readAsDataURL(f);
    });
  }

  label.innerHTML=orig;
  input.value='';
  S.carouselIdx=S.carouselImages.length-1;
  renderCarousel();
  toast(`${toUpload.length} photo(s) added to carousel!`,'ok');
}

async function clearCarousel(){
  if(!isCouncilUser()){toast('Only Council accounts can edit the carousel.','warn');return}
  if(!confirm('Clear all carousel photos? This will remove them for all users.')) return;
  S.carouselImages=[];S.carouselIdx=0;
  try{await apiPost({action:'clearCarouselSlides'})}catch(e){}
  renderCarousel();
  toast('Carousel cleared.','ok');
}

/* ════════════════════════════════════════════════════════
   POSTS / ANNOUNCEMENTS
════════════════════════════════════════════════════════ */
async function loadPosts(){
  document.getElementById('feed-loading').style.display='block';
  document.getElementById('posts-feed').innerHTML='';
  try{const d=await apiGet({action:'getPosts',voter:getClientId()});if(d&&Array.isArray(d.posts))S.posts=d.posts;else seedPosts()}catch(e){seedPosts()}
  document.getElementById('feed-loading').style.display='none';
  renderPosts();
  // Mark latest as "seen" on first load
  if(S.posts.length&&!S.lastSeenPostId){
    S.lastSeenPostId=String(S.posts[0].id);
    if(S.user&&S.user.role!=='student')localStorage.setItem('dlinkLastSeen_'+S.user.username,S.lastSeenPostId);
  }
  buildNotifications();
  updateStats();
  renderAdminPosts();
}

function seedPosts(){
  S.posts=[
    {id:1,author:'HSSC – Student Council',initial:'S',role:'council',org:'De La Salle University – Dasmariñas',
     time:'May 14, 2026 · 6:30 AM',badge:'announcement',
     heading:'Final Call in Claiming Lost Belongings',
     text:'Good day, Lasallians! The Student Discipline Formation Office (SDFO) would like to announce that the final call to claim your lost belongings will happen from May 12–29, 2026, at the Prefect of Discipline office (Room A117).\n\nUnclaimed items will be donated to the Lasallian Mission Office (LMO). Thank you for your cooperation.',
     mediaUrls:[],videoUrl:'',likes:14,imgLayout:'auto'},
    {id:2,author:'HSSC Events Committee',initial:'G',role:'council',org:'De La Salle University – Dasmariñas',
     time:'June 14, 2026 · 8:00 AM',badge:'event',
     heading:'Greenify! 2026 — Official Welcoming Program',
     text:'Join us for Greenify! 2026, held from June 24–26, 2026. This three-day celebration aims to introduce new students to the Lasallian community, culture, values, traditions, and campus life.',
     mediaUrls:[],videoUrl:'',likes:32,imgLayout:'auto'},
  ];
}

function toggleVideoInput(){
  const inp=document.getElementById('post-video');
  inp.style.display=inp.style.display==='none'?'inline-block':'none';
}
function extractYouTubeID(url){const m=url.match(/(?:youtu\.be\/|watch\?v=|embed\/)([A-Za-z0-9_-]{11})/);return m?m[1]:null}

async function publishPost(){
  if(!isCouncilUser()){toast('Only Council accounts can post announcements.','warn');return}
  const heading=document.getElementById('post-heading').value.trim();
  const text=document.getElementById('post-text').value.trim();
  const videoUrl=document.getElementById('post-video').value.trim();
  const imgLayout=document.getElementById('img-size-sel').value||'auto';
  if(!heading&&!text&&S.pendingImgs.length===0&&!videoUrl){toast('Please write something or attach media.','warn');return}
  const btn=document.getElementById('post-btn');
  btn.disabled=true;btn.innerHTML='<span class="spinner"></span> Posting…';
  const u=S.user;
  let mediaUrls=[];
  for(const b64 of S.pendingImgs){
    try{const res=await apiPost({action:'uploadFile',base64:b64.split(',')[1],fileName:'post-image.jpg',mimeType:'image/jpeg'});if(res&&res.fileUrl)mediaUrls.push(res.fileUrl);else mediaUrls.push(b64)}catch(e){mediaUrls.push(b64)}
  }
  const ytId=videoUrl?extractYouTubeID(videoUrl):null;
  const entry={id:Date.now(),author:u.name,initial:firstInitial(u.name),role:u.role,org:'De La Salle University – Dasmariñas',badge:'announcement',heading,time:new Date().toLocaleString('en-PH',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'}),text,mediaUrls,videoUrl:ytId?'https://www.youtube.com/embed/'+ytId:'',likes:0,imgLayout,avatarPic:''};
  try{const res=await apiPost({action:'addPost',...entry,mediaUrls:JSON.stringify(mediaUrls)});if(res&&res.ok)toast('Announcement posted!','ok');else toast('Posted locally.','warn')}catch(e){toast('Offline — saved locally.','warn')}
  S.posts.unshift(entry);
  document.getElementById('post-heading').value='';document.getElementById('post-text').value='';
  document.getElementById('post-imgs-preview').innerHTML='';document.getElementById('post-imgs').value='';
  document.getElementById('post-video').value='';document.getElementById('post-video').style.display='none';
  document.getElementById('img-size-row').style.display='none';S.pendingImgs=[];
  renderPosts();buildNotifications();updateStats();renderAdminPosts();
  btn.disabled=false;btn.innerHTML='<i class="fa-solid fa-paper-plane"></i> Post';
}

function previewImgs(input){
  const wrap=document.getElementById('post-imgs-preview');wrap.innerHTML='';S.pendingImgs=[];
  const files=Array.from(input.files);
  if(files.length>10){toast('Only the first 10 photos will be attached.','warn')}
  const selected=files.slice(0,10);
  if(selected.length>0)document.getElementById('img-size-row').style.display='flex';
  selected.forEach((file,i)=>{const reader=new FileReader();reader.onload=e=>{S.pendingImgs[i]=e.target.result;const item=document.createElement('div');item.className='pip-wrap';item.innerHTML=`<img src="${e.target.result}"><button class="pip-rm" onclick="removePendingImg(${i},this)"><i class="fa-solid fa-xmark"></i></button>`;wrap.appendChild(item)};reader.readAsDataURL(file)});
}
function removePendingImg(i,btn){S.pendingImgs.splice(i,1);btn.closest('.pip-wrap').remove();if(!S.pendingImgs.length)document.getElementById('img-size-row').style.display='none'}

function imgGridClass(count,layout){
  if(layout==='1') return 'g1';if(layout==='2') return 'g2';if(layout==='3') return 'g3';
  if(count===1) return 'g1';if(count===2) return 'g2';if(count===3) return 'g3';if(count===4) return 'g4';if(count<=6) return 'g5';return 'gN';
}

function autoLink(text){
  const urlRe=/https?:\/\/[^\s<>"']+/g;
  const escaped=text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return escaped.replace(urlRe,url=>`<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
}

function renderPosts(){
  const feed=document.getElementById('posts-feed');feed.innerHTML='';
  if(!S.posts.length){feed.innerHTML='<div class="feed-empty"><i class="fa-solid fa-bullhorn"></i><p>No announcements yet.</p></div>';return}
  const isCouncil=isCouncilUser();
  S.posts.forEach(p=>{
    let mediaUrls=[];
    if(Array.isArray(p.mediaUrls)) mediaUrls=p.mediaUrls;
    else if(typeof p.mediaUrls==='string'){
      const raw=p.mediaUrls.trim();
      if(raw.startsWith('[')){try{mediaUrls=JSON.parse(raw)}catch(e){mediaUrls=[]}}
      else if(raw.includes(',')) mediaUrls=raw.split(',').map(s=>s.trim()).filter(Boolean);
      else if(raw) mediaUrls=[raw];
    }
    let mediaHTML='';
    if(safeVideo(p.videoUrl)){
      mediaHTML=`<div class="post-media-video"><iframe src="${escHtml(safeVideo(p.videoUrl))}" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen loading="lazy"></iframe></div>`;
    } else if(mediaUrls.length){
      const gc=imgGridClass(mediaUrls.length,p.imgLayout||'auto');
      const maxShow=10;const toShow=mediaUrls.slice(0,maxShow);const extra=mediaUrls.length-maxShow;
      const cells=toShow.map((url,i)=>{const isLast=(i===maxShow-1&&extra>0);return `<div class="post-media-cell" onclick="openLightbox(${jsArg(safeImg(url))})"><img src="${escHtml(safeImg(url))}" alt="Post image ${i+1}" loading="lazy">${isLast?`<div class="post-media-overflow">+${extra}</div>`:''}</div>`}).join('');
      mediaHTML=`<div class="post-media-grid ${gc}">${cells}</div>`;
    }
    const adminHTML=isCouncil?`<div style="display:flex;gap:6px"><button class="btn-edit-post" onclick="editPost(${jsArg(p.id)})"><i class="fa-solid fa-pen"></i> Edit</button><button class="btn-delete-post" onclick="deletePost(${jsArg(p.id)})"><i class="fa-solid fa-trash"></i> Delete</button></div>`:'';
    const avatarHTML=p.avatarPic?`<img src="${escHtml(safeImg(p.avatarPic))}" alt="avatar">`:escHtml(firstInitial(p.initial||p.author));
    const linkedText=autoLink(p.text||'').replace(/\n/g,'<br>');
    feed.innerHTML+=`
      <article class="post-card" data-post-id="${escHtml(p.id)}">
        <div class="post-header">
          <div class="post-avatar">${avatarHTML}</div>
          <div class="post-meta"><div class="post-author">${escHtml(p.author)}</div><div class="post-org">${escHtml(p.org||'De La Salle University – Dasmariñas')}</div><div class="post-time"><i class="fa-regular fa-clock"></i>${escHtml(p.time)}</div></div>
        </div>
        <div class="post-body">${p.heading?`<h3 class="post-heading">${escHtml(p.heading)}</h3>`:''}<p class="post-text">${linkedText}</p></div>
        ${mediaHTML}
        <div class="post-footer">
          <button class="post-action-btn like-btn${p.likedByMe?' liked':''}" onclick="likePost(${jsArg(p.id)},this)" aria-pressed="${p.likedByMe?'true':'false'}"><i class="fa-${p.likedByMe?'solid':'regular'} fa-heart"></i> <span class="like-count">${p.likes||0}</span> ${(p.likes||0)===1?'Like':'Likes'}</button>
          <div class="share-wrap">
            <button class="post-action-btn share-btn" onclick="toggleShare(${jsArg(p.id)},this)" aria-expanded="false"><i class="fa-solid fa-share-nodes"></i> Share</button>
            <div class="share-actions" hidden>
              <button class="post-action-btn" onclick="copyPostText(${jsArg(p.id)})"><i class="fa-regular fa-copy"></i> Copy text</button>
              ${mediaUrls.length?`<button class="post-action-btn" onclick="downloadPostImages(${jsArg(p.id)})"><i class="fa-solid fa-download"></i> Download ${mediaUrls.length>1?'images ('+mediaUrls.length+')':'image'}</button>`:''}
            </div>
          </div>
          <div class="post-footer-spacer"></div>
          ${adminHTML}
        </div>
      </article>`;
  });
}

/* ── Like: one like per user per post, saved on the server ── */
const _likeBusy=new Set();
async function likePost(id,btn){
  id=String(id);
  const p=S.posts.find(x=>String(x.id)===id);if(!p||_likeBusy.has(id))return;
  _likeBusy.add(id);
  const wasLiked=!!p.likedByMe,prevLikes=p.likes||0;
  // optimistic update so the button responds instantly
  p.likedByMe=!wasLiked;p.likes=Math.max(0,prevLikes+(wasLiked?-1:1));paintLike(btn,p);
  try{
    const res=await apiPost({action:'toggleLike',postId:id,voter:getClientId()});
    if(res&&res.ok){p.likedByMe=!!res.liked;p.likes=res.likes;paintLike(btn,p)}
    else{
      p.likedByMe=wasLiked;p.likes=prevLikes;paintLike(btn,p);
      if(!(res&&/^Too many/.test(res.error||'')))toast((res&&res.error)||'Could not save your like. Try again.','warn'); // rate-limit toast is shown by apiPost
    }
  }catch(e){
    p.likedByMe=wasLiked;p.likes=prevLikes;paintLike(btn,p);
    toast('No connection. Your like was not saved.','warn');
  }finally{_likeBusy.delete(id)}
}
function paintLike(btn,p){
  if(!btn)return;
  btn.classList.toggle('liked',!!p.likedByMe);
  btn.setAttribute('aria-pressed',p.likedByMe?'true':'false');
  btn.innerHTML=`<i class="fa-${p.likedByMe?'solid':'regular'} fa-heart"></i> <span class="like-count">${p.likes||0}</span> ${(p.likes||0)===1?'Like':'Likes'}`;
}

/* ── Share: copy the post text or download its images ── */
function closeShareMenus(except){
  document.querySelectorAll('.share-wrap').forEach(w=>{
    if(w===except)return;
    const a=w.querySelector('.share-actions'),b=w.querySelector('.share-btn');
    if(a)a.hidden=true;if(b)b.setAttribute('aria-expanded','false');
  });
}
function toggleShare(id,btn){
  const wrap=btn.closest('.share-wrap'),acts=wrap.querySelector('.share-actions');
  const open=acts.hidden;closeShareMenus(wrap);
  acts.hidden=!open;btn.setAttribute('aria-expanded',open?'true':'false');
}
document.addEventListener('click',e=>{if(!e.target.closest('.share-wrap'))closeShareMenus()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeShareMenus()});

function postPlainText(p){
  const parts=[];
  if(p.heading)parts.push(p.heading);
  if(p.text)parts.push(p.text);
  if(!parts.length&&p.videoUrl)parts.push(p.videoUrl);
  return parts.join('\n\n');
}
async function copyPostText(id){
  const p=S.posts.find(x=>String(x.id)===String(id));if(!p)return;
  const txt=postPlainText(p);
  if(!txt){toast('This post has no text to copy.','warn');return}
  try{
    if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(txt);
    else{const ta=document.createElement('textarea');ta.value=txt;ta.style.cssText='position:fixed;opacity:0';document.body.appendChild(ta);ta.select();const okc=document.execCommand('copy');ta.remove();if(!okc)throw new Error('copy failed')}
    toast('Text copied to clipboard.','ok');
  }catch(e){toast('Could not copy. Select the text and copy it manually.','err')}
  closeShareMenus();
}
function postMediaList(p){
  if(Array.isArray(p.mediaUrls))return p.mediaUrls;
  try{const v=JSON.parse(p.mediaUrls||'[]');return Array.isArray(v)?v:[]}catch(e){return []}
}
async function downloadPostImages(id){
  const p=S.posts.find(x=>String(x.id)===String(id));if(!p)return;
  const urls=postMediaList(p);
  if(!urls.length){toast('This post has no images.','warn');return}
  toast(urls.length>1?`Downloading ${urls.length} images…`:'Downloading image…','ok');
  let failed=0;
  for(let i=0;i<urls.length;i++){
    try{
      const r=await fetch(urls[i]);if(!r.ok)throw new Error('http '+r.status);
      const blob=await r.blob();
      const ext=(blob.type.split('/')[1]||'jpg').replace('jpeg','jpg').replace(/[^a-z0-9]/gi,'')||'jpg';
      const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`project-link-${String(p.id).slice(-6)}-${i+1}.${ext}`;
      document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
    }catch(e){
      failed++;{const su=safeUrl(urls[i]);if(su)window.open(su,'_blank','noopener')} // cross-origin fallback: open so the user can save it
    }
    if(i<urls.length-1)await new Promise(r=>setTimeout(r,350)); // pace multiple downloads so browsers don't block them
  }
  if(failed)toast('Some images opened in a new tab. Use "Save image" there.','warn');
  closeShareMenus();
}
function editPost(id){toast('Edit feature coming soon.','warn')}
async function deletePost(id){
  if(!isCouncilUser())return;
  if(!confirm('Delete this announcement?'))return;
  let res;
  try{res=await apiPost({action:'deletePost',id:String(id)})}catch(e){toast('Could not reach the server. Nothing was deleted.','warn');return}
  const gone=res&&(res.ok||res.error==='Post not found.');
  if(!gone){toast((res&&res.error&&res.error!=='unauthorized')?res.error:'Could not delete the announcement.','warn');return}
  S.posts=S.posts.filter(p=>String(p.id)!==String(id));renderPosts();buildNotifications();updateStats();renderAdminPosts();
  toast('Announcement deleted.','ok');
}

/* ════════════════════════════════════════════════════════
   ANIMO VOICE
════════════════════════════════════════════════════════ */
let selectedFile=null,fileBase64=null;
function handleFileSelect(e){const f=e.target.files[0];if(f)processFile(f)}
function handleDragOver(e){e.preventDefault();document.getElementById('av-upload-zone').classList.add('dragover')}
function handleDragLeave(){document.getElementById('av-upload-zone').classList.remove('dragover')}
function handleDrop(e){e.preventDefault();document.getElementById('av-upload-zone').classList.remove('dragover');const f=e.dataTransfer.files[0];if(f)processFile(f)}
function processFile(file){
  const allowedTypes=['image/jpeg','image/png'];
  const nameOk=/\.(jpe?g|png)$/i.test(file.name);
  if(!allowedTypes.includes(file.type)&&!nameOk){showAVAlert('Only JPG or PNG image files are allowed.','error');return}
  if(file.size>10*1024*1024){showAVAlert('File is too large. Maximum is 10 MB.','error');return}
  selectedFile=file;
  const reader=new FileReader();
  reader.onload=e=>{
    fileBase64=e.target.result;
    const thumb=document.getElementById('av-thumb');
    thumb.innerHTML=`<img src="${e.target.result}" class="av-file-thumb" alt="Preview">`;
    document.getElementById('av-file-name').textContent=file.name;
    document.getElementById('av-file-size').textContent=formatBytes(file.size);
    document.getElementById('av-file-preview').classList.add('visible');
    document.getElementById('av-upload-zone').classList.add('has-file');
  };
  reader.readAsDataURL(file);
}
function clearFileUpload(){selectedFile=null;fileBase64=null;document.getElementById('av-file-input').value='';document.getElementById('av-file-preview').classList.remove('visible');document.getElementById('av-upload-zone').classList.remove('has-file');document.getElementById('av-thumb').innerHTML='<i class="fa-solid fa-file"></i>'}
function formatBytes(b){if(b<1024)return b+' B';if(b<1048576)return(b/1024).toFixed(1)+' KB';return(b/1048576).toFixed(1)+' MB'}

document.addEventListener('DOMContentLoaded',()=>{
  initDarkMode(); // apply saved theme + set the login screen's link text before login
  const avConcern=document.getElementById('av-concern');
  if(avConcern)avConcern.addEventListener('input',function(){
    const max=parseInt(this.getAttribute('maxlength'));const cnt=this.value.length;
    const el=document.getElementById('av-char-count');el.textContent=cnt+' / '+max;
    el.className='av-char-counter'+(cnt>=max?' at-limit':cnt>=max*.85?' near-limit':'');
  });
});

async function submitConcernAV(){
  const btn=document.getElementById('av-submit-btn');
  const studentNo=document.getElementById('av-studentno').value.trim();
  const name=document.getElementById('av-name').value.trim();
  const category=document.getElementById('av-category').value;
  const concern=document.getElementById('av-concern').value.trim();
  const urgency=document.getElementById('av-urgency').value;
  const isAnon=document.getElementById('av-anon-sel').value==='yes';
  if(!studentNo){showAVAlert('Please enter your student number.','error');return}
  if(!category){showAVAlert('Please select a category.','error');return}
  if(!concern){showAVAlert('Please describe your concern.','error');return}
  btn.disabled=true;btn.innerHTML='<span class="spinner"></span> Submitting…';
  hideAVAlert();
  try{
    let fileUrl='',fileId='';
    if(selectedFile&&fileBase64){
      showAVProgress(true);
      try{const res=await apiPost({action:'uploadFile',base64:fileBase64.split(',')[1],fileName:selectedFile.name,mimeType:selectedFile.type});if(res&&res.fileUrl){fileUrl=res.fileUrl;fileId=res.fileId||'';updateAVProgress(60)}else throw new Error('no url')}catch(e){toast('File upload failed — submitting without attachment.','warn')}
    }
    const entry={action:'submitConcern',studentNo,name:isAnon?'':(name||'Anonymous'),category,concern,urgency,anonymous:isAnon,fileUrl,fileId,timestamp:new Date().toISOString(),user:S.user?S.user.username:''};
    const res=await apiPost(entry);
    updateAVProgress(100);setTimeout(()=>showAVProgress(false),600);
    showAVAlert(res&&res.ok?'Your concern has been submitted. It will appear on the Transparency Board once the Council has reviewed it.':(res&&res.error&&res.error!=='unauthorized'?res.error:'Saved locally (offline mode).'),res&&res.ok?'success':'error');
    const localEntry={id:res?.id||Date.now(),date:fmtDate(new Date()),studentNo,name:isAnon?'Anonymous':(name||'Anonymous'),cat:category,urgency,body:concern,status:'Received',anonymous:isAnon,user:S.user?S.user.username:'',fileUrl,fileId};
    S.concerns.push(localEntry);
    document.getElementById('av-concern-form').reset();clearFileUpload();
    renderTBBoard();renderConcernsAdmin();renderCouncilConcerns();updateStats();
  }catch(err){
    showAVProgress(false);
    S.concerns.push({id:Date.now(),date:fmtDate(new Date()),studentNo,name:isAnon?'Anonymous':(name||'Anonymous'),cat:category,urgency,body:concern,status:'Received',anonymous:isAnon,user:S.user?S.user.username:'',fileUrl:'',fileId:''});
    renderTBBoard();renderConcernsAdmin();renderCouncilConcerns();updateStats();
    showAVAlert('Saved locally (offline mode).','success');
    document.getElementById('av-concern-form').reset();clearFileUpload();
  }finally{btn.disabled=false;btn.innerHTML='<i class="fa-solid fa-paper-plane"></i> Submit Concern'}
}
function showAVProgress(v){const w=document.getElementById('av-progress-wrap');if(v){w.classList.add('visible');updateAVProgress(20)}else{w.classList.remove('visible');updateAVProgress(0)}}
function updateAVProgress(p){document.getElementById('av-progress-bar').style.width=p+'%';document.getElementById('av-progress-pct').textContent=p+'%'}
function showAVAlert(msg,type){const a=document.getElementById('av-alert');a.innerHTML=(type==='success'?'<i class="fa-solid fa-circle-check"></i>':'<i class="fa-solid fa-circle-exclamation"></i>')+' '+escHtml(msg);a.className='av-alert show '+type}
function hideAVAlert(){document.getElementById('av-alert').className='av-alert'}

/* The Transparency Board is public, so it only lists concerns the Council has
   already reviewed (status Reviewed or Resolved). New concerns stay private
   until a Council member marks them as reviewed. */
function isPublicConcern(c){return !c.archived&&(c.status==='Reviewed'||c.status==='Resolved')}
function renderTBBoard(){
  const tb=document.getElementById('tb-body');
  const council=isCouncilUser();
  const cols=council?5:4;
  const visible=S.concerns.filter(isPublicConcern);
  if(!visible.length){tb.innerHTML=`<tr><td colspan="${cols}" class="empty-state">No reviewed concerns yet. Concerns appear here after the Council reviews them.</td></tr>`;return}
  tb.innerHTML=visible.map(c=>{
    const act=council?`<td style="white-space:nowrap" onclick="event.stopPropagation()"><button class="btn btn-xs btn-secondary" title="Remove from the board but keep it in the dashboard archive" onclick="concernAction('archiveConcern',${jsArg(c.id)})"><i class="fa-solid fa-box-archive"></i> Archive</button> <button class="btn btn-xs btn-danger" title="Delete permanently" onclick="concernAction('deleteConcern',${jsArg(c.id)})"><i class="fa-solid fa-trash"></i></button></td>`:'';
    return `<tr class="tb-row-clickable" onclick="viewConcern(${jsArg(c.id)})"><td>${escHtml(c.date)}</td><td>${escHtml(c.cat||'—')}</td><td><span class="status-pill ${escHtml((c.status||'received').toLowerCase())}">${escHtml(c.status||'Received')}</span></td><td>${escHtml((c.body||'').substring(0,60))}…</td>${act}</tr>`;
  }).join('');
}

/* Builds the 3-step "Received → Reviewed → Resolved" order-style tracker HTML for a concern */
function buildProgressTracker(status){
  const steps=[
    {key:'Received',icon:'fa-inbox',sub:'Concern logged'},
    {key:'Reviewed',icon:'fa-magnifying-glass',sub:'Council reviewing'},
    {key:'Resolved',icon:'fa-check',sub:'Concern addressed'}
  ];
  const order=['Received','Reviewed','Resolved'];
  let idx=order.indexOf(status);
  if(idx<0)idx=0;
  return `<div class="otrack">${steps.map((s,i)=>{
    const state=i<idx?'done':(i===idx?'current':'');
    const lineFilled=i<=idx?'filled':'';
    const icon=i<idx?'fa-check':s.icon;
    return `<div class="otrack-step ${state}"><div class="otrack-line ${lineFilled}"></div><div class="otrack-dot"><i class="fa-solid ${icon}"></i></div><div class="otrack-label">${s.key}</div><div class="otrack-sub">${s.sub}</div></div>`;
  }).join('')}</div>`;
}

/* ════════════════════════════════════════════════════════
   CONCERNS
════════════════════════════════════════════════════════ */
async function loadConcerns(){
  try{
    // Council accounts send their credentials and receive every concern (so they can review them).
    // Everyone else only receives concerns that were already reviewed.
    const d=(isCouncilUser()&&S.user.token)?await apiPost({action:'getConcerns'}):await apiGet({action:'getConcerns'});
    if(d&&Array.isArray(d.concerns)){
      S.concerns=d.concerns;
      if(isCouncilUser()&&d.scope!=='council'){toast('Your session expired. Please sign in again.','warn');setTimeout(()=>doLogout(),1200)}
    }
  }catch(e){}
  // Normalize legacy status values (old system only had Open/Resolved)
  S.concerns.forEach(c=>{if(!c.status||c.status==='Open')c.status='Received'});
  renderTBBoard();renderConcernsAdmin();renderCouncilConcerns();updateStats();
}
async function reviewConcern(id){
  if(!isCouncilUser())return;
  const c=S.concerns.find(x=>String(x.id)===String(id));if(!c) return;
  c.status='Reviewed';
  try{await apiPost({action:'reviewConcern',id})}catch(e){}
  renderTBBoard();renderConcernsAdmin();renderCouncilConcerns();updateStats();toast('Marked as reviewed!','ok');
}
async function resolveConcern(id){
  if(!isCouncilUser())return;
  const c=S.concerns.find(x=>String(x.id)===String(id));if(!c) return;
  c.status='Resolved';
  try{await apiPost({action:'resolveConcern',id})}catch(e){}
  renderTBBoard();renderConcernsAdmin();renderCouncilConcerns();updateStats();toast('Concern resolved!','ok');
}
async function concernAction(action,id){
  if(!isCouncilUser())return;
  const c=S.concerns.find(x=>String(x.id)===String(id));if(!c)return;
  if(action==='deleteConcern'&&!confirm('Permanently delete this concern (and its attachment)? This cannot be undone.\n\nTip: use Archive to keep a record.'))return;
  let res;
  try{res=await apiPost({action,id})}catch(e){toast('Could not reach the server.','warn');return}
  if(!res||!res.ok){if(!res||res.error!=='unauthorized')toast((res&&res.error)||'Action failed.','warn');return}
  if(action==='deleteConcern')S.concerns=S.concerns.filter(x=>String(x.id)!==String(id));
  else c.archived=(action==='archiveConcern');
  renderTBBoard();renderCouncilConcerns();updateStats();
  toast(action==='deleteConcern'?'Concern deleted.':action==='archiveConcern'?'Concern archived.':'Concern restored.','ok');
}
function toggleConcernArchive(){S.showArchivedConcerns=!S.showArchivedConcerns;renderCouncilConcerns()}
function maskStudentNo(sn,isAnon){
  if(!sn) return '—';
  const s=String(sn);
  if(!isAnon) return s;
  return s.length>4 ? s.slice(0,4)+'*'.repeat(s.length-4) : s;
}
function attachCell(c){
  if(!c.fileUrl&&!c.fileId) return '—';
  const url=safeUrl(c.fileUrl||(c.fileId?`https://drive.google.com/file/d/${encodeURIComponent(c.fileId)}/view`:''));
  if(!url) return '—';
  return `<a href="${escHtml(url)}" target="_blank" rel="noopener noreferrer" style="color:var(--sage-d);font-weight:600;display:inline-flex;align-items:center;gap:4px"><i class="fa-solid fa-paperclip"></i> View</a>`;
}
function renderConcernsAdmin(){
  // Admin no longer manages concerns directly — kept as no-op for legacy calls
}
function renderCouncilConcerns(){
  const tb=document.getElementById('council-concerns-body');if(!tb) return;
  const showArch=S.showArchivedConcerns;
  const tgl=document.getElementById('concern-archive-toggle');
  const archCount=S.concerns.filter(c=>c.archived).length;
  if(tgl)tgl.innerHTML=showArch?'<i class="fa-solid fa-inbox"></i> Show Active':`<i class="fa-solid fa-box-archive"></i> Show Archived (${archCount})`;
  const rows=S.concerns.filter(c=>!!c.archived===showArch);
  if(!rows.length){tb.innerHTML=`<tr><td colspan="8" class="empty-state">${showArch?'No archived concerns.':'No concerns yet.'}</td></tr>`}
  else tb.innerHTML=rows.map(c=>{
    const rb=c.status==='Resolved'?'badge-green':c.status==='Reviewed'?'badge-blue':'badge-yellow';
    const ub=c.urgency==='High'?'badge-red':c.urgency==='Medium'?'badge-yellow':'badge-green';
    let actionBtn='';
    if(!c.archived){
      if(c.status==='Received')actionBtn=`<button class="btn btn-xs btn-secondary" onclick="reviewConcern(${jsArg(c.id)})"><i class="fa-solid fa-magnifying-glass"></i> Mark Reviewed</button>`;
      else if(c.status==='Reviewed')actionBtn=`<button class="btn btn-xs btn-secondary" onclick="resolveConcern(${jsArg(c.id)})"><i class="fa-solid fa-check"></i> Resolve</button>`;
      actionBtn+=`<button class="btn btn-xs btn-secondary" onclick="concernAction('archiveConcern',${jsArg(c.id)})"><i class="fa-solid fa-box-archive"></i> Archive</button>`;
    }else actionBtn=`<button class="btn btn-xs btn-secondary" onclick="concernAction('restoreConcern',${jsArg(c.id)})"><i class="fa-solid fa-rotate-left"></i> Restore</button>`;
    actionBtn+=`<button class="btn btn-xs btn-danger" title="Delete permanently" onclick="concernAction('deleteConcern',${jsArg(c.id)})"><i class="fa-solid fa-trash"></i></button>`;
    return `<tr><td>${escHtml(c.date)}</td><td>${escHtml(maskStudentNo(c.studentNo,c.anonymous))}</td><td>${escHtml(c.name)}</td><td>${escHtml(c.cat)}</td><td><span class="badge ${ub}">${escHtml(c.urgency)}</span></td><td>${attachCell(c)}</td><td><span class="badge ${rb}">${escHtml(c.status)}</span></td><td style="display:flex;gap:4px;flex-wrap:wrap"><button class="btn btn-xs btn-primary" onclick="viewConcern(${jsArg(c.id)})"><i class="fa-solid fa-eye"></i> View</button>${actionBtn}</td></tr>`;
  }).join('');
  const act=S.concerns.filter(c=>!c.archived);
  const open=act.filter(c=>c.status==='Received').length;
  const res=act.filter(c=>c.status==='Resolved').length;
  const e1=document.getElementById('cs-open');const e2=document.getElementById('cs-resolved');const e3=document.getElementById('cs-evals');
  if(e1)e1.textContent=open;if(e2)e2.textContent=res;if(e3)e3.textContent=S.evals.length;
}
function viewConcern(id){
  const c=S.concerns.find(x=>String(x.id)===String(id));if(!c) return;
  document.getElementById('modal-title').textContent=c.cat+' Concern';
  const senderLabel=maskStudentNo(c.studentNo,c.anonymous);
  document.getElementById('modal-sub').textContent=`Submitted by ${c.name}${senderLabel!=='—'?' ('+senderLabel+')':''} · ${c.date}`;
  const ub=c.urgency==='High'?'badge-red':c.urgency==='Medium'?'badge-yellow':'badge-green';
  const attachHTML=safeUrl(c.fileUrl)?`<a class="tl-attachment" href="${escHtml(safeUrl(c.fileUrl))}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-paperclip"></i> View Attachment</a>`:'';
  document.getElementById('modal-body').innerHTML=`
    ${buildProgressTracker(c.status||'Received')}
    <div class="tl-content" style="margin-bottom:10px">
      <div class="tl-title">Concern Details</div>
      <div class="tl-meta">${escHtml(c.date)} · ${escHtml(c.cat)} · <span class="badge ${ub}">${escHtml(c.urgency)}</span></div>
      <div class="tl-body">${escHtml(c.body).replace(/\n/g,'<br>')}</div>
      ${attachHTML}
    </div>`;
  const ab=document.getElementById('modal-action-btn');
  if(S.user&&S.user.role==='council'&&c.status==='Received'){ab.classList.remove('hidden');ab.innerHTML='<i class="fa-solid fa-magnifying-glass"></i> Mark Reviewed';ab.onclick=()=>{reviewConcern(id);closeModal()}}
  else if(S.user&&S.user.role==='council'&&c.status==='Reviewed'){ab.classList.remove('hidden');ab.innerHTML='<i class="fa-solid fa-check"></i> Mark Resolved';ab.onclick=()=>{resolveConcern(id);closeModal()}}
  else ab.classList.add('hidden');
  document.getElementById('modal').classList.add('open');
}

/* ════════════════════════════════════════════════════════
   EVALUATIONS
════════════════════════════════════════════════════════ */
async function loadEvals(){
  if(!(S.user&&S.user.token)){S.evals=[];updateStats();return}   // evaluations are staff-only
  try{const d=await apiPost({action:'getEvals'});if(d&&Array.isArray(d.evals))S.evals=d.evals}catch(e){}
  updateStats();
}

/* ════════════════════════════════════════════════════════
   ADMIN-VIEW: ANNOUNCEMENTS & BOOKINGS ONLY
════════════════════════════════════════════════════════ */
function renderAdminPosts(){
  const tb=document.getElementById('admin-posts-body');if(!tb) return;
  if(!S.posts.length){tb.innerHTML='<tr><td colspan="4" class="empty-state">No announcements yet.</td></tr>';return}
  tb.innerHTML=S.posts.map(p=>`<tr><td>${escHtml(p.time||'—')}</td><td>${escHtml(p.author||'—')}</td><td>${escHtml(p.heading||'—')}</td><td style="max-width:260px;font-size:12px">${escHtml((p.text||'').substring(0,90))}${(p.text||'').length>90?'…':''}</td></tr>`).join('');
}
function renderAdminBookings(){
  const tb=document.getElementById('admin-bookings-body');if(!tb) return;
  const showArch=S.showArchivedAppts;
  const tgl=document.getElementById('appt-archive-toggle');
  const archCount=S.appointments.filter(a=>a.Archived).length;
  if(tgl)tgl.innerHTML=showArch?'<i class="fa-solid fa-calendar-check"></i> Show Active':`<i class="fa-solid fa-box-archive"></i> Show Archived (${archCount})`;
  const rows=S.appointments.filter(a=>!!a.Archived===showArch);
  if(!rows.length){tb.innerHTML=`<tr><td colspan="9" class="empty-state">${showArch?'No archived appointments.':'No appointments yet.'}</td></tr>`;return}
  tb.innerHTML=rows.map(a=>{
    const btns=a.ID?((a.Archived?`<button class="btn btn-xs btn-secondary" onclick="appointmentAction('restoreAppointment',${jsArg(a.ID)})"><i class="fa-solid fa-rotate-left"></i> Restore</button>`:`<button class="btn btn-xs btn-secondary" onclick="appointmentAction('archiveAppointment',${jsArg(a.ID)})"><i class="fa-solid fa-box-archive"></i> Archive</button>`)+` <button class="btn btn-xs btn-danger" title="Delete permanently" onclick="appointmentAction('deleteAppointment',${jsArg(a.ID)})"><i class="fa-solid fa-trash"></i></button>`):'—';
    return `<tr><td>${escHtml(a.Date&&a.Date!=='null'&&a.Date!=='undefined'?a.Date:'—')}</td><td>${escHtml(a.Time&&a.Time!=='null'&&a.Time!=='undefined'?a.Time:'—')}</td><td>${escHtml(a.StudentNo||'—')}</td><td>${escHtml(a.Email||'—')}</td><td>${escHtml(a.Name||'—')}</td><td>${escHtml(a.Category||'—')}</td><td style="max-width:160px;font-size:12px">${escHtml((a.Concern||'—').substring(0,80))}</td><td><span class="status-pill ${escHtml((a.Status||'pending').toLowerCase())}">${escHtml(a.Status||'Pending')}</span></td><td style="white-space:nowrap">${btns}</td></tr>`;
  }).join('');
}
function toggleApptArchive(){S.showArchivedAppts=!S.showArchivedAppts;renderAdminBookings()}
async function appointmentAction(action,id){
  if(!(S.user&&S.user.role==='admin'))return;
  if(action==='deleteAppointment'&&!confirm('Permanently delete this appointment? This cannot be undone.\n\nTip: use Archive to keep a record.'))return;
  let res;
  try{res=await apiPost({action,id})}catch(e){toast('Could not reach the server.','warn');return}
  if(!res||!res.ok){if(!res||res.error!=='unauthorized')toast((res&&res.error)||'Action failed.','warn');return}
  await loadAppointments();
  toast(action==='deleteAppointment'?'Appointment deleted.':action==='archiveAppointment'?'Appointment archived — its time slot is open again.':'Appointment restored.','ok');
}

/* ════════════════════════════════════════════════════════
   SW CARE DESK
════════════════════════════════════════════════════════ */
function swcareTab(tab,btn){
  document.querySelectorAll('.swcare-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.swcare-nav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('swcare-'+tab).classList.add('active');
  if(btn)btn.classList.add('active');
}

/* ════════════════════════════════════════════════════════
   CALENDAR
════════════════════════════════════════════════════════ */
function initCalendar(){const now=new Date();S.calMonth=now.getMonth();S.calYear=now.getFullYear();renderCalendar()}
function changeMonth(d){
  S.calMonth+=d;
  if(S.calMonth<0){S.calMonth=11;S.calYear--}if(S.calMonth>11){S.calMonth=0;S.calYear++}
  S.selectedDate=null;S.selectedTime=null;
  document.getElementById('cal-selected-date').textContent='Select a date';
  document.getElementById('time-slots').innerHTML='<div class="empty-state" style="grid-column:1/-1;padding:20px"><i class="fa-solid fa-calendar"></i> Click a weekday to see slots</div>';
  document.getElementById('apt-form-wrap').classList.add('hidden');
  renderCalendar();
}
function dateKey(y,m,d){return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`}
function blockInfo(key){return (S.blocked&&S.blocked[key])||{all:false,times:{}}}
function isDayBlocked(y,m,d){return !!blockInfo(dateKey(y,m,d)).all}
function isFullyBooked(y,m,d){
  const key=dateKey(y,m,d);const booked=(S.bookedSlots&&S.bookedSlots[key])||new Set();const info=blockInfo(key);
  if(!booked.size&&!Object.keys(info.times).length)return false;
  return ALL_SLOTS.every(s=>booked.has(s)||info.times[s])
}
function renderCalendar(){
  if(!Number.isInteger(S.calMonth)||S.calMonth<0||S.calMonth>11||!Number.isInteger(S.calYear)){const now=new Date();S.calMonth=now.getMonth();S.calYear=now.getFullYear()}
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  document.getElementById('cal-month-label').textContent=`${months[S.calMonth]} ${S.calYear}`;
  const grid=document.getElementById('cal-grid');grid.innerHTML=days.map(d=>`<div class="cal-weekday">${d}</div>`).join('');
  const first=new Date(S.calYear,S.calMonth,1).getDay();
  for(let i=0;i<first;i++)grid.innerHTML+=`<div class="cal-day empty"></div>`;
  const daysInMonth=new Date(S.calYear,S.calMonth+1,0).getDate();
  for(let d=1;d<=daysInMonth;d++){
    const dow=new Date(S.calYear,S.calMonth,d).getDay();
    const isWeekend=(dow===0||dow===6);const dayBlocked=!isWeekend&&isDayBlocked(S.calYear,S.calMonth,d);const fullyBooked=!isWeekend&&!dayBlocked&&isFullyBooked(S.calYear,S.calMonth,d);const sel=S.selectedDate===d;
    let cls='cal-day';if(isWeekend)cls+=' weekend';else if(dayBlocked)cls+=' unavailable';else if(fullyBooked)cls+=' fully-booked';else cls+=' available';if(sel)cls+=' selected';
    const onclick=(!isWeekend&&!dayBlocked&&!fullyBooked)?`onclick="selectDay(${d})"`:'';
    grid.innerHTML+=`<div class="${cls}" ${onclick}>${d}</div>`;
  }
}
async function selectDay(d){
  S.selectedDate=d;S.selectedTime=null;
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dateObj=new Date(S.calYear,S.calMonth,d);
  document.getElementById('cal-selected-date').textContent=`${months[S.calMonth]} ${d}, ${dayNames[dateObj.getDay()]}:`;
  renderCalendar();renderTimeSlots();document.getElementById('apt-form-wrap').classList.add('hidden');
}
function renderTimeSlots(){
  const slots=document.getElementById('time-slots');
  if(S.selectedDate==null)return;
  const key=dateKey(S.calYear,S.calMonth,S.selectedDate);const booked=S.bookedSlots[key]||new Set();const info=blockInfo(key);
  slots.innerHTML=ALL_SLOTS.map(t=>{
    const off=info.all||!!info.times[t];const isBooked=booked.has(t);
    const cls=off?'blocked':isBooked?'booked':'available';
    const note=off?' <small>(Unavailable)</small>':isBooked?' <small>(Full)</small>':'';
    return `<div class="time-slot ${cls}" ${off||isBooked?'':`onclick="selectTime('${t}')"`}>${t}${note}</div>`}).join('');
}
function selectTime(t){
  S.selectedTime=t;
  document.querySelectorAll('.time-slot').forEach(s=>{s.classList.remove('selected');if(s.textContent.startsWith(t))s.classList.add('selected')});
  document.getElementById('apt-form-wrap').classList.remove('hidden');
}
function cleanDateValue(v){if(v===undefined||v===null)return '';const s=String(v).trim();if(!s||['null','undefined','invalid date'].includes(s.toLowerCase()))return '';const m=s.match(/^(\d{4}-\d{2}-\d{2})/);return m?m[1]:s}
async function loadAppointments(){
  try{const isAdm=!!(S.user&&S.user.role==='admin'&&S.user.token);const d=isAdm?await apiPost({action:'getAppointments'}):await apiGet({action:'getAppointments'});if(isAdm&&d&&d.scope!=='admin'){toast('Your session expired. Please sign in again.','warn');setTimeout(()=>doLogout(),1200)}if(d&&Array.isArray(d.appointments)){const val=(o,...keys)=>{for(const k of keys){const v=o?.[k];if(v!==undefined&&v!==null&&String(v).trim()!==''&&!['null','undefined'].includes(String(v).trim().toLowerCase()))return v}return ''};S.appointments=d.appointments.filter(a=>a&&typeof a==='object').map(a=>({ID:val(a,'ID','id'),Date:cleanDateValue(val(a,'Date','date')),Time:val(a,'Time','time'),StudentNo:val(a,'StudentNo','studentNo','student_no'),Email:val(a,'Email','email'),Name:val(a,'Name','name'),Category:val(a,'Category','category'),Concern:val(a,'Concern','concern'),Status:(()=>{const st=String(val(a,'Status','status')||'Pending').trim().toLowerCase();return st?st[0].toUpperCase()+st.slice(1):'Pending'})(),Archived:val(a,'Archived','archived')===true||String(val(a,'Archived','archived')).toLowerCase()==='true'||val(a,'Archived','archived')===1}));S.bookedSlots={};S.blocked={};(Array.isArray(d.blocked)?d.blocked:[]).forEach(x=>{const date=cleanDateValue(val(x,'Date','date'));if(!date)return;const time=val(x,'Time','time');const e=S.blocked[date]||(S.blocked[date]={all:false,times:{}});if(!time){e.all=true;e.reason=val(x,'Reason','reason');e.id=val(x,'ID','id')}else e.times[time]={reason:val(x,'Reason','reason'),id:val(x,'ID','id')}});S.appointments.forEach(a=>{if(a.Date&&a.Time&&!a.Archived&&['Booked','Pending'].includes(a.Status)){if(!S.bookedSlots[a.Date])S.bookedSlots[a.Date]=new Set();S.bookedSlots[a.Date].add(a.Time)}})}}catch(e){console.error('loadAppointments failed:',e)}
  renderAppointmentsDashboard();renderAdminBookings();updateStats();if(S.calMonth!==null){renderCalendar();if(S.selectedDate!=null)renderTimeSlots()}
  renderAdminCalendar();renderAdminDay();
}
function renderAppointmentsDashboard(){
  const tb=document.getElementById('apt-dashboard-body');if(!tb) return;
  const act=S.appointments.filter(a=>!a.Archived);
  if(!act.length){tb.innerHTML='<tr><td colspan="8" class="empty-state">No appointments yet.</td></tr>';return}
  tb.innerHTML=act.map(a=>`<tr><td>${escHtml(a.Date&&a.Date!=='null'&&a.Date!=='undefined'?a.Date:'—')}</td><td>${escHtml(a.Time&&a.Time!=='null'&&a.Time!=='undefined'?a.Time:'—')}</td><td>${escHtml(a.StudentNo||'—')}</td><td>${escHtml(a.Email||'—')}</td><td>${escHtml(a.Name||'—')}</td><td>${escHtml(a.Category||'—')}</td><td style="max-width:160px;font-size:12px">${escHtml((a.Concern||'—').substring(0,80))}</td><td><span class="status-pill ${escHtml((a.Status||'pending').toLowerCase())}">${escHtml(a.Status||'Pending')}</span></td></tr>`).join('');
}
async function bookAppointment(){
  const studentNo=document.getElementById('apt-studno').value.trim();
  const email=document.getElementById('apt-email').value.trim();
  const name=document.getElementById('apt-name').value.trim();const concern=document.getElementById('apt-concern').value.trim();const category=document.getElementById('apt-category').value.trim();
  if(!studentNo){toast('Please enter your student number.','warn');return}
  if(!email){toast('Please enter your DLSUD email.','warn');return}
  if(!/^.+@(hs\.)?dlsud\.edu\.ph$/i.test(email)){toast('Please use a valid DLSUD email address.','warn');return}
  if(!name||!concern){toast('Please fill in your name and concern.','warn');return}
  if(!S.selectedDate||!S.selectedTime){toast('Please select a date and time.','warn');return}
  const dateStr=dateKey(S.calYear,S.calMonth,S.selectedDate);
  // Re-check against the server right before booking — another student
  // may have taken this slot since the calendar was last loaded.
  let res;
  try{res=await apiPost({action:'bookAppointment',studentNo,email,name,concern,category,date:dateStr,time:S.selectedTime,status:'Booked'})}
  catch(e){toast('Offline — could not reach the server. Please try again once connected.','warn');return}
  if(!res||!res.ok){
    toast(res&&res.error?res.error:'Could not book that slot — it may already be taken.','warn');
    S.selectedTime=null;
    await loadAppointments(); // refresh so the now-taken slot shows red immediately
    renderTimeSlots();
    return;
  }
  toast('Appointment booked!','ok');
  // Mark it red immediately (don't wait on the network round-trip)...
  if(!S.bookedSlots[dateStr])S.bookedSlots[dateStr]=new Set();
  S.bookedSlots[dateStr].add(S.selectedTime);
  S.appointments.push({Date:dateStr,Time:S.selectedTime,StudentNo:studentNo,Email:email,Name:name,Concern:concern,Category:category,Status:'Booked'});
  document.getElementById('apt-studno').value='';document.getElementById('apt-email').value='';document.getElementById('apt-name').value='';document.getElementById('apt-concern').value='';document.getElementById('apt-category').value='';
  document.getElementById('apt-form-wrap').classList.add('hidden');S.selectedTime=null;
  renderCalendar();renderTimeSlots();renderAppointmentsDashboard();renderAdminBookings();updateStats();
  // ...then re-sync with the server so every open tab/device agrees.
  await loadAppointments();
  renderCalendar();renderTimeSlots();
}

/* ════════════════════════════════════════════════════════
   SWC (ADMIN) CALENDAR — see who booked, mark dates/times unavailable
════════════════════════════════════════════════════════ */
const MONTH_NAMES=['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function initAdminCalendar(){const n=new Date();S.aCalMonth=n.getMonth();S.aCalYear=n.getFullYear();S.aCalSel=null;renderAdminCalendar();renderAdminDay()}
function adminApptView(v){
  document.getElementById('admin-view-calendar').classList.toggle('hidden',v!=='calendar');
  document.getElementById('admin-view-list').classList.toggle('hidden',v!=='list');
  document.getElementById('seg-calendar').classList.toggle('active',v==='calendar');
  document.getElementById('seg-list').classList.toggle('active',v==='list');
  document.getElementById('appt-archive-toggle').style.display=v==='list'?'':'none';
}
function adminChangeMonth(d){
  S.aCalMonth+=d;
  if(S.aCalMonth<0){S.aCalMonth=11;S.aCalYear--}if(S.aCalMonth>11){S.aCalMonth=0;S.aCalYear++}
  S.aCalSel=null;renderAdminCalendar();renderAdminDay();
}
function activeApptsOn(key){return S.appointments.filter(a=>cleanDateValue(a.Date)===key&&!a.Archived&&['Booked','Pending'].includes(String(a.Status||'').trim()))}
function renderAdminCalendar(){
  const grid=document.getElementById('acal-grid');if(!grid)return;
  if(!Number.isInteger(S.aCalMonth)||S.aCalMonth<0||S.aCalMonth>11||!Number.isInteger(S.aCalYear)){const n=new Date();S.aCalMonth=n.getMonth();S.aCalYear=n.getFullYear()}
  document.getElementById('acal-month-label').textContent=`${MONTH_NAMES[S.aCalMonth]} ${S.aCalYear}`;
  let html=DAY_NAMES.map(d=>`<div class="cal-weekday">${d}</div>`).join('');
  const first=new Date(S.aCalYear,S.aCalMonth,1).getDay();
  for(let i=0;i<first;i++)html+='<div class="cal-day empty"></div>';
  const dim=new Date(S.aCalYear,S.aCalMonth+1,0).getDate();
  for(let d=1;d<=dim;d++){
    const dow=new Date(S.aCalYear,S.aCalMonth,d).getDay();
    if(dow===0||dow===6){html+=`<div class="cal-day weekend">${d}</div>`;continue}
    const key=dateKey(S.aCalYear,S.aCalMonth,d);const info=blockInfo(key);
    const appts=activeApptsOn(key);const booked=new Set(appts.map(a=>a.Time));
    const covered=ALL_SLOTS.every(t=>booked.has(t)||info.times[t]);
    let cls='cal-day';
    if(info.all)cls+=' unavailable';
    else if(covered)cls+=appts.length?' fully-booked':' unavailable';
    else if(appts.length)cls+=' has-bookings';
    else cls+=' available';
    if(S.aCalSel===key)cls+=' selected';
    html+=`<div class="${cls}" onclick="adminSelectDay('${key}')" title="${appts.length} booking(s)">${d}${appts.length?`<span class="cal-badge">${appts.length}</span>`:''}</div>`;
  }
  grid.innerHTML=html;
}
const DATE_KEY_RE=/^\d{4}-\d{2}-\d{2}$/;
function adminSelectDay(key){if(!DATE_KEY_RE.test(String(key||'')))return;S.aCalSel=key;renderAdminCalendar();renderAdminDay()}
function renderAdminDay(){
  const head=document.getElementById('acal-selected-date'),acts=document.getElementById('acal-day-actions'),box=document.getElementById('acal-slots');
  if(!head||!box)return;
  const key=DATE_KEY_RE.test(String(S.aCalSel||''))?S.aCalSel:null;
  if(!key){
    head.textContent='Select a date';acts.classList.add('hidden');
    box.innerHTML='<div class="empty-state" style="padding:20px"><i class="fa-solid fa-calendar"></i> Click a weekday to see who booked and manage availability</div>';
    return;
  }
  const [y,m,d]=key.split('-').map(Number);
  head.textContent=`${MONTH_NAMES[m-1]} ${d}, ${DAY_NAMES[new Date(y,m-1,d).getDay()]}`;
  const info=blockInfo(key);const appts=activeApptsOn(key);
  const reasonVal=(document.getElementById('acal-reason')||{}).value||'';
  acts.classList.remove('hidden');
  acts.innerHTML=info.all
    ?`<button class="btn btn-primary btn-sm" onclick="setAvailability(${jsArg(key)},'',false)"><i class="fa-solid fa-lock-open"></i> Make whole day available</button>`+(info.reason?`<span style="font-size:12px;color:var(--gray4);align-self:center">Reason: ${escHtml(info.reason)}</span>`:'')
    :`<input type="text" id="acal-reason" maxlength="200" value="${escHtml(reasonVal)}" placeholder="Reason (optional, only you see it)" style="flex:1;min-width:150px;padding:7px 10px;border:1.5px solid var(--border-color);border-radius:var(--radius-sm);background:var(--bg-card);color:var(--text-primary);font-size:12px"><button class="btn btn-danger btn-sm" onclick="setAvailability(${jsArg(key)},'',true)"><i class="fa-solid fa-ban"></i> Mark whole day unavailable</button>`;
  box.innerHTML=ALL_SLOTS.map(t=>{
    const a=appts.find(x=>x.Time===t);
    if(a){
      return `<div class="aslot is-booked"><div class="aslot-time">${t}</div><div class="aslot-main"><strong>${escHtml(a.Name||'—')}</strong><div class="aslot-sub">${escHtml(a.StudentNo||'—')} · ${escHtml(a.Email||'—')}</div><div class="aslot-sub">${escHtml(a.Category||'—')}${a.Concern?': '+escHtml(a.Concern.substring(0,120))+(a.Concern.length>120?'…':''):''}</div></div><div>${a.ID?`<button class="btn btn-xs btn-secondary" title="Archive to free this slot" onclick="appointmentAction('archiveAppointment',${jsArg(a.ID)})"><i class="fa-solid fa-box-archive"></i> Archive</button>`:''}</div></div>`;
    }
    if(info.all)return `<div class="aslot is-blocked"><div class="aslot-time">${t}</div><div class="aslot-main"><span class="aslot-state blocked">Unavailable (whole day)</span></div><div></div></div>`;
    const b=info.times[t];
    if(b)return `<div class="aslot is-blocked"><div class="aslot-time">${t}</div><div class="aslot-main"><span class="aslot-state blocked">Unavailable</span>${b.reason?`<div class="aslot-sub">${escHtml(b.reason)}</div>`:''}</div><div><button class="btn btn-xs btn-secondary" onclick="setAvailability(${jsArg(key)},${jsArg(t)},false)"><i class="fa-solid fa-lock-open"></i> Make available</button></div></div>`;
    return `<div class="aslot is-open"><div class="aslot-time">${t}</div><div class="aslot-main"><span class="aslot-state open">Open</span></div><div><button class="btn btn-xs btn-danger" onclick="setAvailability(${jsArg(key)},${jsArg(t)},true)"><i class="fa-solid fa-ban"></i> Mark unavailable</button></div></div>`;
  }).join('');
}
async function setAvailability(date,time,makeUnavailable){
  if(!isSwcAdmin())return;
  const reasonEl=document.getElementById('acal-reason');
  const body=makeUnavailable?{action:'addUnavailable',date,time,reason:reasonEl?reasonEl.value.trim():''}:{action:'removeUnavailable',date,time};
  let res;
  try{res=await apiPost(body)}catch(e){toast('Could not reach the server.','warn');return}
  if(!res||!res.ok){if(!res||res.error!=='unauthorized')toast((res&&res.error)||'Action failed.','warn');return}
  if(reasonEl)reasonEl.value='';
  await loadAppointments();
  toast(makeUnavailable?(time?`${time} marked unavailable.`:'Whole day marked unavailable.'):(time?`${time} is available again.`:'Day is available again.'),'ok');
}

/* ════════════════════════════════════════════════════════
   LASALLIAN INSIGHTS
════════════════════════════════════════════════════════ */
async function loadEvents(){
  try{
    const d=(isCouncilUser()&&S.user.token)?await apiPost({action:'getEvents'}):await apiGet({action:'getEvents'});
    if(d&&Array.isArray(d.events))S.events=d.events;
  }catch(e){console.error('loadEvents failed:',e)}
  renderInsights();
}
function visibleEvents(){return S.events.filter(e=>isCouncilUser()&&S.showArchivedEvents?true:!e.archived)}
function renderInsights(){
  const nav=document.getElementById('insights-nav-items');const panels=document.getElementById('insights-panels');
  const prevActive=(document.querySelector('.insights-panel.active')||{}).id;
  nav.innerHTML='';panels.innerHTML='';
  const isCouncil=isCouncilUser();
  const tgl=document.getElementById('ev-archive-toggle');
  if(tgl){const n=S.events.filter(e=>e.archived).length;tgl.innerHTML=S.showArchivedEvents?'<i class="fa-solid fa-eye-slash"></i> Hide Archived':`<i class="fa-solid fa-box-archive"></i> Show Archived (${n})`}
  const list=visibleEvents();
  if(!list.length){panels.innerHTML=`<div class="empty-state" style="padding:40px"><i class="fa-solid fa-star"></i> No events to evaluate right now.${isCouncil?' Use “Add Event” to create one.':''}</div>`;return}
  const keepIdx=Math.max(0,list.findIndex(e=>'insights-panel-'+e.id===prevActive));
  list.forEach((ev,i)=>{
    const active=i===keepIdx;
    const btn=document.createElement('button');btn.className='insights-nav-btn'+(active?' active':'');
    btn.textContent=ev.label+(ev.archived?' (archived)':'');btn.onclick=()=>insightsTab(ev.id,btn);nav.appendChild(btn);
    const panel=document.createElement('div');panel.className='insights-panel'+(active?' active':'');panel.id='insights-panel-'+ev.id;
    const qrSrc=safeImg(ev.qr);
    const qrHTML=qrSrc?`<img src="${escHtml(qrSrc)}" alt="QR Code for ${escHtml(ev.label)}" style="width:100%;height:100%;object-fit:contain">`:`<div class="qr-placeholder"><i class="fa-solid fa-qrcode"></i>${isCouncil?`<span onclick="openEventEditor(${jsArg(ev.id)})">+ Add QR</span>`:''}</div>`;
    const linkHTML=safeUrl(ev.link)?`<a class="eval-link-btn" href="${escHtml(safeUrl(ev.link))}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-link"></i> Open Evaluation Form</a>`:'';
    const tools=isCouncil?`<button class="btn btn-secondary btn-sm" onclick="openEventEditor(${jsArg(ev.id)})"><i class="fa-solid fa-pen"></i> Edit</button>`+
      (ev.archived?`<button class="btn btn-secondary btn-sm" onclick="eventAction('restoreEvent',${jsArg(ev.id)})"><i class="fa-solid fa-rotate-left"></i> Restore</button>`:`<button class="btn btn-secondary btn-sm" onclick="eventAction('archiveEvent',${jsArg(ev.id)})"><i class="fa-solid fa-box-archive"></i> Archive</button>`)+
      `<button class="btn btn-danger btn-sm" onclick="eventAction('deleteEvent',${jsArg(ev.id)})"><i class="fa-solid fa-trash"></i> Delete</button>`:'';
    panel.innerHTML=`<div class="event-eval-header"><div class="event-eval-info"><div class="event-eval-title">${escHtml(ev.label)}</div><div class="event-eval-desc">${ev.desc?autoLink(ev.desc):'<span style="color:var(--gray4)">No description yet.</span>'}</div><div class="event-eval-actions" style="flex-wrap:wrap">${linkHTML}${tools}</div></div><div class="eval-qr-slot">${qrHTML}</div></div>`;
    panels.appendChild(panel);
  });
}
function insightsTab(id,btn){document.querySelectorAll('.insights-panel').forEach(p=>p.classList.remove('active'));document.querySelectorAll('.insights-nav-btn').forEach(b=>b.classList.remove('active'));const p=document.getElementById('insights-panel-'+id);if(p)p.classList.add('active');if(btn)btn.classList.add('active')}
function toggleEventArchive(){S.showArchivedEvents=!S.showArchivedEvents;renderInsights()}
function openEventEditor(id){
  if(!isCouncilUser())return;
  const ev=id?S.events.find(e=>e.id===id):null;
  S.editingEventId=ev?ev.id:null;
  document.getElementById('ev-modal-title').textContent=ev?'Edit Event':'Add Event';
  document.getElementById('ev-label').value=ev?ev.label:'';
  document.getElementById('ev-desc').value=ev?(ev.desc||''):'';
  document.getElementById('ev-link').value=ev?(ev.link||''):'';
  document.getElementById('ev-qr-input').value='';
  document.getElementById('ev-qr-remove').checked=false;
  const hasQr=!!(ev&&ev.qr);
  document.getElementById('ev-qr-current').textContent=hasQr?'A QR code is set. Choose a new image to replace it.':'No QR code set.';
  document.getElementById('ev-qr-remove-wrap').style.display=hasQr?'block':'none';
  document.getElementById('event-modal').classList.add('open');
}
function closeEventEditor(){document.getElementById('event-modal').classList.remove('open')}
document.getElementById('event-modal').addEventListener('click',e=>{if(e.target===document.getElementById('event-modal'))closeEventEditor()});
function fileToDataUrl(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(new Error('read failed'));r.readAsDataURL(file)})}
async function saveEvent(){
  if(!isCouncilUser())return;
  const label=document.getElementById('ev-label').value.trim();
  const description=document.getElementById('ev-desc').value.trim();
  const link=document.getElementById('ev-link').value.trim();
  if(!label){toast('Please enter an event name.','warn');return}
  if(link&&!/^https?:\/\//i.test(link)){toast('The link must start with http:// or https://','warn');return}
  const editing=S.editingEventId?S.events.find(e=>e.id===S.editingEventId):null;
  let qr=editing&&!document.getElementById('ev-qr-remove').checked?(editing.qr||''):'';
  const btn=document.getElementById('ev-save-btn');btn.disabled=true;btn.textContent='Saving…';
  try{
    const f=document.getElementById('ev-qr-input').files[0];
    if(f){
      if(!/^image\/(png|jpeg|webp|gif)$/.test(f.type)){toast('QR must be a PNG, JPG, WebP or GIF image.','warn');return}
      if(f.size>2*1024*1024){toast('QR image must be under 2 MB.','warn');return}
      const dataUrl=await fileToDataUrl(f);
      const up=await apiPost({action:'uploadFile',base64:dataUrl.split(',')[1],fileName:f.name,mimeType:f.type});
      if(!up||!up.fileUrl){toast((up&&up.error)||'QR upload failed.','warn');return}
      qr=up.fileUrl;
    }
    const body={action:editing?'updateEvent':'addEvent',label,description,link,qr};
    if(editing)body.id=editing.id;
    const res=await apiPost(body);
    if(!res||!res.ok){if(!res||res.error!=='unauthorized')toast((res&&res.error)||'Could not save the event.','warn');return}
    closeEventEditor();
    await loadEvents();
    toast(editing?'Event updated.':'Event added.','ok');
  }catch(e){toast('Could not reach the server.','warn')}
  finally{btn.disabled=false;btn.textContent='Save'}
}
async function eventAction(action,id){
  if(!isCouncilUser())return;
  if(action==='deleteEvent'&&!confirm('Permanently delete this event? This cannot be undone.\n\nTip: use Archive to hide it but keep it.'))return;
  let res;
  try{res=await apiPost({action,id})}catch(e){toast('Could not reach the server.','warn');return}
  if(!res||!res.ok){if(!res||res.error!=='unauthorized')toast((res&&res.error)||'Action failed.','warn');return}
  await loadEvents();
  toast(action==='deleteEvent'?'Event deleted.':action==='archiveEvent'?'Event archived.':'Event restored.','ok');
}

/* ════════════════════════════════════════════════════════
   MEMBERS & COUNSELORS (with description modal)
════════════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════════════
   TEAM SYNC (Council member photos/descriptions)
   Backed by the "Team" sheet via getTeam/saveTeamMember, so a
   photo or description edited by Council/Admin shows up for every
   student — not just in the editor's own browser.
════════════════════════════════════════════════════════ */
async function loadTeam(){
  try{
    const d=await apiGet({action:'getTeam'});
    if(d&&Array.isArray(d.team)){
      const map={};
      d.team.forEach(t=>{ map[t.type+'_'+t.key]={photo:t.photo||'',description:t.description||''}; });
      S.team=map;
    }
  }catch(e){/* offline — keep whatever we last had */}
  renderMembers();
}
function getTeamEntry(type,key){return S.team[type+'_'+key]||{photo:'',description:''}}

function renderMembers(){
  document.getElementById('member-grid').innerHTML=MEMBERS.map(m=>{
    const pic=getTeamEntry('member',m.i).photo;
    const av=pic?`<img src="${escHtml(safeImg(pic))}" alt="${escHtml(m.name)}">`:`<span>${firstInitial(m.name)}</span>`;
    const canEdit=S.user&&(S.user.role==='council'||S.user.role==='admin');
    const uploadHTML=canEdit?`<label class="member-pic-upload" title="Upload photo" onclick="event.stopPropagation()"><i class="fa-solid fa-camera"></i><input type="file" accept="image/*" onchange="handlePersonPic('member','${m.i}',this)"></label>`:'';
    return `<div class="member-card" onclick="openPersonModal('member','${m.i}')"><div class="member-av-wrap"><div class="member-av">${av}</div>${uploadHTML}</div><div class="member-name">${m.name}</div><div class="member-role">${m.role}</div></div>`;
  }).join('');
}
/* ── Guidance counselors (editable by the SWC) ───────────────────── */
async function loadCounselors(){
  try{const d=await apiGet({action:'getCounselors'});if(d&&Array.isArray(d.counselors))S.counselors=d.counselors}catch(e){/* offline — keep last copy */}
  renderCounselors();
}
function counselorInitial(name){
  return firstInitial(String(name||'').replace(/^\s*(ms|mr|mrs|dr|engr|atty|prof)\.?\s+/i,''));
}
function counselorAvatar(c){
  return c.photo?`<img src="${escHtml(safeImg(c.photo))}" alt="${escHtml(c.name)}">`:`<span>${escHtml(counselorInitial(c.name))}</span>`;
}
function renderCounselors(){
  const grid=document.getElementById('counselor-grid');
  if(grid){
    grid.innerHTML=S.counselors.length?S.counselors.map(c=>
      `<div class="counselor-card" onclick="openPersonModal('counselor',${jsArg(c.id)})"><div class="counselor-photo">${counselorAvatar(c)}</div><div class="counselor-name">${escHtml(c.name)}</div><div class="counselor-role">${escHtml(c.email)}</div></div>`
    ).join(''):'<div class="empty-state" style="grid-column:1/-1"><i class="fa-solid fa-user-doctor"></i> No counselors listed yet.</div>';
  }
  const ag=document.getElementById('admin-counselor-grid');
  if(ag){
    ag.innerHTML=S.counselors.length?S.counselors.map(c=>
      `<div class="counselor-card admin"><div class="counselor-photo">${counselorAvatar(c)}</div><div class="counselor-name">${escHtml(c.name)}</div><div class="counselor-role">${escHtml(c.email||'No email')}</div><div class="cn-actions"><button class="btn btn-xs btn-secondary" onclick="openCounselorEditor(${jsArg(c.id)})"><i class="fa-solid fa-pen"></i> Edit</button><button class="btn btn-xs btn-danger" title="Remove" onclick="deleteCounselor(${jsArg(c.id)})"><i class="fa-solid fa-trash"></i></button></div></div>`
    ).join(''):'<div class="empty-state" style="grid-column:1/-1"><i class="fa-solid fa-user-doctor"></i> No counselors yet. Click “Add Counselor”.</div>';
  }
}
function isSwcAdmin(){return !!(S.user&&S.user.role==='admin')}
function openCounselorEditor(id){
  if(!isSwcAdmin())return;
  if(!Array.isArray(S.counselors))S.counselors=[];
  const c=id?S.counselors.find(x=>x.id===id):null;
  S.editingCounselorId=c?c.id:null;S.cnPhoto=c?(c.photo||''):'';S.cnPendingFile=null;
  document.getElementById('cn-modal-title').textContent=c?'Edit Counselor':'Add Counselor';
  document.getElementById('cn-name').value=c?c.name:'';
  document.getElementById('cn-email').value=c?(c.email||''):'';
  document.getElementById('cn-desc').value=c?(c.description||''):'';
  document.getElementById('cn-photo-input').value='';
  document.getElementById('cn-photo-remove').checked=false;
  document.getElementById('cn-photo-remove-wrap').style.display=S.cnPhoto?'block':'none';
  paintCounselorPhoto(S.cnPhoto,c?c.name:'');
  document.getElementById('counselor-modal').classList.add('open');
  setTimeout(()=>{const n=document.getElementById('cn-name');if(n)n.focus()},60);
}
function paintCounselorPhoto(src,name){
  document.getElementById('cn-photo-preview').innerHTML=src?`<img src="${escHtml(safeImg(src))}" alt="">`:`<span>${escHtml(counselorInitial(name||document.getElementById('cn-name').value)||'?')}</span>`;
}
async function onCounselorPhotoPicked(input){
  const f=input.files[0];if(!f)return;
  if(!/^image\/(png|jpe?g|webp)$/i.test(f.type)){toast('Please choose a PNG, JPG or WebP image.','warn');input.value='';return}
  if(f.size>2*1024*1024){toast('Image must be under 2 MB.','warn');input.value='';return}
  S.cnPendingFile=f;
  document.getElementById('cn-photo-remove').checked=false;
  try{paintCounselorPhoto(await fileToDataUrl(f),'')}catch(e){}
}
function onCounselorPhotoRemove(cb){
  if(cb.checked){S.cnPendingFile=null;document.getElementById('cn-photo-input').value='';paintCounselorPhoto('','')}
  else paintCounselorPhoto(S.cnPhoto,'');
}
function closeCounselorEditor(){document.getElementById('counselor-modal').classList.remove('open')}
document.getElementById('counselor-modal').addEventListener('click',e=>{if(e.target===document.getElementById('counselor-modal'))closeCounselorEditor()});
async function saveCounselor(){
  if(!isSwcAdmin())return;
  const name=document.getElementById('cn-name').value.trim();
  const email=document.getElementById('cn-email').value.trim();
  const description=document.getElementById('cn-desc').value.trim();
  if(!name){toast('Please enter the counselor’s name.','warn');return}
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){toast('Please enter a valid email address.','warn');return}
  const btn=document.getElementById('cn-save-btn');btn.disabled=true;btn.textContent='Saving…';
  try{
    let photo=document.getElementById('cn-photo-remove').checked?'':S.cnPhoto;
    if(S.cnPendingFile){
      const dataUrl=await fileToDataUrl(S.cnPendingFile);
      const up=await apiPost({action:'uploadFile',base64:dataUrl.split(',')[1],fileName:S.cnPendingFile.name,mimeType:S.cnPendingFile.type});
      if(!up||!up.fileUrl){toast((up&&up.error&&up.error!=='unauthorized')?up.error:'Photo upload failed.','warn');return}
      photo=up.fileUrl;
    }
    const keepExistingPhoto=!!(S.editingCounselorId&&S.cnPhoto&&!document.getElementById('cn-photo-remove').checked&&!S.cnPendingFile);
    const res=await apiPost({action:'saveCounselor',id:S.editingCounselorId||'',name,email,description,photo:keepExistingPhoto?'':photo,keepExistingPhoto});
    if(!res||!res.ok){if(!res||res.error!=='unauthorized')toast((res&&res.error)||'Could not save.','warn');return}
    closeCounselorEditor();
    await loadCounselors();
    toast(S.editingCounselorId?'Counselor updated for everyone!':'Counselor added!','ok');
  }catch(e){toast('Could not reach the server.','warn')}
  finally{btn.disabled=false;btn.textContent='Save'}
}
async function deleteCounselor(id){
  if(!isSwcAdmin())return;
  const c=S.counselors.find(x=>x.id===id);
  if(!confirm(`Remove ${c?c.name:'this counselor'} from the list? Students will no longer see them.`))return;
  let res;
  try{res=await apiPost({action:'deleteCounselor',id})}catch(e){toast('Could not reach the server.','warn');return}
  if(!res||!res.ok){if(!res||res.error!=='unauthorized')toast((res&&res.error)||'Could not remove.','warn');return}
  await loadCounselors();toast('Counselor removed.','ok');
}

/* ── About SWC (editable by the SWC) ─────────────────────────────── */
async function loadAbout(){
  try{const d=await apiGet({action:'getAbout'});if(d&&d.about)S.about=d.about}catch(e){}
  renderAbout();fillAboutForm();
}
function aboutHTML(a){
  a=a||{};
  const has=['title','body','hours','location','contact'].some(k=>a[k]&&a[k].trim());
  if(!has)return '<div class="empty-state"><i class="fa-solid fa-circle-info"></i> The SWC hasn’t added this section yet.</div>';
  const paras=(a.body||'').split(/\n{2,}/).map(t=>t.trim()).filter(Boolean).map(t=>`<p>${escHtml(t).replace(/\n/g,'<br>')}</p>`).join('');
  const fact=(ic,lbl,v)=>v&&v.trim()?`<div class="about-fact"><i class="fa-solid ${ic}"></i><div><b>${lbl}</b>${escHtml(v).replace(/\n/g,'<br>')}</div></div>`:'';
  const facts=fact('fa-clock','Office Hours',a.hours)+fact('fa-location-dot','Location',a.location)+fact('fa-envelope','Contact',a.contact);
  return `<div class="about-view">${a.title?`<h3>${escHtml(a.title)}</h3>`:''}${paras}${facts?`<div class="about-facts">${facts}</div>`:''}</div>`;
}
function renderAbout(){
  const v=document.getElementById('about-swc-view');if(v)v.innerHTML=aboutHTML(S.about);
  previewAbout();
}
function readAboutForm(){
  const g=id=>{const e=document.getElementById(id);return e?e.value:''};
  return {title:g('about-title'),body:g('about-body'),hours:g('about-hours'),location:g('about-location'),contact:g('about-contact')};
}
function fillAboutForm(){
  const a=S.about||{};
  [['about-title','title'],['about-body','body'],['about-hours','hours'],['about-location','location'],['about-contact','contact']]
    .forEach(([id,k])=>{const e=document.getElementById(id);if(e)e.value=a[k]||''});
  previewAbout();
}
function previewAbout(){
  const pv=document.getElementById('about-admin-preview');if(pv)pv.innerHTML=aboutHTML(readAboutForm());
}
['about-title','about-body','about-hours','about-location','about-contact'].forEach(id=>{
  const e=document.getElementById(id);if(e)e.addEventListener('input',previewAbout);
});
async function saveAbout(){
  if(!isSwcAdmin())return;
  const data=readAboutForm();
  const btn=document.getElementById('about-save-btn');btn.disabled=true;
  let res;
  try{res=await apiPost({action:'saveAbout',...data})}
  catch(e){toast('Could not reach the server.','warn');btn.disabled=false;return}
  btn.disabled=false;
  if(!res||!res.ok){if(!res||res.error!=='unauthorized')toast((res&&res.error)||'Could not save.','warn');return}
  S.about={...data};renderAbout();
  toast('About SWC saved — students can see it now.','ok');
}

async function handlePersonPic(type,key,input){
  const file=input.files[0];if(!file) return;
  if(file.size>2*1024*1024){toast('Image must be under 2 MB.','warn');return}
  const reader=new FileReader();
  reader.onload=async e=>{
    let src=e.target.result; // instant local preview / offline fallback
    if(!S.team[type+'_'+key])S.team[type+'_'+key]={photo:'',description:''};
    S.team[type+'_'+key].photo=src;
    renderMembers();
    try{
      const up=await apiPost({action:'uploadFile',base64:src.split(',')[1],fileName:file.name,mimeType:file.type});
      if(up&&up.fileUrl){
        src=up.fileUrl;
        S.team[type+'_'+key].photo=src;
        await apiPost({action:'saveTeamMember',type,key,photo:src,updatedBy:S.user?S.user.username:''});
        renderMembers();
        toast('Photo updated for everyone!','ok');
      }else{
        toast('Photo saved on this device only (upload failed).','warn');
      }
    }catch(err){toast('Offline — photo saved on this device only.','warn')}
  };
  reader.readAsDataURL(file);
}

/* Person (council member / counselor) detail + editable description modal */
function getPersonList(type){return type==='member'?MEMBERS:S.counselors.map(c=>({name:c.name,role:c.email,i:c.id}))}
function canEditPerson(type){
  if(!S.user) return false;
  if(type==='member') return S.user.role==='council'||S.user.role==='admin';
  // Counselors are edited from the SWC's Counselors page (see openCounselorEditor), not from this modal.
  return false;
}
function openPersonModal(type,key){
  S.pmType=type;S.pmKey=key;
  const person=getPersonList(type).find(p=>p.i===key);if(!person) return;
  const entry=type==='counselor'?(S.counselors.find(c=>c.id===key)||{}):getTeamEntry(type,key);
  document.getElementById('pm-av').innerHTML=entry.photo?`<img src="${escHtml(safeImg(entry.photo))}">`:`<span>${firstInitial(person.name)}</span>`;
  document.getElementById('pm-name').textContent=person.name;
  document.getElementById('pm-role').textContent=person.role;
  const desc=entry.description||'No description yet.';
  document.getElementById('pm-desc').textContent=desc;
  document.getElementById('pm-desc-input').value=desc==='No description yet.'?'':desc;
  document.getElementById('pm-view-mode').classList.remove('hidden');
  document.getElementById('pm-edit-mode').classList.add('hidden');
  const editBtn=document.getElementById('pm-edit-btn');const saveBtn=document.getElementById('pm-save-btn');
  saveBtn.classList.add('hidden');
  editBtn.classList.toggle('hidden',!canEditPerson(type));
  document.getElementById('person-modal').classList.add('open');
}
function enterPersonEditMode(){
  document.getElementById('pm-view-mode').classList.add('hidden');
  document.getElementById('pm-edit-mode').classList.remove('hidden');
  document.getElementById('pm-edit-btn').classList.add('hidden');
  document.getElementById('pm-save-btn').classList.remove('hidden');
}
async function savePersonDesc(){
  const val=document.getElementById('pm-desc-input').value.trim();
  const type=S.pmType,key=S.pmKey;
  if(!S.team[type+'_'+key])S.team[type+'_'+key]={photo:'',description:''};
  S.team[type+'_'+key].description=val;
  document.getElementById('pm-desc').textContent=val||'No description yet.';
  document.getElementById('pm-view-mode').classList.remove('hidden');
  document.getElementById('pm-edit-mode').classList.add('hidden');
  document.getElementById('pm-edit-btn').classList.remove('hidden');
  document.getElementById('pm-save-btn').classList.add('hidden');
  try{
    await apiPost({action:'saveTeamMember',type,key,description:val,updatedBy:S.user?S.user.username:''});
    toast('Description saved for everyone!','ok');
  }catch(err){toast('Offline — description saved on this device only.','warn')}
}
function closePersonModal(){document.getElementById('person-modal').classList.remove('open')}
document.addEventListener('DOMContentLoaded',()=>{
  const pm=document.getElementById('person-modal');
  if(pm)pm.addEventListener('click',e=>{if(e.target===pm)closePersonModal()});
});

/* ════════════════════════════════════════════════════════
   RESOURCES (free-form uploads, any file format)
════════════════════════════════════════════════════════ */
function fileExtIcon(name){
  const ext=(name.split('.').pop()||'').toLowerCase();
  if(ext==='pdf') return {cls:'pdf',icon:'fa-file-pdf'};
  if(ext==='doc'||ext==='docx') return {cls:'docx',icon:'fa-file-word'};
  if(ext==='xls'||ext==='xlsx'||ext==='csv') return {cls:'xlsx',icon:'fa-file-excel'};
  if(ext==='ppt'||ext==='pptx') return {cls:'file',icon:'fa-file-powerpoint'};
  if(['jpg','jpeg','png','gif','webp'].includes(ext)) return {cls:'file',icon:'fa-file-image'};
  if(ext==='zip'||ext==='rar') return {cls:'file',icon:'fa-file-zipper'};
  return {cls:'file',icon:'fa-file'};
}
async function loadResources(){
  try{const d=await apiGet({action:'getResources'});if(d&&Array.isArray(d.resources))S.resources=d.resources}catch(e){}
  renderResources();
}
function renderResources(){
  const list=document.getElementById('resource-list');if(!list) return;
  if(!S.resources.length){
    list.innerHTML='<div class="feed-empty"><i class="fa-solid fa-folder-open"></i><p>No resources uploaded yet.</p></div>';
    return;
  }
  const canManage=S.user&&(S.user.role==='council'||S.user.role==='admin');
  list.innerHTML=S.resources.map((r,idx)=>{
    const meta=fileExtIcon(String(r.name||''));
    const delBtn=canManage?`<button class="btn btn-xs btn-danger" onclick="deleteResource(${idx})" style="margin-left:6px"><i class="fa-solid fa-trash"></i></button>`:'';
    return `<div class="resource-item"><div class="res-icon ${meta.cls}"><i class="fa-solid ${meta.icon}"></i></div><div class="res-info"><div class="res-name">${escHtml(r.name)}</div><div class="res-desc">Uploaded ${escHtml(r.date||'')}</div></div><a class="btn btn-secondary btn-sm" href="${escHtml(safeUrl(r.url)||'#')}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-download"></i> Open</a>${delBtn}</div>`;
  }).join('');
}
async function handleResourceUpload(input){
  if(!isCouncilUser()){toast('Only Council accounts can upload resources.','warn');input.value='';return}
  const file=input.files[0];if(!file) return;
  if(file.size>20*1024*1024){toast('File must be under 20 MB.','warn');input.value='';return}
  toast('Uploading…','ok');
  const reader=new FileReader();
  reader.onload=async e=>{
    const b64=e.target.result;
    let url=b64;
    try{
      const res=await apiPost({action:'uploadFile',base64:b64.split(',')[1],fileName:file.name,mimeType:file.type});
      if(res&&res.fileUrl) url=res.fileUrl;
    }catch(err){/* offline — keep local data url */}
    const entry={id:Date.now(),name:file.name,url,date:fmtDate(new Date())};
    try{
      const saved=await apiPost({action:'addResource',name:entry.name,url:entry.url,date:entry.date,uploadedBy:S.user?S.user.username:''});
      if(saved&&saved.id) entry.id=saved.id;
      toast('File uploaded — visible to everyone!','ok');
    }catch(err){toast('Offline — file saved on this device only.','warn')}
    S.resources.unshift(entry);
    renderResources();
  };
  reader.readAsDataURL(file);
  input.value='';
}
async function deleteResource(idx){
  if(!confirm('Remove this resource for everyone?')) return;
  const entry=S.resources[idx];
  S.resources.splice(idx,1);
  renderResources();
  if(entry&&entry.id){try{await apiPost({action:'deleteResource',id:entry.id})}catch(err){}}
  toast('Resource removed.','ok');
}

/* ════════════════════════════════════════════════════════
   ADMIN / COUNCIL REFRESH & STATS
════════════════════════════════════════════════════════ */
async function refreshAdmin(){toast('Refreshing…','ok');await Promise.all([loadPosts(),loadAppointments()]);toast('Data refreshed!','ok')}
async function refreshCouncil(){toast('Refreshing…','ok');await Promise.all([loadConcerns(),loadEvals()]);toast('Refreshed!','ok')}
function updateStats(){
  const el=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v};
  el('stat-posts',S.posts.length);el('stat-bookings',S.appointments.filter(a=>!a.Archived).length);
}

/* ════════════════════════════════════════════════════════
   ADMIN TABS
════════════════════════════════════════════════════════ */
function switchTab(id,btn){
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-'+id).classList.add('active');if(btn)btn.classList.add('active');
}

/* ════════════════════════════════════════════════════════
   PASSWORD
════════════════════════════════════════════════════════ */
async function changePassword(){
  if(!S.user||S.user.role==='student'||!S.user.token){toast('Only Council/Admin accounts have passwords.','warn');return}
  const cur=document.getElementById('pw-cur').value;const nw=document.getElementById('pw-new').value;const cf=document.getElementById('pw-cf').value;
  if(!cur){toast('Enter your current password.','warn');return}
  if(nw.length<8){toast('New password must be at least 8 characters.','warn');return}
  if(nw!==cf){toast('Passwords do not match.','warn');return}
  let res;
  try{res=await apiPost({action:'changePassword',currentPassword:cur,newPassword:nw})}
  catch(e){toast('Could not reach the server. Password not changed.','warn');return}
  if(!res||!res.ok){toast((res&&res.error&&res.error!=='unauthorized')?res.error:'Could not change the password.','warn');return}
  document.getElementById('pw-cur').value='';document.getElementById('pw-new').value='';document.getElementById('pw-cf').value='';
  toast('Password updated! Other devices were signed out.','ok');
}

/* ════════════════════════════════════════════════════════
   PROFILE (name, username, picture)
════════════════════════════════════════════════════════ */
function paintAvatar(el,user){
  if(!el)return;
  const src=user&&user.avatar?safeImg(user.avatar):'';
  if(src){el.textContent='';const im=document.createElement('img');im.src=src;im.alt='';im.style.cssText='width:100%;height:100%;object-fit:cover;border-radius:50%';el.appendChild(im)}
  else{el.textContent=firstInitial(user&&user.name)}
}
function refreshProfileUI(){
  const u=S.user;if(!u)return;
  paintAvatar(document.getElementById('top-av'),u);
  paintAvatar(document.getElementById('profile-pic-preview'),u);
  paintAvatar(document.getElementById('comp-av'),u);
  const cn=document.getElementById('comp-name');if(cn)cn.textContent=u.name;
  document.getElementById('set-name').value=u.name||'';
  document.getElementById('set-username').value=u.role==='student'?'Guest':(u.username||'');
  const cp=document.getElementById('set-curpw');if(cp)cp.value='';
}
async function saveProfile(){
  const u=S.user;if(!u||u.role==='student'||!u.token){toast('Only Council/Admin accounts have a profile.','warn');return}
  const name=document.getElementById('set-name').value.trim();
  const username=document.getElementById('set-username').value.trim();
  const currentPassword=document.getElementById('set-curpw').value;
  if(name.length<2){toast('Display name must be at least 2 characters.','warn');return}
  if(!/^[A-Za-z0-9_.-]{3,32}$/.test(username)){toast('Username: 3–32 letters, numbers, dot, dash or underscore.','warn');return}
  const body={action:'updateProfile'};
  if(name!==u.name)body.name=name;
  if(username!==u.username){
    if(!currentPassword){toast('Enter your current password to change your username.','warn');return}
    body.username=username;body.currentPassword=currentPassword;
  }
  if(Object.keys(body).length===1){toast('No changes to save.','ok');return}
  let res;
  try{res=await apiPost(body)}catch(e){toast('Could not reach the server.','warn');return}
  if(!res||!res.ok){if(!res||res.error!=='unauthorized')toast((res&&res.error)||'Could not update your profile.','warn');return}
  S.user={...u,username:res.username,name:res.name,initial:res.initial,avatar:res.avatar||''};
  refreshProfileUI();
  toast('Profile updated.','ok');
}
/* Resize to a square JPEG (max 400px) so avatars stay small and consistent. */
function resizeToSquareJpeg(file,size=400){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file);const img=new Image();
    img.onload=()=>{
      const side=Math.min(img.width,img.height);const out=Math.min(size,side);
      const c=document.createElement('canvas');c.width=c.height=out;
      const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,out,out);
      ctx.drawImage(img,(img.width-side)/2,(img.height-side)/2,side,side,0,0,out,out);
      URL.revokeObjectURL(url);resolve(c.toDataURL('image/jpeg',0.88));
    };
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('bad image'))};
    img.src=url;
  });
}
async function handleAvatarUpload(input){
  const file=input.files&&input.files[0];input.value='';
  if(!file)return;
  if(!S.user||!S.user.token){toast('Only Council/Admin accounts have a profile picture.','warn');return}
  if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type)){toast('Please choose a JPG, PNG, WebP or GIF image.','warn');return}
  if(file.size>8*1024*1024){toast('Image must be under 8 MB.','warn');return}
  try{
    const dataUrl=await resizeToSquareJpeg(file);
    const up=await apiPost({action:'uploadFile',base64:dataUrl.split(',')[1],fileName:'avatar.jpg',mimeType:'image/jpeg'});
    if(!up||!up.fileUrl){toast((up&&up.error)||'Upload failed.','warn');return}
    const res=await apiPost({action:'updateProfile',avatar:up.fileUrl});
    if(!res||!res.ok){toast((res&&res.error)||'Could not save your picture.','warn');return}
    S.user.avatar=res.avatar||'';refreshProfileUI();toast('Profile picture updated.','ok');
  }catch(e){toast('Could not process that image.','warn')}
}
async function removeAvatar(){
  if(!S.user||!S.user.token||!S.user.avatar){toast('No profile picture to remove.','ok');return}
  const res=await apiPost({action:'updateProfile',avatar:''});
  if(!res||!res.ok){toast((res&&res.error)||'Could not remove your picture.','warn');return}
  S.user.avatar='';refreshProfileUI();toast('Profile picture removed.','ok');
}

/* ════════════════════════════════════════════════════════
   MODAL / TOAST / LIGHTBOX
════════════════════════════════════════════════════════ */
function closeModal(){document.getElementById('modal').classList.remove('open')}
document.getElementById('modal').addEventListener('click',e=>{if(e.target===document.getElementById('modal'))closeModal()});
let toastTimer;
function toast(msg,type='ok'){
  const t=document.getElementById('toast');const i=document.getElementById('toast-icon');const s=document.getElementById('toast-msg');
  s.textContent=' '+msg;
  if(type==='ok'){t.style.background='#1e5c3a';i.className='fa-solid fa-circle-check'}
  else if(type==='err'||type==='error'){t.style.background='var(--red)';i.className='fa-solid fa-circle-xmark'}
  else{t.style.background='var(--amber)';i.className='fa-solid fa-triangle-exclamation'}
  t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),3500);
}
function openLightbox(src){document.getElementById('lb-img').src=src;document.getElementById('lightbox').classList.add('open')}
function closeLightbox(){document.getElementById('lightbox').classList.remove('open')}
document.getElementById('lightbox').addEventListener('click',e=>{if(e.target===document.getElementById('lightbox'))closeLightbox()});

/* ════════════════════════════════════════════════════════
   BOOT
════════════════════════════════════════════════════════ */
(function(){if(localStorage.getItem('dlinkDark')==='1')document.body.classList.add('dark-mode')})();

/* Intro splash is now handled by a small inline <script> right after
   #intro-splash in index.html, so it can never be blocked by an error
   anywhere else in this file. See index.html for that logic. */

/* ════════════════════════════════════════════════════════
   GLOBAL SEARCH — "Search Project LINK"
   Searches nav sections, announcements, resources, council
   members, counselors, and events. Client-side, instant.
════════════════════════════════════════════════════════ */
const SEARCH_SECTIONS=[
  {id:'home',page:'home',icon:'fa-house',title:'Home',desc:'Latest announcements & carousel',keywords:'home feed announcements news updates'},
  {id:'animo-voice',page:'animo-voice',icon:'fa-bell',title:'Animo Voice',desc:'Submit or track a concern',keywords:'animo voice concern complaint report feedback submit'},
  {id:'sw-care',page:'sw-care',img:'assets/swc.png',icon:'fa-heart-pulse',title:'SWCare Desk',desc:'Book a wellness appointment',keywords:'sw care desk wellness counseling counselors about swc appointment booking guidance'},
  {id:'council-dash',page:'council-dash',icon:'fa-chart-line',title:'HSSC Dashboard',desc:'Council overview & stats',keywords:'dashboard council stats overview'},
  {id:'lasallian-insights',page:'lasallian-insights',img:'assets/lasallian-star.png',icon:'fa-star',title:'Lasallian Insights',desc:'Event evaluations & ratings',keywords:'insights evaluations ratings events ecq greenify pasinaya siyasat pattaraday'},
  {id:'hssc-info',page:'hssc-info',img:'assets/sc.png',icon:'fa-building-columns',title:'HS SC Information',desc:'Meet the Student Council',keywords:'hssc information about council members meet the team'},
  {id:'resources',page:'resources',icon:'fa-folder-open',title:'Resources',desc:'Files & downloadable resources',keywords:'resources files downloads documents links'},
  {id:'settings',page:'settings',icon:'fa-gear',title:'Settings',desc:'Account & profile settings',keywords:'settings account profile password dark mode'},
  {id:'admin',page:'admin',icon:'fa-calendar-check',title:'Appointments',desc:'SWC calendar & bookings',keywords:'admin appointments bookings schedule calendar unavailable'},
  {id:'admin-counselors',page:'admin-counselors',icon:'fa-user-doctor',title:'Counselors',desc:'Manage guidance counselors',keywords:'counselors guidance edit add'},
  {id:'admin-about',page:'admin-about',icon:'fa-circle-info',title:'About SWC',desc:'Edit the About SWC page',keywords:'about swc edit information hours location'},
];

function escHtml(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function hlMatch(text,q){
  const t=escHtml(text||''); if(!q) return t;
  try{ return t.replace(new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','ig'),'<mark class="sr-hl">$1</mark>'); }
  catch(e){ return t; }
}

function buildSearchIndex(q){
  const query=q.trim().toLowerCase();
  if(!query) return null;
  const groups=[];

  // Sections (only ones visible to current role)
  const allowedPages=(S.user&&NAV[S.user.role]||[]).map(n=>n.id);
  const secMatches=SEARCH_SECTIONS.filter(s=>allowedPages.includes(s.page)&&(s.title.toLowerCase().includes(query)||s.keywords.includes(query)||s.desc.toLowerCase().includes(query)));
  if(secMatches.length) groups.push({label:'Sections',items:secMatches.map(s=>({
    icon:s.icon,img:s.img,title:s.title,desc:s.desc,action:()=>{navigate(s.page);document.querySelectorAll('.nav-item').forEach(b=>{if(b.dataset.page===s.page)b.classList.add('active');else b.classList.remove('active')})}
  }))});

  // Announcements / posts
  const postMatches=(S.posts||[]).filter(p=>((p.heading||'')+' '+(p.text||'')+' '+(p.author||'')).toLowerCase().includes(query)).slice(0,5);
  if(postMatches.length) groups.push({label:'Announcements',items:postMatches.map(p=>({
    icon:'fa-bullhorn',title:p.heading||'Announcement',desc:(p.text||'').substring(0,60),
    action:()=>{navigate('home');setTimeout(()=>{const el=document.querySelector(`[data-post-id="${p.id}"]`);if(el)el.scrollIntoView({behavior:'smooth',block:'center'})},80)}
  }))});

  // Resources
  const resMatches=(S.resources||[]).filter(r=>((r.name||'')).toLowerCase().includes(query)).slice(0,5);
  if(resMatches.length) groups.push({label:'Resources',items:resMatches.map(r=>({
    icon:'fa-file-lines',title:r.name,desc:'Uploaded by '+(r.uploadedBy||'Council'),
    action:()=>{navigate('resources')}
  }))});

  // Council members & counselors
  const peopleMatches=[...MEMBERS.map(m=>({...m,kind:'member'})),...S.counselors.map(c=>({name:c.name,role:c.email||'Guidance Counselor',i:c.id,kind:'counselor'}))]
    .filter(p=>p.name.toLowerCase().includes(query)||p.role.toLowerCase().includes(query)).slice(0,6);
  if(peopleMatches.length) groups.push({label:'HSSC Team',items:peopleMatches.map(p=>({
    icon:'fa-user',title:p.name,desc:p.role,
    action:()=>{if(p.kind==='member')navigate('hssc-info');else if(S.user&&S.user.role==='student')navigate('sw-care');else if(isSwcAdmin())navigate('admin-counselors');setTimeout(()=>openPersonModal(p.kind,p.i),80)}
  }))});

  // Events
  const evMatches=S.events.filter(e=>!e.archived&&(e.label.toLowerCase().includes(query)||(e.desc||'').toLowerCase().includes(query))).slice(0,4);
  if(evMatches.length) groups.push({label:'Events',items:evMatches.map(e=>({
    icon:'fa-calendar-star',title:e.label,desc:(e.desc||'').substring(0,60),
    action:()=>{navigate('lasallian-insights')}
  }))});

  return {query,groups};
}

function renderSearchResults(result,containerId){
  const el=document.getElementById(containerId);
  if(!el) return;
  if(!result||!result.groups.length){
    el.innerHTML=`<div class="sr-empty"><i class="fa-solid fa-magnifying-glass"></i>No results for "${escHtml(result?result.query:'')}"</div>`;
    el.classList.add('open');
    return;
  }
  el.innerHTML=result.groups.map(g=>`
    <div class="sr-group-label">${g.label}</div>
    ${g.items.map((it,idx)=>`<div class="sr-item" data-gi="${g.label}-${idx}"><div class="sr-icon${it.img?' has-logo':''}">${it.img?`<img src="${it.img}" alt="">`:`<i class="fa-solid ${it.icon}"></i>`}</div><div class="sr-text"><div class="sr-title">${hlMatch(it.title,result.query)}</div><div class="sr-desc">${hlMatch(it.desc,result.query)}</div></div></div>`).join('')}
  `).join('');
  // wire clicks
  let flat=[]; result.groups.forEach(g=>g.items.forEach(it=>flat.push(it)));
  Array.from(el.querySelectorAll('.sr-item')).forEach((node,i)=>{
    node.onclick=()=>{flat[i].action();clearGlobalSearch();closeMobileSearch()};
  });
  el.classList.add('open');
}

let searchDebounce=null;
function handleGlobalSearch(val,isMobile){
  clearTimeout(searchDebounce);
  const clearBtn=document.getElementById('tb-search-clear');
  if(clearBtn) clearBtn.classList.toggle('hidden',!val);
  searchDebounce=setTimeout(()=>{
    const result=buildSearchIndex(val||'');
    if(!val){ closeGlobalSearch(); if(isMobile){const m=document.getElementById('mobile-search-results');if(m)m.innerHTML='';} return; }
    renderSearchResults(result,isMobile?'mobile-search-results':'tb-search-results');
  },120);
}
function clearGlobalSearch(){
  const input=document.getElementById('tb-search-input');
  if(input) input.value='';
  const clearBtn=document.getElementById('tb-search-clear');
  if(clearBtn) clearBtn.classList.add('hidden');
  closeGlobalSearch();
}
function closeGlobalSearch(){
  const el=document.getElementById('tb-search-results');
  if(el){ el.classList.remove('open'); el.innerHTML=''; }
}
function openMobileSearch(){
  document.getElementById('mobile-search-overlay').classList.add('open');
  setTimeout(()=>document.getElementById('mobile-search-input').focus(),60);
}
function closeMobileSearch(){
  const ov=document.getElementById('mobile-search-overlay');
  if(ov) ov.classList.remove('open');
  const input=document.getElementById('mobile-search-input');
  if(input) input.value='';
  const res=document.getElementById('mobile-search-results');
  if(res) res.innerHTML='';
}
document.addEventListener('click',e=>{
  const wrap=document.getElementById('tb-search-wrap');
  const results=document.getElementById('tb-search-results');
  if(results && results.classList.contains('open') && wrap && !wrap.contains(e.target)){
    closeGlobalSearch();
  }
});

/* ════════════════════════════════════════════════════════
   CHAT ASSISTANT — "LINK Assistant"
   Lightweight rule-based helper that answers common questions
   about using Project LINK and can jump users to the right
   section. Runs fully client-side (no external API).
════════════════════════════════════════════════════════ */
const CHAT_INTENTS=[
  {kw:['concern','complain','report','issue','animo voice','bully'],
   reply:"You can submit a concern through **Animo Voice**. You can choose to submit anonymously, pick an urgency level, and even attach a file. Want me to take you there?",
   action:{label:'Open Animo Voice',page:'animo-voice'}},
  {kw:['appointment','counsel','wellness','sw care','swcare','book'],
   reply:"You can book a wellness appointment through the **SWCare Desk**. Pick a date, an available time slot, and your concern category.",
   action:{label:'Open SWCare Desk',page:'sw-care'}},
  {kw:['resource','file','download','document'],
   reply:"All shared files and documents from the Council live in **Resources**.",
   action:{label:'Open Resources',page:'resources'}},
  {kw:['council','member','who is','officer','president'],
   reply:"You can meet the whole HS Student Council under **HS SC Information**.",
   action:{label:'Meet the Council',page:'hssc-info'}},
  {kw:['event','greenify','pasinaya','siyasat','pattaraday','rating','evaluation','insight'],
   reply:"Event highlights and evaluation ratings are under **Lasallian Insights**.",
   action:{label:'Open Lasallian Insights',page:'lasallian-insights'}},
  {kw:['password','account','profile','dark mode','setting'],
   reply:"You can manage your name, profile picture, password, and dark mode from **Settings**.",
   action:{label:'Open Settings',page:'settings'}},
  {kw:['login','sign in','admin','password reset','forgot'],
   reply:"Students can just enter the portal as a guest. Council/Admin accounts sign in from the Menu → Admin/Council Login. For a password reset, email ADU0012@hs.dlsud.edu.ph."},
  {kw:['hi','hello','hey','good morning','good afternoon'],
   reply:"Hey there! 👋 I'm the LINK Assistant. I can help you find your way around Project LINK — try asking about concerns, appointments, resources, or the Student Council."},
  {kw:['thank','thanks','ty'],
   reply:"You're welcome! Let me know if there's anything else you need. 🌿"},
  {kw:['who are you','what are you','your name'],
   reply:"I'm the LINK Assistant — a quick-help guide built into Project LINK to help you navigate the portal and find things faster."},
];
const CHAT_QUICK_REPLIES=[
  {label:'Submit a concern',page:'animo-voice'},
  {label:'Book an appointment',page:'sw-care'},
  {label:'Meet the Council',page:'hssc-info'},
  {label:'Browse resources',page:'resources'},
];
let chatState={open:false,started:false};

function toggleChat(force){
  const panel=document.getElementById('chat-panel');
  const fab=document.getElementById('chat-fab');
  chatState.open=(typeof force==='boolean')?force:!chatState.open;
  panel.classList.toggle('open',chatState.open);
  fab.classList.toggle('open',chatState.open);
  if(chatState.open){
    document.getElementById('chat-fab-dot').style.display='none';
    if(!chatState.started){ startChat(); }
    setTimeout(()=>{const i=document.getElementById('chat-input');if(i)i.focus()},200);
  }
}

function startChat(){
  chatState.started=true;
  appendChatMsg('bot',"Hi! I'm the **LINK Assistant** 🌿 Ask me anything about Project LINK, or tap a quick option below.");
  renderChatQuickReplies(CHAT_QUICK_REPLIES);
}

function appendChatMsg(who,text){
  const box=document.getElementById('chat-messages');
  const div=document.createElement('div');
  div.className='chat-msg '+who;
  div.innerHTML=formatChatText(text);
  box.appendChild(div);
  box.scrollTop=box.scrollHeight;
}
function formatChatText(text){
  return escHtml(text).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
}

function renderChatQuickReplies(list){
  const wrap=document.getElementById('chat-quick-replies');
  wrap.innerHTML=(list||[]).map(q=>`<button type="button" class="chat-chip">${escHtml(q.label)}</button>`).join('');
  Array.from(wrap.querySelectorAll('.chat-chip')).forEach((btn,i)=>{
    btn.onclick=()=>{
      const item=list[i];
      appendChatMsg('user',item.label);
      wrap.innerHTML='';
      setTimeout(()=>{
        if(item.page){
          appendChatMsg('bot',`Taking you to **${item.label}** now.`);
          navigate(item.page);
          document.querySelectorAll('.nav-item').forEach(b=>{if(b.dataset.page===item.page)b.classList.add('active');else b.classList.remove('active')});
          renderChatQuickReplies(CHAT_QUICK_REPLIES);
        }
      },350);
    };
  });
}

function matchChatIntent(msg){
  const m=msg.toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9@.\s-]/g,' ').replace(/\s+/g,' ').trim();
  // Project facts are matched before broad navigation intents.
  if(/\b(what is|whats|what s|tell me about)\b.*\b(project )?link\b/.test(m))
    return {kw:[],reply:'Project LINK stands for **Lasallian Information and Knowledge System**. It is a student portal that brings together school information, announcements, resources, student concerns, and wellness appointment booking in one place.'};
  if(/\b(who made|who created|who developed|developer|developers|creator|creators)\b.*\b(project )?link\b/.test(m))
    return {kw:[],reply:'Project LINK’s lead developer is **Daphne Eunice Acena**, a student from STM21. She worked with **Matt Jacob Pacifico** from ICT21 and **Amir Ali Zabihi** from STM23. They are part of **Animo Student Patriots of Engineering and Robotics (SPEAR)**. Daphne is the Robotics Captain and Hardware Head, Matt is the Software and Research Head, and Ali is the President.'};
  if(/\b(when were you created|when was (project )?link created|when did (project )?link launch|when are you created|when was this made)\b/.test(m))
    return {kw:[],reply:'Project LINK has been developed since **May 2026** and launched in **October 2026**.'};
  if(/\b(who am i talking to|who am i speaking to|who is this)\b/.test(m))
    return {kw:[],reply:'Guess 😄'};
  if(/\b(are you ai|are you an ai|are you artificial intelligence)\b/.test(m))
    return {kw:[],reply:'No! Just a hardcoded chatbot.'};
  if(/\b(vibecod|vibe cod|vibe-coded|vibe coded)\b/.test(m))
    return {kw:[],reply:'No! The lead developer is an anti-vibecode person. You may direct your concerns to ADU0012@hs.dlsu.edu.ph.'};
  if(/\b(what is|whats|what s|tell me about)\b.*\b(animo spear|spear)\b/.test(m))
    return {kw:[],reply:'Animo SPEAR is the robotics and engineering organization of the DLSU-D Basic Education Department.'};
  // Identify specific Student Council officers by name or role.
  const officers=[
    {names:['jodie estrella','jodie'],reply:'Jodie Estrella is the Student Council President.'},
    {names:['jones sadiasa','jones'],reply:'Jones Sadiasa is the Student Council Vice President.'},
    {names:['edriah milaor','edriah'],reply:'Edriah Milaor is the Student Council Secretary.'},
    {names:['soo min lee','soo min'],reply:'Soo Min Lee is the Student Council Treasurer.'},
    {names:['james dacillo','james'],reply:'James Dacillo is the Student Council Auditor.'},
    {names:['ashley gado','ashley'],reply:'Ashley Gado is the Student Council Business Manager.'},
    {names:['rhian siton','rhian'],reply:'Rhian Siton is the Student Council Internal P.R.O.'},
    {names:['eleeyah es guerra','eleeyah esguerra','eleeyah'],reply:'Eleeyah Esguerra is the Student Council External P.R.O.'},
    {names:['danielle torres','danielle'],reply:'Danielle Torres is the ARD Representative.'},
    {names:['zna soriano','zna'],reply:'Zna Soriano is the ABM Representative.'},
    {names:['hailey oppus','hailey'],reply:'Hailey Oppus is the HUMSS Representative.'},
    {names:['mhikaela bonayon','mhikaela'],reply:'Mhikaela Bonayon is the STEM Representative.'},
    {names:['miguel cajigas','miguel'],reply:'Miguel Cajigas is the ICT Representative.'},
    {names:['winona mercene','winona'],reply:'Winona Mercene is the CUT Representative.'},
    {names:['sofia santarin','sofia'],reply:'Sofia Santarin is the JHS Representative.'},
    {names:['jean barrientos','jean'],reply:'Jean Barrientos is the SPR Representative.'}
  ];
  const officer=officers.find(o=>o.names.some(n=>m.includes(n)));
  if(officer)return {kw:[],reply:officer.reply};
  for(const intent of CHAT_INTENTS){
    if(intent.kw.some(k=>m.includes(k))) return intent;
  }
  return null;
}

function showChatTyping(){
  const box=document.getElementById('chat-messages');
  const div=document.createElement('div');
  div.className='chat-msg bot typing';
  div.id='chat-typing-indicator';
  div.innerHTML='<span></span><span></span><span></span>';
  box.appendChild(div);
  box.scrollTop=box.scrollHeight;
}
function hideChatTyping(){
  const el=document.getElementById('chat-typing-indicator');
  if(el) el.remove();
}

function sendChatMessage(e){
  if(e) e.preventDefault();
  const input=document.getElementById('chat-input');
  const msg=(input.value||'').trim();
  if(!msg) return false;
  appendChatMsg('user',msg);
  input.value='';
  document.getElementById('chat-quick-replies').innerHTML='';
  showChatTyping();
  setTimeout(()=>{
    hideChatTyping();
    const intent=matchChatIntent(msg);
    if(intent){
      appendChatMsg('bot',intent.reply);
      if(intent.action) renderChatQuickReplies([intent.action]);
      else renderChatQuickReplies(CHAT_QUICK_REPLIES);
    }else{
      appendChatMsg('bot',"I'm not totally sure about that one — but here are things I can help with:");
      renderChatQuickReplies(CHAT_QUICK_REPLIES);
    }
  },500+Math.random()*400);
  return false;
}