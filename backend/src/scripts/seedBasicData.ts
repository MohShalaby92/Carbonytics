import { EmissionCategory } from '../models/EmissionCategory';
import { EmissionFactor } from '../models/EmissionFactor';
import { logger } from '../utils/logger';

export async function seedBasicData(): Promise<void> {
  try {
    // Clear existing data
    await EmissionCategory.deleteMany({});
    await EmissionFactor.deleteMany({});
    
    logger.info('Cleared existing emission data');

    // Seed Scope 1 Categories
    await seedScope1Categories();
    
    // Seed Scope 2 Categories
    await seedScope2Categories();
    
    // Seed Scope 3 Categories
    await seedScope3Categories();
    
    // Seed Egyptian-specific emission factors
    await seedEgyptianFactors();
    
    logger.info('Basic data seeding completed');
    
  } catch (error) {
    logger.error('Basic data seeding failed:', error);
    throw error;
  }
}

async function seedScope1Categories(): Promise<void> {
  const scope1Categories = [
    {
      scope: 1,
      category: 'Stationary Combustion',
      description: 'Emissions from fuel combustion in onsite equipment owned or controlled by your company',
      clarification: 'Covers direct emissions from on-site combustion of fuels in boilers, furnaces, etc. Requires fuel type, quantity used, and combustion technology data.',
      baseUnit: 'L', // Liters for fuel
      allowedUnits: [
        { unit: 'L', description: 'Liters', conversionToBase: 1 },
        { unit: 'kWh', description: 'Kilowatt hours', conversionToBase: 1 },
        { unit: 'm³', description: 'Cubic meters', conversionToBase: 1000 },
        { unit: 'kg', description: 'Kilograms', conversionToBase: 1 },
      ],
      priority: 'high',
      industries: ['Manufacturing', 'Energy/Utilities', 'Chemical & Petrochemical'],
      calculationMethod: 'activity_based',
      requiredInputs: [
        { field: 'fuelType', type: 'select', required: true, options: ['Natural Gas', 'Diesel', 'Heavy Fuel Oil', 'LPG'] },
        { field: 'fuelConsumption', type: 'number', required: true },
        { field: 'unit', type: 'select', required: true, options: ['L', 'kWh', 'm³', 'kg'] },
        { field: 'period', type: 'date', required: true },
      ],
      displayOrder: 1,
      icon: 'flame',
      color: '#ef4444',
    },
    {
      scope: 1,
      category: 'Mobile Combustion',
      description: 'Company-owned vehicles and equipment',
      clarification: 'Fleet vehicles, company cars, delivery trucks, aircraft, ships',
      baseUnit: 'L',
      allowedUnits: [
        { unit: 'L', description: 'Liters', conversionToBase: 1 },
        { unit: 'km', description: 'Kilometers traveled', conversionToBase: 1 },
        { unit: 'miles', description: 'Miles traveled', conversionToBase: 1.60934 },
      ],
      priority: 'high',
      industries: ['Transportation', 'Construction', 'Logistics'],
      calculationMethod: 'activity_based',
      requiredInputs: [
        { field: 'vehicleType', type: 'select', required: true, options: ['Car', 'Van', 'Truck', 'Bus', 'Motorcycle'] },
        { field: 'fuelType', type: 'select', required: true, options: ['Petrol', 'Diesel', 'LPG', 'Electric'] },
        { field: 'consumption', type: 'number', required: true },
        { field: 'unit', type: 'select', required: true, options: ['L', 'km', 'miles'] },
      ],
      displayOrder: 2,
      icon: 'truck',
      color: '#f59e0b',
    },
    {
      scope: 1,
      category: 'Process Emissions',
      description: 'Chemical/physical processes in production',
      clarification: 'Cement production, steel manufacturing, chemical reactions',
      baseUnit: 't',
      allowedUnits: [
        { unit: 't', description: 'Tonnes', conversionToBase: 1 },
        { unit: 'kg', description: 'Kilograms', conversionToBase: 0.001 },
      ],
      priority: 'medium',
      industries: ['Cement', 'Steel & Metals', 'Chemical & Petrochemical'],
      calculationMethod: 'activity_based',
      requiredInputs: [
        { field: 'materialType', type: 'select', required: true, options: ['Cement', 'Steel', 'Aluminum', 'Chemicals'] },
        { field: 'production', type: 'number', required: true },
        { field: 'unit', type: 'select', required: true, options: ['t', 'kg'] },
      ],
      displayOrder: 3,
      icon: 'cog',
      color: '#8b5cf6',
    },
    {
      scope: 1,
      category: 'Fugitive Emissions',
      description: 'Intentional/unintentional releases',
      clarification: 'Refrigerant leaks, gas pipeline leaks, equipment vents, extinguisher use',
      baseUnit: 'kg',
      allowedUnits: [
        { unit: 'kg', description: 'Kilograms', conversionToBase: 1 },
        { unit: 'L', description: 'Liters', conversionToBase: 1 },
      ],
      priority: 'medium',
      industries: ['Oil & Gas', 'Manufacturing', 'Healthcare'],
      calculationMethod: 'activity_based',
      requiredInputs: [
        { field: 'gasType', type: 'select', required: true, options: ['Methane', 'HFC-134a', 'HFC-410a', 'CO2', 'Other'] },
        { field: 'amount', type: 'number', required: true },
        { field: 'unit', type: 'select', required: true, options: ['kg', 'L'] },
      ],
      displayOrder: 4,
      icon: 'wind',
      color: '#10b981',
    },
  ];

  for (const categoryData of scope1Categories) {
    await EmissionCategory.create(categoryData);
  }

  logger.info('Seeded Scope 1 categories');
}

