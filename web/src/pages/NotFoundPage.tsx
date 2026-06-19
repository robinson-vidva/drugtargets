import { Link } from 'react-router-dom';
import { EmptyState } from '../components/common';

export default function NotFoundPage() {
  return <EmptyState>Page not found. <Link to="/">Back home</Link>.</EmptyState>;
}
