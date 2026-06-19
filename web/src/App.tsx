import { NavLink, Route, Routes } from 'react-router-dom';
import { useData } from './data/DataContext';
import { ErrorState, Loading } from './components/common';
import HomePage from './pages/HomePage';
import GeneQueryPage from './pages/GeneQueryPage';
import DrugPage from './pages/DrugPage';
import MethodsPage from './pages/MethodsPage';
import NotFoundPage from './pages/NotFoundPage';

function Header() {
  return (
    <header className="site-header">
      <div className="inner">
        <NavLink to="/" className="brand">drug<span>targets</span></NavLink>
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

export default function App() {
  const { loading, error } = useData();
  return (
    <div className="app">
      <Header />
      <main>
        <div className="container">
          {error ? (
            <ErrorState message={error} />
          ) : loading ? (
            <Loading label="Loading datasets…" />
          ) : (
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/genes" element={<GeneQueryPage />} />
              <Route path="/drug/:chembl" element={<DrugPage />} />
              <Route path="/methods" element={<MethodsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
