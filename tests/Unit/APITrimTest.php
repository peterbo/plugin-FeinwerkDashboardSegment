<?php

/**
 * Matomo - free/libre analytics platform
 *
 * @link    https://matomo.org
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\FeinwerkDashboardSegment\tests\Unit;

use PHPUnit\Framework\TestCase;
use Piwik\Plugins\FeinwerkDashboardSegment\API;
use Piwik\Plugins\FeinwerkDashboardSegment\Dao\WidgetSettings;
use Piwik\Plugins\FeinwerkDashboardSegment\SegmentResolver;

/**
 * Matomo 6 no longer trims API request parameters, so the API trims every string it stores: a padded value must be
 * stored without its spaces, and a value of only spaces clears the override like an empty one.
 *
 * @group FeinwerkDashboardSegment
 */
class APITrimTest extends TestCase
{
    /** @var object */
    private $dao;
    /** @var API */
    private $api;

    protected function setUp(): void
    {
        parent::setUp();

        // Records every write; extends the real DAO but never touches the database.
        $this->dao = new class extends WidgetSettings {
            public $calls = array();
            public function __construct()
            {
            }
            public function setSegment($login, $idDashboard, $idSite, $widgetUniqueId, $segment)
            {
                $this->calls[] = array('setSegment', $login, $idDashboard, $idSite, $widgetUniqueId, $segment);
            }
            public function clearSegment($login, $idDashboard, $idSite, $widgetUniqueId)
            {
                $this->calls[] = array('clearSegment', $login, $idDashboard, $idSite, $widgetUniqueId);
            }
            public function setPeriod($login, $idDashboard, $idSite, $widgetUniqueId, $period, $date)
            {
                $this->calls[] = array('setPeriod', $login, $idDashboard, $idSite, $widgetUniqueId, $period, $date);
            }
            public function clearPeriod($login, $idDashboard, $idSite, $widgetUniqueId)
            {
                $this->calls[] = array('clearPeriod', $login, $idDashboard, $idSite, $widgetUniqueId);
            }
        };

        // The access check needs Matomo's container; the integration tests cover it.
        $this->api = new class ($this->dao) extends API {
            protected function checkAndGetLogin(int $idSite): string
            {
                return 'alice';
            }
        };
    }

    public function test_setWidgetSegment_storesTrimmedInstanceIdAndSegment()
    {
        $this->api->setWidgetSegment(5, 1, ' widgetA ', ' referrerType==search ');

        $this->assertSame(
            array(array('setSegment', 'alice', 5, 1, 'widgetA', 'referrerType==search')),
            $this->dao->calls
        );
    }

    public function test_setWidgetSegment_noneValueWithSpaces_isStoredAsNone()
    {
        $this->api->setWidgetSegment(5, 1, 'widgetA', ' ' . SegmentResolver::NONE . ' ');

        $this->assertSame(
            array(array('setSegment', 'alice', 5, 1, 'widgetA', SegmentResolver::NONE)),
            $this->dao->calls
        );
    }

    public function test_setWidgetSegment_onlySpaces_clearsOverride()
    {
        $this->api->setWidgetSegment(5, 1, ' widgetA ', '   ');

        $this->assertSame(array(array('clearSegment', 'alice', 5, 1, 'widgetA')), $this->dao->calls);
    }

    public function test_setWidgetPeriod_storesTrimmedValues()
    {
        $this->api->setWidgetPeriod(5, 1, ' widgetA ', ' range ', ' last30 ');

        $this->assertSame(
            array(array('setPeriod', 'alice', 5, 1, 'widgetA', 'range', 'last30')),
            $this->dao->calls
        );
    }

    public function test_setWidgetPeriod_onlySpaces_clearsOverride()
    {
        $this->api->setWidgetPeriod(5, 1, ' widgetA ', ' ', ' ');

        $this->assertSame(array(array('clearPeriod', 'alice', 5, 1, 'widgetA')), $this->dao->calls);
    }

    public function test_setDashboardDefaultSegment_storesTrimmedSegment()
    {
        $this->api->setDashboardDefaultSegment(5, 1, ' browserCode==ff ');

        $this->assertSame(
            array(array('setSegment', 'alice', 5, 1, SegmentResolver::DEFAULT_WIDGET_ID, 'browserCode==ff')),
            $this->dao->calls
        );
    }

    public function test_setDashboardDefaultSegment_onlySpaces_clearsDefault()
    {
        $this->api->setDashboardDefaultSegment(5, 1, '  ');

        $this->assertSame(
            array(array('clearSegment', 'alice', 5, 1, SegmentResolver::DEFAULT_WIDGET_ID)),
            $this->dao->calls
        );
    }
}
