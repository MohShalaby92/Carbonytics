import { IndustryBenchmark } from '../models/IndustryBenchmark';
import { Organization } from '../models/Organization';
import { Calculation } from '../models/Calculation';
import { EmissionCategory } from '../models/EmissionCategory';

export class BenchmarkService {
  
  /**
   * Get industry benchmarks for a specific organization
   */
  async getIndustryBenchmarks(organizationId: string) {
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      throw new Error('Organization not found');
    }

    // Find the most relevant benchmarks
    const benchmarks = await this.findRelevantBenchmarks(
      organization.industry,
      organization.size,
      'egypt' // Prefer Egyptian data, fallback to global
    );

    if (!benchmarks) {
      // Fallback to global benchmarks
      const globalBenchmarks = await this.findRelevantBenchmarks(
        organization.industry,
        organization.size,
        'global'
      );
      
      if (!globalBenchmarks) {
        throw new Error('No benchmarks available for this industry');
      }
      
      return this.formatBenchmarkResponse(globalBenchmarks, organization);
    }

    return this.formatBenchmarkResponse(benchmarks, organization);
  }

  /**
   * Find relevant benchmarks based on industry, size, and region
   */
  private async findRelevantBenchmarks(
    industry: string,
    organizationSize: string,
    region: string
  ): Promise<any | null> {
    // Try exact match first
    let benchmark = await IndustryBenchmark.findOne({
      industry,
      organizationSize,
      region,
      isActive: true,
    })
    .populate('topCategories.categoryId')
    .sort({ year: -1 })
    .lean();

    if (benchmark) return benchmark;

    // Try with different organization size
    benchmark = await IndustryBenchmark.findOne({
      industry,
      region,
      isActive: true,
    })
    .populate('topCategories.categoryId')
    .sort({ year: -1 })
    .lean();

    if (benchmark) return benchmark;

    // Try global region as fallback
    if (region !== 'global') {
      return await this.findRelevantBenchmarks(industry, organizationSize, 'global');
    }

    return null;
  }

  /**
   * Format benchmark response with organization context
   */
  private formatBenchmarkResponse(benchmark: any, organization: any) {
    return {
      industry: organization.industry,
      organizationSize: organization.size,
      region: benchmark.region,
      year: benchmark.year,
      benchmarks: benchmark.emissions,
      intensity: benchmark.intensity,
      topCategories: benchmark.topCategories,
      reductionOpportunities: benchmark.reductionOpportunities,
      bestPractices: benchmark.bestPractices,
      metadata: benchmark.metadata,
      comparison: {
        dataSource: benchmark.metadata.source,
        sampleSize: benchmark.metadata.sampleSize,
        dataQuality: benchmark.metadata.dataQuality,
        applicability: this.calculateApplicability(benchmark, organization),
      },
    };
  }

  /**
   * Calculate how applicable the benchmarks are to this organization
   */
  private calculateApplicability(benchmark: any, organization: any): number {
    let score = 100;

    // Reduce score if different region
    if (benchmark.region !== 'egypt') {
      score -= 20;
    }

    // Reduce score if different organization size
    if (benchmark.organizationSize !== organization.size) {
      score -= 15;
    }

    // Reduce score based on data age
    const dataAge = new Date().getFullYear() - benchmark.year;
    if (dataAge > 1) {
      score -= Math.min(dataAge * 10, 30);
    }

    return Math.max(score, 40); // Minimum 40% applicability
  }

  /**
   * Compare organization's performance against benchmarks
   */
  async compareOrganizationToBenchmarks(organizationId: string) {
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      throw new Error('Organization not found');
    }

    // Get organization's latest emissions
    const latestCalculation = await Calculation.findOne({
      organizationId,
      status: 'completed',
    })
    .sort({ createdAt: -1 })
    .lean();

    if (!latestCalculation) {
      throw new Error('No completed calculations found for comparison');
    }

    // Get benchmarks
    const benchmarks = await this.getIndustryBenchmarks(organizationId);

    // Calculate percentile rankings
    const comparison = {
      scope1: this.calculatePercentile(
        latestCalculation.emissions.scope1,
        benchmarks.benchmarks.scope1
      ),
      scope2: this.calculatePercentile(
        latestCalculation.emissions.scope2,
        benchmarks.benchmarks.scope2
      ),
      scope3: this.calculatePercentile(
        latestCalculation.emissions.scope3,
        benchmarks.benchmarks.scope3
      ),
      total: this.calculatePercentile(
        latestCalculation.emissions.total,
        benchmarks.benchmarks.total
      ),
    };

    return {
      organizationEmissions: latestCalculation.emissions,
      benchmarks: benchmarks.benchmarks,
      comparison,
      performance: this.assessPerformance(comparison),
      recommendations: this.generateRecommendations(comparison, benchmarks),
    };
  }

  /**
   * Calculate which percentile the organization falls into
   */
  private calculatePercentile(value: number, benchmark: any): {
    percentile: number;
    category: 'excellent' | 'good' | 'average' | 'below_average' | 'poor';
    difference: {
      fromAverage: number;
      fromMedian: number;
      fromPercentile75: number;
    };
  } {
    let percentile: number;
    let category: 'excellent' | 'good' | 'average' | 'below_average' | 'poor';

    if (value <= benchmark.percentile25) {
      percentile = 25;
      category = 'excellent';
    } else if (value <= benchmark.median) {
      percentile = 50;
      category = 'good';
    } else if (value <= benchmark.percentile75) {
      percentile = 75;
      category = 'average';
    } else if (value <= benchmark.average) {
      percentile = 85;
      category = 'below_average';
    } else {
      percentile = 95;
      category = 'poor';
    }

    return {
      percentile,
      category,
      difference: {
        fromAverage: ((value - benchmark.average) / benchmark.average) * 100,
        fromMedian: ((value - benchmark.median) / benchmark.median) * 100,
        fromPercentile75: ((value - benchmark.percentile75) / benchmark.percentile75) * 100,
      },
    };
  }

  /**
   * Assess overall performance
   */
  private assessPerformance(comparison: any): {
    overall: 'excellent' | 'good' | 'average' | 'below_average' | 'poor';
    strengths: string[];
    weaknesses: string[];
  } {
    const scores = [
      comparison.scope1.percentile,
      comparison.scope2.percentile,
      comparison.scope3.percentile,
      comparison.total.percentile,
    ];

    const averagePercentile = scores.reduce((sum, score) => sum + score, 0) / scores.length;

    let overall: 'excellent' | 'good' | 'average' | 'below_average' | 'poor';
    if (averagePercentile <= 30) overall = 'excellent';
    else if (averagePercentile <= 55) overall = 'good';
    else if (averagePercentile <= 75) overall = 'average';
    else if (averagePercentile <= 90) overall = 'below_average';
    else overall = 'poor';

    const strengths: string[] = [];
    const weaknesses: string[] = [];

    if (comparison.scope1.category === 'excellent' || comparison.scope1.category === 'good') {
      strengths.push('Scope 1 emissions (direct operations)');
    } else if (comparison.scope1.category === 'below_average' || comparison.scope1.category === 'poor') {
      weaknesses.push('Scope 1 emissions (direct operations)');
    }

    if (comparison.scope2.category === 'excellent' || comparison.scope2.category === 'good') {
      strengths.push('Scope 2 emissions (energy consumption)');
    } else if (comparison.scope2.category === 'below_average' || comparison.scope2.category === 'poor') {
      weaknesses.push('Scope 2 emissions (energy consumption)');
    }

    if (comparison.scope3.category === 'excellent' || comparison.scope3.category === 'good') {
      strengths.push('Scope 3 emissions (value chain)');
    } else if (comparison.scope3.category === 'below_average' || comparison.scope3.category === 'poor') {
      weaknesses.push('Scope 3 emissions (value chain)');
    }

    return { overall, strengths, weaknesses };
  }

  /**
   * Generate recommendations based on performance
   */
  private generateRecommendations(comparison: any, benchmarks: any): Array<{
    priority: 'high' | 'medium' | 'low';
    category: string;
    action: string;
    expectedImpact: string;
  }> {
    const recommendations: Array<{
      priority: 'high' | 'medium' | 'low';
      category: string;
      action: string;
      expectedImpact: string;
    }> = [];

    // High priority recommendations for poor performance
    if (comparison.scope2.category === 'poor' || comparison.scope2.category === 'below_average') {
      recommendations.push({
        priority: 'high',
        category: 'Energy Efficiency',
        action: 'Implement energy efficiency measures and consider renewable energy sources',
        expectedImpact: `Potential to reduce Scope 2 emissions by 15-30%`,
      });
    }

    if (comparison.scope1.category === 'poor' || comparison.scope1.category === 'below_average') {
      recommendations.push({
        priority: 'high',
        category: 'Operational Efficiency',
        action: 'Optimize fuel consumption and improve equipment efficiency',
        expectedImpact: `Potential to reduce Scope 1 emissions by 10-25%`,
      });
    }

    // Add industry-specific recommendations
    if (benchmarks.reductionOpportunities) {
      benchmarks.reductionOpportunities
        .filter((opp: any) => opp.applicability > 70)
        .slice(0, 3)
        .forEach((opp: any) => {
          recommendations.push({
            priority: opp.implementationCost === 'low' ? 'high' : 'medium',
            category: opp.category,
            action: opp.description,
            expectedImpact: `${opp.potentialReductionMin}-${opp.potentialReductionMax}% reduction potential`,
          });
        });
    }

    return recommendations.slice(0, 5); // Limit to top 5 recommendations
  }
}

export default BenchmarkService;
