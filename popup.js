/**
 * Egnyte Yoda - main UI logic
 * Version: 1.8.3
 *
 * v1.8.3 - Fix extension icons; README update
 * v1.8.2 - First-run setup screen for configurable API base URL
 * v1.8.1 - Auto-update check against GitHub on startup
 * v1.8.0 - Light/dark mode toggle with persistent preference
 * v1.7.7 - Differences Only replaced with independent toggle on Compare and Domain Versions tabs
 * v1.7.1 - Dynamic export filename; hide diff badges/count during field search
 * v1.7.0 - Plans & Add-ons as sections in Compare table (with filter pills)
 * v1.6.0 - Dark terminal UI, accordion sections, search, version tracking, CSV export
 */

// ─── Tab mode detection ───
const IS_TAB = new URLSearchParams(window.location.search).has('tab');
if (IS_TAB) document.body.classList.add('tab-mode');

// ─── Theme (light / dark) ───
// applyTheme is defined here; init is called after storageGet is available (below storage helpers)
function applyTheme(mode) {
  document.documentElement.setAttribute('data-theme', mode === 'light' ? 'light' : '');
  var icon  = document.getElementById('theme-icon');
  var label = document.getElementById('theme-label');
  if (mode === 'light') {
    if (icon)  icon.textContent  = '🌙';
    if (label) label.textContent = 'Dark';
  } else {
    if (icon)  icon.textContent  = '☀️';
    if (label) label.textContent = 'Light';
  }
  storageSet('theme', mode);
}

document.getElementById('theme-toggle-btn') && document.getElementById('theme-toggle-btn').addEventListener('click', function() {
  var current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'light' ? 'dark' : 'light');
});

// ─── State ───
const state = {
  domains: [],
  filter: 'all',
  searchTerm: '',
  collapsed: {},
  activeTab: 'compare',
  diffOnly: false,
  showKeys: false,
  colors: ['#00c2ff','#ff6b35','#a855f7','#22c55e','#fbbf24','#ec4899','#14b8a6','#f97316']
};

// ─── Storage helpers ───
async function storageGet(key) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    return new Promise(res => chrome.storage.local.get(key, r => res(r[key] ?? null)));
  }
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

async function storageSet(key, value) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    return new Promise(res => chrome.storage.local.set({ [key]: value }, res));
  }
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// ─── Init theme (runs after storageGet/storageSet are defined) ───
(async function() {
  var saved = await storageGet('theme');
  // No saved preference — respect the browser/OS setting
  if (saved === 'light' || saved === 'dark') {
    applyTheme(saved);
  } else {
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
  }
})();

// ─── API Config ───
// Base URL is stored in chrome.storage.local under 'api-base-url'.
// All fetch functions read from this at call time via getApiBase().
// SENTINEL value 'demo' means the user opted out — only demo data is used.
var CONFIG_KEY = 'api-base-url';

async function getApiBase() {
  return await storageGet(CONFIG_KEY); // null = not configured yet, 'demo' = demo-only
}

function normalizeBaseUrl(raw) {
  // Strip trailing slash so we can always append paths with a leading slash
  return raw.trim().replace(/\/+$/, '');
}

function isValidUrl(str) {
  try { var u = new URL(str); return u.protocol === 'https:' || u.protocol === 'http:'; }
  catch { return false; }
}

// ─── Setup screen ───
async function maybeShowSetup() {
  var base = await getApiBase();
  if (base !== null) {
    showResetConfigBtn();
    return;
  }
  var setupOverlay = document.getElementById('setup-overlay');
  if (setupOverlay) setupOverlay.classList.add('open');
}

function showResetConfigBtn() {
  var btn = document.getElementById('reset-config-btn');
  if (btn) btn.style.display = '';
}

function hideSetup() {
  var setupOverlay = document.getElementById('setup-overlay');
  if (setupOverlay) setupOverlay.classList.remove('open');
  showResetConfigBtn();
}

document.getElementById('setup-save') && document.getElementById('setup-save').addEventListener('click', async function() {
  var input    = document.getElementById('setup-url-input');
  var errorEl  = document.getElementById('setup-error');
  var errorMsg = document.getElementById('setup-error-msg');
  var raw = input ? input.value.trim() : '';

  if (!raw || !isValidUrl(raw)) {
    if (input)    input.classList.add('error');
    if (errorMsg) errorMsg.textContent = 'Please enter a valid URL (must start with https:// or http://).';
    if (errorEl)  errorEl.classList.add('visible');
    return;
  }
  if (input)   input.classList.remove('error');
  if (errorEl) errorEl.classList.remove('visible');

  await storageSet(CONFIG_KEY, normalizeBaseUrl(raw));
  hideSetup();
});

document.getElementById('setup-skip') && document.getElementById('setup-skip').addEventListener('click', async function() {
  await storageSet(CONFIG_KEY, 'demo');
  hideSetup();
});

document.getElementById('setup-url-input') && document.getElementById('setup-url-input').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') document.getElementById('setup-save') && document.getElementById('setup-save').click();
});

// Reset config: clear stored URL and re-show setup screen
document.getElementById('reset-config-btn') && document.getElementById('reset-config-btn').addEventListener('click', async function() {
  var current = await getApiBase();
  var input = document.getElementById('setup-url-input');
  if (input) {
    input.value = (current && current !== 'demo') ? current : '';
    input.classList.remove('error');
  }
  var errorEl = document.getElementById('setup-error');
  if (errorEl) errorEl.classList.remove('visible');
  var setupOverlay = document.getElementById('setup-overlay');
  if (setupOverlay) setupOverlay.classList.add('open');
});

// ─── Active domain list persistence ───
async function saveActiveDomains() {
  var names = state.domains.map(function(d) { return d.name; });
  await storageSet('active-domains', names);
}

async function loadActiveDomains() {
  return (await storageGet('active-domains')) || [];
}

// ─── Version helpers ───
async function getVersions(domain) {
  return (await storageGet('versions:' + domain)) || [];
}

function dataSnapshot(data) {
  const details = data && data.details ? data.details : {};
  const parts = [];
  ['basic_data','features_data','advanced_data'].forEach(function(sec) {
    (details[sec] || []).forEach(function(row) { parts.push(row[1] + '=' + row[2]); });
  });
  return parts.sort().join('|');
}

async function saveVersionIfChanged(domain, newData) {
  const versions = await getVersions(domain);
  const newSnap = dataSnapshot(newData);
  if (versions.length > 0) {
    const latestSnap = dataSnapshot(versions[versions.length - 1].data);
    if (latestSnap === newSnap) return { saved: false, versions };
  }
  const ts = Date.now();
  const label = new Date(ts).toLocaleString();
  versions.push({ ts, label, data: newData });
  if (versions.length > 50) versions.splice(0, versions.length - 50);
  await storageSet('versions:' + domain, versions);
  return { saved: true, versions };
}

// ─── SAMPLE DATA & FETCH ───
const SAMPLE = {"success":true,"details":{"domain":"harmancorp","basic_data":[["Scheme Type (Trial or Buy?)","schemeType","buy"],["Subscription date","subscription_date","05/09/2017"],["Domain status","domain_status","active"],["Payment type","payment_type","Invoice"],["Account type","account_type","Demo Account"],["Admin name","admin_name","Bryan"],["Admin surname","admin_surname","Harman"],["Admin email","admin_email","bharman+demo@egnyte.com"],["Invoice contact","invoice_emails","bharman+demo@egnyte.com"],["MRR(current)","current_mrr",7968.0],["MRR(subscription)","subscription_mrr",3500.0],["Plan Version Id","planVersionId","1087621"],["Plan Name","planName","Ultimate"],["Plan Type","planTypeBilling","Gen_4"],["Is Google Drive (Legacy) Enabled","isGdriveIntegrationAvailable","TRUE"],["Power Users Consumed","actual_total_users",34],["Service Accounts Used","actual_service_accounts",7],["Power Users Purchased","maxMembers","50"],["Standard Users Consumed","actual_total_standard_users",5],["Standard Users Purchased","maxStandardMembers","50"],["Storage Consumed (GB)","actual_total_storage",33.57],["Storage Purchased","maxSpaceAllowed",10240],["Version policy","web_content_revisions_delete_limit","99"],["Trash Retention policy (in Days)","trash_empty_days","180"],["Max File Size Limit","max_filesize_limit","150.0 GB"]],"features_data":[["Is Branding Enabled","isAdvancedBrandingAvailable","TRUE"],["Is Advanced Audit Enabled","isAuditEnabled","TRUE"],["Is Device Control Enabled","isDeviceControlAvailable","TRUE"],["Is Desktop Sync Enabled","isElcEnabled","TRUE"],["Is AD LDAP Enabled","isExternalAuthFeatureEnabled","TRUE"],["Is FTP Enabled","isFtpEnabled","TRUE"],["Is Local Cloud Available","isLocalCloudAvailable","TRUE"],["Is OLC/ELC Enabled","isOlcEnabled","TRUE"],["Is Outlook Enabled","isOutlookAddInEnabled","TRUE"],["Is Password Policy Enabled","isPasswordPolicyAvailable","TRUE"],["Is Storage Connect Available","isStorageConnectAvailable","TRUE"],["Is Workgroup Enabled","isWorkgroupEnabled","TRUE"],["Is Role-Based Administration Enabled","isPuRolesAvailable","TRUE"],["Is TFA Enabled","twoFactorAuthenticationAvailable","TRUE"],["TFA info","twoFactorAuthenticationInfo","Enabled"],["Support Type","supportType","standard"],["Is Egnyte for DocuSign Enabled","isDocuSignIntegrationAvailable","TRUE"],["Is Multiple Entity Management Enabled","isMultiEntityManagementAvailable","TRUE"]],"advanced_data":[["Data Center","dc","avl"],["POD number","pod_number","1000"],["External Storage","custom_storage","False"],["External Storage Type","storage_type","GCS"],["Reseller Code","resellerCode","None"]]}};

