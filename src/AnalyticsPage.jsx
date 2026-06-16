import React, { useMemo } from 'react';
import { safeExtractText, isCandidateOpenToWork } from './App.jsx';

const PIPELINE_COLORS = {
  'sourced': '#a1a1aa',
  'reached_out': '#60a5fa',
  'interviewing': '#fbbf24',
  'offer': '#c084fc',
  'hired': '#4ade80',
  'rejected': '#f87171'
};

const PIPELINE_LABELS = {
  'sourced': 'Sourced',
  'reached_out': 'Reached Out',
  'interviewing': 'Interviewing',
  'offer': 'Offer Extended',
  'hired': 'Hired',
  'rejected': 'Rejected'
};

export default function AnalyticsPage({ masterLeads }) {
  const stats = useMemo(() => {
    const total = masterLeads.length;
    let openToWorkCount = 0;
    let totalScore = 0;
    let scoredCount = 0;
    
    const stagesCount = { sourced: 0, reached_out: 0, interviewing: 0, offer: 0, hired: 0, rejected: 0 };
    const locationCounts = {};
    const skillCounts = {};
    const companyCounts = {};
    const scoreDistribution = { 'High Fit (75+)': 0, 'Medium Fit (50-74)': 0, 'Low Fit (<50)': 0 };

    masterLeads.forEach(lead => {
      // Open to work
      if (isCandidateOpenToWork(lead)) openToWorkCount++;
      
      // Score
      if (lead.agentScore !== undefined && lead.agentScore !== null) {
        totalScore += lead.agentScore;
        scoredCount++;
      }

      // Stage
      const stage = lead.status || 'sourced';
      if (stagesCount[stage] !== undefined) {
        stagesCount[stage]++;
      } else {
        stagesCount['sourced']++;
      }

      // Location
      if (lead.location) {
        let locStr = safeExtractText(lead.location);
        
        if (locStr && locStr !== 'N/A') {
          let loc = locStr.split(',')[0].trim();
          // Clean up some common stuff
          if (loc.includes('Greater') || loc.includes('Area')) loc = loc.replace('Greater', '').replace('Area', '').trim();
          locationCounts[loc] = (locationCounts[loc] || 0) + 1;
        }
      }

      // Skills
      if (lead._searchedSkills && Array.isArray(lead._searchedSkills)) {
        lead._searchedSkills.forEach(s => {
          skillCounts[s] = (skillCounts[s] || 0) + 1;
        });
      }

      // AI Match Distribution
      if (lead.agentScore !== undefined && lead.agentScore !== null) {
        if (lead.agentScore >= 75) scoreDistribution['High Fit (75+)']++;
        else if (lead.agentScore >= 50) scoreDistribution['Medium Fit (50-74)']++;
        else scoreDistribution['Low Fit (<50)']++;
      }

      // Source Companies
      if (lead.positions && Array.isArray(lead.positions) && lead.positions.length > 0) {
        const currentPos = lead.positions[0];
        let companyName = currentPos.companyName || currentPos.company || currentPos;
        if (typeof companyName === 'object' && companyName.linkedinText) companyName = companyName.linkedinText;
        if (typeof companyName === 'string') {
          companyName = companyName.split(' at ')[1] || companyName;
          companyName = companyName.split(/[\-\|,]/)[0].trim();
          if (companyName && companyName.length > 2 && !companyName.toLowerCase().includes('engineer')) {
            companyCounts[companyName] = (companyCounts[companyName] || 0) + 1;
          }
        }
      }
    });

    const avgScore = scoredCount > 0 ? Math.round(totalScore / scoredCount) : 0;

    const topLocations = Object.entries(locationCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const topSkills = Object.entries(skillCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const topCompanies = Object.entries(companyCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return { total, openToWorkCount, avgScore, scoredCount, stagesCount, topLocations, topSkills, topCompanies, scoreDistribution };
  }, [masterLeads]);

  const StatCard = ({ title, value, subtitle, icon }) => (
    <div style={{
      backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
      borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '8px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</span>
        <span style={{ color: 'var(--accent)', opacity: 0.8 }}>{icon}</span>
      </div>
      <div style={{ fontSize: '36px', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
      {subtitle && <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{subtitle}</div>}
    </div>
  );

  return (
    <div style={{ padding: '40px', maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: '600', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Database Insights</h1>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>Macro-level analytics on your talent pool and recruiting pipeline.</p>
      </div>

      {/* Top Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
        <StatCard 
          title="Total Sourced" 
          value={stats.total} 
          subtitle="Unique profiles in database"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>}
        />
        <StatCard 
          title="Open to Work" 
          value={stats.openToWorkCount} 
          subtitle={`${stats.total > 0 ? Math.round((stats.openToWorkCount / stats.total) * 100) : 0}% of your talent pool`}
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>}
        />
        <StatCard 
          title="Avg AI Score" 
          value={stats.avgScore} 
          subtitle={`Across ${stats.scoredCount} evaluated profiles`}
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        {/* Pipeline Funnel */}
        <div style={{ backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '24px' }}>
          <h2 style={{ margin: '0 0 20px 0', fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>Pipeline Conversion Funnel</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {Object.keys(PIPELINE_LABELS).map(stage => {
              const count = stats.stagesCount[stage] || 0;
              const percentage = stats.total > 0 ? Math.max((count / stats.total) * 100, 2) : 0; // min 2% for visibility
              return (
                <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: '120px', fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>
                    {PIPELINE_LABELS[stage]}
                  </div>
                  <div style={{ flex: 1, backgroundColor: 'var(--bg-surface)', borderRadius: '8px', height: '24px', overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
                    <div style={{ 
                      width: `${percentage}%`, height: '100%', 
                      backgroundColor: PIPELINE_COLORS[stage], 
                      transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)',
                      opacity: 0.8
                    }} />
                  </div>
                  <div style={{ width: '40px', textAlign: 'right', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                    {count}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Demographics / Skills */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '24px' }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>Top Locations</h2>
            {stats.topLocations.length === 0 ? <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No location data yet.</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {stats.topLocations.map(([loc, count]) => (
                  <div key={loc} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--accent)' }}/>
                      {loc}
                    </span>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-surface)', padding: '2px 8px', borderRadius: '12px' }}>{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '24px', flex: 1 }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>Top Target Skills</h2>
            {stats.topSkills.length === 0 ? <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No skill data yet.</div> : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {stats.topSkills.map(([skill, count]) => (
                  <div key={skill} style={{ 
                    padding: '4px 10px', backgroundColor: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)',
                    borderRadius: '16px', fontSize: '12px', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' 
                  }}>
                    {skill} <span style={{ opacity: 0.7 }}>{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* AI Score Distribution */}
        <div style={{ backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '24px' }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>AI Fit Prediction</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {Object.entries(stats.scoreDistribution).map(([label, count]) => {
              const max = Math.max(...Object.values(stats.scoreDistribution), 1);
              const percentage = Math.max((count / max) * 100, 2);
              const color = label.includes('High') ? '#4ade80' : label.includes('Medium') ? '#fbbf24' : '#f87171';
              return (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: '120px', fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)' }}>{label}</div>
                  <div style={{ flex: 1, backgroundColor: 'var(--bg-surface)', borderRadius: '4px', height: '12px', overflow: 'hidden' }}>
                    <div style={{ width: `${percentage}%`, height: '100%', backgroundColor: color, opacity: 0.8 }} />
                  </div>
                  <div style={{ width: '30px', textAlign: 'right', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>{count}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Source Companies */}
        <div style={{ backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '24px' }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>Top Source Companies</h2>
          {stats.topCompanies.length === 0 ? <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No company data yet.</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {stats.topCompanies.map(([company, count]) => (
                <div key={company} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><path d="M3 21V9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12"></path><path d="M9 21v-5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v5"></path></svg>
                    {company}
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-surface)', padding: '2px 8px', borderRadius: '12px' }}>{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
