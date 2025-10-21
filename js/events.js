(function (global) {
const {
    getState,
    saveState,
    resetState,
    importState,
    exportState,
    generateId,
    findAppById,
    findSailorById
} = global.AppState;
const {
    render,
    showDashboardOverview,
    focusView,
    hydrateBuilderOptions
} = global.AppRenderer;

function registerEventHandlers() {
    document.body.addEventListener('click', handleClick);
    document.body.addEventListener('submit', handleSubmit);
    document.body.addEventListener('change', handleChange);
}

function handleClick(event) {
    const button = event.target.closest('button');
    const tab = event.target.closest('.nav-tab');
    const listItem = event.target.closest('.item-list li');
    const modalClose = event.target.closest('.modal-close-btn');
    const modalOverlay = event.target.closest('.modal-overlay');

    if (tab) {
        focusView(tab.dataset.view);
        return;
    }

    if (modalClose || (modalOverlay && modalOverlay.id === 'add-kr-modal')) {
        closeKrModal();
        return;
    }

    if (listItem) {
        handleListSelection(listItem);
        return;
    }

    if (button) {
        handleButtonClick(button);
    }
}

function handleListSelection(listItem) {
    const sailorsList = listItem.closest('#sailors-list');
    const appsList = listItem.closest('#apps-list');
    if (sailorsList) {
        sailorsList.querySelectorAll('li').forEach(li => li.classList.remove('active'));
        listItem.classList.add('active');
        render();
        return;
    }
    if (appsList) {
        appsList.querySelectorAll('li').forEach(li => li.classList.remove('active'));
        listItem.classList.add('active');
        render();
    }
}

function handleButtonClick(button) {
    switch (button.id) {
        case 'add-sailor-btn': {
            document.getElementById('add-sailor-form-container')?.classList.toggle('hidden');
            return;
        }
        case 'add-app-btn': {
            const formContainer = document.getElementById('add-app-form-container');
            const buildersSelect = document.getElementById('app-builders');
            if (buildersSelect) {
                hydrateBuilderOptions(buildersSelect);
            }
            formContainer?.classList.toggle('hidden');
            return;
        }
        case 'cancel-add-sailor':
        case 'cancel-add-app': {
            button.closest('.card')?.classList.add('hidden');
            return;
        }
        case 'export-data-btn': {
            exportData();
            return;
        }
        case 'clear-data-btn': {
            clearAllData();
            return;
        }
        case 'back-to-overview-btn': {
            showDashboardOverview();
            return;
        }
        case 'save-app-metrics-btn': {
            persistAppMetrics();
            return;
        }
        case 'update-app-builders-btn': {
            updateAppBuilders(button.dataset.appId);
            return;
        }
        case 'update-app-overview-btn': {
            updateAppOverview(button.dataset.appId);
            return;
        }
        default:
            break;
    }

    if (button.dataset.action === 'open-kr-modal') {
        openKrModal(button.dataset.okrId);
        return;
    }

    if (button.dataset.action === 'copy-sailor-context') {
        copySailorContext(button.dataset.sailorId);
        return;
    }

    if (button.dataset.action === 'delete-sailor') {
        deleteSailor(button.dataset.sailorId);
        return;
    }

    if (button.dataset.action === 'delete-app') {
        deleteApp(button.dataset.appId);
        return;
    }

    if (button.dataset.action === 'add-objective') {
        addObjective();
        return;
    }
}

function exportData() {
    const dataStr = exportState();
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `wfc-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}

function clearAllData() {
    const confirmed = confirm(
        'WARNING: This will permanently delete all sailors, applications, and check-ins. This action cannot be undone. Are you sure?'
    );
    if (!confirmed) return;
    resetState();
    alert('All data has been cleared.');
    render();
}

function openKrModal(okrId) {
    const modal = document.getElementById('add-kr-modal');
    if (!modal) return;
    const form = modal.querySelector('form');
    form?.reset();
    if (form) {
        form.querySelector('input[name="okrId"]').value = okrId;
    }
    modal.classList.remove('hidden');
}

function closeKrModal() {
    document.getElementById('add-kr-modal')?.classList.add('hidden');
}

function addObjective() {
    const activeAppId = document.querySelector('#apps-list .active')?.dataset.id;
    if (!activeAppId) return;
    const app = findAppById(activeAppId);
    if (!app) return;
    const objective = prompt('Enter the new Objective:');
    if (!objective) return;
    if (!app.okrs) app.okrs = [];
    app.okrs.push({
        id: generateId(),
        objective,
        keyResults: []
    });
    saveState();
    render();
}

function persistAppMetrics() {
    const activeAppId = document.querySelector('#apps-list .active')?.dataset.id;
    if (!activeAppId) return;
    const app = findAppById(activeAppId);
    if (!app) return;
    const today = new Date().toISOString().split('T')[0];
    const hoursInput = document.getElementById('metric-hours-per-user');
    const usersInput = document.getElementById('metric-num-users');
    const satisfactionInput = document.getElementById('metric-satisfaction');
    const newHours = parseFloat(hoursInput?.value ?? '0');
    const newUsers = parseInt(usersInput?.value ?? '0', 10);
    const latestHours = [...app.metrics.timeSavedPerUserHistory].pop()?.value;
    const latestUsers = [...app.metrics.numUsersHistory].pop()?.value;
    if (!Number.isNaN(newHours) && newHours !== latestHours) {
        app.metrics.timeSavedPerUserHistory.push({ date: today, value: newHours });
    }
    if (!Number.isNaN(newUsers) && newUsers !== latestUsers) {
        app.metrics.numUsersHistory.push({ date: today, value: newUsers });
    }
    app.metrics.satisfaction = parseInt(satisfactionInput?.value ?? '5', 10) || 5;
    saveState();
    alert('Success metrics saved!');
    render();
}

function handleSubmit(event) {
    event.preventDefault();
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;

    switch (form.id) {
        case 'sailor-form':
            addSailor(form);
            break;
        case 'app-form':
            addApplication(form);
            break;
        case 'add-checkin-form':
            addCheckin(form);
            break;
        case 'add-kr-form':
            addKeyResult(form);
            break;
        default:
            if (form.dataset.action === 'log-measurement') {
                logMeasurement(form);
            }
            break;
    }
    saveState();
    render();
}

function addSailor(form) {
    const state = getState();
    state.sailors.push({
        id: generateId(),
        name: form.querySelector('#sailor-name').value,
        command: form.querySelector('#sailor-command').value,
        trainingDate: form.querySelector('#sailor-training-date').value
    });
    form.reset();
    document.getElementById('add-sailor-form-container')?.classList.add('hidden');
}

function addApplication(form) {
    const state = getState();
    const today = new Date().toISOString().split('T')[0];
    const status = form.querySelector('#app-status-new').value;
    const newApp = {
        id: generateId(),
        name: form.querySelector('#app-name').value,
        description: form.querySelector('#app-description').value,
        jobToBeDone: form.querySelector('#app-job').value || '',
        mvpHypothesis: form.querySelector('#app-hypothesis').value || '',
        technicalDetails: form.querySelector('#app-technical-details').value || '',
        status,
        ideaDate: today,
        mvpDate: status === 'MVP' || status === 'Shipped' ? today : null,
        shippedDate: status === 'Shipped' ? today : null,
        builderIds: [...form.querySelector('#app-builders').selectedOptions].map(opt => opt.value),
        metrics: {
            timeSavedPerUserHistory: [],
            numUsersHistory: [],
            satisfaction: 5
        },
        okrs: []
    };
    state.apps.push(newApp);
    form.reset();
    document.getElementById('add-app-form-container')?.classList.add('hidden');
}

function deleteSailor(sailorId) {
    const sailor = findSailorById(sailorId);
    if (!sailor) return;
    const confirmed = confirm(`Delete ${sailor.name}? This will remove their check-ins and unassign them from apps.`);
    if (!confirmed) return;
    const state = getState();
    state.sailors = state.sailors.filter(item => item.id !== sailorId);
    state.checkins = state.checkins.filter(entry => entry.sailorId !== sailorId);
    state.apps.forEach(app => {
        app.builderIds = app.builderIds.filter(id => id !== sailorId);
    });
    saveState();
    render();
}

function deleteApp(appId) {
    const app = findAppById(appId);
    if (!app) return;
    const confirmed = confirm(`Delete ${app.name}? This action cannot be undone.`);
    if (!confirmed) return;
    const state = getState();
    state.apps = state.apps.filter(item => item.id !== appId);
    saveState();
    render();
}

function updateAppBuilders(appId) {
    const app = findAppById(appId);
    if (!app) return;
    const selector = document.getElementById('app-builders-edit');
    if (!selector) return;
    const selectedBuilderIds = [...selector.selectedOptions].map(option => option.value);
    app.builderIds = selectedBuilderIds;
    saveState();
    render();
}

function updateAppOverview(appId) {
    const app = findAppById(appId);
    if (!app) return;
    const descriptionInput = document.getElementById('app-description-edit');
    const jobInput = document.getElementById('app-job-edit');
    const hypothesisInput = document.getElementById('app-hypothesis-edit');
    const technicalInput = document.getElementById('app-technical-edit');
    if (!descriptionInput || !jobInput || !hypothesisInput || !technicalInput) return;
    app.description = descriptionInput.value || '';
    app.jobToBeDone = jobInput.value || '';
    app.mvpHypothesis = hypothesisInput.value || '';
    app.technicalDetails = technicalInput.value || '';
    saveState();
    render();
}

function copySailorContext(sailorId) {
    const state = getState();
    const sailor = findSailorById(sailorId);
    if (!sailor) {
        alert('Unable to find sailor details.');
        return;
    }
    const appsBuilt = state.apps.filter(app => app.builderIds.includes(sailorId));
    const checkins = state.checkins
        .filter(entry => entry.sailorId === sailorId)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    const markdown = buildSailorMarkdown({
        sailor,
        appsBuilt,
        checkins,
        allSailors: state.sailors
    });
    copyTextToClipboard(markdown);
}

function buildSailorMarkdown({ sailor, appsBuilt, checkins, allSailors }) {
    const lines = [
        `# Builder Context: ${sailor.name}`,
        '',
        `- Command: ${sailor.command || 'N/A'}`,
        `- Training Completion: ${formatDateDisplay(sailor.trainingDate)}`,
        `- Generated: ${formatDateDisplay(new Date())}`,
        `- Total Applications: ${appsBuilt.length}`,
        '',
        '## Check-in History',
        checkins.length
            ? checkins
                  .map(entry => {
                      const note = sanitizeMultiline(entry.notes);
                      const format = entry.format || 'Unspecified format';
                      return `- ${formatDateDisplay(entry.date)} (${format}): ${note || '(no notes recorded)'}`;
                  })
                  .join('\n')
            : '- No check-ins recorded.',
        '',
        '## Applications',
        appsBuilt.length
            ? appsBuilt.map(app => buildAppMarkdown(app, allSailors)).join('\n\n')
            : '- No applications assigned.',
        '',
        '---',
        '',
        '_Use this context with an LLM to draft a check-in email and prep interview questions._'
    ];
    return lines.join('\n');
}

function buildAppMarkdown(app, allSailors) {
    const metrics = app.metrics || {};
    const builderNames = app.builderIds
        ?.map(id => allSailors.find(sailor => sailor.id === id)?.name)
        .filter(Boolean) || [];
    const latestHours = getLatestHistoryEntry(metrics.timeSavedPerUserHistory);
    const latestUsers = getLatestHistoryEntry(metrics.numUsersHistory);
    const satisfaction =
        typeof metrics.satisfaction === 'number' ? metrics.satisfaction : 'No satisfaction score recorded.';
    const cumulativeHours = calculateCumulativeHoursSaved(app);

    const lines = [
        `### ${app.name} (${app.status || 'Status unknown'})`,
        `- Description: ${sanitizeMultiline(app.description) || 'No description provided.'}`,
        `- Job To Be Done: ${sanitizeMultiline(app.jobToBeDone) || 'Not documented.'}`,
        `- MVP Hypothesis: ${sanitizeMultiline(app.mvpHypothesis) || 'Not documented.'}`,
        `- Technical Implementation: ${sanitizeMultiline(app.technicalDetails) || 'Not documented.'}`,
        `- Builders: ${builderNames.length ? builderNames.join(', ') : 'None assigned'}`,
        `- Idea Date: ${formatDateDisplay(app.ideaDate)}`,
        `- MVP Date: ${formatDateDisplay(app.mvpDate)}`,
        `- Shipped Date: ${formatDateDisplay(app.shippedDate)}`,
        '- Success Metrics:',
        indentText(
            `- Latest Time Saved per User: ${
                latestHours ? `${latestHours.value} hours (${formatDateDisplay(latestHours.date)})` : 'No data recorded.'
            }`,
            2
        ),
        indentText(
            `- Latest Number of Users: ${
                latestUsers ? `${latestUsers.value} users (${formatDateDisplay(latestUsers.date)})` : 'No data recorded.'
            }`,
            2
        ),
        indentText(`- Satisfaction (1-10): ${satisfaction}`, 2),
        indentText(
            `- Estimated Cumulative Hours Saved: ${
                cumulativeHours ? cumulativeHours.toLocaleString() : '0'
            }`,
            2
        ),
        indentText('- Time Saved History:', 2),
        indentText(formatHistory(metrics.timeSavedPerUserHistory, 'hours'), 4),
        indentText('- User Count History:', 2),
        indentText(formatHistory(metrics.numUsersHistory, 'users'), 4),
        '- OKRs:',
        indentText(formatOkrs(app.okrs), 2)
    ];

    return lines.join('\n');
}

function formatOkrs(okrs) {
    if (!okrs || okrs.length === 0) {
        return '- No OKRs defined.';
    }
    return okrs
        .map(okr => {
            const objective = sanitizeMultiline(okr.objective) || 'Objective details not provided.';
            const keyResults = formatKeyResults(okr.keyResults);
            return `- Objective: ${objective}\n${indentText(keyResults, 2)}`;
        })
        .join('\n');
}

function formatKeyResults(keyResults) {
    if (!keyResults || keyResults.length === 0) {
        return '- No key results defined.';
    }
    return keyResults
        .map(kr => {
            const progress = Math.round(getKrProgress(kr));
            const measurements = formatMeasurements(kr.measurements, kr.unit);
            return [
                `- KR: ${sanitizeMultiline(kr.text) || 'Description not provided.'}`,
                `  - Target: ${kr.targetValue ?? 'N/A'} ${kr.unit || ''}`.trim(),
                `  - Start Value: ${kr.startValue ?? 'N/A'}`,
                `  - Progress: ${Number.isFinite(progress) ? `${progress}%` : 'No data'}`,
                '  - Measurements:',
                indentText(measurements, 6)
            ].join('\n');
        })
        .join('\n');
}

function formatMeasurements(measurements, unit) {
    if (!measurements || measurements.length === 0) {
        return '- No measurements recorded.';
    }
    const sorted = [...measurements].sort((a, b) => new Date(b.date) - new Date(a.date));
    return sorted
        .map(entry => `- ${formatDateDisplay(entry.date)}: ${entry.value}${unit ? ` ${unit}` : ''}`)
        .join('\n');
}

function formatHistory(history = [], unitLabel) {
    if (!history || history.length === 0) {
        return '- No history recorded.';
    }
    const sorted = [...history].sort((a, b) => new Date(b.date) - new Date(a.date));
    return sorted
        .map(entry => `- ${formatDateDisplay(entry.date)}: ${entry.value}${unitLabel ? ` ${unitLabel}` : ''}`)
        .join('\n');
}

function getLatestHistoryEntry(history = []) {
    if (!history || history.length === 0) return null;
    return [...history].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
}

function formatDateDisplay(value) {
    if (!value) return 'Not set';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString();
}

function sanitizeMultiline(text) {
    if (!text) return '';
    return String(text).replace(/\r?\n+/g, ' ').trim();
}

function indentText(text, spaces) {
    const value = text ?? '';
    const indent = ' '.repeat(spaces);
    return value
        .split('\n')
        .map(line => (line ? indent + line : line))
        .join('\n');
}

function copyTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        navigator.clipboard
            .writeText(text)
            .then(() => alert('Builder context copied to clipboard as Markdown!'))
            .catch(() => fallbackCopyText(text));
        return;
    }
    fallbackCopyText(text);
}

