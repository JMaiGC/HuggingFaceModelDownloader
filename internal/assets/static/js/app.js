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
    if (msg.type === 'init') {
      // Initial state with all jobs
      const jobs = msg.data?.jobs || [];
      state.jobs.clear();
      jobs.forEach(job => {
        state.jobs.set(job.id, job);
      });
      updateJobsBadge();
      if (state.currentPage === 'jobs') {
        renderJobs();
      }
    } else if (msg.type === 'job_update') {
      // Job update - data contains the full job object
      const job = msg.data;
      if (job && job.id) {
        state.jobs.set(job.id, job);
        updateJobsBadge();
        if (state.currentPage === 'jobs') {
          renderJobs();
        }
      }
    }
  }

  function updateJobsBadge() {
    const activeCount = Array.from(state.jobs.values())
      .filter(j => j.status === 'running' || j.status === 'queued' || j.status === 'paused').length;

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
        // Pass 'dataset' type if specified on button
        const forceType = btn.dataset.type || null;
        analyzeRepo(forceType);
      });
    });
  }

  // Store current analysis for wizard
  let currentAnalysis = null;
  let hasShownRevisionPicker = false; // Track if we've shown picker for this repo

  async function analyzeRepo(forceType = null, revision = null) {
    const input = $('#analyzeInput');
    const resultDiv = $('#analyzeResult');
    const isDataset = forceType === 'dataset'; // Only set if user explicitly selected dataset

    const repo = input?.value.trim();
    if (!repo) {
      showToast('Please enter a repository', 'error');
      return;
    }

    // Reset revision picker flag when analyzing a new repo
    if (!revision) {
      hasShownRevisionPicker = false;
    }

    // Show loading
    resultDiv.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Analyzing ${repo}${revision && revision !== 'main' ? ` (${revision})` : ''}...</p>
      </div>
    `;

    try {
      let queryParams = [];
      if (forceType) queryParams.push(`dataset=${forceType === 'dataset'}`);
      if (revision) queryParams.push(`revision=${encodeURIComponent(revision)}`);
      const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';

      const data = await api('GET', `/analyze/${repo}${queryString}`);

      // Check if we need user to select model vs dataset
      if (data.needsSelection) {
        renderTypeSelection(data);
        return;
      }

      // Check if there are multiple refs and we haven't shown the picker yet
      if (data.refs && data.refs.length > 1 && !hasShownRevisionPicker && !revision) {
        hasShownRevisionPicker = true;
        showRevisionPicker(data);
        return;
      }

      currentAnalysis = data;
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

  // Show revision picker when multiple refs exist
  function showRevisionPicker(data) {
    const branches = data.refs.filter(r => r.type === 'branch');
    const tags = data.refs.filter(r => r.type === 'tag');

    let branchesHtml = '';
    if (branches.length > 0) {
      branchesHtml = `
        <div class="ref-group">
          <h5>Branches</h5>
          <div class="ref-list">
            ${branches.map(b => `
              <button class="ref-btn ${b.name === 'main' ? 'ref-default' : ''}" onclick="selectRevision('${escapeHtml(b.name)}', ${data.is_dataset})">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                  <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>
                </svg>
                ${escapeHtml(b.name)}
                ${b.name === 'main' ? '<span class="ref-badge">default</span>' : ''}
              </button>
            `).join('')}
          </div>
        </div>
      `;
    }

    let tagsHtml = '';
    if (tags.length > 0) {
      tagsHtml = `
        <div class="ref-group">
          <h5>Tags</h5>
          <div class="ref-list">
            ${tags.slice(0, 10).map(t => `
              <button class="ref-btn" onclick="selectRevision('${escapeHtml(t.name)}', ${data.is_dataset})">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>
                </svg>
                ${escapeHtml(t.name)}
              </button>
            `).join('')}
            ${tags.length > 10 ? `<div class="ref-more">... and ${tags.length - 10} more tags</div>` : ''}
          </div>
        </div>
      `;
    }

    showModal('Select Revision', `
      <p style="margin-bottom: 16px; color: var(--color-text-secondary);">
        This repository has multiple versions. Select which one to analyze:
      </p>
      ${branchesHtml}
      ${tagsHtml}
      <div class="form-actions" style="margin-top: 20px;">
        <button class="btn btn-ghost" onclick="hideModal(); selectRevision('main', ${data.is_dataset})">Use default (main)</button>
      </div>
    `);
  }

  // Handle revision selection
  window.selectRevision = function(revision, isDataset) {
    hideModal();
    const forceType = isDataset ? 'dataset' : null;
    analyzeRepo(forceType, revision);
  };

  // Show revision picker from analysis result (user clicked "change")
  window.showRevisionPickerFromAnalysis = function() {
    if (currentAnalysis && currentAnalysis.refs) {
      hasShownRevisionPicker = false; // Allow showing picker again
      showRevisionPicker(currentAnalysis);
    }
  };

  // Render type selection when both model and dataset exist
  function renderTypeSelection(data) {
    const resultDiv = $('#analyzeResult');
    resultDiv.innerHTML = `
      <div class="analysis-card">
        <div class="analysis-header">
          <div class="analysis-repo">${escapeHtml(data.repo)}</div>
          <span class="analysis-type" style="background: var(--color-warning);">Selection Required</span>
        </div>
        <div class="analysis-body">
          <div class="analysis-section">
            <h4>${escapeHtml(data.message)}</h4>
            <div style="display: flex; gap: 16px; margin-top: 20px;">
              <button class="btn btn-primary" onclick="analyzeRepo('model')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20" style="margin-right: 8px;">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                </svg>
                Analyze as Model
              </button>
              <button class="btn btn-secondary" onclick="analyzeRepo('dataset')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20" style="margin-right: 8px;">
                  <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                </svg>
                Analyze as Dataset
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Make analyzeRepo available globally for type selection buttons
  window.analyzeRepo = analyzeRepo;

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
      const quantsHtml = g.quantizations?.map((q, i) => `
        <label class="quant-option">
          <input type="checkbox" name="quant" value="${escapeHtml(q.name)}" data-filter="${escapeHtml(q.name.toLowerCase())}" ${i === 0 ? 'checked' : ''}>
          <div class="quant-info">
            <div class="quant-header">
              <span class="quant-name">${escapeHtml(q.name)}</span>
              <span class="quant-stars">${q.quality_stars || ''}</span>
            </div>
            <span class="quant-desc">${escapeHtml(q.description || '')}</span>
            <span class="quant-details">${q.file?.size_human || ''} / ~${q.estimated_ram_human || ''} RAM</span>
          </div>
        </label>
      `).join('') || '';

      typeInfoHtml = `
        <div class="analysis-section">
          <h4>GGUF Information</h4>
          <div class="analysis-grid">
            ${g.model_name ? `<div class="analysis-stat"><div class="analysis-stat-label">Model</div><div class="analysis-stat-value">${escapeHtml(g.model_name)}</div></div>` : ''}
            ${g.parameter_count ? `<div class="analysis-stat"><div class="analysis-stat-label">Parameters</div><div class="analysis-stat-value">${escapeHtml(g.parameter_count)}</div></div>` : ''}
          </div>
        </div>
        ${quantsHtml ? `
          <div class="analysis-section">
            <h4>Select Quantizations to Download</h4>
            <p style="font-size: 13px; color: var(--color-text-muted); margin-bottom: 12px;">Choose which quantization(s) you want to download:</p>
            <div class="quant-options" id="quantOptions">
              ${quantsHtml}
            </div>
          </div>
        ` : ''}
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

    // Determine if we have selectable options (GGUF quantizations)
    const hasQuantOptions = data.gguf?.quantizations?.length > 0;

    // Build the download command
    let baseCmd = `hfdownloader -r ${data.repo}`;
    if (data.is_dataset) {
      baseCmd += ' -d';
    }
    if (data.branch && data.branch !== 'main') {
      baseCmd += ` -b ${data.branch}`;
    }

    // Build branch/revision display
    const branchDisplay = data.branch && data.branch !== 'main'
      ? `<span class="analysis-branch" title="Revision: ${escapeHtml(data.branch)}">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
             <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>
           </svg>
           ${escapeHtml(data.branch)}
         </span>`
      : '';

    // Show "Change" link if multiple refs available
    const changeRevisionLink = data.refs && data.refs.length > 1
      ? `<button class="btn-link" onclick="showRevisionPickerFromAnalysis()">change</button>`
      : '';

    resultDiv.innerHTML = `
      <div class="analysis-card">
        <div class="analysis-header">
          <div class="analysis-repo">${escapeHtml(data.repo)}${branchDisplay}${changeRevisionLink}</div>
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
        <div class="analysis-actions-wrapper">
          <div class="command-preview">
            <label>Download Command:</label>
            <code id="downloadCommand">${escapeHtml(baseCmd)}</code>
            <button class="btn btn-ghost btn-sm" onclick="copyCommand()" title="Copy to clipboard">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            </button>
          </div>
          <div class="analysis-actions">
            <button class="btn btn-ghost" onclick="clearAnalysis()">
              Clear
            </button>
            <button class="btn btn-secondary" onclick="showAdvancedOptions()">
              Advanced Options
            </button>
            <button class="btn btn-primary" onclick="startWizardDownload('${escapeHtml(data.repo)}', ${data.is_dataset})">
              Download
            </button>
          </div>
        </div>
      </div>
    `;

    // Update command when checkboxes change
    if (hasQuantOptions) {
      updateDownloadCommand();
      document.querySelectorAll('#quantOptions input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', updateDownloadCommand);
      });
    }
  }

  // Clear analysis and reset to initial state
  window.clearAnalysis = function() {
    currentAnalysis = null;
    advancedOptions = { filter: '', exclude: '' };
    const input = $('#analyzeInput');
    if (input) input.value = '';

    const resultDiv = $('#analyzeResult');
    if (resultDiv) {
      resultDiv.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="64" height="64">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
              <line x1="12" y1="22.08" x2="12" y2="12"/>
            </svg>
          </div>
          <h3>Analyze Model or Dataset</h3>
          <p>Enter a HuggingFace model or dataset ID - we'll auto-detect the type and show files, size, and download options.</p>
          <div class="example-repos">
            <span class="example-label">GGUF:</span>
            <button class="example-btn" data-repo="TheBloke/Mistral-7B-Instruct-v0.2-GGUF">Mistral-7B-GGUF</button>
            <button class="example-btn" data-repo="bartowski/Meta-Llama-3-8B-Instruct-GGUF">Llama-3-8B-GGUF</button>
          </div>
          <div class="example-repos">
            <span class="example-label">Transformers:</span>
            <button class="example-btn" data-repo="meta-llama/Meta-Llama-3-8B-Instruct">Llama-3-8B</button>
            <button class="example-btn" data-repo="microsoft/Phi-3-mini-4k-instruct">Phi-3-mini</button>
          </div>
          <div class="example-repos">
            <span class="example-label">Diffusers:</span>
            <button class="example-btn" data-repo="stabilityai/stable-diffusion-xl-base-1.0">SDXL-base</button>
            <button class="example-btn" data-repo="black-forest-labs/FLUX.1-schnell">FLUX.1-schnell</button>
          </div>
          <div class="example-repos">
            <span class="example-label">Datasets:</span>
            <button class="example-btn" data-repo="roneneldan/TinyStories" data-type="dataset">TinyStories</button>
            <button class="example-btn" data-repo="fka/awesome-chatgpt-prompts" data-type="dataset">ChatGPT-Prompts</button>
          </div>
        </div>
      `;
      // Re-attach example button handlers
      $$('.example-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          if (input) input.value = btn.dataset.repo;
          const forceType = btn.dataset.type || null;
          analyzeRepo(forceType);
        });
      });
    }
  };

  // Update the download command based on selected quantizations and advanced options
  function updateDownloadCommand() {
    const commandEl = $('#downloadCommand');
    if (!commandEl || !currentAnalysis) return;

    const selectedQuants = Array.from(document.querySelectorAll('#quantOptions input[type="checkbox"]:checked'))
      .map(cb => cb.dataset.filter);

    let cmd = `hfdownloader -r ${currentAnalysis.repo}`;

    // Add dataset flag
    if (currentAnalysis.is_dataset) {
      cmd += ' -d';
    }

    // Add revision if not main (from analysis)
    if (currentAnalysis.branch && currentAnalysis.branch !== 'main') {
      cmd += ` -b ${currentAnalysis.branch}`;
    }

    // Add filters - either from GGUF selection or advanced options
    if (selectedQuants.length > 0 && selectedQuants.length < (currentAnalysis.gguf?.quantizations?.length || 0)) {
      cmd += ` -f "${selectedQuants.join(',')}"`;
    } else if (advancedOptions.filter) {
      cmd += ` -f "${advancedOptions.filter}"`;
    }

    // Add excludes
    if (advancedOptions.exclude) {
      cmd += ` -e "${advancedOptions.exclude}"`;
    }

    commandEl.textContent = cmd;
  }

  // Copy command to clipboard
  window.copyCommand = function() {
    const commandEl = $('#downloadCommand');
    if (commandEl) {
      navigator.clipboard.writeText(commandEl.textContent);
      showToast('Command copied to clipboard', 'success');
    }
  };

  // Store advanced options (filter/exclude only - revision comes from analysis)
  let advancedOptions = {
    filter: '',
    exclude: ''
  };

  // Show advanced options modal
  window.showAdvancedOptions = function() {
    if (!currentAnalysis) return;

    showModal('Advanced Options', `
      <div class="form-group">
        <label for="advFilter">File Filter (comma-separated)</label>
        <input type="text" id="advFilter" value="${escapeHtml(advancedOptions.filter)}" placeholder="e.g., q4_k_m,q5_k_m">
        <p class="form-hint">Only download files matching these patterns</p>
      </div>
      <div class="form-group">
        <label for="advExclude">Exclude Filter (comma-separated)</label>
        <input type="text" id="advExclude" value="${escapeHtml(advancedOptions.exclude)}" placeholder="e.g., fp16,bf16">
        <p class="form-hint">Skip files matching these patterns</p>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="hideModal()">Cancel</button>
        <button class="btn btn-primary" onclick="applyAdvancedOptions()">Apply</button>
      </div>
    `);
  };

  // Apply advanced options and update command preview
  window.applyAdvancedOptions = function() {
    advancedOptions.filter = $('#advFilter')?.value || '';
    advancedOptions.exclude = $('#advExclude')?.value || '';

    hideModal();
    updateDownloadCommand();
    showToast('Options applied', 'success');
  };

  // Start download from wizard with selected options
  window.startWizardDownload = async function(repo, isDataset) {
    // Get selected quantizations if any
    const selectedQuants = Array.from(document.querySelectorAll('#quantOptions input[type="checkbox"]:checked'))
      .map(cb => cb.dataset.filter);

    // Build filters - prefer GGUF selection, fallback to advanced options
    let filters = [];
    if (selectedQuants.length > 0) {
      filters = selectedQuants;
    } else if (advancedOptions.filter) {
      filters = advancedOptions.filter.split(',').map(s => s.trim()).filter(Boolean);
    }

    // Build excludes from advanced options
    const excludes = advancedOptions.exclude
      ? advancedOptions.exclude.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    try {
      const body = {
        repo,
        revision: currentAnalysis?.branch || 'main',
        dataset: isDataset,
        filters,
        excludes
      };

      await api('POST', '/download', body);
      showToast(`Download started: ${repo}`, 'success');
      navigateTo('jobs');
    } catch (e) {
      showToast(`Failed: ${e.message}`, 'error');
    }
  };

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

      // Determine which action buttons to show
      const isRunning = status === 'running';
      const isQueued = status === 'queued';
      const isPaused = status === 'paused';
      const isDone = status === 'completed' || status === 'failed' || status === 'cancelled';

      let actionButtons = '';
      if (isRunning) {
        actionButtons = `
          <button class="btn btn-sm btn-warning" onclick="pauseJob('${escapeHtml(job.id)}')">Pause</button>
          <button class="btn btn-sm btn-danger" onclick="cancelJob('${escapeHtml(job.id)}')">Cancel</button>
        `;
      } else if (isPaused) {
        actionButtons = `
          <button class="btn btn-sm btn-primary" onclick="resumeJob('${escapeHtml(job.id)}')">Resume</button>
          <button class="btn btn-sm btn-danger" onclick="cancelJob('${escapeHtml(job.id)}')">Cancel</button>
        `;
      } else if (isQueued) {
        actionButtons = `<button class="btn btn-sm btn-danger" onclick="cancelJob('${escapeHtml(job.id)}')">Cancel</button>`;
      } else if (isDone) {
        actionButtons = `<button class="btn btn-sm btn-secondary" onclick="dismissJob('${escapeHtml(job.id)}')">Dismiss</button>`;
      }

      return `
        <div class="job-card">
          <div class="job-header">
            <div>
              <div class="job-repo">${escapeHtml(job.repo)}</div>
              <div style="font-size: 13px; color: var(--color-text-muted);">${escapeHtml(job.revision || 'main')}</div>
            </div>
            <div class="job-header-right">
              <span class="job-status ${status}">${status}</span>
              ${actionButtons}
            </div>
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
          ${job.error ? `<div class="job-error">${escapeHtml(job.error)}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  // Cancel a running/queued job
  window.cancelJob = async function(jobId) {
    try {
      await api('DELETE', `/jobs/${jobId}`);
      showToast('Download cancelled', 'success');
      // Update local state immediately
      const job = state.jobs.get(jobId);
      if (job) {
        job.status = 'cancelled';
        state.jobs.set(jobId, job);
        renderJobs();
        updateJobsBadge();
      }
    } catch (e) {
      showToast(`Failed to cancel: ${e.message}`, 'error');
    }
  };

  // Pause a running job
  window.pauseJob = async function(jobId) {
    try {
      await api('POST', `/jobs/${jobId}/pause`);
      showToast('Download paused', 'success');
      const job = state.jobs.get(jobId);
      if (job) {
        job.status = 'paused';
        state.jobs.set(jobId, job);
        renderJobs();
        updateJobsBadge();
      }
    } catch (e) {
      showToast(`Failed to pause: ${e.message}`, 'error');
    }
  };

  // Resume a paused job
  window.resumeJob = async function(jobId) {
    try {
      await api('POST', `/jobs/${jobId}/resume`);
      showToast('Download resumed', 'success');
      const job = state.jobs.get(jobId);
      if (job) {
        job.status = 'queued';
        state.jobs.set(jobId, job);
        renderJobs();
        updateJobsBadge();
      }
    } catch (e) {
      showToast(`Failed to resume: ${e.message}`, 'error');
    }
  };

  // Dismiss (remove from view) a completed/failed/cancelled job
  window.dismissJob = function(jobId) {
    state.jobs.delete(jobId);
    renderJobs();
    updateJobsBadge();
  };

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

  // Expose hideModal globally for onclick handlers
  window.hideModal = hideModal;

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
