<?php

/**
 * Matomo - free/libre analytics platform
 *
 * @link    https://matomo.org
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\FeinwerkDashboardSegment;

class SegmentResolver
{
    public const NONE = '__none__';
    public const DEFAULT_WIDGET_ID = '__dashboard_default__';

    /**
     * Resolve the effective action for one widget given its stored override and the
     * dashboard default. Precedence: widget override > dashboard default > inherit (global).
     *
     * @param string|null $override stored per-widget value: a segment definition,
     *                              self::NONE, or null/'' for "inherit"
     * @param string|null $default  stored dashboard default: a segment definition,
     *                              self::NONE, or null/'' for "none set"
     * @return array{action:string, segment?:string}
     *         action is one of 'set' (with 'segment'), 'remove', 'inherit'
     */
    public static function resolve(?string $override, ?string $default): array
    {
        if ($override === self::NONE) {
            return ['action' => 'remove'];
        }
        if ($override !== null && $override !== '') {
            return ['action' => 'set', 'segment' => $override];
        }
        if ($default === self::NONE) {
            return ['action' => 'remove'];
        }
        if ($default !== null && $default !== '') {
            return ['action' => 'set', 'segment' => $default];
        }
        return ['action' => 'inherit'];
    }
}
