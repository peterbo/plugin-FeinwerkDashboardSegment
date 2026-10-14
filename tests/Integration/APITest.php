<?php

/**
 * Matomo - free/libre analytics platform
 *
 * @link    https://matomo.org
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\FeinwerkDashboardSegment\tests\Integration;

use Piwik\Plugins\FeinwerkDashboardSegment\API;
use Piwik\Plugins\FeinwerkDashboardSegment\Dao\WidgetSettings;
use Piwik\Tests\Framework\Mock\FakeAccess;
use Piwik\Tests\Framework\TestCase\IntegrationTestCase;

/**
 * @group FeinwerkDashboardSegment
 */
class APITest extends IntegrationTestCase
{
    /** @var API */
    private $api;

    public function setUp(): void
    {
        parent::setUp();
        (new WidgetSettings())->install();
        $this->api = API::getInstance();

        FakeAccess::$superUser = false;
        FakeAccess::$identity = 'alice';
        FakeAccess::$idSitesView = array(1, 2);
    }

    public function test_setWidgetSegment_persistsForCurrentUser()
    {
        $this->api->setWidgetSegment(5, 1, 'widgetA', 'referrerType==search');

        $settings = $this->api->getWidgetSettings(5, 1);
        $this->assertSame('referrerType==search', $settings['widgets']['widgetA']['segment']);
    }

    public function test_setWidgetPeriod_persists()
    {
        $this->api->setWidgetPeriod(5, 1, 'widgetA', 'range', 'last30');

        $settings = $this->api->getWidgetSettings(5, 1);
        $this->assertSame('range', $settings['widgets']['widgetA']['period']);
        $this->assertSame('last30', $settings['widgets']['widgetA']['date']);
    }

    public function test_setWidgetSegment_emptyValue_clearsOverride()
    {
        $this->api->setWidgetSegment(5, 1, 'widgetA', 'referrerType==search');
        $this->api->setWidgetSegment(5, 1, 'widgetA', '');

        $settings = $this->api->getWidgetSettings(5, 1);
        $this->assertArrayNotHasKey('widgetA', $settings['widgets']);
    }

    public function test_overridesAreScopedPerSite()
    {
        $this->api->setWidgetSegment(5, 1, 'widgetA', 'referrerType==search');
        $this->api->setWidgetSegment(5, 2, 'widgetA', 'browserCode==ff');

        $this->assertSame('referrerType==search', $this->api->getWidgetSettings(5, 1)['widgets']['widgetA']['segment']);
        $this->assertSame('browserCode==ff', $this->api->getWidgetSettings(5, 2)['widgets']['widgetA']['segment']);
    }

    public function test_setDashboardDefaultSegment_storedUnderDefault()
    {
        $this->api->setDashboardDefaultSegment(5, 1, 'browserCode==ff');

        $settings = $this->api->getWidgetSettings(5, 1);
        $this->assertSame('browserCode==ff', $settings['default']);
        $this->assertArrayNotHasKey('__dashboard_default__', $settings['widgets']);
    }

    public function test_anonymous_isRejected()
    {
        FakeAccess::$identity = 'anonymous';

        // Matomo's wording differs across versions (checkUserIsNotAnonymous vs
        // General_YouMustBeLoggedIn) — only the rejection itself matters.
        $this->expectExceptionMessageMatches('/checkUserIsNotAnonymous|YouMustBeLoggedIn/');
        $this->api->setWidgetSegment(5, 1, 'widgetA', 'referrerType==search');
    }

    public function test_rejectsNonPositiveIdSite()
    {
        // A superuser passes checkUserHasViewAccess(0); the explicit guard must still reject idSite<=0
        // so overrides are never stored under the bucket idsite=0.
        FakeAccess::$superUser = true;

        $this->expectExceptionMessageMatches('/Invalid idSite/');
        $this->api->setWidgetSegment(5, 0, 'widgetA', 'referrerType==search');
    }

    public function provideContainerConfig()
    {
        return array(
            'Piwik\Access' => new FakeAccess(),
        );
    }
}