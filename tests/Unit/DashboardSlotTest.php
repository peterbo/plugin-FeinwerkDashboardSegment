<?php

/**
 * Matomo - free/libre analytics platform
 *
 * @link    https://matomo.org
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\FeinwerkDashboardSegment\tests\Unit;

use PHPUnit\Framework\TestCase;
use Piwik\Plugins\FeinwerkDashboardSegment\FeinwerkDashboardSegment;

/**
 * Matomo (from 5.14.1 on, and 6) renders content above the dashboard widgets through Template.beforeDashboardWidgets;
 * the plugin puts a slot there that the script fills with the dashboard default segment control.
 *
 * @group FeinwerkDashboardSegment
 */
class DashboardSlotTest extends TestCase
{
    /** @var FeinwerkDashboardSegment */
    private $plugin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->plugin = (new \ReflectionClass(FeinwerkDashboardSegment::class))->newInstanceWithoutConstructor();
    }

    public function test_registersTheDashboardEvent()
    {
        $events = $this->plugin->registerEvents();

        $this->assertSame('renderDefaultSegmentSlot', $events['Template.beforeDashboardWidgets'] ?? null);
    }

    public function test_appendsTheSlotToOtherPluginsOutput()
    {
        $out = '<div class="other"></div>';

        $this->plugin->renderDefaultSegmentSlot($out);

        $this->assertSame('<div class="other"></div><div id="fwds-default-slot"></div>', $out);
    }
}
