/**
 * HF Downloader - Modern Web UI
 */

(function() {
  'use strict';

  // =========================================
  // State
  // =========================================

  const state = {
    jobs: new Map(),
    settings: {},
    wsConnected: false,
    ws: null,
    currentPage: 'analyze'
  };

  // =========================================
  // DOM Elements
  // =========================================

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // =========================================
  // Navigation
  // =========================================

  function initNavigation() {
    $$('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.dataset.page;
        navigateTo(page);
      });
    });
  }

  function navigateTo(page) {
    // Update nav
    $$('.nav-item').forEach(n => n.classList.remove('active'));
    $(`.nav-item[data-page="${page}"]`)?.classList.add('active');

    // Update page
    $$('.page').forEach(p => p.classList.remove('active'));
    $(`#page-${page}`)?.classList.add('active');

    state.currentPage = page;

    // Load page data
    if (page === 'cache') loadCache();
    if (page === 'jobs') loadJobs();
    if (page === 'settings') loadSettings();
  }

  // =========================================
  // WebSocket
  // =========================================

  function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws`;

    try {
      state.ws = new WebSocket(wsUrl);

      state.ws.onopen = () => {
        state.wsConnected = true;
        updateConnectionStatus(true);
      };

      state.ws.onclose = () => {
        state.wsConnected = false;
        updateConnectionStatus(false);
        // Reconnect after 3 seconds
        setTimeout(initWebSocket, 3000);
      };

      state.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleWSMessage(msg);
        } catch (e) {
          console.error('WS parse error:', e);
        }
      };

      state.ws.onerror = (error) => {
        console.error('WS error:', error);
      };
    } catch (e) {
      console.error('WS connection failed:', e);
      setTimeout(initWebSocket, 3000);
    }
  }

  function updateConnectionStatus(connected) {
    const indicator = $('.status-indicator');
    const text = $('.status-text');

    if (connected) {
      indicator?.classList.add('connected');
      if (text) text.textContent = 'Connected';
    } else {
      indicator?.classList.remove('connected');
      if (text) text.textContent = 'Reconnecting...';
    }
  }

  function handleWSMessage(msg) {
    if (msg.type === 'job_update' || msg.type === 'progress') {
      updateJobFromWS(msg);
    }
  }

  function updateJobFromWS(msg) {
    if (msg.jobId) {
      const job = state.jobs.get(msg.jobId) || { id: msg.jobId };
      Object.assign(job, msg);
      state.jobs.set(msg.jobId, job);

      // Update badge
      updateJobsBadge();

      // Re-render if on jobs page
      if (state.currentPage === 'jobs') {
        renderJobs();
      }
    }
  }

  function updateJobsBadge() {
    const activeCount = Array.from(state.jobs.values())
      .filter(j => j.status === 'downloading' || j.status === 'queued').length;

    const badge = $('#jobsBadge');
    if (badge) {
      if (activeCount > 0) {
        badge.textContent = activeCount;
        badge.style.display = 'block';
      } else {
        badge.style.display = 'none';
      }
    }
  }

  // =========================================
  // API Helpers
  // =========================================

  async function api(method, path, body = null) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`/api${path}`, opts);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'API error');
    }
    return data;
  }

  // =========================================
  // Analyze Page
  // =========================================

  function initAnalyzePage() {
    const input = $('#analyzeInput');
    const btn = $('#analyzeBtn');
    const datasetCheckbox = $('#analyzeDataset');

    // Enter key
    input?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') analyzeRepo();
    });

    // Button click
    btn?.addEventListener('click', analyzeRepo);

    // Example buttons
    $$('.example-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (input) input.value = btn.dataset.repo;
        analyzeRepo();
      });
    });
  }

  async function analyzeRepo() {
    const input = $('#analyzeInput');
    const resultDiv = $('#analyzeResult');
    const isDataset = $('#analyzeDataset')?.checked || false;

    const repo = input?.value.trim();
    if (!repo) {
      showToast('Please enter a repository', 'error');
      return;
    }

    // Show loading
    resultDiv.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Analyzing ${repo}...</p>
      </div>
    `;

    try {
      const queryParam = isDataset ? '?dataset=true' : '';
      const data = await api('GET', `/analyze/${repo}${queryParam}`);
      renderAnalysisResult(data);
    } catch (e) {
      resultDiv.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon" style="color: var(--color-error);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="64" height="64">
              <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          </div>
          <h3>Analysis Failed</h3>
          <p>${escapeHtml(e.message)}</p>
        </div>
      `;
    }
  }

  function renderAnalysisResult(data) {
    const resultDiv = $('#analyzeResult');
    if (!resultDiv) return;

    const filesHtml = data.files?.slice(0, 20).map(f => `
      <div class="analysis-file">
        <span class="analysis-file-name">${escapeHtml(f.path || f.name)}</span>
        <span class="analysis-file-size">${f.size_human || formatBytes(f.size)}</span>
      </div>
    `).join('') || '';

    const moreFiles = (data.files?.length || 0) > 20
      ? `<div class="analysis-file" style="justify-content: center; color: var(--color-text-muted);">
           ... and ${data.files.length - 20} more files
         </div>`
      : '';

    // Build type-specific info
    let typeInfoHtml = '';

    if (data.transformers) {
      const t = data.transformers;
      typeInfoHtml = `
        <div class="analysis-section">
          <h4>Model Configuration</h4>
          <div class="analysis-grid">
            ${t.architecture ? `<div class="analysis-stat"><div class="analysis-stat-label">Architecture</div><div class="analysis-stat-value">${escapeHtml(t.architecture)}</div></div>` : ''}
            ${t.estimated_parameters ? `<div class="analysis-stat"><div class="analysis-stat-label">Parameters</div><div class="analysis-stat-value">~${escapeHtml(t.estimated_parameters)}</div></div>` : ''}
            ${t.hidden_size ? `<div class="analysis-stat"><div class="analysis-stat-label">Hidden Size</div><div class="analysis-stat-value">${t.hidden_size}</div></div>` : ''}
            ${t.num_hidden_layers ? `<div class="analysis-stat"><div class="analysis-stat-label">Layers</div><div class="analysis-stat-value">${t.num_hidden_layers}</div></div>` : ''}
            ${t.context_length ? `<div class="analysis-stat"><div class="analysis-stat-label">Context Length</div><div class="analysis-stat-value">${t.context_length.toLocaleString()} tokens</div></div>` : ''}
            ${t.precision ? `<div class="analysis-stat"><div class="analysis-stat-label">Precision</div><div class="analysis-stat-value">${escapeHtml(t.precision)}</div></div>` : ''}
          </div>
        </div>
      `;
    }

    if (data.gguf) {
      const g = data.gguf;
      const quantsHtml = g.quantizations?.slice(0, 10).map(q => `
        <div class="analysis-file">
          <span class="analysis-file-name">${escapeHtml(q.name)}</span>
          <span class="analysis-file-size">${q.file?.size_human || ''} / ~${q.estimated_ram_human || ''} RAM</span>
        </div>
      `).join('') || '';

      typeInfoHtml = `
        <div class="analysis-section">
          <h4>GGUF Information</h4>
          <div class="analysis-grid">
            ${g.model_name ? `<div class="analysis-stat"><div class="analysis-stat-label">Model</div><div class="analysis-stat-value">${escapeHtml(g.model_name)}</div></div>` : ''}
            ${g.parameter_count ? `<div class="analysis-stat"><div class="analysis-stat-label">Parameters</div><div class="analysis-stat-value">${escapeHtml(g.parameter_count)}</div></div>` : ''}
          </div>
        </div>
        ${quantsHtml ? `<div class="analysis-section"><h4>Available Quantizations</h4><div class="analysis-files">${quantsHtml}</div></div>` : ''}
      `;
    }

    if (data.diffusers) {
      const d = data.diffusers;
      typeInfoHtml = `
        <div class="analysis-section">
          <h4>Diffusers Pipeline</h4>
          <div class="analysis-grid">
            ${d.pipeline_type ? `<div class="analysis-stat"><div class="analysis-stat-label">Pipeline</div><div class="analysis-stat-value">${escapeHtml(d.pipeline_type)}</div></div>` : ''}
            ${d.diffusers_version ? `<div class="analysis-stat"><div class="analysis-stat-label">Version</div><div class="analysis-stat-value">${escapeHtml(d.diffusers_version)}</div></div>` : ''}
            ${d.variants?.length ? `<div class="analysis-stat"><div class="analysis-stat-label">Variants</div><div class="analysis-stat-value">${d.variants.join(', ')}</div></div>` : ''}
          </div>
        </div>
      `;
    }

    if (data.dataset) {
      const ds = data.dataset;
      const splitsHtml = ds.splits?.map(s => `
        <div class="analysis-file">
          <span class="analysis-file-name">${escapeHtml(s.name)}</span>
          <span class="analysis-file-size">${s.file_count} files / ${s.size_human}</span>
        </div>
      `).join('') || '';

      typeInfoHtml = `
        <div class="analysis-section">
          <h4>Dataset Information</h4>
          <div class="analysis-grid">
            ${ds.primary_format ? `<div class="analysis-stat"><div class="analysis-stat-label">Format</div><div class="analysis-stat-value">${escapeHtml(ds.primary_format)}</div></div>` : ''}
            ${ds.configs?.length ? `<div class="analysis-stat"><div class="analysis-stat-label">Configs</div><div class="analysis-stat-value">${ds.configs.join(', ')}</div></div>` : ''}
          </div>
        </div>
        ${splitsHtml ? `<div class="analysis-section"><h4>Splits</h4><div class="analysis-files">${splitsHtml}</div></div>` : ''}
      `;
    }

    resultDiv.innerHTML = `
      <div class="analysis-card">
        <div class="analysis-header">
          <div class="analysis-repo">${escapeHtml(data.repo)}</div>
          <span class="analysis-type">${escapeHtml(data.type_description || data.type)}</span>
          <div class="analysis-meta">
            <span>${data.file_count} files</span>
            <span>${data.total_size_human}</span>
          </div>
        </div>
        <div class="analysis-body">
          ${typeInfoHtml}
          <div class="analysis-section">
            <h4>Files</h4>
            <div class="analysis-files">
              ${filesHtml}
              ${moreFiles}
            </div>
          </div>
        </div>
        <div class="analysis-actions">
          <button class="btn btn-primary" onclick="downloadFromAnalysis('${escapeHtml(data.repo)}', ${data.is_dataset})">
            Download
          </button>
        </div>
      </div>
    `;
  }

  // Make downloadFromAnalysis available globally
  window.downloadFromAnalysis = function(repo, isDataset) {
    if (isDataset) {
      $('#datasetRepo').value = repo;
      navigateTo('download');
    } else {
      $('#modelRepo').value = repo;
      navigateTo('download');
    }
  };

  // =========================================
  // Download Page
  // =========================================

  function initDownloadPage() {
    // Model form
    $('#modelForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await startDownload('model');
    });

    // Dataset form
    $('#datasetForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await startDownload('dataset');
    });

    // Preview buttons
    $('#previewModelBtn')?.addEventListener('click', () => previewDownload('model'));
    $('#previewDatasetBtn')?.addEventListener('click', () => previewDownload('dataset'));
  }

  async function startDownload(type) {
    const isDataset = type === 'dataset';
    const prefix = isDataset ? 'dataset' : 'model';

    const repo = $(`#${prefix}Repo`)?.value.trim();
    const revision = $(`#${prefix}Revision`)?.value.trim() || 'main';
    const filter = $(`#${prefix}Filter`)?.value.trim();
    const exclude = $(`#${prefix}Exclude`)?.value.trim();

    if (!repo) {
      showToast('Please enter a repository', 'error');
      return;
    }

    const body = {
      repo,
      revision,
      dataset: isDataset,
      filters: filter ? filter.split(',').map(s => s.trim()).filter(Boolean) : [],
      excludes: exclude ? exclude.split(',').map(s => s.trim()).filter(Boolean) : []
    };

    try {
      const data = await api('POST', '/download', body);
      showToast(`Download started: ${repo}`, 'success');
      navigateTo('jobs');
    } catch (e) {
      showToast(`Failed: ${e.message}`, 'error');
    }
  }

  async function previewDownload(type) {
    const isDataset = type === 'dataset';
    const prefix = isDataset ? 'dataset' : 'model';

    const repo = $(`#${prefix}Repo`)?.value.trim();
    if (!repo) {
      showToast('Please enter a repository', 'error');
      return;
    }

    const body = {
      repo,
      revision: $(`#${prefix}Revision`)?.value.trim() || 'main',
      dataset: isDataset,
      filters: ($(`#${prefix}Filter`)?.value || '').split(',').map(s => s.trim()).filter(Boolean),
      excludes: ($(`#${prefix}Exclude`)?.value || '').split(',').map(s => s.trim()).filter(Boolean),
      dryRun: true
    };

    try {
      showModal('Preview', '<div class="loading-state"><div class="spinner"></div><p>Scanning repository...</p></div>');

      const data = await api('POST', '/plan', body);

      const filesHtml = data.files?.map(f => `
        <div class="analysis-file">
          <span class="analysis-file-name">${escapeHtml(f.path)}</span>
          <span class="analysis-file-size">${formatBytes(f.size)}</span>
        </div>
      `).join('') || '<p>No files found</p>';

      setModalContent(`
        <p style="margin-bottom: 16px; color: var(--color-text-secondary);">
          ${data.totalFiles} files, ${formatBytes(data.totalSize)} total
        </p>
        <div class="analysis-files" style="max-height: 400px;">
          ${filesHtml}
        </div>
      `);
    } catch (e) {
      setModalContent(`<p style="color: var(--color-error);">${escapeHtml(e.message)}</p>`);
    }
  }

  // =========================================
  // Jobs Page
  // =========================================

  async function loadJobs() {
    try {
      const data = await api('GET', '/jobs');
      state.jobs.clear();
      (data.jobs || []).forEach(job => {
        state.jobs.set(job.id, job);
      });
      renderJobs();
      updateJobsBadge();
    } catch (e) {
      console.error('Failed to load jobs:', e);
    }
  }

  function renderJobs() {
    const container = $('#jobsList');
    if (!container) return;

    const jobs = Array.from(state.jobs.values());

    if (jobs.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="64" height="64">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </div>
          <h3>No Active Downloads</h3>
          <p>Start a download from the Download page to see progress here.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = jobs.map(job => {
      const p = job.progress || {};
      const totalBytes = p.totalBytes || 0;
      const downloadedBytes = p.downloadedBytes || 0;
      const progress = totalBytes > 0 ? (downloadedBytes / totalBytes * 100) : 0;
      const speed = p.bytesPerSecond || 0;
      const status = job.status || 'queued';

      return `
        <div class="job-card">
          <div class="job-header">
            <div>
              <div class="job-repo">${escapeHtml(job.repo)}</div>
              <div style="font-size: 13px; color: var(--color-text-muted);">${escapeHtml(job.revision || 'main')}</div>
            </div>
            <span class="job-status ${status}">${status}</span>
          </div>
          <div class="job-progress">
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
          </div>
          <div class="job-stats">
            <span>${progress.toFixed(1)}%</span>
            ${speed > 0 ? `<span>${formatBytes(speed)}/s</span>` : ''}
            <span>${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}</span>
            <span>${p.completedFiles || 0} / ${p.totalFiles || 0} files</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // =========================================
  // Cache Page
  // =========================================

  async function loadCache() {
    const container = $('#cacheList');
    if (!container) return;

    container.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Loading cache...</p>
      </div>
    `;

    try {
      const data = await api('GET', '/cache');

      if (!data.repos || data.repos.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="64" height="64">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <h3>Cache is Empty</h3>
            <p>Downloaded models and datasets will appear here.</p>
            <p style="font-size: 12px; color: var(--color-text-muted); margin-top: 8px;">
              Cache directory: ${escapeHtml(data.cacheDir)}
            </p>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div class="cache-grid">
          ${data.repos.map(repo => `
            <div class="cache-item" onclick="showCacheInfo('${escapeHtml(repo.repo)}')">
              <div class="cache-item-type">${escapeHtml(repo.type)}</div>
              <div class="cache-item-repo">${escapeHtml(repo.repo)}</div>
              <div class="cache-item-path" title="${escapeHtml(repo.path)}">${escapeHtml(repo.path)}</div>
            </div>
          `).join('')}
        </div>
      `;
    } catch (e) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>Failed to Load Cache</h3>
          <p>${escapeHtml(e.message)}</p>
        </div>
      `;
    }
  }

  window.showCacheInfo = async function(repo) {
    try {
      showModal('Repository Info', '<div class="loading-state"><div class="spinner"></div></div>');
      const data = await api('GET', `/cache/${repo}`);

      const snapshotsHtml = data.snapshots?.length
        ? `<div style="margin-top: 16px;">
             <strong>Snapshots:</strong>
             <div style="margin-top: 8px;">${data.snapshots.map(s => `<code style="display: block; font-size: 12px; color: var(--color-text-muted); margin-bottom: 4px;">${escapeHtml(s)}</code>`).join('')}</div>
           </div>`
        : '';

      setModalContent(`
        <div class="form-group">
          <label>Repository</label>
          <div style="font-weight: 600;">${escapeHtml(data.repo)}</div>
        </div>
        <div class="form-group">
          <label>Type</label>
          <div>${escapeHtml(data.type)}</div>
        </div>
        <div class="form-group">
          <label>Path</label>
          <div style="font-family: var(--font-mono); font-size: 13px; word-break: break-all;">${escapeHtml(data.path)}</div>
        </div>
        ${snapshotsHtml}
      `);
    } catch (e) {
      setModalContent(`<p style="color: var(--color-error);">${escapeHtml(e.message)}</p>`);
    }
  };

  $('#refreshCacheBtn')?.addEventListener('click', loadCache);

  // =========================================
  // Settings Page
  // =========================================

  async function loadSettings() {
    try {
      const data = await api('GET', '/settings');
      state.settings = data;

      // Display cache directory (read-only)
      const cacheDirEl = $('#cacheDir');
      if (cacheDirEl) {
        cacheDirEl.textContent = data.cacheDir || '~/.cache/huggingface';
      }

      $('#hfToken').value = data.token || '';
      $('#connections').value = data.connections || 8;
      $('#maxActive').value = data.maxActive || 3;
      $('#retries').value = data.retries || 4;
      $('#verify').value = data.verify || 'size';
      $('#endpoint').value = data.endpoint || '';
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
  }

  function initSettingsPage() {
    $('#saveSettingsBtn')?.addEventListener('click', saveSettings);

    // Toggle password visibility
    $$('.toggle-visibility').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.target;
        const input = $(`#${target}`);
        if (input) {
          const isPassword = input.type === 'password';
          input.type = isPassword ? 'text' : 'password';
          btn.querySelector('.icon-show').style.display = isPassword ? 'none' : 'block';
          btn.querySelector('.icon-hide').style.display = isPassword ? 'block' : 'none';
        }
      });
    });
  }

  async function saveSettings() {
    const body = {
      token: $('#hfToken')?.value || '',
      connections: parseInt($('#connections')?.value) || 8,
      maxActive: parseInt($('#maxActive')?.value) || 3,
      retries: parseInt($('#retries')?.value) || 4,
      verify: $('#verify')?.value || 'size'
    };

    try {
      await api('POST', '/settings', body);
      showToast('Settings saved', 'success');
    } catch (e) {
      showToast(`Failed: ${e.message}`, 'error');
    }
  }

  // =========================================
  // Modal
  // =========================================

  function showModal(title, content) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = content;
    $('#modalBackdrop').classList.add('active');
  }

  function setModalContent(content) {
    $('#modalBody').innerHTML = content;
  }

  function hideModal() {
    $('#modalBackdrop').classList.remove('active');
  }

  function initModal() {
    $('#modalClose')?.addEventListener('click', hideModal);
    $('#modalBackdrop')?.addEventListener('click', (e) => {
      if (e.target === $('#modalBackdrop')) hideModal();
    });
  }

  // =========================================
  // Toast
  // =========================================

  function showToast(message, type = 'info') {
    const container = $('#toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-message">${escapeHtml(message)}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideIn 0.3s ease reverse';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // =========================================
  // Utilities
  // =========================================

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // =========================================
  // Initialize
  // =========================================

  function init() {
    initNavigation();
    initWebSocket();
    initAnalyzePage();
    initDownloadPage();
    initSettingsPage();
    initModal();

    // Load initial data
    loadJobs();
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