function fallbackCopyText(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-1000px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            alert('Builder context copied to clipboard as Markdown!');
        } else {
            throw new Error('execCommand returned false');
        }
    } catch (error) {
        console.error('Failed to copy context to clipboard', error);
        alert('Could not copy context to the clipboard. Please copy it manually.');
    } finally {
        document.body.removeChild(textarea);
    }
}

function calculateCumulativeHoursSaved(app) {
    const startDate = app.mvpDate;
    const metrics = app.metrics || {};
    if (
        !startDate ||
        !metrics.timeSavedPerUserHistory ||
        metrics.timeSavedPerUserHistory.length === 0 ||
        !metrics.numUsersHistory ||
        metrics.numUsersHistory.length === 0
    ) {
        return 0;
    }
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    let totalHours = 0;
    for (let d = new Date(startDate); d <= new Date(); d.setTime(d.getTime() + msPerWeek)) {
        const currentDate = new Date(d);
        const latestUsers =
            [...metrics.numUsersHistory]
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .find(entry => new Date(entry.date) <= currentDate)?.value || 0;
        const latestHours =
            [...metrics.timeSavedPerUserHistory]
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .find(entry => new Date(entry.date) <= currentDate)?.value || 0;
        totalHours += latestUsers * latestHours;
    }
    return Math.round(totalHours);
}

