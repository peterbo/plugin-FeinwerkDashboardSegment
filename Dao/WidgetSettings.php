<?php

/**
 * Matomo - free/libre analytics platform
 *
 * @link    https://matomo.org
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\FeinwerkDashboardSegment\Dao;

use Piwik\Common;
use Piwik\Db;
use Piwik\DbHelper;

/**
 * One row per (login, dashboard, site, widget instance). A row may carry a segment override
 * and/or a period/date override independently; the row is removed once neither remains.
 */
class WidgetSettings
{
    private $table = 'dashboard_widget_settings';
    private $tablePrefixed;

    public function __construct()
    {
        $this->tablePrefixed = Common::prefixTable($this->table);
    }

    public function install()
    {
        DbHelper::createTable($this->table, "
            `login` VARCHAR(100) NOT NULL,
            `iddashboard` INT(10) UNSIGNED NOT NULL,
            `idsite` INT(10) UNSIGNED NOT NULL,
            `widget_uniqueid` VARCHAR(255) NOT NULL,
            `segment` TEXT NULL DEFAULT NULL,
            `period` VARCHAR(50) NULL DEFAULT NULL,
            `date` VARCHAR(50) NULL DEFAULT NULL,
            PRIMARY KEY (`login`, `iddashboard`, `idsite`, `widget_uniqueid`)");
    }

    public function uninstall()
    {
        Db::query(sprintf('DROP TABLE IF EXISTS `%s`', $this->tablePrefixed));
    }

    /** Upsert only the segment column (leaves any period/date override untouched). */
    public function setSegment($login, $idDashboard, $idSite, $widgetUniqueId, $segment)
    {
        $sql = sprintf(
            'INSERT INTO `%s` (`login`, `iddashboard`, `idsite`, `widget_uniqueid`, `segment`)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE `segment` = VALUES(`segment`)',
            $this->tablePrefixed
        );
        Db::query($sql, array($login, (int) $idDashboard, (int) $idSite, $widgetUniqueId, $segment));
    }

    /** Upsert only the period/date columns (leaves any segment override untouched). */
    public function setPeriod($login, $idDashboard, $idSite, $widgetUniqueId, $period, $date)
    {
        $sql = sprintf(
            'INSERT INTO `%s` (`login`, `iddashboard`, `idsite`, `widget_uniqueid`, `period`, `date`)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE `period` = VALUES(`period`), `date` = VALUES(`date`)',
            $this->tablePrefixed
        );
        Db::query($sql, array($login, (int) $idDashboard, (int) $idSite, $widgetUniqueId, $period, $date));
    }

    public function clearSegment($login, $idDashboard, $idSite, $widgetUniqueId)
    {
        Db::query(
            sprintf('UPDATE `%s` SET `segment` = NULL WHERE `login` = ? AND `iddashboard` = ? AND `idsite` = ? AND `widget_uniqueid` = ?', $this->tablePrefixed),
            array($login, (int) $idDashboard, (int) $idSite, $widgetUniqueId)
        );
        $this->deleteIfEmpty($login, $idDashboard, $idSite, $widgetUniqueId);
    }

    public function clearPeriod($login, $idDashboard, $idSite, $widgetUniqueId)
    {
        Db::query(
            sprintf('UPDATE `%s` SET `period` = NULL, `date` = NULL WHERE `login` = ? AND `iddashboard` = ? AND `idsite` = ? AND `widget_uniqueid` = ?', $this->tablePrefixed),
            array($login, (int) $idDashboard, (int) $idSite, $widgetUniqueId)
        );
        $this->deleteIfEmpty($login, $idDashboard, $idSite, $widgetUniqueId);
    }

    private function deleteIfEmpty($login, $idDashboard, $idSite, $widgetUniqueId)
    {
        Db::query(
            sprintf("DELETE FROM `%s` WHERE `login` = ? AND `iddashboard` = ? AND `idsite` = ? AND `widget_uniqueid` = ?
                     AND (`segment` IS NULL OR `segment` = '') AND `period` IS NULL", $this->tablePrefixed),
            array($login, (int) $idDashboard, (int) $idSite, $widgetUniqueId)
        );
    }

    /**
     * @return array<string,array{segment:?string,period:?string,date:?string}>
     */
    public function getAllForDashboard($login, $idDashboard, $idSite)
    {
        $rows = Db::fetchAll(
            sprintf('SELECT `widget_uniqueid`, `segment`, `period`, `date` FROM `%s` WHERE `login` = ? AND `iddashboard` = ? AND `idsite` = ?', $this->tablePrefixed),
            array($login, (int) $idDashboard, (int) $idSite)
        );

        $map = array();
        foreach ($rows as $row) {
            $map[$row['widget_uniqueid']] = array(
                'segment' => $row['segment'],
                'period'  => $row['period'],
                'date'    => $row['date'],
            );
        }
        return $map;
    }

    public function deleteAllForUser($login)
    {
        Db::query(
            sprintf('DELETE FROM `%s` WHERE `login` = ?', $this->tablePrefixed),
            array($login)
        );
    }

    /** Remove every override row for one site (all users/dashboards). Used when a site is deleted. */
    public function deleteForSite($idSite)
    {
        Db::query(
            sprintf('DELETE FROM `%s` WHERE `idsite` = ?', $this->tablePrefixed),
            array((int) $idSite)
        );
    }

    /** Remove all overrides for one dashboard (all sites). Used before re-syncing a linked dashboard. */
    public function deleteForDashboard($login, $idDashboard)
    {
        Db::query(
            sprintf('DELETE FROM `%s` WHERE `login` = ? AND `iddashboard` = ?', $this->tablePrefixed),
            array($login, (int) $idDashboard)
        );
    }

    /** Copy every override row of one dashboard to another (login + dashboard), across all sites. */
    public function copyForDashboard($fromLogin, $fromIdDashboard, $toLogin, $toIdDashboard)
    {
        $rows = Db::fetchAll(
            sprintf('SELECT `idsite`, `widget_uniqueid`, `segment`, `period`, `date` FROM `%s` WHERE `login` = ? AND `iddashboard` = ?', $this->tablePrefixed),
            array($fromLogin, (int) $fromIdDashboard)
        );
        $db = Db::get();
        foreach ($rows as $row) {
            $db->insert($this->tablePrefixed, array(
                'login'           => $toLogin,
                'iddashboard'     => (int) $toIdDashboard,
                'idsite'          => (int) $row['idsite'],
                'widget_uniqueid' => $row['widget_uniqueid'],
                'segment'         => $row['segment'],
                'period'          => $row['period'],
                'date'            => $row['date'],
            ));
        }
    }
}
