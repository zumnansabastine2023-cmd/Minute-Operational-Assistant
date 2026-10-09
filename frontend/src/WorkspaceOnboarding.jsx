export default function WorkspaceOnboarding({ theme = 'light', choice, onChoose, onPersonal, picker }) {
  return <main className={`onboarding-shell ${theme}`}><section className="onboarding-card">
    <span className="onboarding-wordmark" aria-hidden="true">moa<span>.</span></span><p className="eyebrow">MAKE YOURSELF AT HOME</p><h1>How would you like to use MOA?</h1>
    <p className="onboarding-intro">Start with your own space, or bring your team along. You can always add another workspace later.</p>
    <div className="onboarding-options">
      <section className="onboarding-personal"><span className="choice-symbol" aria-hidden="true">01</span><h2>Personal</h2><p>Use MOA for your own lectures, meetings, notes and knowledge.</p><button className="primary-button" onClick={onPersonal}>Continue with Personal</button></section>
      <section><span className="choice-symbol" aria-hidden="true">02</span><h2>Company</h2><p>Create a shared MOA workspace for your organization.</p><button aria-pressed={choice === 'create'} onClick={() => onChoose('create')}>Create Company Workspace</button></section>
      <section><span className="choice-symbol" aria-hidden="true">03</span><h2>Join</h2><p>Already have an invitation?</p><button aria-pressed={choice === 'join'} onClick={() => onChoose('join')}>Join a Company</button></section>
    </div>
    {['create', 'join'].includes(choice) && <section key={choice} className="onboarding-form"><h2>{choice === 'create' ? 'Create Company Workspace' : 'Join a Company'}</h2>{picker}</section>}
  </section></main>
}