async function seedScope2Categories(): Promise<void> {
  const scope2Categories = [
    {
      scope: 2,
      category: 'Purchased Electricity',
      description: 'Grid electricity consumption',
      clarification: 'Office buildings, data centers, manufacturing facilities',
      baseUnit: 'kWh',
      allowedUnits: [
        { unit: 'kWh', description: 'Kilowatt hours', conversionToBase: 1 },
        { unit: 'MWh', description: 'Megawatt hours', conversionToBase: 1000 },
      ],
      priority: 'high',
      industries: ['Technology/Software', 'Manufacturing', 'Retail/E-commerce'],
      calculationMethod: 'activity_based',
      egyptianContext: {
        localFactors: 'Egypt\'s grid is 80%+ fossil fuel dependent (mainly gas)',
        considerations: 'Grid factor 0.458 kg CO2e/kWh.',
      },
      requiredInputs: [
        { field: 'consumption', type: 'number', required: true },
        { field: 'unit', type: 'select', required: true, options: ['kWh', 'MWh'] },
        { field: 'period', type: 'date', required: true },
        { field: 'renewable', type: 'select', required: false, options: ['Yes', 'No', 'Partial'] },
      ],
      displayOrder: 1,
      icon: 'zap',
      color: '#3b82f6',
    },
    {
      scope: 2,
      category: 'Purchased Steam',
      description: 'Steam for heating/processes',
      clarification: 'District heating, industrial steam',
      baseUnit: 'kg',
      allowedUnits: [
        { unit: 'kg', description: 'Kilograms', conversionToBase: 1 },
        { unit: 't', description: 'Tonnes', conversionToBase: 1000 },
      ],
      priority: 'low',
      industries: ['Manufacturing', 'Chemical & Petrochemical'],
      calculationMethod: 'activity_based',
      egyptianContext: {
        considerations: 'Limited district heating. Mostly industrial applications in textile and food sectors.',
      },
      requiredInputs: [
        { field: 'amount', type: 'number', required: true },
        { field: 'unit', type: 'select', required: true, options: ['kg', 't'] },
      ],
      displayOrder: 2,
      icon: 'cloud',
      color: '#6b7280',
    },
    {
      scope: 2,
      category: 'Purchased Heat',
      description: 'District heating systems',
      clarification: 'Centralized heating networks',
      baseUnit: 'kWh',
      allowedUnits: [
        { unit: 'kWh', description: 'Kilowatt hours thermal', conversionToBase: 1 },
        { unit: 'MWh', description: 'Megawatt hours thermal', conversionToBase: 1000 },
      ],
      priority: 'low',
      industries: ['Commercial Buildings'],
      calculationMethod: 'activity_based',
      egyptianContext: {
        considerations: 'Very limited in Egypt due to climate.',
      },
      requiredInputs: [
        { field: 'consumption', type: 'number', required: true },
        { field: 'unit', type: 'select', required: true, options: ['kWh', 'MWh'] },
      ],
      displayOrder: 3,
      icon: 'thermometer',
      color: '#f97316',
    },
    {
      scope: 2,
      category: 'Purchased Cooling',
      description: 'District cooling systems',
      clarification: 'Centralized cooling networks',
      baseUnit: 'kWh',
      allowedUnits: [
        { unit: 'kWh', description: 'Kilowatt hours cooling', conversionToBase: 1 },
        { unit: 'MWh', description: 'Megawatt hours cooling', conversionToBase: 1000 },
      ],
      priority: 'medium',
      industries: ['Commercial Buildings', 'Tourism/Hospitality'],
      calculationMethod: 'activity_based',
      egyptianContext: {
        considerations: 'Growing market due to hot climate. New Cairo and administrative capital projects include district cooling.',
      },
      requiredInputs: [
        { field: 'consumption', type: 'number', required: true },
        { field: 'unit', type: 'select', required: true, options: ['kWh', 'MWh'] },
        { field: 'systemType', type: 'select', required: false, options: ['Electric Chiller', 'Absorption', 'Other'] },
      ],
      displayOrder: 4,
      icon: 'snowflake',
      color: '#06b6d4',
    },
  ];

  for (const categoryData of scope2Categories) {
    await EmissionCategory.create(categoryData);
  }

  logger.info('Seeded Scope 2 categories');
}

