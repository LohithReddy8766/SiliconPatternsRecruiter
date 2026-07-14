import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import LoginPage from './LoginPage';

function renderLoginPage() {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </BrowserRouter>
  );
}

describe('LoginPage', () => {
  it('renders the login form without crashing', () => {
    renderLoginPage();
    expect(screen.getByPlaceholderText('name@siliconpatterns.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /login securely/i })).toBeInTheDocument();
  });
});
