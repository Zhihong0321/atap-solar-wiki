import WikiShell from '../wiki/shell';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <WikiShell>{children}</WikiShell>;
}
