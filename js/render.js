(function (global) {
const { getState, findAppById, findSailorById } = global.AppState;

let charts = {};

function getKrProgress(kr) {
    if (!kr.measurements || kr.measurements.length === 0) return 0;
    const latestValue = [...kr.measurements]
        .sort((a, b) => new Date(b.date) - new Date(a.date))[0].value;
    const range = kr.targetValue - kr.startValue;
    if (range === 0) return latestValue >= kr.targetValue ? 100 : 0;
    const progress = ((latestValue - kr.startValue) / range) * 100;
    return Math.max(0, Math.min(progress, 100));
}

function calculateCumulativeHoursSaved(app) {
    const startDate = app.mvpDate;
    if (!startDate || !app.metrics.timeSavedPerUserHistory.length || !app.metrics.numUsersHistory.length) {
        return 0;
    }
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    let totalHours = 0;
    for (let d = new Date(startDate); d <= new Date(); d.setTime(d.getTime() + msPerWeek)) {
        const currentDate = new Date(d);
        const latestUsers = [...app.metrics.numUsersHistory]
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .find(entry => new Date(entry.date) <= currentDate)?.value || 0;
        const latestHours = [...app.metrics.timeSavedPerUserHistory]
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .find(entry => new Date(entry.date) <= currentDate)?.value || 0;
        totalHours += latestUsers * latestHours;
    }
    return Math.round(totalHours);
}

function destroyCharts() {
    Object.values(charts).forEach(chart => chart?.destroy());
    charts = {};
}

function render() {
    destroyCharts();
    renderDashboard();
    renderSailorsView();
    renderAppsView();
}

function renderDashboard() {
    const state = getState();
    const view = document.getElementById('dashboard-view');
    if (!view) return;

    const totalCumulativeHours = state.apps.reduce(
        (sum, app) => sum + calculateCumulativeHoursSaved(app),
        0
    );
    const totalUsers = state.apps.reduce(
        (sum, app) => sum + ([...app.metrics.numUsersHistory].pop()?.value || 0),
        0
    );
    const performers = state.sailors
        .map(sailor => {
            const appsBuilt = state.apps.filter(app => app.builderIds.includes(sailor.id));
            const totalHoursSaved = appsBuilt.reduce(
                (sum, app) => sum + calculateCumulativeHoursSaved(app),
                0
            );
            const avgKRProgress =
                appsBuilt.reduce((sum, app) => {
                    const krs = app.okrs?.flatMap(okr => okr.keyResults || []) || [];
                    if (krs.length === 0) return sum;
                    return sum + krs.reduce((krSum, kr) => krSum + getKrProgress(kr), 0) / krs.length;
                }, 0) / (appsBuilt.length || 1);
            return { sailor, totalHoursSaved, avgKRProgress };
        })
        .sort((a, b) => b.totalHoursSaved - a.totalHoursSaved)
        .slice(0, 5);

    view.innerHTML = `
        <div class="dashboard-layout-grid">
            <div>
                <div class="card">
                    <h2>Program Health</h2>
                    <div class="stat-grid">
                        <div class="stat-card">
                            <div class="number">${state.apps.length}</div>
                            <div class="label">Active Apps</div>
                        </div>
                        <div class="stat-card">
                            <div class="number">${totalUsers.toLocaleString()}</div>
                            <div class="label">Total Users</div>
                        </div>
                        <div class="stat-card">
                            <div class="number">${totalCumulativeHours.toLocaleString()}</div>
                            <div class="label">Cumulative Hours Saved</div>
                        </div>
                    </div>
                </div>
                <div id="dashboard-okr-chart-container" class="card"></div>
            </div>
            <div>
                <div class="card">
                    <h3>Top Performing Builders</h3>
                    <ul class="performers-list">
                        ${
                            performers.length > 0
                                ? performers
                                      .map(
                                          ({ sailor, totalHoursSaved, avgKRProgress }) => `
                                <li>
                                    <strong>${sailor.name}</strong><br>
                                    <small>Total Hours Saved: ${totalHoursSaved.toLocaleString()}</small><br>
                                    <small>Avg KR Progress: ${Math.round(avgKRProgress)}%</small>
                                </li>`
                                      )
                                      .join('')
                                : '<li>No builder data yet. Add sailors and apps to see insights.</li>'
                        }
                    </ul>
                </div>
                <div class="card">
                    <h3>Upcoming Launches</h3>
                    <ul class="performers-list">
                        ${
                            state.apps
                                .filter(app => !app.shippedDate)
                                .sort((a, b) => new Date(a.mvpDate) - new Date(b.mvpDate))
                                .slice(0, 5)
                                .map(
                                    app => `
                                <li>
                                    <strong>${app.name}</strong><br>
                                    <small>MVP: ${app.mvpDate ? new Date(app.mvpDate).toLocaleDateString() : 'TBD'}</small><br>
                                    <small>Status: ${app.status}</small>
                                </li>`
                                )
                                .join('') || '<li>No upcoming launches.</li>'
                        }
                    </ul>
                </div>
            </div>
        </div>`;

    renderDashboardAppOverview();
}

function renderDashboardAppOverview() {
    const state = getState();
    const container = document.getElementById('dashboard-okr-chart-container');
    if (!container) return;

    container.innerHTML = `
        <h3>Application OKR Progress</h3>
        <p>Average progress across all Key Results for each application. Click a bar to see details.</p>
        <canvas id="dashboard-okr-chart"></canvas>`;

    const appProgressData = state.apps.map(app => {
        const krs = app.okrs?.flatMap(okr => okr.keyResults || []) || [];
        const avgProgress =
            krs.length > 0
                ? krs.reduce((sum, kr) => sum + getKrProgress(kr), 0) / krs.length
                : 0;
        return { name: app.name, progress: avgProgress, id: app.id };
    });

    const canvas = document.getElementById('dashboard-okr-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    charts.dashboardOverview = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: appProgressData.map(app => app.name),
            datasets: [
                {
                    label: 'Avg KR Progress',
                    data: appProgressData.map(app => app.progress),
                    backgroundColor: 'rgba(0, 48, 135, 0.7)'
                }
            ]
        },
        options: {
            scales: { y: { beginAtZero: true, max: 100 } },
            onClick: (_, elements) => {
                if (!elements.length) return;
                const index = elements[0].index;
                renderDashboardKrDrilldown(appProgressData[index].id);
            }
        }
    });
}

