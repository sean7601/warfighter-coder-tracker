(function (global) {
    const DB_KEY = 'warfighterCoderTrackerDataV3';

    const defaultState = {
        sailors: [],
        apps: [],
        checkins: []
    };

    let state = cloneDefaultState();

    function cloneDefaultState() {
        return JSON.parse(JSON.stringify(defaultState));
    }

    function getState() {
        return state;
    }

    function setState(nextState, { persist = false } = {}) {
        state = nextState;
        migrateStateData();
        if (persist) {
            saveState();
        }
    }

    function resetState() {
        state = cloneDefaultState();
        saveState();
    }

    function saveState() {
        localStorage.setItem(DB_KEY, JSON.stringify(state));
    }

    function loadState() {
        const data = localStorage.getItem(DB_KEY);
        if (data) {
            try {
                state = JSON.parse(data);
                migrateStateData();
            } catch (err) {
                console.error('Failed to parse saved tracker state', err);
                state = cloneDefaultState();
            }
        } else {
            state = cloneDefaultState();
        }
        return state;
    }

    function migrateStateData() {
        if (!state.checkins) state.checkins = [];
        if (!state.apps) state.apps = [];
        state.checkins.forEach(checkin => {
            if (!checkin.format) {
                checkin.format = 'Unspecified format';
            }
        });
        state.apps.forEach(app => {
            if (!app.metrics) app.metrics = {};
            if (!app.metrics.timeSavedPerUserHistory) app.metrics.timeSavedPerUserHistory = [];
            if (!app.metrics.numUsersHistory) app.metrics.numUsersHistory = [];
            if (typeof app.metrics.satisfaction !== 'number') app.metrics.satisfaction = 5;
            if (!app.ideaDate) app.ideaDate = app.creationDate || new Date().toISOString().split('T')[0];
            if (!app.mvpDate && app.status === 'MVP') app.mvpDate = app.ideaDate;
            if (!app.shippedDate && app.status === 'Shipped') app.shippedDate = app.mvpDate || app.ideaDate;
            if (!app.okrs) app.okrs = [];
            if (!app.jobToBeDone) app.jobToBeDone = '';
            if (!app.mvpHypothesis) app.mvpHypothesis = '';
            if (!app.technicalDetails) app.technicalDetails = '';
            if (!app.description) app.description = '';
        });
    }

    function importState(importedState) {
        if (!importedState || typeof importedState !== 'object') {
            throw new Error('Invalid data format');
        }
        const { sailors, apps, checkins } = importedState;
        if (!Array.isArray(sailors) || !Array.isArray(apps)) {
            throw new Error('Import failed: Invalid data file structure.');
        }
        state = {
            sailors,
            apps,
            checkins: Array.isArray(checkins) ? checkins : []
        };
        migrateStateData();
        saveState();
    }

    function exportState() {
        return JSON.stringify(state, null, 2);
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    function findSailorById(id) {
        return getState().sailors.find(sailor => sailor.id === id);
    }

    function findAppById(id) {
        return getState().apps.find(app => app.id === id);
    }

    global.AppState = {
        getState,
        setState,
        resetState,
        saveState,
        loadState,
        migrateStateData,
        importState,
        exportState,
        generateId,
        findSailorById,
        findAppById
    };
})(window);
