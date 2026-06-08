import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import CandidatesPage from './CandidatesPage.jsx';

const API_TOKEN = import.meta.env.VITE_APIFY_API_TOKEN || 'YOUR_API_TOKEN_HERE';
const ACTOR_NAME = 'harvestapi~linkedin-profile-search';

const ASIC_SKILLS = [
  "UVM", "SystemVerilog", "Verilog", "VHDL", "Formal",
  "DFT", "Scan", "BIST", "MBIST", "JTAG", "IEEE 1500", "IEEE 1687",
  "ZeBu", "Palladium", "Veloce", "UPF", "CPF",
  "Floorplanning", "CTS", "Routing", "ECO", "STA", "DRC/LVS", "IR/EM",
  "Power Signoff", "OPC", "Thermal Analysis", "Aging/BTI", "Noise Analysis",
  "2.5D Integration", "Multi-Vt Optimization",
  "PCIe", "PCIe Gen3", "PCIe Gen4", "PCIe Gen5", "PCIe Gen6",
  "CXL", "CXL 1.1", "CXL 2.0", "CXL 3.0",
  "USB", "USB 2.0", "USB 3.0", "USB4",
  "Ethernet", "Ethernet 1G", "Ethernet 10G", "Ethernet 400G",
  "SerDes", "SerDes 28G", "SerDes 112G",
  "SATA", "SATA 3.0", "MIPI", "MIPI CSI-2", "MIPI D-PHY",
  "UFS", "UFS 3.1", "HDMI", "HDMI 2.1", "DisplayPort",
  "SDIO", "SPI", "I2C", "NVMe", "UART", "SAS", "Fibre Channel",
  "Wi-Fi", "Bluetooth LE",
  "DDR", "DDR2", "DDR3", "DDR4", "DDR5", "LPDDR", "LPDDR3", "LPDDR4", "LPDDR5",
  "GDDR", "GDDR5", "GDDR6", "GDDR6X", "HBM", "HBM2", "HBM2E", "HBM3",
  "NAND", "NOR", "eMMC", "NVDIMM", "CXL.mem", "MRAM", "ReRAM", "FRAM",
  "Optane", "3D XPoint", "WideIO", "SDRAM",
  "VCS", "PrimeTime", "Innovus", "Xcelium", "Calibre", "TCL", "Python",
  "Design Compiler", "SystemC", "ICC2", "HSPICE", "Genus", "Virtuoso",
  "Spectre", "Tessent", "QuestaSim", "RedHawk", "ADS", "Chisel", "TensorFlow",
  "CAN", "CAN-FD", "FlexRay", "LIN", "AUTOSAR", "AUTOSAR Classic", "AUTOSAR Adaptive",
  "ISO26262", "ASIL", "ASIL A", "ASIL B", "ASIL C", "ASIL D", "Automotive Ethernet",
  "UDS", "HSM", "SHE", "TPM", "OBD-II", "CHAdeMO", "C", "C++"
];

function safeExtractText(field) {
  if (field === null || field === undefined) return 'N/A';
  if (typeof field === 'string') return field;
  if (Array.isArray(field)) {
    return field.map(item => {
      if (typeof item === 'object') return Object.values(item).filter(v => typeof v === 'string').join(' ');
      return String(item);
    }).join(' | ');
  }
  if (typeof field === 'object') {
    return Object.values(field).filter(val => typeof val === 'string' || typeof val === 'number').join(' ');
  }
  return String(field);
}

