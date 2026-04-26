// ╔══════════════════════════════════════════════════════╗
// ║  SUPABASE CONFIGURATION (OPTIMIZED)                 ║
// ╚══════════════════════════════════════════════════════╝

const SUPABASE_URL = "https://dugzytiyhyafdrhisjqg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_nQN9DQBb7nwR1A6iYH52pQ_jCROHCGS";

// Cache localStorage availability check to avoid repeated try/catch
const hasLocalStorage = (() => {
  try {
    if (typeof window === 'undefined') return false;
    const test = '__ls_test__';
    window.localStorage.setItem(test, '1');
    window.localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
})();

const createClient = (typeof window !== 'undefined' && window.supabase && window.supabase.createClient)
  ? window.supabase.createClient
  : null;

const __memStore = new Map();
const safeStorage = {
  getItem: (key) => {
    if (hasLocalStorage) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return __memStore.get(key) ?? null;
      }
    }
    return __memStore.get(key) ?? null;
  },
  setItem: (key, value) => {
    if (hasLocalStorage) {
      try {
        window.localStorage.setItem(key, value);
        __memStore.set(key, value);
        return;
      } catch {
        __memStore.set(key, value);
      }
    } else {
      __memStore.set(key, value);
    }
  },
  removeItem: (key) => {
    if (hasLocalStorage) {
      try {
        window.localStorage.removeItem(key);
      } catch {}
    }
    __memStore.delete(key);
  },
};

const supabaseClient = createClient
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: safeStorage,
      },
      realtime: {
        params: { eventsPerSecond: 10 },
      },
    })
  : null;

// ╔══════════════════════════════════════════════════════╗
// ║  DATABASE HELPER FUNCTIONS                          ║
// ╚══════════════════════════════════════════════════════╝

