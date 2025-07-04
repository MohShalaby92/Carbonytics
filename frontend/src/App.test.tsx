import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('./pages/Dashboard', () => {
  return function MockDashboard() {
    return <div data-testid="dashboard">Dashboard Page</div>;
  };
});

jest.mock('./pages/Login', () => {
  return function MockLogin() {
    return <div data-testid="login">Login Page</div>;
  };
});

describe('App Component', () => {
  it('renders without crashing', () => {
    render(<App />);
    expect(document.body).toBeInTheDocument();
  });

  it('contains main application structure', () => {
    render(<App />);
    
    // Check for basic app structure
    const appElement = document.querySelector('#root');
    expect(appElement).toBeInTheDocument();
  });

  it('handles routing setup', () => {
    // Basic routing test
    expect(() => {
      render(<App />);
    }).not.toThrow();
  });
});