import { EuiProvider, EuiThemeColorMode } from '@elastic/eui'
import { appendIconComponentCache } from '@elastic/eui/es/components/icon/icon'
import DashboardContainer from './components/dashboard/DashboardContainer'
import { useTheme } from './hooks/useTheme'

// Import icons used in the dashboard
import { icon as EuiIconDashboard } from '@elastic/eui/es/components/icon/assets/app_dashboard'
import { icon as EuiIconCompute } from '@elastic/eui/es/components/icon/assets/compute'
import { icon as EuiIconList } from '@elastic/eui/es/components/icon/assets/list'
import { icon as EuiIconBranch } from '@elastic/eui/es/components/icon/assets/branch'
import { icon as EuiIconGear } from '@elastic/eui/es/components/icon/assets/gear'
import { icon as EuiIconRefresh } from '@elastic/eui/es/components/icon/assets/refresh'
import { icon as EuiIconExport } from '@elastic/eui/es/components/icon/assets/export'
import { icon as EuiIconMoon } from '@elastic/eui/es/components/icon/assets/moon'
import { icon as EuiIconSun } from '@elastic/eui/es/components/icon/assets/sun'
import { icon as EuiIconCheck } from '@elastic/eui/es/components/icon/assets/checkInCircleFilled'
import { icon as EuiIconCheckmark } from '@elastic/eui/es/components/icon/assets/check'
import { icon as EuiIconCross } from '@elastic/eui/es/components/icon/assets/crossInCircle'
import { icon as EuiIconGauge } from '@elastic/eui/es/components/icon/assets/vis_gauge'
import { icon as EuiIconCalendar } from '@elastic/eui/es/components/icon/assets/calendar'
import { icon as EuiIconArrowDown } from '@elastic/eui/es/components/icon/assets/arrow_down'
import { icon as EuiIconTimeRefresh } from '@elastic/eui/es/components/icon/assets/timeRefresh'
import { icon as EuiIconAlert } from '@elastic/eui/es/components/icon/assets/alert'
import { icon as EuiIconDot } from '@elastic/eui/es/components/icon/assets/dot'
import { icon as EuiIconPlay } from '@elastic/eui/es/components/icon/assets/play'
import { icon as EuiIconArrowLeft } from '@elastic/eui/es/components/icon/assets/arrow_left'
import { icon as EuiIconArrowRight } from '@elastic/eui/es/components/icon/assets/arrow_right'
import { icon as EuiIconSortUp } from '@elastic/eui/es/components/icon/assets/sort_up'
import { icon as EuiIconSortDown } from '@elastic/eui/es/components/icon/assets/sort_down'
import { icon as EuiIconSearch } from '@elastic/eui/es/components/icon/assets/search'
import { icon as EuiIconSortable } from '@elastic/eui/es/components/icon/assets/sortable'
import { icon as EuiIconTrash } from '@elastic/eui/es/components/icon/assets/trash'
import { icon as EuiIconHeart } from '@elastic/eui/es/components/icon/assets/heart'
import { icon as EuiIconBolt } from '@elastic/eui/es/components/icon/assets/bolt'
import { icon as EuiIconUsers } from '@elastic/eui/es/components/icon/assets/users'
import { icon as EuiIconStats } from '@elastic/eui/es/components/icon/assets/stats'
import { icon as EuiIconClock } from '@elastic/eui/es/components/icon/assets/clock'
import { icon as EuiIconCrossPlain } from '@elastic/eui/es/components/icon/assets/cross'

// Cache icons for EUI
appendIconComponentCache({
  dashboardApp: EuiIconDashboard,
  compute: EuiIconCompute,
  list: EuiIconList,
  branch: EuiIconBranch,
  gear: EuiIconGear,
  refresh: EuiIconRefresh,
  exportAction: EuiIconExport,
  moon: EuiIconMoon,
  sun: EuiIconSun,
  checkInCircleFilled: EuiIconCheck,
  check: EuiIconCheckmark,
  crossInCircle: EuiIconCross,
  visGauge: EuiIconGauge,
  calendar: EuiIconCalendar,
  arrowDown: EuiIconArrowDown,
  timeRefresh: EuiIconTimeRefresh,
  alert: EuiIconAlert,
  dot: EuiIconDot,
  play: EuiIconPlay,
  arrowLeft: EuiIconArrowLeft,
  arrowRight: EuiIconArrowRight,
  sortUp: EuiIconSortUp,
  sortDown: EuiIconSortDown,
  search: EuiIconSearch,
  sortable: EuiIconSortable,
  trash: EuiIconTrash,
  heart: EuiIconHeart,
  bolt: EuiIconBolt,
  users: EuiIconUsers,
  stats: EuiIconStats,
  clock: EuiIconClock,
  cross: EuiIconCrossPlain,
})

function App() {
  const { theme, toggleTheme } = useTheme()

  return (
    <EuiProvider colorMode={theme as EuiThemeColorMode}>
      <DashboardContainer theme={theme} onToggleTheme={toggleTheme} />
    </EuiProvider>
  )
}

export default App