function mutateForDemo(base, domain) {
  const d = JSON.parse(JSON.stringify(base));
  d.details.domain = domain;
  const rand = function(arr) { return arr[Math.floor(Math.random()*arr.length)]; };
  d.details.basic_data.forEach(function(row) {
    if (row[1] === 'planName') row[2] = rand(['Business','Ultimate','Enterprise']);
    if (row[1] === 'actual_total_users') row[2] = Math.floor(Math.random()*200+10);
    if (row[1] === 'maxMembers') row[2] = String(rand([25,50,100,250,500]));
    if (row[1] === 'current_mrr') row[2] = +(Math.random()*15000+500).toFixed(2);
    if (row[1] === 'domain_status') row[2] = rand(['active','active','active','inactive']);
    if (row[1] === 'planTypeBilling') row[2] = rand(['Gen_4','Gen_5']);
    if (row[1] === 'trash_empty_days') row[2] = String(rand(['30','90','180','365']));
  });
  d.details.features_data.forEach(function(row) {
    if (row[1] === 'isDocuSignIntegrationAvailable') row[2] = rand(['TRUE','FALSE']);
    if (row[1] === 'supportType') row[2] = rand(['standard','premium','enhanced']);
    if (row[1] === 'isFtpEnabled') row[2] = rand(['TRUE','FALSE']);
    if (row[1] === 'twoFactorAuthenticationInfo') row[2] = rand(['Enabled','Disabled','Optional']);
    if (row[1] === 'isLocalCloudAvailable') row[2] = rand(['TRUE','FALSE']);
  });
  d.details.advanced_data.forEach(function(row) {
    if (row[1] === 'dc') row[2] = rand(['avl','sjc','iad','dub']);
    if (row[1] === 'pod_number') row[2] = String(rand([1000,1001,1002,2000]));
    if (row[1] === 'storage_type') row[2] = rand(['GCS','S3','Azure']);
    if (row[1] === 'resellerCode') row[2] = rand(['None','MSFT','GOOG','None']);
  });
  return d;
}

async function fetchDomain(domain) {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    return new Promise(function(resolve, reject) {
      chrome.runtime.sendMessage({ type: 'FETCH_DOMAIN', domain: domain }, function(response) {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (response.ok) resolve(response.data);
        else { var e = new Error(response.error); e.status = response.status; reject(e); }
      });
    });
  }
  var base = await getApiBase();
  if (!base || base === 'demo') throw Object.assign(new Error('demo'), { _demo: true });
  var url = base + '/domain/detail/?domain=' + encodeURIComponent(domain);
  try {
    var res = await fetch(url, { credentials: 'include' });
    if (!res.ok) { var e = new Error('HTTP ' + res.status); e.status = res.status; throw e; }
    return await res.json();
  } catch (err) {
    if (err._demo) throw err;
    console.warn('Demo fallback for "' + domain + '":', err.message);
    await new Promise(function(r) { setTimeout(r, 400 + Math.random() * 600); });
    if (domain.toLowerCase() === 'error') throw new Error('Domain not found');
    return mutateForDemo(SAMPLE, domain);
  }
}

// ─── Plans sample data ───
var SAMPLE_EXPLORE_PLANS = {"trial_plans":[{"name":"Ultimate","pvi":1147621,"status":"CURRENT_PLAN","next_action":null,"mrr_per_user_per_month":"74","category":"DIRECT","category_display":"AI-Powered","days_left":0,"expiry_date":null,"description":null,"can_extend":false,"generation":4,"is_recommended":false,"items":[{"name":"copilot_add_on","title":"Copilot Add-On","feature_type":"AI"},{"name":"ai_driven_classification","title":"AI Driven Classification","feature_type":"AI"},{"name":"preview_gpt_summary","title":"Ask - Single Doc Summary and Q&A","feature_type":"AI"},{"name":"ocr_file_search","title":"OCR file search","feature_type":"AI"},{"name":"audit_report","title":"Advanced Audit Reports","feature_type":null},{"name":"behavioral_based_probable_ransomware","title":"Behavioral-Based Probable Ransomware","feature_type":null},{"name":"ransomware_recovery_90","title":"Advanced Snapshot & Recovery (90-day coverage)","feature_type":null},{"name":"ransomware_recovery","title":"Advanced Snapshot & Recovery (30-day coverage)","feature_type":null},{"name":"external_link","title":"External Link","feature_type":null},{"name":"protect_content_classification","title":"Content Classification","feature_type":null},{"name":"standard_user_management","title":"Standard User Management","feature_type":null},{"name":"protect_permission_browser","title":"Permission Browser","feature_type":null}],"in_trial_items":[]},{"name":"Life Sciences Professional","pvi":707791,"status":null,"next_action":"TRY_FEATURES","mrr_per_user_per_month":null,"category":"LIFE_SCIENCES","category_display":"Life Sciences","days_left":null,"expiry_date":null,"description":null,"can_extend":false,"generation":3,"is_recommended":false,"items":[{"name":"ai_driven_classification","title":"AI Driven Classification","feature_type":"AI"},{"name":"preview_gpt_summary","title":"Ask - Single Doc Summary and Q&A","feature_type":"AI"},{"name":"life_sciences_quality","title":"Life Sciences - Quality","feature_type":null},{"name":"workflow_life_sciences","title":"Workflow - Life Sciences","feature_type":null},{"name":"behavioral_based_probable_ransomware","title":"Behavioral-Based Probable Ransomware","feature_type":null},{"name":"audit_report","title":"Advanced Audit Reports","feature_type":null},{"name":"standard_user_management","title":"Standard User Management","feature_type":null}],"in_trial_items":[]},{"name":"Document Room Enterprise","pvi":832941,"status":null,"next_action":"TRY_FEATURES","mrr_per_user_per_month":null,"category":"DOCUMENT_ROOM","category_display":"Document Room","days_left":null,"expiry_date":null,"description":null,"can_extend":false,"generation":3,"is_recommended":false,"items":[{"name":"ai_driven_classification","title":"AI Driven Classification","feature_type":"AI"},{"name":"preview_gpt_summary","title":"Ask - Single Doc Summary and Q&A","feature_type":"AI"},{"name":"document_room","title":"Document Room Collaboration Essentials","feature_type":null},{"name":"document_room_portal","title":"Document Room Portal","feature_type":null},{"name":"behavioral_based_probable_ransomware","title":"Behavioral-Based Probable Ransomware","feature_type":null},{"name":"workflow_multi_step","title":"Workflow - Multi-Step","feature_type":null},{"name":"audit_report","title":"Advanced Audit Reports","feature_type":null}],"in_trial_items":[]},{"name":"GxP With Governance","pvi":915021,"status":null,"next_action":"CONTACT_SALES","mrr_per_user_per_month":null,"category":"GXP","category_display":"GxP","days_left":null,"expiry_date":null,"description":null,"can_extend":false,"generation":3,"is_recommended":false,"items":[{"name":"ai_driven_classification","title":"AI Driven Classification","feature_type":"AI"},{"name":"life_sciences_quality","title":"Life Sciences - Quality","feature_type":null},{"name":"life_sciences_quality_training","title":"Life Sciences - Quality Training","feature_type":null},{"name":"workflow_life_sciences","title":"Workflow - Life Sciences","feature_type":null},{"name":"behavioral_based_probable_ransomware","title":"Behavioral-Based Probable Ransomware","feature_type":null},{"name":"audit_report","title":"Advanced Audit Reports","feature_type":null}],"in_trial_items":[]}],"can_edit":true,"is_trial_add_ons_in_use":false};

var SAMPLE_TRIAL_ITEMS = {"trial_add_ons":[{"name":"project_control_package","title":"Project Hub","description":"Project Hub enables comprehensive oversight and management of project timelines, budgets, and resources.","status":null,"is_package":true,"can_extend":false,"expiry_date":null,"next_action":"START_FREE_TRIAL","icon_name":"briefcaseOutline","days_left":null,"service_list":[{"name":"procore_photo_sync","title":"Advanced Procore Photo Sync"},{"name":"project_homepage","title":"Project Dashboard"},{"name":"project_folder_templates","title":"Project Templates"},{"name":"procore_near_real_time_sync","title":"Advanced Procore Document Sync"},{"name":"project_closure","title":"Project Lifecycle Management"},{"name":"automated_project_detection","title":"Automated Project Detection"},{"name":"specification_analyst","title":"Specification Analyst"},{"name":"autodesk_construction_cloud_integration","title":"Autodesk Construction Cloud Integration"},{"name":"image_similarity","title":"Image Similarity"}],"trial_plan_name":null},{"name":"specialized_file_handler_package","title":"Specialized File Handler Add-On","description":"Enhances your system's ability to process, organize, and manage a wide range of file types automatically.","status":null,"is_package":true,"can_extend":false,"expiry_date":null,"next_action":"START_FREE_TRIAL","icon_name":"fileSettingsOutline","days_left":null,"service_list":[{"name":"construction_files_preview","title":"BIM File Preview"},{"name":"bim_file_preview_on_mobile","title":"BIM File Preview on Mobile"},{"name":"construction_files_search","title":"Advanced BIM File Search"},{"name":"max_supported_file_size_allowed","title":"Egnyte Max File Size"},{"name":"geolocation_search","title":"Geolocation Search"}],"trial_plan_name":null},{"name":"document_portal_add_on","title":"Document Portal Add-On","description":"A secure and centralized platform to upload, store, organize, and share documents with authorized users.","status":null,"is_package":true,"can_extend":false,"expiry_date":null,"next_action":"START_FREE_TRIAL","icon_name":"shieldTextOutline","days_left":null,"service_list":[{"name":"document_portal","title":"Document Portal"},{"name":"upload_request_workflows","title":"Upload Request Workflows"}],"trial_plan_name":null}],"can_edit":true,"is_other_plans_in_use":false};

function mutatePlansForDemo(base, domain) {
  var d = JSON.parse(JSON.stringify(base));
  var plans = d.trial_plans;
  // Clear all statuses, then assign one randomly as current
  plans.forEach(function(p) { p.status = null; p.next_action = 'TRY_FEATURES'; });
  var chosen = plans[Math.floor(Math.random() * plans.length)];
  chosen.status = 'CURRENT_PLAN';
  chosen.next_action = null;
  chosen.mrr_per_user_per_month = String(Math.floor(20 + Math.random() * 80));
  chosen.generation = Math.random() > 0.5 ? 4 : 3;
  return d;
}

async function fetchExplorePlans(domain) {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    return new Promise(function(resolve, reject) {
      chrome.runtime.sendMessage({ type: 'FETCH_EXPLORE_PLANS', domain: domain }, function(response) {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (response.ok) resolve(response.data);
        else reject(new Error(response.error));
      });
    });
  }
  var base = await getApiBase();
  if (!base || base === 'demo') { await new Promise(function(r) { setTimeout(r, 200); }); return mutatePlansForDemo(SAMPLE_EXPLORE_PLANS, domain); }
  var url = base + '/domain/explore_plans/' + encodeURIComponent(domain);
  try {
    var res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (err) {
    console.warn('Plans demo fallback for "' + domain + '":', err.message);
    await new Promise(function(r) { setTimeout(r, 200 + Math.random() * 400); });
    return mutatePlansForDemo(SAMPLE_EXPLORE_PLANS, domain);
  }
}

