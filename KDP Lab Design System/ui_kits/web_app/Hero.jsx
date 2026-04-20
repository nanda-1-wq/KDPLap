// KDP Lab — Hero Component
const HeroComponent = ({ setScreen }) => (
  <section style={{
    minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
    padding:'calc(70px + 3rem) 2rem 4rem',
    position:'relative', overflow:'hidden',
    background:'linear-gradient(170deg,#EDE9FE 0%,#F8F7FF 45%,#FFFFFF 100%)'
  }}>
    {/* Grid */}
    <div style={{position:'absolute',inset:0,backgroundImage:'linear-gradient(rgba(124,58,237,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(124,58,237,0.05) 1px,transparent 1px)',backgroundSize:'48px 48px',maskImage:'radial-gradient(ellipse 80% 60% at 50% 0%,black 40%,transparent 100%)',pointerEvents:'none'}}/>
    {/* Orbs */}
    <div style={{position:'absolute',width:600,height:600,borderRadius:'50%',background:'radial-gradient(circle,rgba(167,139,250,0.28) 0%,transparent 70%)',top:-200,left:-100,filter:'blur(80px)',animation:'orbDrift 12s ease-in-out infinite alternate'}}/>
    <div style={{position:'absolute',width:500,height:500,borderRadius:'50%',background:'radial-gradient(circle,rgba(124,58,237,0.14) 0%,transparent 70%)',bottom:-100,right:-80,filter:'blur(80px)',animation:'orbDrift 15s ease-in-out infinite alternate-reverse'}}/>

    <div style={{display:'flex',alignItems:'center',gap:'4rem',maxWidth:1140,width:'100%',position:'relative',zIndex:1,flexWrap:'wrap'}}>
      {/* Text */}
      <div style={{flex:1,minWidth:280}}>
        <div style={{display:'inline-flex',alignItems:'center',gap:7,background:'rgba(255,255,255,0.85)',border:'1px solid rgba(124,58,237,0.25)',borderRadius:20,padding:'5px 14px 5px 8px',fontSize:12,fontWeight:500,color:'#7C3AED',marginBottom:'1.75rem',backdropFilter:'blur(8px)'}}>
          <div style={{width:20,height:20,background:'linear-gradient(135deg,#7C3AED,#A78BFA)',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <svg viewBox="0 0 12 12" style={{width:10,height:10,fill:'#fff'}}><polygon points="6,1 8,5 12,5 9,8 10,12 6,9 2,12 3,8 0,5 4,5"/></svg>
          </div>
          Now in Beta — Free to use
        </div>

        <h1 style={{fontFamily:'JetBrains Mono,monospace',fontSize:'clamp(36px,5vw,64px)',fontWeight:800,lineHeight:1.1,letterSpacing:'-2px',color:'#1A0A3C',marginBottom:'1.25rem'}}>
          Create Low-Content<br/>Books <span style={{background:'linear-gradient(135deg,#7C3AED 0%,#A78BFA 100%)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',backgroundClip:'text'}}>in Minutes</span>
        </h1>

        <p style={{fontSize:16,color:'#5B4B8A',maxWidth:440,lineHeight:1.7,fontWeight:300}}>
          Generate puzzle books, journals, planners &amp; coloring books ready for Amazon KDP. No design skills required.
        </p>

        <div style={{display:'flex',gap:12,flexWrap:'wrap',marginTop:'2rem'}}>
          <button onClick={() => setScreen('dashboard')} style={{display:'inline-flex',alignItems:'center',gap:8,fontFamily:'DM Sans,sans-serif',fontSize:15,fontWeight:500,color:'#fff',background:'linear-gradient(135deg,#7C3AED,#9D6FEC)',border:'none',cursor:'pointer',padding:'13px 28px',borderRadius:12,boxShadow:'0 8px 32px rgba(124,58,237,0.35)',position:'relative',overflow:'hidden',transition:'all 0.25s'}}>
            <span style={{position:'absolute',inset:0,background:'linear-gradient(135deg,rgba(255,255,255,0.18) 0%,transparent 55%)'}}/>
            <span style={{position:'relative'}}>Get Started Free →</span>
          </button>
          <a href="#how-it-works" style={{display:'inline-flex',alignItems:'center',fontFamily:'DM Sans,sans-serif',fontSize:15,fontWeight:400,color:'#5B4B8A',background:'rgba(255,255,255,0.8)',border:'1px solid rgba(124,58,237,0.25)',cursor:'pointer',padding:'13px 28px',borderRadius:12,textDecoration:'none'}}>
            See how it works
          </a>
        </div>
      </div>

      {/* Mock card */}
      <div style={{flexShrink:0,width:320,position:'relative'}}>
        <div style={{position:'absolute',top:-14,right:-20,background:'#fff',border:'1px solid rgba(124,58,237,0.25)',borderRadius:12,padding:'8px 14px',fontSize:11,fontWeight:500,color:'#1A0A3C',boxShadow:'0 8px 40px rgba(124,58,237,0.14)',display:'flex',alignItems:'center',gap:6,whiteSpace:'nowrap',zIndex:2,animation:'floatA 4s ease-in-out infinite'}}>
          <div style={{width:7,height:7,borderRadius:'50%',background:'#1D9E75'}}/>PDF exported — KDP Ready
        </div>
        <div style={{position:'absolute',bottom:-14,left:-20,background:'#fff',border:'1px solid rgba(124,58,237,0.25)',borderRadius:12,padding:'8px 14px',fontSize:11,fontWeight:500,color:'#1A0A3C',boxShadow:'0 8px 40px rgba(124,58,237,0.14)',display:'flex',alignItems:'center',gap:6,whiteSpace:'nowrap',zIndex:2,animation:'floatB 4s 1s ease-in-out infinite'}}>
          <div style={{width:7,height:7,borderRadius:'50%',background:'#7C3AED'}}/>Word Search generated in 4s
        </div>

        <div style={{background:'#fff',border:'1px solid rgba(124,58,237,0.25)',borderRadius:20,boxShadow:'0 24px 80px rgba(124,58,237,0.18)',padding:22,position:'relative',overflow:'hidden'}}>
          <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:'linear-gradient(90deg,#7C3AED,#A78BFA,#7C3AED)',backgroundSize:'200%',animation:'shimmer 3s linear infinite'}}/>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18}}>
            <div style={{display:'flex',gap:6}}>{['#FF5F57','#FEBC2E','#28C840'].map(c=><span key={c} style={{width:8,height:8,borderRadius:'50%',background:c,display:'block'}}/>)}</div>
            <div style={{fontSize:10,color:'#9585C0',background:'#EDE9FE',padding:'3px 10px',borderRadius:20}}>KDP Lab Dashboard</div>
          </div>
          {[['Books created','47',true],['PDFs exported','312',false],['Est. royalties','$1.2K',true]].map(([l,v,accent])=>(
            <div key={l} style={{background:'#F8F7FF',border:'1px solid rgba(124,58,237,0.12)',borderRadius:12,padding:'14px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
              <span style={{fontSize:10,color:'#9585C0',textTransform:'uppercase',letterSpacing:'0.5px'}}>{l}</span>
              <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:20,fontWeight:700,color:accent?'#7C3AED':'#1A0A3C'}}>{v}</span>
            </div>
          ))}
          <div style={{display:'flex',gap:8,alignItems:'flex-end',height:100,padding:'0 2px',marginBottom:16}}>
            {[[40,false],[60,false],[85,true],[55,false],[95,true],[72,false],[88,true]].map(([h,hi],i)=>(
              <div key={i} style={{flex:1,borderRadius:'5px 5px 0 0',height:`${h}%`,background:hi?'linear-gradient(to top,#7C3AED,#A78BFA)':'#EDE9FE'}}/>
            ))}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8,fontSize:11,color:'#5B4B8A',paddingTop:10,borderTop:'1px solid rgba(124,58,237,0.1)'}}>
            <div style={{width:7,height:7,borderRadius:'50%',background:'#1D9E75',flexShrink:0}}/>
            3 books published this week
          </div>
        </div>
      </div>
    </div>
  </section>
);

Object.assign(window, { HeroComponent });
