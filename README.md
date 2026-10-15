# FeinwerkDashboardSegment

Choose and persist a **Matomo segment per dashboard widget**, with a dashboard-wide default
that individual widgets can override or opt out of.

Matomo's dashboards only support **one global segment** applied to every widget at once. That
makes mixed dashboards impossible, for example an "LLM / AI analysis" dashboard where most widgets
should use an *AI Referrer* segment, but the AI‑chatbot widgets must show **all** data (they have
no AI referrer by definition). FeinwerkDashboardSegment fixes that.

> Dashboard sharing is now a separate free plugin, **FeinwerkDashboardSharing**. Install it if you want
> to share dashboards.

## Description

Matomo dashboards apply **one segment to every widget at once**. If you want to compare audiences
on one dashboard, or keep a few widgets on all data while the rest use a segment, you need several
dashboards or a lot of switching.

FeinwerkDashboardSegment adds a segment picker to each dashboard widget:

- **A segment per widget:** every widget shows its own saved segment, so the same report can sit
  side by side for "all visits", "mobile visitors" and "buyers".
- **A dashboard default:** set one segment for the whole dashboard; single widgets inherit it,
  override it or opt out with "all data".
- **Per website:** choices are stored per dashboard and website and applied every time the
  dashboard loads.

Nothing changes until you pick a segment: without settings, dashboards behave exactly like in
standard Matomo. Public dashboards for anonymous visitors keep working as before.

Documentation and more Plugins for Matomo: [Feinwerk Plugins](https://plugins.feinwerk.io/en/plugins/FeinwerkDashboardSegment).

## Features

- **Per‑widget segment**: pick a saved segment for any individual widget from a control in its
  header.
- **Dashboard default**: set one default segment for the whole dashboard; widgets inherit it.
- **Three states per widget**: inherit the default · a specific segment · **No segment (all data)**,
  which wins even over a dashboard default.
- **Per instance**: the *same* widget can appear twice on a dashboard with *different* segments
  (useful for side‑by‑side comparison).
- **Per site**: segments are chosen and applied separately for each site; only the current site's
  saved segments are offered and applied.
- **Per‑widget time range**: optionally give a widget its own period/date (e.g. *Last 30 days* or
  *Yesterday*) independent of the dashboard's range.
- A small **bar under the widget header** shows the active segment and time range, each with a **×**
  to remove it (fall back to all data / the dashboard range).

Precedence: `per‑widget override (server‑rendered widgets)  >  dashboard default (= the dashboard's global segment)  >  the segment you had before`.

## How it works

The plugin only adds to Matomo. It does not change Matomo's own files or the bundled Dashboard
plugin, so Matomo updates keep working:

- Each widget on a dashboard remembers its own segment and time range. If you add the same widget
  twice, each copy keeps its own choice.
- A **dashboard default** sets Matomo's normal segment while the dashboard is open, without
  reloading the page, so every widget follows it, including graphs and the Live! widget. When you
  leave the dashboard, the segment you had before comes back.
- Your choices are stored per user, dashboard and website in the plugin's own database table
  `dashboard_widget_settings`.
- The picker lists the saved segments of Matomo's segment editor.

To create a **new** segment (e.g. *AI Referrer*), use Matomo's normal segment editor once; it then
appears in the per‑widget picker.

## Requirements

- Matomo 5.x
- The bundled **Dashboard** and **SegmentEditor** plugins (active by default).

## Installation

1. Copy this folder to `plugins/FeinwerkDashboardSegment` in your Matomo installation.
2. Activate it: **Administration → Plugins → FeinwerkDashboardSegment → Activate**, or on the CLI:
   ```
   ./console plugin:activate FeinwerkDashboardSegment
   ./console core:clear-caches
   ```
   Activation creates the `dashboard_widget_settings` table.

### Upgrading from DashboardSegment

Up to version 0.4 this plugin was called `DashboardSegment`. Install and activate
`FeinwerkDashboardSegment`: it takes over all widget segments and removes the old plugin automatically.
Do not uninstall `DashboardSegment` yourself.

## Usage

1. Open a dashboard.
2. Use the **segment button** in a widget's header to pick a segment, "No segment (all data)", or
   "Inherit dashboard default".
3. Use the **Dashboard default segment** control above the widgets to set a default for the whole
   dashboard.
4. Switch sites to manage each site's selection independently.

## Known limitations / roadmap

- **A dashboard default filters the whole dashboard**, including reactive / live widgets
  (evolution graphs, KPI / single‑metric widgets, sparklines, the **Live!** widget, the visitor
  map). Opening a dashboard whose default is a segment activates that segment as Matomo's **global**
  segment (it also shows in the native segment selector) and restores your previous segment when you
  leave the dashboard. A manual change to the global segment while you are on the dashboard wins
  until you reopen it. What remains impossible for an additive plugin is a **per‑widget** segment
  *exception* on those reactive widgets: they follow the dashboard default, so their per‑widget
  pickers stay hidden. Per‑widget overrides still apply to the standard server‑rendered report
  widgets (the majority).
- Matomo fires no event when a dashboard is deleted, so override rows for a deleted dashboard are
  not actively cleaned up. They are inert (their instance keys never match a live widget) and are
  removed when the user or the site is deleted. (Because dashboard ids are reused per user, a
  dashboard deleted and immediately recreated under the same id could briefly carry over the old
  dashboard default; this is cosmetic and self‑corrects.)
- Planned: bulk segment assignment.

## License

GPL v3 or later.

## Author

Peter Boehlke, [Feinwerk.io](https://feinwerk.io) · support@feinwerk.io