async function seedScope3Categories(): Promise<void> {
  const scope3Categories = [
    // Upstream Categories (1-8)
    {
      scope: 3,
      category: 'Purchased Goods & Services',
      subcategory: 'Category 1',
      description: 'Cradle-to-gate emissions from all purchased products/services',
      clarification: 'Emissions that occur in the upstream value chain—from raw material extraction, production, and processing, up to the point of purchase by the reporting company.',
      baseUnit: 'EGP',
      allowedUnits: [
        { unit: 'EGP', description: 'Egyptian Pounds', conversionToBase: 1 },
        { unit: 'USD', description: 'US Dollars', conversionToBase: 50 }, // Approximate rate
        { unit: 'unit', description: 'Physical units', conversionToBase: 1 },
      ],
      priority: 'high',
      industries: ['All Industries'],
      calculationMethod: 'spend_based',
      requiredInputs: [
        { field: 'category', type: 'select', required: true, options: ['IT Equipment', 'Office Supplies', 'Professional Services', 'Raw Materials'] },
        { field: 'amount', type: 'number', required: true },
        { field: 'unit', type: 'select', required: true, options: ['EGP', 'USD', 'unit'] },
      ],
      displayOrder: 1,
      icon: 'shopping-cart',
      color: '#8b5cf6',
    },
    {
      scope: 3,
      category: 'Capital Goods',
      subcategory: 'Category 2',
      description: 'Emissions from production of long-term assets',
      clarification: 'Emissions from physical assets purchased by the company that are used in the production of goods or services and have a multi-year useful life. These include buildings, machinery, vehicles, IT hardware, tools, and infrastructure.',
      baseUnit: 'EGP',
      allowedUnits: [
        { unit: 'EGP', description: 'Egyptian Pounds', conversionToBase: 1 },
        { unit: 'USD', description: 'US Dollars', conversionToBase: 50 },
      ],
      priority: 'medium',
      industries: ['All Industries'],
      calculationMethod: 'spend_based',
      requiredInputs: [
        { field: 'assetType', type: 'select', required: true, options: ['Buildings', 'Machinery', 'IT Infrastructure', 'Vehicles'] },
        { field: 'value', type: 'number', required: true },
        { field: 'unit', type: 'select', required: true, options: ['EGP', 'USD'] },
        { field: 'lifespan', type: 'number', required: false },
      ],
      displayOrder: 2,
      icon: 'building',
      color: '#f59e0b',
    },
    {
      scope: 3,
      category: 'Fuel & Energy Related',
      subcategory: 'Category 3',
      description: 'Indirect upstream emissions related to the production and delivery of fuels and energy that the company consumes',
      clarification: 'NOT INCLUDED IN SCOPE 1, 2. Emissions from extraction, refining, processing, transmission, distribution, and storage of fuels and energy purchased or used by the organization.',
      baseUnit: 'kWh',
      allowedUnits: [
        { unit: 'kWh', description: 'Kilowatt hours', conversionToBase: 1 },
        { unit: 'L', description: 'Liters of fuel', conversionToBase: 1 },
      ],
      priority: 'medium',
      industries: ['Energy-Intensive Industries'],
      calculationMethod: 'activity_based',
      egyptianContext: {
        considerations: 'Transmission and distribution losses: High voltage 2%, Medium 4%, Low voltage 7%',
      },
      requiredInputs: [
        { field: 'energyType', type: 'select', required: true, options: ['Electricity', 'Natural Gas', 'Diesel', 'Petrol'] },
        { field: 'consumption', type: 'number', required: true },
        { field: 'unit', type: 'select', required: true, options: ['kWh', 'L'] },
      ],
      displayOrder: 3,
      icon: 'battery',
      color: '#10b981',
    },
    {
      scope: 3,
      category: 'Upstream Transport',
      subcategory: 'Category 4',
      description: 'Transport of purchased products',
      clarification: 'Emissions from the transportation and distribution of goods and materials purchased by the company — occurring before they reach the reporting organization. Also includes emissions from third-party warehousing and intermediate handling between suppliers and the company.',
      baseUnit: 'tkm',
      allowedUnits: [
        { unit: 'tkm', description: 'Tonne-kilometers', conversionToBase: 1 },
        { unit: 'km', description: 'Kilometers', conversionToBase: 1 },
      ],
      priority: 'medium',
      industries: ['Retail', 'Manufacturing'],
      calculationMethod: 'activity_based',
      requiredInputs: [
        { field: 'transportMode', type: 'select', required: true, options: ['Truck', 'Ship', 'Rail', 'Air'] },
        { field: 'distance', type: 'number', required: true },
        { field: 'weight', type: 'number', required: false },
        { field: 'unit', type: 'select', required: true, options: ['tkm', 'km'] },
      ],
      displayOrder: 4,
      icon: 'truck',
      color: '#3b82f6',
    },
    {
      scope: 3,
      category: 'Business Travel',
      subcategory: 'Category 6',
      description: 'Employee travel for business',
      clarification: 'Emissions from air travel, train rides, rental cars, taxis, ride-hailing services, and accommodations taking into consideration Flight segments, km/miles traveled, class of service (economy/business).',
      baseUnit: 'km',
      allowedUnits: [
        { unit: 'km', description: 'Kilometers', conversionToBase: 1 },
        { unit: 'miles', description: 'Miles', conversionToBase: 1.60934 },
      ],
      priority: 'medium',
      industries: ['Consulting', 'Technology', 'Financial Services'],
      calculationMethod: 'activity_based',
      requiredInputs: [
        { field: 'travelMode', type: 'select', required: true, options: ['Flight', 'Car', 'Train', 'Bus'] },
        { field: 'origin', type: 'text', required: true },
        { field: 'destination', type: 'text', required: true },
        { field: 'travelClass', type: 'select', required: false, options: ['Economy', 'Business', 'First'] },
        { field: 'roundTrip', type: 'select', required: true, options: ['Yes', 'No'] },
      ],
      displayOrder: 6,
      icon: 'plane',
      color: '#06b6d4',
    },
    {
      scope: 3,
      category: 'Employee Commuting',
      subcategory: 'Category 7',
      description: 'Daily travel to work',
      clarification: 'These emissions occur from any commuting method—provided the transportation is not owned or operated by the company.',
      baseUnit: 'km',
      allowedUnits: [
        { unit: 'km', description: 'Kilometers per day', conversionToBase: 1 },
        { unit: 'days', description: 'Working days', conversionToBase: 1 },
      ],
      priority: 'medium',
      industries: ['All Industries'],
      calculationMethod: 'activity_based',
      requiredInputs: [
        { field: 'employees', type: 'number', required: true },
        { field: 'averageDistance', type: 'number', required: true },
        { field: 'workingDays', type: 'number', required: true },
        { field: 'transportMode', type: 'select', required: true, options: ['Car', 'Public Transport', 'Walking/Cycling', 'Mixed'] },
      ],
      displayOrder: 7,
      icon: 'users',
      color: '#8b5cf6',
    },
    {
      scope: 3,
      category: 'Upstream Leased Assets',
      subcategory: 'Category 8',
      description: 'Leased assets not in Scope 1&2',
      clarification: 'Future development - Lessor allocation or direct measurement',
      baseUnit: 'kWh',
      allowedUnits: [
        { unit: 'kWh', description: 'Kilowatt hours', conversionToBase: 1 },
        { unit: 'm²', description: 'Square meters', conversionToBase: 1 },
        { unit: 'EGP', description: 'Egyptian Pounds', conversionToBase: 1 },
      ],
      priority: 'low',
      industries: ['Technology/Software', 'Retail/E-commerce', 'Financial Services'],
      calculationMethod: 'spend_based',
      requiredInputs: [
        { field: 'assetType', type: 'select', required: true, options: ['Office Space', 'Warehouse', 'Equipment', 'Vehicles'] },
        { field: 'area', type: 'number', required: false },
        { field: 'energyConsumption', type: 'number', required: false },
        { field: 'unit', type: 'select', required: true, options: ['kWh', 'm²', 'EGP'] },
      ],
      displayOrder: 8,
      icon: 'home',
      color: '#6b7280',
    },
    {
      scope: 3,
      category: 'Downstream Transport',
      subcategory: 'Category 9',
      description: 'Transport of sold products',
      clarification: 'Emissions from the transportation and distribution of goods and materials sold by the company — occurring after they leave the reporting organization. Also includes emissions from third-party warehousing and intermediate handling between the company and its customers.',
      baseUnit: 'tkm',
      allowedUnits: [
        { unit: 'tkm', description: 'Tonne-kilometers', conversionToBase: 1 },
        { unit: 'km', description: 'Kilometers', conversionToBase: 1 },
        { unit: 'pkm', description: 'Passenger-kilometers', conversionToBase: 1 },
      ],
      priority: 'medium',
      industries: ['Manufacturing', 'Oil & Gas', 'Food & Beverage', 'Retail/E-commerce'],
      calculationMethod: 'activity_based',
      requiredInputs: [
        { field: 'transportMode', type: 'select', required: true, options: ['Truck', 'Ship', 'Rail', 'Air', 'Pipeline'] },
        { field: 'distance', type: 'number', required: true },
        { field: 'weight', type: 'number', required: true },
        { field: 'unit', type: 'select', required: true, options: ['tkm', 'km'] },
      ],
      displayOrder: 9,
      icon: 'truck',
      color: '#f59e0b',
    },
    {
      scope: 3,
      category: 'Processing of Sold Products',
      subcategory: 'Category 10',
      description: 'Emissions that occur after a product is sold, during further processing by third parties',
      clarification: 'It applies when a company sells goods that are not final products, but will undergo further processing, assembly, or manufacturing by customers before reaching end use Usually not applicable for most sectors.',
      baseUnit: 'unit',
      allowedUnits: [
        { unit: 'unit', description: 'Product units', conversionToBase: 1 },
        { unit: 't', description: 'Tonnes', conversionToBase: 1 },
        { unit: 'EGP', description: 'Egyptian Pounds', conversionToBase: 1 },
      ],
      priority: 'low',
      industries: ['Chemical & Petrochemical', 'Oil & Gas', 'Steel & Metals'],
      calculationMethod: 'activity_based',
      requiredInputs: [
        { field: 'productType', type: 'select', required: true, options: ['Raw Material', 'Intermediate Product', 'Component'] },
        { field: 'quantity', type: 'number', required: true },
        { field: 'unit', type: 'select', required: true, options: ['unit', 't', 'EGP'] },
        { field: 'processingType', type: 'text', required: false },
      ],
      displayOrder: 10,
      icon: 'cog',
      color: '#8b5cf6',
    },  
    {
      scope: 3,
      category: 'Use of Sold Products',
      subcategory: 'Category 11',
      description: 'Emissions that occur during the use phase of products sold by the reporting company.',
      clarification: 'Applies to products that consume energy or generate emissions when used by the end customer, whether they are consumers or businesses across it\'s useful lifetime. User activity × energy × lifetime factors',
      baseUnit: 'unit',
      allowedUnits: [
        { unit: 'unit', description: 'Product units', conversionToBase: 1 },
        { unit: 'kWh', description: 'Energy consumption', conversionToBase: 1 },
        { unit: 'L', description: 'Fuel consumption', conversionToBase: 1 },
        { unit: 'hours', description: 'Usage hours', conversionToBase: 1 },
      ],
      priority: 'high',
      industries: ['Technology/Software', 'Automotive', 'Energy/Utilities', 'Appliances'],
      calculationMethod: 'activity_based',
      requiredInputs: [
        { field: 'productCategory', type: 'select', required: true, options: ['Software/Cloud', 'Appliances', 'Vehicles', 'Energy Products', 'Other'] },
        { field: 'unitsProduced', type: 'number', required: true },
        { field: 'averageLifetime', type: 'number', required: true },
        { field: 'energyPerUse', type: 'number', required: false },
        { field: 'usagePattern', type: 'select', required: false, options: ['Continuous', 'Daily', 'Weekly', 'Seasonal'] },
      ],
      displayOrder: 11,
      icon: 'activity',
      color: '#ef4444',
    },
    {
      scope: 3,
      category: 'End-of-Life Treatment',
      subcategory: 'Category 12',
      description: 'Disposal of sold products',
      clarification: 'Emissions that occur when a company\'s sold products reach the end of their useful life and are disposed of, recycled, incinerated, composted, or landfilled by the customer or waste management systems. Product composition × disposal factors',
      baseUnit: 'kg',
      allowedUnits: [
        { unit: 'kg', description: 'Kilograms', conversionToBase: 1 },
        { unit: 't', description: 'Tonnes', conversionToBase: 1000 },
        { unit: 'unit', description: 'Product units', conversionToBase: 1 },
      ],
      priority: 'medium',
      industries: ['Electronics', 'Automotive', 'Construction', 'Packaging'],
      calculationMethod: 'activity_based',
      requiredInputs: [
        { field: 'materialType', type: 'select', required: true, options: ['Electronics', 'Plastic', 'Metal', 'Paper', 'Glass', 'Mixed'] },
        { field: 'weight', type: 'number', required: true },
        { field: 'disposalMethod', type: 'select', required: true, options: ['Landfill', 'Incineration', 'Recycling', 'Composting'] },
        { field: 'unit', type: 'select', required: true, options: ['kg', 't', 'unit'] },
      ],
      displayOrder: 12,
      icon: 'trash-2',
      color: '#64748b',
    },
    {
      scope: 3,
      category: 'Downstream Leased Assets',
      subcategory: 'Category 13',
      description: 'Assets leased to others',
      clarification: 'Emissions that occur from the operation of assets owned by the reporting company but leased out to other entities. Asset utilization × energy factors',
      baseUnit: 'kWh',
      allowedUnits: [
        { unit: 'kWh', description: 'Energy consumption', conversionToBase: 1 },
        { unit: 'm²', description: 'Area leased', conversionToBase: 1 },
        { unit: 'unit', description: 'Units leased', conversionToBase: 1 },
      ],
      priority: 'medium',
      industries: ['Real Estate', 'Equipment Leasing', 'Technology/Software', 'Automotive'],
      calculationMethod: 'activity_based',
      requiredInputs: [
        { field: 'assetType', type: 'select', required: true, options: ['Real Estate', 'Vehicles', 'Equipment', 'IT Hardware'] },
        { field: 'leasedUnits', type: 'number', required: true },
        { field: 'energyConsumption', type: 'number', required: false },
        { field: 'unit', type: 'select', required: true, options: ['kWh', 'm²', 'unit'] },
      ],
      displayOrder: 13,
      icon: 'key',
      color: '#06b6d4',
    },
    {
      scope: 3,
      category: 'Franchises',
      subcategory: 'Category 14',
      description: 'Franchise operations',
      clarification: 'emissions from the operation of franchises not directly owned or controlled by the reporting company but operating under its brand, business model, or licensing agreement. Franchisee activity × allocation factors',
      baseUnit: 'franchise',
      allowedUnits: [
        { unit: 'franchise', description: 'Number of franchises', conversionToBase: 1 },
        { unit: 'revenue', description: 'Franchise revenue', conversionToBase: 1 },
        { unit: 'kWh', description: 'Energy consumption', conversionToBase: 1 },
      ],
      priority: 'medium',
      industries: ['Food & Beverage', 'Retail/E-commerce', 'Tourism/Hospitality', 'Services'],
      calculationMethod: 'activity_based',
      requiredInputs: [
        { field: 'franchiseType', type: 'select', required: true, options: ['Restaurant', 'Retail Store', 'Hotel', 'Service Center'] },
        { field: 'numberOfFranchises', type: 'number', required: true },
        { field: 'averageRevenue', type: 'number', required: false },
        { field: 'energyData', type: 'number', required: false },
      ],
      displayOrder: 14,
      icon: 'grid',
      color: '#84cc16',
    },
    {
      scope: 3,
      category: 'Investments',
      subcategory: 'Category 15',
      description: 'Financed emissions from investments',
      clarification: 'Emissions associated with the reporting company\'s investments, such as equity, debt, project finance, and managed assets. It reflects the climate impact of capital allocation decisions. HIGH for financial institutions. Future development - PCAF methodology × investment value',
      baseUnit: 'EGP',
      allowedUnits: [
        { unit: 'EGP', description: 'Egyptian Pounds', conversionToBase: 1 },
        { unit: 'USD', description: 'US Dollars', conversionToBase: 50 },
        { unit: '%', description: 'Ownership percentage', conversionToBase: 1 },
      ],
      priority: 'high',
      industries: ['Financial Services', 'Insurance', 'Private Equity', 'Sovereign Wealth'],
      calculationMethod: 'spend_based',
      requiredInputs: [
        { field: 'investmentType', type: 'select', required: true, options: ['Equity', 'Corporate Bonds', 'Project Finance', 'Real Estate', 'Infrastructure'] },
        { field: 'investmentValue', type: 'number', required: true },
        { field: 'ownershipPercentage', type: 'number', required: false },
        { field: 'sector', type: 'select', required: true, options: ['Energy', 'Manufacturing', 'Technology', 'Real Estate', 'Other'] },
        { field: 'unit', type: 'select', required: true, options: ['EGP', 'USD'] },
      ],
      displayOrder: 15,
      icon: 'trending-up',
      color: '#f97316',
    }
  ];

  for (const categoryData of scope3Categories) {
    await EmissionCategory.create(categoryData);
  }

  logger.info('Seeded Scope 3 categories');
}

