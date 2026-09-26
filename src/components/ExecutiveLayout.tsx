import React from 'react';
import Layout from './Layout';

interface ExecutiveLayoutProps {
  currentPage: string;
  onPageChange: (page: string) => void;
  userRole: string;
  children: React.ReactNode;
  userId?: string | null;
}

export default function ExecutiveLayout({
  currentPage,
  onPageChange,
  userRole,
  children,
  userId,
}: ExecutiveLayoutProps) {
  return (
    <Layout
      currentPage={currentPage}
      onPageChange={onPageChange}
      userRole={userRole}
      executiveMode={true}
      stockData={[]}
      userId={userId}
    >
      {children}
    </Layout>
  );
}
