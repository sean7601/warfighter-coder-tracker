(function (global) {
    function initializeApp() {
        global.AppState.loadState();
        global.AppEvents.registerEventHandlers();
        global.AppRenderer.render();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApp, { once: true });
    } else {
        initializeApp();
    }
})(window);
