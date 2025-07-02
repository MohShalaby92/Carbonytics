import { apiService } from './api';
import { API_ENDPOINTS } from '../constants';
import { User, Organization } from '../types';


export interface OrganizationSettings {
  currency: string;
  timezone: string;
  language: string;
}

export interface OrganizationUser extends User {
  lastLogin?: string;
}

export const organizationService = {
  getOrganization: async (): Promise<Organization> => {
    const response = await apiService.get<Organization>(API_ENDPOINTS.ORGANIZATIONS.BASE);
    return response.data!;
  },

  updateOrganization: async (data: Partial<Organization>): Promise<Organization> => {
    const response = await apiService.put<Organization>(API_ENDPOINTS.ORGANIZATIONS.BASE, data);
    return response.data!;
  },

  getUsers: async (params?: { page?: number; limit?: number; role?: string; search?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.role) queryParams.append('role', params.role);
    if (params?.search) queryParams.append('search', params.search);

    const response = await apiService.get<{
      users: OrganizationUser[];
      pagination: { page: number; pages: number; total: number };
    }>(`${API_ENDPOINTS.ORGANIZATIONS.USERS}?${queryParams.toString()}`);
    return response.data!;
  },

  inviteUser: async (data: { email: string; name: string; role: string }) => {
    const response = await apiService.post(API_ENDPOINTS.ORGANIZATIONS.INVITE_USER, data);
    return response.data;
  },

  updateUserRole: async (userId: string, role: string) => {
    const response = await apiService.put(API_ENDPOINTS.ORGANIZATIONS.UPDATE_USER_ROLE(userId), { role });
    return response.data;
  },

  removeUser: async (userId: string) => {
    const response = await apiService.delete(API_ENDPOINTS.ORGANIZATIONS.REMOVE_USER(userId));
    return response.data;
  },

  getSettings: async (): Promise<OrganizationSettings> => {
    const response = await apiService.get<OrganizationSettings>(API_ENDPOINTS.ORGANIZATIONS.SETTINGS);
    return response.data!;
  },

  updateSettings: async (settings: Partial<OrganizationSettings>): Promise<OrganizationSettings> => {
    const response = await apiService.put<OrganizationSettings>(API_ENDPOINTS.ORGANIZATIONS.SETTINGS, settings);
    return response.data!;
  },
};
