/**
 * Repository Security Card Component
 * Displays security summary for a single repository as a card
 * Used in the main dashboard grid
 */

import React, { useState } from 'react';
import {
  EuiCard,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiBadge,
  EuiProgress,
  EuiButton,
  EuiButtonEmpty,
  EuiText,
  EuiTextColor,
  EuiToolTip,
  EuiIcon,
  EuiSpacer,
} from '@elastic/eui';

interface RepositorySecurityCardProps {
  repository: {
    id: string;
    name: string;
    url: string;
    last_scan: string;
    scan_duration_ms: number;
    dependencies: {
      total: number;
      outdated: number;
    };
    vulnerabilities: {
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
    security_score: number;
  };
  onViewDetails: (repoId: string) => void;
  onRescan: (repoId: string) => Promise<void>;
}

/**
 * Determines health status based on vulnerability counts
 */
const getHealthStatus = (vulnerabilities: {
  critical: number;
  high: number;
  medium: number;
  low: number;
}): 'success' | 'warning' | 'danger' => {
  if (vulnerabilities.critical > 0) {
    return 'danger';
  }
  if (vulnerabilities.high > 0) {
    return 'warning';
  }
  return 'success';
};

/**
 * Formats timestamp to relative time string
 */
const formatRelativeTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return 'Just now';
  }
  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  return date.toLocaleDateString();
};

/**
 * Formats duration in milliseconds to human readable string
 */
const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
};

/**
 * Gets color for security score
 */
const getScoreColor = (score: number): 'success' | 'warning' | 'danger' | 'primary' => {
  if (score >= 80) return 'success';
  if (score >= 60) return 'primary';
  if (score >= 40) return 'warning';
  return 'danger';
};

export const RepositorySecurityCard: React.FC<RepositorySecurityCardProps> = ({
  repository,
  onViewDetails,
  onRescan,
}) => {
  const [isRescanning, setIsRescanning] = useState(false);

  const healthStatus = getHealthStatus(repository.vulnerabilities);
  const totalVulnerabilities =
    repository.vulnerabilities.critical +
    repository.vulnerabilities.high +
    repository.vulnerabilities.medium +
    repository.vulnerabilities.low;

  const handleRescan = async () => {
    setIsRescanning(true);
    try {
      await onRescan(repository.id);
    } finally {
      setIsRescanning(false);
    }
  };

  const healthLabel = {
    success: 'Healthy',
    warning: 'At Risk',
    danger: 'Critical',
  }[healthStatus];

  return (
    <EuiCard
      title={
        <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiHealth color={healthStatus} />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiToolTip content={repository.url}>
              <span>{repository.name}</span>
            </EuiToolTip>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiBadge color={healthStatus === 'success' ? 'success' : healthStatus === 'warning' ? 'warning' : 'danger'}>
              {healthLabel}
            </EuiBadge>
          </EuiFlexItem>
        </EuiFlexGroup>
      }
      titleSize="xs"
      hasBorder
      paddingSize="m"
    >
      {/* Stats Row */}
      <EuiFlexGroup gutterSize="m" wrap responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiToolTip content="Total dependencies">
            <EuiText size="s">
              <EuiIcon type="package" size="s" /> {repository.dependencies.total}
            </EuiText>
          </EuiToolTip>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiToolTip content="Outdated packages">
            <EuiText size="s">
              <EuiTextColor color={repository.dependencies.outdated > 0 ? 'warning' : 'subdued'}>
                <EuiIcon type="clock" size="s" /> {repository.dependencies.outdated}
              </EuiTextColor>
            </EuiText>
          </EuiToolTip>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiToolTip content="Total vulnerabilities">
            <EuiText size="s">
              <EuiTextColor color={totalVulnerabilities > 0 ? 'danger' : 'subdued'}>
                <EuiIcon type="alert" size="s" /> {totalVulnerabilities}
              </EuiTextColor>
            </EuiText>
          </EuiToolTip>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="s" />

      {/* Vulnerability Badges */}
      <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
        {repository.vulnerabilities.critical > 0 && (
          <EuiFlexItem grow={false}>
            <EuiBadge color="danger">
              C: {repository.vulnerabilities.critical}
            </EuiBadge>
          </EuiFlexItem>
        )}
        {repository.vulnerabilities.high > 0 && (
          <EuiFlexItem grow={false}>
            <EuiBadge color="warning">
              H: {repository.vulnerabilities.high}
            </EuiBadge>
          </EuiFlexItem>
        )}
        {repository.vulnerabilities.medium > 0 && (
          <EuiFlexItem grow={false}>
            <EuiBadge color="primary">
              M: {repository.vulnerabilities.medium}
            </EuiBadge>
          </EuiFlexItem>
        )}
        {repository.vulnerabilities.low > 0 && (
          <EuiFlexItem grow={false}>
            <EuiBadge color="hollow">
              L: {repository.vulnerabilities.low}
            </EuiBadge>
          </EuiFlexItem>
        )}
        {totalVulnerabilities === 0 && (
          <EuiFlexItem grow={false}>
            <EuiBadge color="success">No vulnerabilities</EuiBadge>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      {/* Last Scan Info */}
      <EuiText size="xs" color="subdued">
        <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiIcon type="clock" size="s" />
          </EuiFlexItem>
          <EuiFlexItem>
            <span>
              Last scan: {formatRelativeTime(repository.last_scan)} ({formatDuration(repository.scan_duration_ms)})
            </span>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiText>

      <EuiSpacer size="m" />

      {/* Security Score Progress Bar */}
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem>
          <EuiToolTip content={`Security Score: ${repository.security_score}/100`}>
            <EuiProgress
              value={repository.security_score}
              max={100}
              size="m"
              color={getScoreColor(repository.security_score)}
              label={
                <EuiText size="xs">
                  <strong>Score</strong>
                </EuiText>
              }
              valueText={`${repository.security_score}%`}
            />
          </EuiToolTip>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      {/* Actions Footer */}
      <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty
            size="s"
            iconType="eye"
            onClick={() => onViewDetails(repository.id)}
          >
            View Details
          </EuiButtonEmpty>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton
            size="s"
            iconType="refresh"
            isLoading={isRescanning}
            onClick={handleRescan}
          >
            Rescan
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiCard>
  );
};

export default RepositorySecurityCard;
