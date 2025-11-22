/**
 * Dashboard Header component
 * With EuiSuperDatePicker, mobile navigation, and controls
 */

import React, { useState } from 'react'
import {
  EuiHeader,
  EuiHeaderSection,
  EuiHeaderSectionItem,
  EuiHeaderLogo,
  EuiHeaderLinks,
  EuiHeaderLink,
  EuiSuperDatePicker,
  EuiButtonIcon,
  EuiToolTip,
  EuiFlyout,
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiTitle,
  EuiSideNav,
  EuiIcon,
  EuiFlexGroup,
  EuiFlexItem,
  OnTimeChangeProps,
  OnRefreshProps,
} from '@elastic/eui'
import { useResponsive } from '../../hooks/useResponsive'

interface DashboardHeaderProps {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  start: string
  end: string
  onTimeChange: (props: OnTimeChangeProps) => void
  onRefresh: (props: OnRefreshProps) => void
  isRefreshing: boolean
  onExport: () => void
  selectedTab: string
  onTabChange: (tabId: string) => void
  tabs: { id: string; name: string; icon: string }[]
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  theme,
  onToggleTheme,
  start,
  end,
  onTimeChange,
  onRefresh,
  isRefreshing,
  onExport,
  selectedTab,
  onTabChange,
  tabs,
}) => {
  const { isMobile } = useResponsive()
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)

  const toggleMobileNav = () => setIsMobileNavOpen(!isMobileNavOpen)

  // Build side nav items for mobile
  const mobileNavItems = [
    {
      name: 'Navigation',
      id: 'nav',
      items: tabs.map((tab) => ({
        id: tab.id,
        name: tab.name,
        icon: <EuiIcon type={tab.icon} />,
        isSelected: selectedTab === tab.id,
        onClick: () => {
          onTabChange(tab.id)
          setIsMobileNavOpen(false)
        },
      })),
    },
  ]

  return (
    <>
      <EuiHeader position="fixed" theme={theme === 'dark' ? 'dark' : 'default'}>
        {/* Left section */}
        <EuiHeaderSection grow={false}>
          {isMobile && (
            <EuiHeaderSectionItem>
              <EuiButtonIcon
                iconType="menu"
                aria-label="Toggle navigation"
                onClick={toggleMobileNav}
              />
            </EuiHeaderSectionItem>
          )}
          <EuiHeaderSectionItem>
            <EuiHeaderLogo iconType="dashboardApp">Commit-Relay</EuiHeaderLogo>
          </EuiHeaderSectionItem>
        </EuiHeaderSection>

        {/* Center section - Desktop navigation */}
        {!isMobile && (
          <EuiHeaderSection grow={true}>
            <EuiHeaderSectionItem>
              <EuiHeaderLinks aria-label="Dashboard navigation">
                {tabs.slice(0, 6).map((tab) => (
                  <EuiHeaderLink
                    key={tab.id}
                    isActive={selectedTab === tab.id}
                    onClick={() => onTabChange(tab.id)}
                  >
                    <EuiIcon type={tab.icon} size="s" style={{ marginRight: 4 }} />
                    {tab.name}
                  </EuiHeaderLink>
                ))}
              </EuiHeaderLinks>
            </EuiHeaderSectionItem>
          </EuiHeaderSection>
        )}

        {/* Right section - Controls */}
        <EuiHeaderSection side="right">
          <EuiHeaderSectionItem>
            <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
              {/* Date picker - shown on desktop */}
              {!isMobile && (
                <EuiFlexItem grow={false}>
                  <EuiSuperDatePicker
                    start={start}
                    end={end}
                    onTimeChange={onTimeChange}
                    onRefresh={onRefresh}
                    isPaused={false}
                    refreshInterval={30000}
                    isLoading={isRefreshing}
                    compressed
                  />
                </EuiFlexItem>
              )}

              {/* Export button */}
              <EuiFlexItem grow={false}>
                <EuiToolTip content="Export dashboard data" position="bottom">
                  <EuiButtonIcon
                    iconType="exportAction"
                    aria-label="Export data"
                    onClick={onExport}
                  />
                </EuiToolTip>
              </EuiFlexItem>

              {/* Theme toggle */}
              <EuiFlexItem grow={false}>
                <EuiToolTip
                  content={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                  position="bottom"
                >
                  <EuiButtonIcon
                    iconType={theme === 'light' ? 'moon' : 'sun'}
                    aria-label="Toggle theme"
                    onClick={onToggleTheme}
                  />
                </EuiToolTip>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiHeaderSectionItem>
        </EuiHeaderSection>
      </EuiHeader>

      {/* Mobile navigation flyout */}
      {isMobileNavOpen && (
        <EuiFlyout
          onClose={toggleMobileNav}
          side="left"
          size="s"
          paddingSize="l"
          ownFocus
        >
          <EuiFlyoutHeader hasBorder>
            <EuiTitle size="s">
              <h2>Navigation</h2>
            </EuiTitle>
          </EuiFlyoutHeader>
          <EuiFlyoutBody>
            <EuiSideNav
              items={mobileNavItems}
              mobileBreakpoints={[]}
            />

            {/* Mobile date picker */}
            <div style={{ marginTop: 24 }}>
              <EuiTitle size="xs">
                <h3>Time Range</h3>
              </EuiTitle>
              <div style={{ marginTop: 12 }}>
                <EuiSuperDatePicker
                  start={start}
                  end={end}
                  onTimeChange={onTimeChange}
                  onRefresh={onRefresh}
                  isPaused={false}
                  refreshInterval={30000}
                  isLoading={isRefreshing}
                />
              </div>
            </div>
          </EuiFlyoutBody>
        </EuiFlyout>
      )}
    </>
  )
}

export default DashboardHeader
