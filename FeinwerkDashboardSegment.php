<?php

/**
 * Matomo - free/libre analytics platform
 *
 * @link    https://matomo.org
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\FeinwerkDashboardSegment;

use Piwik\Common;
use Piwik\Db;
use Piwik\Notification;
use Piwik\Piwik;
use Piwik\Plugin;

class FeinwerkDashboardSegment extends Plugin
{
    public function registerEvents()
    {
        return array(
            'AssetManager.getJavaScriptFiles'        => 'getJsFiles',
            'AssetManager.getStylesheetFiles'        => 'getStylesheetFiles',
            'Translate.getClientSideTranslationKeys' => 'getClientSideTranslationKeys',
            'Db.getTablesInstalled'                  => 'getTablesInstalled',
            'UsersManager.deleteUser'                => 'deleteUser',
            'SitesManager.deleteSite.end'            => 'deleteSite',
            'Controller.CoreHome.index'              => 'notifySharingMoved',
            'PluginManager.pluginActivated'          => 'onPluginActivated',
            'FeinwerkDashboardSharing.copyWidgetOverrides'   => 'onCopyWidgetOverrides',
            'FeinwerkDashboardSharing.deleteWidgetOverrides' => 'onDeleteWidgetOverrides',
        );
    }

    /**
     * Hint for super users: dashboards were shared with the old built-in feature, but the new
     * FeinwerkDashboardSharing plugin is not active. Never allowed to break page rendering.
     */
    public function notifySharingMoved()
    {
        try {
            if (!Piwik::hasUserSuperUserAccess()) {
                return;
            }
            if (Plugin\Manager::getInstance()->isPluginActivated('FeinwerkDashboardSharing')) {
                return;
            }
            try {
                $count = (int) Db::fetchOne('SELECT COUNT(*) FROM ' . Common::prefixTable('shared_dashboard'));
            } catch (\Exception $e) {
                $count = 0; // table does not exist (fresh install)
            }
            if ($count < 1) {
                return;
            }
            $notification = new Notification(Piwik::translate('FeinwerkDashboardSegment_SharingMovedNotice'));
            $notification->context = Notification::CONTEXT_INFO;
            $notification->type = Notification::TYPE_PERSISTENT;
            $notification->flags = Notification::FLAG_CLEAR;
            Notification\Manager::notify('FeinwerkDashboardSegment_SharingMoved', $notification);
        } catch (\Throwable $e) {
            // A hint must never prevent the UI from loading.
        }
    }

    public function getJsFiles(&$jsFiles)
    {
        $jsFiles[] = 'plugins/FeinwerkDashboardSegment/javascripts/dashboardSegment.js';
    }

    public function getStylesheetFiles(&$stylesheets)
    {
        $stylesheets[] = 'plugins/FeinwerkDashboardSegment/stylesheets/dashboardSegment.less';
    }

    public function getClientSideTranslationKeys(&$keys)
    {
        $keys[] = 'FeinwerkDashboardSegment_PickSegment';
        $keys[] = 'FeinwerkDashboardSegment_InheritDefault';
        $keys[] = 'FeinwerkDashboardSegment_NoSegment';
        $keys[] = 'FeinwerkDashboardSegment_DashboardDefaultSegment';
        $keys[] = 'FeinwerkDashboardSegment_CustomSegment';
        $keys[] = 'FeinwerkDashboardSegment_RemoveSegment';
        $keys[] = 'FeinwerkDashboardSegment_PickPeriod';
        $keys[] = 'FeinwerkDashboardSegment_InheritPeriod';
        $keys[] = 'FeinwerkDashboardSegment_RemovePeriod';
        $keys[] = 'FeinwerkDashboardSegment_PeriodToday';
        $keys[] = 'FeinwerkDashboardSegment_PeriodYesterday';
        $keys[] = 'FeinwerkDashboardSegment_PeriodLast7';
        $keys[] = 'FeinwerkDashboardSegment_PeriodLast30';
        $keys[] = 'FeinwerkDashboardSegment_PeriodWeek';
        $keys[] = 'FeinwerkDashboardSegment_PeriodMonth';
        $keys[] = 'FeinwerkDashboardSegment_PeriodYear';
        $keys[] = 'FeinwerkDashboardSegment_SaveError';
        $keys[] = 'FeinwerkDashboardSegment_NewSegment';
        $keys[] = 'FeinwerkDashboardSegment_SearchSegments';
    }

    public function getTablesInstalled(&$allTablesInstalled)
    {
        $allTablesInstalled[] = Common::prefixTable('dashboard_widget_settings');
    }

    public function install()
    {
        (new PredecessorTakeover())->migrateData();
        (new Dao\WidgetSettings())->install();
    }

    public function onPluginActivated($pluginName)
    {
        if ($pluginName === $this->getPluginName()) {
            (new PredecessorTakeover())->retirePredecessor();
        }
    }

    /**
     * The shared_dashboard* tables are owned by the FeinwerkDashboardSharing plugin and are
     * deliberately left in place here.
     */
    public function uninstall()
    {
        (new Dao\WidgetSettings())->uninstall();
    }

    public function deleteUser($userLogin)
    {
        (new Dao\WidgetSettings())->deleteAllForUser($userLogin);
    }

    /**
     * Posted by FeinwerkDashboardSharing when a subscriber's dashboard is (re-)synced: replace the
     * target's widget overrides with a copy of the source's.
     */
    public function onCopyWidgetOverrides($fromLogin, $fromIdDashboard, $toLogin, $toIdDashboard)
    {
        $dao = $this->getWidgetSettingsDao();
        $dao->deleteForDashboard($toLogin, $toIdDashboard);  // re-sync: replace the target's overrides
        $dao->copyForDashboard($fromLogin, $fromIdDashboard, $toLogin, $toIdDashboard);
    }

    /** Posted by FeinwerkDashboardSharing when a linked dashboard goes away. */
    public function onDeleteWidgetOverrides($login, $idDashboard)
    {
        $this->getWidgetSettingsDao()->deleteForDashboard($login, $idDashboard);
    }

    /** Test seam: lets unit tests substitute a fake DAO. */
    protected function getWidgetSettingsDao()
    {
        return new Dao\WidgetSettings();
    }

    /**
     * A deleted site can never be viewed again, so its per-site widget overrides are dead rows.
     * Only the widget settings are per-site.
     */
    public function deleteSite($idSite)
    {
        (new Dao\WidgetSettings())->deleteForSite($idSite);
    }
}