const db = {
  async getReports(limit = 100) {
    const { data, error } = await supabaseClient
      .from('reports')
      .select('id,title,detail,category,urgency,status,location,user_id,user_name,user_email,upvotes,upvoted_by,attachments,comments,created_at,updated_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  },

  async getReportById(id) {
    const { data, error } = await supabaseClient
      .from('reports')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async createReport(reportData) {
    const { data, error } = await supabaseClient
      .from('reports')
      .insert([reportData])
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async updateReport(id, updates) {
    const { data, error } = await supabaseClient
      .from('reports')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async addComment(reportId, comment) {
    const { data: report, error: fetchErr } = await supabaseClient
      .from('reports')
      .select('comments')
      .eq('id', reportId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;

    const comments = Array.isArray(report?.comments) ? report.comments : [];
    comments.push(comment);

    const { data, error } = await supabaseClient
      .from('reports')
      .update({ comments, updated_at: new Date().toISOString() })
      .eq('id', reportId)
      .select()
      .maybeSingle(); 
      
    if (error) throw error;
    if (!data) throw new Error("Update blocked by Supabase Security (RLS). Please run the SQL fix.");
    return data;
  },

  async upvoteReport(reportId, userId) {
    const { data: report, error: fetchErr } = await supabaseClient
      .from('reports')
      .select('upvotes, upvoted_by')
      .eq('id', reportId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;

    const upvotedBy = Array.isArray(report?.upvoted_by) ? report.upvoted_by : [];
    const alreadyVoted = upvotedBy.includes(userId);
    const newUpvotedBy = alreadyVoted
      ? upvotedBy.filter(id => id !== userId)
      : [...upvotedBy, userId];
    const newCount = Math.max(0, (report?.upvotes || 0) + (alreadyVoted ? -1 : 1));

    const { data, error } = await supabaseClient
      .from('reports')
      .update({ upvotes: newCount, upvoted_by: newUpvotedBy, updated_at: new Date().toISOString() })
      .eq('id', reportId)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("Update blocked by Supabase Security (RLS). Please run the SQL fix.");
    return data;
  },

  async uploadFile(file, folder = 'reports') {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const userId = user?.id || 'anon';
    const ext = file.name.split('.').pop();
    const fileName = `${userId}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const filePath = `${folder}/${fileName}`;

    const { error: uploadErr } = await supabaseClient.storage
      .from('reports')
      .upload(filePath, file, { cacheControl: '3600', upsert: false });
    if (uploadErr) throw uploadErr;

    const { data: urlData } = supabaseClient.storage
      .from('reports')
      .getPublicUrl(filePath);

    return {
      url: urlData.publicUrl,
      name: file.name,
      type: file.type,
      size: file.size,
      path: filePath,
    };
  },

  async deleteFile(filePath) {
    const { error } = await supabaseClient.storage.from('reports').remove([filePath]);
    if (error) throw error;
  },

  async getUserProfile(userId) {
    const { data, error } = await supabaseClient
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      console.warn('getUserProfile:', error.message);
      return null;
    }
    return data;
  },

  async updateUserProfile(userId, profileData) {
    const { data, error } = await supabaseClient
      .from('users')
      .upsert({ id: userId, ...profileData, updated_at: new Date().toISOString() },
               { onConflict: 'id' })
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  },
};

window.db = db;
window.supabaseClient = supabaseClient;

if (!supabaseClient) {
  console.error(
    '[Supabase] Failed to initialize client. ' +
    'Check that `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2` loaded successfully.'
  );
}

// ── STATE ──
let screenStack = [];
let currentTab = 'home';
let reportsFilter = 'lahat';
let reportsScope = 'mine'; // 'mine' | 'community'
let aktFilter = 'lahat';
let selectedCat = 'Ilaw';
let selectedUrgency = 'Katamtaman';
let userReports = [];
let currentUser = null;
let currentUserProfile = null;
let toastTimer;
let leafletMap = null;
let gpsMarker = null;
let userLat = 14.8167, userLng = 121.0417;
let homeLocationInitialized = false;
let selectedFiles = [];
let realtimeChannel = null;
let currentDetailReportId = null;
let isLoadingReports = false; 
let loginHandled = false;     
let isRegisteringFlow = false;
let activeAuthUserId = null;
const FAST_START_REPORT_LIMIT = 20;
const FULL_REPORT_LIMIT = 100;

// ── CACHE LAYER ──
const CACHE = {
  reports: { data: [], timestamp: 0, ttl: 300000 }, 
  profile: { data: null, timestamp: 0, ttl: 600000 }, 
  
  isExpired(key) {
    return Date.now() - this[key].timestamp > this[key].ttl;
  },
  
  set(key, data) {
    this[key] = { data, timestamp: Date.now(), ttl: this[key].ttl };
  },
  
  get(key) {
    if (!this.isExpired(key)) {
      return this[key].data;
    }
    return null;
  },
  
  clear() {
    this.reports.data = [];
    this.reports.timestamp = 0;
    this.profile.data = null;
    this.profile.timestamp = 0;
  }
};

function withTimeout(promise, ms, label = 'operation') {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

// ── INITIALIZATION ──
document.addEventListener('DOMContentLoaded', () => {

  showLoading(false);

  // INJECT CSS FIX: Guarantee top-bar and back button are NEVER covered up by UI elements
  const style = document.createElement('style');
  style.innerHTML = `
    .top-bar { z-index: 9999 !important; position: relative !important; pointer-events: all !important; }
    #toast { z-index: 10000 !important; pointer-events: none !important; }
    #loading-overlay { z-index: 10000 !important; }
  `;
  document.head.appendChild(style);

  if (window.location.hash) {
    history.replaceState({ root: true }, '', window.location.pathname);
  } else if (!history.state) {
    history.replaceState({ root: true }, '', window.location.pathname);
  }

  window.addEventListener('error', () => showLoading(false));
  window.addEventListener('unhandledrejection', () => showLoading(false));

  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('scope-dropdown');
    const btn = document.getElementById('reports-title-btn');
    if (dropdown && dropdown.classList.contains('open')) {
      if (!dropdown.contains(e.target) && !btn?.contains(e.target)) {
        closeScopeDropdown();
      }
    }
  });

  if (!window.supabaseClient) {
    showToast('❌ Supabase not loaded. Check internet/CDN and refresh.');
    showLoginScreen();
    return;
  }

  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (isRegisteringFlow && event === 'SIGNED_IN') return;

    if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
      if (loginHandled && event === 'SIGNED_IN') {
        loginHandled = false;
        return;
      }
      if (currentUser?.id && currentUser.id !== session.user.id) {
        cleanupSessionState();
      }

      loginHandled = true;
      currentUser = session.user;
      activeAuthUserId = session.user.id;
      await handleUserLogin(session.user);

    } else if (event === 'SIGNED_OUT' || (event === 'INITIAL_SESSION' && !session)) {
      loginHandled = false;
      activeAuthUserId = null;
      handleUserLogout();
    }
  });
});

// ── SHOW / HIDE SCREENS ──
function showLoginScreen() {
  showLoading(false);
  document.getElementById('screen-login').classList.remove('hidden');
  document.getElementById('tab-shell').classList.remove('active');
  document.getElementById('bottom-nav').classList.remove('visible');
  document.querySelectorAll('.screen.active').forEach(s => s.classList.remove('active'));
  screenStack = [];
}

async function handleUserLogin(user) {
  currentUser = user;
  document.getElementById('screen-login').classList.add('hidden');
  document.getElementById('tab-shell').classList.add('active');
  document.getElementById('bottom-nav').classList.add('visible');
  screenStack = [];

  showLoading(true);
  const loadingFailsafe = setTimeout(() => showLoading(false), 3500);
  try {
    const [profileRes, reportsRes] = await Promise.allSettled([
      withTimeout(loadUserProfile(), 8000, 'Load profile'),
      withTimeout(loadAllReports(FULL_REPORT_LIMIT), 7000, 'Load all reports'),
    ]);

    updateProfileUI();
    renderAll();
    subscribeToReports();
    setTimeout(requestGPSFromHome, 600);

    if (reportsRes.status === 'rejected') {
      loadAllReports(FULL_REPORT_LIMIT, { force: true }).catch(() => {});
    }
  } catch (error) {
    renderAll();
  } finally {
    clearTimeout(loadingFailsafe);
    showLoading(false);
  }
}

function handleUserLogout() {
  cleanupSessionState();
  showLoginScreen();
}

function cleanupSessionState() {
  currentUser = null;
  currentUserProfile = null;
  userReports = [];
  screenStack = [];
  homeLocationInitialized = false;
  isLoadingReports = false;
  currentDetailReportId = null;
  setReportsScope('mine');
  CACHE.clear(); 

  if (realtimeChannel) {
    supabaseClient.removeChannel(realtimeChannel).catch(() => {});
    realtimeChannel = null;
  }
}

// ── AUTHENTICATION ──
function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value.trim();
  if (!email || !password) { showToast('❌ Fill in all fields'); return; }

  showLoading(true);
  supabaseClient.auth.signInWithPassword({ email, password })
    .then(({ error }) => {
      if (error) { showLoading(false); showToast('❌ ' + error.message); }
    })
    .catch(err => { showLoading(false); showToast('❌ ' + err.message); });
}

function doSignup() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value.trim();
  if (!email || !password) { showToast('❌ Fill in all fields'); return; }
  if (password.length < 6) { showToast('❌ Password must be 6+ characters'); return; }

  showLoading(true);
  supabaseClient.auth.signUp({ email, password })
    .then(({ error }) => {
      showLoading(false);
      if (error) { showToast('❌ ' + error.message); }
      else { showToast('✅ Account created! Check email or log in.'); }
    })
    .catch(err => { showLoading(false); showToast('❌ ' + err.message); });
}

function doAnonymousLogin() {
  showToast('⚠️ Demo: enable Anonymous sign-ins in Supabase Auth settings');
}

function switchLoginMode() {
  document.getElementById('login-email').focus();
}

function doLogout() {
  showLoading(true);
  supabaseClient.auth.signOut()
    .then(() => { showLoading(false); })
    .catch(err => { showLoading(false); showToast('❌ ' + err.message); });
}

async function loadUserProfile() {
  if (!currentUser) return;
  const cached = CACHE.get('profile');
  if (cached) {
    currentUserProfile = cached;
    return;
  }
  try {
    let profile = await db.getUserProfile(currentUser.id);
    if (!profile) {
      profile = await db.updateUserProfile(currentUser.id, {
        id: currentUser.id,
        first_name: 'User',
        last_name: 'Profile',
        email: currentUser.email,
        phone: '',
        barangay: 'San Jose del Monte',
        city: 'Bulacan',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
    currentUserProfile = profile;
    CACHE.set('profile', profile);
  } catch (error) {
    currentUserProfile = {
      first_name: 'User', last_name: 'Profile',
      email: currentUser?.email || '',
      barangay: 'San Jose del Monte', city: 'Bulacan'
    };
  }
}

function subscribeToReports() {
  if (realtimeChannel) {
    supabaseClient.removeChannel(realtimeChannel).catch(() => {});
    realtimeChannel = null;
  }
  realtimeChannel = supabaseClient
    .channel('reports-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, (payload) => {
      if (payload.eventType === 'UPDATE' && payload.new) {
        const idx = userReports.findIndex(r => String(r.id) === String(payload.new.id));
        if (idx >= 0) {
          userReports[idx] = payload.new;
          CACHE.set('reports', userReports);
          renderAll();
          if (String(currentDetailReportId) === String(payload.new.id) &&
              document.getElementById('screen-detail') &&
              document.getElementById('screen-detail').classList.contains('active')) {
            
            // Fix layout jump during live updates
            const scrollBox = document.getElementById('detail-content');
            const scrollPos = scrollBox ? scrollBox.scrollTop : 0;
            renderDetailContent(payload.new);
            setTimeout(() => { if (scrollBox) scrollBox.scrollTop = scrollPos; }, 10);
            
          }
          return;
        }
      }
      CACHE.reports.timestamp = 0;
      loadAllReports(FULL_REPORT_LIMIT, { force: true }).catch(() => {});
    })
    .subscribe();
}

async function loadAllReports(limit = FULL_REPORT_LIMIT, options = {}) {
  const force = !!options.force;
  if (!force) {
    const cached = CACHE.get('reports');
    if (cached && cached.length > 0) {
      userReports = cached;
      renderAll();
      return;
    }
  }
  
  if (isLoadingReports && !force) return;
  isLoadingReports = true;
  try {
    userReports = await db.getReports(limit);
    CACHE.set('reports', userReports);
    renderAll();
    if (currentDetailReportId && document.getElementById('screen-detail') &&
        document.getElementById('screen-detail').classList.contains('active')) {
      db.getReportById(currentDetailReportId).then(fresh => {
        if (!fresh) return;
        const idx = userReports.findIndex(x => String(x.id) === String(currentDetailReportId));
        if (idx >= 0) userReports[idx] = fresh;
        
        const scrollBox = document.getElementById('detail-content');
        const scrollPos = scrollBox ? scrollBox.scrollTop : 0;
        renderDetailContent(fresh);
        setTimeout(() => { if (scrollBox) scrollBox.scrollTop = scrollPos; }, 10);

      }).catch(() => {});
    }
  } catch (error) {
    if (userReports.length === 0) {
      const empty = '<div style="text-align:center;padding:30px;color:#999;font-size:13px;">Hindi ma-load ang mga report.<br>I-check ang iyong koneksyon.</div>';
      ['nearby-list','resolved-list','reports-list'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = empty;
      });
    }
  } finally {
    isLoadingReports = false;
  }
}

function updateProfileUI() {
  if (!currentUser) return;
  const fn = currentUserProfile?.first_name || 'User';
  const ln = currentUserProfile?.last_name || 'Profile';
  const setVal = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  const setInp = (id, val) => { const e = document.getElementById(id); if (e) e.value = val; };
  setVal('profile-name', `${fn} ${ln}`.trim().toUpperCase());
  setVal('profile-email', currentUser.email);
  setVal('profile-brgy', currentUserProfile?.barangay || 'San Jose del Monte');
  setInp('edit-email', currentUser.email);
  setInp('edit-firstname', fn);
  setInp('edit-lastname', ln);
  setInp('edit-phone', currentUserProfile?.phone || '');
  setInp('edit-brgy', currentUserProfile?.barangay || '');
  setInp('edit-city', currentUserProfile?.city || '');
}

// ── SUBMIT REPORT ──
async function submitReport() {
  const title = document.getElementById('f-title').value.trim();
  if (!title) { showToast('❌ Punan ang pamagat ng ulat'); return; }
  if (!currentUser) { showToast('❌ Mag-login muna'); return; }

  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  showLoading(true);

  try {
    let attachments = [];
    for (const file of selectedFiles) {
      try {
        attachments.push(await db.uploadFile(file));
      } catch (err) {
        showToast('⚠️ Hindi na-upload: ' + file.name);
      }
    }

    const gpsText = getBestReportAddress();
    await db.createReport({
      title,
      detail: document.getElementById('f-detail').value || '',
      category: selectedCat,
      urgency: selectedUrgency,
      status: 'pending',
      location: { lat: userLat, lng: userLng, address: gpsText },
      user_id: currentUser.id,
      user_name: `${currentUserProfile?.first_name || 'User'} ${currentUserProfile?.last_name || ''}`.trim(),
      user_email: currentUser.email,
      upvotes: 0,
      upvoted_by: [],
      attachments,
      comments: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    showLoading(false);
    submitBtn.disabled = false;
    showToast('✅ Na-submit ang report!');
    document.getElementById('f-title').value = '';
    document.getElementById('f-detail').value = '';
    selectedFiles = [];
    document.getElementById('photo-previews').innerHTML = '';
    popScreen();
    await loadAllReports(FULL_REPORT_LIMIT, { force: true });
  } catch (error) {
    showLoading(false);
    submitBtn.disabled = false;
    showToast('❌ ' + (error.message || 'Submit failed'));
  }
}

// ── FILE HANDLING ──
function handlePhotoUpload(event) {
  const files = Array.from(event.target.files);
  if (!files.length) return;
  const remaining = 4 - selectedFiles.length;
  if (remaining <= 0) { showToast('❌ Max 4 files na'); return; }
  let added = 0;
  for (const file of files.slice(0, remaining)) {
    if (file.size > 50 * 1024 * 1024) { showToast(`❌ ${file.name} too large`); continue; }
    selectedFiles.push(file); added++;
  }
  renderPhotoPreviews();
  if (added) showToast(`✅ Na-add: ${added} file(s)`);
  event.target.value = '';
}

function removeFile(index) {
  selectedFiles.splice(index, 1);
  renderPhotoPreviews();
}

function renderPhotoPreviews() {
  const container = document.getElementById('photo-previews');
  container.innerHTML = '';
  selectedFiles.forEach((file, index) => {
    const div = document.createElement('div');
    div.className = 'photo-thumb';
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => {
        div.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;">
          <button class="photo-remove" onclick="removeFile(${index})">×</button>`;
      };
      reader.readAsDataURL(file);
    } else {
      div.innerHTML = `<div style="width:100%;height:100%;background:#333;display:flex;align-items:center;justify-content:center;border-radius:10px;color:#fff;font-size:28px;">🎥</div>
        <button class="photo-remove" onclick="removeFile(${index})">×</button>`;
    }
    container.appendChild(div);
  });
}

// ── RENDER ──
function renderAll() {
  renderHome();
  renderReports();
  renderProfileStats();
}

function chipLabel(s) {
  return {
    pending: '⏳ Pending',
    inreview: '🔎 Reviewed',
    resolved: '✅ Resolved',
    false: '🚩 False Report',
  }[s] || s;
}

function getTimeAgo(dateString) {
  if (!dateString) return '';
  const diff = Date.now() - new Date(dateString).getTime();
  const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), d = Math.floor(diff / 86400000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 7) return `${d}d ago`;
  return new Date(dateString).toLocaleDateString();
}

function getIconForCategory(cat) {
  return { Ilaw: '💡', Kalsada: '🚧', Basura: '🗑️', Tubig: '💧', Baha: '🌊', 'Iba pa': '📌' }[cat] || '📌';
}

function stepFromStatus(s) { return { pending:1, inreview:2, resolved:3, false:2 }[s] || 1; }
function progressFromStatus(s) { return { pending:24, inreview:62, resolved:100, false:62 }[s] || 24; }
function pcolorFromStatus(s) { return { pending:'yellow', inreview:'blue', resolved:'green', false:'blue' }[s] || 'yellow'; }

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function getReportMediaPreview(report) {
  const files = Array.isArray(report?.attachments) ? report.attachments : [];
  const firstImage = files.find(f => f?.type && String(f.type).startsWith('image/') && f?.url);
  if (firstImage) {
    return `<img src="${escHtml(firstImage.url)}" alt="Report photo" class="report-thumb-img" onerror="this.parentElement.innerHTML='${getIconForCategory(report.category)}'">`;
  }
  return getIconForCategory(report.category);
}

function reportTile(r) {
  const isVoted = Array.isArray(r.upvoted_by) && currentUser && r.upvoted_by.includes(currentUser.id);
  const reporterName = escHtml(r.user_name || 'Unknown user');
  const mediaPreview = getReportMediaPreview(r);
  return `<div class="report-tile" onclick="openDetail('${r.id}')">
    <div class="report-tile-info">
      <div class="report-tile-title">${escHtml(r.title)}</div>
      <div class="report-byline">Reported by ${reporterName}</div>
      <div class="report-tile-loc">${escHtml(r.location?.address || 'Unknown')} · ${getTimeAgo(r.created_at)}</div>
      <div class="report-tile-footer">
        <span class="chip ${r.status}">${chipLabel(r.status)}</span>
        <button class="upvote-btn ${isVoted?'voted':''}" onclick="event.stopPropagation();upvoteReport('${r.id}')">
          ${isVoted?'❤️':'🔼'} ${r.upvotes||0}
        </button>
      </div>
    </div>
    <div class="report-tile-icon">${mediaPreview}</div>
  </div>`;
}

function renderHome() {
  const nearby = userReports.filter(r => r.status !== 'resolved').slice(0, 3);
  const resolved = userReports.filter(r => r.status === 'resolved').slice(0, 2);
  const empty = (msg) => `<div style="text-align:center;padding:20px;color:#999;font-size:13px;">${msg}</div>`;
  const nb = document.getElementById('nearby-list');
  const rs = document.getElementById('resolved-list');
  if (nb) nb.innerHTML = nearby.length ? nearby.map(reportTile).join('') : empty('Walang mga ulat nearby');
  if (rs) rs.innerHTML = resolved.length ? resolved.map(reportTile).join('') : empty('Walang na-resolve pa');
}

function renderReports() {
  const source = reportsScope === 'community'
    ? userReports
    : userReports.filter(r => currentUser && r.user_id === currentUser.id);
  const filtered = reportsFilter === 'lahat' ? source : source.filter(r => r.status === reportsFilter);
  const set = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  set('stat-total', source.length);
  set('stat-inreview', source.filter(r => r.status === 'inreview').length);
  set('stat-resolved', source.filter(r => r.status === 'resolved').length);

  const reportsTitle = document.querySelector('#tab-reports .top-bar h2');
  if (reportsTitle) {
    reportsTitle.textContent = reportsScope === 'community' ? '📋 Community Reports' : '📋 Mga Report Ko';
  }
  const listEl = document.getElementById('reports-list');
  if (!listEl) return;
  if (!filtered.length) {
    listEl.innerHTML = '<div style="text-align:center;padding:30px;color:#999;font-size:13px;">Wala pang report sa kategoryang ito</div>';
    return;
  }
  listEl.innerHTML = filtered.map(r => {
    const prog = progressFromStatus(r.status);
    const pcol = pcolorFromStatus(r.status);
    const stepLbl = {
      pending:'Natanggap',
      inreview:'Na-review na',
      resolved:'Naayos na ✓',
      false:'Na-flag para sa beripikasyon',
    }[r.status] || '';
    const reporterName = escHtml(r.user_name || 'Unknown user');
    const mediaPreview = getReportMediaPreview(r);
    return `<div class="report-row" onclick="openDetail('${r.id}')">
      <div class="report-row-top">
        <div style="flex:1;min-width:0;">
          <div class="report-tile-title">${escHtml(r.title)}</div>
          <div class="report-byline">Reported by ${reporterName}</div>
          <div class="report-tile-loc">${escHtml(r.location?.address||'Unknown')} · ${getTimeAgo(r.created_at)}</div>
          <div style="margin-top:7px;"><span class="chip ${r.status}">${chipLabel(r.status)}</span></div>
        </div>
        <div class="report-tile-icon report-row-icon">${mediaPreview}</div>
      </div>
      <div class="progress-track"><div class="progress-fill ${pcol}" style="width:${prog}%"></div></div>
      <div class="progress-label">${stepLbl}</div>
    </div>`;
  }).join('');
}

function toggleScopeDropdown() {
  const menu = document.getElementById('scope-dropdown');
  const btn  = document.getElementById('reports-title-btn');
  if (!menu) return;
  const open = menu.classList.contains('open');
  menu.classList.toggle('open', !open);
  if (btn) btn.setAttribute('aria-expanded', String(!open));
}

function closeScopeDropdown() {
  const menu = document.getElementById('scope-dropdown');
  const btn  = document.getElementById('reports-title-btn');
  if (menu) menu.classList.remove('open');
  if (btn)  btn.setAttribute('aria-expanded', 'false');
}

function selectScope(scope) {
  setReportsScope(scope);
  closeScopeDropdown();
  reportsFilter = 'lahat';
  document.querySelectorAll('#reports-filter-bar .filter-chip').forEach(c => c.classList.remove('active'));
  const def = document.querySelector('#reports-filter-bar .filter-chip[data-filter="lahat"]');
  if (def) def.classList.add('active');
  renderReports();
}

function setReportsScope(scope) {
  reportsScope = scope === 'community' ? 'community' : 'mine';
  ['mine','community'].forEach(s => {
    const el = document.getElementById('scope-opt-' + s);
    if (el) el.classList.toggle('active', s === reportsScope);
  });
  const title = document.getElementById('reports-tab-title');
  if (title) title.textContent = reportsScope === 'community' ? '🌐 Community Reports' : '📋 Mga Report Ko';
}

function openCommunityReports() {
  selectScope('community');
  switchTab('reports');
}

function openMyReports() {
  selectScope('mine');
  switchTab('reports');
}

function filterReports(el) {
  reportsFilter = el.dataset.filter;
  document.querySelectorAll('#reports-filter-bar .filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderReports();
}

function renderAkt() {
  const mine = userReports.filter(r => currentUser && r.user_id === currentUser.id);
  const filtered = aktFilter === 'lahat' ? mine : mine.filter(r => r.status === aktFilter);
  const listEl = document.getElementById('akt-list');
  if (!listEl) return;
  if (!filtered.length) {
    listEl.innerHTML = '<div style="text-align:center;padding:30px;color:#999;font-size:13px;">Walang aktibidad pa</div>';
    return;
  }
  const steps = ['Received','Reviewed','Resolved'];
  listEl.innerHTML = '<div style="height:10px;"></div>' + filtered.map(r => {
    const stepN = stepFromStatus(r.status);
    const prog = progressFromStatus(r.status);
    const pct = r.status==='resolved' ? 'p100' : (prog >= 60 ? 'p50' : 'p25');
    const pclr = r.status === 'resolved' ? '' : 'blue';
    const nodes = steps.map((s,i) => {
      const done = r.status==='resolved' || i < stepN;
      const active = !done&&i===stepN-1;
      return `<div class="step-node">
        <div class="step-circle ${done?'done':(active?'active':'')}"></div>
        <div class="step-name ${done?'done':(active?'active':'')}">${s}</div>
      </div>`;
    }).join('');
    return `<div class="akt-card" onclick="openDetail('${r.id}')">
      <div style="display:flex;gap:12px;align-items:flex-start;">
        <div class="report-tile-icon" style="width:44px;height:44px;font-size:22px;">${getIconForCategory(r.category)}</div>
        <div style="flex:1;min-width:0;">
          <div class="report-tile-title">${escHtml(r.title)}</div>
          <div class="report-tile-loc">${escHtml(r.location?.address||'Unknown')}</div>
          <div style="margin-top:6px;"><span class="chip ${r.status}">${chipLabel(r.status)}</span></div>
        </div>
      </div>
      <div class="track-wrapper">
        <div class="track-bg"></div>
        <div class="track-progress ${pct} ${pclr}"></div>
        <div class="step-row">${nodes}</div>
      </div>
    </div>`;
  }).join('') + '<div style="height:16px;"></div>';
}

function filterAkt(el) {
  aktFilter = el.dataset.filter;
  document.querySelectorAll('#akt-filter-bar .filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderAkt();
}

function renderProfileStats() {
  const mine = userReports.filter(r => currentUser && r.user_id === currentUser.id);
  const set = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  set('ps-total', mine.length);
  set('ps-resolved', mine.filter(r => r.status==='resolved').length);
  set('ps-pending', mine.filter(r => r.status==='pending').length);
}

// ── DETAIL CONTENT RENDERER ─────────
function renderDetailContent(r) {
  if (!r) return;
  document.getElementById('detail-header-title').textContent = r.category || 'Report';
  const isVoted = Array.isArray(r.upvoted_by) && currentUser && r.upvoted_by.includes(currentUser.id);
  const steps = ['Received','Reviewed','Resolved'];
  const stepN = stepFromStatus(r.status);
  const prog = progressFromStatus(r.status);
  const pct = r.status==='resolved' ? 'p100' : (prog>=60 ? 'p50' : 'p25');
  const pclr = r.status==='resolved' ? '' : 'blue';
  const stepNodes = steps.map((s,i)=>{
    const done = r.status==='resolved'||i<stepN;
    const active = !done&&i===stepN-1;
    return `<div class="step-node">
      <div class="step-circle ${done?'done':(active?'active':'')}"></div>
      <div class="step-name ${done?'done':(active?'active':'')}">${s}</div>
    </div>`;
  }).join('');

  let attachHTML = '';
  if (r.attachments && r.attachments.length) {
    const thumbs = r.attachments.map(att => {
      const safeUrl = escHtml(att.url || '');
      const safeType = escHtml(att.type || '');
      const safeName = escHtml((att.name || 'file').substring(0, 14));
      const isImg = att.type && String(att.type).startsWith('image/');
      const isVid = att.type && String(att.type).startsWith('video/');
      const preview = isImg
        ? `<img src="${safeUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;" onerror="this.parentElement.innerHTML='\uD83D\uDCCE'">`
        : `<div style="width:100%;height:100%;background:#222;display:flex;align-items:center;justify-content:center;border-radius:10px;font-size:28px;">\uD83C\uDFA5</div>`;
      return `<div class="attachment-item" onclick="viewAttachment('${safeUrl}','${safeType}')" style="cursor:pointer;">
        <div class="attachment-preview">${preview}</div>
        <div class="attachment-name">${safeName}</div>
      </div>`;
    }).join('');
    attachHTML = `<div style="padding:0 12px;"><div class="section-title" style="padding:14px 0 8px;"><span class="section-dot"></span> Mga Larawan/Video</div></div><div style="display:flex;gap:10px;padding:0 12px 12px;flex-wrap:wrap;">${thumbs}</div>`;
  }

  const sortedComments = Array.isArray(r.comments)
    ? [...r.comments].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
    : [];
  const commentsHTML = sortedComments.length
    ? sortedComments.map(c => {
        const who = c.is_admin ? '\uD83D\uDCE2 Dispatcher' : escHtml(c.user_name || 'User');
        return `<div class="comment-item">
          <div><span class="comment-who">${who}</span>
          <span class="comment-when"> \u00b7 ${getTimeAgo(c.created_at)}</span></div>
          <div class="${c.is_admin ? 'lgu-comment' : ''}"><div class="comment-text">${escHtml(c.text)}</div></div>
        </div>`;
      }).join('')
    : '<div style="font-size:13px;color:#BDBDBD;text-align:center;padding:12px 0;">Wala pang komento</div>';

  const _mapId = 'dmap' + String(r.id).replace(/[^a-z0-9]/gi, '');
  const _rLat = (r.location && r.location.lat) || userLat;
  const _rLng = (r.location && r.location.lng) || userLng;
  const _rAddr = (r.location && r.location.address) || '';

  const chipHtml = chipLabel(r.status);
  document.getElementById('detail-content').innerHTML = `
    <div id="${_mapId}" style="height:200px;width:100%;flex-shrink:0;background:#C8D8B4;display:block;"></div>
    <div class="detail-hero">
      <div class="detail-body">
        <div class="detail-title">${escHtml(r.title)}</div>
        <div class="detail-meta">
          <span class="chip ${r.status}">${chipHtml}</span>
          <span class="detail-sep">\u00b7</span>
          <span style="font-size:12px;color:#999;">${escHtml(r.urgency || '')}</span>
          <span class="detail-sep">\u00b7</span>
          <span style="font-size:12px;color:#999;">${getTimeAgo(r.created_at)}</span>
        </div>
        <div style="font-size:13px;color:#555;line-height:1.6;margin-bottom:12px;">${escHtml(r.detail || 'Walang detalye')}</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <button class="upvote-btn ${isVoted ? 'voted' : ''}" onclick="upvoteReport('${r.id}')">
            ${isVoted ? '\u2764\uFE0F' : '\uD83D\uDD3C'} ${r.upvotes || 0} upvotes
          </button>
          <span style="font-size:12px;color:#BDBDBD;">\u00b7 ${escHtml((r.location && r.location.address) || 'Unknown')}</span>
        </div>
      </div>
    </div>
    ${attachHTML}
    <div style="padding:0 12px;"><div class="section-title" style="padding:14px 0 8px;"><span class="section-dot"></span> Tracker ng Status</div></div>
    <div style="background:#fff;margin:0 12px;border-radius:16px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,0.05);">
      <div class="track-wrapper" style="padding-bottom:16px;">
        <div class="track-bg"></div>
        <div class="track-progress ${pct} ${pclr}"></div>
        <div class="step-row">${stepNodes}</div>
      </div>
    </div>
    <div style="padding:0 12px;"><div class="section-title" style="padding:14px 0 8px;"><span class="section-dot"></span> Mga Komento / Updates</div></div>
    <div class="detail-comment-box">${commentsHTML}</div>
    <div style="padding:12px;">
      <div class="input-field" style="border:1.5px solid #E5E5E5;background:#F5F5F7;">
        
        <input type="text" id="comment-input" placeholder="Mag-comment..."
          style="flex:1;background:none;border:none;outline:none;font-size:14px;font-family:'DM Sans',sans-serif;"
          onkeydown="if(event.key==='Enter'){event.preventDefault();submitComment('${r.id}');}">
          
        <button type="button" onclick="submitComment('${r.id}')"
          style="background:#8B1A1A;color:#fff;border:none;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;">Send</button>
      </div>
    </div>
    <div style="height:20px;"></div>`;

  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (window._detailMap) {
      try { window._detailMap.remove(); } catch(e) {}
      window._detailMap = null;
    }
    const _el = document.getElementById(_mapId);
    if (!_el || !window.L) return;
    const _dm = L.map(_mapId, {
      zoomControl: true, dragging: true,
      scrollWheelZoom: false, doubleClickZoom: true,
      touchZoom: true, boxZoom: false, keyboard: false,
      attributionControl: false,
    }).setView([_rLat, _rLng], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(_dm);
    const _pin = L.divIcon({
      html: '<div style="font-size:30px;line-height:1;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.4));">\uD83D\uDCCD</div>',
      iconSize: [30, 36], iconAnchor: [15, 36], className: ''
    });
    L.marker([_rLat, _rLng], { icon: _pin }).addTo(_dm);
    L.circle([_rLat, _rLng], { radius: 40, color: '#8B1A1A', fillColor: '#8B1A1A', fillOpacity: 0.12, weight: 2, opacity: 0.4 }).addTo(_dm);
    if (_rAddr) {
      L.popup({ closeButton: false, offset: [0, -30] })
        .setLatLng([_rLat, _rLng])
        .setContent(`<span style="font-size:12px;font-weight:600;">${escHtml(_rAddr)}</span>`)
        .openOn(_dm);
    }
    _dm.zoomControl.setPosition('bottomright');
    setTimeout(() => { if (_dm) _dm.invalidateSize(); }, 80);
    window._detailMap = _dm;
  }));
}

// ── SYSTEM NAVIGATION AND HISTORY API (GESTURES & RELOAD FIX) ──
window.addEventListener('popstate', (e) => {
  const viewer = document.getElementById('media-viewer');
  if (viewer && viewer.classList.contains('show')) {
     viewer.classList.remove('show');
     const content = document.getElementById('media-viewer-content');
     if (content) content.innerHTML = '';
     return;
  }

  if (screenStack.length > 0) {
    const _pname = screenStack.pop();
    const s = document.getElementById('screen-' + _pname);
    if (s) s.classList.remove('active');

    if (_pname === 'detail' && window._detailMap) {
      try { window._detailMap.remove(); } catch(err) {}
      window._detailMap = null;
    }
  } else {
     document.querySelectorAll('.screen.active').forEach(s => s.classList.remove('active'));
  }
});

function pushScreen(name) {
  const s = document.getElementById('screen-'+name);
  if (!s) return;
  screenStack.push(name);
  
  // Hash with timestamp to ensure a unique browser history entry even on same page
  history.pushState({ screen: name }, '', `#${name}-${Date.now()}`);

  requestAnimationFrame(() => s.classList.add('active'));
  if (name==='aktibidad') setTimeout(renderAkt, 50);
  if (name==='submit') {
    selectedFiles=[]; document.getElementById('photo-previews').innerHTML='';
    document.getElementById('f-title').value=''; document.getElementById('f-detail').value='';
    setTimeout(() => {
      initMap();
      prefillSubmitAddressFromHome();
      setTimeout(requestGPS, 350);
    }, 80);
  }
  if (name==='editprofile') updateProfileUI();
}

// FIX: Bulletproof Back Button Logic
function popScreen() {
  if (screenStack.length > 0) {
    // If history is intact, go back natively to trigger popstate
    if (window.history.state && window.history.state.screen) {
      history.back();
    } else {
      // If history is broken (due to external reload/bug), manually close the screen
      const _pname = screenStack.pop();
      const s = document.getElementById('screen-' + _pname);
      if (s) s.classList.remove('active');

      if (_pname === 'detail' && window._detailMap) {
        try { window._detailMap.remove(); } catch(err) {}
        window._detailMap = null;
      }
      try { history.replaceState({ root: true }, '', window.location.pathname); } catch(e) {}
    }
  } else {
    // Failsafe
    document.querySelectorAll('.screen.active').forEach(s => s.classList.remove('active'));
    try { history.replaceState({ root: true }, '', window.location.pathname); } catch(e) {}
  }
}

// ── IMAGE/VIDEO ATTACHMENT VIEWER ──
function viewAttachment(url, type) {
  const viewer = document.getElementById('media-viewer');
  const content = document.getElementById('media-viewer-content');
  if (!viewer || !content || !url) return;
  
  const isVid = String(type || '').startsWith('video/');
  content.innerHTML = isVid
    ? `<video controls autoplay playsinline src="${url}" style="max-width:100%;max-height:84vh;border-radius:12px;background:#111;"></video>`
    : `<img src="${url}" alt="Attachment" style="max-width:100%;max-height:84vh;border-radius:12px;background:#111;" onerror="window.open('${url}','_blank')">`;

  viewer.classList.add('show');
  
  history.pushState({ modal: 'media' }, '', `#media-${Date.now()}`);
}

function closeMediaViewer(e) {
  if (e) e.stopPropagation();
  const viewer = document.getElementById('media-viewer');
  if (viewer && viewer.classList.contains('show')) {
     history.back();
  }
}

// ── ADD USER COMMENT (FIXED LAYOUT JUMPING) ──
async function submitComment(reportId) {
  if (!currentUser) { showToast('❌ Mag-login muna para mag-comment'); return; }

  const inputEl = document.getElementById('comment-input');
  if (!inputEl) return;
  const text = inputEl.value.trim();

  if (!text) { showToast('⚠️ Walang naisulat na komento'); return; }

  const newComment = {
    user_id: currentUser.id,
    user_name: `${currentUserProfile?.first_name || 'User'} ${currentUserProfile?.last_name || ''}`.trim(),
    text: text,
    is_admin: false,
    created_at: new Date().toISOString()
  };

  inputEl.disabled = true;
  showLoading(true);

  try {
    const updatedReport = await db.addComment(reportId, newComment);

    const idx = userReports.findIndex(r => String(r.id) === String(reportId));
    if (idx >= 0) userReports[idx] = updatedReport;
    CACHE.set('reports', userReports);

    if (String(currentDetailReportId) === String(reportId)) {
      // Fix: Preserve scroll position so it doesn't jump back to top!
      const scrollBox = document.getElementById('detail-content');
      const scrollPos = scrollBox ? scrollBox.scrollTop : 0;
      
      renderDetailContent(updatedReport);
      
      setTimeout(() => {
        const newScrollBox = document.getElementById('detail-content');
        if(newScrollBox) newScrollBox.scrollTop = scrollPos;
      }, 10);
    }

    showToast('✅ Naipadala ang komento!');
  } catch (err) {
    console.error(err);
    showToast('❌ Nabigong ipadala: ' + err.message);
  } finally {
    const refreshedInput = document.getElementById('comment-input');
    if (refreshedInput) refreshedInput.disabled = false;
    showLoading(false);
  }
}

// ── DETAIL ──
async function openDetail(reportId) {
  currentDetailReportId = reportId;
  let r = userReports.find(x => String(x.id) === String(reportId));

  if (r) {
    renderDetailContent(r);
    pushScreen('detail');
    db.getReportById(reportId)
      .then(fresh => {
        if (!fresh) return;
        const i = userReports.findIndex(x => String(x.id) === String(reportId));
        if (i >= 0) userReports[i] = fresh;
        if (String(currentDetailReportId) === String(reportId) &&
            document.getElementById('screen-detail') &&
            document.getElementById('screen-detail').classList.contains('active')) {
          
          const scrollBox = document.getElementById('detail-content');
          const scrollPos = scrollBox ? scrollBox.scrollTop : 0;
          renderDetailContent(fresh);
          setTimeout(() => { if (scrollBox) scrollBox.scrollTop = scrollPos; }, 10);
        }
      })
      .catch(() => {});
  } else {
    showLoading(true);
    try {
      r = await db.getReportById(reportId);
      showLoading(false);
      if (!r) { showToast('\u274C Report not found'); return; }
      renderDetailContent(r);
      pushScreen('detail');
    } catch (err) {
      showLoading(false);
      showToast('\u274C ' + err.message);
    }
  }
}

function renderDetail_wrapper(r) {
  if (!r) return;
  if (String(currentDetailReportId) !== String(r.id)) return;
  const screen = document.getElementById('screen-detail');
  if (!screen || !screen.classList.contains('active')) return;
  
  const scrollBox = document.getElementById('detail-content');
  const scrollPos = scrollBox ? scrollBox.scrollTop : 0;
  renderDetailContent(r);
  setTimeout(() => { if (scrollBox) scrollBox.scrollTop = scrollPos; }, 10);
}

async function upvoteReport(reportId) {
  if (!currentUser) { showToast('❌ Mag-login muna'); return; }
  showLoading(true);
  try {
    const updated = await db.upvoteReport(reportId, currentUser.id);
    const i = userReports.findIndex(x=>String(x.id)===String(reportId));
    if (i>=0) userReports[i] = updated;
    showLoading(false);
    showToast('✅ Vote updated!');
    renderAll();
    
    // Fixed: Uses renderDetail_wrapper instead of openDetail to avoid breaking the Back button
    if (String(currentDetailReportId)===String(reportId)) renderDetail_wrapper(updated);
  } catch (err) { showLoading(false); showToast('❌ ' + err.message); }
}

function shareReport() {
  if (navigator.share) navigator.share({ title:'AKSYON Report', text:'Check this civic report', url:window.location.href });
  else showToast('Share not available on this device');
}

// ── TAB SWITCHING ──
function switchTab(tab) {
  if (tab === currentTab) return;
  document.getElementById('tab-'+currentTab).classList.remove('active');
  document.getElementById('tab-'+tab).classList.add('active');
  currentTab = tab;
  ['home','reports','profile'].forEach(t => {
    document.getElementById('nav-'+t).classList.toggle('active', t===tab);
  });
  if (tab==='reports') renderReports();
  if (tab==='profile') renderProfileStats();
}

// ── PROFILE ──
async function saveProfile() {
  showLoading(true);
  try {
    await db.updateUserProfile(currentUser.id, {
      first_name: document.getElementById('edit-firstname').value,
      last_name: document.getElementById('edit-lastname').value,
      phone: document.getElementById('edit-phone').value,
      barangay: document.getElementById('edit-brgy').value,
      city: document.getElementById('edit-city').value,
    });
    await loadUserProfile();
    updateProfileUI(); renderProfileStats();
    showLoading(false); showToast('✅ Profile updated!');
    setTimeout(popScreen, 350);
  } catch (err) { showLoading(false); showToast('❌ ' + err.message); }
}

// ── LOCATION ──
function setHomeGpsStatus(state, text) {
  const dot = document.getElementById('home-gps-dot');
  const txt = document.getElementById('home-gps-text');
  if (!dot||!txt) return;
  const map = { idle:{bg:'#BDBDBD',a:'none'}, loading:{bg:'#F9A825',a:'pulse 1.2s infinite'},
    locating:{bg:'#F9A825',a:'pulse 1.2s infinite'}, found:{bg:'#4CAF50',a:'none'}, denied:{bg:'#E53935',a:'none'} };
  const s = map[state]||map.idle;
  dot.style.background=s.bg; dot.style.animation=s.a; txt.textContent=text||'';
}

function requestGPSFromHome() {
  if (homeLocationInitialized) return;
  homeLocationInitialized = true;
  setHomeGpsStatus('loading','Requesting location...');
  if (!navigator.geolocation) { setHomeGpsStatus('denied','GPS not available'); return; }
  navigator.geolocation.getCurrentPosition(
    pos => { userLat=pos.coords.latitude; userLng=pos.coords.longitude;
      setHomeGpsStatus('locating','Getting address...'); reverseGeocodeHome(userLat,userLng); },
    () => setHomeGpsStatus('denied','Location access denied'),
    { enableHighAccuracy:true, timeout:12000, maximumAge:0 }
  );
}

function reverseGeocodeHome(lat, lng) {
  fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=en`)
    .then(r=>r.json())
    .then(data=>{
      const a=data.address||{};
      const road=a.road||a.pedestrian||a.footway||'';
      const brgy=a.suburb||a.neighbourhood||a.village||a.town||'';
      const city=a.city||a.municipality||'';
      setHomeGpsStatus('found',[road,brgy,city].filter(Boolean).join(', ')||`${lat.toFixed(5)},${lng.toFixed(5)}`);
      const el=document.getElementById('home-brgy-name');
      if(el&&(brgy||city)) el.textContent=brgy||city;
    })
    .catch(()=>setHomeGpsStatus('found',`${lat.toFixed(5)},${lng.toFixed(5)}`));
}

// ── LEAFLET MAP ──
function initMap() {
  if (leafletMap) { leafletMap.remove(); leafletMap=null; gpsMarker=null; }
  const mapEl = document.getElementById('leaflet-map');
  if (!mapEl) return;
  leafletMap = L.map('leaflet-map',{zoomControl:true,dragging:true,scrollWheelZoom:false}).setView([userLat,userLng],15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OSM'}).addTo(leafletMap);
  const pinIcon = L.divIcon({
    html:'<div style="font-size:32px;line-height:1;filter:drop-shadow(0 3px 5px rgba(0,0,0,0.35));">📍</div>',
    iconSize:[32,32], iconAnchor:[16,32], className:''
  });
  gpsMarker = L.marker([userLat,userLng],{icon:pinIcon,draggable:true}).addTo(leafletMap);
  gpsMarker.bindPopup('<b>Report Location</b><br>Drag to adjust');
  gpsMarker.on('dragend', e=>{ const p=e.target.getLatLng(); userLat=p.lat; userLng=p.lng;
    setGpsStatus('locating','Getting address...'); reverseGeocode(p.lat,p.lng); });
  leafletMap.on('click', e => {
    const p = e.latlng;
    userLat = p.lat;
    userLng = p.lng;
    if (gpsMarker) gpsMarker.setLatLng(p);
    setGpsStatus('locating','Getting address...');
    reverseGeocode(p.lat, p.lng);
  });
  setTimeout(()=>{ if(leafletMap) leafletMap.invalidateSize(); },150);
  setGpsStatus('idle','Tap "Locate Me" to set location');
}

function setGpsStatus(state, text) {
  const dot=document.getElementById('gps-dot'), txt=document.getElementById('gps-text'), btn=document.getElementById('locate-btn');
  if(!dot||!txt) return;
  const map={idle:{bg:'#BDBDBD',a:'none'},loading:{bg:'#F9A825',a:'pulse 1s infinite'},
    locating:{bg:'#F9A825',a:'pulse 1s infinite'},found:{bg:'#4CAF50',a:'none'},denied:{bg:'#E53935',a:'none'}};
  const s=map[state]||map.idle;
  dot.style.background=s.bg; dot.style.animation=s.a; txt.textContent=text||'';
  if(btn){ btn.disabled=(state==='loading'||state==='locating'); btn.style.opacity=btn.disabled?'0.6':'1';
    btn.textContent=btn.disabled?'⏳ Locating...':'📍 Locate Me'; }
}

function requestGPS() {
  if(!leafletMap){initMap();return;}
  setGpsStatus('loading','Requesting location...');
  if(!navigator.geolocation){setGpsStatus('denied','GPS not available');return;}
  navigator.geolocation.getCurrentPosition(
    pos=>{ userLat=pos.coords.latitude; userLng=pos.coords.longitude;
      leafletMap.setView([userLat,userLng],17);
      if(gpsMarker){gpsMarker.setLatLng([userLat,userLng]);gpsMarker.openPopup();}
      setGpsStatus('locating','Getting address...'); reverseGeocode(userLat,userLng); },
    err=>{ const msgs={1:'Enable location in settings',2:'GPS error',3:'GPS timeout'};
      setGpsStatus('denied',msgs[err.code]||'Location error'); },
    {enableHighAccuracy:true,timeout:12000,maximumAge:0}
  );
}

function reverseGeocode(lat, lng) {
  fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=en`)
    .then(r=>r.json())
    .then(data=>{ const a=data.address||{};
      const road=a.road||a.pedestrian||a.footway||'';
      const brgy=a.suburb||a.neighbourhood||a.village||a.town||'';
      const city=a.city||a.municipality||'';
      setGpsStatus('found',[road,brgy,city].filter(Boolean).join(', ')||`${lat.toFixed(5)},${lng.toFixed(5)}`); })
    .catch(()=>setGpsStatus('found',`${lat.toFixed(5)},${lng.toFixed(5)}`));
}

function prefillSubmitAddressFromHome() {
  const homeText = (document.getElementById('home-gps-text')?.textContent || '').trim();
  if (!homeText) return;
  const skipPatterns = ['Requesting location', 'Kinukuha ang lokasyon', 'GPS not available', 'Location access denied'];
  if (skipPatterns.some(p => homeText.includes(p))) return;
  setGpsStatus('found', homeText);
}

function getBestReportAddress() {
  const submitText = (document.getElementById('gps-text')?.textContent || '').trim();
  const homeText = (document.getElementById('home-gps-text')?.textContent || '').trim();
  const invalidSubmit = !submitText || submitText.includes('Tap "Locate Me"');

  if (!invalidSubmit) return submitText;
  if (homeText && !homeText.includes('Requesting location') && !homeText.includes('Kinukuha ang lokasyon')) {
    return homeText;
  }
  return `${Number(userLat).toFixed(5)},${Number(userLng).toFixed(5)}`;
}

// ── FORM ──
function selectCat(el){document.querySelectorAll('#cat-grid .cat-chip').forEach(c=>c.classList.remove('active'));el.classList.add('active');selectedCat=el.dataset.cat;}
function selectUrgency(el){document.querySelectorAll('.urgency-row .urgency-btn').forEach(b=>b.classList.remove('active'));el.classList.add('active');selectedUrgency=el.dataset.urg;}
function toggleNotif(btn){btn.classList.toggle('on');btn.classList.toggle('off');showToast(btn.classList.contains('on')?'🔔 On':'🔔 Off');}

// ── UTILITIES ──
function showToast(msg) {
  const el=document.getElementById('toast');
  el.textContent=msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.classList.remove('show'),2800);
}

function showLoading(show) {
  const overlay=document.getElementById('loading-overlay');
  if(!overlay) return;
  if(show) overlay.classList.add('show');
  else overlay.classList.remove('show');
}

// ══ SIGN UP SCREEN ══

function showSignupScreen(show) {
  const el = document.getElementById('screen-signup');
  if (!el) return;
  if (show) {
    el.classList.add('visible');
    requestAnimationFrame(() => {
      const fn = document.getElementById('su-firstname');
      if (fn) fn.focus();
    });
  } else {
    el.classList.remove('visible');
  }
}

function togglePw(inputId, btn) {
  const input = document.getElementById(inputId);
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  const svg = btn.querySelector('svg');
  if (svg) svg.setAttribute('stroke', isHidden ? '#8B1A1A' : '#BDBDBD');
}

function checkPasswordStrength(val) {
  const hasLength  = val.length >= 8;
  const hasSpecial = /[^a-zA-Z0-9]/.test(val);
  const hasNumber  = /[0-9]/.test(val);

  const setRule = (id, pass) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('pass', pass);
  };
  setRule('rule-length',  hasLength);
  setRule('rule-special', hasSpecial);
  setRule('rule-number',  hasNumber);

  const sv = document.getElementById('pw-strength-val');
  if (!sv) return;
  const score = [hasLength, hasSpecial, hasNumber].filter(Boolean).length;
  if (!val)       { sv.textContent = '—';      sv.className = 'pw-strength-val'; }
  else if (score <= 1) { sv.textContent = 'WEAK';   sv.className = 'pw-strength-val weak'; }
  else if (score === 2) { sv.textContent = 'FAIR';   sv.className = 'pw-strength-val fair'; }
  else              { sv.textContent = 'STRONG'; sv.className = 'pw-strength-val strong'; }
}

