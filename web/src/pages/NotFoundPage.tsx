import { Link } from 'react-router-dom';
import { EmptyState } from '../components/common';
import { usePageTitle } from '../lib/usePageTitle';

export default function NotFoundPage() {
  usePageTitle('Page not found');
  return <EmptyState>Page not found. <Link to="/">Back home</Link>.</EmptyState>;
}
