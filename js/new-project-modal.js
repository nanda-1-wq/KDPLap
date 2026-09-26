/* ════════════════════════════════════════════════════════════
   KDP Lab — New Project Modal (shared component)
   ────────────────────────────────────────────────────────────
   Standard entry point for every generator (word search,
   sudoku, crossword, journal, …).  Collects KDP book settings
   (project type, trim size, paper type, bleed, page count)
   and hands them back via callback OR persists to
   sessionStorage and navigates to the generator URL.

   Usage:
     KDPNewProject.openAndNavigate('generators/word-search.html');

     // or inline (generator page when settings missing):
     KDPNewProject.open({
       defaultName: 'My Puzzle Book',
       onCreate: (settings) => { ... },
       onClose:  () => { ... }   // optional
     });

   Read persisted settings on a generator page:
     const s = KDPNewProject.getSettings();   // or null
     KDPNewProject.clearSettings();
════════════════════════════════════════════════════════════ */
(function (window) {

  /* ── Data: KDP-supported options ─────────────────────────── */
  const PROJECT_TYPES = [
    'Paperback: Cover and Interior',
    'Paperback: Interior Only',
    'Hardcover: Cover and Interior',
    'Hardcover: Interior Only',
    'eBook (Kindle)'
  ];

  const TRIM_SIZES = [
    { label: '5 x 8 in (12.70 x 20.32 cm)',                       w: 5,    h: 8    },
    { label: '5.06 x 7.81 in (12.85 x 19.84 cm)',                 w: 5.06, h: 7.81 },
    { label: '5.25 x 8 in (13.34 x 20.32 cm)',                    w: 5.25, h: 8    },
    { label: '5.5 x 8.5 in (13.97 x 21.59 cm)',                   w: 5.5,  h: 8.5  },
    { label: '6 x 9 in (15.24 x 22.86 cm)',                       w: 6,    h: 9    },
    { label: '6.14 x 9.21 in (15.60 x 23.39 cm)',                 w: 6.14, h: 9.21 },
    { label: '7 x 10 in (17.78 x 25.40 cm)',                      w: 7,    h: 10   },
    { label: '7.44 x 9.69 in (18.90 x 24.61 cm)',                 w: 7.44, h: 9.69 },
    { label: '7.5 x 9.25 in (19.05 x 23.50 cm)',                  w: 7.5,  h: 9.25 },
    { label: '8 x 10 in (20.32 x 25.40 cm)',                      w: 8,    h: 10   },
    { label: '8.25 x 6 in (20.96 x 15.24 cm) — landscape',        w: 8.25, h: 6    },
    { label: '8.25 x 8.25 in (20.96 x 20.96 cm) — square',        w: 8.25, h: 8.25 },
    { label: '8.5 x 8.5 in (21.59 x 21.59 cm) — square',          w: 8.5,  h: 8.5  },
    { label: '8.5 x 11 in (21.59 x 27.94 cm)',                    w: 8.5,  h: 11   }
  ];
  const DEFAULT_TRIM_INDEX = 4;   // 6 x 9 in

  const PAPER_TYPES = [
    'Black & white interior with white paper',
    'Black & white interior with cream paper',
    'Standard color interior with white paper',
    'Premium color interior with white paper'
  ];

  const SESSION_KEY = 'kdp:new-project';

  /* ── One-time CSS injection ──────────────────────────────── */
  const CSS = `
    .kdp-modal-overlay{
      position:fixed;inset:0;z-index:9999;
      background:rgba(20,8,50,.55);
      backdrop-filter:blur(4px);
      display:flex;align-items:center;justify-content:center;
      padding:20px;
      opacity:0;pointer-events:none;
      transition:opacity .2s ease;
      font-family:'DM Sans',sans-serif;
    }
    .kdp-modal-overlay.show{opacity:1;pointer-events:auto;}
    .kdp-modal{
      background:#fff;border-radius:18px;
      width:100%;max-width:520px;
      max-height:calc(100vh - 40px);overflow:hidden;
      display:flex;flex-direction:column;
      box-shadow:0 24px 80px rgba(20,8,50,.35);
      transform:translateY(12px);opacity:.95;
      transition:transform .2s ease,opacity .2s ease;
    }
    .kdp-modal-overlay.show .kdp-modal{transform:translateY(0);opacity:1;}

    .kdp-modal-header{
      display:flex;align-items:center;justify-content:space-between;
      padding:20px 24px;border-bottom:1px solid rgba(124,58,237,.08);
      flex-shrink:0;
    }
    .kdp-modal-title{
      font-family:'JetBrains Mono',monospace;
      font-size:18px;font-weight:800;color:#1A0A3C;letter-spacing:-.3px;
    }
    .kdp-modal-close{
      background:none;border:none;cursor:pointer;
      width:32px;height:32px;border-radius:8px;
      display:flex;align-items:center;justify-content:center;
      color:#5B4B8A;transition:background .15s,color .15s;
    }
    .kdp-modal-close:hover{background:rgba(124,58,237,.08);color:#7C3AED;}
    .kdp-modal-close svg{width:18px;height:18px;}

    .kdp-modal-body{overflow-y:auto;flex:1;}
    .kdp-modal-section{padding:20px 24px;}
    .kdp-modal-section.top{background:#F4F1FB;}

    .kdp-field{display:flex;flex-direction:column;gap:7px;margin-bottom:16px;}
    .kdp-field:last-child{margin-bottom:0;}
    .kdp-field-label{
      font-size:13px;font-weight:600;color:#1A0A3C;letter-spacing:-.1px;
    }
    .kdp-input,.kdp-select{
      font-family:'DM Sans',sans-serif;font-size:14px;color:#1A0A3C;
      background:#fff;border:1px solid rgba(124,58,237,.22);
      border-radius:10px;padding:11px 14px;outline:none;width:100%;
      transition:border-color .15s,box-shadow .15s;
    }
    .kdp-input:focus,.kdp-select:focus{
      border-color:#7C3AED;box-shadow:0 0 0 3px rgba(124,58,237,.12);
    }
    .kdp-select{
      appearance:none;
      background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12' fill='none' stroke='%235B4B8A' stroke-width='1.8'%3E%3Cpolyline points='2,4 6,8 10,4'/%3E%3C/svg%3E");
      background-repeat:no-repeat;background-position:right 14px center;background-size:12px;
      padding-right:38px;cursor:pointer;
    }

    /* Toggle (Low Content / AI Story Generator) */
    .kdp-toggle{
      display:grid;grid-template-columns:1fr 1fr;
      border:1.5px solid #7C3AED;border-radius:10px;
      overflow:hidden;background:#fff;margin-top:14px;
    }
    .kdp-toggle button{
      font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;
      padding:11px 12px;border:none;cursor:pointer;
      background:transparent;color:#7C3AED;
      transition:background .15s,color .15s;
    }
    .kdp-toggle button.active{background:#7C3AED;color:#fff;}
    .kdp-toggle button:not(.active):hover{background:rgba(124,58,237,.06);}

    /* Bleed / Page Count row */
    .kdp-bleed-row{
      display:grid;grid-template-columns:1fr 160px;gap:18px;align-items:start;
    }
    @media(max-width:480px){.kdp-bleed-row{grid-template-columns:1fr;}}
    .kdp-radio-group{display:flex;gap:18px;padding-top:8px;}
    .kdp-radio{
      display:inline-flex;align-items:center;gap:8px;cursor:pointer;
      font-size:14px;color:#1A0A3C;
    }
    .kdp-radio input{
      appearance:none;-webkit-appearance:none;
      width:18px;height:18px;border:1.5px solid rgba(124,58,237,.4);
      border-radius:50%;outline:none;cursor:pointer;
      position:relative;flex-shrink:0;
      transition:border-color .15s;
    }
    .kdp-radio input:checked{border-color:#7C3AED;}
    .kdp-radio input:checked::after{
      content:'';position:absolute;inset:3px;
      background:#7C3AED;border-radius:50%;
    }

    .kdp-modal-footer{
      padding:18px 24px 22px;border-top:1px solid rgba(124,58,237,.08);
      flex-shrink:0;background:#fff;
    }
    .kdp-btn-create{
      width:100%;padding:13px;
      font-family:'DM Sans',sans-serif;font-size:15px;font-weight:600;
      color:#fff;border:none;cursor:pointer;
      background:linear-gradient(135deg,#7C3AED 0%,#9D6FEC 100%);
      border-radius:10px;
      box-shadow:0 4px 20px rgba(124,58,237,.35);
      transition:box-shadow .25s,transform .2s,opacity .2s;
    }
    .kdp-btn-create:hover{box-shadow:0 8px 32px rgba(124,58,237,.45);transform:translateY(-1px);}
    .kdp-btn-create:active{transform:translateY(0);}
    .kdp-btn-create:disabled{opacity:.6;cursor:not-allowed;transform:none;}

    .kdp-error{
      color:#991b1b;font-size:12px;margin-top:6px;display:none;
    }
    .kdp-error.show{display:block;}
  `;

  function injectCss() {
    if (document.getElementById('kdp-modal-styles')) return;
    const style = document.createElement('style');
    style.id = 'kdp-modal-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  /* ── Build modal DOM ─────────────────────────────────────── */
  function buildModal(opts) {
    const defaultName = opts.defaultName || '';

    const projectOpts = PROJECT_TYPES
      .map((t, i) => `<option value="${i}">${t}</option>`).join('');
    const trimOpts = TRIM_SIZES
      .map((t, i) => `<option value="${i}"${i === DEFAULT_TRIM_INDEX ? ' selected' : ''}>${t.label}</option>`).join('');
    const paperOpts = PAPER_TYPES
      .map((t, i) => `<option value="${i}">${t}</option>`).join('');

    const overlay = document.createElement('div');
    overlay.className = 'kdp-modal-overlay';
    overlay.innerHTML = `
      <div class="kdp-modal" role="dialog" aria-modal="true" aria-labelledby="kdpModalTitle">
        <header class="kdp-modal-header">
          <span class="kdp-modal-title" id="kdpModalTitle">New Project</span>
          <button class="kdp-modal-close" type="button" aria-label="Close" data-kdp-close>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>
          </button>
        </header>

        <div class="kdp-modal-body">
          <div class="kdp-modal-section top">
            <div class="kdp-field">
              <label class="kdp-field-label" for="kdpProjectType">Project Type</label>
              <select class="kdp-select" id="kdpProjectType">${projectOpts}</select>
            </div>
            <div class="kdp-toggle" role="tablist">
              <button type="button" class="active" data-mode="low-content">Low Content</button>
              <button type="button"               data-mode="ai-story">AI Story Generator</button>
            </div>
          </div>

          <div class="kdp-modal-section">
            <div class="kdp-field">
              <label class="kdp-field-label" for="kdpProjectName">Project Name</label>
              <input class="kdp-input" type="text" id="kdpProjectName" maxlength="80" autocomplete="off" value="${escapeAttr(defaultName)}"/>
              <span class="kdp-error" id="kdpProjectNameError">Please enter a project name.</span>
            </div>

            <div class="kdp-field">
              <label class="kdp-field-label" for="kdpTrimSize">Trim Size</label>
              <select class="kdp-select" id="kdpTrimSize">${trimOpts}</select>
            </div>

            <div class="kdp-field">
              <label class="kdp-field-label" for="kdpPaperType">Interior &amp; Paper Type</label>
              <select class="kdp-select" id="kdpPaperType">${paperOpts}</select>
            </div>

            <div class="kdp-bleed-row">
              <div class="kdp-field" style="margin:0;">
                <span class="kdp-field-label">Bleed</span>
                <div class="kdp-radio-group">
                  <label class="kdp-radio"><input type="radio" name="kdpBleed" value="bleed" checked/> Bleed</label>
                  <label class="kdp-radio"><input type="radio" name="kdpBleed" value="no-bleed"/> No Bleed</label>
                </div>
              </div>
              <div class="kdp-field" style="margin:0;">
                <label class="kdp-field-label" for="kdpPageCount">Page Count</label>
                <input class="kdp-input" type="number" id="kdpPageCount" min="24" max="600" value="100"/>
              </div>
            </div>
          </div>
        </div>

        <footer class="kdp-modal-footer">
          <button class="kdp-btn-create" type="button" id="kdpBtnCreate">Create Project</button>
        </footer>
      </div>
    `;
    return overlay;
  }

  function escapeAttr(str) {
    return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ── Open modal ──────────────────────────────────────────── */
  let currentOverlay = null;

  function open(opts = {}) {
    injectCss();
    if (currentOverlay) close({ silent: true });

    const overlay = buildModal(opts);
    document.body.appendChild(overlay);
    currentOverlay = overlay;

    // Trigger transition
    requestAnimationFrame(() => overlay.classList.add('show'));

    // Wire toggle
    const toggleBtns = overlay.querySelectorAll('.kdp-toggle button');
    toggleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        toggleBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Close handlers
    const closeBtn = overlay.querySelector('[data-kdp-close]');
    const handleClose = () => {
      close();
      if (typeof opts.onClose === 'function') opts.onClose();
    };
    closeBtn.addEventListener('click', handleClose);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) handleClose();
    });
    const escHandler = (e) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', escHandler);
    overlay._kdpEscHandler = escHandler;

    // Focus project name
    setTimeout(() => overlay.querySelector('#kdpProjectName').focus(), 100);

    // Submit
    const submit = () => {
      const nameEl  = overlay.querySelector('#kdpProjectName');
      const nameErr = overlay.querySelector('#kdpProjectNameError');
      const name    = nameEl.value.trim();
      if (!name) {
        nameErr.classList.add('show');
        nameEl.focus();
        return;
      }
      nameErr.classList.remove('show');

      const projectTypeIdx = parseInt(overlay.querySelector('#kdpProjectType').value, 10);
      const trimIdx        = parseInt(overlay.querySelector('#kdpTrimSize').value, 10);
      const paperIdx       = parseInt(overlay.querySelector('#kdpPaperType').value, 10);
      const mode           = overlay.querySelector('.kdp-toggle button.active').dataset.mode;
      const bleed          = overlay.querySelector('input[name="kdpBleed"]:checked').value === 'bleed';
      const pageCount      = clampPageCount(overlay.querySelector('#kdpPageCount').value);

      const settings = {
        projectType: PROJECT_TYPES[projectTypeIdx],
        contentMode: mode,
        projectName: name,
        trimSize:    { ...TRIM_SIZES[trimIdx] },
        paperType:   PAPER_TYPES[paperIdx],
        bleed,
        pageCount,
        createdAt:   new Date().toISOString()
      };

      close({ silent: true });
      if (typeof opts.onCreate === 'function') opts.onCreate(settings);
    };

    overlay.querySelector('#kdpBtnCreate').addEventListener('click', submit);
    overlay.querySelector('#kdpProjectName').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
  }

  function clampPageCount(raw) {
    const n = parseInt(raw, 10);
    if (isNaN(n)) return 100;
    return Math.max(24, Math.min(600, n));
  }

  function close(opts = {}) {
    if (!currentOverlay) return;
    const overlay = currentOverlay;
    currentOverlay = null;
    overlay.classList.remove('show');
    if (overlay._kdpEscHandler) {
      document.removeEventListener('keydown', overlay._kdpEscHandler);
    }
    setTimeout(() => overlay.remove(), 200);
  }

  /* ── Persist + navigate (dashboard use) ──────────────────── */
  function openAndNavigate(generatorUrl, defaultName) {
    open({
      defaultName: defaultName || '',
      onCreate: (settings) => {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(settings));
        window.location.href = generatorUrl;
      }
    });
  }

  function getSettings() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function clearSettings() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  /* ── Standard generator entry point ──────────────────────────
     One-line bootstrap every generator should call on load.
     - If sessionStorage has settings → apply them immediately.
     - If missing → open the modal; on Create apply; on Close
       bounce back to dashboardUrl (so no generator can ever
       load without project settings).
     - "Edit project settings" link calls this again with the
       current settings prefilled.

     opts = {
       defaultName:  string,                       // prefill for project name
       dashboardUrl: string,                       // where to bounce if user closes the modal cold
       onSettings:   (settings, isReopen) => void  // apply settings to the generator
     }
  ──────────────────────────────────────────────────────────── */
  function requireSettings(opts) {
    const dashboardUrl = opts.dashboardUrl || '../dashboard.html';
    let current = getSettings();

    function prompt(isReopen) {
      open({
        defaultName: (current && current.projectName) || opts.defaultName || '',
        onCreate: (settings) => {
          current = settings;
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(settings));
          if (typeof opts.onSettings === 'function') opts.onSettings(settings, isReopen);
        },
        onClose: () => {
          // Cold visit: never reached the generator UI with valid settings
          if (!current) window.location.href = dashboardUrl;
        }
      });
    }

    if (current) {
      if (typeof opts.onSettings === 'function') opts.onSettings(current, false);
    } else {
      prompt(false);
    }

    // Hand back a reopen() function so generators can wire it to an "Edit" button
    return { reopen: () => prompt(true) };
  }

  /* ── Public API ──────────────────────────────────────────── */
  window.KDPNewProject = {
    open,
    close,
    openAndNavigate,
    requireSettings,
    getSettings,
    clearSettings,
    TRIM_SIZES,
    PROJECT_TYPES,
    PAPER_TYPES
  };

})(window);
