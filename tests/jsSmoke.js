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
    getValueFromHash: function (k) { return k === 'category' ? 'Dashboard_Dashboard' : '1'; }, getValueFromUrl: function () { return ''; },
    propagateNewPage: function () {}
};
// The segment is driven through CoreHome.MatomoUrl (hash-only update, NO page reload), exactly as
// Matomo's own selector does on a reporting page. updateHash sets the hash without re-bootstrapping
// the script, so the plugin's in-memory state survives.
window.__updateHashCalls = [];
window.CoreHome = {
    MatomoUrl: {
        hashParsed: { value: { period: 'day', date: 'today', segment: '' } },
        urlParsed: { value: {} },                                  // the query string part of the URL
        // what Matomo's pages go by: the hash wins, and an empty hash segment lets the query string's one show through
        get parsed() {
            var u = this.urlParsed.value, h = this.hashParsed.value;
            return { value: Object.assign({}, u, h, { segment: h.segment || u.segment || '' }) };
        },
        updateHash: function (params) {
            window.__updateHashCalls.push(params.segment);        // the segment we set (raw)
            window.CoreHome.MatomoUrl.hashParsed.value = params;  // hash now reflects it; state survives
        }
    }
};
window.__piwikHandlers = {};
window.piwik = {
    idSite: 1, token_auth: 't', userLogin: 'tester',
    on: function (name, fn) { (window.__piwikHandlers[name] = window.__piwikHandlers[name] || []).push(fn); }
};
function postPiwikEvent(name) { (window.__piwikHandlers[name] || []).forEach(function (fn) { fn(); }); }
// the widget requests that actually go out (the plugin wraps this at bootstrap), with their segment
window.__widgetLoads = [];
window.widgetsHelper = { loadWidgetAjax: function (id, params) { window.__widgetLoads.push((params && params.segment) || ''); return { sent: true }; } };
window.ajaxHelper = function () {
    return {
        addParams: function () {}, withTokenInUrl: function () {}, setFormat: function () {}, setErrorCallback: function () {},
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
postPiwikEvent('Dashboard.Dashboard.mounted'); // dashboard 1 has rendered
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
window.broadcast = { getValueFromHash: function (k) { return k === 'category' ? 'Dashboard_Dashboard' : '5'; }, getValueFromUrl: function () { return ''; } };
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

// ---- the dashboard default control goes into the slot above the widgets (Matomo >= 5.14.1 and 6) ----
function injectDefaultWith(slotPresent) {
    var placed = [];
    window.$ = function (arg) {
        var o = origQ(arg);
        if (arg === '#dashboardWidgetsArea' || (arg === '#fwds-default-slot' && slotPresent)) {
            Object.defineProperty(o, 'length', { value: 1 });
            o.before = function () { placed.push('before ' + arg); return o; };
            o.append = function () { placed.push('append ' + arg); return o; };
        }
        return o;
    };
    window.$.extend = origQ.extend; window.$.Deferred = origQ.Deferred;
    DS.injectDefaultControl();
    window.$ = origQ;
    return JSON.stringify(placed);
}
if (injectDefaultWith(true) !== '["append #fwds-default-slot"]') { throw new Error('default control must go into the slot: ' + injectDefaultWith(true)); }
if (injectDefaultWith(false) !== '["before #dashboardWidgetsArea"]') { throw new Error('without a slot the control goes above the widgets: ' + injectDefaultWith(false)); }
console.log('SMOKE OK: default control in the dashboard slot, fallback above the widgets');

// ---- a failed save resolves false and never leaves an unhandled rejection ----
// (ajaxHelper.send() rejects on a failed request, e.g. an HTTP 400.) The plugin shows its own notification, so core's
// generic error box is switched off for the save; a save whose refetch fails tells the user to reload.
var okAjax = window.ajaxHelper;
var quietActions = [];
var notified = [];
function ajaxFailing(pattern) {
    return function () {
        var action = '';
        return {
            addParams: function (p) { if (p && p.action) { action = p.action; } },
            withTokenInUrl: function () {}, setFormat: function () {},
            setErrorCallback: function (cb) { if (cb === null) { quietActions.push(action); } },
            send: function () { return pattern.test(action) ? Promise.reject({ status: 400 }) : Promise.resolve([]); }
        };
    };
}
var realConsole = window.console;
window.console = { error: function (prefix, message) { notified.push(message); }, log: realConsole.log, warn: realConsole.warn };
window.ajaxHelper = ajaxFailing(/^save/);
DS.idDashboard = 5;
Promise.all([DS.saveWidget('x', 'a==b'), DS.saveWidgetPeriod('x', 'last7'), DS.saveDefault('a==b')]).then(function (failed) {
    if (failed.some(function (r) { return r !== false; })) { throw new Error('a failed save must resolve false: ' + JSON.stringify(failed)); }
    if (quietActions.join() !== 'saveWidgetSegment,saveWidgetPeriod,saveDashboardDefault') {
        throw new Error('saves must switch off core\'s generic error box: ' + JSON.stringify(quietActions));
    }
    if (notified.join() !== 'FeinwerkDashboardSegment_SaveError,FeinwerkDashboardSegment_SaveError,FeinwerkDashboardSegment_SaveError') {
        throw new Error('each failed save must show the plugin notification: ' + JSON.stringify(notified));
    }
    // saved, but re-reading the settings fails: false, and a hint to reload
    notified = []; quietActions = [];
    window.ajaxHelper = ajaxFailing(/^getSettings$/);
    window.broadcast = { getValueFromHash: function (k) { return k === 'category' ? 'Dashboard_Dashboard' : '5'; }, getValueFromUrl: function () { return ''; } };
    DS.idDashboard = 5;
    return DS.saveWidget('x', 'a==b');
}).then(function (savedButNotReread) {
    delete window.broadcast;
    if (savedButNotReread !== false || notified.join() !== 'FeinwerkDashboardSegment_SavedReloadHint') {
        throw new Error('a failed refetch after a save must resolve false and show the reload hint: ' + savedButNotReread + ' ' + JSON.stringify(notified));
    }
    window.console = realConsole;
    window.ajaxHelper = okAjax;
    DS.idDashboard = 5;
    return Promise.all([DS.saveWidget('x', 'a==b'), DS.saveWidgetPeriod('x', 'last7'), DS.saveDefault('a==b')]);
}).then(function (saved) {
    if (saved.some(function (r) { return r !== true; })) { throw new Error('a successful save must resolve true: ' + JSON.stringify(saved)); }
    console.log('SMOKE OK: failed saves resolve false with the plugin notification only, failed refetch asks to reload');
});

// ---- on a dashboard that is still loading, the global segment waits until it has rendered ----
// (Matomo aborts pending requests on every URL change; aborting the dashboard's own load leaves it empty.)
window.broadcast = { getValueFromHash: function (k) { return k === 'category' ? 'Dashboard_Dashboard' : '7'; }, getValueFromUrl: function () { return ''; } };
DS.baselineSegment = null; DS.appliedSegment = null; setHashSeg(''); window.__updateHashCalls = [];
DS.settings = { widgets: {}, defaultAction: { action: 'set', segment: 'browserCode==ff' } };
if (DS.syncGlobalSegmentForDashboard() !== true || window.__updateHashCalls.length !== 0) {
    throw new Error('the global segment must wait until dashboard 7 has rendered: ' + JSON.stringify(window.__updateHashCalls));
}
postPiwikEvent('Dashboard.Dashboard.mounted');
delete window.broadcast;
setTimeout(function () {
    if (window.__updateHashCalls.join('|') !== 'browserCode==ff') {
        throw new Error('the global segment must be applied once the dashboard has rendered: ' + JSON.stringify(window.__updateHashCalls));
    }
    console.log('SMOKE OK: global segment changed only after the dashboard has rendered');
}, 20);

// let the bootstrap's async .then() chain (enterDashboard -> fetchSettings -> applyAfterFetch) run
setTimeout(function () {
    console.log('SMOKE OK: bootstrap + async callback chain ran with no error');
}, 60);

// ---- a deferred restore of the user's segment stays owed across context changes ----
// Dashboard A has default X; the user opens B (no default) and leaves it before B has rendered. The restore of the
// previous segment, deferred while B loads, must still happen on the next page (report page or dashboard C).
setTimeout(function () {
    var dash = null;                                        // dashboard id in the URL hash (null = report page)
    var defaults = { 11: { action: 'set', segment: 'browserCode==ff' } };   // A = 11 has a default, B/C none
    window.broadcast = {
        getValueFromHash: function (k) { return dash === null ? '' : ({ category: 'Dashboard_Dashboard', subcategory: String(dash) })[k] || ''; },
        getValueFromUrl: function () { return ''; }
    };
    window.ajaxHelper = function () {
        var get = {};
        return {
            addParams: function (p, where) { if (where === 'get') { Object.assign(get, p); } },
            withTokenInUrl: function () {}, setFormat: function () {}, setErrorCallback: function () {},
            send: function () {
                if (get.action === 'getSettings') {
                    return Promise.resolve({ widgets: {}, defaultAction: defaults[get.idDashboard] || null });
                }
                return Promise.resolve([]);
            }
        };
    };
    function wait() { return new Promise(function (r) { setTimeout(r, 10); }); }
    function go(id) { dash = id; postPiwikEvent('Dashboard.loadDashboard'); return wait(); } // context change
    function scenario(label, next) {
        DS.baselineSegment = null; DS.appliedSegment = null; setHashSeg('');
        return go(11)                                       // open A (not rendered yet: default deferred)
            .then(function () { postPiwikEvent('Dashboard.Dashboard.mounted'); return wait(); })
            .then(function () {
                if (MU.hashParsed.value.segment !== 'browserCode==ff') { throw new Error(label + ': A must apply its default'); }
                return go(12);                              // open B (no default): restore deferred until B renders
            })
            .then(function () {
                if (MU.hashParsed.value.segment !== 'browserCode==ff') { throw new Error(label + ': restore must wait for B'); }
                return next();                               // leave B before it has rendered
            })
            .then(function () {
                if (MU.hashParsed.value.segment !== '') {
                    throw new Error(label + ': the previous segment must come back, hash segment is ' + JSON.stringify(MU.hashParsed.value.segment));
                }
            });
    }
    scenario('A -> B -> report page', function () { return go(null); })
        .then(function () {
            return scenario('A -> B -> dashboard C', function () {
                return go(13).then(function () { postPiwikEvent('Dashboard.Dashboard.mounted'); return wait(); });
            });
        })
        .then(function () {
            return scenario('A -> B -> B renders', function () { postPiwikEvent('Dashboard.Dashboard.mounted'); return wait(); });
        })
        .then(function () {
            delete window.broadcast;
            console.log('SMOKE OK: a deferred restore of the previous segment survives leaving the dashboard early');
        });
}, 150);

// ---- a change still waiting for a loading dashboard gives way to a later decision or to the user ----
// ---- and a re-synced subscribed copy reads its per-widget overrides again (fwsh:synced) ----
setTimeout(function () {
    var dash = null;
    var server = {};                                         // getSettings answer per dashboard id
    var hold = false;                                        // true: answers wait for release()
    var held = [];
    var settingsCalls = 0;
    window.broadcast = {
        getValueFromHash: function (k) { return dash === null ? '' : ({ category: 'Dashboard_Dashboard', subcategory: String(dash) })[k] || ''; },
        getValueFromUrl: function () { return ''; }
    };
    window.ajaxHelper = function () {
        var get = {};
        return {
            addParams: function (p, where) { if (where === 'get') { Object.assign(get, p); } },
            withTokenInUrl: function () {}, setFormat: function () {}, setErrorCallback: function () {},
            send: function () {
                if (get.action !== 'getSettings') { return Promise.resolve([]); }
                settingsCalls++;
                var data = JSON.parse(JSON.stringify(server[get.idDashboard] || { widgets: {}, defaultAction: null }));
                if (!hold) { return Promise.resolve(data); }
                return new Promise(function (resolve) { held.push(function () { resolve(data); }); });
            }
        };
    };
    function wait() { return new Promise(function (r) { setTimeout(r, 10); }); }
    function go(id) { dash = id; postPiwikEvent('Dashboard.loadDashboard'); return wait(); }
    function mounted() { postPiwikEvent('Dashboard.Dashboard.mounted'); return wait(); }
    function seg() { return MU.hashParsed.value.segment; }
    function release() { var fns = held; held = []; fns.forEach(function (fn) { fn(); }); return wait(); }
    var X = { action: 'set', segment: 'browserCode==ff' };

    function openAThenB() {                                  // A = 31 (default X), B = 32 (no default)
        server = { 31: { widgets: {}, defaultAction: X } };
        DS.baselineSegment = null; DS.appliedSegment = null; setHashSeg('');
        return go(31).then(mounted).then(function () {
            if (seg() !== 'browserCode==ff') { throw new Error('A must apply its default'); }
            return go(32);                                   // the restore waits until B has rendered
        });
    }
    openAThenB()
        .then(function () {
            // before B has rendered, the user makes X B's default: the hash shows X already, nothing to change
            DS.settings = { widgets: {}, defaultAction: X };
            if (DS.syncGlobalSegmentForDashboard() !== false) { throw new Error('nothing to change when the hash already shows the default'); }
            return mounted();
        })
        .then(function () {
            if (seg() !== 'browserCode==ff') { throw new Error('B\'s new default must stand once B renders, hash segment is ' + JSON.stringify(seg())); }
            return openAThenB();
        })
        .then(function () { setHashSeg('browserCode==chrome'); return mounted(); })  // picked by hand while B loads
        .then(function () {
            if (seg() !== 'browserCode==chrome') { throw new Error('a segment picked by hand while the dashboard loads must stand, hash segment is ' + JSON.stringify(seg())); }
            return go(null);
        })
        .then(function () {
            if (seg() !== 'browserCode==chrome') { throw new Error('the hand-picked segment must stand on the next page'); }
            DS.baselineSegment = null; DS.appliedSegment = null; setHashSeg('');
            return go(31);                                   // fresh load of A: its default waits for the render
        })
        .then(function () { setHashSeg('browserCode==chrome'); return mounted(); })
        .then(function () {
            if (seg() !== 'browserCode==chrome') { throw new Error('a hand-picked segment must win over a default still waiting, hash segment is ' + JSON.stringify(seg())); }
            server = { 35: { widgets: {}, defaultAction: X } };
            DS.baselineSegment = null; DS.appliedSegment = null; setHashSeg('');
            return go(35);                                   // fresh load: default X waits for the render
        })
        .then(function () {
            // before it has rendered, the user switches the default back to "inherit": nothing to restore
            DS.settings = { widgets: {}, defaultAction: null };
            if (DS.syncGlobalSegmentForDashboard() !== false) { throw new Error('nothing to restore before the default was applied'); }
            return mounted();
        })
        .then(function () {
            if (seg() !== '') { throw new Error('a default removed before the dashboard rendered must not be applied, hash segment is ' + JSON.stringify(seg())); }
            console.log('SMOKE OK: a change waiting for a loading dashboard gives way to a later decision or a hand-picked segment');

            // ---- fwsh:synced ----
            var handlers = window.__docHandlers['fwsh:synced'] || [];
            if (handlers.length !== 1) { throw new Error('fwsh:synced handler not registered'); }
            var synced = function (id) { handlers[0]({}, id); return wait(); };
            var realReloadAll = DS.reloadAllWidgets;
            var reloadsAll = 0;
            DS.reloadAllWidgets = function () { reloadsAll++; };
            window.FeinwerkDashboardSharing = { readOnly: true };
            server = { 41: { widgets: { w1: { segment: { action: 'set', segment: 'a==b' } } }, defaultAction: null } };
            DS.baselineSegment = null; DS.appliedSegment = null; setHashSeg('');
            return go(41).then(mounted).then(function () {
                var calls = settingsCalls;
                return synced(99).then(function () {
                    if (settingsCalls !== calls) { throw new Error('a sync of another dashboard must not re-read the settings'); }
                    // the owner changed w1's segment and set a default; Sharing reloads the copy
                    server[41] = { widgets: { w1: { segment: { action: 'set', segment: 'c==d' } } }, defaultAction: { action: 'set', segment: 'browserCode==ie' } };
                    window.__updateHashCalls = [];
                    return synced(41);
                }).then(function () {
                    if (DS.entryFor('w1').segment.segment !== 'c==d') { throw new Error('fwsh:synced must re-read the overrides'); }
                    if (window.__updateHashCalls.length !== 0) { throw new Error('the new default must wait until the reloaded copy has rendered'); }
                    return mounted();
                }).then(function () {
                    if (seg() !== 'browserCode==ie') { throw new Error('the synced default must apply once the copy has rendered, hash segment is ' + JSON.stringify(seg())); }
                    // the copy renders again before the answer arrives: widgets loaded with the old overrides reload once
                    server[41].widgets.w1.segment.segment = 'e==f';
                    hold = true; reloadsAll = 0;
                    return synced(41).then(mounted).then(release);
                }).then(function () {
                    if (DS.entryFor('w1').segment.segment !== 'e==f' || reloadsAll !== 1) { throw new Error('changed overrides on a rendered copy must reload its widgets once: ' + reloadsAll); }
                    reloadsAll = 0;                       // unchanged overrides: no reload
                    return synced(41).then(mounted).then(release);
                }).then(function () {
                    if (reloadsAll !== 0) { throw new Error('unchanged overrides must not reload the widgets: ' + reloadsAll); }
                    // the answer arrives before the copy has rendered again: its widgets load with the new overrides
                    server[41].widgets.w1.segment.segment = 'g==h';
                    hold = false;
                    return synced(41).then(function () {
                        if (DS.entryFor('w1').segment.segment !== 'g==h' || reloadsAll !== 0) { throw new Error('a copy that has not rendered again must not reload its widgets: ' + reloadsAll); }
                        return mounted();
                    });
                }).then(function () {
                    // an older answer arriving after a newer one must not overwrite it
                    server[42] = { widgets: { w1: { segment: { action: 'set', segment: 'old==1' } } }, defaultAction: null };
                    hold = true;
                    return go(42);                        // the first read of 42 waits
                }).then(function () {
                    server[42].widgets.w1.segment.segment = 'new==1';
                    hold = false;
                    return synced(42);                    // the second read answers first
                }).then(release).then(function () {
                    if (DS.entryFor('w1').segment.segment !== 'new==1') { throw new Error('an older answer overwrote the newer settings: ' + DS.entryFor('w1').segment.segment); }
                    DS.reloadAllWidgets = realReloadAll;
                    delete window.FeinwerkDashboardSharing;
                    delete window.broadcast;
                    console.log('SMOKE OK: fwsh:synced re-reads the overrides of the re-synced copy');
                });
            });
        });
}, 500);

// ---- only dashboard pages count as dashboards: goal pages use numeric subcategories too ----
// ---- and an answer that arrives after the user left the dashboard is not applied to the next page ----
setTimeout(function () {
    var page = { category: '', subcategory: '' };
    var hold = false, held = [];
    var server = {
        61: { widgets: {}, defaultAction: { action: 'set', segment: 'browserCode==ff' } },
        3: { widgets: {}, defaultAction: { action: 'set', segment: 'browserCode==ff' } }
    };
    window.broadcast = { getValueFromHash: function (k) { return page[k] || ''; }, getValueFromUrl: function () { return ''; } };
    window.ajaxHelper = function () {
        var get = {};
        return {
            addParams: function (p, where) { if (where === 'get') { Object.assign(get, p); } },
            withTokenInUrl: function () {}, setFormat: function () {}, setErrorCallback: function () {},
            send: function () {
                if (get.action !== 'getSettings') { return Promise.resolve([]); }
                var data = JSON.parse(JSON.stringify(server[get.idDashboard] || { widgets: {}, defaultAction: null }));
                if (!hold) { return Promise.resolve(data); }
                return new Promise(function (resolve) { held.push(function () { resolve(data); }); });
            }
        };
    };
    function wait() { return new Promise(function (r) { setTimeout(r, 10); }); }
    function open(category, subcategory) { page = { category: category, subcategory: subcategory }; postPiwikEvent('Dashboard.loadDashboard'); return wait(); }
    function mounted() { postPiwikEvent('Dashboard.Dashboard.mounted'); return wait(); }
    function seg() { return MU.hashParsed.value.segment; }
    function start() { DS.baselineSegment = null; DS.appliedSegment = null; setHashSeg(''); }
    start();
    open('Dashboard_Dashboard', '61').then(mounted)
        .then(function () {
            if (seg() !== 'browserCode==ff') { throw new Error('dashboard 61 must apply its default'); }
            return open('Goals_Goals', '3');                 // goal 3: not a dashboard, although its subcategory is a number
        })
        .then(function () {
            if (seg() !== '') { throw new Error('leaving a dashboard for a goal page must restore the previous segment, hash segment is ' + JSON.stringify(seg())); }
            start();
            return open('Dashboard_Dashboard', '3').then(mounted);
        })
        .then(function () {
            if (seg() !== 'browserCode==ff') { throw new Error('dashboard 3 must apply its default'); }
            return open('Goals_Goals', '3');                 // dashboard 3 -> goal 3: same number, another page
        })
        .then(function () {
            if (seg() !== '') { throw new Error('dashboard 3 -> goal 3 must restore the previous segment, hash segment is ' + JSON.stringify(seg())); }
            start();
            hold = true;
            return open('Dashboard_Dashboard', '61');        // its settings are still on the way ...
        })
        .then(function () { hold = false; return open('General_Visitors', 'General_Overview'); })   // ... when the user leaves
        .then(function () { var fns = held; held = []; fns.forEach(function (fn) { fn(); }); return wait(); })
        .then(function () {
            if (seg() !== '') { throw new Error('an answer for a dashboard the user already left must not set its default, hash segment is ' + JSON.stringify(seg())); }
            delete window.broadcast;
            console.log('SMOKE OK: only dashboard pages count as dashboards; a late answer for a left dashboard is ignored');
        });
}, 2000);

// ---- entering a dashboard whose default changes the global segment loads its widgets once ----
// That change reloads the whole dashboard: Matomo aborts every request on a URL change, but the server still computes
// them. So the widget requests the dashboard sends before the change runs are not sent at all.
setTimeout(function () {
    var page = null;
    var server = { 81: { widgets: {}, defaultAction: { action: 'set', segment: 'browserCode==ff' } } };
    window.broadcast = {
        getValueFromHash: function (k) { return page === null ? '' : ({ category: 'Dashboard_Dashboard', subcategory: String(page) })[k] || ''; },
        getValueFromUrl: function () { return ''; }
    };
    window.ajaxHelper = function () {
        var get = {};
        return {
            addParams: function (p, where) { if (where === 'get') { Object.assign(get, p); } },
            withTokenInUrl: function () {}, setFormat: function () {}, setErrorCallback: function () {},
            send: function () {
                if (get.action !== 'getSettings') { return Promise.resolve([]); }
                return Promise.resolve(JSON.parse(JSON.stringify(server[get.idDashboard] || { widgets: {}, defaultAction: null })));
            }
        };
    };
    function wait() { return new Promise(function (r) { setTimeout(r, 10); }); }
    function go(id) { page = id; postPiwikEvent('Dashboard.loadDashboard'); return wait(); }
    function seg() { return MU.hashParsed.value.segment; }
    function start() { DS.baselineSegment = null; DS.appliedSegment = null; setHashSeg(''); }
    // the dashboard creates its widgets in one go; returns the requests that went out and what the calls returned
    function loadWidgets(n) {
        var before = window.__widgetLoads.length, results = [];
        for (var i = 0; i < n; i++) { results.push(window.widgetsHelper.loadWidgetAjax('w' + i, { dsSegId: 'i' + i }, function () {}, function () {})); }
        return { sent: window.__widgetLoads.slice(before), results: results };
    }
    start();
    go(81)
        .then(function () {
            var first = loadWidgets(3);                      // the default waits for exactly this moment
            if (first.sent.length !== 0) { throw new Error('widget requests before the default is applied must not be sent: ' + JSON.stringify(first.sent)); }
            if (first.results.some(function (r) { return !r || typeof r.abort !== 'function'; })) { throw new Error('a request not sent must still offer abort()'); }
            return wait();
        })
        .then(function () {
            if (seg() !== 'browserCode==ff') { throw new Error('the default must be applied once the dashboard loads its widgets, hash segment is ' + JSON.stringify(seg())); }
            var second = loadWidgets(3);                     // Matomo reloads the dashboard for the new segment
            if (second.sent.join('|') !== 'browserCode==ff|browserCode==ff|browserCode==ff') { throw new Error('the reloaded dashboard must load its widgets: ' + JSON.stringify(second.sent)); }
            return go(82);                                   // no default: the restore of the previous segment waits
        })
        .then(function () {
            var first = loadWidgets(2);
            if (first.sent.length !== 0) { throw new Error('widget requests before the restore runs must not be sent: ' + JSON.stringify(first.sent)); }
            return wait();
        })
        .then(function () {
            if (seg() !== '') { throw new Error('leaving the dashboard must restore the previous segment, hash segment is ' + JSON.stringify(seg())); }
            if (loadWidgets(2).sent.join('|') !== '|') { throw new Error('the reloaded dashboard must load its widgets without a segment'); }
            start();
            return go(81);
        })
        .then(function () {
            setHashSeg('browserCode==chrome');               // picked by hand while the dashboard loads: it stands
            if (loadWidgets(2).sent.length !== 2) { throw new Error('with a hand-picked segment the widgets must load right away'); }
            return wait();
        })
        .then(function () {
            if (seg() !== 'browserCode==chrome') { throw new Error('the hand-picked segment must stand, hash segment is ' + JSON.stringify(seg())); }
            start();
            return go(82).then(function () { return go(81); });
        })
        .then(function () {
            var update = MU.updateHash;                      // without MatomoUrl nothing makes sure the dashboard reloads
            MU.updateHash = undefined;
            var sent = loadWidgets(2).sent;
            MU.updateHash = update;
            if (sent.length !== 2) { throw new Error('without MatomoUrl.updateHash the widgets must load: ' + JSON.stringify(sent)); }
            return wait();
        })
        .then(function () {
            if (loadWidgets(1).sent.length !== 1) { throw new Error('once the change has run, widget requests go out again'); }
            // Matomo posts Dashboard.Dashboard.mounted right before it creates the widgets: same result
            start();
            return go(82).then(function () { return go(81); });
        })
        .then(function () {
            postPiwikEvent('Dashboard.Dashboard.mounted');
            if (loadWidgets(2).sent.length !== 0) { throw new Error('widgets created after the mounted event must not be sent before the default is applied'); }
            return wait();
        })
        .then(function () {
            if (seg() !== 'browserCode==ff' || loadWidgets(2).sent.length !== 2) { throw new Error('after the mounted event the default must be applied and the widgets load'); }
            // a segment in the query string (a bookmark) and "All visits" as the default: the hash change drops the
            // segment from the hash, the query string's one shows through, nothing reloads: the widgets must load
            server[83] = { widgets: {}, defaultAction: { action: 'remove' } };
            start();
            MU.urlParsed.value = { segment: 'browserCode==ff' };
            setHashSeg('browserCode==ff');
            return go(83);
        })
        .then(function () {
            if (loadWidgets(2).sent.length !== 2) { throw new Error('widgets must load when the change does not reload the dashboard (query segment, default All visits)'); }
            return wait();
        })
        .then(function () {
            // the query string has the default already, the hash has none: the change reloads nothing either
            start();
            MU.urlParsed.value = { segment: 'browserCode==ff' };
            return go(82).then(function () { return go(81); });
        })
        .then(function () {
            if (loadWidgets(2).sent.length !== 2) { throw new Error('widgets must load when the query string has the default already'); }
            return wait();
        })
        .then(function () {
            MU.urlParsed.value = {};
        })
        .then(function () {
            delete window.broadcast;
            console.log('SMOKE OK: widget requests are not sent while a global segment change is about to reload the dashboard');
        });
}, 3000);
