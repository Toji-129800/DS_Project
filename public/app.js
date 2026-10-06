/**
 * Urinalysis Patient Record System - Frontend Controller
 * Plain Vanilla JavaScript - No external libraries or frameworks.
 */

document.addEventListener('DOMContentLoaded', () => {
    // Application State
    const state = {
        activeTab: 'tab-lookup',
        currentPatientID: null,
        currentPatientRecords: [],
        analytes: [],
        highlightedDate: null
    };

    // DOM Elements - Navigation & Global
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    const statusBar = document.getElementById('status-bar');
    const queueBadge = document.getElementById('queue-badge');
    const btnSeedData = document.getElementById('btn-seed-data');

    // DOM Elements - Tab 1 (Lookup & Add)
    const formLookup = document.getElementById('form-lookup');
    const inputLookupID = document.getElementById('lookup-patient-id');
    const lookupPreview = document.getElementById('lookup-preview');
    const formAddRecord = document.getElementById('form-add-record');
    const inputRecordID = document.getElementById('record-patient-id');
    const inputRecordTimestamp = document.getElementById('record-timestamp');
    const btnFillNormal = document.getElementById('btn-fill-normal');

    // DOM Elements - Tab 2 (History)
    const currentPatientTag = document.getElementById('current-patient-tag');
    const currentRecordsTag = document.getElementById('current-records-tag');
    const historyTableWrapper = document.getElementById('history-table-wrapper');
    const historyPatientCaption = document.getElementById('history-patient-caption');
    const formDateSearch = document.getElementById('form-date-search');
    const inputSearchDate = document.getElementById('search-date-input');
    const btnResetDateFilter = document.getElementById('btn-reset-date-filter');
    const btnArchiveOldest = document.getElementById('btn-archive-oldest');
    const btnGotoTrend = document.getElementById('btn-goto-trend');

    // DOM Elements - Tab 3 (Trend)
    const formTrend = document.getElementById('form-trend');
    const inputTrendPatientID = document.getElementById('trend-patient-id');
    const selectTrendAnalyte = document.getElementById('trend-analyte-select');
    const inputTrendLow = document.getElementById('trend-low-range');
    const inputTrendHigh = document.getElementById('trend-high-range');
    const trendResults = document.getElementById('trend-results');
    const chartSvgContainer = document.getElementById('chart-svg-container');
    const chartTitleText = document.getElementById('chart-title-text');
    const verdictDot = document.getElementById('verdict-dot');
    const verdictText = document.getElementById('verdict-text');

    // DOM Elements - Tab 4 (Queue)
    const btnProcessNext = document.getElementById('btn-process-next');
    const dequeueNotification = document.getElementById('dequeue-notification');
    const queueLengthIndicator = document.getElementById('queue-length-indicator');
    const queueOrderedList = document.getElementById('queue-ordered-list');

    // Helper: Status Bar Feedback
    let statusTimer = null;
    function showStatus(message, type = 'info') {
        if (!statusBar) return;
        statusBar.className = `status-bar ${type}`;
        statusBar.textContent = message;
        statusBar.classList.remove('hidden');

        if (statusTimer) clearTimeout(statusTimer);
        statusTimer = setTimeout(() => {
            statusBar.classList.add('hidden');
        }, 6000);
    }

    // Navigation / Tab Switching
    function switchTab(targetTabId) {
        state.activeTab = targetTabId;
        tabButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === targetTabId);
        });
        tabPanes.forEach(pane => {
            pane.classList.toggle('active', pane.id === targetTabId);
        });

        // Trigger contextual refreshes
        if (targetTabId === 'tab-queue') {
            refreshReviewQueue();
        } else if (targetTabId === 'tab-trend' && state.currentPatientID) {
            inputTrendPatientID.value = state.currentPatientID;
        } else if (targetTabId === 'tab-history' && state.currentPatientID) {
            loadPatientHistory(state.currentPatientID);
        }
    }

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Initialize Metadata & References
    async function loadAnalytes() {
        try {
            const res = await fetch('/api/analytes');
            if (!res.ok) throw new Error('Failed to load analyte definitions');
            const data = await res.json();
            state.analytes = data.analytes || [];

            // Populate trend analyte select dropdown
            selectTrendAnalyte.innerHTML = '';
            state.analytes.forEach((analyte, idx) => {
                const opt = document.createElement('option');
                opt.value = idx;
                opt.textContent = `${idx + 1}. ${analyte.name} (${analyte.unit})`;
                selectTrendAnalyte.appendChild(opt);
            });

            // Set initial low/high based on first analyte
            if (state.analytes.length > 0) {
                updateTrendRangeDefaults(0);
            }
        } catch (err) {
            console.error(err);
            showStatus('Error communicating with server for analyte metadata', 'error');
        }
    }

    function updateTrendRangeDefaults(index) {
        const item = state.analytes[index];
        if (item) {
            inputTrendLow.value = item.low;
            inputTrendHigh.value = item.high;
        }
    }

    selectTrendAnalyte.addEventListener('change', (e) => {
        const index = parseInt(e.target.value, 10);
        updateTrendRangeDefaults(index);
    });

    // Tab 1: Patient Lookup
    formLookup.addEventListener('submit', async (e) => {
        e.preventDefault();
        const patientID = inputLookupID.value.trim();
        if (!patientID) return;

        try {
            const res = await fetch(`/api/patients/${encodeURIComponent(patientID)}`);
            if (res.ok) {
                const data = await res.json();
                state.currentPatientID = data.patientID;
                state.currentPatientRecords = data.records;

                lookupPreview.innerHTML = `Found patient <strong>${data.patientID}</strong> with <strong>${data.recordCount}</strong> test record(s). <button type="button" id="btn-quick-view-history" class="btn btn-secondary btn-compact" style="margin-left:8px;">View Full History &rarr;</button>`;
                lookupPreview.classList.remove('hidden');

                document.getElementById('btn-quick-view-history').addEventListener('click', () => {
                    switchTab('tab-history');
                });

                showStatus(`Patient ${data.patientID} located in hash table (O(1) average lookup).`, 'success');
            } else if (res.status === 404) {
                lookupPreview.innerHTML = `No record found for Patient ID <strong>${patientID}</strong> in hash table. You can register this patient below.`;
                lookupPreview.classList.remove('hidden');
                inputRecordID.value = patientID;
                showStatus(`Patient ${patientID} not currently registered.`, 'info');
            } else {
                throw new Error('Server returned error');
            }
        } catch (err) {
            console.error(err);
            showStatus('Error executing patient lookup', 'error');
        }
    });

    // Preset standard normal values for fast entry
    btnFillNormal.addEventListener('click', () => {
        if (!inputRecordTimestamp.value) {
            const now = new Date();
            inputRecordTimestamp.value = now.toISOString().split('T')[0];
        }
        const defaults = [0.45, 0.05, 6.0, 0.1, 0.0, 0.05, 0.5, 0, 2.0, 1.018];
        defaults.forEach((val, idx) => {
            const el = document.getElementById(`analyte-${idx}`);
            if (el) el.value = val;
        });
    });

    // Submit new urinalysis test record
    formAddRecord.addEventListener('submit', async (e) => {
        e.preventDefault();
        const patientID = inputRecordID.value.trim();
        const timestamp = inputRecordTimestamp.value.trim();

        if (!patientID || !timestamp) {
            showStatus('Patient ID and collection date are required.', 'error');
            return;
        }

        const values = [];
        for (let i = 0; i < 10; i++) {
            const valInput = document.getElementById(`analyte-${i}`);
            const num = parseFloat(valInput ? valInput.value : 0);
            values.push(isNaN(num) ? 0 : num);
        }

        try {
            const res = await fetch('/api/records', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ patientID, timestamp, values })
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Failed to add record');
            }

            const data = await res.json();
            showStatus(`Successfully appended test record for ${patientID} (Total visits: ${data.recordCount}) in O(1) via tail pointer.`, 'success');
            state.currentPatientID = patientID;

            // Reset record form fields except ID
            formAddRecord.reset();
            inputRecordID.value = patientID;

            // Update history view
            loadPatientHistory(patientID);
        } catch (err) {
            console.error(err);
            showStatus(`Failed to register test record: ${err.message}`, 'error');
        }
    });

    // Tab 2: Patient History
    async function loadPatientHistory(patientID) {
        if (!patientID) {
            historyTableWrapper.innerHTML = '<div class="empty-state">No patient selected. Search or enter a Patient ID above.</div>';
            currentPatientTag.textContent = 'Patient: None';
            currentRecordsTag.textContent = 'Total Visits: 0';
            btnArchiveOldest.disabled = true;
            btnGotoTrend.disabled = true;
            return;
        }

        try {
            const res = await fetch(`/api/patients/${encodeURIComponent(patientID)}`);
            if (!res.ok) {
                if (res.status === 404) {
                    historyTableWrapper.innerHTML = `<div class="empty-state">Patient '${patientID}' has no test records in the registry.</div>`;
                    currentPatientTag.textContent = `Patient: ${patientID}`;
                    currentRecordsTag.textContent = 'Total Visits: 0';
                    btnArchiveOldest.disabled = true;
                    btnGotoTrend.disabled = true;
                    return;
                }
                throw new Error('Failed to fetch patient history');
            }

            const data = await res.json();
            state.currentPatientID = data.patientID;
            state.currentPatientRecords = data.records;

            currentPatientTag.textContent = `Patient: ${data.patientID}`;
            currentRecordsTag.textContent = `Total Visits: ${data.recordCount}`;
            historyPatientCaption.textContent = `Sequential linked list traversal for ${data.patientID} (${data.recordCount} nodes)`;

            btnArchiveOldest.disabled = data.recordCount === 0;
            btnGotoTrend.disabled = data.recordCount === 0;

            renderHistoryTable(data.records, state.highlightedDate);
        } catch (err) {
            console.error(err);
            showStatus('Error loading patient history', 'error');
        }
    }

    function renderHistoryTable(records, highlightDate = null) {
        if (!records || records.length === 0) {
            historyTableWrapper.innerHTML = '<div class="empty-state">No test records recorded for this patient.</div>';
            return;
        }

        const headers = [
            '#', 'Visit Date', 'Glucose', 'Protein', 'pH', 'Ketones',
            'Blood', 'Bilirubin', 'Urobilinogen', 'Nitrite', 'Leucocytes', 'Specific Gravity'
        ];

        let html = '<table class="clinical-table"><thead><tr>';
        headers.forEach(h => { html += `<th>${h}</th>`; });
        html += '</tr></thead><tbody>';

        records.forEach((rec, idx) => {
            const isMatch = highlightDate && rec.timestamp === highlightDate;
            const rowClass = isMatch ? ' class="highlight-row"' : '';
            html += `<tr${rowClass}>`;
            html += `<td>${idx + 1}</td>`;
            html += `<td><strong>${rec.timestamp}</strong>${isMatch ? ' (Match)' : ''}</td>`;
            rec.analyteValues.forEach(val => {
                html += `<td class="numeric">${Number(val).toFixed(2)}</td>`;
            });
            html += '</tr>';
        });

        html += '</tbody></table>';
        historyTableWrapper.innerHTML = html;
    }

    // Search record by date (O(m) singly-linked list traversal)
    formDateSearch.addEventListener('submit', async (e) => {
        e.preventDefault();
        const patientID = state.currentPatientID;
        const targetDate = inputSearchDate.value.trim();

        if (!patientID) {
            showStatus('Please look up or select a patient first.', 'error');
            return;
        }
        if (!targetDate) {
            showStatus('Enter a date to search (e.g. 2026-08-10).', 'error');
            return;
        }

        try {
            const res = await fetch(`/api/patients/${encodeURIComponent(patientID)}/search?date=${encodeURIComponent(targetDate)}`);
            if (res.status === 404) {
                showStatus(`No record found for date '${targetDate}' in patient's linked list.`, 'info');
                state.highlightedDate = null;
                renderHistoryTable(state.currentPatientRecords, null);
                return;
            }
            if (!res.ok) throw new Error('Search failed');

            const match = await res.json();
            state.highlightedDate = match.timestamp;
            renderHistoryTable(state.currentPatientRecords, match.timestamp);
            showStatus(`Found record for ${match.timestamp} via O(m) linear traversal.`, 'success');
        } catch (err) {
            console.error(err);
            showStatus('Error executing date search', 'error');
        }
    });

    btnResetDateFilter.addEventListener('click', () => {
        inputSearchDate.value = '';
        state.highlightedDate = null;
        renderHistoryTable(state.currentPatientRecords, null);
    });

    // Archive oldest record (O(1) head pointer deletion)
    btnArchiveOldest.addEventListener('click', async () => {
        const patientID = state.currentPatientID;
        if (!patientID) return;

        if (!confirm(`Confirm archiving and deleting the oldest test record for Patient ${patientID}?`)) {
            return;
        }

        try {
            const res = await fetch(`/api/patients/${encodeURIComponent(patientID)}/oldest`, {
                method: 'DELETE'
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Failed to archive oldest record');
            }

            const data = await res.json();
            showStatus(`Archived oldest record (${data.archivedTimestamp}) in O(1) time. Remaining: ${data.remainingRecords}.`, 'success');
            loadPatientHistory(patientID);
        } catch (err) {
            console.error(err);
            showStatus(`Failed to archive record: ${err.message}`, 'error');
        }
    });

    // Jump to Trend view with current patient
    btnGotoTrend.addEventListener('click', () => {
        if (state.currentPatientID) {
            inputTrendPatientID.value = state.currentPatientID;
            switchTab('tab-trend');
        }
    });

    // Tab 3: Trend Analysis & Inline SVG Chart
    formTrend.addEventListener('submit', async (e) => {
        e.preventDefault();
        const patientID = inputTrendPatientID.value.trim();
        const analyteIndex = parseInt(selectTrendAnalyte.value, 10);
        const low = parseFloat(inputTrendLow.value);
        const high = parseFloat(inputTrendHigh.value);

        if (!patientID || isNaN(analyteIndex) || isNaN(low) || isNaN(high)) {
            showStatus('Please specify patient, analyte, and valid range boundaries.', 'error');
            return;
        }

        try {
            const url = `/api/patients/${encodeURIComponent(patientID)}/trend?analyteIndex=${analyteIndex}&low=${low}&high=${high}`;
            const res = await fetch(url);
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Failed to generate trend report');
            }

            const report = await res.json();
            renderTrendReport(report);

            if (report.enqueued) {
                showStatus(`Patient ${patientID} flagged: ${report.outOfRangeCount} readings out of range &ge; 3 threshold. Enqueued to Clinical Review Queue.`, 'info');
                refreshReviewQueue();
            } else {
                showStatus(`Trend analysis complete: ${report.outOfRangeCount} readings out of range. Clinical status: ${report.verdict}.`, 'success');
            }
        } catch (err) {
            console.error(err);
            showStatus(`Trend report error: ${err.message}`, 'error');
        }
    });

    function renderTrendReport(report) {
        trendResults.classList.remove('hidden');
        chartTitleText.textContent = `${report.patientID} · ${report.analyteName} (Ref Range: ${report.lowRange} - ${report.highRange})`;

        // Render plain-text verdict with colored dot indicator (no banner card)
        const isWarning = report.outOfRangeCount >= 3;
        verdictDot.className = `verdict-dot ${isWarning ? 'warning' : 'normal'}`;
        verdictText.className = `verdict-text ${isWarning ? 'warning' : 'normal'}`;

        if (isWarning) {
            verdictText.textContent = `Needs Clinical Review (${report.outOfRangeCount} of ${report.totalRecords} readings out of normal range — escalated to queue)`;
        } else {
            verdictText.textContent = `Normal (${report.outOfRangeCount} of ${report.totalRecords} readings out of normal range)`;
        }

        // Generate Inline SVG Chart
        renderSvgLineChart(report.dataPoints, report.lowRange, report.highRange);
    }

    function renderSvgLineChart(dataPoints, lowRange, highRange) {
        if (!dataPoints || dataPoints.length === 0) {
            chartSvgContainer.innerHTML = '<div class="empty-state">No visit data points to plot.</div>';
            return;
        }

        const width = 800;
        const height = 230;
        const padding = { top: 25, right: 30, bottom: 45, left: 55 };
        const plotWidth = width - padding.left - padding.right;
        const plotHeight = height - padding.top - padding.bottom;

        // Compute yMin and yMax including range thresholds
        const values = dataPoints.map(p => p.value);
        let minVal = Math.min(...values, lowRange);
        let maxVal = Math.max(...values, highRange);

        // Add 15% headroom
        const span = maxVal - minVal || 1.0;
        const yMin = Math.max(0, minVal - span * 0.15);
        const yMax = maxVal + span * 0.15;

        function getY(val) {
            return padding.top + plotHeight - ((val - yMin) / (yMax - yMin)) * plotHeight;
        }

        function getX(idx) {
            if (dataPoints.length === 1) return padding.left + plotWidth / 2;
            return padding.left + (idx / (dataPoints.length - 1)) * plotWidth;
        }

        // Points coordinate calculation
        const coords = dataPoints.map((p, idx) => ({
            x: getX(idx),
            y: getY(p.value),
            val: p.value,
            date: p.timestamp,
            out: p.isOutOfRange
        }));

        const pointsStr = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');

        const yLowLine = getY(lowRange);
        const yHighLine = getY(highRange);

        // Generate SVG markup
        let svg = `<svg class="trend-chart-svg" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`;

        // Background grid and plot border
        svg += `<rect x="${padding.left}" y="${padding.top}" width="${plotWidth}" height="${plotHeight}" fill="#FCFDFD" stroke="#E2E8F0" stroke-width="1"/>`;

        // Horizontal normal range band
        if (yLowLine > padding.top && yHighLine < padding.top + plotHeight) {
            const bandY = Math.min(yLowLine, yHighLine);
            const bandH = Math.abs(yLowLine - yHighLine);
            svg += `<rect x="${padding.left}" y="${bandY}" width="${plotWidth}" height="${bandH}" fill="#F0FDF4" fill-opacity="0.6"/>`;
        }

        // Normal threshold dashed lines
        svg += `<line x1="${padding.left}" y1="${yLowLine}" x2="${padding.left + plotWidth}" y2="${yLowLine}" stroke="#DC2626" stroke-width="1.2" stroke-dasharray="4 3"/>`;
        svg += `<text x="${padding.left + plotWidth - 4}" y="${yLowLine - 4}" text-anchor="end" font-size="9" fill="#DC2626" font-family="-apple-system, sans-serif">Low: ${lowRange}</text>`;

        svg += `<line x1="${padding.left}" y1="${yHighLine}" x2="${padding.left + plotWidth}" y2="${yHighLine}" stroke="#DC2626" stroke-width="1.2" stroke-dasharray="4 3"/>`;
        svg += `<text x="${padding.left + plotWidth - 4}" y="${yHighLine - 4}" text-anchor="end" font-size="9" fill="#DC2626" font-family="-apple-system, sans-serif">High: ${highRange}</text>`;

        // Y-axis ticks and labels
        const numTicks = 5;
        for (let i = 0; i <= numTicks; i++) {
            const val = yMin + (i / numTicks) * (yMax - yMin);
            const y = getY(val);
            svg += `<line x1="${padding.left - 4}" y1="${y}" x2="${padding.left}" y2="${y}" stroke="#94A3B8" stroke-width="1"/>`;
            svg += `<line x1="${padding.left}" y1="${y}" x2="${padding.left + plotWidth}" y2="${y}" stroke="#F1F5F9" stroke-width="1"/>`;
            svg += `<text x="${padding.left - 8}" y="${y + 3}" text-anchor="end" font-size="10" fill="#64748B" font-family="-apple-system, sans-serif">${val.toFixed(2)}</text>`;
        }

        // Trend Polyline
        svg += `<polyline points="${pointsStr}" fill="none" stroke="#1B365D" stroke-width="2"/>`;

        // Data points and timestamps
        coords.forEach((c) => {
            if (c.out) {
                // Out-of-range point: highlighted with marigold #F39C12
                svg += `<circle cx="${c.x}" cy="${c.y}" r="6" fill="#F39C12" stroke="#1B365D" stroke-width="2"/>`;
            } else {
                // Normal point: deep navy #1B365D
                svg += `<circle cx="${c.x}" cy="${c.y}" r="4" fill="#1B365D" stroke="#FFFFFF" stroke-width="1.5"/>`;
            }

            // Numeric value label above node
            svg += `<text x="${c.x}" y="${c.y - 10}" text-anchor="middle" font-size="10" font-weight="600" fill="${c.out ? '#B45309' : '#2C3E50'}" font-family="-apple-system, sans-serif">${c.val.toFixed(2)}</text>`;

            // X-axis date tick & label
            svg += `<line x1="${c.x}" y1="${padding.top + plotHeight}" x2="${c.x}" y2="${padding.top + plotHeight + 4}" stroke="#94A3B8" stroke-width="1"/>`;
            svg += `<text x="${c.x}" y="${padding.top + plotHeight + 16}" text-anchor="middle" font-size="10" fill="#64748B" font-family="-apple-system, sans-serif">${c.date}</text>`;
        });

        svg += '</svg>';
        chartSvgContainer.innerHTML = svg;
    }

    // Tab 4: Clinical Review Queue (Simple Ordered List)
    async function refreshReviewQueue() {
        try {
            const res = await fetch('/api/review/queue');
            if (!res.ok) throw new Error('Failed to fetch review queue');
            const data = await res.json();

            // Update badge in navigation tab
            queueBadge.textContent = data.count || 0;
            queueLengthIndicator.textContent = `${data.count} patient${data.count === 1 ? '' : 's'} pending review`;

            btnProcessNext.disabled = data.count === 0;

            if (data.count === 0) {
                queueOrderedList.innerHTML = '<li class="empty-state" style="list-style-type:none; padding:12px;">Queue is currently empty. No patients awaiting review.</li>';
                return;
            }

            // Render simple ordered list with position numbers
            let html = '';
            data.queue.forEach((patientID, idx) => {
                const isHead = idx === 0;
                html += `
                    <li class="queue-item ${isHead ? 'head-item' : ''}">
                        <div>
                            <span class="queue-patient-id">Patient ${patientID}</span>
                        </div>
                        <span class="queue-tag ${isHead ? 'head-tag' : ''}">${isHead ? 'Head of Queue (Next)' : `Position #${idx + 1}`}</span>
                    </li>
                `;
            });
            queueOrderedList.innerHTML = html;
        } catch (err) {
            console.error(err);
        }
    }

    // Dequeue next patient (O(1) front pointer operation)
    btnProcessNext.addEventListener('click', async () => {
        try {
            const res = await fetch('/api/review/next');
            if (!res.ok) throw new Error('Failed to dequeue next patient');
            const data = await res.json();

            if (!data.patientID) {
                dequeueNotification.textContent = 'Queue is empty. No patient to dequeue.';
                dequeueNotification.classList.remove('hidden');
                refreshReviewQueue();
                return;
            }

            dequeueNotification.innerHTML = `Dequeued <strong>Patient ${data.patientID}</strong> for clinical review (O(1) front pointer). Remaining in queue: <strong>${data.remainingInQueue}</strong>.`;
            dequeueNotification.classList.remove('hidden');

            showStatus(`Dequeued Patient ${data.patientID} from clinical review queue.`, 'info');
            refreshReviewQueue();
        } catch (err) {
            console.error(err);
            showStatus('Error processing review queue', 'error');
        }
    });

    // Utility: Seed Demo Data (if trigger button present)
    if (btnSeedData) {
        btnSeedData.addEventListener('click', async () => {
            try {
                const res = await fetch('/api/seed', { method: 'POST' });
                if (!res.ok) throw new Error('Failed to seed demo data');
                const data = await res.json();

                showStatus(data.message, 'success');
                refreshReviewQueue();

                // Set P-101 as active patient and load history
                state.currentPatientID = 'P-101';
                inputLookupID.value = 'P-101';
                inputRecordID.value = 'P-101';
                inputTrendPatientID.value = 'P-101';

                loadPatientHistory('P-101');
            } catch (err) {
                console.error(err);
                showStatus('Failed to load demo data', 'error');
            }
        });
    }

    // Initial Load
    loadAnalytes();
    refreshReviewQueue();
});
