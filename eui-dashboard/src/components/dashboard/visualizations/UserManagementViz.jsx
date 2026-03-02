import React, { useState, useEffect } from 'react'
import {
  EuiPanel,
  EuiTitle,
  EuiSpacer,
  EuiBasicTable,
  EuiButton,
  EuiModal,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiModalBody,
  EuiModalFooter,
  EuiFormRow,
  EuiFieldText,
  EuiSelect,
  EuiBadge
} from '@elastic/eui'
import dashboardApi from '../../../api/dashboardApi'

function UserManagementViz() {
  const [users, setUsers] = useState([])
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'user' })

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      const data = await dashboardApi.getUsers()
      setUsers(data || [])
    } catch (error) {
      console.error('Failed to fetch users:', error)
      // Mock data for demo
      setUsers([
        { id: 1, name: 'Admin User', email: 'admin@cortex.ai', role: 'admin', status: 'active' },
        { id: 2, name: 'Worker Bot', email: 'worker@cortex.ai', role: 'worker', status: 'active' }
      ])
    }
  }

  const handleCreateUser = async () => {
    try {
      await dashboardApi.createUser(newUser)
      setIsModalVisible(false)
      setNewUser({ name: '', email: '', role: 'user' })
      fetchUsers()
    } catch (error) {
      console.error('Failed to create user:', error)
    }
  }

  const columns = [
    {
      field: 'name',
      name: 'Name'
    },
    {
      field: 'email',
      name: 'Email'
    },
    {
      field: 'role',
      name: 'Role',
      render: (role) => <EuiBadge color="primary">{role}</EuiBadge>
    },
    {
      field: 'status',
      name: 'Status',
      render: (status) => <EuiBadge color={status === 'active' ? 'success' : 'default'}>{status}</EuiBadge>
    }
  ]

  return (
    <EuiPanel>
      <EuiTitle size="m">
        <h2>User Management</h2>
      </EuiTitle>
      <EuiSpacer size="m" />

      <EuiButton fill iconType="plusInCircle" onClick={() => setIsModalVisible(true)}>
        Create User
      </EuiButton>

      <EuiSpacer size="m" />

      <EuiBasicTable
        items={users}
        columns={columns}
        tableLayout="auto"
      />

      {isModalVisible && (
        <EuiModal onClose={() => setIsModalVisible(false)}>
          <EuiModalHeader>
            <EuiModalHeaderTitle>Create New User</EuiModalHeaderTitle>
          </EuiModalHeader>
          <EuiModalBody>
            <EuiFormRow label="Name">
              <EuiFieldText
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              />
            </EuiFormRow>
            <EuiFormRow label="Email">
              <EuiFieldText
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              />
            </EuiFormRow>
            <EuiFormRow label="Role">
              <EuiSelect
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                options={[
                  { value: 'user', text: 'User' },
                  { value: 'admin', text: 'Admin' },
                  { value: 'worker', text: 'Worker' }
                ]}
              />
            </EuiFormRow>
          </EuiModalBody>
          <EuiModalFooter>
            <EuiButton onClick={() => setIsModalVisible(false)}>Cancel</EuiButton>
            <EuiButton fill onClick={handleCreateUser}>Create</EuiButton>
          </EuiModalFooter>
        </EuiModal>
      )}
    </EuiPanel>
  )
}

export default UserManagementViz