function renderDashboardKrDrilldown(appId) {
    const container = document.getElementById('dashboard-okr-chart-container');
    const app = findAppById(appId);
    if (!container || !app) return;

    container.innerHTML = `
        <div style="display:flex; justify-content: space-between; align-items: center;">
            <h3>KR Progress for: ${app.name}</h3>
            <button id="back-to-overview-btn" class="btn btn-secondary">Back to Overview</button>
        </div>
        <canvas id="dashboard-kr-drilldown-chart"></canvas>`;

    const krs = app.okrs?.flatMap(okr => okr.keyResults || []) || [];
    const canvas = document.getElementById('dashboard-kr-drilldown-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    charts.dashboardDrilldown = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: krs.map(kr =>
                kr.text.length > 50 ? `${kr.text.substring(0, 47)}...` : kr.text
            ),
            datasets: [
                {
                    label: 'KR Completion',
                    data: krs.map(getKrProgress),
                    backgroundColor: 'rgba(92, 184, 92, 0.7)'
                }
            ]
        },
        options: {
            indexAxis: 'y',
            scales: {
                x: {
                    beginAtZero: true,
                    max: 100,
                    title: { display: true, text: 'Progress (%)' }
                }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function renderSailorsView() {
    const state = getState();
    const view = document.getElementById('sailors-view');
    if (!view) return;
    const activeSailorId = document.querySelector('#sailors-list .active')?.dataset.id;

    view.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <h2>Sailors</h2>
            <button id="add-sailor-btn" class="btn btn-primary">+ Add Sailor</button>
        </div>
        <div id="add-sailor-form-container" class="card hidden">
            <h3>Add a New Sailor</h3>
            <form id="sailor-form">
                <label for="sailor-name">Name</label>
                <input type="text" id="sailor-name" required>
                <label for="sailor-command">Command/Unit</label>
                <input type="text" id="sailor-command" required>
                <label for="sailor-training-date">Training Completion Date</label>
                <input type="date" id="sailor-training-date" required>
                <button type="submit" class="btn btn-success">Save Sailor</button>
                <button type="button" id="cancel-add-sailor" class="btn btn-secondary">Cancel</button>
            </form>
        </div>
        <div class="form-grid">
            <div class="card">
                <h3>All Sailors</h3>
                <ul id="sailors-list" class="item-list"></ul>
            </div>
            <div id="sailor-details-container" class="card hidden"></div>
        </div>`;

    const list = view.querySelector('#sailors-list');
    list.innerHTML =
        state.sailors
            .map(
                sailor => `
            <li data-id="${sailor.id}" class="${sailor.id === activeSailorId ? 'active' : ''}">
                <strong>${sailor.name}</strong><br>
                <small>${sailor.command}</small>
            </li>`
            )
            .join('') || '<li>No sailors added yet.</li>';

    if (activeSailorId) {
        const sailor = findSailorById(activeSailorId);
        if (!sailor) return;
        const container = view.querySelector('#sailor-details-container');
        const appsBuilt = state.apps.filter(app => app.builderIds.includes(sailor.id));
        const sailorCheckins = state.checkins
            .filter(checkin => checkin.sailorId === sailor.id)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        const totalUsers = appsBuilt.reduce(
            (sum, app) => sum + ([...app.metrics.numUsersHistory].pop()?.value || 0),
            0
        );
        const totalHoursSaved = appsBuilt.reduce(
            (sum, app) => sum + calculateCumulativeHoursSaved(app),
            0
        );
        container.classList.remove('hidden');
        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; gap: 10px;">
                <h3 style="margin:0;">${sailor.name}</h3>
                <button class="btn btn-danger" data-action="delete-sailor" data-sailor-id="${sailor.id}">Delete Sailor</button>
            </div>
            <p><strong>Command:</strong> ${sailor.command}</p>
            <p><strong>Trained On:</strong> ${new Date(sailor.trainingDate).toLocaleDateString()}</p>
            <hr>
            <h4>Contribution Stats</h4>
            <div class="sailor-stats-grid">
                <div class="stat-card">
                    <div class="number">${appsBuilt.length}</div>
                    <div class="label">Apps Built</div>
                </div>
                <div class="stat-card">
                    <div class="number">${totalUsers.toLocaleString()}</div>
                    <div class="label">Total Users of Apps</div>
                </div>
                <div class="stat-card">
                    <div class="number">${totalHoursSaved.toLocaleString()}</div>
                    <div class="label">Total Hours Saved</div>
                </div>
            </div>
            <hr>
            <div style="display:flex; justify-content:space-between; align-items:center; gap: 10px;">
                <h4 style="margin:0;">Check-ins</h4>
                <button class="btn btn-secondary" data-action="copy-sailor-context" data-sailor-id="${sailor.id}">
                    Copy Context (Markdown)
                </button>
            </div>
            <form id="add-checkin-form" data-sailor-id="${sailor.id}">
                <label class="label" for="checkin-format">Format</label>
                <select id="checkin-format" required>
                    <option value="Teams Call">Teams Call</option>
                    <option value="In Person">In Person</option>
                    <option value="Email">Email</option>
                </select>
                <label for="checkin-notes">New Check-in Note</label>
                <textarea id="checkin-notes" required></textarea>
                <button type="submit" class="btn btn-primary">Add Check-in</button>
            </form>
            <ul class="item-list" style="margin-top: 20px;">
                ${
                    sailorCheckins.length
                        ? sailorCheckins
                              .map(
                                  entry => `
                        <li>
                            <strong>${new Date(entry.date).toLocaleDateString()}:</strong>
                            <em>${entry.format || 'Unspecified format'}</em> - ${entry.notes}
                        </li>`
                              )
                              .join('')
                        : '<li>No check-ins logged.</li>'
                }
            </ul>`;
    }
}

function renderAppsView() {
    const state = getState();
    const view = document.getElementById('apps-view');
    if (!view) return;

    const activeAppId = document.querySelector('#apps-list .active')?.dataset.id;

    view.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <h2>Applications</h2>
            <button id="add-app-btn" class="btn btn-primary">+ Add Application</button>
        </div>
        <div id="add-app-form-container" class="card hidden">
            <h3>Add a New Application</h3>
            <form id="app-form">
                <label for="app-name">Application Name</label>
                <input type="text" id="app-name" required>
                <label for="app-description">Description</label>
                <textarea id="app-description" required></textarea>
                <label for="app-job">Job To Be Done (JTBD)</label>
                <textarea id="app-job" placeholder="Describe the user job this solves"></textarea>
                <label for="app-hypothesis">MVP Hypothesis</label>
                <textarea id="app-hypothesis" placeholder="What are you testing with this MVP?"></textarea>
                <label for="app-technical-details">Technical Implementation Details</label>
                <textarea id="app-technical-details" placeholder="Stack, integrations, key components"></textarea>
                <label for="app-status-new">Initial Status</label>
                <select id="app-status-new">
                    <option value="Idea">Idea</option>
                    <option value="MVP">MVP</option>
                    <option value="Shipped">Shipped</option>
                </select>
                <label for="app-builders">Builders</label>
                <select id="app-builders" multiple size="5"></select>
                <button type="submit" class="btn btn-success">Save Application</button>
                <button type="button" id="cancel-add-app" class="btn btn-secondary">Cancel</button>
            </form>
        </div>
        <div class="app-layout">
            <div class="card app-list-container">
                <h3>All Applications</h3>
                <ul id="apps-list" class="item-list"></ul>
            </div>
            <div id="app-details-container" class="card hidden"></div>
        </div>`;

    const list = view.querySelector('#apps-list');
    list.innerHTML =
        state.apps
            .map(
                app => `
            <li data-id="${app.id}" class="${app.id === activeAppId ? 'active' : ''}">
                <strong>${app.name}</strong>
                <span class="tag tag-${app.status.toLowerCase()}">${app.status}</span>
            </li>`
            )
            .join('') || '<li>No applications added yet.</li>';

    const layout = view.querySelector('.app-layout');
    if (activeAppId) {
        layout.classList.add('details-visible');
        const app = findAppById(activeAppId);
        if (!app) return;
        const container = view.querySelector('#app-details-container');
        const builderIds = Array.isArray(app.builderIds) ? app.builderIds : [];
        const builderOptions =
            state.sailors.length > 0
                ? state.sailors
                      .map(
                          sailor => `
                    <option value="${sailor.id}" ${
                          builderIds.includes(sailor.id) ? 'selected' : ''
                      }>${sailor.name}</option>`
                      )
                      .join('')
                : '<option disabled>No sailors available</option>';
        const builderSelectSize = Math.min(Math.max(state.sailors.length, 3), 6);
        const latestHours = [...app.metrics.timeSavedPerUserHistory].pop()?.value || 0;
        const latestUsers = [...app.metrics.numUsersHistory].pop()?.value || 0;
        container.classList.remove('hidden');
        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; gap: 10px; margin-bottom: 10px;">
                <h3 style="margin:0;">${app.name}</h3>
                <button class="btn btn-danger" data-action="delete-app" data-app-id="${app.id}">Delete Application</button>
            </div>
            <div style="display:flex; align-items:center; gap: 10px; margin-bottom: 15px;">
                <select id="app-status-update" data-app-id="${app.id}" class="tag-select">
                    <option value="Idea" ${app.status === 'Idea' ? 'selected' : ''}>Idea</option>
                    <option value="MVP" ${app.status === 'MVP' ? 'selected' : ''}>MVP</option>
                    <option value="Shipped" ${app.status === 'Shipped' ? 'selected' : ''}>Shipped</option>
                </select>
                <span><strong>Current Builders:</strong> ${
                    builderIds.length
                        ? builderIds
                              .map(id => findSailorById(id)?.name || 'Unknown Sailor')
                              .join(', ')
                        : 'None assigned'
                }</span>
            </div>
            <div style="margin-bottom: 15px; padding: 15px; border: 1px solid #eee; border-radius: 8px; background: #fafafa;">
                <h4 style="margin-top:0;">Edit Builder Assignments</h4>
                <label class="label" for="app-builders-edit">Select Contributors</label>
                <select id="app-builders-edit" data-app-id="${app.id}" multiple size="${builderSelectSize}">
                    ${builderOptions}
                </select>
                <small style="display:block; margin:8px 0;">Use Ctrl/Cmd + click to select multiple builders.</small>
                <button class="btn btn-secondary" id="update-app-builders-btn" data-app-id="${app.id}" ${
                    state.sailors.length ? '' : 'disabled'
                }>Save Builders</button>
            </div>
            <div class="card" style="margin-bottom: 15px;">
                <h4 style="margin-top:0;">Product Narrative</h4>
                <label class="label" for="app-description-edit">Product Description</label>
                <textarea id="app-description-edit" data-app-id="${app.id}" rows="3">${app.description || ''}</textarea>
                <label class="label" for="app-job-edit">Job To Be Done</label>
                <textarea id="app-job-edit" data-app-id="${app.id}" rows="3">${app.jobToBeDone || ''}</textarea>
                <label class="label" for="app-hypothesis-edit">MVP Hypothesis</label>
                <textarea id="app-hypothesis-edit" data-app-id="${app.id}" rows="3">${app.mvpHypothesis || ''}</textarea>
                <label class="label" for="app-technical-edit">Technical Implementation</label>
                <textarea id="app-technical-edit" data-app-id="${app.id}" rows="3">${app.technicalDetails || ''}</textarea>
                <button class="btn btn-secondary" id="update-app-overview-btn" data-app-id="${app.id}">Save Product Narrative</button>
            </div>
            <div class="editable-dates-grid">
                <div>
                    <label class="label">Idea Date</label>
                    <input type="date" value="${app.ideaDate || ''}" data-app-id="${app.id}" data-date-type="ideaDate">
                </div>
                <div>
                    <label class="label">MVP Date</label>
                    <input type="date" value="${app.mvpDate || ''}" data-app-id="${app.id}" data-date-type="mvpDate">
                </div>
                <div>
                    <label class="label">Shipped Date</label>
                    <input type="date" value="${app.shippedDate || ''}" data-app-id="${app.id}" data-date-type="shippedDate">
                </div>
            </div>
            <div class="card">
                <h4>Success Metrics</h4>
                <div class="form-grid">
                    <div>
                        <label class="label">Time Saved per User (hours)</label>
                        <input type="number" id="metric-hours-per-user" value="${latestHours}" step="any">
                    </div>
                    <div>
                        <label class="label">Number of Users</label>
                        <input type="number" id="metric-num-users" value="${latestUsers}">
                    </div>
                    <div>
                        <label class="label">User Satisfaction (1-10)</label>
                        <input type="number" id="metric-satisfaction" value="${app.metrics.satisfaction || 5}" min="1" max="10">
                    </div>
                </div>
                <button class="btn btn-success" id="save-app-metrics-btn">Save Metrics</button>
                <div class="metric-history-grid">
                    <div>
                        <strong>Hours Saved History</strong>
                        <div class="metric-history-log">
                            <ul>
                                ${
                                    app.metrics.timeSavedPerUserHistory.length
                                        ? app.metrics.timeSavedPerUserHistory
                                              .map(entry => `<li>${entry.date}: ${entry.value} hours</li>`)
                                              .join('')
                                        : '<li>No history yet.</li>'
                                }
                            </ul>
                        </div>
                    </div>
                    <div>
                        <strong>User Count History</strong>
                        <div class="metric-history-log">
                            <ul>
                                ${
                                    app.metrics.numUsersHistory.length
                                        ? app.metrics.numUsersHistory
                                              .map(entry => `<li>${entry.date}: ${entry.value} users</li>`)
                                              .join('')
                                        : '<li>No history yet.</li>'
                                }
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
            <div>
                <h4>Objectives and Key Results</h4>
                <button class="btn btn-primary" data-action="add-objective">+ Add Objective</button>
                ${
                    app.okrs?.length
                        ? app.okrs.map(renderOkrCard).join('')
                        : '<p>No OKRs yet. Add an objective to get started.</p>'
                }
            </div>`;

        if (app.okrs?.length) {
            app.okrs.flatMap(okr => okr.keyResults || []).forEach(createKrChart);
        }
    } else {
        layout.classList.remove('details-visible');
    }
}

