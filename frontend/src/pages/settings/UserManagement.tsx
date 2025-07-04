import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { organizationService, OrganizationUser } from '../../services/organizationService';
import { USER_ROLES } from '../../constants';
import { 
  Users, 
  UserPlus, 
  Search, 
  MoreVertical, 
  Mail, 
  Shield,
  Trash2,
  Clock
} from 'lucide-react';

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<OrganizationUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteData, setInviteData] = useState({
    name: '',
    email: '',
    role: 'user' as 'admin' | 'manager' | 'user',
  });
  const [userMenuOpen, setUserMenuOpen] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, [searchTerm]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await organizationService.getUsers({ search: searchTerm || undefined });
      setUsers(data.users);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      await organizationService.inviteUser(inviteData);
      setMessage({ type: 'success', text: 'User invited successfully' });
      setInviteData({ name: '', email: '', role: 'user' });
      setShowInviteForm(false);
      loadUsers();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to invite user' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRole = async (userId: string, role: string) => {
    try {
      await organizationService.updateUserRole(userId, role);
      setMessage({ type: 'success', text: 'User role updated successfully' });
      loadUsers();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to update role' });
    }
    setUserMenuOpen(null);
  };

  const handleRemoveUser = async (userId: string) => {
    if (!window.confirm('Are you sure you want to remove this user?')) return;

    try {
      await organizationService.removeUser(userId);
      setMessage({ type: 'success', text: 'User removed successfully' });
      loadUsers();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to remove user' });
    }
    setUserMenuOpen(null);
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-700';
      case 'manager': return 'bg-blue-100 text-blue-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="space-y-6">
      {message && (
        <Alert variant={message.type === 'success' ? 'success' : 'error'}>
          {message.text}
        </Alert>
      )}

      {/* Header */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Users className="w-5 h-5 text-primary-600 mr-2" />
            <h2 className="text-xl font-semibold text-gray-900">User Management</h2>
          </div>
          <Button onClick={() => setShowInviteForm(true)}>
            <UserPlus className="w-4 h-4 mr-2" />
            Invite User
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </Card>

      {/* Invite Form */}
      {showInviteForm && (
        <Card className="p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Invite New User</h3>
          <form onSubmit={handleInviteUser} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="userName" className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name
                </label>
                <Input
                  id="userName"
                  value={inviteData.name}
                  onChange={(e) => setInviteData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter full name"
                  required
                />
              </div>
              <div>
                <label htmlFor="userEmail" className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <Input
                  id="userEmail"
                  type="email"
                  value={inviteData.email}
                  onChange={(e) => setInviteData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="Enter email address"
                  required
                />
              </div>
            </div>
            <div>
              <label htmlFor="userRole" className="block text-sm font-medium text-gray-700 mb-2">
                Role
              </label>
              <select
                id="userRole"
                value={inviteData.role}
                onChange={(e) => setInviteData(prev => ({ ...prev, role: e.target.value as any }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              >
                {Object.entries(USER_ROLES).map(([key, config]) => (
                  <option key={key} value={key}>{config.name}</option>
                ))}
              </select>
            </div>
            <div className="flex space-x-3">
              <Button type="submit" loading={loading}>
                <Mail className="w-4 h-4 mr-2" />
                Send Invitation
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowInviteForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Users List */}
      <Card className="p-6">
        <div className="space-y-4">
          {users.map((user) => (
            <div key={user.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                  <span className="text-primary-600 font-medium">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">{user.name}</h4>
                  <p className="text-sm text-gray-600">{user.email}</p>
                  {user.lastLogin && (
                    <p className="text-xs text-gray-500 flex items-center mt-1">
                      <Clock className="w-3 h-3 mr-1" />
                      Last login: {new Date(user.lastLogin).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${getRoleBadgeColor(user.role)}`}>
                  {USER_ROLES[user.role as keyof typeof USER_ROLES]?.name || user.role}
                </span>
                
                <div className="relative">
                  <button
                    onClick={() => setUserMenuOpen(userMenuOpen === user.id ? null : user.id)}
                    className="p-1 text-gray-400 hover:text-gray-600"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {userMenuOpen === user.id && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-10">
                      <div className="py-1">
                        <button
                          onClick={() => handleUpdateRole(user.id, 'admin')}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                          disabled={user.role === 'admin'}
                        >
                          <Shield className="w-4 h-4 mr-2" />
                          Make Admin
                        </button>
                        <button
                          onClick={() => handleUpdateRole(user.id, 'manager')}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                          disabled={user.role === 'manager'}
                        >
                          <Shield className="w-4 h-4 mr-2" />
                          Make Manager
                        </button>
                        <button
                          onClick={() => handleUpdateRole(user.id, 'user')}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                          disabled={user.role === 'user'}
                        >
                          <Shield className="w-4 h-4 mr-2" />
                          Make User
                        </button>
                        <div className="border-t border-gray-100 my-1"></div>
                        <button
                          onClick={() => handleRemoveUser(user.id)}
                          className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Remove User
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {users.length === 0 && !loading && (
            <div className="text-center py-8">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No users found</h3>
              <p className="text-gray-600 mb-4">
                {searchTerm ? 'No users match your search criteria.' : 'No users have been added to your organization yet.'}
              </p>
              {!searchTerm && (
                <Button onClick={() => setShowInviteForm(true)}>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Invite Your First User
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};
