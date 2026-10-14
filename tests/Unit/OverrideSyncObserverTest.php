<?php

/**
 * Matomo - free/libre analytics platform
 *
 * @link    https://matomo.org
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\FeinwerkDashboardSegment\tests\Unit;

use PHPUnit\Framework\TestCase;
use Piwik\Plugins\FeinwerkDashboardSegment\Dao\WidgetSettings;
use Piwik\Plugins\FeinwerkDashboardSegment\FeinwerkDashboardSegment;

/**
 * The FeinwerkDashboardSharing plugin posts these events; this plugin keeps the per-widget
 * overrides of a linked dashboard in sync.
 *
 * @group FeinwerkDashboardSegment
 */
class OverrideSyncObserverTest extends TestCase
{
    /** @var object */
    private $dao;
    /** @var FeinwerkDashboardSegment */
    private $plugin;

    protected function setUp(): void
    {
        parent::setUp();

        // Records every call in order; extends the real DAO but never touches the database
        // (its constructor is skipped, all used methods are overridden).
        $this->dao = new class extends WidgetSettings {
            public $calls = array();
            public function __construct()
            {
            }
            public function deleteForDashboard($login, $idDashboard)
            {
                $this->calls[] = array('delete', $login, $idDashboard);
            }
            public function copyForDashboard($fromLogin, $fromIdDashboard, $toLogin, $toIdDashboard)
            {
                $this->calls[] = array('copy', $fromLogin, $fromIdDashboard, $toLogin, $toIdDashboard);
            }
        };

        $dao = $this->dao;
        $this->plugin = (new \ReflectionClass(new class extends FeinwerkDashboardSegment {
            public $dao;
            public function __construct()
            {
            }
            protected function getWidgetSettingsDao()
            {
                return $this->dao;
            }
        }))->newInstanceWithoutConstructor();
        $this->plugin->dao = $dao;
    }

    public function test_copy_deletesTargetThenCopiesFromSource()
    {
        $this->plugin->onCopyWidgetOverrides('owner', 1, 'sub', 2);

        $this->assertSame(array(
            array('delete', 'sub', 2),
            array('copy', 'owner', 1, 'sub', 2),
        ), $this->dao->calls);
    }

    public function test_delete_deletesOverridesOfThatDashboardOnly()
    {
        $this->plugin->onDeleteWidgetOverrides('sub', 2);

        $this->assertSame(array(array('delete', 'sub', 2)), $this->dao->calls);
    }

    public function test_registerEvents_wiresBothObservers()
    {
        $events = $this->plugin->registerEvents();

        $this->assertSame('onCopyWidgetOverrides', $events['FeinwerkDashboardSharing.copyWidgetOverrides']);
        $this->assertSame('onDeleteWidgetOverrides', $events['FeinwerkDashboardSharing.deleteWidgetOverrides']);
    }
}
