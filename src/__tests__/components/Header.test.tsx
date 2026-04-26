import { render, screen } from '@testing-library/react';
import { Header } from '@/components/Header';
import { AuthContext } from '@/contexts/AuthContext';

// Mock Next.js router
jest.mock('next/router', () => ({
  useRouter: () => ({
    pathname: '/',
    push: jest.fn(),
  }),
}));

const mockAuthContext = {
  user: null,
  profile: null,
  loading: false,
  signIn: jest.fn(),
  signUp: jest.fn(),
  signOut: jest.fn(),
  updateProfile: jest.fn(),
};

describe('Header', () => {
  it('renders the logo', () => {
    render(
      <AuthContext.Provider value={mockAuthContext}>
        <Header />
      </AuthContext.Provider>
    );

    expect(screen.getByText('CateringMS')).toBeInTheDocument();
  });

  it('shows login button when user is not authenticated', () => {
    render(
      <AuthContext.Provider value={mockAuthContext}>
        <Header />
      </AuthContext.Provider>
    );

    expect(screen.getByText('Log In')).toBeInTheDocument();
  });

  it('shows dashboard link when user is authenticated', () => {
    const authenticatedContext = {
      ...mockAuthContext,
      user: { id: 'user-1', email: 'test@test.com' },
      profile: { role: 'admin', company_id: 'company-1' },
    };

    render(
      <AuthContext.Provider value={authenticatedContext as any}>
        <Header />
      </AuthContext.Provider>
    );

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });
});