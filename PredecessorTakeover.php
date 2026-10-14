<?php

/**
 * Matomo - free/libre analytics platform
 *
 * @link    https://matomo.org
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\FeinwerkDashboardSegment;

use Piwik\Common;
use Piwik\Config;
use Piwik\Db;
use Piwik\Log;
use Piwik\Option;
use Piwik\Plugin\Manager;

/**
 * Takes over from DashboardSegment, the name this plugin was published under before it became
 * FeinwerkDashboardSegment. Every step is idempotent and does nothing once the old plugin is gone.
 *
 * DashboardSegment must never be uninstalled through Matomo after the takeover: its uninstall()
 * would drop the tables this plugin keeps using. It is therefore retired here — deactivated,
 * removed from the installed plugins and deleted — without running its uninstall().
 */
class PredecessorTakeover
{
    public const PREDECESSOR = 'DashboardSegment';

    /**
     * Moves data Matomo stores under the plugin name. Called from install(), i.e. before
     * this plugin creates its own tables.
     */
    public function migrateData(): void
    {
        // On a fresh install with no predecessor there is nothing to migrate; skip the full-table
        // LIKE scans over report/user_dashboard/option (and the two settings UPDATEs) entirely.
        if (!$this->predecessorWasPresent()) {
            return;
        }

        $old = self::PREDECESSOR;
        $new = 'FeinwerkDashboardSegment';

        // Plugin, measurable and user settings are stored per plugin name.
        foreach (['plugin_setting', 'site_setting'] as $table) {
            Db::query(
                'UPDATE IGNORE `' . Common::prefixTable($table) . '` SET plugin_name = ? WHERE plugin_name = ?',
                [$new, $old]
            );
        }

        // Scheduled email reports reference reports as "<Module>_<action>...".
        $reportTable = Common::prefixTable('report');
        $reports = Db::fetchAll("SELECT idreport, reports FROM `$reportTable` WHERE reports LIKE ?", ['%"' . $old . '\_%']);
        foreach ($reports as $row) {
            Db::query(
                "UPDATE `$reportTable` SET reports = ? WHERE idreport = ?",
                [str_replace('"' . $old . '_', '"' . $new . '_', $row['reports']), $row['idreport']]
            );
        }

        // Dashboard layouts reference widgets by module and unique id.
        $dashboardTable = Common::prefixTable('user_dashboard');
        $dashboards = Db::fetchAll("SELECT login, iddashboard, layout FROM `$dashboardTable` WHERE layout LIKE ?", ['%' . $old . '%']);
        foreach ($dashboards as $row) {
            $layout = str_replace(
                ['"module":"' . $old . '"', 'widget' . $old],
                ['"module":"' . $new . '"', 'widget' . $new],
                $row['layout']
            );
            Db::query(
                "UPDATE `$dashboardTable` SET layout = ? WHERE login = ? AND iddashboard = ?",
                [$layout, $row['login'], $row['iddashboard']]
            );
        }

        // Remembered table/graph settings are keyed by "<login>_<Module>.<action>".
        $optionTable = Common::prefixTable('option');
        $options = Db::fetchAll(
            "SELECT option_name FROM `$optionTable` WHERE option_name LIKE ?",
            ['viewDataTableParameters\_%\_' . $old . '.%']
        );
        foreach ($options as $row) {
            Db::query(
                "UPDATE IGNORE `$optionTable` SET option_name = ? WHERE option_name = ?",
                [str_replace('_' . $old . '.', '_' . $new . '.', $row['option_name']), $row['option_name']]
            );
        }
    }

    /**
     * Deactivates and forgets the predecessor without running its uninstall(). Called once
     * this plugin has been activated (event PluginManager.pluginActivated).
     */
    public function retirePredecessor(): void
    {
        $old = self::PREDECESSOR;
        $manager = Manager::getInstance();

        try {
            $manager->deactivatePlugin($old);
        } catch (\Throwable $e) {
            Log::warning('FeinwerkDashboardSegment: could not deactivate ' . $old . ': ' . $e->getMessage());
        }

        // Forget the predecessor in the config — also as fallback if deactivating it failed.
        $config = Config::getInstance();
        $changed = false;
        foreach (['Plugins' => 'Plugins', 'PluginsInstalled' => 'PluginsInstalled'] as $sectionName => $key) {
            $section = $config->$sectionName;
            $list = $section[$key] ?? [];
            if (in_array($old, $list, true)) {
                $section[$key] = array_values(array_diff($list, [$old]));
                $config->$sectionName = $section;
                $changed = true;
            }
        }
        if ($changed) {
            $config->forceSave();
        }

        foreach (['version_' . $old, 'LastPluginActivation.' . $old, 'LastPluginDeactivation.' . $old] as $option) {
            Option::delete($option);
        }

        if ($this->isPredecessorOnDisk()) {
            try {
                Manager::deletePluginFromFilesystem($old);
            } catch (\Throwable $e) {
                Log::warning('FeinwerkDashboardSegment: could not delete the folder of ' . $old . ': ' . $e->getMessage());
            }
        }
    }

    /**
     * Whether the predecessor plugin was ever present on this instance. Any one signal is enough;
     * a plugin that was installed always left its version option, so this never misses a real
     * predecessor while skipping the migration on a clean install.
     */
    private function predecessorWasPresent(): bool
    {
        if (Option::get('version_' . self::PREDECESSOR) !== false) {
            return true;
        }
        $config = Config::getInstance();
        foreach (['Plugins', 'PluginsInstalled'] as $sectionName) {
            $section = $config->$sectionName;
            if (in_array(self::PREDECESSOR, $section[$sectionName] ?? [], true)) {
                return true;
            }
        }
        return $this->isPredecessorOnDisk();
    }

    private function isPredecessorOnDisk(): bool
    {
        $manifest = Manager::getPluginDirectory(self::PREDECESSOR) . '/plugin.json';
        if (!is_file($manifest)) {
            return false;
        }
        $json = json_decode((string) file_get_contents($manifest), true);

        return is_array($json) && ($json['name'] ?? null) === self::PREDECESSOR;
    }
}
