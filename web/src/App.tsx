import { useEffect } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { useData } from './data/DataContext';
import { ErrorState, Loading } from './components/common';
import { ErrorBoundary } from './components/ErrorBoundary';
import { BackToTop } from './components/BackToTop';
import { SearchBox } from './components/SearchBox';
import HomePage from './pages/HomePage';
import GeneQueryPage from './pages/GeneQueryPage';
import DrugPage from './pages/DrugPage';
import DiseasePage from './pages/DiseasePage';
import MethodsPage from './pages/MethodsPage';
import NotFoundPage from './pages/NotFoundPage';

const GLOBAL_SEARCH_ID = 'global-search';

function Header() {
  return (
    <header className="site-header">
      <div className="inner">
        <NavLink to="/" className="brand">
          <img src="/favicon.png" alt="" className="brand-logo" />
          <span className="brand-word">drug<span>targets</span></span>
        </NavLink>
        <div className="header-search">
          <SearchBox inputId={GLOBAL_SEARCH_ID} placeholder="Search drug / gene / disease  ( / )" />
        </div>
        <nav className="nav">
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/genes">Gene query</NavLink>
          <NavLink to="/methods">Methods</NavLink>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  const { meta } = useData();
  return (
    <footer className="site-footer">
      <div className="inner spread">
        <span>
          <NavLink to="/methods">Data &amp; Licenses</NavLink> · Open Targets{' '}
          {meta?.otRelease ?? ''} · openFDA {meta?.openfdaDate ?? ''} · ChEMBL{' '}
          {meta?.chemblVersion ?? ''}
        </span>
        <span className="muted">Hypothesis, not evidence — not for clinical use.</span>
      </div>
    </footer>
  );
}

/** "/" focuses the global search (unless typing in a field). */
function useSlashToSearch() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
        || (el as HTMLElement)?.isContentEditable) return;
      const input = document.getElementById(GLOBAL_SEARCH_ID) as HTMLInputElement | null;
      if (input) { e.preventDefault(); input.focus(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export default function App() {
  const { loading, error } = useData();
  useSlashToSearch();
  return (
    <div className="app">
      <a href="#main" className="skip-link">Skip to content</a>
      <Header />
      <main id="main" tabIndex={-1}>
        <div className="container">
          {error ? (
            <ErrorState message={error} />
          ) : loading ? (
            <Loading label="Loading datasets…" />
          ) : (
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/genes" element={<GeneQueryPage />} />
                <Route path="/drug/:chembl" element={<DrugPage />} />
                <Route path="/disease/:efo" element={<DiseasePage />} />
                <Route path="/methods" element={<MethodsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </ErrorBoundary>
          )}
        </div>
      </main>
      <BackToTop />
      <Footer />
    </div>
  );
}
