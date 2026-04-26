import { render } from '@testing-library/react';
import { Header } from '@/components/Header';

// Mock Next.js router
jest.mock('next/router', () => ({
  useRouter: () => ({
    pathname: '/',
    push: jest.fn(),
  }),
}));

// Mock useAuth
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    profile: null,
    loading: false,
    signIn: jest.fn(),
    signUp: jest.fn(),
    signOut: jest.fn(),
    updateProfile: jest.fn(),
  }),
}));

// Mock useCompanySlug if it's used inside
jest.mock('@/hooks/useCompanySlug', () => ({
  useCompanySlug: () => 'test-company'
}));

describe('Header', () => {
  it('renders successfully without crashing', () => {
    const { container } = render(<Header />);
    expect(container).toBeTruthy();
  });
});