async function fetchTrialItems(domain) {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    return new Promise(function(resolve, reject) {
      chrome.runtime.sendMessage({ type: 'FETCH_TRIAL_ITEMS', domain: domain }, function(response) {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (response.ok) resolve(response.data);
        else reject(new Error(response.error));
      });
    });
  }
  var base = await getApiBase();
  if (!base || base === 'demo') { await new Promise(function(r) { setTimeout(r, 200); }); return JSON.parse(JSON.stringify(SAMPLE_TRIAL_ITEMS)); }
  var url = base + '/domain/trial_items/' + encodeURIComponent(domain);
  try {
    var res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (err) {
    console.warn('Trial items demo fallback for "' + domain + '":', err.message);
    await new Promise(function(r) { setTimeout(r, 200 + Math.random() * 400); });
    return JSON.parse(JSON.stringify(SAMPLE_TRIAL_ITEMS));
  }
}

// ─── Plans data fetching ───
function ensurePlansData(d) {
  // Returns a promise that resolves when both plansData and trialData are loaded.
  // Caches the in-flight promise so concurrent calls share the same request.
  if (d.plansData && d.trialData) return Promise.resolve();
  if (d._plansPromise) return d._plansPromise;
  d._plansPromise = Promise.all([
    d.plansData ? Promise.resolve(d.plansData) : fetchExplorePlans(d.name).then(function(p) { d.plansData = p; return p; }),
    d.trialData ? Promise.resolve(d.trialData) : fetchTrialItems(d.name).then(function(t) { d.trialData = t; return t; })
  ]).then(function() {
    d._plansPromise = null; // clear so future calls can re-fetch if needed
  }).catch(function(e) {
    d._plansPromise = null;
    console.warn('Plans data fetch error for ' + d.name, e);
  });
  return d._plansPromise;
}


// ─── Settings data fetching ───
async function fetchSettings(domain) {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    return new Promise(function(resolve, reject) {
      chrome.runtime.sendMessage({ type: 'FETCH_SETTINGS', domain: domain }, function(response) {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (response.ok) resolve(response.data);
        else { var e = new Error(response.error); e.status = response.status; reject(e); }
      });
    });
  }
  var base = await getApiBase();
  if (!base || base === 'demo') { await new Promise(function(r) { setTimeout(r, 200); }); return { content: [], userHasEditRight: false }; }
  var url = base + '/settings_dashboard/context/domain/context_value/'
    + encodeURIComponent(domain) + '/key/?domain=' + encodeURIComponent(domain) + '&hierarchy_type=all';
  try {
    var res = await fetch(url, { credentials: 'include' });
    if (!res.ok) { var e = new Error('HTTP ' + res.status); e.status = res.status; throw e; }
    return await res.json();
  } catch (err) {
    console.warn('Settings demo fallback for "' + domain + '":', err.message);
    await new Promise(function(r) { setTimeout(r, 200 + Math.random() * 400); });
    return { content: [], userHasEditRight: false };
  }
}

function ensureSettingsData(d) {
  if (d.settingsData) return Promise.resolve();
  if (d._settingsPromise) return d._settingsPromise;
  d._settingsPromise = fetchSettings(d.name).then(function(s) {
    d.settingsData = s;
    d._settingsPromise = null;
  }).catch(function(e) {
    d._settingsPromise = null;
    console.warn('Settings fetch error for ' + d.name, e);
  });
  return d._settingsPromise;
}

// ─── DOM refs ───
var domainInput      = document.getElementById('domain-input');
var addBtn           = document.getElementById('add-domain-btn');
var domainList       = document.getElementById('domain-list');
var compareBtn       = document.getElementById('compare-btn');
var domainCount      = document.getElementById('domain-count');
var emptyState       = document.getElementById('empty-state');
var compareView      = document.getElementById('compare-view');
var versionsView     = document.getElementById('versions-view');
var compareThead     = document.getElementById('compare-thead');
var compareTbody     = document.getElementById('compare-tbody');
var diffCount        = document.getElementById('diff-count');
var fieldSearch      = document.getElementById('field-search');
var fieldSearchClear = document.getElementById('field-search-clear');

// ─── Color ───
function colorFor(idx) { return state.colors[idx % state.colors.length]; }

// ─── Flash message ───
var flashTimer = null;
function flashError(msg, type) {
  var el = document.getElementById('domain-flash');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('flash-warn');
  if (type === 'warn') el.classList.add('flash-warn');
  el.classList.add('visible');
  clearTimeout(flashTimer);
  var duration = type === 'warn' ? 6000 : 3000; // login message stays longer
  flashTimer = setTimeout(function() { el.classList.remove('visible'); }, duration);
}

// ─── Tab switching ───
var queryView = document.getElementById('query-view');

function showTab(name) {
  compareView.style.display  = 'none';
  versionsView.style.display = 'none';
  if (queryView) queryView.style.display = 'none';
  emptyState.style.display   = 'none';

  if (name === 'compare') {
    var hasActive = state.domains.filter(function(d) { return d.status === 'active'; }).length;
    if (hasActive) { compareView.style.display = 'flex'; }
    else           { emptyState.style.display  = 'flex'; }
  } else if (name === 'versions') {
    versionsView.style.display = 'flex';
    renderVersionsTab();
  } else if (name === 'query') {
    if (queryView) queryView.style.display = 'flex';
  }
}

document.querySelectorAll('.tab').forEach(function(tab) {
  tab.addEventListener('click', function() {
    document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
    tab.classList.add('active');
    state.activeTab = tab.dataset.tab;
    showTab(state.activeTab);
  });
});

// ─── Sidebar ───
function renderSidebar() {
  domainList.innerHTML = '';
  state.domains.forEach(function(d, i) {
    var el = document.createElement('div');
    el.className = 'domain-item' + (d.selected ? ' selected' : '');
    var newBadge = d.versionNew ? '<span class="version-new-badge">NEW VER</span>' : '';
    el.innerHTML =
      '<div class="domain-dot" style="background:' + colorFor(i) + ';"></div>' +
      '<div class="domain-name">' + d.name + '</div>' +
      (d.status === 'loading' ? '<div class="spinner"></div>' : '') +
      (d.status === 'active'  ? '<div class="domain-status-badge status-active">\u2713</div>' : '') +
      // error domains are removed immediately, no error badge needed
      newBadge +
      '<button class="domain-remove" data-idx="' + i + '">\u00d7</button>';
    domainList.appendChild(el);
  });
  domainCount.textContent = state.domains.length;
  compareBtn.disabled = state.domains.filter(function(d) { return d.status === 'active'; }).length < 1;
  refreshVersionsDomainSelect();
}

// ─── Add domain ───
function switchToCompareTab() {
  populateQueryKeyList();
  if (state.activeTab !== 'compare') {
    document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
    var compareTab = document.querySelector('.tab[data-tab="compare"]');
    if (compareTab) compareTab.classList.add('active');
    state.activeTab = 'compare';
    showTab('compare');
  }
}

function addDomain(name) {
  name = name.trim().toLowerCase();
  if (!name) return;
  if (state.domains.find(function(d) { return d.name === name; })) {
    domainInput.style.borderColor = 'var(--warn)';
    setTimeout(function() { domainInput.style.borderColor = ''; }, 800);
    return;
  }
  switchToCompareTab();
  state.domains.push({ name: name, status: 'loading', data: null, versionNew: false });
  domainInput.value = '';
  renderSidebar();

  fetchDomain(name).then(function(data) {
    // Success handler wrapped in setTimeout so any internal errors do NOT
    // propagate into the rejection path below and falsely trigger "Domain not found".
    setTimeout(async function() {
      var d = state.domains.find(function(x) { return x.name === name; });
      if (!d) return;
      d.data = data;
      d.status = 'active';
      try {
        var result = await saveVersionIfChanged(name, data);
        d.versionNew = result.saved;
        if (result.saved) setTimeout(function() { d.versionNew = false; renderSidebar(); }, 4000);
      } catch(e) { console.warn('saveVersionIfChanged error', e); }
      renderSidebar();
      saveActiveDomains();
      autoCompare();
      ensurePlansData(d).then(function() {
        if (state.activeTab === 'compare') renderCompare();
        populateQueryKeyList();
      }).catch(function(e) { console.warn('ensurePlansData error', e); });
      ensureSettingsData(d).then(function() {
        if (state.activeTab === 'compare') renderCompare();
        populateQueryKeyList();
      }).catch(function(e) { console.warn('ensureSettingsData error', e); });
    }, 0);
  }, function(err) {
    // fetchDomain itself failed — remove placeholder and flash appropriate error
    var idx = state.domains.findIndex(function(x) { return x.name === name; });
    if (idx !== -1) state.domains.splice(idx, 1);
    renderSidebar();
    saveActiveDomains();
    if (err.status === 401) {
      flashError('\u{1F512} Not logged in — visit domaininfo.egnyte-internal.com first', 'warn');
    } else {
      flashError('\u2717 Domain not found: ' + name);
    }
    domainInput.value = name;
    domainInput.focus();
  });
}

function autoCompare() {
  if (state.domains.filter(function(d) { return d.status === 'active'; }).length >= 1) renderCompare();
}

// ─── Remove domain ───
domainList.addEventListener('click', function(e) {
  var removeBtn = e.target.closest('.domain-remove');
  if (removeBtn) {
    state.domains.splice(+removeBtn.dataset.idx, 1);
    renderSidebar();
    saveActiveDomains();
    renderCompare();
  }
});

addBtn.addEventListener('click', function() { addDomain(domainInput.value); });
domainInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') addDomain(domainInput.value); });
compareBtn.addEventListener('click', renderCompare);

// ─── Filter pills (section filter only — diff handled by toggle) ───
document.querySelectorAll('.pill[data-filter]').forEach(function(pill) {
  pill.addEventListener('click', function() {
    document.querySelectorAll('.pill[data-filter]').forEach(function(p) { p.classList.remove('active'); });
    pill.classList.add('active');
    state.filter = pill.dataset.filter;
    renderCompare();
  });
});

