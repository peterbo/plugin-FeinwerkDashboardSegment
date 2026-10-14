<?php

/**
 * Matomo - free/libre analytics platform
 *
 * @link    https://matomo.org
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\FeinwerkDashboardSegment;

use Piwik\Piwik;
use Piwik\Plugins\FeinwerkDashboardSegment\Dao\WidgetSettings;

/**
 * FeinwerkDashboardSegment API: per-widget segment and period/date overrides plus a per-dashboard default
 * segment (per site). All methods operate on the caller's own dashboards.
 *
 * @method static API getInstance()
 */
class API extends \Piwik\Plugin\API
{
    /** @var WidgetSettings */
    private $dao;

    public function __construct(?WidgetSettings $dao = null)
    {
        $this->dao = $dao ?: new WidgetSettings();
    }

    /**
     * Set (or clear) the segment override for a single widget instance, for a specific site.
     * '' clears the override; SegmentResolver::NONE forces "no segment / all data".
     */
    public function setWidgetSegment(int $idDashboard, int $idSite, string $widgetUniqueId, string $segment): void
    {
        $login = $this->checkAndGetLogin($idSite);

        if ($segment === '') {
            $this->dao->clearSegment($login, $idDashboard, $idSite, $widgetUniqueId);
            return;
        }
        $this->dao->setSegment($login, $idDashboard, $idSite, $widgetUniqueId, $segment);
    }

    /**
     * Set (or clear) the period/date override for a single widget instance, for a specific site.
     * Pass empty $period to clear (the widget then inherits the dashboard's period/date).
     */
    public function setWidgetPeriod(int $idDashboard, int $idSite, string $widgetUniqueId, string $period, string $date): void
    {
        $login = $this->checkAndGetLogin($idSite);

        if ($period === '') {
            $this->dao->clearPeriod($login, $idDashboard, $idSite, $widgetUniqueId);
            return;
        }
        $this->dao->setPeriod($login, $idDashboard, $idSite, $widgetUniqueId, $period, $date);
    }

    /**
     * Set (or clear) the dashboard-wide default segment for a specific site.
     */
    public function setDashboardDefaultSegment(int $idDashboard, int $idSite, string $segment): void
    {
        $login = $this->checkAndGetLogin($idSite);

        if ($segment === '') {
            $this->dao->clearSegment($login, $idDashboard, $idSite, SegmentResolver::DEFAULT_WIDGET_ID);
            return;
        }
        $this->dao->setSegment($login, $idDashboard, $idSite, SegmentResolver::DEFAULT_WIDGET_ID, $segment);
    }

    /**
     * @return array{default: ?string, widgets: array<string,array{segment:?string,period:?string,date:?string}>}
     */
    public function getWidgetSettings(int $idDashboard, int $idSite): array
    {
        $login = $this->checkAndGetLogin($idSite);

        $all = $this->dao->getAllForDashboard($login, $idDashboard, $idSite);

        $default = null;
        if (array_key_exists(SegmentResolver::DEFAULT_WIDGET_ID, $all)) {
            $default = $all[SegmentResolver::DEFAULT_WIDGET_ID]['segment'];
            unset($all[SegmentResolver::DEFAULT_WIDGET_ID]);
        }

        return array('default' => $default, 'widgets' => $all);
    }

    private function checkAndGetLogin(int $idSite): string
    {
        Piwik::checkUserIsNotAnonymous();
        // Reject idSite <= 0 explicitly: checkUserHasViewAccess(0) throws for normal users but passes
        // for superusers, who would then read/write overrides under the bucket idsite=0 that no real
        // dashboard load ever matches.
        if ($idSite <= 0) {
            throw new \Exception('Invalid idSite');
        }
        Piwik::checkUserHasViewAccess($idSite);
        return Piwik::getCurrentUserLogin();
    }
}
