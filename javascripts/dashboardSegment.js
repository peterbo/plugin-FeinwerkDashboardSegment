/**
 * Matomo - free/libre analytics platform
 *
 * FeinwerkDashboardSegment: applies a segment AND/OR a period override per dashboard widget INSTANCE by
 * wrapping the global widgetsHelper.loadWidgetAjax choke point, and adds pickers to each widget
 * header plus a dashboard-wide default segment control. Pure-additive: no core files are modified.
 *
 * Per-instance: Matomo gives every instance of the same widget the identical `widgetId`, so we tag
 * each instance with a stable `dsSegId` stored in its layout parameters (persisted through
 * Dashboard's own saveLayout) and key overrides by that id, per site.
 *
 * @link    https://matomo.org
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */
(function () {
    'use strict';

    var NONE = '__none__';

    // Period presets: key -> Matomo period/date pair + translation key.
    var PERIOD_PRESETS = [
        { key: 'today',     period: 'day',   date: 'today',     label: 'FeinwerkDashboardSegment_PeriodToday' },
        { key: 'yesterday', period: 'day',   date: 'yesterday', label: 'FeinwerkDashboardSegment_PeriodYesterday' },
        { key: 'last7',     period: 'range', date: 'last7',     label: 'FeinwerkDashboardSegment_PeriodLast7' },
        { key: 'last30',    period: 'range', date: 'last30',    label: 'FeinwerkDashboardSegment_PeriodLast30' },
        { key: 'week',      period: 'week',  date: 'today',     label: 'FeinwerkDashboardSegment_PeriodWeek' },
        { key: 'month',     period: 'month', date: 'today',     label: 'FeinwerkDashboardSegment_PeriodMonth' },
        { key: 'year',      period: 'year',  date: 'today',     label: 'FeinwerkDashboardSegment_PeriodYear' }
    ];
    function presetByKey(key) {
        var found = null;
        PERIOD_PRESETS.forEach(function (p) { if (p.key === key) { found = p; } });
        return found;
    }
    function presetForStored(period, date) {
        var found = null;
        PERIOD_PRESETS.forEach(function (p) { if (p.period === period && p.date === date) { found = p; } });
        return found;
    }

    var FeinwerkDashboardSegment = {
        // resolved settings for the active dashboard/site:
        //   { widgets: { instanceId: { segment: action, period: {period,date} } }, defaultAction }
        settings: { widgets: {}, defaultAction: null },
        idDashboard: null,
        wrapped: false,
        segments: null,
        baselineSegment: null, // encoded global segment the user had before we first drove it (restore target)
        appliedSegment: null   // encoded global segment we last set for a dashboard default (null = we drive nothing)
    };

    // Current dashboard id from the URL hash (Dashboard uses `subcategory`). null when unknown.
    function currentDashboardId() {
        var broadcast = window.broadcast;
        var value = (broadcast && (broadcast.getValueFromHash('subcategory') || broadcast.getValueFromUrl('subcategory'))) || '';
        var id = parseInt(value, 10);
        return isNaN(id) ? null : id;
    }

    function currentIdSite() {
        if (window.piwik && window.piwik.idSite) { return window.piwik.idSite; }
        var broadcast = window.broadcast;
        var v = (broadcast && (broadcast.getValueFromHash('idSite') || broadcast.getValueFromUrl('idSite'))) || '';
        return v || null;
    }

    // Idiomatic Matomo request via ajaxHelper (handles CSRF token + idSite/period/date defaults).
    // NOTE: ajaxHelper auto-injects the page's global `segment`/`period`/`date`, so our own payload
    // uses distinct names (segmentValue / periodValue / dateValue) to avoid being clobbered.
    function dsAjax(action, getParams, postParams) {
        var ajax = new window.ajaxHelper();
        ajax.addParams(window.$.extend({ module: 'FeinwerkDashboardSegment', action: action }, getParams || {}), 'get');
        if (postParams) { ajax.addParams(postParams, 'post'); }
        ajax.withTokenInUrl();
        ajax.setFormat('json');
        return ajax.send();
    }

    // User-facing toast for a failed action (previously these failed silently with only a console
    // error). Reuses Matomo's own notification UI; guarded so a missing require() — e.g. in the JS
    // smoke test — never throws.
    function notify(message, context) {
        try {
            var UI = require('piwik/UI');
            new UI.Notification().show(message, { context: context || 'error', type: 'toast' });
        } catch (e) {
            if (window.console) { window.console.error('FeinwerkDashboardSegment:', message); }
        }
    }

    function notifySaveError() { notify(_pk_translate('FeinwerkDashboardSegment_SaveError'), 'error'); }

    // ---- per-instance identity --------------------------------------------------------------

    function instanceIdOf(widget) {
        return (widget && widget.widgetParameters && widget.widgetParameters.dsSegId) || '';
    }

    function ensureInstanceId(widget) {
        var id = instanceIdOf(widget);
        if (!id) {
            id = 'i' + (new Date()).getTime().toString(36) + Math.random().toString(36).slice(2, 8);
            if (typeof widget.setParameters === 'function') {
                widget.setParameters({ dsSegId: id });
            } else {
                widget.element.trigger('setParameters.dashboardWidget', [{ dsSegId: id }]);
                if (widget.widgetParameters) { widget.widgetParameters.dsSegId = id; }
            }
        }
        widget.element.attr('data-ds-segid', id);
        return id;
    }

    function reloadWidgetEl($el) {
        try {
            $el.dashboardWidget('reload', false, true);
        } catch (e) {
            if (window.console) { window.console.error('FeinwerkDashboardSegment reload failed', e); }
        }
    }

    // Apply a resolved segment action to an outgoing params object.
    function applyAction(params, action) {
        if (!action) { return; }
        if (action.action === 'remove') { delete params.segment; }
        else if (action.action === 'set') { params.segment = action.segment; }
        // 'inherit' (or absent) => leave params.segment untouched.
    }

    // ---- settings access --------------------------------------------------------------------

    FeinwerkDashboardSegment.entryFor = function (instanceId) {
        return (instanceId && Object.prototype.hasOwnProperty.call(this.settings.widgets, instanceId))
            ? this.settings.widgets[instanceId] : null;
    };

    // Effective segment action: instance override wins, else dashboard default, else inherit.
    FeinwerkDashboardSegment.actionFor = function (instanceId) {
        var e = this.entryFor(instanceId);
        if (e && e.segment) { return e.segment; }
        return this.settings.defaultAction; // may be null => inherit
    };

    // Effective period override for an instance: {period,date} or null (inherit dashboard range).
    FeinwerkDashboardSegment.periodFor = function (instanceId) {
        var e = this.entryFor(instanceId);
        return (e && e.period) || null;
    };

    FeinwerkDashboardSegment.hasAnySettings = function () {
        return !!(this.settings.defaultAction || Object.keys(this.settings.widgets).length);
    };

    // Stored raw segment value for the picker ('' = inherit, NONE, or a definition).
    FeinwerkDashboardSegment.currentWidgetValue = function (instanceId) {
        var e = this.entryFor(instanceId);
        var a = e && e.segment;
        if (!a) { return ''; }
        if (a.action === 'remove') { return NONE; }
        if (a.action === 'set') { return a.segment; }
        return '';
    };

    FeinwerkDashboardSegment.currentDefaultValue = function () {
        var a = this.settings.defaultAction;
        if (!a) { return ''; }
        if (a.action === 'remove') { return NONE; }
        if (a.action === 'set') { return a.segment; }
        return '';
    };

    // Period preset key currently active for the picker ('' = inherit).
    FeinwerkDashboardSegment.currentPeriodKey = function (instanceId) {
        var p = this.periodFor(instanceId);
        if (!p) { return ''; }
        var preset = presetForStored(p.period, p.date);
        return preset ? preset.key : '';
    };

    // ---- core wrapper -----------------------------------------------------------------------

    FeinwerkDashboardSegment.installWrapper = function () {
        if (this.wrapped || !window.widgetsHelper || typeof window.widgetsHelper.loadWidgetAjax !== 'function') {
            return;
        }
        var original = window.widgetsHelper.loadWidgetAjax;
        var self = this;
        window.widgetsHelper.loadWidgetAjax = function (widgetUniqueId, widgetParameters, onLoaded, onError) {
            var params = widgetParameters;
            try {
                var instanceId = widgetParameters && widgetParameters.dsSegId;
                // Clone so we never mutate the widget's persistent parameter object,
                // and drop our internal marker so it is not sent to the widget request.
                params = window.$.extend({}, widgetParameters);
                delete params.dsSegId;
                applyAction(params, self.actionFor(instanceId));
                var p = self.periodFor(instanceId);
                if (p && p.period) { params.period = p.period; params.date = p.date; }
            } catch (e) {
                params = widgetParameters; // fall back to the original on any error
                if (window.console) { window.console.error('FeinwerkDashboardSegment override failed', e); }
            }
            return original.call(this, widgetUniqueId, params, onLoaded, onError);
        };
        this.wrapped = true;
    };

    // ---- dashboard default -> Matomo global segment -----------------------------------------
    // Reactive Vue widgets (graphs, KPI/single-metric, sparklines, Live!, the map) read the GLOBAL
    // segment and never flow through our loadWidgetAjax wrapper. To make a dashboard default filter
    // them too, we set Matomo's global segment to the default while that dashboard is open and
    // restore the user's baseline when a dashboard has no default. We use the same hash-only idiom
    // as Matomo's own segment selector on a reporting page (CoreHome.MatomoUrl.updateHash): it
    // reloads the widgets WITHOUT a full page reload, so the in-memory state below survives and the
    // baseline capture stays correct. We act only on dashboard entry (a context change), so a manual
    // segment change during a visit stands until re-open. Segment values here are raw definitions
    // (decoded), as MatomoUrl stores/returns them.

    function matomoUrl() {
        return (window.CoreHome && window.CoreHome.MatomoUrl) || null;
    }

    // Guard literal '%' exactly as Matomo's own selector does before MatomoUrl re-encodes the hash
    // (idempotent, so comparing against a value read back from the hash stays consistent).
    function guardSegment(raw) {
        return String(raw).replace(/%$/, '%25').replace(/%([^\d].)/g, '%25$1');
    }

    // The global segment currently in the URL hash, as a raw (decoded) definition. '' when none.
    function readGlobalSegment() {
        var mu = matomoUrl();
        return (mu && mu.hashParsed && mu.hashParsed.value && mu.hashParsed.value.segment) || '';
    }

    // Set the global segment to `value` ('' clears it). Hash-only via MatomoUrl (no full page
    // reload), keeping period/date and the rest of the hash, exactly like the native selector.
    // Returns true if it changed the hash.
    function applyGlobalSegment(value) {
        var mu = matomoUrl();
        if (mu && typeof mu.updateHash === 'function' && mu.hashParsed && mu.hashParsed.value) {
            mu.updateHash(window.$.extend({}, mu.hashParsed.value, { segment: value }));
            return true;
        }
        // Fallback when MatomoUrl is unavailable: the heavier full-reload idiom (broadcast).
        var b = window.broadcast;
        if (b && typeof b.propagateNewPage === 'function') {
            b.propagateNewPage('segment=' + encodeURIComponent(value), true, undefined,
                ['compareSegments', 'comparePeriods', 'compareDates']);
            return true;
        }
        return false;
    }

    // What the global segment should be for the active dashboard's settings.
    //   drive=false -> no default here: leave the user's segment alone.
    //   drive=true  -> value is the raw segment to enforce ('' = __none__ default = all data).
    FeinwerkDashboardSegment.desiredGlobalForSettings = function () {
        var a = this.settings.defaultAction;
        if (!a) { return { drive: false, value: '' }; }
        if (a.action === 'remove') { return { drive: true, value: '' }; }
        if (a.action === 'set')    { return { drive: true, value: guardSegment(a.segment) }; }
        return { drive: false, value: '' };
    };

    // Apply the active dashboard's default to the global segment. Returns true if it changed the
    // global segment (which reloads the widgets, so the caller must NOT also reload them).
    FeinwerkDashboardSegment.syncGlobalSegmentForDashboard = function () {
        var desired = this.desiredGlobalForSettings();
        var current = readGlobalSegment();
        if (!desired.drive) {
            return this.restoreBaselineSegment(); // no default here -> restore the user's baseline
        }
        if (this.baselineSegment === null) { this.baselineSegment = current; } // capture once
        this.appliedSegment = desired.value;
        if (current === desired.value) { return false; } // already correct -> no reload
        return applyGlobalSegment(desired.value);
    };

    // Restore the user's baseline global segment (leaving a defaulted dashboard / entering one
    // without a default). Returns true if it changed the global segment.
    FeinwerkDashboardSegment.restoreBaselineSegment = function () {
        if (this.appliedSegment === null) { return false; } // we weren't driving anything
        var target = this.baselineSegment || '';
        var changed = (readGlobalSegment() !== target) && applyGlobalSegment(target);
        this.appliedSegment = null;
        return changed;
    };

    // ---- settings + segment list fetch ------------------------------------------------------

    FeinwerkDashboardSegment.fetchSettingsPromise = function () {
        var self = this;
        self.idDashboard = currentDashboardId();
        if (self.idDashboard === null) {
            self.settings = { widgets: {}, defaultAction: null };
            return window.$.Deferred().resolve(self.settings).promise();
        }
        return dsAjax('getSettings', { idDashboard: self.idDashboard, idSite: currentIdSite() }).then(function (data) {
            self.settings = {
                widgets: (data && data.widgets) || {},
                defaultAction: (data && data.defaultAction) || null
            };
            return self.settings;
        });
    };

    FeinwerkDashboardSegment.fetchSettings = function (callback) {
        var self = this;
        this.fetchSettingsPromise().then(function () {
            if (callback) { callback(); }
        }, function () {
            self.settings = { widgets: {}, defaultAction: null };
            if (callback) { callback(); }
        });
    };

    FeinwerkDashboardSegment.loadSegments = function (callback) {
        if (this.segments) { callback(this.segments); return; }
        var self = this;
        dsAjax('getSegments', {}).then(function (list) {
            self.segments = (list || []).map(function (s) { return { definition: s.definition, name: s.name }; });
            callback(self.segments);
        }, function () { callback([]); });
    };

    FeinwerkDashboardSegment.segmentName = function (definition) {
        var found = null;
        (this.segments || []).forEach(function (s) { if (s.definition === definition) { found = s.name; } });
        return found || _pk_translate('FeinwerkDashboardSegment_CustomSegment');
    };

    FeinwerkDashboardSegment.reloadAllWidgets = function () {
        window.$('[widgetId]').each(function () { reloadWidgetEl(window.$(this)); });
    };

    // Reload only the widgets that carry a per-instance override. Used on open when no dashboard
    // default is set, so untouched widgets (and their own view settings such as the row count) are
    // never needlessly re-rendered by us.
    FeinwerkDashboardSegment.reloadOverriddenWidgets = function () {
        var self = this;
        window.$('[widgetId]').each(function () {
            var $el = window.$(this);
            var id = $el.attr('data-ds-segid');
            if (id && Object.prototype.hasOwnProperty.call(self.settings.widgets, id)) {
                reloadWidgetEl($el);
            }
        });
    };

    // Apply overrides to already-rendered widgets: a dashboard default affects all widgets, else
    // only the overridden ones need a reload.
    FeinwerkDashboardSegment.applyToRendered = function () {
        if (this.settings.defaultAction) {
            this.reloadAllWidgets();
        } else if (Object.keys(this.settings.widgets).length) {
            this.reloadOverriddenWidgets();
        }
    };

    // ---- save -------------------------------------------------------------------------------

    FeinwerkDashboardSegment.saveWidget = function (instanceId, segment) {
        var self = this, id = self.idDashboard;
        if (id === null || !instanceId) { return window.$.Deferred().reject().promise(); }
        return dsAjax('saveWidgetSegment',
            { idDashboard: id, idSite: currentIdSite(), widgetUniqueId: instanceId },
            { segmentValue: segment }
        ).then(function () { return self.fetchSettingsPromise(); },
               function (e) { notifySaveError(); return window.$.Deferred().reject(e).promise(); });
    };

    FeinwerkDashboardSegment.saveWidgetPeriod = function (instanceId, presetKey) {
        var self = this, id = self.idDashboard;
        if (id === null || !instanceId) { return window.$.Deferred().reject().promise(); }
        var preset = presetKey ? presetByKey(presetKey) : null;
        return dsAjax('saveWidgetPeriod',
            { idDashboard: id, idSite: currentIdSite(), widgetUniqueId: instanceId },
            { periodValue: preset ? preset.period : '', dateValue: preset ? preset.date : '' }
        ).then(function () { return self.fetchSettingsPromise(); },
               function (e) { notifySaveError(); return window.$.Deferred().reject(e).promise(); });
    };

    FeinwerkDashboardSegment.saveDefault = function (segment) {
        var self = this, id = self.idDashboard;
        if (id === null) { return window.$.Deferred().reject().promise(); }
        return dsAjax('saveDashboardDefault',
            { idDashboard: id, idSite: currentIdSite() },
            { segmentValue: segment }
        ).then(function () { return self.fetchSettingsPromise(); },
               function (e) { notifySaveError(); return window.$.Deferred().reject(e).promise(); });
    };

    // ---- menus ------------------------------------------------------------------------------

    function placeMenu($menu, $anchor) {
        window.$('body').append($menu);
        var off = $anchor.offset();
        $menu.css({ position: 'absolute', top: off.top + $anchor.outerHeight(), left: off.left, zIndex: 1000 });
        setTimeout(function () {
            window.$(document).one('click.dashboardSegment', function () { $menu.remove(); });
        }, 0);
    }

    function openMenu($anchor, items, currentValue, onPick) {
        var $menu = window.$('<div class="dashboardSegmentMenu"></div>');
        items.forEach(function (it) {
            var isActive = (it.value === currentValue);
            var $r = window.$('<div class="dashboardSegmentItem"></div>').text((isActive ? '✓ ' : '') + it.label);
            if (isActive) { $r.addClass('active'); }
            $r.on('click', function () { $menu.remove(); onPick(it.value); });
            $menu.append($r);
        });
        placeMenu($menu, $anchor);
    }

    // Open Matomo's own segment editor (the top-bar selector) so a new saved segment can be created
    // without leaving the dashboard. Only offered when that selector is present on the page.
    function segmentEditorAvailable() {
        return window.$('.segmentationContainer, .add_new_segment').length > 0;
    }
    function openNewSegmentEditor() {
        var $add = window.$('.add_new_segment').first();
        if ($add.length) { $add[0].click(); return; }
        // panel collapsed: open it, then click "add new segment"
        var $toggle = window.$('.segmentationContainer .segmentationTitle, .segmentationContainer .title').first();
        if ($toggle.length) {
            $toggle[0].click();
            window.setTimeout(function () {
                var $a = window.$('.add_new_segment').first();
                if ($a.length) { $a[0].click(); }
            }, 150);
        }
    }

    // Options for the segment picker: inherit · no segment · each saved segment.
    // Segment picker: our own themed menu with a search box and a "New segment" link. Rendered by
    // us rather than Matomo's expandable-select, which is built for in-form use and misbehaves in a
    // floating popover. The period picker keeps the plain openMenu (only a handful of presets).
    function openSegmentMenu($anchor, current, onPick) {
        FeinwerkDashboardSegment.loadSegments(function (segments) {
            var items = [
                { label: _pk_translate('FeinwerkDashboardSegment_InheritDefault'), value: '' },
                { label: _pk_translate('FeinwerkDashboardSegment_NoSegment'), value: NONE }
            ];
            (segments || []).forEach(function (s) { items.push({ label: s.name, value: s.definition }); });

            var $menu = window.$('<div class="dashboardSegmentMenu dsSearchable"></div>');
            var closed = false;
            function close() {
                if (closed) { return; }
                closed = true;
                window.$(document).off('mousedown.dsMenu keydown.dsMenu');
                $menu.remove();
            }

            var $search = window.$('<input type="text" class="dsMenuSearch" />')
                .attr('placeholder', _pk_translate('FeinwerkDashboardSegment_SearchSegments'));
            $menu.append(window.$('<div class="dsMenuSearchWrap"></div>').append($search));

            var $list = window.$('<div class="dsMenuList"></div>');
            var rows = [];
            items.forEach(function (it) {
                var isActive = (it.value === current);
                var $r = window.$('<div class="dashboardSegmentItem"></div>').text((isActive ? '✓ ' : '') + it.label);
                if (isActive) { $r.addClass('active'); }
                $r.attr('data-label', (it.label || '').toLowerCase());
                $r.on('click', function () { close(); onPick(it.value); });
                rows.push($r);
                $list.append($r);
            });
            $menu.append($list);

            if (segmentEditorAvailable()) {
                var $new = window.$('<a href="javascript:;" class="dsLink dsNewSegment"></a>')
                    .text('➕ ' + _pk_translate('FeinwerkDashboardSegment_NewSegment'));
                $new.on('click', function () { close(); openNewSegmentEditor(); });
                $menu.append($new);
            }

            $search.on('input', function () {
                var q = (this.value || '').toLowerCase();
                rows.forEach(function ($r) {
                    var hit = !q || ($r.attr('data-label') || '').indexOf(q) !== -1;
                    $r.css('display', hit ? '' : 'none');
                });
            });

            window.$('body').append($menu);
            var off = $anchor.offset();
            $menu.css({ position: 'absolute', top: off.top + $anchor.outerHeight(), left: off.left, zIndex: 1000 });
            window.setTimeout(function () {
                window.$(document).on('mousedown.dsMenu', function (e) {
                    if ($menu[0] && !$menu[0].contains(e.target)) { close(); }
                });
                window.$(document).on('keydown.dsMenu', function (e) {
                    if (e.key === 'Escape' || e.keyCode === 27) { close(); }
                });
                $search.trigger('focus');
            }, 0);
        });
    }

    function openPeriodMenu($anchor, current, onPick) {
        var items = [{ label: _pk_translate('FeinwerkDashboardSegment_InheritPeriod'), value: '' }];
        PERIOD_PRESETS.forEach(function (p) { items.push({ label: _pk_translate(p.label), value: p.key }); });
        openMenu($anchor, items, current, onPick);
    }

    // ---- "current overrides" bar (chips) ----------------------------------------------------

    function makeChip(typeClass, iconClass, label, removeTitle, onRemove) {
        var $chip = window.$('<span class="dashboardSegmentChip ' + typeClass + '"></span>');
        $chip.append(window.$('<span class="dashboardSegmentChipIcon ' + iconClass + '"></span>'));
        $chip.append(window.$('<span class="dashboardSegmentChipLabel"></span>').text(label));
        if (onRemove) { // read-only (subscribed) dashboards show the chip without a remove control
            var $x = window.$('<a href="javascript:;" class="dashboardSegmentRemove" title="' + removeTitle + '">×</a>');
            $x.on('click', function (e) { e.stopPropagation(); onRemove(); });
            $chip.append($x);
        }
        return $chip;
    }

    function refreshBar($el) {
        var $bar = $el.find('.dashboardSegmentBar').first();
        if (!$bar.length) { return; }
        var instanceId = $el.attr('data-ds-segid') || '';
        $bar.empty();
        var any = false;

        // segment chip — only for an actual segment (not __none__ / inherit)
        var segVal = FeinwerkDashboardSegment.currentWidgetValue(instanceId);
        if (segVal !== '' && segVal !== NONE) {
            any = true;
            $bar.append(makeChip(
                'is-segment', 'icon-segment',
                FeinwerkDashboardSegment.segmentName(segVal),
                _pk_translate('FeinwerkDashboardSegment_RemoveSegment'),
                isReadOnlyDashboard() ? null : function () {
                    FeinwerkDashboardSegment.saveWidget(instanceId, NONE).then(function () { refreshBar($el); reloadWidgetEl($el); });
                }
            ));
        }

        // period chip
        var perKey = FeinwerkDashboardSegment.currentPeriodKey(instanceId);
        if (perKey) {
            var preset = presetByKey(perKey);
            any = true;
            $bar.append(makeChip(
                'is-period', 'icon-calendar',
                preset ? _pk_translate(preset.label) : perKey,
                _pk_translate('FeinwerkDashboardSegment_RemovePeriod'),
                isReadOnlyDashboard() ? null : function () {
                    FeinwerkDashboardSegment.saveWidgetPeriod(instanceId, '').then(function () { refreshBar($el); reloadWidgetEl($el); });
                }
            ));
        }

        if (any) { $bar.show(); } else { $bar.hide(); }
    }

    // ---- widget decoration ------------------------------------------------------------------

    // Widgets that fetch/refresh their data CLIENT-SIDE and read the segment/period directly from
    // the GLOBAL state (MatomoUrl) — sparklines, evolution graphs, the Live! widget, the visitor
    // map, and the containers that bundle them ("Visits Overview (with graph)", "Goals Overview")
    // — cannot honour a per-widget override (an additive plugin can't change global state for one
    // widget only). We hide the pickers there so the override isn't offered where it has no effect.
    //
    // Classify from the widget's PARAMETERS / uniqueId, which are known synchronously at
    // widget:create time — rendered DOM markers (.sparklineImg, vue-entry, ...) only appear after
    // the Vue content mounts, often too late for the initial decoration to skip the widget.
    function isUnsupportedWidget(widget) {
        var p = widget.widgetParameters || {};
        var module = (p.module || '') + '';
        var action = (p.action || '') + '';
        var view = ((p.viewDataTable || '') + '').toLowerCase();
        var uid = (widget.uniqueId || '') + '';

        // Live! and the visitor map refresh themselves client-side from the global segment.
        if (module === 'Live' || module === 'UserCountryMap') { return true; }
        if (uid.indexOf('widgetLive') === 0 || uid.indexOf('widgetUserCountryMap') === 0) { return true; }
        // Sparkline views and evolution graphs render their own data from global state.
        if (view.indexOf('sparkline') !== -1 || view.indexOf('graph') !== -1) { return true; }
        // Container widgets bundle sparklines/graphs -> an override would apply only partially.
        if (action === 'renderWidgetContainer' || /Overview|WithGraph/i.test(uid)) { return true; }

        // Fallback: rendered markers, for anything not classified by the parameters above.
        var $el = widget.element;
        if ($el.find('.sparklineImg, .visitsLiveFooter, .live-widget-loading').length) { return true; }
        if ($el.find('[vue-entry^="Live."]').length) { return true; }
        return false;
    }

    // Insert the per-widget segment/period buttons into the widget header.
    //   - Matomo 5.14+ renders the header as a Vue ReportHeader; its reserved, initially-empty
    //     `.reportHeader__actions` slot is our host. It mounts a tick AFTER widget:create, so we
    //     retry briefly until it (or the legacy toolbar) exists.
    //   - Matomo <= 5.13 uses the legacy `.widgetTop .buttons` toolbar.
    function injectWidgetButtons(widget, $top, attempt) {
        if (isReadOnlyDashboard()) { return; }        // subscribed dashboards: no editing
        if ($top.find('.dashboardSegmentButton').length) { return; } // already decorated

        // Matomo 5.14+: the native widget-control cluster (hover-revealed icon stack, top-right).
        // We inject INTO it so our buttons sit with the native controls (no overlap, no shifted
        // title). Matomo <= 5.13: the legacy `.widgetTop .buttons` toolbar.
        var $controls = $top.find('.reportHeader__widgetControls').first(); // Matomo 5.14+
        var $legacy = $controls.length ? window.$() : $top.find('.buttons').first(); // <= 5.13
        if (!$controls.length && !$legacy.length) {
            // Header (Vue or legacy) not in the DOM yet — retry for ~2s, then give up.
            if ((attempt || 0) < 20) {
                window.setTimeout(function () { injectWidgetButtons(widget, $top, (attempt || 0) + 1); }, 100);
            }
            return;
        }

        var $segBtn = window.$('<div class="button dashboardSegmentButton" title="' +
            _pk_translate('FeinwerkDashboardSegment_PickSegment') + '"><span class="icon-segment"></span></div>');
        $segBtn.on('click', function (e) {
            e.stopPropagation();
            openSegmentMenu($segBtn, FeinwerkDashboardSegment.currentWidgetValue(instanceIdOf(widget)), function (value) {
                var id = ensureInstanceId(widget);
                FeinwerkDashboardSegment.saveWidget(id, value).then(function () { refreshBar(widget.element); reloadWidgetEl(widget.element); });
            });
        });

        var $perBtn = window.$('<div class="button dashboardPeriodButton" title="' +
            _pk_translate('FeinwerkDashboardSegment_PickPeriod') + '"><span class="icon-calendar"></span></div>');
        $perBtn.on('click', function (e) {
            e.stopPropagation();
            openPeriodMenu($perBtn, FeinwerkDashboardSegment.currentPeriodKey(instanceIdOf(widget)), function (key) {
                var id = ensureInstanceId(widget);
                FeinwerkDashboardSegment.saveWidgetPeriod(id, key).then(function () { refreshBar(widget.element); reloadWidgetEl(widget.element); });
            });
        });

        if ($controls.length) {
            // Append after the native controls, inside their hover-revealed cluster.
            $controls.append($segBtn).append($perBtn);
        } else {
            $legacy.prepend($perBtn).prepend($segBtn);  // legacy toolbar (segment first)
        }
    }

    FeinwerkDashboardSegment.decorateWidget = function (widget) {
        var $top = widget.element.find('.widgetTop').first();
        if (!$top.length) { return; }
        if (isUnsupportedWidget(widget)) { return; }

        widget.element.attr('data-ds-segid', instanceIdOf(widget));

        // "current overrides" bar — shown on read-only (subscribed) dashboards too, so the applied
        // segment/period stays visible there even though it can't be edited.
        if (!$top.next('.dashboardSegmentBar').length) {
            $top.after('<div class="dashboardSegmentBar" style="display:none"></div>');
        }

        // pickers only when editable (not on subscribed/linked dashboards)
        injectWidgetButtons(widget, $top, 0);

        refreshBar(widget.element);

        // Vue widgets (sparklines, Live!, ...) mount their content AFTER widget:create, so the
        // early isUnsupportedWidget() check above can miss them and decorate anyway. Re-check once
        // they've had time to render and strip our decoration if it turns out unsupported.
        var $w = widget.element;
        window.setTimeout(function () {
            if (isUnsupportedWidget(widget)) {
                $w.find('.dashboardSegmentButton, .dashboardPeriodButton, .dashboardSegmentBar').remove();
            }
        }, 400);
    };

    // ---- dashboard default segment control --------------------------------------------------

    FeinwerkDashboardSegment.defaultLabel = function () {
        var a = this.settings.defaultAction;
        if (!a) { return _pk_translate('FeinwerkDashboardSegment_InheritDefault'); }
        if (a.action === 'remove') { return _pk_translate('FeinwerkDashboardSegment_NoSegment'); }
        return this.segmentName(a.segment);
    };

    FeinwerkDashboardSegment.injectDefaultControl = function () {
        var self = this;
        var $area = window.$('#dashboardWidgetsArea');
        if (!$area.length || window.$('#dashboardSegmentDefault').length) { return; }

        var $ctrl = window.$('<div id="dashboardSegmentDefault" class="dashboardSegmentDefault"></div>');
        $ctrl.append(window.$('<span class="dashboardSegmentDefaultLabel"></span>')
            .text(_pk_translate('FeinwerkDashboardSegment_DashboardDefaultSegment') + ': '));
        var $value = window.$('<a href="javascript:;" class="dashboardSegmentDefaultValue"></a>');
        $ctrl.append($value);
        $area.before($ctrl);

        function render() { $value.text(self.defaultLabel()); }

        $value.on('click', function (e) {
            e.stopPropagation();
            openSegmentMenu($value, self.currentDefaultValue(), function (value) {
                self.saveDefault(value).then(function () {
                    render();
                    // Changing the default drives the global segment live; only reload widgets
                    // ourselves when that did not already navigate (which reloads everything).
                    if (!self.syncGlobalSegmentForDashboard()) { self.reloadAllWidgets(); }
                });
            });
        });

        self.loadSegments(function () { render(); });
    };

    window.FeinwerkDashboardSegment = FeinwerkDashboardSegment;

    // ---- read-only marker published by the Sharing plugin -----------------------------------

    // Subscribed (synced) dashboards are read-only. The Sharing plugin publishes that as the
    // `fwsh-readonly` class on #dashboardWidgetsArea and window.FeinwerkDashboardSharing.readOnly.
    function isReadOnlyDashboard() {
        return !!(window.FeinwerkDashboardSharing && window.FeinwerkDashboardSharing.readOnly)
            || window.$('#dashboardWidgetsArea').hasClass('fwsh-readonly');
    }
    FeinwerkDashboardSegment.isReadOnlyDashboard = isReadOnlyDashboard;

    // On a normal dashboard: (re)inject controls + apply overrides. On a read-only dashboard:
    // just apply the synced overrides.
    function applyAfterFetch() {
        if (isReadOnlyDashboard()) {
            // Subscribed dashboards also drive the global segment from their synced default.
            if (!FeinwerkDashboardSegment.syncGlobalSegmentForDashboard()
                && FeinwerkDashboardSegment.hasAnySettings()) {
                FeinwerkDashboardSegment.reloadAllWidgets();
            }
            return;
        }
        FeinwerkDashboardSegment.loadSegments(function () {
            FeinwerkDashboardSegment.injectDefaultControl();
            window.$('[widgetId]').each(function () { refreshBar(window.$(this)); });
        });
        // Drive Matomo's global segment from the dashboard default so reactive widgets honour it.
        // If that navigates, it reloads every widget itself; only fall back to our per-widget reload
        // when we did NOT navigate.
        if (!FeinwerkDashboardSegment.syncGlobalSegmentForDashboard()) {
            FeinwerkDashboardSegment.applyToRendered();
        }
    }

    // Entry point for (re)entering a dashboard.
    function enterDashboard() {
        FeinwerkDashboardSegment.installWrapper();
        if (currentDashboardId() === null) {
            FeinwerkDashboardSegment.restoreBaselineSegment(); // left all dashboards -> restore the user's segment
            return;
        }
        FeinwerkDashboardSegment.fetchSettings(applyAfterFetch);
    }

    window.$(function () {
        // Anonymous viewers (public dashboards) have nothing to load or save: every endpoint of this
        // plugin needs a signed-in user. Stay idle so the dashboard renders with its normal segment.
        if (!window.piwik || !window.piwik.userLogin || window.piwik.userLogin === 'anonymous') {
            return;
        }

        // Bind widget decoration FIRST so pickers are always added, independent of the fetch.
        // Also (idempotently) ensure the default control exists whenever widgets render.
        window.$(document).on('widget:create', function (e, widget) {
            if (!widget || !widget.uniqueId) { return; }
            if (!isReadOnlyDashboard()) {
                FeinwerkDashboardSegment.injectDefaultControl();
            }
            FeinwerkDashboardSegment.loadSegments(function () { FeinwerkDashboardSegment.decorateWidget(widget); });
        });

        // The Sharing plugin determines read-only asynchronously. Work on elements only
        // (decorateWidget needs a Matomo widget object, which we do not have here).
        // The heavy rebuild below must only run on a genuine read-only -> editable transition
        // (leaving a shared dashboard), never when a normal editable dashboard is simply opened.
        var wasReadOnly = false;
        FeinwerkDashboardSegment.onReadOnlyChange = function () {
            if (isReadOnlyDashboard()) {
                wasReadOnly = true;
                // hide editing controls that were already rendered; the chips stay (read-only)
                window.$('.dashboardSegmentButton, .dashboardPeriodButton').remove();
                window.$('#dashboardSegmentDefault').remove();
                window.$('[widgetId]').each(function () { refreshBar(window.$(this)); });
                return;
            }
            if (!wasReadOnly) { return; }   // editable -> editable (normal open): nothing to do
            wasReadOnly = false;
            // Back to editable: reloading the dashboard re-fires widget:create for every widget
            // (object-based decorateWidget re-adds the pickers); the default control follows.
            var id = currentDashboardId();
            var $area = window.$('#dashboardWidgetsArea');
            try {
                if (id !== null && $area.length && typeof $area.dashboard === 'function') {
                    $area.dashboard('loadDashboard', id, true);
                }
            } catch (e) {
                if (window.console) { window.console.error('FeinwerkDashboardSegment dashboard reload failed', e); }
            }
            FeinwerkDashboardSegment.fetchSettings(applyAfterFetch);
        };
        window.$(document).on('fwsh:readonlychange', function () { FeinwerkDashboardSegment.onReadOnlyChange(); });

        enterDashboard();

        var lastContext = currentIdSite() + '|' + currentDashboardId();
        function onContextMaybeChanged() {
            var ctx = currentIdSite() + '|' + currentDashboardId();
            if (ctx === lastContext) { return; }
            lastContext = ctx;
            FeinwerkDashboardSegment.segments = null;
            window.$('#dashboardSegmentDefault').remove();
            enterDashboard();
        }
        window.$(window).on('hashchange', onContextMaybeChanged);
        if (window.piwik && window.piwik.on) {
            window.piwik.on('Dashboard.loadDashboard', onContextMaybeChanged);
        }
    });
})();