// ─── Show-keys toggle ───
function setShowKeys(val) {
  state.showKeys = val;
  var t = document.getElementById('keys-toggle');
  if (t) t.checked = val;
  var w = document.getElementById('keys-toggle-wrap');
  if (w) w.classList.toggle('active', val);
  // Toggle class on both compare tables
  [document.getElementById('compare-table'), document.getElementById('versions-table')].forEach(function(tbl) {
    if (tbl) tbl.classList.toggle('show-keys', val);
  });
  // Re-run search so key highlighting applies/removes correctly
  if (state.searchTerm) applyFieldSearch();
}

document.getElementById('keys-toggle') && document.getElementById('keys-toggle').addEventListener('change', function() {
  setShowKeys(this.checked);
});

// ─── Diff-only toggles ───
function setDiffOnly(val) {
  state.diffOnly = val;
  // Keep both toggles in sync
  var t1 = document.getElementById('diff-toggle');
  var t2 = document.getElementById('versions-diff-toggle');
  if (t1) t1.checked = val;
  if (t2) t2.checked = val;
  var w1 = document.getElementById('diff-toggle-wrap');
  var w2 = document.getElementById('versions-diff-toggle-wrap');
  if (w1) w1.classList.toggle('active', val);
  if (w2) w2.classList.toggle('active', val);
}

document.getElementById('diff-toggle') && document.getElementById('diff-toggle').addEventListener('change', function() {
  setDiffOnly(this.checked);
  renderCompare();
});

document.getElementById('versions-diff-toggle') && document.getElementById('versions-diff-toggle').addEventListener('change', async function() {
  setDiffOnly(this.checked);
  var domain = document.getElementById('versions-domain-select') ? document.getElementById('versions-domain-select').value : '';
  if (!domain) return;
  var versions = await getVersions(domain);
  renderVersionsCompare(versions);
});

// ─── Field search ───
fieldSearch.addEventListener('input', function() {
  state.searchTerm = fieldSearch.value.trim().toLowerCase();
  fieldSearchClear.classList.toggle('visible', state.searchTerm.length > 0);
  applyFieldSearch();
});

fieldSearchClear.addEventListener('click', function() {
  fieldSearch.value = '';
  state.searchTerm = '';
  fieldSearchClear.classList.remove('visible');
  applyFieldSearch();
});

function applyFieldSearch() {
  var term = state.searchTerm;
  var rows = compareTbody.querySelectorAll('tr.data-row');
  var sectionHasMatch = {};

  rows.forEach(function(row) {
    var section   = row.dataset.section;
    var labelEl   = row.querySelector('.field-label-text');
    var keyEl     = row.querySelector('.field-key-tip');
    var labelText = labelEl ? labelEl.textContent.toLowerCase() : '';
    var keyText   = keyEl   ? keyEl.textContent.toLowerCase()   : '';
    var vals      = Array.from(row.querySelectorAll('td:not(:first-child)')).map(function(td) { return td.textContent.toLowerCase(); }).join(' ');
    var matches   = !term || labelText.includes(term) || keyText.includes(term) || vals.includes(term);

    if (matches) {
      row.style.display = '';
      sectionHasMatch[section] = true;
      // For settings rows, also mark their parent level and prefix section headers
      if (row.dataset.settingsLevel) sectionHasMatch[row.dataset.settingsLevel] = true;
      if (row.dataset.settingsPrefix) sectionHasMatch[row.dataset.settingsPrefix] = true;
      if (term) {
        // Highlight label
        if (labelEl) {
          var orig = labelEl.dataset.orig || labelEl.textContent;
          labelEl.dataset.orig = orig;
          var idx = orig.toLowerCase().indexOf(term);
          labelEl.innerHTML = idx !== -1
            ? orig.slice(0, idx) + '<span class="search-highlight">' + orig.slice(idx, idx + term.length) + '</span>' + orig.slice(idx + term.length)
            : orig;
        }
        // Highlight key (only when show-keys is active, otherwise leave as-is)
        if (keyEl && state.showKeys) {
          var keyOrig = keyEl.dataset.orig || keyEl.textContent;
          keyEl.dataset.orig = keyOrig;
          var kidx = keyOrig.toLowerCase().indexOf(term);
          keyEl.innerHTML = kidx !== -1
            ? keyOrig.slice(0, kidx) + '<span class="search-highlight">' + keyOrig.slice(kidx, kidx + term.length) + '</span>' + keyOrig.slice(kidx + term.length)
            : keyOrig;
        }
      } else {
        if (labelEl) labelEl.innerHTML = labelEl.dataset.orig || labelEl.textContent;
        if (keyEl)   keyEl.innerHTML   = keyEl.dataset.orig   || keyEl.textContent;
      }
    } else {
      row.style.display = 'none';
    }
  });

  compareTbody.querySelectorAll('tr.section-row').forEach(function(sRow) {
    var key = sRow.dataset.section;
    var hasMatch = sectionHasMatch[key];
    sRow.style.display = (term && !hasMatch) ? 'none' : '';
    if (term && hasMatch && state.collapsed && state.collapsed[key]) {
      compareTbody.querySelectorAll('.data-row[data-section="' + key + '"]').forEach(function(r) {
        if (r.style.display !== 'none') r.classList.remove('section-collapsed');
      });
      // Also expand settings nested rows whose level or prefix key matches
      compareTbody.querySelectorAll('.settings-row[data-settings-level="' + key + '"], .settings-row[data-settings-prefix="' + key + '"]').forEach(function(r) {
        if (r.style.display !== 'none') r.classList.remove('section-collapsed');
      });
      compareTbody.querySelectorAll('.settings-prefix-row[data-settings-level="' + key + '"]').forEach(function(r) {
        r.classList.remove('section-collapsed');
      });
      var chev = sRow.querySelector('.section-chevron');
      if (chev) chev.classList.remove('collapsed');
    }
    // Hide section diff badges and global diff count when search is active
    var badge = sRow.querySelector('.section-diff-badge');
    if (badge) badge.style.display = term ? 'none' : '';
  });

  // Hide/show the global diff count
  if (diffCount) diffCount.style.display = term ? 'none' : (diffCount.textContent ? 'block' : 'none');
}