function getKrProgress(kr) {
    if (!kr || !kr.measurements || kr.measurements.length === 0) return 0;
    const latestValue = [...kr.measurements]
        .sort((a, b) => new Date(b.date) - new Date(a.date))[0].value;
    const range = kr.targetValue - kr.startValue;
    if (range === 0) return latestValue >= kr.targetValue ? 100 : 0;
    const progress = ((latestValue - kr.startValue) / range) * 100;
    return Math.max(0, Math.min(progress, 100));
}

function addCheckin(form) {
    const state = getState();
    state.checkins.push({
        id: generateId(),
        sailorId: form.dataset.sailorId,
        date: new Date().toISOString().split('T')[0],
        format: form.querySelector('#checkin-format')?.value || 'Unspecified format',
        notes: form.querySelector('#checkin-notes').value
    });
    form.reset();
}

function addKeyResult(form) {
    const activeAppId = document.querySelector('#apps-list .active')?.dataset.id;
    if (!activeAppId) return;
    const app = findAppById(activeAppId);
    if (!app) return;
    const formData = new FormData(form);
    const okr = app.okrs.find(item => item.id === formData.get('okrId'));
    if (!okr) return;
    okr.keyResults.push({
        id: generateId(),
        text: formData.get('text'),
        startValue: parseFloat(formData.get('startValue')),
        targetValue: parseFloat(formData.get('targetValue')),
        unit: formData.get('unit'),
        measurements: []
    });
    closeKrModal();
}

