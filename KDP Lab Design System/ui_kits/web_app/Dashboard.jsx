// KDP Lab — App Dashboard Component
const BOOKS = [
  { title:'Halloween Word Search', type:'Puzzle Book', pages:60, status:'Published', updated:'Apr 18', color:'#7C3AED' },
  { title:'Gratitude Journal 2026', type:'Journal', pages:120, status:'Draft', updated:'Apr 16', color:'#1D9E75' },
  { title:'Kids Activity Summer', type:'Activity Book', pages:48, status:'Published', updated:'Apr 12', color:'#F59E0B' },
  { title:'Sudoku for Beginners', type:'Puzzle Book', pages:80, status:'Exporting', updated:'Apr 10', color:'#9D6FEC' },
];

const statusStyle = {
  Published: { bg:'rgba(29,158,117,0.1)', color:'#1D9E75' },
  Draft: { bg:'rgba(124,58,237,0.1)', color:'#7C3AED' },
  Exporting: { bg:'rgba(245,158,11,0.1)', color:'#D97706' },
};

const DashboardComponent = ({ setScreen }) => (
  <div style={{display:'flex',height:'100vh',background:'#F8F7FF',fontFamily:'DM Sans,sans-serif',paddingTop:70}}>
    {/* Sidebar */}
    <aside style={{width:220,background:'#fff',borderRight:'1px solid rgba(124,58,237,0.12)',padding:'24px 0',flexShrink:0,display:'flex',flexDirection:'column',gap:4}}>
      {[
        { label:'Dashboard', active:true, icon:<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{width:16,height:16}}><rect x="2" y="2" width="7" height="7" rx="1.5"/><rect x="11" y="2" width="7" height="7" rx="1.5"/><rect x="2" y="11" width="7" height="7" rx="1.5"/><rect x="11" y="11" width="7" height="7" rx="1.5"/></svg> },
        { label:'My Books', icon:<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{width:16,height:16}}><rect x="4" y="2" width="12" height="16" rx="2"/><line x1="7" y1="7" x2="13" y2="7"/><line x1="7" y1="10" x2="13" y2="10"/></svg> },
        { label:'Generators', icon:<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{width:16,height:16}}><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="11" y="3" width="6" height="6" rx="1"/><rect x="3" y="11" width="6" height="6" rx="1"/><rect x="11" y="11" width="6" height="6" rx="1"/></svg> },
        { label:'Templates', icon:<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{width:16,height:16}}><rect x="2" y="2" width="16" height="16" rx="2"/><path d="M2 8h16M8 8v10"/></svg> },
        { label:'Cover Designer', icon:<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{width:16,height:16}}><rect x="2" y="4" width="16" height="12" rx="2"/><path d="M2 8h16"/><circle cx="7" cy="12" r="1.5"/></svg> },
        { label:'Keyword Tool', icon:<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{width:16,height:16}}><circle cx="9" cy="9" r="5"/><line x1="13" y1="13" x2="17" y2="17"/></svg> },
      ].map(item => (
        <button key={item.label} onClick={() => item.label==='Generators' && setScreen('generator')} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 20px',fontSize:13,fontWeight:item.active?500:400,color:item.active?'#7C3AED':'#5B4B8A',background:item.active?'#EDE9FE':'transparent',border:'none',cursor:'pointer',borderRadius:0,textAlign:'left',width:'100%'}}>
          <span style={{color:item.active?'#7C3AED':'#9585C0'}}>{item.icon}</span>
          {item.label}
        </button>
      ))}
      <div style={{marginTop:'auto',padding:'16px 20px',borderTop:'1px solid rgba(124,58,237,0.1)'}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:32,height:32,borderRadius:'50%',background:'linear-gradient(135deg,#7C3AED,#A78BFA)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <span style={{fontSize:13,fontWeight:700,color:'#fff'}}>N</span>
          </div>
          <div>
            <div style={{fontSize:12,fontWeight:500,color:'#1A0A3C'}}>Nanda</div>
            <div style={{fontSize:10,color:'#9585C0'}}>Free Beta</div>
          </div>
        </div>
      </div>
    </aside>

    {/* Main */}
    <main style={{flex:1,overflow:'auto',padding:'32px 36px'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:32}}>
        <div>
          <h1 style={{fontFamily:'JetBrains Mono,monospace',fontSize:26,fontWeight:800,color:'#1A0A3C',letterSpacing:'-1px',marginBottom:4}}>Dashboard</h1>
          <p style={{fontSize:13,color:'#9585C0',fontWeight:300}}>Welcome back! Here's what's happening with your books.</p>
        </div>
        <button onClick={() => setScreen('generator')} style={{display:'inline-flex',alignItems:'center',gap:6,fontFamily:'DM Sans,sans-serif',fontSize:13,fontWeight:500,color:'#fff',background:'linear-gradient(135deg,#7C3AED,#9D6FEC)',border:'none',cursor:'pointer',padding:'10px 18px',borderRadius:10,boxShadow:'0 4px 20px rgba(124,58,237,0.35)',position:'relative',overflow:'hidden'}}>
          <span style={{position:'absolute',inset:0,background:'linear-gradient(135deg,rgba(255,255,255,0.18) 0%,transparent 55%)'}}/>
          <svg viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" style={{width:14,height:14,position:'relative'}}><line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/></svg>
          <span style={{position:'relative'}}>New Book</span>
        </button>
      </div>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16,marginBottom:32}}>
        {[['Books Created','47','#7C3AED'],['PDFs Exported','312','#1A0A3C'],['Est. Royalties','$1.2K','#7C3AED'],['Published','12','#1D9E75']].map(([l,v,c])=>(
          <div key={l} style={{background:'#fff',border:'1px solid rgba(124,58,237,0.12)',borderRadius:14,padding:'20px 20px'}}>
            <div style={{fontSize:11,color:'#9585C0',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:8}}>{l}</div>
            <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:28,fontWeight:800,color:c,lineHeight:1}}>{v}</div>
          </div>
        ))}
      </div>

      {/* Books table */}
      <div style={{background:'#fff',border:'1px solid rgba(124,58,237,0.12)',borderRadius:16,overflow:'hidden'}}>
        <div style={{padding:'20px 24px',borderBottom:'1px solid rgba(124,58,237,0.08)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <h2 style={{fontFamily:'JetBrains Mono,monospace',fontSize:16,fontWeight:700,color:'#1A0A3C',letterSpacing:'-0.3px'}}>My Books</h2>
          <a href="#" style={{fontSize:12,color:'#7C3AED',textDecoration:'none',fontWeight:500}}>View all →</a>
        </div>
        {BOOKS.map((b,i)=>(
          <div key={b.title} style={{display:'flex',alignItems:'center',gap:16,padding:'16px 24px',borderBottom:i<BOOKS.length-1?'1px solid rgba(124,58,237,0.07)':'none'}}>
            <div style={{width:36,height:36,borderRadius:8,background:`${b.color}18`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <svg viewBox="0 0 20 20" fill="none" stroke={b.color} strokeWidth="1.5" strokeLinecap="round" style={{width:16,height:16}}><rect x="4" y="2" width="12" height="16" rx="2"/><line x1="7" y1="7" x2="13" y2="7"/><line x1="7" y1="10" x2="13" y2="10"/></svg>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:500,color:'#1A0A3C',marginBottom:2}}>{b.title}</div>
              <div style={{fontSize:11,color:'#9585C0'}}>{b.type} · {b.pages} pages</div>
            </div>
            <span style={{fontSize:11,fontWeight:500,padding:'3px 10px',borderRadius:20,background:statusStyle[b.status].bg,color:statusStyle[b.status].color}}>{b.status}</span>
            <div style={{fontSize:11,color:'#9585C0',width:60,textAlign:'right'}}>{b.updated}</div>
            <button style={{background:'none',border:'1px solid rgba(124,58,237,0.2)',borderRadius:8,padding:'6px 12px',fontSize:12,color:'#7C3AED',cursor:'pointer'}}>Export PDF</button>
          </div>
        ))}
      </div>
    </main>
  </div>
);

Object.assign(window, { DashboardComponent });