// ─── Shared table builder (used by Compare + Versions) ───
function buildCompareTable(thead, tbody, columns, diffCountEl) {
  var sections = [
    { key: 'basic_data',    label: 'Basic Configuration' },
    { key: 'features_data', label: 'Features' },
    { key: 'advanced_data', label: 'Advanced / Infrastructure' },
    { key: 'plans_data',    label: 'Plans' },
    { key: 'addons_data',   label: 'Add-ons' },
    { key: 'settings_data', label: 'Settings', defaultCollapsed: true }
  ];
  var sectionFilter = {
    basic:    'basic_data',
    features: 'features_data',
    advanced: 'advanced_data',
    plans:    'plans_data',
    addons:   'addons_data',
    settings: 'settings_data'
  };

  // Header
  var theadHtml = '<tr><th>Field</th>';
  columns.forEach(function(col) {
    var dot  = col.color ? '<span class="col-dot" style="background:' + col.color + ';"></span>' : '';
    var inner = col.domain
      ? '<a href="https://' + col.domain + '.egnyte.com/app/index.do#settings/configuration/general/" target="_blank" class="domain-col-link" title="Open ' + col.domain + ' admin settings">' + dot + col.label + '</a>'
      : dot + col.label;
    theadHtml += '<th class="domain-col">' + inner + '</th>';
  });
  theadHtml += '</tr>';
  thead.innerHTML = theadHtml;

  var totalDiffs = 0;
  var tbodyHtml = '';

  sections.forEach(function(section) {
    var filterKeys = ['basic','features','advanced','plans','addons','settings'];
    if (filterKeys.includes(state.filter) && sectionFilter[state.filter] !== section.key) return;

    // Default-collapse sections that request it (e.g. settings_data)
    if (section.defaultCollapsed && state.collapsed && state.collapsed[section.key] === undefined) {
      state.collapsed[section.key] = true;
    }

    // Build fieldMap: key -> label, and values per column
    // For plans_data and addons_data, synthesize rows from plansData/trialData
    var fieldMap = {};   // key -> label
    var overrideValues = {};  // key -> [val per column]  (for synthesized sections)

    if (section.key === 'plans_data') {
      // Collect all plan names across domains
      var allPlanKeys = {};
      columns.forEach(function(col) {
        ((col.plansData && col.plansData.trial_plans) || []).forEach(function(plan) {
          allPlanKeys[plan.name] = plan.name;
        });
      });
      // Special first row: current plan name
      fieldMap['__current_plan__'] = 'Current Plan';
      overrideValues['__current_plan__'] = columns.map(function(col) {
        var cur = ((col.plansData && col.plansData.trial_plans) || []).find(function(p) { return p.status === 'CURRENT_PLAN'; });
        return cur ? cur.name : '—';
      });
      // One row per plan: is it the current plan?
      Object.keys(allPlanKeys).forEach(function(planName) {
        var key = 'plan__' + planName;
        fieldMap[key] = planName;
        overrideValues[key] = columns.map(function(col) {
          var plans = (col.plansData && col.plansData.trial_plans) || [];
          var plan = plans.find(function(p) { return p.name === planName; });
          if (!plan) return '—';
          if (plan.status === 'CURRENT_PLAN') return 'CURRENT';
          return plan.next_action ? plan.next_action.replace(/_/g,' ') : 'available';
        });
      });
      // Loading placeholder if no data yet
      if (columns.some(function(col) { return !col.plansData; })) {
        fieldMap['__plans_loading__'] = 'Loading…';
        overrideValues['__plans_loading__'] = columns.map(function(col) { return col.plansData ? '✓' : '…'; });
      }
    } else if (section.key === 'addons_data') {
      // One row per add-on title
      var allAddonKeys = {};
      columns.forEach(function(col) {
        ((col.trialData && col.trialData.trial_add_ons) || []).forEach(function(addon) {
          allAddonKeys[addon.name] = addon.title;
        });
      });
      Object.keys(allAddonKeys).forEach(function(addonName) {
        var key = 'addon__' + addonName;
        fieldMap[key] = allAddonKeys[addonName];
        overrideValues[key] = columns.map(function(col) {
          var addons = (col.trialData && col.trialData.trial_add_ons) || [];
          var addon = addons.find(function(a) { return a.name === addonName; });
          if (!addon) return '—';
          if (addon.status) return addon.status;
          if (addon.days_left !== null && addon.days_left !== undefined) return addon.days_left + ' days left';
          return addon.next_action ? addon.next_action.replace(/_/g,' ') : 'available';
        });
      });
      if (columns.some(function(col) { return !col.trialData; })) {
        fieldMap['__addons_loading__'] = 'Loading…';
        overrideValues['__addons_loading__'] = columns.map(function(col) { return col.trialData ? '✓' : '…'; });
      }
    } else if (section.key === 'settings_data') {
      // Settings are rendered via nested sub-sections — skip normal fieldMap pass.
      // The actual rendering is handled below in the settings block.
    } else {
      // Standard sections: read from col.data.details[section.key]
      columns.forEach(function(col) {
        if (col.data && col.data.details && col.data.details[section.key]) {
          col.data.details[section.key].forEach(function(row) {
            if (!fieldMap[row[1]]) fieldMap[row[1]] = row[0];
          });
        }
      });
    }

    var sectionRows   = '';
    var sectionHasRows = false;
    var sectionDiffs  = 0;
    var sectionTotal  = 0;

    if (section.key === 'settings_data') {
      // ── Nested rendering: key_level → prefix → rows ──
      var allSettingNames = {};
      columns.forEach(function(col) {
        ((col.settingsData && col.settingsData.content) || []).forEach(function(item) {
          allSettingNames[item.name] = true;
        });
      });

      if (columns.some(function(col) { return !col.settingsData; })) {
        sectionHasRows = true;
        var isCTop = state.collapsed && state.collapsed[section.key];
        sectionRows += '<tr class="data-row' + (isCTop ? ' section-collapsed' : '') + '" data-section="' + section.key + '">'
          + '<td colspan="' + (columns.length + 1) + '" style="color:var(--muted);font-size:11px;padding:8px 12px;">'
          + '<span class="spinner" style="width:8px;height:8px;display:inline-block;margin-right:6px;"></span>Loading settings…</td></tr>';
      } else if (Object.keys(allSettingNames).length === 0) {
        sectionHasRows = true;
        var isCTop = state.collapsed && state.collapsed[section.key];
        sectionRows += '<tr class="data-row' + (isCTop ? ' section-collapsed' : '') + '" data-section="' + section.key + '">'
          + '<td colspan="' + (columns.length + 1) + '" style="color:var(--muted);font-size:11px;padding:8px 12px;">No settings data</td></tr>';
      } else {
        // Build unified map: level -> prefix -> name -> {label, fullKey}
        var allByLevel = {};
        Object.keys(allSettingNames).forEach(function(name) {
          var level = null;
          columns.forEach(function(col) {
            if (level) return;
            var found = ((col.settingsData && col.settingsData.content) || []).find(function(i) { return i.name === name; });
            if (found) level = found.key_level;
          });
          if (!level) return;
          var dotIdx = name.indexOf('.');
          var prefix = dotIdx !== -1 ? name.slice(0, dotIdx) : '__root__';
          var suffix = dotIdx !== -1 ? name.slice(dotIdx + 1) : name;
          if (!allByLevel[level]) allByLevel[level] = {};
          if (!allByLevel[level][prefix]) allByLevel[level][prefix] = {};
          allByLevel[level][prefix][name] = { label: suffix, fullKey: name };
        });

        var isCTop = state.collapsed && state.collapsed[section.key];
        var levelOrder = ['DOMAIN','DC','POD','DEFAULT'];
        var sortedLevels = Object.keys(allByLevel).sort(function(a,b) {
          return (levelOrder.indexOf(a) === -1 ? 99 : levelOrder.indexOf(a)) - (levelOrder.indexOf(b) === -1 ? 99 : levelOrder.indexOf(b));
        });

        sortedLevels.forEach(function(level) {
          var levelKey = 'settings__' + level;
          var isCLevel = isCTop || (state.collapsed && state.collapsed[levelKey]);
          var levelDiffs = 0, levelTotal = 0, levelRows = '';

          Object.keys(allByLevel[level]).sort().forEach(function(prefix) {
            var prefixKey = 'settings__' + level + '__' + prefix;
            var isCPrefix = isCLevel || (state.collapsed && state.collapsed[prefixKey]);
            var prefixDiffs = 0, prefixTotal = 0, prefixRows = '';

            Object.keys(allByLevel[level][prefix]).sort().forEach(function(name) {
              var meta = allByLevel[level][prefix][name];
              var values = columns.map(function(col) {
                var item = ((col.settingsData && col.settingsData.content) || []).find(function(i) { return i.name === name; });
                return item ? item.value : '—';
              });
              var isDiff = columns.length > 1 && values.some(function(v) { return String(v) !== String(values[0]); });
              if (isDiff) { totalDiffs++; sectionDiffs++; prefixDiffs++; levelDiffs++; }
              prefixTotal++; levelTotal++; sectionTotal++;
              if (state.diffOnly && !isDiff) return;

              sectionHasRows = true;
              var row = '<tr class="data-row settings-row' + (isCPrefix ? ' section-collapsed' : '') + '" data-section="' + section.key + '" data-settings-prefix="' + prefixKey + '" data-settings-level="' + levelKey + '">';
              row += '<td class="settings-field-cell"><span class="field-label-text">' + meta.label + '</span><span class="field-key-tip">' + meta.fullKey + '</span></td>';
              values.forEach(function(val) {
                row += '<td class="' + (isDiff ? 'val diff-cell' : 'val same-cell') + ' ' + valClass(val) + '">' + formatVal(val) + '</td>';
              });
              row += '</tr>';
              prefixRows += row;
            });

            if (prefixTotal > 0 && (!state.diffOnly || prefixDiffs > 0)) {
              var pb = (prefixDiffs > 0 && !state.searchTerm) ? '<span class="section-diff-badge">⚡ ' + prefixDiffs + '</span>' : '';
              var pc = '<span class="section-chevron' + (isCPrefix ? ' collapsed' : '') + '">▼</span>';
              levelRows += '<tr class="section-row settings-prefix-row' + (isCLevel ? ' section-collapsed' : '') + '" data-section="' + prefixKey + '" data-settings-level="' + levelKey + '" data-parent-section="' + section.key + '">'
                + '<td colspan="' + (columns.length + 1) + '"><div class="section-header-inner settings-prefix-header"><div class="section-header-left">' + pc + '<span class="settings-prefix-label">' + prefix + '</span>' + pb + '</div><span class="section-count">' + prefixTotal + '</span></div></td></tr>';
              levelRows += prefixRows;
            }
          });

          if (levelTotal > 0 && (!state.diffOnly || levelDiffs > 0)) {
            sectionHasRows = true;
            var lb = (levelDiffs > 0 && !state.searchTerm) ? '<span class="section-diff-badge">⚡ ' + levelDiffs + ' diff' + (levelDiffs !== 1 ? 's' : '') + '</span>' : '';
            var lc = '<span class="section-chevron' + (isCLevel ? ' collapsed' : '') + '">▼</span>';
            sectionRows += '<tr class="section-row settings-level-row' + (isCTop ? ' section-collapsed' : '') + '" data-section="' + levelKey + '" data-parent-section="' + section.key + '">'
              + '<td colspan="' + (columns.length + 1) + '"><div class="section-header-inner settings-level-header"><div class="section-header-left">' + lc + '<span class="settings-level-label">' + level + '</span>' + lb + '</div><span class="section-count">' + levelTotal + ' field' + (levelTotal !== 1 ? 's' : '') + '</span></div></td></tr>';
            sectionRows += levelRows;
          }
        });
      }

    } else {
      Object.keys(fieldMap).forEach(function(fieldKey) {
        var fieldLabel = fieldMap[fieldKey];
        var values;
        if (overrideValues[fieldKey]) {
          values = overrideValues[fieldKey];
        } else {
          values = columns.map(function(col) {
            var rows = (col.data && col.data.details && col.data.details[section.key]) ? col.data.details[section.key] : [];
            var found = rows.find(function(r) { return r[1] === fieldKey; });
            return found ? found[2] : '\u2014';
          });
        }

        var isDiff = columns.length > 1 && values.some(function(v) { return String(v) !== String(values[0]); });
        if (isDiff) { totalDiffs++; sectionDiffs++; }
        sectionTotal++;

        if (state.diffOnly && !isDiff) return;

        sectionHasRows = true;
        var isCollapsed = state.collapsed && state.collapsed[section.key];
        var row = '<tr class="data-row' + (isCollapsed ? ' section-collapsed' : '') + '" data-section="' + section.key + '">';
        row += '<td><span class="field-label-text">' + fieldLabel + '</span><span class="field-key-tip">' + fieldKey + '</span></td>';
        values.forEach(function(val) {
          var cls = isDiff ? 'val diff-cell' : 'val same-cell';
          var displayVal = val;
          if (section.key === 'plans_data' && val === 'CURRENT') {
            displayVal = '<span style="color:var(--accent);font-weight:600;">✓ Current</span>';
            cls = 'val same-cell';
          } else {
            displayVal = formatVal(val);
          }
          row += '<td class="' + cls + ' ' + valClass(val) + '">' + displayVal + '</td>';
        });
        row += '</tr>';
        sectionRows += row;
      });
    }

    if (sectionHasRows || Object.keys(fieldMap).length > 0) {
      var isCollapsed = state.collapsed && state.collapsed[section.key];
      var diffBadge  = (sectionDiffs > 0 && !state.searchTerm) ? '<span class="section-diff-badge">\u26a1 ' + sectionDiffs + ' diff' + (sectionDiffs !== 1 ? 's' : '') + '</span>' : '';
      var chevron    = '<span class="section-chevron' + (isCollapsed ? ' collapsed' : '') + '">\u25bc</span>';
      var countLabel = '<span class="section-count">' + sectionTotal + ' field' + (sectionTotal !== 1 ? 's' : '') + '</span>';

      // Loading indicator in section header for plans/addons
      var loadingNote = '';
      if (section.key === 'plans_data' && columns.some(function(c) { return !c.plansData; })) {
        loadingNote = '<span class="section-count" style="color:var(--accent);margin-left:6px;"><span class="spinner" style="width:8px;height:8px;"></span></span>';
      }
      if (section.key === 'addons_data' && columns.some(function(c) { return !c.trialData; })) {
        loadingNote = '<span class="section-count" style="color:var(--accent);margin-left:6px;"><span class="spinner" style="width:8px;height:8px;"></span></span>';
      }

      tbodyHtml += '<tr class="section-row" data-section="' + section.key + '"><td colspan="' + (columns.length + 1) + '"><div class="section-header-inner"><div class="section-header-left">' + chevron + '<span>' + section.label + '</span>' + diffBadge + loadingNote + '</div>' + countLabel + '</div></td></tr>';
      tbodyHtml += sectionRows;
    }
  });

  tbody.innerHTML = tbodyHtml;

  // Accordion — handles top-level sections, settings level rows, and settings prefix rows
  tbody.querySelectorAll('.section-row').forEach(function(row) {
    row.addEventListener('click', function() {
      var key = row.dataset.section;
      if (!state.collapsed) state.collapsed = {};
      state.collapsed[key] = !state.collapsed[key];
      var isNow = state.collapsed[key];

      if (row.classList.contains('settings-level-row')) {
        // Collapsing a level row: hide/show all prefix rows and data rows under this level
        tbody.querySelectorAll('.settings-prefix-row[data-settings-level="' + key + '"]').forEach(function(r) {
          r.classList.toggle('section-collapsed', isNow);
        });
        tbody.querySelectorAll('.settings-row[data-settings-level="' + key + '"]').forEach(function(r) {
          r.classList.toggle('section-collapsed', isNow);
        });
      } else if (row.classList.contains('settings-prefix-row')) {
        // Collapsing a prefix row: hide/show only its data rows
        tbody.querySelectorAll('.settings-row[data-settings-prefix="' + key + '"]').forEach(function(r) {
          r.classList.toggle('section-collapsed', isNow);
        });
      } else {
        // Top-level section row: hide/show all data rows (and for settings, also level+prefix sub-rows)
        tbody.querySelectorAll('.data-row[data-section="' + key + '"]').forEach(function(r) { r.classList.toggle('section-collapsed', isNow); });
        if (key === 'settings_data') {
          tbody.querySelectorAll('.settings-level-row, .settings-prefix-row').forEach(function(r) {
            r.classList.toggle('section-collapsed', isNow);
          });
        }
      }

      var chev = row.querySelector('.section-chevron');
      if (chev) chev.classList.toggle('collapsed', isNow);
    });
  });

  if (diffCountEl) {
    if (totalDiffs > 0 && !state.searchTerm) {
      diffCountEl.style.display = 'block';
      diffCountEl.textContent = totalDiffs + ' difference' + (totalDiffs !== 1 ? 's' : '') + ' found';
    } else {
      diffCountEl.style.display = 'none';
    }
  }
  return totalDiffs;
}



