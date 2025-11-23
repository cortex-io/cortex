/**
 * Remediation Panel component for managing security fix approvals
 * Displays pending remediations with approval/rejection workflow and history
 */

import React, { useState, useMemo, useEffect } from 'react'
import {
  EuiBasicTable,
  EuiBasicTableColumn,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiBadge,
  EuiHealth,
  EuiLink,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiPanel,
  EuiTitle,
  EuiText,
  EuiLoadingSpinner,
  EuiFlyout,
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiModal,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiModalBody,
  EuiModalFooter,
  EuiTextArea,
  EuiTabs,
  EuiTab,
  EuiCallOut,
  EuiToolTip,
  EuiDescriptionList,
  EuiCodeBlock,
  Criteria,
  Pagination,
} from '@elastic/eui'
import { formatRelativeTime } from '../../common/formatters'

// TypeScript interfaces
interface FileChange {
  path: string
  changeType: 'modified' | 'added' | 'deleted'
  before?: string
  after?: string
}

interface Remediation {
  id: string
  vulnerabilityId: string
  vulnerabilityTitle: string
  fixType: 'dependency_update' | 'secret_rotation' | 'config_change' | 'code_patch' | 'other'
  repository: string
  createdAt: string
  riskLevel: 'critical' | 'high' | 'medium' | 'low'
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'failed'
  description?: string
  prUrl?: string
  filesToChange?: FileChange[]
  testingRecommendations?: string[]
  appliedAt?: string
  appliedBy?: string
  rejectionReason?: string
  cveId?: string
}

interface RemediationPanelProps {
  repositoryId?: string
  onApprove?: (remediationId: string) => Promise<void>
  onReject?: (remediationId: string, reason: string) => Promise<void>
}

// Helper functions
const getRiskColor = (risk: string): 'danger' | 'warning' | 'primary' | 'default' => {
  switch (risk.toLowerCase()) {
    case 'critical':
      return 'danger'
    case 'high':
      return 'warning'
    case 'medium':
      return 'primary'
    case 'low':
      return 'default'
    default:
      return 'default'
  }
}

const getStatusColor = (status: string): string => {
  switch (status.toLowerCase()) {
    case 'pending':
      return 'warning'
    case 'approved':
      return 'primary'
    case 'rejected':
      return 'danger'
    case 'completed':
      return 'success'
    case 'failed':
      return 'danger'
    default:
      return 'subdued'
  }
}

const formatFixType = (fixType: string): string => {
  return fixType.split('_').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ')
}