function extractSkillsList(profile) {
  if (!profile.skills) return 'N/A';
  if (Array.isArray(profile.skills)) {
    return profile.skills.map(s => typeof s === 'string' ? s : (s.name || s.title || '')).filter(Boolean).join(', ');
  }
  return safeExtractText(profile.skills).replace(/[\r\n,"]/g, ' ');
}

function cleanUrl(url) {
  if (!url) return '';
  return url.split('?')[0].toLowerCase().trim();
}

function calculateCandidateScore(profile, selectedSkills, targetLocation, targetDesignations) {
  let score = 0;
  const headline = safeExtractText(profile.headline).toLowerCase();
  const currentTitle = safeExtractText(profile.currentTitle || profile.jobTitle).toLowerCase();
  const location = safeExtractText(profile.location).toLowerCase();
  const skillsList = extractSkillsList(profile).toLowerCase();
  const about = safeExtractText(profile.about || profile.summary).toLowerCase();

  if (selectedSkills.length > 0) {
    const pointsPerSkill = 50 / selectedSkills.length;
    selectedSkills.forEach(skill => {
      const sk = skill.toLowerCase();
      if (headline.includes(sk) || currentTitle.includes(sk) || skillsList.includes(sk) || about.includes(sk)) score += pointsPerSkill;
    });
  }

  if (targetLocation && location.includes(targetLocation.toLowerCase())) score += 25;

  const designationList = Array.isArray(targetDesignations) ? targetDesignations : [targetDesignations];
  if (designationList.some(d => d && currentTitle.includes(d.toLowerCase()))) score += 25;

  if (headline.includes('open to work') || headline.includes('#opentowork') || headline.includes('looking for')) score += 15;

  return Math.min(Math.round(score), 100);
}

function Nav({ candidateCount }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isSearch = location.pathname === '/';
  const isCandidates = location.pathname === '/candidates';

  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 100,
      backgroundColor: 'rgba(255,255,255,0.95)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid #e4e4e7',
      padding: '0 32px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      height: '56px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '28px', height: '28px', backgroundColor: '#18181b',
          borderRadius: '5px', display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: 'white', fontWeight: '800', fontSize: '13px',
        }}>SP</div>
        <span style={{ fontWeight: '700', fontSize: '15px', color: '#18181b', letterSpacing: '-0.02em' }}>
          Silicon Patterns
        </span>
      </div>

      <div style={{ display: 'flex', gap: '4px' }}>
        {[
          { label: 'Search', path: '/', active: isSearch },
          { label: candidateCount > 0 ? `Candidates (${candidateCount})` : 'Candidates', path: '/candidates', active: isCandidates },
        ].map(({ label, path, active }) => (
          <button key={path} onClick={() => navigate(path)} style={{
            padding: '6px 14px', borderRadius: '6px', fontSize: '13px',
            fontWeight: active ? '600' : '500', border: 'none', cursor: 'pointer',
            backgroundColor: active ? '#18181b' : 'transparent',
            color: active ? '#ffffff' : '#52525b',
            transition: 'all 0.15s ease',
          }}>
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}

function SearchPage({ masterLeads, setMasterLeads }) {
  const navigate = useNavigate();
  const [selectedSkills, setSelectedSkills] = useState(['UVM', 'SystemVerilog']);
  const [companies, setCompanies] = useState('');
  const [location, setLocation] = useState('Bengaluru');
  const [designation, setDesignation] = useState('Verification Engineer');
  const [experience, setExperience] = useState('3');
  const [openToWork, setOpenToWork] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [apifyRunUrl, setApifyRunUrl] = useState(null);
  const [latestRunResults, setLatestRunResults] = useState([]);
  const [skillFilter, setSkillFilter] = useState('');
  const [customSkill, setCustomSkill] = useState('');

  const filteredSkills = ASIC_SKILLS.filter(s => s.toLowerCase().includes(skillFilter.toLowerCase()));

  const handleAddCustomSkill = () => {
    if (customSkill.trim() && !selectedSkills.includes(customSkill.trim())) {
      setSelectedSkills(prev => [...prev, customSkill.trim()]);
      setCustomSkill('');
    }
  };

  const toggleSkill = (skill) => {
    setSelectedSkills(prev => prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]);
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (selectedSkills.length === 0) { alert("Please select at least one core skill."); return; }
    setLoading(true);
    setLatestRunResults([]);
    setApifyRunUrl(null);
    setStatus('Initiating search protocol...');

    try {
      let finalQuery = `(${selectedSkills.join(' OR ')})`;
      if (companies.trim() !== '') {
        const compArr = companies.split(',').map(c => `"${c.trim()}"`).join(' OR ');
        finalQuery += ` AND (${compArr})`;
      }
      if (openToWork) finalQuery += ' AND ("Open to work" OR "#opentowork" OR "looking for")';

      const designationTitles = designation.split(',').map(d => d.trim()).filter(Boolean);

      const searchInput = {
        searchQuery: finalQuery,
        locations: [location],
        currentJobTitles: designationTitles,
        ...(experience !== 'any' && { yearsOfExperienceIds: [experience] }),
        profileScraperMode: "Full",
        maxItems: 50
      };

      setStatus('Contacting Apify servers and launching actor...');
      const runResponse = await fetch(`https://api.apify.com/v2/acts/${ACTOR_NAME}/runs?token=${API_TOKEN}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchInput)
      });

      if (!runResponse.ok) throw new Error('Failed to run search process.');
      const runJson = await runResponse.json();
      const runId = runJson.data.id;
      const datasetId = runJson.data.defaultDatasetId;

      setApifyRunUrl(`https://console.apify.com/actors/runs/${runId}`);
      setStatus('Actor launched! Scraping deep profile data... (Please wait)');

      let runStatus = 'RUNNING';
      while (runStatus === 'RUNNING' || runStatus === 'READY') {
        await new Promise(resolve => setTimeout(resolve, 4000));
        const statusResponse = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${API_TOKEN}`);
        const statusJson = await statusResponse.json();
        runStatus = statusJson.data.status;
        if (runStatus === 'SUCCEEDED') break;
        if (['FAILED', 'TIMED-OUT', 'ABORTED'].includes(runStatus)) throw new Error(`Execution terminated: ${runStatus}`);
      }

      setStatus('Extracting dataset and running deduplication algorithm...');
      const datasetResponse = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${API_TOKEN}`);
      if (!datasetResponse.ok) throw new Error('Failed to pull final data array.');
      let profiles = await datasetResponse.json();

      if (openToWork) {
        profiles = profiles.filter(p => {
          const headline = safeExtractText(p.headline).toLowerCase();
          const title = safeExtractText(p.currentTitle || p.jobTitle).toLowerCase();
          const about = safeExtractText(p.about || p.summary).toLowerCase();
          return headline.includes('open to work') || headline.includes('#opentowork') || title.includes('open to work') || headline.includes('looking for') || about.includes('open to work') || about.includes('#opentowork');
        });
      }

      if (!profiles || profiles.length === 0) {
        setStatus('No matching records found with these exact parameters.');
        setLoading(false);
        return;
      }

      const existingUrls = new Set(masterLeads.map(lead => cleanUrl(lead.linkedinUrl || lead.url)));
      const newUniqueProfiles = [];

      profiles.forEach(profile => {
        const profileUrl = cleanUrl(profile.linkedinUrl || profile.url);
        if (!existingUrls.has(profileUrl)) {
          profile.matchScore = calculateCandidateScore(profile, selectedSkills, location, designationTitles);
          profile._searchedDesignation = designationTitles.join(', ');
          profile._searchedLocation = location;
          profile._searchedSkills = [...selectedSkills];
          newUniqueProfiles.push(profile);
          existingUrls.add(profileUrl);
        }
      });

      if (newUniqueProfiles.length === 0) {
        setStatus('Search complete — all candidates already in your Master Database.');
        setLoading(false);
        return;
      }

      newUniqueProfiles.sort((a, b) => b.matchScore - a.matchScore);
      setLatestRunResults(newUniqueProfiles);

      const updatedMaster = [...masterLeads, ...newUniqueProfiles];
      updatedMaster.sort((a, b) => b.matchScore - a.matchScore);
      setMasterLeads(updatedMaster);

      setStatus(`Found ${profiles.length} profiles. Added ${newUniqueProfiles.length} NEW candidates to Master Database.`);
    } catch (error) {
      console.error(error);
      setStatus(`System Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '10px 12px', boxSizing: 'border-box',
    borderRadius: '6px', border: '1px solid #d4d4d8',
    fontSize: '14px', color: '#18181b', outline: 'none', fontFamily: 'inherit',
    backgroundColor: '#ffffff',
  };
  const labelStyle = {
    display: 'block', fontSize: '11px', fontWeight: '600',
    color: '#52525b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em',
  };

  return (
    <div style={{ padding: '32px 20px', maxWidth: '760px', margin: '0 auto' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e4e4e7', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '36px' }}>
        <div style={{ marginBottom: '32px', paddingBottom: '24px', borderBottom: '1px solid #e4e4e7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: '0 0 4px 0', fontSize: '20px', fontWeight: '700', color: '#18181b', letterSpacing: '-0.02em' }}>Targeted Search</h2>
            <p style={{ margin: 0, fontSize: '13px', color: '#71717a' }}>Configure parameters and launch a LinkedIn scrape</p>
          </div>
          {masterLeads.length > 0 && (
            <button onClick={() => navigate('/candidates')} style={{ padding: '8px 16px', backgroundColor: '#f4f4f5', color: '#18181b', border: '1px solid #e4e4e7', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
              View {masterLeads.length} Candidates →
            </button>
          )}
        </div>

        <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          <div>
            <label style={labelStyle}>Core Competency Matrix</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <input
                type="text"
                placeholder="Search master skills..."
                value={skillFilter}
                onChange={e => setSkillFilter(e.target.value)}
                style={inputStyle}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Add custom skill..."
                  value={customSkill}
                  onChange={e => setCustomSkill(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' ? (e.preventDefault(), handleAddCustomSkill()) : null}
                  style={inputStyle}
                />
                <button type="button" onClick={handleAddCustomSkill} style={{
                  padding: '0 16px', backgroundColor: '#18181b', color: '#fff', border: 'none',
                  borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer'
                }}>Add</button>
              </div>
            </div>

            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '200px', overflowY: 'auto',
              padding: '12px', backgroundColor: '#fafafa', border: '1px solid #e4e4e7', borderRadius: '6px'
            }}>
              {selectedSkills.map(skill => (
                <button key={skill} type="button" onClick={() => toggleSkill(skill)} style={{
                  padding: '7px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: '500',
                  cursor: 'pointer', transition: 'all 0.15s ease',
                  border: '1px solid #18181b', backgroundColor: '#18181b', color: '#ffffff',
                }}>{skill} ✕</button>
              ))}

              {filteredSkills.filter(s => !selectedSkills.includes(s)).map(skill => (
                <button key={skill} type="button" onClick={() => toggleSkill(skill)} style={{
                  padding: '7px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: '500',
                  cursor: 'pointer', transition: 'all 0.15s ease',
                  border: '1px solid #e4e4e7', backgroundColor: '#ffffff', color: '#3f3f46',
                }}>{skill}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div>
              <label style={labelStyle}>Designation(s) <span style={{ textTransform: 'none', fontWeight: '400', color: '#a1a1aa' }}>(comma-separated)</span></label>
              <input type="text" value={designation} onChange={e => setDesignation(e.target.value)} placeholder="e.g. Verification Engineer, ASIC Engineer" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Experience Bracket</label>
              <select value={experience} onChange={e => setExperience(e.target.value)} style={{ ...inputStyle, backgroundColor: '#fff' }}>
                <option value="any">Any Experience</option>
                <option value="2">Junior (1-2 years)</option>
                <option value="3">Mid-Level (3-5 years)</option>
                <option value="4">Senior (5-7 years)</option>
                <option value="5">Lead/Staff (7-10+ years)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div>
              <label style={labelStyle}>Target Location</label>
              <input type="text" value={location} onChange={e => setLocation(e.target.value)} style={inputStyle} required />
            </div>
            <div>
              <label style={labelStyle}>Target Companies (Optional)</label>
              <input type="text" value={companies} onChange={e => setCompanies(e.target.value)} placeholder="e.g. Intel, Qualcomm, AMD" style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', backgroundColor: '#fafafa', borderRadius: '6px', border: '1px solid #e4e4e7' }}>
            <input type="checkbox" id="openToWork" checked={openToWork} onChange={e => setOpenToWork(e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#18181b', cursor: 'pointer' }} />
            <label htmlFor="openToWork" style={{ fontSize: '13px', fontWeight: '500', color: '#3f3f46', cursor: 'pointer', userSelect: 'none' }}>Enforce "Open to Work" profile requirements</label>
          </div>

          <button type="submit" disabled={loading} style={{
            padding: '13px', backgroundColor: loading ? '#a1a1aa' : '#18181b',
            color: 'white', border: 'none', borderRadius: '6px',
            fontSize: '14px', fontWeight: '600',
            cursor: loading ? 'not-allowed' : 'pointer', transition: 'background-color 0.2s',
          }}>
            {loading ? 'Executing Data Scrape...' : 'Run Targeted Search'}
          </button>
        </form>

        {status && (
          <div style={{ marginTop: '20px', padding: '14px 16px', backgroundColor: '#f4f4f5', borderRadius: '6px', fontSize: '13px', color: '#3f3f46', fontWeight: '500' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ display: 'inline-block', width: '8px', height: '8px', flexShrink: 0, backgroundColor: loading ? '#eab308' : '#10b981', borderRadius: '50%' }} />
              <span>{status}</span>
            </div>
            {apifyRunUrl && (
              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #e4e4e7', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: '#71717a' }}>🔴 Live Run:</span>
                <a href={apifyRunUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: '#2563eb', fontWeight: '600', textDecoration: 'underline' }}>
                  Watch on Apify Console →
                </a>
              </div>
            )}
          </div>
        )}

        {latestRunResults.length > 0 && (
          <div style={{ marginTop: '32px', paddingTop: '28px', borderTop: '1px solid #e4e4e7' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#18181b' }}>{latestRunResults.length} New Candidates Added</h3>
              <button onClick={() => navigate('/candidates')} style={{ padding: '6px 14px', backgroundColor: '#18181b', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                View All in Database →
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {latestRunResults.slice(0, 5).map((p, idx) => (
                <div key={idx} style={{ padding: '12px 16px', backgroundColor: '#fafafa', border: '1px solid #e4e4e7', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '14px', fontWeight: '600', color: '#18181b' }}>{safeExtractText(p.firstName)} {safeExtractText(p.lastName)}</span>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#71717a' }}>{safeExtractText(p.currentTitle || p.jobTitle || p.headline).substring(0, 60)}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      backgroundColor: p.matchScore >= 70 ? '#dcfce7' : p.matchScore >= 40 ? '#fef9c3' : '#f4f4f5',
                      color: p.matchScore >= 70 ? '#16a34a' : p.matchScore >= 40 ? '#ca8a04' : '#52525b',
                      padding: '3px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '700',
                    }}>{p.matchScore}</span>
                    <a href={safeExtractText(p.linkedinUrl || p.url)} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontSize: '14px', fontWeight: '600', textDecoration: 'none' }}>↗</a>
                  </div>
                </div>
              ))}
              {latestRunResults.length > 5 && (
                <p style={{ textAlign: 'center', fontSize: '12px', color: '#a1a1aa', margin: '4px 0 0' }}>+{latestRunResults.length - 5} more in the Candidates page</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [masterLeads, setMasterLeads] = useState([]);

  useEffect(() => {
    const savedData = localStorage.getItem('siliconPatternsMasterDatabase');
    if (savedData) {
      try { setMasterLeads(JSON.parse(savedData)); }
      catch (e) { console.error("Failed to load local database"); }
    }
  }, []);

  useEffect(() => {
    if (masterLeads.length > 0) {
      localStorage.setItem('siliconPatternsMasterDatabase', JSON.stringify(masterLeads));
    }
  }, [masterLeads]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f4f4f5', fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#18181b' }}>
      <Nav candidateCount={masterLeads.length} />
      <Routes>
        <Route path="/" element={<SearchPage masterLeads={masterLeads} setMasterLeads={setMasterLeads} />} />
        <Route path="/candidates" element={<CandidatesPage masterLeads={masterLeads} setMasterLeads={setMasterLeads} />} />
      </Routes>
    </div>
  );
}
