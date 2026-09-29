/**
 * SAP Sales Order Short-Close Web Application Frontend
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const fromDateInput = document.getElementById('fromDate');
  const toDateInput = document.getElementById('toDate');
  const reasonCodeInput = document.getElementById('reasonCode');
  const btnPreview = document.getElementById('btnPreview');
  const btnExecute = document.getElementById('btnExecute');
  const stateIndicator = document.getElementById('stateIndicator');

  // Alert Banner
  const alertBanner = document.getElementById('alertBanner');
  const alertIcon = document.getElementById('alertIcon');
  const alertTitle = document.getElementById('alertTitle');
  const alertMessage = document.getElementById('alertMessage');
  const alertClose = document.getElementById('alertClose');

  // Summary Section
  const summarySection = document.getElementById('summarySection');
  const badgeScanCounts = document.getElementById('badgeScanCounts');
  const valEligibleCount = document.getElementById('valEligibleCount');
  const valSkipNonZmt = document.getElementById('valSkipNonZmt');
  const valSkipOverThreshold = document.getElementById('valSkipOverThreshold');
  const valSkipCompleted = document.getElementById('valSkipCompleted');
  const valSkipAlreadyRejected = document.getElementById('valSkipAlreadyRejected');

  // Preview Section
  const previewSection = document.getElementById('previewSection');
  const previewCounter = document.getElementById('previewCounter');
  const previewTable = document.getElementById('previewTable');
  const previewTableBody = document.getElementById('previewTableBody');
  const previewEmptyState = document.getElementById('previewEmptyState');

  // Results Section
  const resultsSection = document.getElementById('resultsSection');
  const resultsCounter = document.getElementById('resultsCounter');
  const resultsTableBody = document.getElementById('resultsTableBody');
  const statSuccessCount = document.getElementById('statSuccessCount');
  const statFailureCount = document.getElementById('statFailureCount');

  // Preset Buttons
  const presetButtons = document.querySelectorAll('.btn-preset');

  // Application State
  let currentCandidates = [];
  let lastPreviewParams = null;
  let isExecuting = false;
  let isPreviewing = false;

  // Initialize Config Defaults from Server
  let serverConfig = null;

  function calculateRolling7Days() {
    const today = new Date();
    const past = new Date();
    past.setDate(today.getDate() - 7);
    const pad = n => String(n).padStart(2, '0');
    const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return { from: fmt(past), to: fmt(today) };
  }

  async function loadInitialConfig() {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        serverConfig = await res.json();
        if (serverConfig.rejectionReason && !reasonCodeInput.value) {
          reasonCodeInput.value = serverConfig.rejectionReason;
        }
        if (serverConfig.fromDate && !fromDateInput.value) {
          fromDateInput.value = serverConfig.fromDate;
        }
        if (serverConfig.toDate && !toDateInput.value) {
          toDateInput.value = serverConfig.toDate;
        }
      }
    } catch (err) {
      console.warn('Could not fetch server config, using rolling defaults', err);
      const rolling = calculateRolling7Days();
      if (!fromDateInput.value) fromDateInput.value = rolling.from;
      if (!toDateInput.value) toDateInput.value = rolling.to;
    }
  }

  loadInitialConfig();

  // Helper: Show Alert Banner
  function showAlert(type, title, message) {
    alertBanner.className = `alert-banner alert-${type}`;
    alertTitle.textContent = title;
    alertMessage.textContent = message;

    let iconSvg = '';
    if (type === 'danger') {
      iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    } else if (type === 'success') {
      iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    } else if (type === 'warning') {
      iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
    } else {
      iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }
    alertIcon.innerHTML = iconSvg;
    alertBanner.classList.remove('hidden');
  }

  // Helper: Dismiss Alert
  alertClose.addEventListener('click', () => {
    alertBanner.classList.add('hidden');
  });

  // Track Input Changes to invalidate stale preview
  function handleParamChange() {
    if (lastPreviewParams) {
      const currentFrom = fromDateInput.value;
      const currentTo = toDateInput.value;
      const currentReason = reasonCodeInput.value.trim();

      if (
        currentFrom !== lastPreviewParams.fromDate ||
        currentTo !== lastPreviewParams.toDate ||
        currentReason !== lastPreviewParams.reasonCode
      ) {
        btnExecute.disabled = true;
        stateIndicator.textContent = 'Filters modified — re-run Preview';
        stateIndicator.style.color = '#f59e0b';
      } else {
        if (currentCandidates.length > 0) {
          btnExecute.disabled = false;
          stateIndicator.textContent = `Preview active (${currentCandidates.length} eligible)`;
          stateIndicator.style.color = '#10b981';
        }
      }
    }
  }

  fromDateInput.addEventListener('change', handleParamChange);
  toDateInput.addEventListener('change', handleParamChange);
  reasonCodeInput.addEventListener('input', handleParamChange);

  // Quick Preset Date Ranges
  presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      presetButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (btn.dataset.rolling) {
        const rolling = calculateRolling7Days();
        fromDateInput.value = rolling.from;
        toDateInput.value = rolling.to;
      } else {
        fromDateInput.value = btn.dataset.from;
        toDateInput.value = btn.dataset.to;
      }
      handleParamChange();
    });
  });

  // Handle Preview Action
  btnPreview.addEventListener('click', async () => {
    const fromDate = fromDateInput.value;
    const toDate = toDateInput.value;
    const reasonCode = reasonCodeInput.value.trim() || '81';

    if (fromDate && toDate && fromDate > toDate) {
      showAlert('warning', 'Invalid Date Range', 'From Date cannot be later than To Date.');
      return;
    }

    // Set UI state to loading
    isPreviewing = true;
    btnPreview.disabled = true;
    btnPreview.classList.add('loading');
    btnExecute.disabled = true;
    stateIndicator.textContent = 'Scanning SAP sales orders (CreationDate)...';
    stateIndicator.style.color = '#60a5fa';
    alertBanner.classList.add('hidden');

    try {
      const res = await fetch('/api/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fromDate,
          toDate,
          reasonCode
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}: Failed to run preview.`);
      }

      // If dates were defaulted by server, update input fields
      if (data.fromDate && !fromDateInput.value) fromDateInput.value = data.fromDate;
      if (data.toDate && !toDateInput.value) toDateInput.value = data.toDate;

      // Store preview state
      currentCandidates = data.eligibleCandidates || [];
      lastPreviewParams = {
        fromDate: fromDateInput.value,
        toDate: toDateInput.value,
        reasonCode
      };

      // Render Skip Counts & Evaluation Summary
      renderSummary(data);

      // Render Eligible Candidates Table
      renderPreviewTable(currentCandidates, reasonCode);

      // Enable/disable Execute button
      if (currentCandidates.length > 0) {
        btnExecute.disabled = false;
        stateIndicator.textContent = `Preview complete: ${currentCandidates.length} eligible item(s)`;
        stateIndicator.style.color = '#10b981';
        showAlert('success', 'Preview Complete', `Identified ${currentCandidates.length} eligible line item(s) qualifying for short-close (<= 5 ZMT, SDProcessStatus='A').`);
      } else {
        btnExecute.disabled = true;
        stateIndicator.textContent = 'Preview complete: 0 eligible items';
        stateIndicator.style.color = '#94a3b8';
        showAlert('info', 'No Qualifying Items', "No line items matched all criteria (<= 5 ZMT, SDProcessStatus='A') in the selected date range.");
      }

      // Hide results section on new preview
      resultsSection.classList.add('hidden');

    } catch (err) {
      console.error('Preview error:', err);
      showAlert('danger', 'Preview Failed', err.message);
      stateIndicator.textContent = 'Preview failed';
      stateIndicator.style.color = '#ef4444';
      btnExecute.disabled = true;
    } finally {
      isPreviewing = false;
      btnPreview.disabled = false;
      btnPreview.classList.remove('loading');
    }
  });

  // Render Evaluation Summary & Skip Counts
  function renderSummary(data) {
    summarySection.classList.remove('hidden');

    const totalOrders = data.totalOrders || 0;
    const totalItems = data.totalItems || 0;
    badgeScanCounts.textContent = `${totalOrders} orders / ${totalItems} items evaluated`;

    valEligibleCount.textContent = (data.eligibleCandidates || []).length;
    valSkipNonZmt.textContent = data.skipCounts?.nonZmt || 0;
    valSkipOverThreshold.textContent = data.skipCounts?.overThreshold || 0;
    valSkipCompleted.textContent = data.skipCounts?.alreadyCompleted || 0;
    valSkipAlreadyRejected.textContent = data.skipCounts?.alreadyRejected || 0;
  }

  // Render Preview Candidates Table
  function renderPreviewTable(candidates, reasonCode) {
    previewSection.classList.remove('hidden');
    previewCounter.textContent = `${candidates.length} item${candidates.length === 1 ? '' : 's'}`;

    if (candidates.length === 0) {
      previewTable.classList.add('hidden');
      previewEmptyState.classList.remove('hidden');
      previewTableBody.innerHTML = '';
      return;
    }

    previewTable.classList.remove('hidden');
    previewEmptyState.classList.add('hidden');

    previewTableBody.innerHTML = candidates.map(c => {
      const orderDate = c.salesOrderDate || '—';
      return `
        <tr>
          <td><span class="mono-pill">${escapeHtml(c.salesOrder)}</span></td>
          <td><span class="mono-pill">${escapeHtml(c.item)}</span></td>
          <td><strong>${escapeHtml(c.material || '—')}</strong></td>
          <td><span class="qty-pill">${escapeHtml(String(c.quantity))}</span></td>
          <td><span class="unit-tag">${escapeHtml(c.unit || 'ZMT')}</span></td>
          <td>${escapeHtml(orderDate)}</td>
          <td><span class="mono-pill">${escapeHtml(reasonCode)}</span></td>
          <td>
            <span class="status-chip status-chip-ready">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <circle cx="12" cy="12" r="10"></circle>
              </svg>
              Eligible
            </span>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Handle Execute Action
  btnExecute.addEventListener('click', async () => {
    if (!currentCandidates || currentCandidates.length === 0) {
      showAlert('warning', 'No Items', 'No candidates available to short-close. Run a preview first.');
      return;
    }

    const fromDate = fromDateInput.value;
    const toDate = toDateInput.value;
    const reasonCode = reasonCodeInput.value.trim() || '81';

    // Requirement 4: Browser confirm dialog before Execute runs
    const confirmMessage = `You are about to short-close ${currentCandidates.length} items with reason code ${reasonCode}. Proceed?`;
    const confirmed = window.confirm(confirmMessage);

    if (!confirmed) {
      return;
    }

    // Set UI state to executing
    isExecuting = true;
    btnExecute.disabled = true;
    btnExecute.classList.add('loading');
    btnPreview.disabled = true;
    stateIndicator.textContent = `Executing short-close on ${currentCandidates.length} item(s)...`;
    stateIndicator.style.color = '#f59e0b';
    showAlert('info', 'Executing', `Updating ${currentCandidates.length} items on SAP Gateway with reason '${reasonCode}'...`);

    try {
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fromDate,
          toDate,
          reasonCode,
          candidates: currentCandidates
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}: Execution failed.`);
      }

      // Render Results Table
      renderResultsTable(data);

      const successCount = data.successCount || 0;
      const failureCount = data.failureCount || 0;

      if (failureCount === 0) {
        showAlert('success', 'Execution Complete', `Successfully short-closed all ${successCount} items with reason code '${reasonCode}'!`);
        stateIndicator.textContent = `Execution complete: ${successCount} succeeded`;
        stateIndicator.style.color = '#10b981';
      } else {
        showAlert('warning', 'Execution Finished with Errors', `Completed with ${successCount} successful update(s) and ${failureCount} error(s). See details below.`);
        stateIndicator.textContent = `Execution complete: ${successCount} ok, ${failureCount} failed`;
        stateIndicator.style.color = '#f59e0b';
      }

      // Scroll smoothly to results
      resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    } catch (err) {
      console.error('Execute error:', err);
      showAlert('danger', 'Execution Failed', err.message);
      stateIndicator.textContent = 'Execution failed';
      stateIndicator.style.color = '#ef4444';
    } finally {
      isExecuting = false;
      btnExecute.classList.remove('loading');
      btnPreview.disabled = false;
    }
  });

  // Render Execution Results Table
  function renderResultsTable(data) {
    resultsSection.classList.remove('hidden');

    const results = data.results || [];
    resultsCounter.textContent = `${results.length} item${results.length === 1 ? '' : 's'} processed`;
    statSuccessCount.textContent = data.successCount || 0;
    statFailureCount.textContent = data.failureCount || 0;

    resultsTableBody.innerHTML = results.map(r => {
      const isSuccess = r.status === 'SUCCESS';
      const outcomeChip = isSuccess
        ? `<span class="status-chip status-chip-success">
             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
             Success
           </span>`
        : `<span class="status-chip status-chip-failed">
             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
             Failed
           </span>`;

      return `
        <tr>
          <td>${outcomeChip}</td>
          <td><span class="mono-pill">${escapeHtml(r.salesOrder)}</span></td>
          <td><span class="mono-pill">${escapeHtml(r.item)}</span></td>
          <td><strong>${escapeHtml(r.material || '—')}</strong></td>
          <td><span class="qty-pill">${escapeHtml(String(r.quantity))}</span></td>
          <td><span class="unit-tag">${escapeHtml(r.unit || 'ZMT')}</span></td>
          <td><span class="mono-pill">${escapeHtml(r.reasonCode || data.reasonCode || '—')}</span></td>
          <td>${escapeHtml(r.message || (isSuccess ? 'Verified on SAP Gateway' : 'Error'))}</td>
        </tr>
      `;
    }).join('');
  }

  // HTML Sanitization helper
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
