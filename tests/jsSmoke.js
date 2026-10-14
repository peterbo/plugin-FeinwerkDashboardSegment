/**
 * JS bootstrap smoke test (run: `node tests/jsSmoke.js` from the plugin dir).
 *
 * Executes javascripts/dashboardSegment.js with stubbed Matomo globals to catch runtime errors in
 * the load/bootstrap path AND inside the async .then() callbacks (enterDashboard -> fetchSettings ->
 * applyAfterFetch ...). The ajaxHelper stub returns REAL resolved promises so
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
    o.hasClass = function () { return false; };
    o.dashboard = function () { return ''; };
    return o;
}
var $ = function (arg) {
    if (typeof arg === 'function') { arg(); return; }
    var o = jq();
    if (arg === global.document) {
        o.on = function (ev, fn) { (window.__docHandlers[ev] = window.__docHandlers[ev] || []).push(fn); return o; };
    }
    return o;
};
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
window.broadcast = {
    getValueFromHash: function () { return '1'; }, getValueFromUrl: function () { return '1'; },
    propagateNewPage: function () {}
};
// The segment is driven through CoreHome.MatomoUrl (hash-only update, NO page reload), exactly as
// Matomo's own selector does on a reporting page. updateHash sets the hash without re-bootstrapping
// the script, so the plugin's in-memory state survives.
window.__updateHashCalls = [];
window.CoreHome = {
    MatomoUrl: {
        hashParsed: { value: { period: 'day', date: 'today', segment: '' } },
        updateHash: function (params) {
            window.__updateHashCalls.push(params.segment);        // the segment we set (raw)
            window.CoreHome.MatomoUrl.hashParsed.value = params;  // hash now reflects it; state survives
        }
    }
};
window.piwik = { idSite: 1, token_auth: 't', userLogin: 'tester', on: function () {} };
window.widgetsHelper = { loadWidgetAjax: function () {} };
window.ajaxHelper = function () {
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
window.__docHandlers = {};
global.document = {
    createTextNode: function () { return {}; },
    getElementById: function () { return {}; }
};

require('../javascripts/dashboardSegment.js');

var DS = window.FeinwerkDashboardSegment;
DS.settings = {
    widgets: { x: { segment: { action: 'set', segment: 'a==b' }, period: { period: 'range', date: 'last30' } } },
    defaultAction: null
};
DS.actionFor('x'); DS.periodFor('x'); DS.currentWidgetValue('x'); DS.currentDefaultValue();
DS.currentPeriodKey('x'); DS.hasAnySettings(); DS.segmentName('a==b'); DS.defaultLabel();

// ---- dashboard default -> global segment helpers (raw/decoded values via MatomoUrl) ----
var MU = window.CoreHome.MatomoUrl;
function setHashSeg(s) { MU.hashParsed.value = { period: 'day', date: 'today', segment: s }; }
// __none__ default clears the global segment and captures the baseline (raw)
DS.baselineSegment = null; DS.appliedSegment = null; setHashSeg('browserCode==ff'); window.__updateHashCalls = [];
DS.settings = { widgets: {}, defaultAction: { action: 'remove' } };
if (DS.syncGlobalSegmentForDashboard() !== true || window.__updateHashCalls[0] !== '') { throw new Error('none-default should clear global'); }
if (DS.baselineSegment !== 'browserCode==ff') { throw new Error('baseline not captured'); }
// a set default applies the RAW definition via updateHash
DS.baselineSegment = null; DS.appliedSegment = null; setHashSeg(''); window.__updateHashCalls = [];
DS.settings = { widgets: {}, defaultAction: { action: 'set', segment: 'referrerType==search' } };
DS.syncGlobalSegmentForDashboard();
if (window.__updateHashCalls[0] !== 'referrerType==search') { throw new Error('set default should apply the raw definition'); }
// redundant-apply guard: hash already reflects it -> no updateHash
window.__updateHashCalls = [];
if (DS.syncGlobalSegmentForDashboard() !== false || window.__updateHashCalls.length !== 0) { throw new Error('should not re-apply when already correct'); }
// no loop: a same-dashboard re-entry (hash already reflects it) must not re-apply
DS.baselineSegment = null; DS.appliedSegment = null; setHashSeg(''); window.__updateHashCalls = [];
DS.settings = { widgets: {}, defaultAction: { action: 'set', segment: 'referrerType==search' } };
DS.syncGlobalSegmentForDashboard();            // applies; hash now reflects it
window.__updateHashCalls = [];
if (DS.syncGlobalSegmentForDashboard() !== false || window.__updateHashCalls.length !== 0) { throw new Error('re-entry must not re-apply'); }
// CRITICAL regression: applying a default must NOT corrupt the baseline, and leaving a no-default
// dashboard restores the user's TRUE prior segment (not the applied default). State survives because
// updateHash does not reload the page.
DS.baselineSegment = null; DS.appliedSegment = null; setHashSeg('');   // user's real segment = all data
DS.settings = { widgets: {}, defaultAction: { action: 'set', segment: 'referrerType==search' } };
DS.syncGlobalSegmentForDashboard();                                    // open D1 (default B)
if (DS.baselineSegment !== '') { throw new Error('baseline corrupted by applying a default'); }
DS.settings = { widgets: {}, defaultAction: null };                    // switch to D2 (no default)
DS.syncGlobalSegmentForDashboard();
if (MU.hashParsed.value.segment !== '') { throw new Error('leaving a no-default dashboard must restore the TRUE baseline'); }
if (DS.appliedSegment !== null) { throw new Error('appliedSegment not reset after restore'); }
console.log('SMOKE OK: global-segment helpers');
// leave a clean slate for the bootstrap's async chain below
DS.baselineSegment = null; DS.appliedSegment = null; setHashSeg(''); window.__updateHashCalls = [];

// ---- read-only marker published by the Sharing plugin ----
if (DS.isReadOnlyDashboard() !== false) { throw new Error('must not be read-only without the marker'); }
window.FeinwerkDashboardSharing = { readOnly: true };
if (DS.isReadOnlyDashboard() !== true) { throw new Error('must be read-only once the Sharing marker is set'); }
delete window.FeinwerkDashboardSharing;
if (DS.isReadOnlyDashboard() !== false) { throw new Error('marker removal must clear read-only'); }
// no removed sharing API may be left behind
['injectShareControls', 'showLinkedBanner', 'decorateTabs', 'renderMyShares', 'openShareDialog']
    .forEach(function (n) { if (DS[n] !== undefined) { throw new Error('sharing remnant: ' + n); } });
if (require('fs').readFileSync(__dirname + '/../javascripts/dashboardSegment.js', 'utf8')
    .match(/getLinkInfo|syncLinkedDashboard|getMyShares|subscribeToShare|shareDashboard/)) {
    throw new Error('sharing endpoint still referenced');
}
console.log('SMOKE OK: read-only marker');

// ---- fwsh:readonlychange handler actually runs (both directions), no throw, removes the controls ----
var removed = [];
var reloads = [];
window.broadcast = { getValueFromHash: function () { return '5'; }, getValueFromUrl: function () { return ''; } };
var origQ = window.$;
window.$ = function (arg) {
    var o = origQ(arg);
    if (typeof arg === 'string') {
        o.remove = function () { removed.push(arg); return o; };
        o.each = function (fn) { fn.call({}); fn.call({}); return o; }; // two fake widgets: must not abort
        if (arg === '#dashboardWidgetsArea') {
            Object.defineProperty(o, 'length', { value: 1 });
            o.dashboard = function () { reloads.push(Array.prototype.slice.call(arguments)); return o; };
        }
    }
    return o;
};
window.$.extend = origQ.extend; window.$.Deferred = origQ.Deferred;
var handlers = window.__docHandlers['fwsh:readonlychange'] || [];
if (handlers.length !== 1) { throw new Error('fwsh:readonlychange handler not registered'); }
window.FeinwerkDashboardSharing = { readOnly: true };
handlers[0]();
if (removed.indexOf('.dashboardSegmentButton, .dashboardPeriodButton') === -1 || removed.indexOf('#dashboardSegmentDefault') === -1) {
    throw new Error('read-only change must remove pickers and default control: ' + removed.join('|'));
}
window.FeinwerkDashboardSharing = { readOnly: false };
handlers[0](); // true -> false: genuine transition must rebuild
if (reloads.length !== 1 || reloads[0][0] !== 'loadDashboard') { throw new Error('true->false must reload the dashboard once: ' + JSON.stringify(reloads)); }
reloads.length = 0;
handlers[0](); // false -> false (normal open): must NOT reload
if (reloads.length !== 0) { throw new Error('false->false must not reload the dashboard'); }
delete window.broadcast;
window.$ = origQ;
delete window.FeinwerkDashboardSharing;
console.log('SMOKE OK: fwsh:readonlychange handler');

// let the bootstrap's async .then() chain (enterDashboard -> fetchSettings -> applyAfterFetch) run
setTimeout(function () {
    console.log('SMOKE OK: bootstrap + async callback chain ran with no error');
}, 60);