function renderOkrCard(okr) {
    return `
        <div class="okr-card" data-okr-id="${okr.id}">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h4 style="margin:0; border:none;">Objective: ${okr.objective}</h4>
                <button class="btn btn-primary" data-action="open-kr-modal" data-okr-id="${okr.id}">+ Add Key Result</button>
            </div>
            <div style="margin-top:15px;">
                ${
                    (okr.keyResults || []).length
                        ? okr.keyResults.map(renderKrItem).join('')
                        : '<p style="font-size:0.9em; color:#666;">No Key Results for this objective yet.</p>'
                }
            </div>
        </div>`;
}

function renderKrItem(kr) {
    const progress = getKrProgress(kr);
    return `
        <div class="kr-item" data-kr-id="${kr.id}">
            <strong>KR:</strong> ${kr.text} (Target: ${kr.targetValue} ${kr.unit || ''})
            <div class="progress-bar">
                <div class="progress-bar-inner" style="width: ${progress}%;">${progress.toFixed(0)}%</div>
            </div>
            <div class="kr-details-grid">
                <div><canvas id="kr-chart-${kr.id}"></canvas></div>
                <div>
                    <form data-action="log-measurement" data-kr-id="${kr.id}">
                        <label>Log New Measurement:</label>
                        <input type="number" name="value" placeholder="Current Value" required step="any">
                        <input type="date" name="date" value="${new Date().toISOString().split('T')[0]}" required>
                        <button class="btn btn-success" type="submit">Log</button>
                    </form>
                    <div class="measurement-log">
                        <strong>Log:</strong>
                        <ul>
                            ${
                                kr.measurements?.length
                                    ? [...kr.measurements]
                                          .slice(-5)
                                          .reverse()
                                          .map(measurement => `<li>${measurement.date}: ${measurement.value} ${kr.unit || ''}</li>`)
                                          .join('')
                                    : '<li>No measurements yet.</li>'
                            }
                        </ul>
                    </div>
                </div>
            </div>
        </div>`;
}