// ─── Query key typeahead ───
function populateQueryKeyList() {
  var list = document.getElementById('query-key-list');
  if (!list) return;

  var active = state.domains.filter(function(d) { return d.status === 'active'; });
  var keys = {};

  // Basic / Features / Advanced
  ['basic_data','features_data','advanced_data'].forEach(function(sKey) {
    active.forEach(function(d) {
      ((d.data && d.data.details && d.data.details[sKey]) || []).forEach(function(row) {
        keys[row[1]] = true;  // backend key
        keys[row[0]] = true;  // human label
      });
    });
  });

  // Plans
  active.forEach(function(d) {
    ((d.plansData && d.plansData.trial_plans) || []).forEach(function(p) {
      keys['plan__' + p.name] = true;
    });
  });

  // Add-ons
  active.forEach(function(d) {
    ((d.trialData && d.trialData.trial_add_ons) || []).forEach(function(a) {
      keys['addon__' + a.name] = true;
    });
  });

  // Settings
  active.forEach(function(d) {
    ((d.settingsData && d.settingsData.content) || []).forEach(function(item) {
      keys[item.name] = true;
    });
  });

  var sorted = Object.keys(keys).sort();
  list.innerHTML = sorted.map(function(k) {
    return '<option value="' + k.replace(/"/g, '&quot;') + '">';
  }).join('');
}

// ─── Query tab ───

var queryKeyOp  = document.getElementById('query-key-op');
var queryKeyVal = document.getElementById('query-key-val');
var queryValOp  = document.getElementById('query-val-op');
var queryValVal = document.getElementById('query-val-val');
var queryRunBtn = document.getElementById('query-run-btn');
var queryClearBtn = document.getElementById('query-clear-btn');
var queryResultCount = document.getElementById('query-result-count');
var queryThead  = document.getElementById('query-thead');
var queryTbody  = document.getElementById('query-tbody');

// Hide/show the value text input depending on the value operator
function syncQueryValInput() {
  if (!queryValOp || !queryValVal) return;
  var op = queryValOp.value;
  var needsText = (op === 'contains' || op === 'equals');
  queryValVal.classList.toggle('hidden', !needsText);
}
queryValOp && queryValOp.addEventListener('change', syncQueryValInput);
syncQueryValInput();

// Run on Enter in either input
[queryKeyVal, queryValVal].forEach(function(el) {
  el && el.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') runQuery();
  });
});

queryRunBtn  && queryRunBtn.addEventListener('click', runQuery);
queryClearBtn && queryClearBtn.addEventListener('click', clearQuery);

function clearQuery() {
  if (queryKeyVal)  queryKeyVal.value  = '';
  if (queryValVal)  queryValVal.value  = '';
  if (queryValOp)   queryValOp.value   = 'any';
  if (queryKeyOp)   queryKeyOp.value   = 'contains';
  syncQueryValInput();
  if (queryTbody) queryTbody.innerHTML = '<tr><td colspan="99" class="query-empty-msg">Enter a key and/or value condition above and click Run Query.</td></tr>';
  if (queryThead) queryThead.innerHTML = '';
  if (queryResultCount) queryResultCount.style.display = 'none';
}

function rowMatchesQuery(keyName, value, keyOp, keyTerm, valOp, valTerm) {
  // Key condition
  if (keyTerm) {
    var kn = keyName.toLowerCase();
    var kt = keyTerm.toLowerCase();
    if (keyOp === 'equals'   && kn !== kt)        return false;
    if (keyOp === 'contains' && !kn.includes(kt)) return false;
  }
  // Value condition
  var vs = String(value).toLowerCase();
  if (valOp === 'equals'  && vs !== valTerm.toLowerCase())          return false;
  if (valOp === 'contains' && !vs.includes(valTerm.toLowerCase()))  return false;
  if (valOp === 'true'    && vs !== 'true')                         return false;
  if (valOp === 'false'   && vs !== 'false')                        return false;
  return true;
}

function runQuery() {
  var active = state.domains.filter(function(d) { return d.status === 'active'; });
  if (!active.length) {
    if (queryTbody) queryTbody.innerHTML = '<tr><td colspan="99" class="query-empty-msg">No domains loaded. Add domains in the sidebar first.</td></tr>';
    return;
  }

  var keyOp  = queryKeyOp  ? queryKeyOp.value  : 'contains';
  var keyTerm = queryKeyVal ? queryKeyVal.value.trim() : '';
  var valOp  = queryValOp  ? queryValOp.value  : 'any';
  var valTerm = queryValVal ? queryValVal.value.trim() : '';

  // Must have at least one condition
  if (!keyTerm && valOp === 'any') {
    if (queryTbody) queryTbody.innerHTML = '<tr><td colspan="99" class="query-empty-msg">Enter at least a key name or a value condition.</td></tr>';
    return;
  }

  // Build column headers (same as compare table)
  var theadHtml = '<tr><th>Key</th>';
  active.forEach(function(d) {
    var dot = d.color ? '<span class="col-dot" style="background:' + colorFor(state.domains.indexOf(d)) + ';"></span>' : '';
    theadHtml += '<th class="domain-col">' + dot + d.name + '</th>';
  });
  theadHtml += '</tr>';
  if (queryThead) queryThead.innerHTML = theadHtml;

  // Collect all unique keys from all sources across all active domains
  // Structure: { keyName: { label, source, values: [val per domain] } }
  var allKeys = {};  // keyName -> { label, values: [] }

  // Helper to register a key with values across all domains
  function registerKey(keyName, label, getValueFn) {
    if (!allKeys[keyName]) {
      allKeys[keyName] = {
        label: label,
        values: active.map(function(d) { return getValueFn(d); })
      };
    }
  }

  // ── Basic / Features / Advanced ──
  var stdSections = ['basic_data', 'features_data', 'advanced_data'];
  stdSections.forEach(function(sKey) {
    active.forEach(function(d) {
      if (!d.data || !d.data.details || !d.data.details[sKey]) return;
      d.data.details[sKey].forEach(function(row) {
        var fieldKey = row[1], fieldLabel = row[0];
        registerKey(fieldKey, fieldLabel, function(col) {
          var rows = (col.data && col.data.details && col.data.details[sKey]) || [];
          var found = rows.find(function(r) { return r[1] === fieldKey; });
          return found ? found[2] : '—';
        });
      });
    });
  });

  // ── Plans ──
  var allPlanNames = {};
  active.forEach(function(d) {
    ((d.plansData && d.plansData.trial_plans) || []).forEach(function(p) { allPlanNames[p.name] = true; });
  });
  Object.keys(allPlanNames).forEach(function(planName) {
    registerKey('plan__' + planName, 'Plan: ' + planName, function(col) {
      var plans = (col.plansData && col.plansData.trial_plans) || [];
      var plan = plans.find(function(p) { return p.name === planName; });
      if (!plan) return '—';
      if (plan.status === 'CURRENT_PLAN') return 'CURRENT';
      return plan.next_action ? plan.next_action.replace(/_/g,' ') : 'available';
    });
  });

  // ── Add-ons ──
  var allAddonNames = {};
  active.forEach(function(d) {
    ((d.trialData && d.trialData.trial_add_ons) || []).forEach(function(a) { allAddonNames[a.name] = a.title; });
  });
  Object.keys(allAddonNames).forEach(function(addonName) {
    registerKey('addon__' + addonName, 'Add-on: ' + allAddonNames[addonName], function(col) {
      var addons = (col.trialData && col.trialData.trial_add_ons) || [];
      var addon = addons.find(function(a) { return a.name === addonName; });
      if (!addon) return '—';
      if (addon.status) return addon.status;
      if (addon.days_left !== null && addon.days_left !== undefined) return addon.days_left + ' days left';
      return addon.next_action ? addon.next_action.replace(/_/g,' ') : 'available';
    });
  });

  // ── Settings ──
  var allSettingNames = {};
  active.forEach(function(d) {
    ((d.settingsData && d.settingsData.content) || []).forEach(function(item) {
      allSettingNames[item.name] = true;
    });
  });
  Object.keys(allSettingNames).forEach(function(name) {
    registerKey(name, name, function(col) {
      var item = ((col.settingsData && col.settingsData.content) || []).find(function(i) { return i.name === name; });
      return item ? item.value : '—';
    });
  });

  // ── Apply query conditions to every key ──
  var matchedRows = [];
  Object.keys(allKeys).forEach(function(keyName) {
    var entry = allKeys[keyName];
    // A key passes if ANY domain's value satisfies the value condition
    // (AND the key condition applies to the keyName itself)
    var keyPasses = true;
    if (keyTerm) {
      var kn = keyName.toLowerCase();
      var kt = keyTerm.toLowerCase();
      if (keyOp === 'equals'   && kn !== kt)        keyPasses = false;
      if (keyOp === 'contains' && !kn.includes(kt)) keyPasses = false;
    }
    if (!keyPasses) return;

    // Value condition: must be satisfied by at least one domain's value
    var valPasses = (valOp === 'any'); // 'any' always passes
    if (!valPasses) {
      valPasses = entry.values.some(function(v) {
        var vs = String(v).toLowerCase();
        var vt = valTerm.toLowerCase();
        if (valOp === 'equals')   return vs === vt;
        if (valOp === 'contains') return vs.includes(vt);
        if (valOp === 'true')     return vs === 'true';
        if (valOp === 'false')    return vs === 'false';
        return false;
      });
    }
    if (!valPasses) return;

    matchedRows.push({ keyName: keyName, label: entry.label, values: entry.values });
  });

  // ── Render results ──
  if (matchedRows.length === 0) {
    queryTbody.innerHTML = '<tr><td colspan="99" class="query-empty-msg">No matching keys found across loaded domains.</td></tr>';
    if (queryResultCount) queryResultCount.style.display = 'none';
    return;
  }

  // Sort: diffs first, then alphabetically by key
  matchedRows.sort(function(a, b) {
    var aDiff = active.length > 1 && a.values.some(function(v) { return String(v) !== String(a.values[0]); });
    var bDiff = active.length > 1 && b.values.some(function(v) { return String(v) !== String(b.values[0]); });
    if (aDiff && !bDiff) return -1;
    if (!aDiff && bDiff) return 1;
    return a.keyName.localeCompare(b.keyName);
  });

  var diffCount = 0;
  var tbodyHtml = '';
  matchedRows.forEach(function(match) {
    var isDiff = active.length > 1 && match.values.some(function(v) { return String(v) !== String(match.values[0]); });
    if (isDiff) diffCount++;
    var row = '<tr class="data-row">';
    row += '<td><span class="field-label-text">' + match.label + '</span><span class="field-key-tip">' + match.keyName + '</span></td>';
    match.values.forEach(function(val) {
      var matchesVal = valOp !== 'any' && rowMatchesQuery(match.keyName, val, keyOp, keyTerm, valOp, valTerm)
                    && !(keyTerm && !rowMatchesQuery(match.keyName, val, keyOp, keyTerm, 'any', ''));
      // Highlight cells where the value specifically matches the value condition
      var valHighlight = (valOp !== 'any') ? ' query-val-match' : '';
      var vs = String(val).toLowerCase();
      var vt = valTerm.toLowerCase();
      var cellMatch = valOp === 'any' ? false
        : valOp === 'equals'   ? vs === vt
        : valOp === 'contains' ? vs.includes(vt)
        : valOp === 'true'     ? vs === 'true'
        : valOp === 'false'    ? vs === 'false' : false;
      var cls = isDiff ? 'val diff-cell' : 'val same-cell';
      if (cellMatch) cls += ' query-val-match';
      row += '<td class="' + cls + ' ' + valClass(val) + '">' + formatVal(val) + '</td>';
    });
    row += '</tr>';
    tbodyHtml += row;
  });

  queryTbody.innerHTML = tbodyHtml;

  if (queryResultCount) {
    queryResultCount.style.display = 'block';
    var msg = matchedRows.length + ' match' + (matchedRows.length !== 1 ? 'es' : '');
    if (diffCount > 0) msg += ' — ⚡ ' + diffCount + ' with diffs';
    queryResultCount.textContent = msg;
  }
}

