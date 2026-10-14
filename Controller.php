<?php

/**
 * Matomo - free/libre analytics platform
 *
 * @link    https://matomo.org
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\FeinwerkDashboardSegment;

use Piwik\Common;
use Piwik\DataTable\Renderer\Json;
use Piwik\Piwik;

class Controller extends \Piwik\Plugin\Controller
{
    /**
     * Returns the resolved override map for a dashboard on a site:
     * {
     *   "widgets": {
     *     "<instanceId>": {
     *       "segment": {"action":"set","segment":"..."} | {"action":"remove"},   // optional
     *       "period":  {"period":"day","date":"today"}                            // optional
     *     }
     *   },
     *   "defaultAction": {"action":"set","segment":"..."} | {"action":"remove"} | null
     * }
     */
    public function getSettings()
    {
        Piwik::checkUserIsNotAnonymous();
        $idDashboard = Common::getRequestVar('idDashboard', 1, 'int');
        $idSite      = Common::getRequestVar('idSite', 0, 'int');

        $settings = API::getInstance()->getWidgetSettings($idDashboard, $idSite);

        $widgets = array();
        foreach ($settings['widgets'] as $uniqueId => $row) {
            $entry = array();
            if ($row['segment'] !== null && $row['segment'] !== '') {
                // Per-widget override always wins, so resolve with no default.
                $entry['segment'] = SegmentResolver::resolve($row['segment'], null);
            }
            if ($row['period'] !== null && $row['period'] !== '') {
                $entry['period'] = array('period' => $row['period'], 'date' => $row['date']);
            }
            if (!empty($entry)) {
                $widgets[$uniqueId] = $entry;
            }
        }

        $defaultAction = null;
        if ($settings['default'] !== null) {
            $defaultAction = SegmentResolver::resolve(null, $settings['default']);
        }

        Json::sendHeaderJSON();
        return json_encode(array(
            'widgets'       => (object) $widgets,
            'defaultAction' => $defaultAction,
        ));
    }

    public function saveWidgetSegment()
    {
        $this->checkTokenInUrl();
        Piwik::checkUserIsNotAnonymous();

        $idDashboard    = Common::getRequestVar('idDashboard', 1, 'int');
        $idSite         = Common::getRequestVar('idSite', 0, 'int');
        $widgetUniqueId = Common::getRequestVar('widgetUniqueId', '', 'string');
        // Read our value under a dedicated param name ('segmentValue'), NOT 'segment':
        // ajaxHelper auto-injects the page's global 'segment'/'period'/'date' into every request,
        // which would otherwise clobber the value we want to store.
        // getRequestVar HTML-sanitizes (e.g. '>' => '&gt;'); reverse it to store the raw definition.
        $segment        = Common::unsanitizeInputValue(Common::getRequestVar('segmentValue', '', 'string'));

        API::getInstance()->setWidgetSegment($idDashboard, $idSite, $widgetUniqueId, $segment);

        Json::sendHeaderJSON();
        return json_encode(array('result' => 'success'));
    }

    public function saveWidgetPeriod()
    {
        $this->checkTokenInUrl();
        Piwik::checkUserIsNotAnonymous();

        $idDashboard    = Common::getRequestVar('idDashboard', 1, 'int');
        $idSite         = Common::getRequestVar('idSite', 0, 'int');
        $widgetUniqueId = Common::getRequestVar('widgetUniqueId', '', 'string');
        // Distinct names so ajaxHelper's auto 'period'/'date' don't clobber ours.
        $period         = Common::getRequestVar('periodValue', '', 'string');
        $date           = Common::getRequestVar('dateValue', '', 'string');

        API::getInstance()->setWidgetPeriod($idDashboard, $idSite, $widgetUniqueId, $period, $date);

        Json::sendHeaderJSON();
        return json_encode(array('result' => 'success'));
    }

    public function saveDashboardDefault()
    {
        $this->checkTokenInUrl();
        Piwik::checkUserIsNotAnonymous();

        $idDashboard = Common::getRequestVar('idDashboard', 1, 'int');
        $idSite      = Common::getRequestVar('idSite', 0, 'int');
        // See saveWidgetSegment(): read 'segmentValue' (not 'segment') and un-sanitize it.
        $segment     = Common::unsanitizeInputValue(Common::getRequestVar('segmentValue', '', 'string'));

        API::getInstance()->setDashboardDefaultSegment($idDashboard, $idSite, $segment);

        Json::sendHeaderJSON();
        return json_encode(array('result' => 'success'));
    }

    /**
     * Returns the segments available to the current (logged-in) user for a site, as
     * [{definition, name}, ...]. Routed through this controller (not a direct module=API
     * call) so it runs in the authenticated UI session instead of as the anonymous user.
     */
    public function getSegments()
    {
        Piwik::checkUserIsNotAnonymous();
        $idSite = Common::getRequestVar('idSite', 0, 'int');

        $segments = \Piwik\Plugins\SegmentEditor\API::getInstance()->getAll($idSite ?: null);

        $result = array();
        foreach ($segments as $segment) {
            $result[] = array(
                'definition' => $segment['definition'],
                'name'       => $segment['name'],
            );
        }

        Json::sendHeaderJSON();
        return json_encode($result);
    }
}