async function seedEgyptianFactors(): Promise<void> {
  // Get created categories
  const electricityCategory = await EmissionCategory.findOne({ category: 'Purchased Electricity' });
  const naturalGasCategory = await EmissionCategory.findOne({ category: 'Stationary Combustion' });
  const petrolCategory = await EmissionCategory.findOne({ category: 'Mobile Combustion' });

  const egyptianFactors = [
    // Electricity - Egypt specific
    {
      categoryId: electricityCategory?._id,
      factorCode: 'ELECTRICITY_GRID_EG',
      name: 'Egyptian Grid Electricity',
      factor: 0.458,
      unit: 'kg CO2e/kWh',
      source: 'IEA Egypt/EEHC',
      region: 'egypt',
      country: 'EG',
      year: 2024,
      egyptianData: {
        isLocalFactor: true,
        localSource: 'Egyptian Electricity Holding Company (EEHC)',
        notes: '80%+ gas dependency with only 10% renewables',
      },
      isDefault: true,
    },
    // Natural Gas - Egypt specific
    {
      categoryId: naturalGasCategory?._id,
      factorCode: 'NATURAL_GAS_EG',
      name: 'Natural Gas (Egypt)',
      factor: 0.18159,
      unit: 'kg CO2e/kWh',
      source: 'DEFRA equivalent',
      region: 'egypt',
      country: 'EG',
      year: 2024,
      fuelType: 'Natural Gas',
      egyptianData: {
        isLocalFactor: true,
        localSource: 'Primary grid fuel',
        notes: 'Primary fuel for electricity generation in Egypt',
      },
      isDefault: true,
    },
    // Petrol - Egypt specific
    {
      categoryId: petrolCategory?._id,
      factorCode: 'PETROL_EG',
      name: 'Petrol (Egypt)',
      factor: 2.168,
      unit: 'kg CO2e/L',
      source: 'Local factors',
      region: 'egypt',
      country: 'EG',
      year: 2024,
      fuelType: 'Petrol',
      vehicleType: 'Car',
      egyptianData: {
        isLocalFactor: true,
        localSource: 'Egyptian fuel specifications',
        notes: 'Subsidies being reduced, growing EV adoption',
      },
      isDefault: true,
    },
    // Diesel - Egypt specific
    {
      categoryId: petrolCategory?._id,
      factorCode: 'DIESEL_EG',
      name: 'Diesel (Egypt)',
      factor: 2.667,
      unit: 'kg CO2e/L',
      source: 'Local factors',
      region: 'egypt',
      country: 'EG',
      year: 2024,
      fuelType: 'Diesel',
      vehicleType: 'Truck',
      egyptianData: {
        isLocalFactor: true,
        localSource: 'Egyptian fuel specifications',
        notes: 'Subsidies being reduced',
      },
      isDefault: true,
    },
  ];

  for (const factorData of egyptianFactors) {
    if (factorData.categoryId) {
      await EmissionFactor.create(factorData);
    }
  }

  logger.info('Seeded Egyptian emission factors');
}
