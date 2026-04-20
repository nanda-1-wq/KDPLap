// KDP Lab — Word Search Generator Screen
const SAMPLE_GRID = [
  'ABCDEFGHIJ','KPUZZLEBMN','OPQRSTUVWX','YWORDSZABC',
  'DEFGHIJKLM','NOPQRSTUVW','XSUDOKUABC','DEFGHIJKLM',
  'NKDPLABABC','DEFGBOOKHI'
];
const WORDS = ['PUZZLE','WORD','SUDOKU','KDP','LAB','BOOK'];

const GeneratorComponent = ({ setScreen }) => {
  const [words, setWords] = React.useState('cat\ndog\nfish\npuzzle\nbook\nsudoku');
  const [difficulty, setDifficulty] = React.useState('Medium');
  const [size, setSize] = React.useState('15×15');
  const [generated, setGenerated] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => { setGenerating(false); setGenerated(true); }, 1200);
  };

  return (
    <div style={{display:'flex',height:'100vh',background:'#F8F7FF',fontFamily:'DM Sans,sans-serif',paddingTop:70}}>
      {/* Sidebar */}
      <aside style={{width:220,background:'#fff',borderRight:'1px solid rgba(124,58,237,0.12)',padding:'24px 0',flexShrink:0,display:'flex',flexDirection:'column',gap:4}}>
        {[
          { label:'Dashboard', icon:<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{width:16,height:16}}><rect x="2" y="2" width="7" height="7" rx="1.5"/><rect x="11" y="2" width="7" height="7" rx="1.5"/><rect x="2" y="11" width="7" height="7" rx="1.5"/><rect x="11" y="11" width="7" height="7" rx="1.5"/></svg> },
          { label:'My Books', icon:<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{width:16,height:16}}><rect x="4" y="2" width="12" height="16" rx="2"/><line x1="7" y1="7" x2="13" y2="7"/><line x1="7" y1="10" x2="13" y2="10"/></svg> },
          { label:'Generators', active:true, icon:<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{width:16,height:16}}><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="11" y="3" width="6" height="6" rx="1"/><rect x="3" y="11" width="6" height="6" rx="1"/><rect x="11" y="11" width="6" height="6" rx="1"/></svg> },
          { label:'Templates', icon:<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{width:16,height:16}}><rect x="2" y="2" width="16" height="16" rx="2"/><path d="M2 8h16M8 8v10"/></svg> },
          { label:'Cover Designer', icon:<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{width:16,height:16}}><rect x="2" y="4" width="16" height="12" rx="2"/><path d="M2 8h16"/><circle cx="7" cy="12" r="1.5"/></svg> },
          { label:'Keyword Tool', icon:<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{width:16,height:16}}><circle cx="9" cy="9" r="5"/><line x1="13" y1="13" x2="17" y2="17"/></svg> },
        ].map(item => (
          <button key={item.label} onClick={() => item.label==='Dashboard' && setScreen('dashboard')} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 20px',fontSize:13,fontWeight:item.active?500:400,color:item.active?'#7C3AED':'#5B4B8A',background:item.active?'#EDE9FE':'transparent',border:'none',cursor:'pointer',textAlign:'left',width:'100%'}}>
            <span style={{color:item.active?'#7C3AED':'#9585C0'}}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </aside>

      {/* Main */}
      <main style={{flex:1,overflow:'auto',padding:'32px 36px',display:'flex',gap:28}}>
        {/* Controls */}
        <div style={{width:300,flexShrink:0,display:'flex',flexDirection:'column',gap:16}}>
          <div>
            <h1 style={{fontFamily:'JetBrains Mono,monospace',fontSize:22,fontWeight:800,color:'#1A0A3C',letterSpacing:'-1px',marginBottom:4}}>Word Search</h1>
            <p style={{fontSize:13,color:'#9585C0',fontWeight:300}}>Enter your words and customize settings</p>
          </div>

          <div style={{background:'#fff',border:'1px solid rgba(124,58,237,0.12)',borderRadius:14,padding:20,display:'flex',flexDirection:'column',gap:16}}>
            <div>
              <label style={{fontSize:12,fontWeight:500,color:'#5B4B8A',display:'block',marginBottom:6}}>Word List</label>
              <textarea value={words} onChange={e=>setWords(e.target.value)} rows={8} style={{width:'100%',fontFamily:'JetBrains Mono,monospace',fontSize:12,color:'#1A0A3C',background:'#F8F7FF',border:'1px solid rgba(124,58,237,0.2)',borderRadius:10,padding:'10px 12px',outline:'none',resize:'vertical',lineHeight:1.6}} placeholder="Enter one word per line"/>
            </div>

            <div>
              <label style={{fontSize:12,fontWeight:500,color:'#5B4B8A',display:'block',marginBottom:6}}>Difficulty</label>
              <div style={{display:'flex',gap:6}}>
                {['Easy','Medium','Hard'].map(d=>(
                  <button key={d} onClick={()=>setDifficulty(d)} style={{flex:1,padding:'8px 0',fontSize:12,fontWeight:500,borderRadius:8,border:'1px solid',borderColor:difficulty===d?'#7C3AED':'rgba(124,58,237,0.2)',background:difficulty===d?'#EDE9FE':'#fff',color:difficulty===d?'#7C3AED':'#5B4B8A',cursor:'pointer'}}>
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{fontSize:12,fontWeight:500,color:'#5B4B8A',display:'block',marginBottom:6}}>Grid Size</label>
              <select value={size} onChange={e=>setSize(e.target.value)} style={{width:'100%',fontFamily:'DM Sans,sans-serif',fontSize:13,color:'#1A0A3C',background:'#fff',border:'1px solid rgba(124,58,237,0.2)',borderRadius:10,padding:'9px 12px',outline:'none',cursor:'pointer'}}>
                <option>10×10</option><option>15×15</option><option>20×20</option>
              </select>
            </div>

            <button onClick={handleGenerate} disabled={generating} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,fontFamily:'DM Sans,sans-serif',fontSize:14,fontWeight:500,color:'#fff',background:'linear-gradient(135deg,#7C3AED,#9D6FEC)',border:'none',cursor:'pointer',padding:'13px 0',borderRadius:10,boxShadow:'0 4px 20px rgba(124,58,237,0.35)',position:'relative',overflow:'hidden',opacity:generating?0.8:1}}>
              <span style={{position:'absolute',inset:0,background:'linear-gradient(135deg,rgba(255,255,255,0.18) 0%,transparent 55%)'}}/>
              <span style={{position:'relative'}}>{generating?'Generating…':'Generate Puzzle →'}</span>
            </button>
          </div>
        </div>

        {/* Preview */}
        <div style={{flex:1,display:'flex',flexDirection:'column',gap:16}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <h2 style={{fontFamily:'JetBrains Mono,monospace',fontSize:16,fontWeight:700,color:'#1A0A3C',letterSpacing:'-0.3px'}}>Preview</h2>
            {generated && (
              <button style={{display:'inline-flex',alignItems:'center',gap:6,fontFamily:'DM Sans,sans-serif',fontSize:13,fontWeight:500,color:'#fff',background:'linear-gradient(135deg,#7C3AED,#9D6FEC)',border:'none',cursor:'pointer',padding:'9px 18px',borderRadius:10,boxShadow:'0 4px 20px rgba(124,58,237,0.35)',position:'relative',overflow:'hidden'}}>
                <span style={{position:'absolute',inset:0,background:'linear-gradient(135deg,rgba(255,255,255,0.18) 0%,transparent 55%)'}}/>
                <span style={{position:'relative'}}>Export PDF →</span>
              </button>
            )}
          </div>
          <div style={{background:'#fff',border:'1px solid rgba(124,58,237,0.12)',borderRadius:16,flex:1,display:'flex',alignItems:'center',justifyContent:'center',minHeight:400}}>
            {!generated ? (
              <div style={{textAlign:'center',padding:40}}>
                <div style={{width:64,height:64,background:'#EDE9FE',borderRadius:16,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px'}}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:28,height:28}}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
                </div>
                <p style={{fontSize:14,color:'#9585C0',fontWeight:300}}>Enter your words and click<br/><strong style={{color:'#7C3AED',fontWeight:500}}>Generate Puzzle</strong> to preview</p>
              </div>
            ) : (
              <div style={{padding:32,width:'100%'}}>
                <h3 style={{fontFamily:'JetBrains Mono,monospace',fontSize:18,fontWeight:800,color:'#1A0A3C',textAlign:'center',marginBottom:24,letterSpacing:'-0.5px'}}>Word Search Puzzle</h3>
                {/* Grid */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(10,1fr)',gap:2,maxWidth:340,margin:'0 auto 24px',fontFamily:'JetBrains Mono,monospace',fontSize:13,fontWeight:500}}>
                  {SAMPLE_GRID.map((row,ri)=>row.split('').map((ch,ci)=>{
                    const inWord = WORDS.some(w=>row.includes(w) && ci>=row.indexOf(w) && ci<row.indexOf(w)+w.length);
                    return <div key={`${ri}-${ci}`} style={{width:32,height:32,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:4,background:inWord?'#EDE9FE':'transparent',color:inWord?'#7C3AED':'#1A0A3C',fontWeight:inWord?700:400}}>{ch}</div>;
                  }))}
                </div>
                {/* Word list */}
                <div style={{maxWidth:340,margin:'0 auto'}}>
                  <div style={{fontSize:11,color:'#9585C0',textTransform:'uppercase',letterSpacing:'0.8px',marginBottom:10,fontWeight:600}}>Find These Words</div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                    {words.split('\n').filter(Boolean).map(w=>(
                      <span key={w} style={{fontFamily:'JetBrains Mono,monospace',fontSize:11,fontWeight:600,padding:'3px 10px',background:'#EDE9FE',color:'#7C3AED',borderRadius:20}}>{w.toUpperCase()}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

Object.assign(window, { GeneratorComponent });