// ─── Compare tab ───
function renderCompare() {
  var active = state.domains.filter(function(d) { return d.status === 'active'; });
  if (active.length === 0) {
    emptyState.style.display = 'flex';
    compareView.style.display = 'none';
    return;
  }
  emptyState.style.display = 'none';
  compareView.style.display = 'flex';

  var columns = active.map(function(d) {
    return { label: d.name, domain: d.name, color: colorFor(state.domains.indexOf(d)), data: d.data, plansData: d.plansData || null, trialData: d.trialData || null, settingsData: d.settingsData || null };
  });

  buildCompareTable(compareThead, compareTbody, columns, diffCount);
  if (state.searchTerm) applyFieldSearch();
}

// ─── Versions tab ───
function refreshVersionsDomainSelect() {
  var sel = document.getElementById('versions-domain-select');
  if (!sel) return;
  var current = sel.value;
  sel.innerHTML = '<option value="">— select domain —</option>';
  state.domains.filter(function(d) { return d.status === 'active'; }).forEach(function(d) {
    var opt = document.createElement('option');
    opt.value = d.name;
    opt.textContent = d.name;
    sel.appendChild(opt);
  });
  if (current) sel.value = current;
}

async function renderVersionsTab() {
  var domainSel = document.getElementById('versions-domain-select');
  var v1Sel     = document.getElementById('versions-v1-select');
  var v2Sel     = document.getElementById('versions-v2-select');
  var emptyDiv  = document.getElementById('versions-empty');
  var table     = document.getElementById('versions-table');
  var domain    = domainSel ? domainSel.value : '';

  if (!domain) {
    emptyDiv.style.display = 'flex';
    table.style.display = 'none';
    if (v1Sel) v1Sel.innerHTML = '';
    if (v2Sel) v2Sel.innerHTML = '';
    return;
  }

  var versions = await getVersions(domain);

  if (versions.length === 0) {
    emptyDiv.style.display = 'flex';
    var sub = emptyDiv.querySelector('.empty-sub');
    if (sub) sub.textContent = 'No versions saved for "' + domain + '" yet. Load it in the Compare tab first.';
    table.style.display = 'none';
    if (v1Sel) v1Sel.innerHTML = '';
    if (v2Sel) v2Sel.innerHTML = '';
    return;
  }

  var buildOptions = function(sel, defaultIdx) {
    sel.innerHTML = '';
    var rev = versions.slice().reverse();
    rev.forEach(function(v, i) {
      var realIdx = versions.length - 1 - i;
      var opt = document.createElement('option');
      opt.value = realIdx;
      opt.textContent = 'v' + (realIdx + 1) + ': ' + v.label;
      sel.appendChild(opt);
    });
    sel.selectedIndex = Math.min(defaultIdx, sel.options.length - 1);
  };

  if (v1Sel) buildOptions(v1Sel, Math.min(1, versions.length - 1));
  if (v2Sel) buildOptions(v2Sel, 0);

  renderVersionsCompare(versions);
}

function renderVersionsCompare(versions) {
  var v1Sel    = document.getElementById('versions-v1-select');
  var v2Sel    = document.getElementById('versions-v2-select');
  var emptyDiv = document.getElementById('versions-empty');
  var table    = document.getElementById('versions-table');
  var thead    = document.getElementById('versions-thead');
  var tbody    = document.getElementById('versions-tbody');
  var vDiff    = document.getElementById('versions-diff-count');
  var domain   = document.getElementById('versions-domain-select') ? document.getElementById('versions-domain-select').value : '';

  var idx1 = v1Sel ? parseInt(v1Sel.value) : NaN;
  var idx2 = v2Sel ? parseInt(v2Sel.value) : NaN;

  if (isNaN(idx1) || isNaN(idx2) || !versions || versions.length === 0) {
    emptyDiv.style.display = 'flex';
    table.style.display = 'none';
    return;
  }

  var v1 = versions[idx1];
  var v2 = versions[idx2];
  if (!v1 || !v2) return;

  emptyDiv.style.display = 'none';
  table.style.display = '';

  var columns;
  if (idx1 === idx2) {
    columns = [{ label: 'v' + (idx1 + 1) + ': ' + v1.label, domain: domain, color: '#a855f7', data: v1.data }];
  } else {
    columns = [
      { label: 'v' + (idx1 + 1) + ': ' + v1.label, domain: domain, color: '#a855f7', data: v1.data },
      { label: 'v' + (idx2 + 1) + ': ' + v2.label, domain: domain, color: '#00c2ff', data: v2.data }
    ];
  }

  buildCompareTable(thead, tbody, columns, vDiff);
}

document.getElementById('versions-domain-select') && document.getElementById('versions-domain-select').addEventListener('change', renderVersionsTab);
document.getElementById('versions-compare-btn') && document.getElementById('versions-compare-btn').addEventListener('click', async function() {
  var domain = document.getElementById('versions-domain-select') ? document.getElementById('versions-domain-select').value : '';
  if (!domain) return;
  var versions = await getVersions(domain);
  renderVersionsCompare(versions);
});

// ─── Utility ───
function valClass(val) {
  var s = String(val).toUpperCase();
  if (s === 'TRUE')  return 'val-true';
  if (s === 'FALSE') return 'val-false';
  if (!isNaN(val) && val !== '\u2014') return 'val-num';
  return 'val-str';
}

function formatVal(val) {
  var s = String(val);
  if (s.toUpperCase() === 'TRUE')  return '\u2713 TRUE';
  if (s.toUpperCase() === 'FALSE') return '\u2717 FALSE';
  return s;
}

// ─── Bulk Import ───
document.getElementById('bulk-import-btn').addEventListener('click', function() {
  document.getElementById('bulk-modal').classList.add('open');
});
document.getElementById('bulk-cancel').addEventListener('click', function() {
  document.getElementById('bulk-modal').classList.remove('open');
});
document.getElementById('bulk-import-confirm').addEventListener('click', function() {
  var text = document.getElementById('bulk-textarea').value;
  text.split(/[\n,]+/).map(function(s) { return s.trim(); }).filter(Boolean).forEach(addDomain);
  document.getElementById('bulk-modal').classList.remove('open');
  document.getElementById('bulk-textarea').value = '';
});

// ─── Open in Tab ───
var openTabBtn = document.getElementById('open-tab-btn');
if (openTabBtn) {
  openTabBtn.addEventListener('click', function() {
    var domainNames = state.domains.map(function(d) { return d.name; });
    var params = '?tab=1';
    if (domainNames.length) params += '&domains=' + domainNames.map(encodeURIComponent).join(',');
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') + params });
    } else {
      window.open(window.location.href.split('?')[0] + params, '_blank');
    }
  });
}

