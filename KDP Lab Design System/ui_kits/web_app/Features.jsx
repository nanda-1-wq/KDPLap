// KDP Lab — Features & Steps Component
const STEPS = [
  { num:'01', title:'Pick a Niche', desc:'Choose a profitable niche. Puzzle books, journals, planners — find what sells.', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:20,height:20}}><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg> },
  { num:'02', title:'Generate Content', desc:'Our generators create word searches, sudoku, crosswords, lined pages — instantly.', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:20,height:20}}><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18M3 9h18"/></svg> },
  { num:'03', title:'Design Your Cover', desc:'Built-in cover designer with KDP-ready templates. Drag, drop, done.', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:20,height:20}}><rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2 8h20"/><circle cx="8" cy="14" r="2"/></svg> },
  { num:'04', title:'Publish to KDP', desc:'Export your KDP-ready PDF and follow our step-by-step guide to go live on Amazon.', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:20,height:20}}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.27 5.82 21 7 14.14l-5-4.87 6.91-1.01z"/></svg> },
];

const FEATURES = [
  { title:'Puzzle Generators', desc:'Word searches, sudoku, crossword with adjustable difficulty. Auto-generates solution pages and formats to KDP specs.', tag:'Most Popular', icon:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg> },
  { title:'Journal & Notebook Builder', desc:'Build journals with lined, dot grid, or blank pages. Set custom margins for KDP bleed. One-click full book generation.', tag:'Core', icon:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><rect x="4" y="2" width="16" height="20" rx="2.5"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="13" y2="16"/></svg> },
  { title:'Cover Designer', desc:'Drag-and-drop cover builder with KDP template sizes built in. Choose from starter designs or build from scratch.', tag:'Core', icon:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2 8h20"/><circle cx="8" cy="14" r="2"/><line x1="14" y1="12" x2="18" y2="12"/><line x1="14" y1="15" x2="17" y2="15"/></svg> },
];

const FeaturesComponent = () => (
  <div>
    {/* How It Works */}
    <section id="how-it-works" style={{padding:'6rem 2rem',background:'#fff'}}>
      <div style={{maxWidth:1080,margin:'0 auto'}}>
        <span style={{display:'inline-block',fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:'1.5px',color:'#7C3AED',background:'#EDE9FE',padding:'4px 12px',borderRadius:20,marginBottom:'1rem'}}>How It Works</span>
        <h2 style={{fontFamily:'JetBrains Mono,monospace',fontSize:'clamp(28px,4vw,44px)',fontWeight:800,lineHeight:1.15,letterSpacing:'-1.5px',color:'#1A0A3C',marginBottom:'0.75rem'}}>
          From idea to published book<br/>in <span style={{background:'linear-gradient(135deg,#7C3AED,#A78BFA)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',backgroundClip:'text'}}>four steps</span>
        </h2>
        <p style={{fontSize:16,color:'#5B4B8A',maxWidth:520,lineHeight:1.7,fontWeight:300,marginBottom:'3rem'}}>No complicated tools. No design experience. Just pick, generate, design, and publish.</p>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:20}}>
          {STEPS.map(s=>(
            <div key={s.num} style={{background:'#F8F7FF',border:'1px solid rgba(124,58,237,0.12)',borderRadius:16,padding:'28px 24px'}}>
              <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:11,fontWeight:700,color:'#C4B5FD',letterSpacing:1,marginBottom:16}}>{s.num}</div>
              <div style={{width:40,height:40,background:'#EDE9FE',borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',marginBottom:16,color:'#7C3AED'}}>{s.icon}</div>
              <h3 style={{fontFamily:'JetBrains Mono,monospace',fontSize:16,fontWeight:700,color:'#1A0A3C',marginBottom:8,letterSpacing:'-0.3px'}}>{s.title}</h3>
              <p style={{fontSize:13,color:'#5B4B8A',lineHeight:1.6,fontWeight:300}}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* Features */}
    <section id="features" style={{padding:'6rem 2rem',background:'#F8F7FF'}}>
      <div style={{maxWidth:1080,margin:'0 auto'}}>
        <span style={{display:'inline-block',fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:'1.5px',color:'#7C3AED',background:'#EDE9FE',padding:'4px 12px',borderRadius:20,marginBottom:'1rem'}}>Features</span>
        <h2 style={{fontFamily:'JetBrains Mono,monospace',fontSize:'clamp(28px,4vw,44px)',fontWeight:800,lineHeight:1.15,letterSpacing:'-1.5px',color:'#1A0A3C',marginBottom:'0.75rem'}}>
          Everything you need to<br/><span style={{background:'linear-gradient(135deg,#7C3AED,#A78BFA)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',backgroundClip:'text'}}>build and sell</span>
        </h2>
        <p style={{fontSize:16,color:'#5B4B8A',maxWidth:520,lineHeight:1.7,fontWeight:300,marginBottom:'3rem'}}>Powerful generators, smart templates, and publishing tools — all in one platform.</p>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:20}}>
          {FEATURES.map(f=>(
            <div key={f.title} style={{background:'#fff',border:'1px solid rgba(124,58,237,0.12)',borderRadius:16,padding:'32px 28px'}}>
              <div style={{width:44,height:44,background:'#EDE9FE',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',marginBottom:20,color:'#7C3AED'}}>{f.icon}</div>
              <h3 style={{fontFamily:'JetBrains Mono,monospace',fontSize:18,fontWeight:700,color:'#1A0A3C',marginBottom:10,letterSpacing:'-0.3px'}}>{f.title}</h3>
              <p style={{fontSize:14,color:'#5B4B8A',lineHeight:1.7,fontWeight:300}}>{f.desc}</p>
              <span style={{display:'inline-block',marginTop:16,fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.8px',color:'#7C3AED',background:'#EDE9FE',padding:'3px 10px',borderRadius:20}}>{f.tag}</span>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* Pricing Beta */}
    <section style={{padding:'6rem 2rem',background:'#fff'}}>
      <div style={{maxWidth:1080,margin:'0 auto'}}>
        <div style={{background:'#F8F7FF',border:'1px solid rgba(124,58,237,0.25)',borderRadius:20,padding:48,textAlign:'center'}}>
          <span style={{display:'inline-block',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'1.5px',color:'#fff',background:'linear-gradient(135deg,#7C3AED,#A78BFA)',padding:'4px 14px',borderRadius:20,marginBottom:'1.25rem'}}>Beta</span>
          <h2 style={{fontFamily:'JetBrains Mono,monospace',fontSize:'clamp(28px,4vw,40px)',fontWeight:800,color:'#1A0A3C',letterSpacing:'-1.5px',marginBottom:'0.75rem'}}>Free during Beta</h2>
          <p style={{fontSize:16,color:'#5B4B8A',maxWidth:480,margin:'0 auto 1.75rem',lineHeight:1.7,fontWeight:300}}>We're building KDP Lab in the open. All features are free while we're in beta — no credit card required.</p>
          <button style={{display:'inline-flex',alignItems:'center',gap:8,fontFamily:'DM Sans,sans-serif',fontSize:15,fontWeight:500,color:'#fff',background:'linear-gradient(135deg,#7C3AED,#9D6FEC)',border:'none',cursor:'pointer',padding:'13px 28px',borderRadius:12,boxShadow:'0 8px 32px rgba(124,58,237,0.35)',position:'relative',overflow:'hidden'}}>
            <span style={{position:'absolute',inset:0,background:'linear-gradient(135deg,rgba(255,255,255,0.18) 0%,transparent 55%)'}}/>
            <span style={{position:'relative'}}>Get Started Free →</span>
          </button>
        </div>
      </div>
    </section>

    {/* Final CTA */}
    <section style={{background:'linear-gradient(135deg,#7C3AED,#5B21B6)',padding:'5rem 2rem',textAlign:'center'}}>
      <h2 style={{fontFamily:'JetBrains Mono,monospace',fontSize:'clamp(28px,4vw,44px)',fontWeight:800,lineHeight:1.15,letterSpacing:'-1.5px',color:'#fff',marginBottom:'2rem'}}>Ready to create your<br/>first book?</h2>
      <button style={{display:'inline-flex',alignItems:'center',gap:8,fontFamily:'DM Sans,sans-serif',fontSize:15,fontWeight:500,color:'#7C3AED',background:'#fff',border:'none',cursor:'pointer',padding:'13px 28px',borderRadius:12,boxShadow:'0 8px 32px rgba(0,0,0,0.25)'}}>
        Get Started Free →
      </button>
      <p style={{fontSize:16,color:'rgba(255,255,255,0.7)',maxWidth:500,margin:'1.5rem auto 0',lineHeight:1.7,fontWeight:300}}>Sign up free and start generating KDP-ready books today.</p>
    </section>
  </div>
);

Object.assign(window, { FeaturesComponent });
