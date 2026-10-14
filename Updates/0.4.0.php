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
 * Adds the dashboard sharing tables (registry + targets + subscription links). Schema-checked, so
 * it is a no-op on installs that already have them (e.g. created fresh by the current Dao).
 */
class Updates_0_4_0 extends PiwikUpdates
{
    /** @var MigrationFactory */
    private $migration;

    public function __construct(MigrationFactory $factory)
    {
        $this->migration = $factory;
    }

    public function getMigrations(Updater $updater)
    {
        $existing = Db::fetchOne("SHOW TABLES LIKE '" . Common::prefixTable('shared_dashboard') . "'");
        if ($existing) {
            return array();
        }

        return array(
            $this->migration->db->createTable('shared_dashboard', array(
                'idshare'      => 'INT(10) UNSIGNED NOT NULL AUTO_INCREMENT',
                'owner_login'  => 'VARCHAR(100) NOT NULL',
                'iddashboard'  => 'INT(10) UNSIGNED NOT NULL',
                'name'         => "VARCHAR(150) NOT NULL DEFAULT ''",
                'share_to_all' => 'TINYINT(1) UNSIGNED NOT NULL DEFAULT 0',
                'ts_created'   => 'DATETIME NULL DEFAULT NULL',
            ), 'idshare'),

            $this->migration->db->createTable('shared_dashboard_target', array(
                'idshare'      => 'INT(10) UNSIGNED NOT NULL',
                'target_login' => 'VARCHAR(100) NOT NULL',
            ), array('idshare', 'target_login')),

            $this->migration->db->createTable('shared_dashboard_link', array(
                'subscriber_login' => 'VARCHAR(100) NOT NULL',
                'iddashboard'      => 'INT(10) UNSIGNED NOT NULL',
                'idshare'          => 'INT(10) UNSIGNED NOT NULL',
            ), array('subscriber_login', 'iddashboard')),
        );
    }

    public function doUpdate(Updater $updater)
    {
        $updater->executeMigrations(__FILE__, $this->getMigrations($updater));
    }
}
