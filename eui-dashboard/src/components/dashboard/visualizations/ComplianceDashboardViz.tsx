import { useMemo } from 'react'
import {
  EuiPanel,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiSpacer,
  EuiLoadingSpinner,
  EuiBadge,
  EuiStat,
  EuiProgress,
  EuiCallOut,
  EuiHealth,
} from '@elastic/eui'
// Recharts imports removed - using summary display instead of time series chart
import { useGovernanceDashboard, useGovernanceMetrics, useGovernanceTrends } from '../../../hooks/useDashboardData'

const ComplianceDashboardViz = () => {
  const { data: dashboard, loading: dashboardLoading, error: dashboardError } = useGovernanceDashboard()
  const { data: metrics } = useGovernanceMetrics()
  const { data: trends } = useGovernanceTrends()

  const healthScore = dashboard?.health_score || 0
  const kpiSummary = dashboard?.kpi_summary || {}
  const recommendations = dashboard?.top_recommendations || []

  // Process trend data - API returns summary not time series, so we show current state
  const trendSummary = useMemo(() => {
    if (!trends?.trends) return null
    return trends.trends
  }, [trends])

  const kpis = metrics?.kpis || {}

  if (dashboardLoading) {
    return (
      <EuiPanel hasBorder>
        <EuiFlexGroup justifyContent="center" alignItems="center" style={{ height: 300 }}>
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="l" />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    )
  }

  if (dashboardError) {
    return (
      <EuiPanel hasBorder>
        <EuiTitle size="s"><h3>Compliance Dashboard</h3></EuiTitle>
        <EuiText color="danger"><p>Error: {dashboardError}</p></EuiText>
      </EuiPanel>
    )
  }

  return (
    <>
      {/* Health Score and KPI Summary */}
      <EuiPanel hasBorder>
        <EuiTitle size="s"><h3>Governance Health</h3></EuiTitle>
        <EuiSpacer size="m" />

        <EuiFlexGroup alignItems="center" gutterSize="xl">
          <EuiFlexItem grow={false} style={{ minWidth: 150 }}>
            <EuiStat
              title={`${healthScore.toFixed(1)}%`}
              description="Health Score"
              titleColor={healthScore >= 90 ? 'success' : healthScore >= 70 ? 'warning' : 'danger'}
              textAlign="center"
            />
          </EuiFlexItem>

          <EuiFlexItem>
            <EuiFlexGroup gutterSize="xl">
              <EuiFlexItem>
                <EuiStat
                  title={kpiSummary.compliance || '0%'}
                  description="Compliance"
                  titleColor="primary"
                  titleSize="s"
                  textAlign="center"
                />
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiStat
                  title={kpiSummary.security || '0'}
                  description="Security"
                  titleColor="success"
                  titleSize="s"
                  textAlign="center"
                />
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiStat
                  title={kpiSummary.quality || '0%'}
                  description="Quality"
                  titleColor="accent"
                  titleSize="s"
                  textAlign="center"
                />
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiStat
                  title={kpiSummary.availability || '0%'}
                  description="Availability"
                  titleColor="subdued"
                  titleSize="s"
                  textAlign="center"
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>

      <EuiSpacer size="l" />

      {/* Detailed Metrics */}
      <EuiPanel hasBorder>
        <EuiTitle size="s"><h3>Key Performance Indicators</h3></EuiTitle>
        <EuiSpacer size="m" />

        <EuiFlexGroup wrap>
          <EuiFlexItem style={{ minWidth: 200 }}>
            <EuiText size="s"><strong>Catalog</strong></EuiText>
            <EuiSpacer size="xs" />
            <EuiFlexGroup direction="column" gutterSize="xs">
              <EuiFlexItem>
                <EuiFlexGroup justifyContent="spaceBetween">
                  <EuiFlexItem grow={false}><EuiText size="xs">Coverage</EuiText></EuiFlexItem>
                  <EuiFlexItem grow={false}><EuiText size="xs">{kpis.catalog_coverage || 0}%</EuiText></EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiFlexGroup justifyContent="spaceBetween">
                  <EuiFlexItem grow={false}><EuiText size="xs">Freshness</EuiText></EuiFlexItem>
                  <EuiFlexItem grow={false}><EuiText size="xs">{kpis.catalog_freshness || 0}%</EuiText></EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiFlexGroup justifyContent="spaceBetween">
                  <EuiFlexItem grow={false}><EuiText size="xs">Accuracy</EuiText></EuiFlexItem>
                  <EuiFlexItem grow={false}><EuiText size="xs">{kpis.catalog_accuracy || 0}%</EuiText></EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>

          <EuiFlexItem style={{ minWidth: 200 }}>
            <EuiText size="s"><strong>Security</strong></EuiText>
            <EuiSpacer size="xs" />
            <EuiFlexGroup direction="column" gutterSize="xs">
              <EuiFlexItem>
                <EuiFlexGroup justifyContent="spaceBetween">
                  <EuiFlexItem grow={false}><EuiText size="xs">Violations</EuiText></EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiHealth color={kpis.access_violations === 0 ? 'success' : 'danger'}>
                      {kpis.access_violations || 0}
                    </EuiHealth>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiFlexGroup justifyContent="spaceBetween">
                  <EuiFlexItem grow={false}><EuiText size="xs">PII Detections</EuiText></EuiFlexItem>
                  <EuiFlexItem grow={false}><EuiText size="xs">{kpis.pii_detections || 0}</EuiText></EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiFlexGroup justifyContent="spaceBetween">
                  <EuiFlexItem grow={false}><EuiText size="xs">Incidents</EuiText></EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiHealth color={kpis.security_incidents === 0 ? 'success' : 'danger'}>
                      {kpis.security_incidents || 0}
                    </EuiHealth>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>

          <EuiFlexItem style={{ minWidth: 200 }}>
            <EuiText size="s"><strong>Performance</strong></EuiText>
            <EuiSpacer size="xs" />
            <EuiFlexGroup direction="column" gutterSize="xs">
              <EuiFlexItem>
                <EuiFlexGroup justifyContent="spaceBetween">
                  <EuiFlexItem grow={false}><EuiText size="xs">Availability</EuiText></EuiFlexItem>
                  <EuiFlexItem grow={false}><EuiText size="xs">{kpis.system_availability || 0}%</EuiText></EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiFlexGroup justifyContent="spaceBetween">
                  <EuiFlexItem grow={false}><EuiText size="xs">Query Perf</EuiText></EuiFlexItem>
                  <EuiFlexItem grow={false}><EuiText size="xs">{kpis.query_performance || 0}ms</EuiText></EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiFlexGroup justifyContent="spaceBetween">
                  <EuiFlexItem grow={false}><EuiText size="xs">Quality Score</EuiText></EuiFlexItem>
                  <EuiFlexItem grow={false}><EuiText size="xs">{kpis.data_quality_score || 0}%</EuiText></EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>

          <EuiFlexItem style={{ minWidth: 200 }}>
            <EuiText size="s"><strong>Compliance</strong></EuiText>
            <EuiSpacer size="xs" />
            <EuiFlexGroup direction="column" gutterSize="xs">
              <EuiFlexItem>
                <EuiFlexGroup justifyContent="spaceBetween">
                  <EuiFlexItem grow={false}><EuiText size="xs">Rate</EuiText></EuiFlexItem>
                  <EuiFlexItem grow={false}><EuiText size="xs">{kpis.compliance_rate || 0}%</EuiText></EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiFlexGroup justifyContent="spaceBetween">
                  <EuiFlexItem grow={false}><EuiText size="xs">Violations</EuiText></EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiHealth color={kpis.violations <= 1 ? 'warning' : 'danger'}>
                      {kpis.violations || 0}
                    </EuiHealth>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiFlexGroup justifyContent="spaceBetween">
                  <EuiFlexItem grow={false}><EuiText size="xs">Remediation</EuiText></EuiFlexItem>
                  <EuiFlexItem grow={false}><EuiText size="xs">{kpis.remediation_success_rate || 0}%</EuiText></EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>

      <EuiSpacer size="l" />

      {/* Trends Summary */}
      {trendSummary && (
        <>
          <EuiPanel hasBorder>
            <EuiTitle size="s"><h3>Governance Trends</h3></EuiTitle>
            <EuiSpacer size="m" />

            <EuiFlexGroup gutterSize="xl">
              <EuiFlexItem>
                <EuiStat
                  title={`${trendSummary.governance_health?.change_pct > 0 ? '+' : ''}${trendSummary.governance_health?.change_pct || 0}%`}
                  description="Health"
                  titleColor={trendSummary.governance_health?.direction === 'improving' ? 'success' : trendSummary.governance_health?.direction === 'declining' ? 'danger' : 'warning'}
                  textAlign="center"
                />
              </EuiFlexItem>

              <EuiFlexItem>
                <EuiStat
                  title={`${trendSummary.compliance_rate?.change_pct > 0 ? '+' : ''}${trendSummary.compliance_rate?.change_pct || 0}%`}
                  description="Compliance"
                  titleColor={trendSummary.compliance_rate?.direction === 'improving' ? 'success' : trendSummary.compliance_rate?.direction === 'declining' ? 'danger' : 'warning'}
                  textAlign="center"
                />
              </EuiFlexItem>

              <EuiFlexItem>
                <EuiStat
                  title={`${trendSummary.security_score?.change_pct > 0 ? '+' : ''}${trendSummary.security_score?.change_pct || 0}%`}
                  description="Security"
                  titleColor={trendSummary.security_score?.direction === 'improving' ? 'success' : trendSummary.security_score?.direction === 'declining' ? 'danger' : 'warning'}
                  textAlign="center"
                />
              </EuiFlexItem>

              <EuiFlexItem>
                <EuiStat
                  title={`${trendSummary.quality_score?.change_pct > 0 ? '+' : ''}${trendSummary.quality_score?.change_pct || 0}%`}
                  description="Quality"
                  titleColor={trendSummary.quality_score?.direction === 'improving' ? 'success' : trendSummary.quality_score?.direction === 'declining' ? 'danger' : 'warning'}
                  textAlign="center"
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPanel>

          <EuiSpacer size="l" />
        </>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <EuiPanel hasBorder>
          <EuiTitle size="s"><h3>Recommendations</h3></EuiTitle>
          <EuiSpacer size="m" />

          {recommendations.map((rec: any, index: number) => (
            <div key={rec.id || index} style={{ marginBottom: 8 }}>
              <EuiCallOut
                title={rec.recommendation}
                color={rec.status === 'completed' ? 'success' : 'primary'}
                size="s"
              >
                <EuiFlexGroup alignItems="center" gutterSize="s" style={{ marginBottom: 8 }}>
                  <EuiFlexItem grow={false}>
                    <EuiBadge color={rec.priority === 'high' ? 'danger' : rec.priority === 'medium' ? 'warning' : 'primary'}>
                      {rec.priority}
                    </EuiBadge>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiBadge color="hollow">{rec.category}</EuiBadge>
                  </EuiFlexItem>
                  {rec.status === 'completed' && (
                    <EuiFlexItem grow={false}>
                      <EuiHealth color="success">completed</EuiHealth>
                    </EuiFlexItem>
                  )}
                </EuiFlexGroup>
                <EuiText size="xs" color="subdued">
                  {rec.estimated_impact}
                </EuiText>
              </EuiCallOut>
            </div>
          ))}
        </EuiPanel>
      )}
    </>
  )
}

export default ComplianceDashboardViz