async function doRegister() {
  const firstName = document.getElementById('su-firstname').value.trim();
  const lastName  = document.getElementById('su-lastname').value.trim();
  const email     = document.getElementById('su-email').value.trim();
  const password  = document.getElementById('su-password').value;
  const phone     = document.getElementById('su-phone').value.trim();

  if (!firstName) { showToast('❌ Ilagay ang first name'); return; }
  if (!lastName)  { showToast('❌ Ilagay ang last name'); return; }
  if (!email)     { showToast('❌ Ilagay ang email'); return; }
  if (!password)  { showToast('❌ Ilagay ang password'); return; }
  if (password.length < 8) { showToast('❌ Password: 8 characters minimum'); return; }

  const btn = document.getElementById('su-btn');
  btn.disabled = true;
  btn.textContent = 'Nag-rerehistro...';
  showLoading(true);

  try {
    isRegisteringFlow = true;
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) throw error;

    if (data?.user) {
      try {
        await db.updateUserProfile(data.user.id, {
          first_name: firstName,
          last_name:  lastName,
          email,
          phone:      phone || null,
          barangay:   'Brgy. Francisco Homes-Mulawin',
          city:       'San Jose del Monte, Bulacan',
          created_at: new Date().toISOString(),
        });
      } catch (profileErr) {
        console.warn('Profile save warning:', profileErr.message);
      }

      if (data?.session) {
        try { await supabaseClient.auth.signOut(); } catch {}
      }
      cleanupSessionState();

      showLoading(false);
      showSignupScreen(false);
      showToast('✅ Account created! Mag-login gamit ang credentials mo.');
      showLoginScreen();

      document.getElementById('login-email').value = email;
      document.getElementById('login-password').value = '';
      document.getElementById('login-password').focus();
    }
  } catch (err) {
    showLoading(false);
    showToast('❌ ' + (err.message || 'Registration failed'));
  } finally {
    isRegisteringFlow = false;
    btn.disabled = false;
    btn.textContent = 'MAGREGISTER';
  }
}
