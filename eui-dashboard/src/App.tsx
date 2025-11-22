import { EuiProvider, EuiThemeColorMode } from '@elastic/eui'
import { appendIconComponentCache } from '@elastic/eui/es/components/icon/icon'
import DashboardContainer from './components/dashboard/DashboardContainer'
import { useTheme } from './hooks/useTheme'

// Import print-friendly styles
import './styles/print.css'
// Import responsive scaling styles
import './styles/responsive.css'

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
import { icon as EuiIconCluster } from '@elastic/eui/es/components/icon/assets/cluster'
import { icon as EuiIconMerge } from '@elastic/eui/es/components/icon/assets/merge'
import { icon as EuiIconStop } from '@elastic/eui/es/components/icon/assets/stop'
import { icon as EuiIconPencil } from '@elastic/eui/es/components/icon/assets/pencil'
import { icon as EuiIconPlus } from '@elastic/eui/es/components/icon/assets/plus'
import { icon as EuiIconMinus } from '@elastic/eui/es/components/icon/assets/minus'
import { icon as EuiIconCopy } from '@elastic/eui/es/components/icon/assets/copy'
import { icon as EuiIconDocument } from '@elastic/eui/es/components/icon/assets/document'
import { icon as EuiIconEmpty } from '@elastic/eui/es/components/icon/assets/empty'
import { icon as EuiIconPopout } from '@elastic/eui/es/components/icon/assets/popout'
import { icon as EuiIconMinimize } from '@elastic/eui/es/components/icon/assets/minimize'
import { icon as EuiIconMenu } from '@elastic/eui/es/components/icon/assets/menu'
import { icon as EuiIconIInCircle } from '@elastic/eui/es/components/icon/assets/help'
import { icon as EuiIconFullScreen } from '@elastic/eui/es/components/icon/assets/full_screen'

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
  cluster: EuiIconCluster,
  merge: EuiIconMerge,
  stop: EuiIconStop,
  pencil: EuiIconPencil,
  plus: EuiIconPlus,
  minus: EuiIconMinus,
  copy: EuiIconCopy,
  document: EuiIconDocument,
  empty: EuiIconEmpty,
  popout: EuiIconPopout,
  minimize: EuiIconMinimize,
  menu: EuiIconMenu,
  iInCircle: EuiIconIInCircle,
  fullScreen: EuiIconFullScreen,
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