function createKrChart(kr) {
    const canvas = document.getElementById(`kr-chart-${kr.id}`);
    if (!canvas || !kr.measurements || kr.measurements.length === 0) return;
    const ctx = canvas.getContext('2d');
    const sortedMeasurements = [...kr.measurements].sort(
        (a, b) => new Date(a.date) - new Date(b.date)
    );
    charts[kr.id] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sortedMeasurements.map(m => m.date),
            datasets: [
                {
                    label: 'Progress',
                    data: sortedMeasurements.map(m => m.value),
                    borderColor: 'rgba(0, 48, 135, 1)',
                    fill: true,
                    tension: 0.1
                },
                {
                    label: 'Target',
                    data: Array(sortedMeasurements.length).fill(kr.targetValue),
                    borderColor: 'rgba(217, 83, 79, 1)',
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
}

function showDashboardOverview() {
    destroyCharts();
    renderDashboardAppOverview();
}

function focusView(viewId) {
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.view === viewId);
    });
    document.querySelectorAll('.view').forEach(view => {
        view.classList.toggle('active', view.id === viewId);
    });
}

function hydrateBuilderOptions(selectElement) {
    const state = getState();
    selectElement.innerHTML = state.sailors
        .map(sailor => `<option value="${sailor.id}">${sailor.name}</option>`)
        .join('');
}

global.AppRenderer = {
    render,
    showDashboardOverview,
    focusView,
    hydrateBuilderOptions
};
})(window);