function logMeasurement(form) {
    const activeAppId = document.querySelector('#apps-list .active')?.dataset.id;
    if (!activeAppId) return;
    const app = findAppById(activeAppId);
    if (!app) return;
    const formData = new FormData(form);
    const kr = app.okrs
        .flatMap(okr => okr.keyResults)
        .find(item => item.id === form.dataset.krId);
    if (!kr) return;
    kr.measurements.push({
        date: formData.get('date'),
        value: parseFloat(formData.get('value'))
    });
    form.reset();
}

function handleChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.id === 'import-data-input') {
        processImport(target);
        return;
    }
    if (target.id === 'app-status-update') {
        updateAppStatus(target);
        return;
    }
    if (target.dataset.dateType) {
        updateAppDate(target);
    }
}

function processImport(input) {
    const file = input.files?.[0];
    if (!file) return;
    const confirmed = confirm('Are you sure? This will overwrite all current data.');
    if (!confirmed) {
        input.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = event => {
        try {
            const importedState = JSON.parse(event.target.result);
            importState(importedState);
            render();
            alert('Data imported successfully!');
        } catch (error) {
            alert('Import failed: ' + error.message);
        } finally {
            input.value = '';
        }
    };
    reader.readAsText(file);
}

function updateAppStatus(selectElement) {
    const app = findAppById(selectElement.dataset.appId);
    if (!app) return;
    const newStatus = selectElement.value;
    if (app.status === newStatus) return;
    app.status = newStatus;
    const today = new Date().toISOString().split('T')[0];
    if (newStatus === 'MVP' && !app.mvpDate) app.mvpDate = today;
    if (newStatus === 'Shipped' && !app.shippedDate) app.shippedDate = today;
    saveState();
    render();
}

function updateAppDate(input) {
    const app = findAppById(input.dataset.appId);
    if (!app) return;
    app[input.dataset.dateType] = input.value || null;
    saveState();
    render();
}

global.AppEvents = {
    registerEventHandlers
};
})(window);
