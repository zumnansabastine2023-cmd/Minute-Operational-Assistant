import { useId } from 'react'

export function WorkspaceArtwork({ company = false }) {
  const id = useId().replace(/:/g, '')
  return <svg className={`workspace-artwork ${company ? 'network-artwork' : 'wave-artwork'}`} viewBox="0 0 1100 390" preserveAspectRatio="xMidYMid slice" fill="none" aria-hidden="true" focusable="false">
    <defs><linearGradient id={`${id}land`} x1="0" y1="0" x2="1" y2="1"><stop stopColor={company ? '#E8F2FF' : '#E7F8F1'}/><stop offset="1" stopColor={company ? '#2377E8' : '#0E9F77'}/></linearGradient><radialGradient id={`${id}glow`}><stop stopColor={company ? '#22B8E8' : '#F3D98B'} stopOpacity=".42"/><stop offset="1" stopColor={company ? '#22B8E8' : '#F3D98B'} stopOpacity="0"/></radialGradient></defs>
    {company ? <>
      <ellipse cx="860" cy="220" rx="340" ry="250" fill={`url(#${id}glow)`}/><g className="art-grid"><path d="M490 390L730 100 1100 220M600 390L795 120M740 390L880 148M910 390L970 176M450 325L1100 325M560 250L1100 250M640 190L1100 290"/></g>
      <g className="art-building"><path d="M760 235V73l103-37 108 58v161l-108 58Z"/><path d="M760 73l103 52 108-31M863 125v188M793 57v195M829 45v230M899 113v180M935 102v173M760 126l103 54 108-34M760 181l103 55 108-37"/></g>
      <path d="M657 285l140-71 242 108-143 68Z" fill={`url(#${id}land)`} opacity=".45"/><g className="art-screen" transform="translate(823 162)"><rect width="122" height="71" rx="5"/><path d="M12 52l20-12 22 4 25-25 30 6M12 13h35M12 21h22"/></g>
      <g className="art-network"><path d="M595 50l67 100 86-25M595 50l131-32 72 29M662 150l-66 130 161 50"/>{[[595,50],[662,150],[748,125],[596,280],[757,330]].map(([x,y])=><circle key={x} cx={x} cy={y} r="4"/>)}</g>
      <g className="art-people"><circle cx="738" cy="251" r="7"/><path d="M726 288v-22q12-15 24 0v22"/><circle cx="990" cy="277" r="7"/><path d="M978 314v-22q12-15 24 0v22"/></g>
    </> : <>
      <ellipse cx="780" cy="130" rx="360" ry="200" fill={`url(#${id}glow)`}/><circle className="art-sun" cx="834" cy="78" r="35"/>
      <path className="dune-back" d="M0 293Q110 240 220 278T450 262T720 239T1100 187V390H0Z"/><path className="dune-mid" d="M0 339Q170 250 320 316T580 290T830 291T1100 237V390H0Z"/><path className="dune-front" d="M0 368Q160 307 345 348T624 322T841 330T1100 282V390H0Z" fill={`url(#${id}land)`}/>
      <path className="dune-line" d="M440 390Q611 262 749 318T1100 284M280 390Q480 292 664 352T1100 336"/>{[70,150,755,1040].map((x,i)=><g className="art-leaf" key={x} transform={`translate(${x} ${330-i%2*20}) scale(${i===3?1.4:1})`}><path d="M0 35Q-10 4-26-10Q-30 22 0 35M0 35Q4-9 22-20Q32 11 0 35M0 35Q-2 5-6-27Q-24-4 0 35"/><path d="M0 35L-5-4"/></g>)}
    </>}
  </svg>
}
export function DuneMotif() { return <WorkspaceArtwork /> }

// Restored from the pre-orb AssistantMascot in commit b34270a.
export function MoaCompanion({ size = 64, state = 'idle' }) {
  const id = useId().replace(/:/g, '')
  return <span className={`moa-robot robot-${state}`} style={{width:size,height:size}} aria-hidden="true">
    <svg width={size} height={size} viewBox="0 0 72 76" fill="none" focusable="false"><defs>
      <linearGradient id={`${id}shell`} x1="15" y1="12" x2="49" y2="65" gradientUnits="userSpaceOnUse"><stop stopColor="#fff"/><stop offset=".58" stopColor="#E7EEE9"/><stop offset="1" stopColor="#9DAFAC"/></linearGradient><linearGradient id={`${id}face`} x1="17" y1="20" x2="47" y2="44"><stop stopColor="#15332F"/><stop offset="1" stopColor="#031213"/></linearGradient><filter id={`${id}glow`} x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="1.1" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs><ellipse cx="36" cy="71" rx="22" ry="3" fill="currentColor" opacity=".15"/><g className="robot-body" transform="translate(4 3)"><path d="M32 11V7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><circle className="robot-antenna" cx="32" cy="5" r="2.3" fill="currentColor"/><path d="M12 31H8c-2 0-3.5 1.6-3.5 3.5v5C4.5 42 6 43.5 8 43.5h4M52 31h4c2 0 3.5 1.6 3.5 3.5v5c0 2-1.5 3.5-3.5 3.5h-4" fill="currentColor" stroke="#CADCD8" strokeWidth="1.5"/><path d="M16 64c1.2-8.4 7.1-13 16-13s14.8 4.6 16 13H16Z" fill={`url(#${id}shell)`} stroke="#C4D9D0" strokeWidth="1.2"/><path d="M25 53c1.7 3.3 12.3 3.3 14 0v8H25v-8Z" fill="currentColor" opacity=".65"/><path d="M11 29c0-10.5 8.5-18 21-18s21 7.5 21 18v12c0 9-7.3 16-16.3 16h-9.4C18.3 57 11 50 11 41V29Z" fill={`url(#${id}shell)`} stroke="#D2E9DF" strokeWidth="1.3"/><rect x="15.5" y="19" width="33" height="27" rx="11" fill={`url(#${id}face)`} stroke="#284B47"/><path d="M18.5 25c4-5 10-5 14-5h8" stroke="#DCFFF8" strokeOpacity=".2" strokeWidth="2" strokeLinecap="round"/><g className="robot-eyes" fill="currentColor" filter={`url(#${id}glow)`}><rect x="21" y="27" width="5.5" height="10" rx="2.75"/><rect x="37.5" y="27" width="5.5" height="10" rx="2.75"/></g>{state==='success'&&<path d="M28 40l3 2 5-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>}<path d="M23 53.5v4M41 53.5v4" stroke="#A9C7BA" strokeWidth="4" strokeLinecap="round"/></g>{state==='listening'&&<g className="robot-wave" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 19v6M9 16v12M63 16v12M68 19v6"/></g>}{state==='thinking'&&<g className="robot-dots" fill="currentColor"><circle cx="57" cy="10" r="2"/><circle cx="63" cy="7" r="2"/><circle cx="69" cy="4" r="2"/></g>}</svg>
  </span>
}
