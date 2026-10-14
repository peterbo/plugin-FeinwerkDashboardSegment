/**
 * Anonymous viewers (run: `node tests/jsAnonymous.js` from the plugin dir): public dashboards are
 * viewed without login, and every endpoint of this plugin requires one. The script must stay idle:
 * no requests, no wrapped widget loader, no controls.
 *
 * Executes javascripts/dashboardSegment.js with stubbed Matomo globals to catch runtime errors in
 * the load/bootstrap path AND inside the async .then() callbacks (enterDashboard -> getLinkInfo ->
 * applyAfterFetch -> injectShareControls ...). The ajaxHelper stub returns REAL resolved promises so
 * those callbacks actually run; unhandled errors fail the test. `node --check` only checks syntax.
 */
process.on('unhandledRejection', function (e) { console.error('UNHANDLED REJECTION:', e); process.exit(1); });
process.on('uncaughtException', function (e) { console.error('UNCAUGHT:', e); process.exit(1); });

function jq() {
    var o = function () { return o; };
    var methods = ['find', 'first', 'each', 'on', 'one', 'attr', 'append', 'prepend', 'after',
        'before', 'next', 'remove', 'text', 'addClass', 'hide', 'show', 'empty', 'css', 'offset',
        'outerHeight', 'height', 'dashboardWidget', 'dashboard', 'data', 'trigger', 'map', 'filter',
        'val', 'prop', 'is'];
    methods.forEach(function (m) { o[m] = function () { return o; }; });
    o.length = 0;
    o.each = function () { return o; };
    o.offset = function () { return { top: 0, left: 0 }; };
    o.outerHeight = function () { return 0; };
    o.attr = function () { return ''; };
    o.val = function () { return ''; };
    o.is = function () { return false; };
    o.dashboard = function () { return ''; };
    return o;
}
var $ = function (arg) { if (typeof arg === 'function') { arg(); return; } return jq(); };
$.extend = Object.assign;
$.Deferred = function () {
    var d = {
        resolve: function () { return d; }, reject: function () { return d; },
        promise: function () { return Promise.resolve([]); }
    };
    return d;
};
global.window = {};
window.console = console;
window.$ = $; window.jQuery = $;
window.broadcast = { getValueFromHash: function () { return '1'; }, getValueFromUrl: function () { return '1'; } };
window.piwik = { idSite: 1, token_auth: 't', userLogin: 'anonymous', on: function () {} };
var originalLoader = function () {};
window.widgetsHelper = { loadWidgetAjax: originalLoader };
var requests = 0;
window.ajaxHelper = function () {
    requests++;
    return {
        addParams: function () {}, withTokenInUrl: function () {}, setFormat: function () {},
        // real promise so .then(onOk, onFail) callbacks actually execute; [] is safe for all callers
        send: function () { return Promise.resolve([]); }
    };
};
global._pk_translate = function (k) { return k; };
window.setTimeout = function (fn) { return setTimeout(fn, 0); };
window.clearTimeout = function (t) { return clearTimeout(t); };
window.MutationObserver = function () { return { observe: function () {} }; };
global.document = {
    createTextNode: function () { return {}; },
    getElementById: function () { return {}; }
};

require('../javascripts/dashboardSegment.js');

setTimeout(function () {
    if (requests !== 0) { console.error('FAIL: ' + requests + ' request(s) sent for an anonymous viewer'); process.exit(1); }
    if (window.widgetsHelper.loadWidgetAjax !== originalLoader) { console.error('FAIL: widget loader wrapped for an anonymous viewer'); process.exit(1); }
    console.log('ANONYMOUS OK: no requests, widget loader untouched');
}, 60);
