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
use Piwik\Updater;
use Piwik\Updater\Migration\Factory as MigrationFactory;
use Piwik\Updates as PiwikUpdates;

/**
 * Adds the `idsite` column to dashboard_widget_settings and includes it in the primary key, so
 * per-widget/default segments are scoped per site. Schema-checked, so it is a no-op on installs
 * that already have the site-scoped schema (e.g. created fresh by the current Dao).
 */
class Updates_0_2_0 extends PiwikUpdates
{
    /** @var MigrationFactory */
    private $migration;

    public function __construct(MigrationFactory $factory)
    {
        $this->migration = $factory;
    }

    public function getMigrations(Updater $updater)
    {
        $table = Common::prefixTable('dashboard_widget_settings');

        // Only migrate installs that still have the pre-site schema.
        $hasIdSite = Db::fetchOne("SHOW COLUMNS FROM `" . $table . "` LIKE 'idsite'");
        if ($hasIdSite) {
            return array();
        }

        return array(
            // Pre-site overrides cannot be mapped to a site reliably; drop them.
            $this->migration->db->sql('DELETE FROM `' . $table . '`'),
            $this->migration->db->sql(
                'ALTER TABLE `' . $table . '` ADD COLUMN `idsite` INT(10) UNSIGNED NOT NULL DEFAULT 0 AFTER `iddashboard`'
            ),
            $this->migration->db->sql(
                'ALTER TABLE `' . $table . '` DROP PRIMARY KEY, '
                . 'ADD PRIMARY KEY (`login`, `iddashboard`, `idsite`, `widget_uniqueid`)'
            ),
        );
    }

    public function doUpdate(Updater $updater)
    {
        $updater->executeMigrations(__FILE__, $this->getMigrations($updater));
    }
}
