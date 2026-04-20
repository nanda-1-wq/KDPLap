// KDP Lab — Nav Component
const NavComponent = ({ screen, setScreen, scrolled }) => {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [dark, setDark] = React.useState(false);

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }, [dark]);

  return (
    <>
      <nav id="navbar" style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
        height: 70, display: 'flex', alignItems: 'center', padding: '0 2.5rem', gap: '1rem',
        background: scrolled ? 'rgba(255,255,255,0.88)' : 'transparent',
        backdropFilter: scrolled ? 'blur(24px) saturate(180%)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(124,58,237,0.12)' : '1px solid transparent',
        boxShadow: scrolled ? '0 8px 40px rgba(124,58,237,0.14)' : 'none',
        transition: 'all 0.4s',
      }}>
        <a onClick={() => setScreen('landing')} style={{display:'flex',alignItems:'center',gap:10,textDecoration:'none',cursor:'pointer',flexShrink:0,marginRight:'0.5rem'}}>
          <div style={{width:36,height:36,background:'linear-gradient(135deg,#7C3AED,#A78BFA)',borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 14px rgba(124,58,237,0.35)',position:'relative',overflow:'hidden',flexShrink:0}}>
            <div style={{position:'absolute',inset:0,background:'linear-gradient(135deg,rgba(255,255,255,0.18) 0%,transparent 55%)'}}/>
            <svg viewBox="0 0 20 20" style={{width:18,height:18,fill:'#fff',position:'relative',zIndex:1}}>
              <rect x="3" y="2" width="8" height="10" rx="1.5"/>
              <rect x="9" y="6" width="8" height="10" rx="1.5" opacity="0.7"/>
              <rect x="6" y="10" width="8" height="7" rx="1.5" opacity="0.5"/>
            </svg>
          </div>
          <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:19,fontWeight:700,letterSpacing:'-0.4px',color:'var(--text)'}}>KDP <em style={{fontStyle:'normal',color:'var(--violet)'}}>Lab</em></span>
        </a>

        <ul style={{display:'flex',alignItems:'center',gap:2,margin:'0 auto',listStyle:'none'}}>
          {['Features','How It Works','Templates','Blog'].map(item => (
            <li key={item}>
              <a href="#" style={{display:'flex',alignItems:'center',gap:5,fontSize:14,fontWeight:400,color:'var(--text-mid)',textDecoration:'none',padding:'7px 13px',borderRadius:8,fontFamily:'DM Sans,sans-serif'}}>
                {item}
                {item === 'Features' && <span style={{fontSize:9,fontWeight:600,background:'linear-gradient(135deg,#7C3AED,#A78BFA)',color:'#fff',padding:'2px 6px',borderRadius:20,letterSpacing:'0.3px',textTransform:'uppercase'}}>New</span>}
              </a>
            </li>
          ))}
        </ul>

        <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
          <a onClick={() => setScreen('dashboard')} style={{fontSize:14,fontWeight:400,color:'var(--text-mid)',textDecoration:'none',padding:'7px 14px',borderRadius:8,cursor:'pointer'}}>Log in</a>
          <button onClick={() => setDark(d=>!d)} style={{width:36,height:36,display:'flex',alignItems:'center',justifyContent:'center',background:'none',border:'1px solid var(--border)',borderRadius:9,cursor:'pointer',color:'var(--text-mid)'}}>
            <svg viewBox="0 0 20 20" fill="currentColor" style={{width:18,height:18}}>
              <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/>
            </svg>
          </button>
          <button onClick={() => setScreen('dashboard')} style={{display:'inline-flex',alignItems:'center',gap:6,fontFamily:'DM Sans,sans-serif',fontSize:14,fontWeight:500,color:'#fff',background:'linear-gradient(135deg,#7C3AED,#9D6FEC)',border:'none',cursor:'pointer',padding:'9px 20px',borderRadius:10,boxShadow:'0 4px 20px rgba(124,58,237,0.35)',position:'relative',overflow:'hidden'}}>
            <span style={{position:'absolute',inset:0,background:'linear-gradient(135deg,rgba(255,255,255,0.18) 0%,transparent 55%)'}}/>
            <span style={{position:'relative'}}>Get Started Free →</span>
          </button>
        </div>
      </nav>
    </>
  );
};

Object.assign(window, { NavComponent });
