<?php

/**
 * Matomo - free/libre analytics platform
 *
 * @link    https://matomo.org
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\FeinwerkDashboardSegment\tests\Unit;

use Piwik\Plugins\FeinwerkDashboardSegment\SegmentResolver;
use PHPUnit\Framework\TestCase;

/**
 * @group FeinwerkDashboardSegment
 */
class SegmentResolverTest extends TestCase
{
    public function test_specificOverride_winsAndSetsSegment()
    {
        $this->assertSame(
            ['action' => 'set', 'segment' => 'referrerType==search'],
            SegmentResolver::resolve('referrerType==search', 'browserCode==ff')
        );
    }

    public function test_overrideNone_removesSegment_evenWithDefault()
    {
        $this->assertSame(
            ['action' => 'remove'],
            SegmentResolver::resolve(SegmentResolver::NONE, 'browserCode==ff')
        );
    }

    public function test_noOverride_usesDefault()
    {
        $this->assertSame(
            ['action' => 'set', 'segment' => 'browserCode==ff'],
            SegmentResolver::resolve(null, 'browserCode==ff')
        );
    }

    public function test_noOverride_defaultNone_removes()
    {
        $this->assertSame(
            ['action' => 'remove'],
            SegmentResolver::resolve(null, SegmentResolver::NONE)
        );
    }

    public function test_noOverride_noDefault_inherits()
    {
        $this->assertSame(
            ['action' => 'inherit'],
            SegmentResolver::resolve(null, null)
        );
    }

    public function test_emptyStringTreatedAsNoValue()
    {
        $this->assertSame(
            ['action' => 'inherit'],
            SegmentResolver::resolve('', '')
        );
    }
}