export const RemediationPanel: React.FC<RemediationPanelProps> = ({
  repositoryId,
  onApprove,
  onReject,
}) => {
  // State
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [remediations, setRemediations] = useState<Remediation[]>([])
  const [selectedItems, setSelectedItems] = useState<Remediation[]>([])
  const [selectedTab, setSelectedTab] = useState<'pending' | 'history'>('pending')
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [sortField, setSortField] = useState<keyof Remediation>('createdAt')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  // Modal/Flyout state
  const [isFlyoutOpen, setIsFlyoutOpen] = useState(false)
  const [selectedRemediation, setSelectedRemediation] = useState<Remediation | null>(null)
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false)
  const [isBulkApproveModalOpen, setIsBulkApproveModalOpen] = useState(false)
  const [isBulkRejectModalOpen, setIsBulkRejectModalOpen] = useState(false)
  const [bulkRejectionReason, setBulkRejectionReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  // Fetch remediations
  useEffect(() => {
    const fetchRemediations = async () => {
      setLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams()
        if (repositoryId) {
          params.append('repository', repositoryId)
        }

        const response = await fetch(`/api/v1/security/remediations?${params.toString()}`)
        if (!response.ok) {
          throw new Error(`Failed to fetch remediations: ${response.statusText}`)
        }

        const data = await response.json()
        setRemediations(data.remediations || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch remediations')
      } finally {
        setLoading(false)
      }
    }

    fetchRemediations()
  }, [repositoryId])

  // Filter by tab
  const filteredByTab = useMemo(() => {
    if (selectedTab === 'pending') {
      return remediations.filter(r => r.status === 'pending')
    }
    return remediations.filter(r => ['approved', 'rejected', 'completed', 'failed'].includes(r.status))
  }, [remediations, selectedTab])

  // Sort data
  const sortedData = useMemo(() => {
    return [...filteredByTab].sort((a, b) => {
      const aValue = a[sortField]
      const bValue = b[sortField]

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue)
      }

      return 0
    })
  }, [filteredByTab, sortField, sortDirection])

  // Paginate data
  const paginatedData = useMemo(() => {
    const startIndex = pageIndex * pageSize
    return sortedData.slice(startIndex, startIndex + pageSize)
  }, [sortedData, pageIndex, pageSize])

  // Action handlers
  const handleApprove = async (remediation: Remediation) => {
    setActionLoading(true)
    try {
      if (onApprove) {
        await onApprove(remediation.id)
      } else {
        await fetch(`/api/v1/security/remediations/${remediation.id}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      }

      setRemediations(prev =>
        prev.map(r => r.id === remediation.id ? { ...r, status: 'approved' as const } : r)
      )
      setSelectedItems([])
      setIsApproveModalOpen(false)
      setSelectedRemediation(null)
    } catch (err) {
      console.error('Failed to approve remediation:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleReject = async (remediation: Remediation, reason: string) => {
    setActionLoading(true)
    try {
      if (onReject) {
        await onReject(remediation.id, reason)
      } else {
        await fetch(`/api/v1/security/remediations/${remediation.id}/reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
        })
      }

      setRemediations(prev =>
        prev.map(r => r.id === remediation.id
          ? { ...r, status: 'rejected' as const, rejectionReason: reason }
          : r
        )
      )
      setSelectedItems([])
      setIsRejectModalOpen(false)
      setRejectionReason('')
      setSelectedRemediation(null)
    } catch (err) {
      console.error('Failed to reject remediation:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleBulkApprove = async () => {
    setActionLoading(true)
    try {
      const approvePromises = selectedItems.map(item => {
        if (onApprove) {
          return onApprove(item.id)
        }
        return fetch(`/api/v1/security/remediations/${item.id}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      })

      await Promise.all(approvePromises)

      const approvedIds = selectedItems.map(i => i.id)
      setRemediations(prev =>
        prev.map(r => approvedIds.includes(r.id) ? { ...r, status: 'approved' as const } : r)
      )
      setSelectedItems([])
      setIsBulkApproveModalOpen(false)
    } catch (err) {
      console.error('Failed to bulk approve:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleBulkReject = async () => {
    setActionLoading(true)
    try {
      const rejectPromises = selectedItems.map(item => {
        if (onReject) {
          return onReject(item.id, bulkRejectionReason)
        }
        return fetch(`/api/v1/security/remediations/${item.id}/reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: bulkRejectionReason }),
        })
      })

      await Promise.all(rejectPromises)

      const rejectedIds = selectedItems.map(i => i.id)
      setRemediations(prev =>
        prev.map(r => rejectedIds.includes(r.id)
          ? { ...r, status: 'rejected' as const, rejectionReason: bulkRejectionReason }
          : r
        )
      )
      setSelectedItems([])
      setIsBulkRejectModalOpen(false)
      setBulkRejectionReason('')
    } catch (err) {
      console.error('Failed to bulk reject:', err)
    } finally {
      setActionLoading(false)
    }
  }

  // Table columns for pending
  const pendingColumns: EuiBasicTableColumn<Remediation>[] = [
    {
      field: 'vulnerabilityTitle',
      name: 'Vulnerability',
      sortable: true,
      truncateText: true,
      render: (title: string, item: Remediation) => (
        <EuiToolTip content={title}>
          <EuiLink onClick={() => { setSelectedRemediation(item); setIsFlyoutOpen(true); }}>
            {title.length > 40 ? `${title.substring(0, 37)}...` : title}
          </EuiLink>
        </EuiToolTip>
      ),
    },
    {
      field: 'fixType',
      name: 'Fix Type',
      sortable: true,
      width: '140px',
      render: (fixType: string) => formatFixType(fixType),
    },
    {
      field: 'repository',
      name: 'Repository',
      sortable: true,
      truncateText: true,
      width: '150px',
    },
    {
      field: 'createdAt',
      name: 'Created',
      sortable: true,
      width: '100px',
      render: (date: string) => formatRelativeTime(date),
    },
    {
      field: 'riskLevel',
      name: 'Risk',
      sortable: true,
      width: '90px',
      render: (risk: string) => (
        <EuiBadge color={getRiskColor(risk)}>
          {risk.toUpperCase()}
        </EuiBadge>
      ),
    },
    {
      field: 'status',
      name: 'Status',
      sortable: true,
      width: '100px',
      render: (status: string) => (
        <EuiHealth color={getStatusColor(status)}>
          {status}
        </EuiHealth>
      ),
    },
    {
      name: 'Actions',
      width: '180px',
      render: (item: Remediation) => (
        <EuiFlexGroup gutterSize="xs" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButtonIcon
              iconType="check"
              aria-label="Approve"
              color="success"
              onClick={() => { setSelectedRemediation(item); setIsApproveModalOpen(true); }}
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButtonIcon
              iconType="cross"
              aria-label="Reject"
              color="danger"
              onClick={() => { setSelectedRemediation(item); setIsRejectModalOpen(true); }}
            />
          </EuiFlexItem>
          {item.prUrl && (
            <EuiFlexItem grow={false}>
              <EuiButtonIcon
                iconType="popout"
                aria-label="View PR"
                href={item.prUrl}
                target="_blank"
              />
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      ),
    },
  ]

  // Table columns for history
  const historyColumns: EuiBasicTableColumn<Remediation>[] = [
    {
      field: 'vulnerabilityTitle',
      name: 'Vulnerability',
      sortable: true,
      truncateText: true,
    },
    {
      field: 'repository',
      name: 'Repository',
      sortable: true,
      width: '150px',
    },
    {
      field: 'status',
      name: 'Status',
      sortable: true,
      width: '100px',
      render: (status: string) => (
        <EuiHealth color={getStatusColor(status)}>
          {status}
        </EuiHealth>
      ),
    },
    {
      field: 'appliedAt',
      name: 'Applied',
      sortable: true,
      width: '120px',
      render: (date: string) => date ? formatRelativeTime(date) : '-',
    },
    {
      field: 'appliedBy',
      name: 'Applied By',
      sortable: true,
      width: '120px',
      render: (by: string) => by || '-',
    },
    {
      name: 'Actions',
      width: '80px',
      render: (item: Remediation) => (
        <EuiFlexGroup gutterSize="xs" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButtonIcon
              iconType="eye"
              aria-label="View Details"
              onClick={() => { setSelectedRemediation(item); setIsFlyoutOpen(true); }}
            />
          </EuiFlexItem>
          {item.prUrl && (
            <EuiFlexItem grow={false}>
              <EuiButtonIcon
                iconType="popout"
                aria-label="View PR"
                href={item.prUrl}
                target="_blank"
              />
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      ),
    },
  ]

  // Selection config (only for pending tab)
  const selection = selectedTab === 'pending' ? {
    onSelectionChange: (selected: Remediation[]) => setSelectedItems(selected),
    selectable: () => true,
    selectableMessage: () => '',
  } : undefined

  // Pagination config
  const pagination: Pagination = {
    pageIndex,
    pageSize,
    totalItemCount: sortedData.length,
    pageSizeOptions: [10, 25, 50],
  }

  // Handle table change
  const onTableChange = ({ page, sort }: Criteria<Remediation>) => {
    if (page) {
      setPageIndex(page.index)
      if (page.size !== pageSize) {
        setPageSize(page.size)
      }
    }
    if (sort) {
      setSortField(sort.field as keyof Remediation)
      setSortDirection(sort.direction)
    }
  }

  // Render loading state
  if (loading && remediations.length === 0) {
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

  // Render error state
  if (error) {
    return (
      <EuiPanel hasBorder>
        <EuiTitle size="s"><h3>Security Remediations</h3></EuiTitle>
        <EuiCallOut title="Error loading remediations" color="danger" iconType="error">
          <p>{error}</p>
        </EuiCallOut>
      </EuiPanel>
    )
  }

  const pendingCount = remediations.filter(r => r.status === 'pending').length
  const historyCount = remediations.filter(r => r.status !== 'pending').length

  return (
    <EuiPanel hasBorder>
      <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiTitle size="s">
            <h3>Security Remediations</h3>
          </EuiTitle>
        </EuiFlexItem>
        {selectedTab === 'pending' && selectedItems.length > 0 && (
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="s">
              <EuiFlexItem grow={false}>
                <EuiButton
                  size="s"
                  color="success"
                  onClick={() => setIsBulkApproveModalOpen(true)}
                >
                  Approve ({selectedItems.length})
                </EuiButton>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton
                  size="s"
                  color="danger"
                  onClick={() => setIsBulkRejectModalOpen(true)}
                >
                  Reject ({selectedItems.length})
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      <EuiTabs>
        <EuiTab
          isSelected={selectedTab === 'pending'}
          onClick={() => { setSelectedTab('pending'); setPageIndex(0); setSelectedItems([]); }}
        >
          Pending ({pendingCount})
        </EuiTab>
        <EuiTab
          isSelected={selectedTab === 'history'}
          onClick={() => { setSelectedTab('history'); setPageIndex(0); setSelectedItems([]); }}
        >
          History ({historyCount})
        </EuiTab>
      </EuiTabs>

      <EuiSpacer size="m" />

      <EuiBasicTable
        items={paginatedData}
        itemId="id"
        columns={selectedTab === 'pending' ? pendingColumns : historyColumns}
        selection={selection}
        pagination={pagination}
        sorting={{
          sort: {
            field: sortField,
            direction: sortDirection,
          },
        }}
        onChange={onTableChange}
        loading={loading}
        noItemsMessage={
          selectedTab === 'pending'
            ? 'No pending remediations'
            : 'No remediation history'
        }
        tableLayout="fixed"
      />

      {/* Details Flyout */}
      {isFlyoutOpen && selectedRemediation && (
        <EuiFlyout onClose={() => { setIsFlyoutOpen(false); setSelectedRemediation(null); }} size="m">
          <EuiFlyoutHeader hasBorder>
            <EuiTitle size="m">
              <h2>Remediation Details</h2>
            </EuiTitle>
          </EuiFlyoutHeader>
          <EuiFlyoutBody>
            <EuiDescriptionList
              listItems={[
                { title: 'Vulnerability', description: selectedRemediation.vulnerabilityTitle },
                { title: 'CVE ID', description: selectedRemediation.cveId || 'N/A' },
                { title: 'Fix Type', description: formatFixType(selectedRemediation.fixType) },
                { title: 'Repository', description: selectedRemediation.repository },
                { title: 'Risk Level', description: (
                  <EuiBadge color={getRiskColor(selectedRemediation.riskLevel)}>
                    {selectedRemediation.riskLevel.toUpperCase()}
                  </EuiBadge>
                )},
                { title: 'Status', description: (
                  <EuiHealth color={getStatusColor(selectedRemediation.status)}>
                    {selectedRemediation.status}
                  </EuiHealth>
                )},
                { title: 'Created', description: new Date(selectedRemediation.createdAt).toLocaleString() },
              ]}
            />

            {selectedRemediation.description && (
              <>
                <EuiSpacer size="m" />
                <EuiTitle size="xs"><h4>Description</h4></EuiTitle>
                <EuiSpacer size="s" />
                <EuiText size="s"><p>{selectedRemediation.description}</p></EuiText>
              </>
            )}

            {selectedRemediation.filesToChange && selectedRemediation.filesToChange.length > 0 && (
              <>
                <EuiSpacer size="m" />
                <EuiTitle size="xs"><h4>Files to Change</h4></EuiTitle>
                <EuiSpacer size="s" />
                {selectedRemediation.filesToChange.map((file, index) => (
                  <div key={index} style={{ marginBottom: '16px' }}>
                    <EuiText size="s">
                      <strong>{file.path}</strong> ({file.changeType})
                    </EuiText>
                    {file.before && file.after && (
                      <>
                        <EuiSpacer size="xs" />
                        <EuiText size="xs" color="subdued">Before:</EuiText>
                        <EuiCodeBlock fontSize="s" paddingSize="s" isCopyable>
                          {file.before}
                        </EuiCodeBlock>
                        <EuiSpacer size="xs" />
                        <EuiText size="xs" color="subdued">After:</EuiText>
                        <EuiCodeBlock fontSize="s" paddingSize="s" isCopyable>
                          {file.after}
                        </EuiCodeBlock>
                      </>
                    )}
                  </div>
                ))}
              </>
            )}

            {selectedRemediation.testingRecommendations && selectedRemediation.testingRecommendations.length > 0 && (
              <>
                <EuiSpacer size="m" />
                <EuiTitle size="xs"><h4>Testing Recommendations</h4></EuiTitle>
                <EuiSpacer size="s" />
                <ul>
                  {selectedRemediation.testingRecommendations.map((rec, index) => (
                    <li key={index}><EuiText size="s">{rec}</EuiText></li>
                  ))}
                </ul>
              </>
            )}

            {selectedRemediation.rejectionReason && (
              <>
                <EuiSpacer size="m" />
                <EuiCallOut title="Rejection Reason" color="danger" iconType="cross">
                  <p>{selectedRemediation.rejectionReason}</p>
                </EuiCallOut>
              </>
            )}
          </EuiFlyoutBody>
        </EuiFlyout>
      )}

      {/* Approve Confirmation Modal */}
      {isApproveModalOpen && selectedRemediation && (
        <EuiModal onClose={() => { setIsApproveModalOpen(false); setSelectedRemediation(null); }}>
          <EuiModalHeader>
            <EuiModalHeaderTitle>Confirm Approval</EuiModalHeaderTitle>
          </EuiModalHeader>
          <EuiModalBody>
            <EuiText>
              <p>Are you sure you want to approve the remediation for:</p>
              <p><strong>{selectedRemediation.vulnerabilityTitle}</strong></p>
            </EuiText>
          </EuiModalBody>
          <EuiModalFooter>
            <EuiButtonEmpty onClick={() => { setIsApproveModalOpen(false); setSelectedRemediation(null); }}>
              Cancel
            </EuiButtonEmpty>
            <EuiButton
              color="success"
              fill
              onClick={() => handleApprove(selectedRemediation)}
              isLoading={actionLoading}
            >
              Approve
            </EuiButton>
          </EuiModalFooter>
        </EuiModal>
      )}

      {/* Reject Modal with Reason */}
      {isRejectModalOpen && selectedRemediation && (
        <EuiModal onClose={() => { setIsRejectModalOpen(false); setRejectionReason(''); setSelectedRemediation(null); }}>
          <EuiModalHeader>
            <EuiModalHeaderTitle>Reject Remediation</EuiModalHeaderTitle>
          </EuiModalHeader>
          <EuiModalBody>
            <EuiText>
              <p>Rejecting remediation for: <strong>{selectedRemediation.vulnerabilityTitle}</strong></p>
            </EuiText>
            <EuiSpacer size="m" />
            <EuiTextArea
              placeholder="Please provide a reason for rejection..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              fullWidth
              rows={4}
            />
          </EuiModalBody>
          <EuiModalFooter>
            <EuiButtonEmpty onClick={() => { setIsRejectModalOpen(false); setRejectionReason(''); setSelectedRemediation(null); }}>
              Cancel
            </EuiButtonEmpty>
            <EuiButton
              color="danger"
              fill
              onClick={() => handleReject(selectedRemediation, rejectionReason)}
              isLoading={actionLoading}
              disabled={!rejectionReason.trim()}
            >
              Reject
            </EuiButton>
          </EuiModalFooter>
        </EuiModal>
      )}

      {/* Bulk Approve Modal */}
      {isBulkApproveModalOpen && (
        <EuiModal onClose={() => setIsBulkApproveModalOpen(false)}>
          <EuiModalHeader>
            <EuiModalHeaderTitle>Bulk Approve Remediations</EuiModalHeaderTitle>
          </EuiModalHeader>
          <EuiModalBody>
            <EuiText>
              <p>Are you sure you want to approve <strong>{selectedItems.length}</strong> remediations?</p>
            </EuiText>
          </EuiModalBody>
          <EuiModalFooter>
            <EuiButtonEmpty onClick={() => setIsBulkApproveModalOpen(false)}>
              Cancel
            </EuiButtonEmpty>
            <EuiButton
              color="success"
              fill
              onClick={handleBulkApprove}
              isLoading={actionLoading}
            >
              Approve All
            </EuiButton>
          </EuiModalFooter>
        </EuiModal>
      )}

      {/* Bulk Reject Modal */}
      {isBulkRejectModalOpen && (
        <EuiModal onClose={() => { setIsBulkRejectModalOpen(false); setBulkRejectionReason(''); }}>
          <EuiModalHeader>
            <EuiModalHeaderTitle>Bulk Reject Remediations</EuiModalHeaderTitle>
          </EuiModalHeader>
          <EuiModalBody>
            <EuiText>
              <p>Rejecting <strong>{selectedItems.length}</strong> remediations</p>
            </EuiText>
            <EuiSpacer size="m" />
            <EuiTextArea
              placeholder="Please provide a reason for rejection..."
              value={bulkRejectionReason}
              onChange={(e) => setBulkRejectionReason(e.target.value)}
              fullWidth
              rows={4}
            />
          </EuiModalBody>
          <EuiModalFooter>
            <EuiButtonEmpty onClick={() => { setIsBulkRejectModalOpen(false); setBulkRejectionReason(''); }}>
              Cancel
            </EuiButtonEmpty>
            <EuiButton
              color="danger"
              fill
              onClick={handleBulkReject}
              isLoading={actionLoading}
              disabled={!bulkRejectionReason.trim()}
            >
              Reject All
            </EuiButton>
          </EuiModalFooter>
        </EuiModal>
      )}
    </EuiPanel>
  )
}

export default RemediationPanel