// ─── Restore domains on startup ───
// Priority: URL params (passed from popup→tab) > persisted storage list
(async function() {
  // Check config first — shows setup screen if not yet configured
  await maybeShowSetup();

  var urlParams = new URLSearchParams(window.location.search);
  var domainsParam = urlParams.get('domains');
  if (domainsParam) {
    // Opened as tab with explicit domain list — use those and persist them
    var names = domainsParam.split(',').map(decodeURIComponent).filter(Boolean);
    names.forEach(addDomain);
  } else {
    // No URL params — restore from persisted list (covers popup reopens + tab reopens)
    var saved = await loadActiveDomains();
    if (saved && saved.length) {
      saved.forEach(addDomain);
    }
  }
})();

// ─── Export ───
document.getElementById('export-btn').addEventListener('click', function() {
  var active = state.domains.filter(function(d) { return d.status === 'active'; });
  if (!active.length) return;
  var rows = [['Field'].concat(active.map(function(d) { return d.name; }))];

  // Standard sections
  ['basic_data','features_data','advanced_data'].forEach(function(sec) {
    var fieldMap = {};
    active.forEach(function(d) {
      ((d.data && d.data.details && d.data.details[sec]) || []).forEach(function(r) { if (!fieldMap[r[1]]) fieldMap[r[1]] = r[0]; });
    });
    Object.keys(fieldMap).forEach(function(key) {
      var vals = active.map(function(d) {
        var found = ((d.data && d.data.details && d.data.details[sec]) || []).find(function(r) { return r[1] === key; });
        return found ? found[2] : '';
      });
      rows.push([fieldMap[key]].concat(vals));
    });
  });

  // Plans section
  var allPlanNames = {};
  active.forEach(function(d) {
    ((d.plansData && d.plansData.trial_plans) || []).forEach(function(p) { allPlanNames[p.name] = true; });
  });
  if (Object.keys(allPlanNames).length) {
    rows.push(['--- Plans ---'].concat(active.map(function() { return ''; })));
    rows.push(['Current Plan'].concat(active.map(function(d) {
      var cur = ((d.plansData && d.plansData.trial_plans) || []).find(function(p) { return p.status === 'CURRENT_PLAN'; });
      return cur ? cur.name : '';
    })));
    Object.keys(allPlanNames).forEach(function(name) {
      rows.push([name].concat(active.map(function(d) {
        var plans = (d.plansData && d.plansData.trial_plans) || [];
        var plan = plans.find(function(p) { return p.name === name; });
        if (!plan) return '';
        return plan.status === 'CURRENT_PLAN' ? 'CURRENT' : (plan.next_action || 'available');
      })));
    });
  }

  // Add-ons section
  var allAddonNames = {};
  active.forEach(function(d) {
    ((d.trialData && d.trialData.trial_add_ons) || []).forEach(function(a) { allAddonNames[a.name] = a.title; });
  });
  if (Object.keys(allAddonNames).length) {
    rows.push(['--- Add-ons ---'].concat(active.map(function() { return ''; })));
    Object.keys(allAddonNames).forEach(function(name) {
      rows.push([allAddonNames[name]].concat(active.map(function(d) {
        var addon = ((d.trialData && d.trialData.trial_add_ons) || []).find(function(a) { return a.name === name; });
        if (!addon) return '';
        if (addon.status) return addon.status;
        if (addon.days_left != null) return addon.days_left + ' days left';
        return addon.next_action || 'available';
      })));
    });
  }

  var csv = rows.map(function(r) { return r.map(function(v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
  var blob = new Blob([csv], { type: 'text/csv' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'EgnyteYodaCompare-' + active.map(function(d) { return d.name; }).join('-') + '.csv';
  a.click();
});


// ─── Release Notes ───
function loadReleaseNotes() {
  var body = document.getElementById('relnotes-body');
  if (!body || body.dataset.loaded) return;
  fetch(chrome.runtime.getURL ? chrome.runtime.getURL('changelog.json') : 'changelog.json')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      body.innerHTML = data.versions.map(function(v, i) {
        var isCurrent = i === 0;
        return '<div class="relnotes-entry">' +
          '<div class="relnotes-version' + (isCurrent ? '' : ' older') + '">v' + v.version + (isCurrent ? ' — current' : '') + '</div>' +
          '<div class="relnotes-items">' +
          v.changes.map(function(c) { return '<div class="relnotes-item">' + c + '</div>'; }).join('') +
          '</div></div>';
      }).join('');
      body.dataset.loaded = '1';
    })
    .catch(function(e) {
      body.innerHTML = '<div style="color:var(--muted);font-size:11px;padding:8px;">Could not load changelog.json</div>';
      console.warn('changelog.json load error', e);
    });
}

document.getElementById('relnotes-btn') && document.getElementById('relnotes-btn').addEventListener('click', function() {
  loadReleaseNotes();
  document.getElementById('relnotes-overlay').classList.add('open');
});
document.getElementById('relnotes-close') && document.getElementById('relnotes-close').addEventListener('click', function() {
  document.getElementById('relnotes-overlay').classList.remove('open');
});
document.getElementById('relnotes-overlay') && document.getElementById('relnotes-overlay').addEventListener('click', function(e) {
  if (e.target === this) this.classList.remove('open');
});

// ─── domain-col-link CSS injection (add to head since we can't edit HTML easily) ───
var style = document.createElement('style');
style.textContent = '.domain-col-link { color: inherit; text-decoration: none; display: flex; align-items: center; gap: 6px; width: 100%; } .domain-col-link:hover { color: var(--accent); text-decoration: underline; }';
document.head.appendChild(style);

// ─── Manual "Check for Updates" button ───
document.getElementById('check-update-btn') && document.getElementById('check-update-btn').addEventListener('click', async function() {
  var btn = this;
  btn.disabled = true;
  btn.textContent = '↻ Checking…';
  btn.classList.remove('uptodate');

  try {
    var res = await fetch(GITHUB_CHANGELOG_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    var remoteVersion = data.versions && data.versions[0] && data.versions[0].version;
    if (!remoteVersion) throw new Error('No version in response');

    var localVersion = chrome && chrome.runtime && chrome.runtime.getManifest
      ? chrome.runtime.getManifest().version : '0';

    await storageSet('update-last-check', Date.now());
    await storageSet('update-remote-version', remoteVersion);

    if (isNewer(remoteVersion, localVersion)) {
      showUpdateBanner(remoteVersion);
      btn.textContent = '↻ Updates';
    } else {
      btn.classList.add('uptodate');
      btn.textContent = '✓ Up to date';
      setTimeout(function() {
        btn.textContent = '↻ Updates';
        btn.classList.remove('uptodate');
      }, 3000);
    }
  } catch (e) {
    btn.textContent = '↻ Updates';
    console.warn('Yoda manual update check failed:', e.message);
  } finally {
    btn.disabled = false;
  }
});

// ─── Auto-update check ───
// Fetches changelog.json from the GitHub repo's raw URL and compares versions.
// Replace GITHUB_RAW_URL with the actual raw URL to your changelog.json, e.g.:
// https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/changelog.json
var GITHUB_CHANGELOG_URL = 'https://raw.githubusercontent.com/chiptemm/Yoda-Browser-Extension/main/changelog.json';
var GITHUB_REPO_URL      = 'https://github.com/chiptemm/Yoda-Browser-Extension';

function parseVersion(vStr) {
  // Convert "1.8.1" → [1, 8, 1] for numeric comparison
  return String(vStr).split('.').map(function(n) { return parseInt(n, 10) || 0; });
}

function isNewer(remote, local) {
  var r = parseVersion(remote);
  var l = parseVersion(local);
  for (var i = 0; i < Math.max(r.length, l.length); i++) {
    var rv = r[i] || 0, lv = l[i] || 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
}

function showUpdateBanner(remoteVersion) {
  var banner  = document.getElementById('update-banner');
  var verEl   = document.getElementById('update-banner-version');
  var notesEl = document.getElementById('update-banner-notes');
  var btn     = document.getElementById('relnotes-btn');
  if (!banner) return;

  if (verEl)   verEl.textContent = 'v' + remoteVersion;
  if (notesEl) notesEl.href = GITHUB_REPO_URL + '/releases';
  if (btn)     btn.classList.add('update-available');

  banner.classList.add('visible');
}

document.getElementById('update-dismiss') && document.getElementById('update-dismiss').addEventListener('click', function() {
  var banner = document.getElementById('update-banner');
  if (banner) banner.classList.remove('visible');
});

// Clicking "What's new" in the banner also opens the release notes modal
document.getElementById('update-banner-notes') && document.getElementById('update-banner-notes').addEventListener('click', function(e) {
  // If URL is still placeholder, open the release notes modal instead of navigating
  if (GITHUB_REPO_URL.includes('YOUR_USERNAME')) {
    e.preventDefault();
    loadReleaseNotes();
    var overlay = document.getElementById('relnotes-overlay');
    if (overlay) overlay.classList.add('open');
  }
  // Otherwise let the href navigate to GitHub releases in a new tab
});

(async function checkForUpdates() {
  // Don't hammer GitHub on every single keystroke in dev — throttle to once per hour
  var lastCheck = await storageGet('update-last-check');
  var now = Date.now();
  if (lastCheck && (now - lastCheck) < 60 * 60 * 1000) {
    // Still within the hour — check cached result instead
    var cachedRemote = await storageGet('update-remote-version');
    var localVersion = chrome && chrome.runtime && chrome.runtime.getManifest
      ? chrome.runtime.getManifest().version
      : '1.8.1';
    if (cachedRemote && isNewer(cachedRemote, localVersion)) {
      showUpdateBanner(cachedRemote);
    }
    return;
  }

  try {
    var res = await fetch(GITHUB_CHANGELOG_URL, { cache: 'no-store' });
    if (!res.ok) return;
    var data = await res.json();
    var remoteVersion = data.versions && data.versions[0] && data.versions[0].version;
    if (!remoteVersion) return;

    await storageSet('update-last-check', now);
    await storageSet('update-remote-version', remoteVersion);

    var localVersion = chrome && chrome.runtime && chrome.runtime.getManifest
      ? chrome.runtime.getManifest().version
      : '1.8.1';

    if (isNewer(remoteVersion, localVersion)) {
      showUpdateBanner(remoteVersion);
    }
  } catch (e) {
    // Network unavailable or fetch blocked — fail silently
    console.debug('Yoda update check skipped:', e.message);
  }
})();
