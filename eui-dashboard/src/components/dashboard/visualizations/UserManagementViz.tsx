import { useState, useEffect, useCallback } from 'react'
import {
  EuiPanel,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiLoadingSpinner,
  EuiBasicTable,
  EuiButton,
  EuiButtonIcon,
  EuiModal,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiModalBody,
  EuiModalFooter,
  EuiForm,
  EuiFormRow,
  EuiFieldText,
  EuiSelect,
  EuiSwitch,
  EuiFlyout,
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiConfirmModal,
  EuiBadge,
  EuiHealth,
  EuiText,
  EuiCallOut,
  EuiStat,
  EuiFieldSearch,
  EuiToolTip,
  EuiTableSelectionType,
  EuiButtonEmpty,
  Criteria,
} from '@elastic/eui'
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  getUserStats,
} from '../../../services/dashboardApi'

interface User {
  id: string
  username: string
  email: string
  role: 'admin' | 'user' | 'viewer'
  status: 'active' | 'inactive' | 'suspended'
  created_at: string
  updated_at: string
  last_login?: string
}

interface UserStats {
  total: number
  by_role: { admin: number; user: number; viewer: number }
  by_status: { active: number; inactive: number; suspended: number }
}

const UserManagementViz = () => {
  const [users, setUsers] = useState<User[]>([])
  const [stats, setStats] = useState<UserStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUsers, setSelectedUsers] = useState<User[]>([])

  // Modal states
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false)
  const [isEditFlyoutVisible, setIsEditFlyoutVisible] = useState(false)
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [deletingUser, setDeletingUser] = useState<User | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    role: 'user',
    status: 'active',
  })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)

  // Sorting and pagination state
  const [sortField, setSortField] = useState<keyof User>('username')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(10)

  // Fetch users and stats
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [usersResult, statsResult] = await Promise.all([
      getUsers(),
      getUserStats(),
    ])

    if (usersResult.error) {
      setError(usersResult.error)
    } else {
      setUsers(usersResult.data?.users || [])
      setError(null)
    }

    if (statsResult.data) {
      setStats(statsResult.data)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Filter users by search
  const filteredUsers = users.filter(user => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      user.username.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query) ||
      user.role.toLowerCase().includes(query)
    )
  })

  // Sort filtered users
  const sortedUsers = [...filteredUsers].sort((a, b) => {
    const aValue = a[sortField]
    const bValue = b[sortField]
    if (aValue === undefined || aValue === null) return 1
    if (bValue === undefined || bValue === null) return -1
    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
    return 0
  })

  // Validate form
  const validateForm = () => {
    const errors: Record<string, string> = {}
    if (!formData.username.trim()) {
      errors.username = 'Username is required'
    }
    if (!formData.email.trim()) {
      errors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Invalid email format'
    }
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  // Handle create user
  const handleCreate = async () => {
    if (!validateForm()) return

    setIsSaving(true)
    const result = await createUser(formData)
    setIsSaving(false)

    if (result.error) {
      setError(result.error)
    } else {
      setIsCreateModalVisible(false)
      resetForm()
      fetchData()
    }
  }

  // Handle edit user
  const handleEdit = async () => {
    if (!editingUser || !validateForm()) return

    setIsSaving(true)
    const result = await updateUser(editingUser.id, formData)
    setIsSaving(false)

    if (result.error) {
      setError(result.error)
    } else {
      setIsEditFlyoutVisible(false)
      setEditingUser(null)
      resetForm()
      fetchData()
    }
  }

  // Handle delete user
  const handleDelete = async () => {
    if (!deletingUser) return

    setIsSaving(true)
    const result = await deleteUser(deletingUser.id)
    setIsSaving(false)

    if (result.error) {
      setError(result.error)
    } else {
      setIsDeleteModalVisible(false)
      setDeletingUser(null)
      fetchData()
    }
  }

  // Reset form
  const resetForm = () => {
    setFormData({
      username: '',
      email: '',
      role: 'user',
      status: 'active',
    })
    setFormErrors({})
  }

  // Open edit flyout
  const openEditFlyout = (user: User) => {
    setEditingUser(user)
    setFormData({
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
    })
    setIsEditFlyoutVisible(true)
  }

  // Table columns
  const columns = [
    {
      field: 'username',
      name: 'Username',
      sortable: true,
      truncateText: true,
    },
    {
      field: 'email',
      name: 'Email',
      sortable: true,
      truncateText: true,
    },
    {
      field: 'role',
      name: 'Role',
      sortable: true,
      render: (role: string) => {
        const color = role === 'admin' ? 'danger' : role === 'user' ? 'primary' : 'default'
        return <EuiBadge color={color}>{role}</EuiBadge>
      },
    },
    {
      field: 'status',
      name: 'Status',
      sortable: true,
      render: (status: string) => {
        const color = status === 'active' ? 'success' : status === 'inactive' ? 'warning' : 'danger'
        return <EuiHealth color={color}>{status}</EuiHealth>
      },
    },
    {
      field: 'last_login',
      name: 'Last Login',
      sortable: true,
      render: (date: string) => date ? new Date(date).toLocaleDateString() : 'Never',
    },
    {
      name: 'Actions',
      actions: [
        {
          name: 'Edit',
          description: 'Edit user',
          icon: 'pencil',
          type: 'icon' as const,
          onClick: (user: User) => openEditFlyout(user),
        },
        {
          name: 'Delete',
          description: 'Delete user',
          icon: 'trash',
          type: 'icon' as const,
          color: 'danger',
          onClick: (user: User) => {
            setDeletingUser(user)
            setIsDeleteModalVisible(true)
          },
        },
      ],
    },
  ]

  // Selection config
  const selection: EuiTableSelectionType<User> = {
    onSelectionChange: (selection) => setSelectedUsers(selection),
    selectable: () => true,
    selectableMessage: () => '',
  }

  // Role options
  const roleOptions = [
    { value: 'admin', text: 'Admin' },
    { value: 'user', text: 'User' },
    { value: 'viewer', text: 'Viewer' },
  ]

  // Status options
  const statusOptions = [
    { value: 'active', text: 'Active' },
    { value: 'inactive', text: 'Inactive' },
    { value: 'suspended', text: 'Suspended' },
  ]

  if (loading) {
    return (
      <EuiPanel hasBorder>
        <EuiFlexGroup justifyContent="center" alignItems="center" style={{ height: 400 }}>
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="xl" />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    )
  }

  return (
    <>
      <EuiPanel hasBorder>
        <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiTitle size="s"><h3>User Management</h3></EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              iconType="plus"
              fill
              onClick={() => {
                resetForm()
                setIsCreateModalVisible(true)
              }}
            >
              Create User
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="m" />

        {error && (
          <>
            <EuiCallOut title="Error" color="danger" iconType="alert" size="s">
              <p>{error}</p>
            </EuiCallOut>
            <EuiSpacer size="m" />
          </>
        )}

        {/* Stats */}
        {stats && (
          <>
            <EuiFlexGroup gutterSize="l">
              <EuiFlexItem>
                <EuiStat title={stats.total} description="Total Users" titleSize="s" />
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiStat
                  title={stats.by_status?.active || 0}
                  description="Active"
                  titleColor="success"
                  titleSize="s"
                />
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiStat
                  title={stats.by_role?.admin || 0}
                  description="Admins"
                  titleColor="danger"
                  titleSize="s"
                />
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiStat
                  title={stats.by_role?.user || 0}
                  description="Users"
                  titleColor="primary"
                  titleSize="s"
                />
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="m" />
          </>
        )}

        {/* Search */}
        <EuiFieldSearch
          placeholder="Search users..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          isClearable
        />

        <EuiSpacer size="m" />

        {/* Bulk actions */}
        {selectedUsers.length > 0 && (
          <>
            <EuiFlexGroup gutterSize="s" alignItems="center">
              <EuiFlexItem grow={false}>
                <EuiText size="s">
                  <strong>{selectedUsers.length}</strong> selected
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty
                  size="s"
                  color="danger"
                  iconType="trash"
                  onClick={() => {
                    // Handle bulk delete
                  }}
                >
                  Delete Selected
                </EuiButtonEmpty>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="s" />
          </>
        )}

        {/* Users table */}
        <EuiBasicTable
          items={sortedUsers.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)}
          columns={columns}
          selection={selection}
          isSelectable={true}
          itemId="id"
          hasActions={true}
          sorting={{
            sort: {
              field: sortField,
              direction: sortDirection,
            },
          }}
          onChange={({ sort, page }: Criteria<User>) => {
            if (sort) {
              setSortField(sort.field as keyof User)
              setSortDirection(sort.direction)
            }
            if (page) {
              setPageIndex(page.index)
              setPageSize(page.size)
            }
          }}
          pagination={{
            pageIndex,
            pageSize,
            totalItemCount: sortedUsers.length,
            pageSizeOptions: [5, 10, 20, 50],
          }}
        />
      </EuiPanel>

      {/* Create User Modal */}
      {isCreateModalVisible && (
        <EuiModal onClose={() => setIsCreateModalVisible(false)}>
          <EuiModalHeader>
            <EuiModalHeaderTitle>Create User</EuiModalHeaderTitle>
          </EuiModalHeader>
          <EuiModalBody>
            <EuiForm>
              <EuiFormRow
                label="Username"
                isInvalid={!!formErrors.username}
                error={formErrors.username}
              >
                <EuiFieldText
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  isInvalid={!!formErrors.username}
                />
              </EuiFormRow>
              <EuiFormRow
                label="Email"
                isInvalid={!!formErrors.email}
                error={formErrors.email}
              >
                <EuiFieldText
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  isInvalid={!!formErrors.email}
                />
              </EuiFormRow>
              <EuiFormRow label="Role">
                <EuiSelect
                  options={roleOptions}
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                />
              </EuiFormRow>
              <EuiFormRow label="Status">
                <EuiSelect
                  options={statusOptions}
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                />
              </EuiFormRow>
            </EuiForm>
          </EuiModalBody>
          <EuiModalFooter>
            <EuiButtonEmpty onClick={() => setIsCreateModalVisible(false)}>Cancel</EuiButtonEmpty>
            <EuiButton onClick={handleCreate} fill isLoading={isSaving}>
              Create
            </EuiButton>
          </EuiModalFooter>
        </EuiModal>
      )}

      {/* Edit User Flyout */}
      {isEditFlyoutVisible && editingUser && (
        <EuiFlyout onClose={() => setIsEditFlyoutVisible(false)} size="s">
          <EuiFlyoutHeader hasBorder>
            <EuiTitle size="m">
              <h2>Edit User</h2>
            </EuiTitle>
          </EuiFlyoutHeader>
          <EuiFlyoutBody>
            <EuiForm>
              <EuiFormRow
                label="Username"
                isInvalid={!!formErrors.username}
                error={formErrors.username}
              >
                <EuiFieldText
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  isInvalid={!!formErrors.username}
                />
              </EuiFormRow>
              <EuiFormRow
                label="Email"
                isInvalid={!!formErrors.email}
                error={formErrors.email}
              >
                <EuiFieldText
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  isInvalid={!!formErrors.email}
                />
              </EuiFormRow>
              <EuiFormRow label="Role">
                <EuiSelect
                  options={roleOptions}
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                />
              </EuiFormRow>
              <EuiFormRow label="Status">
                <EuiSelect
                  options={statusOptions}
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                />
              </EuiFormRow>
            </EuiForm>
          </EuiFlyoutBody>
          <EuiFlyoutFooter>
            <EuiFlexGroup justifyContent="spaceBetween">
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty onClick={() => setIsEditFlyoutVisible(false)}>
                  Cancel
                </EuiButtonEmpty>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton onClick={handleEdit} fill isLoading={isSaving}>
                  Save Changes
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlyoutFooter>
        </EuiFlyout>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalVisible && deletingUser && (
        <EuiConfirmModal
          title="Delete User"
          onCancel={() => setIsDeleteModalVisible(false)}
          onConfirm={handleDelete}
          cancelButtonText="Cancel"
          confirmButtonText="Delete"
          buttonColor="danger"
          isLoading={isSaving}
        >
          <p>
            Are you sure you want to delete <strong>{deletingUser.username}</strong>?
            This action cannot be undone.
          </p>
        </EuiConfirmModal>
      )}
    </>
  )
}

export default UserManagementViz
