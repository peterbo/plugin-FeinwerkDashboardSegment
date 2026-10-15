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
 * Matomo reuses the highest free id for the next dashboard of a user: overrides left behind by a
 * removed dashboard must never reach a new one.
 *
 * @group FeinwerkDashboardSegment
 */
class DashboardLifecycleObserverTest extends TestCase
{
    /** @var object */
    private $dao;
    /** @var FeinwerkDashboardSegment */
    private $plugin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->dao = new class extends WidgetSettings {
            public $calls = array();
            public function __construct()
            {
            }
            public function deleteForDashboard($login, $idDashboard)
            {
                $this->calls[] = array('delete', $login, $idDashboard);
            }
        };

        $this->plugin = (new \ReflectionClass(new class extends FeinwerkDashboardSegment {
            public $dao;
            public function __construct()
            {
            }
            protected function getWidgetSettingsDao()
            {
                return $this->dao;
            }
            protected function getCurrentLogin()
            {
                return 'me';
            }
        }))->newInstanceWithoutConstructor();
        $this->plugin->dao = $this->dao;
    }

    private static function info(array $parameters)
    {
        return array('module' => 'Dashboard', 'parameters' => $parameters);
    }

    public function test_removeDashboard_deletesItsOverrides()
    {
        $result = null;
        $this->plugin->onDashboardRemoved($result, self::info(array('idDashboard' => '3', 'login' => 'alice')));

        $this->assertSame(array(array('delete', 'alice', 3)), $this->dao->calls);
    }

    public function test_removeDashboard_withoutLogin_usesTheCurrentUser()
    {
        $result = null;
        $this->plugin->onDashboardRemoved($result, self::info(array('idDashboard' => 4, 'login' => '')));

        $this->assertSame(array(array('delete', 'me', 4)), $this->dao->calls);
    }

    public function test_createNewDashboard_dropsOverridesLeftUnderTheNewId()
    {
        $id = 5;
        $this->plugin->onDashboardCreated($id, self::info(array('login' => 'bob', 'dashboardName' => 'x')));

        $this->assertSame(array(array('delete', 'bob', 5)), $this->dao->calls);
    }

    public function test_copyDashboardToUser_dropsOverridesLeftUnderTheCopysId()
    {
        $id = '6';
        $this->plugin->onDashboardCopied($id, self::info(array('idDashboard' => 2, 'copyToUser' => 'carol')));

        $this->assertSame(array(array('delete', 'carol', 6)), $this->dao->calls);
    }

    public function test_withoutAUsableDashboardIdOrLogin_nothingIsDeleted()
    {
        $none = null;
        $zero = 0;
        $this->plugin->onDashboardRemoved($none, self::info(array('login' => 'alice')));
        $this->plugin->onDashboardRemoved($none, self::info(array('idDashboard' => 0, 'login' => 'alice')));
        $this->plugin->onDashboardCreated($zero, self::info(array('login' => 'bob')));
        $this->plugin->onDashboardCreated($none, self::info(array('login' => 'bob')));
        $this->plugin->onDashboardCopied($zero, self::info(array('copyToUser' => '')));
        $this->plugin->onDashboardCreated($zero, array());

        $this->assertSame(array(), $this->dao->calls);
    }

    public function test_registerEvents_wiresTheDashboardApiObservers()
    {
        $events = $this->plugin->registerEvents();

        $this->assertSame('onDashboardRemoved', $events['API.Dashboard.removeDashboard.end']);
        $this->assertSame('onDashboardCreated', $events['API.Dashboard.createNewDashboardForUser.end']);
        $this->assertSame('onDashboardCopied', $events['API.Dashboard.copyDashboardToUser.end']);
    }
}
