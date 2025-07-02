import React, { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { useAuth } from '../../hooks/useAuth';
import { apiService } from '../../services/api';
import { API_ENDPOINTS } from '../../constants';
import { User, Mail, Lock, Save } from 'lucide-react';

export const ProfileSettings: React.FC = () => {
  const { user, updateProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    email: user?.email || '',
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      await updateProfile(profileData);
      setMessage({ type: 'success', text: 'Profile updated successfully' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to update profile' });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      await apiService.put(API_ENDPOINTS.AUTH.CHANGE_PASSWORD, {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });
      
      setMessage({ type: 'success', text: 'Password changed successfully' });
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setShowPasswordForm(false);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to change password' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {message && (
        <Alert variant={message.type === 'success' ? 'success' : 'error'}>
          {message.text}
        </Alert>
      )}

      {/* Profile Information */}
      <Card className="p-6">
        <div className="flex items-center mb-6">
          <User className="w-5 h-5 text-primary-600 mr-2" />
          <h2 className="text-xl font-semibold text-gray-900">Profile Information</h2>
        </div>

        <form onSubmit={handleProfileUpdate} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Full Name
            </label>
            <Input
              id="name"
              value={profileData.name}
              onChange={(e) => setProfileData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Enter your full name"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <Input
              id="email"
              type="email"
              value={profileData.email}
              onChange={(e) => setProfileData(prev => ({ ...prev, email: e.target.value }))}
              placeholder="Enter your email address"
            />
          </div>

          <div className="flex items-center justify-between pt-4">
            <div className="text-sm text-gray-600">
              <Mail className="w-4 h-4 inline mr-1" />
              Role: <span className="font-medium capitalize">{user?.role}</span>
            </div>
            <Button type="submit" loading={loading}>
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </Button>
          </div>
        </form>
      </Card>

      {/* Password Security */}
      <Card className="p-6">
        <div className="flex items-center mb-6">
          <Lock className="w-5 h-5 text-primary-600 mr-2" />
          <h2 className="text-xl font-semibold text-gray-900">Password & Security</h2>
        </div>

        {!showPasswordForm ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">
                Keep your account secure by using a strong password
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Last updated: {user?.updatedAt ? new Date(user.updatedAt).toLocaleDateString() : 'Never'}
              </p>
            </div>
            <Button 
              variant="outline" 
              onClick={() => setShowPasswordForm(true)}
            >
              Change Password
            </Button>
          </div>
        ) : (
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-2">
                Current Password
              </label>
              <Input
                id="currentPassword"
                type="password"
                value={passwordData.currentPassword}
                onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                placeholder="Enter current password"
                required
              />
            </div>

            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-2">
                New Password
              </label>
              <Input
                id="newPassword"
                type="password"
                value={passwordData.newPassword}
                onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                placeholder="Enter new password"
                required
                minLength={6}
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                Confirm New Password
              </label>
              <Input
                id="confirmPassword"
                type="password"
                value={passwordData.confirmPassword}
                onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                placeholder="Confirm new password"
                required
                minLength={6}
              />
            </div>

            <div className="flex space-x-3 pt-4">
              <Button type="submit" loading={loading}>
                Update Password
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setShowPasswordForm(false);
                  setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
};
