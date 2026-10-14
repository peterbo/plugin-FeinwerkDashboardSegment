<?php

/**
 * Matomo - free/libre analytics platform
 *
 * @link    https://matomo.org
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\FeinwerkDashboardSegment\tests\Integration\Dao;

use Piwik\Common;
use Piwik\Db;
use Piwik\Plugins\FeinwerkDashboardSegment\Dao\WidgetSettings;
use Piwik\Tests\Framework\TestCase\IntegrationTestCase;

/**
 * @group FeinwerkDashboardSegment
 */
class WidgetSettingsTest extends IntegrationTestCase
{
    /** @var WidgetSettings */
    private $dao;

    public function setUp(): void
    {
        parent::setUp();
        $this->dao = new WidgetSettings();
        $this->dao->install();
    }

    public function test_install_createsTable()
    {
        $table = Common::prefixTable('dashboard_widget_settings');
        $row = Db::fetchOne("SHOW TABLES LIKE '" . $table . "'");
        $this->assertSame($table, $row);
    }

    public function test_setSegment_thenGetAllForDashboard_returnsValue()
    {
        $this->dao->setSegment('alice', 5, 1, 'widgetA', 'referrerType==search');

        $all = $this->dao->getAllForDashboard('alice', 5, 1);
        $this->assertSame('referrerType==search', $all['widgetA']['segment']);
        $this->assertNull($all['widgetA']['period']);
    }

    public function test_setPeriod_thenGetAllForDashboard_returnsValue()
    {
        $this->dao->setPeriod('alice', 5, 1, 'widgetA', 'range', 'last30');

        $all = $this->dao->getAllForDashboard('alice', 5, 1);
        $this->assertSame('range', $all['widgetA']['period']);
        $this->assertSame('last30', $all['widgetA']['date']);
        $this->assertNull($all['widgetA']['segment']);
    }

    public function test_segmentAndPeriod_coexistOnOneRow()
    {
        $this->dao->setSegment('alice', 5, 1, 'widgetA', 'referrerType==search');
        $this->dao->setPeriod('alice', 5, 1, 'widgetA', 'year', 'today');

        $all = $this->dao->getAllForDashboard('alice', 5, 1);
        $this->assertSame('referrerType==search', $all['widgetA']['segment']);
        $this->assertSame('year', $all['widgetA']['period']);
        $this->assertSame('today', $all['widgetA']['date']);
    }

    public function test_clearSegment_keepsRowIfPeriodRemains_elseDeletes()
    {
        $this->dao->setSegment('alice', 5, 1, 'widgetA', 'referrerType==search');
        $this->dao->setPeriod('alice', 5, 1, 'widgetA', 'year', 'today');

        $this->dao->clearSegment('alice', 5, 1, 'widgetA');
        $all = $this->dao->getAllForDashboard('alice', 5, 1);
        $this->assertArrayHasKey('widgetA', $all); // period override keeps the row
        $this->assertNull($all['widgetA']['segment']);

        $this->dao->clearPeriod('alice', 5, 1, 'widgetA');
        $this->assertSame([], $this->dao->getAllForDashboard('alice', 5, 1)); // now empty -> removed
    }

    public function test_isScopedByLoginDashboardAndSite()
    {
        $this->dao->setSegment('alice', 5, 1, 'widgetA', 'aaa');
        $this->dao->setSegment('bob', 5, 1, 'widgetA', 'bbb');
        $this->dao->setSegment('alice', 9, 1, 'widgetA', 'ccc');
        $this->dao->setSegment('alice', 5, 2, 'widgetA', 'ddd');

        $this->assertSame('aaa', $this->dao->getAllForDashboard('alice', 5, 1)['widgetA']['segment']);
        $this->assertSame('ddd', $this->dao->getAllForDashboard('alice', 5, 2)['widgetA']['segment']);
    }

    public function test_deleteAllForUser_removesEverythingForLogin()
    {
        $this->dao->setSegment('alice', 5, 1, 'widgetA', 'aaa');
        $this->dao->setSegment('bob', 5, 1, 'widgetA', 'ccc');

        $this->dao->deleteAllForUser('alice');

        $this->assertSame([], $this->dao->getAllForDashboard('alice', 5, 1));
        $this->assertSame('ccc', $this->dao->getAllForDashboard('bob', 5, 1)['widgetA']['segment']);
    }

    public function test_deleteForSite_removesOnlyThatSite()
    {
        $this->dao->setSegment('alice', 5, 1, 'widgetA', 'site1');
        $this->dao->setSegment('alice', 5, 2, 'widgetA', 'site2');
        $this->dao->setSegment('bob', 9, 1, 'widgetB', 'site1too');

        $this->dao->deleteForSite(1);

        $this->assertSame([], $this->dao->getAllForDashboard('alice', 5, 1));
        $this->assertSame([], $this->dao->getAllForDashboard('bob', 9, 1));
        $this->assertSame('site2', $this->dao->getAllForDashboard('alice', 5, 2)['widgetA']['segment']);
    }
}
