export const API_ENDPOINTS = {
	AUTH: {
	  LOGIN: '/auth/login',
	  REGISTER: '/auth/register',
	  REFRESH: '/auth/refresh',
	  LOGOUT: '/auth/logout',
	  PROFILE: '/auth/profile',
	  CHANGE_PASSWORD: '/auth/change-password',
	},
	
	CALCULATIONS: {
	  BASE: '/calculations',
	  BY_ID: (id: string) => `/calculations/${id}`,
	  CALCULATE: '/calculations/calculate',
	  CALCULATE_BATCH: '/calculations/calculate-batch',
	  CALCULATE_BUSINESS_TRAVEL: '/calculations/calculate-business-travel',
	  EXPORT: (id: string) => `/calculations/${id}/export`,
	},
	
	EMISSION_CATEGORIES: {
	  BASE: '/emission-categories',
	  BY_ID: (id: string) => `/emission-categories/${id}`,
	  BY_SCOPE: (scope: 1 | 2 | 3) => `/emission-categories/scope/${scope}`,
	  BY_INDUSTRY: (industry: string) => `/emission-categories/industry/${industry}`,
	},
	
	EMISSION_FACTORS: {
	  BASE: '/emission-factors',
	  BY_CATEGORY: (categoryId: string) => `/emission-factors/category/${categoryId}`,
	  DEFAULT_FOR_CATEGORY: (categoryId: string) => `/emission-factors/category/${categoryId}/default`,
	  SEARCH: '/emission-factors/search',
	  SOURCES: '/emission-factors/sources',
	},
	
	ORGANIZATIONS: {
	  BASE: '/organizations',
	  BY_ID: (id: string) => `/organizations/${id}`,
	  USERS: '/organizations/users',
	  INVITE_USER: '/organizations/users/invite',
	  UPDATE_USER_ROLE: (userId: string) => `/organizations/users/${userId}/role`,
	  REMOVE_USER: (userId: string) => `/organizations/users/${userId}`,
	  SETTINGS: '/organizations/settings',
	},
	
	REPORTS: {
	  BASE: '/reports',
	  DASHBOARD: '/reports/dashboard',
	  EMISSIONS: '/reports/emissions',
	  COMPARISON: '/reports/comparison',
	  TRENDS: '/reports/trends',
	  EXPORT: (reportId: string) => `/reports/export/${reportId}`,
	  BENCHMARKS: '/reports/benchmarks',
	},
  } as const;
  
  export const EMISSION_SCOPES = {
	1: {
	  name: 'Scope 1',
	  description: 'Direct emissions from owned or controlled sources',
	  color: '#ef4444',
	  icon: 'Factory',
	  examples: ['Natural gas boilers', 'Company vehicles', 'Refrigerant leaks'],
	},
	2: {
	  name: 'Scope 2',
	  description: 'Indirect emissions from purchased energy',
	  color: '#f59e0b',
	  icon: 'Zap',
	  examples: ['Purchased electricity', 'Steam heating', 'District cooling'],
	},
	3: {
	  name: 'Scope 3',
	  description: 'Indirect emissions from value chain',
	  color: '#10b981',
	  icon: 'Truck',
	  examples: ['Business travel', 'Employee commuting', 'Purchased goods'],
	},
  } as const;
  
  export const INDUSTRIES = [
	'Technology/Software',
	'Manufacturing',
	'Financial Services',
	'Healthcare',
	'Education',
	'Retail/E-commerce',
	'Construction',
	'Transportation',
	'Energy/Utilities',
	'Tourism/Hospitality',
	'Agriculture',
	'Oil & Gas',
	'Cement',
	'Steel & Metals',
	'Chemical & Petrochemical',
	'Other',
  ] as const;
  
  export const ORGANIZATION_SIZES = {
	micro: {
		name: 'Micro (1-10 employees)',
		max: 10,
		description: 'Microbusinesses',
	},
	small: { 
	  name: 'Small (11-50 employees)', 
	  max: 50,
	  description: 'Small businesses',
	},
	medium: { 
	  name: 'Medium (51-250 employees)', 
	  max: 250,
	  description: 'Growing companies and mid-size enterprises',
	},
	large: { 
	  name: 'Large (250+ employees)', 
	  max: null,
	  description: 'Large enterprises and corporations',
	},
  } as const;
  
  export const CALCULATION_STATUS = {
	draft: {
	  name: 'Draft',
	  color: 'gray',
	  description: 'Work in progress',
	},
	completed: {
	  name: 'Completed',
	  color: 'blue',
	  description: 'Calculation finished',
	},
	verified: {
	  name: 'Verified',
	  color: 'green',
	  description: 'Reviewed and verified',
	},
  } as const;
  
  export const USER_ROLES = {
	admin: {
	  name: 'Administrator',
	  permissions: ['all'],
	  description: 'Full system access',
	},
	manager: {
	  name: 'Manager',
	  permissions: ['read', 'write', 'invite'],
	  description: 'Can manage team and calculations',
	},
	user: {
	  name: 'User',
	  permissions: ['read', 'write'],
	  description: 'Can create and view calculations',
	},
  } as const;
  
  export const REGIONS = {
	egypt: {
	  name: 'Egypt',
	  code: 'EG',
	  currency: 'EGP',
	  timezone: 'Africa/Cairo',
	},
	global: {
	  name: 'Global',
	  code: 'GLOBAL',
	  currency: 'USD',
	  timezone: 'UTC',
	},
	mena: {
	  name: 'Middle East & North Africa',
	  code: 'MENA',
	  currency: 'USD',
	  timezone: 'UTC',
	},
	eu: {
	  name: 'European Union',
	  code: 'EU',
	  currency: 'EUR',
	  timezone: 'Europe/Brussels',
	},
	us: {
	  name: 'United States',
	  code: 'US',
	  currency: 'USD',
	  timezone: 'America/New_York',
	},
  } as const;
  
  export const EMISSION_FACTOR_SOURCES = {
	'DEFRA 2024': {
	  name: 'DEFRA 2024',
	  description: 'UK Department for Environment, Food & Rural Affairs',
	  reliability: 'high',
	  region: 'global',
	},
	'IPCC 2006': {
	  name: 'IPCC 2006',
	  description: 'Intergovernmental Panel on Climate Change Guidelines',
	  reliability: 'high',
	  region: 'global',
	},
	'IPCC 2019': {
	  name: 'IPCC 2019',
	  description: 'IPCC Refinement to 2006 Guidelines',
	  reliability: 'high',
	  region: 'global',
	},
	'EPA 2024': {
	  name: 'EPA 2024',
	  description: 'US Environmental Protection Agency',
	  reliability: 'high',
	  region: 'us',
	},
	'IEA Egypt': {
	  name: 'IEA Egypt',
	  description: 'International Energy Agency - Egypt Data',
	  reliability: 'high',
	  region: 'egypt',
	},
  } as const;
  
  export const TRAVEL_MODES = {
	Flight: {
	  name: 'Flight',
	  icon: 'Plane',
	  classes: ['Economy', 'Business', 'First'],
	  unit: 'km',
	},
	Car: {
	  name: 'Car',
	  icon: 'Car',
	  classes: ['Small', 'Medium', 'Large', 'Electric'],
	  unit: 'km',
	},
	Train: {
	  name: 'Train',
	  icon: 'Train',
	  classes: ['Standard', 'High-speed'],
	  unit: 'km',
	},
	Bus: {
	  name: 'Bus',
	  icon: 'Bus',
	  classes: ['Local', 'Long-distance'],
	  unit: 'km',
	},
  } as const;
  
  export const CURRENCIES = {
	EGP: { name: 'Egyptian Pound', symbol: 'ج.م' },
	USD: { name: 'US Dollar', symbol: '$' },
	EUR: { name: 'Euro', symbol: '€' },
	GBP: { name: 'British Pound', symbol: '£' },
  } as const;
  
  export const LANGUAGES = {
	en: { name: 'English', nativeName: 'English' },
	ar: { name: 'Arabic', nativeName: 'العربية' },
  } as const;
  
  // Chart configuration
  export const CHART_COLORS = {
	scope1: '#ef4444', // Red
	scope2: '#f59e0b', // Orange/Yellow
	scope3: '#10b981', // Green
	total: '#6b7280',  // Gray
	primary: '#0ea5e9', // Blue
	secondary: '#8b5cf6', // Purple
  } as const;
  
  export const DATE_FORMATS = {
	SHORT: 'MMM dd, yyyy',
	LONG: 'MMMM dd, yyyy',
	ISO: 'yyyy-MM-dd',
	DISPLAY: 'dd/MM/yyyy',
  } as const;
  
  // Validation constants
  export const VALIDATION_RULES = {
	EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
	PASSWORD_MIN_LENGTH: 8,
	NAME_MIN_LENGTH: 2,
	NAME_MAX_LENGTH: 100,
	ORGANIZATION_NAME_MAX_LENGTH: 200,
	DESCRIPTION_MAX_LENGTH: 1000,
	NOTES_MAX_LENGTH: 500,
  } as const;
  
  export const API_CONFIG = {
	BASE_URL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
	TIMEOUT: 10000, // 10 seconds
	RETRY_ATTEMPTS: 3,
	CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
  } as const;
  
  // File upload constants
  export const FILE_UPLOAD = {
	MAX_SIZE: 10 * 1024 * 1024, // 10MB
	ALLOWED_TYPES: [
	  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
	  'application/vnd.ms-excel', // .xls
	  'text/csv', // .csv
	],
	ALLOWED_EXTENSIONS: ['.xlsx', '.xls', '.csv'],
  } as const;
  
  // Feature flags (for development/production differences)
  export const FEATURE_FLAGS = {
	ENABLE_BENCHMARKS: true,
	ENABLE_ADVANCED_REPORTS: true,
	ENABLE_FILE_UPLOAD: true,
	ENABLE_BUSINESS_TRAVEL_CALCULATOR: true,
	ENABLE_INDUSTRY_SPECIFIC_CATEGORIES: true,
	ENABLE_REAL_TIME_CALCULATIONS: true,
  } as const;
  
  export const ERROR_MESSAGES = {
	NETWORK_ERROR: 'Network error. Please check your connection and try again.',
	UNAUTHORIZED: 'Your session has expired. Please log in again.',
	FORBIDDEN: 'You do not have permission to perform this action.',
	NOT_FOUND: 'The requested resource was not found.',
	SERVER_ERROR: 'An unexpected error occurred. Please try again later.',
	VALIDATION_ERROR: 'Please check your input and try again.',
  } as const;
  
  export const SUCCESS_MESSAGES = {
	CALCULATION_SAVED: 'Calculation saved successfully',
	PROFILE_UPDATED: 'Profile updated successfully',
	PASSWORD_CHANGED: 'Password changed successfully',
	USER_INVITED: 'User invitation sent successfully',
	ORGANIZATION_UPDATED: 'Organization settings updated successfully',
  } as const;
  
  export type Industry = typeof INDUSTRIES[number];
  export type OrganizationSize = keyof typeof ORGANIZATION_SIZES;
  export type CalculationStatus = keyof typeof CALCULATION_STATUS;
  export type UserRole = keyof typeof USER_ROLES;
  export type Region = keyof typeof REGIONS;
  export type EmissionScope = keyof typeof EMISSION_SCOPES;
  export type TravelMode = keyof typeof TRAVEL_MODES;
  export type Currency = keyof typeof CURRENCIES;
  export type Language = keyof typeof LANGUAGES;