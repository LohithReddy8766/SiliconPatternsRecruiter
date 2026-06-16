import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Simulated Database for registered users
  // Shape: { email, name, picture, role, createdAt }
  const [registeredUsers, setRegisteredUsers] = useState([]);

  useEffect(() => {
    // Load registered users from local storage to act as our Database
    try {
      const savedUsers = localStorage.getItem('siliconPatternsRegisteredUsers');
      if (savedUsers) {
        setRegisteredUsers(JSON.parse(savedUsers));
      }
    } catch (e) {
      console.warn("Failed to load users from local storage.");
    }

    // Load active session
    const session = localStorage.getItem('siliconPatternsActiveSession');
    if (session) {
      setCurrentUser(JSON.parse(session));
    }
    setLoading(false);
  }, []);

  // Sync registered users to localStorage whenever it changes
  useEffect(() => {
    if (!loading) {
      localStorage.setItem('siliconPatternsRegisteredUsers', JSON.stringify(registeredUsers));
    }
  }, [registeredUsers, loading]);

  const login = (userData) => {
    const { email, name, picture } = userData;
    const cleanEmail = email.toLowerCase().trim();

    // Strict Domain Restriction
    if (!cleanEmail.endsWith('@siliconpatterns.com') && cleanEmail !== 'dev@siliconpatterns.com') {
      throw new Error("Access restricted to @siliconpatterns.com corporate emails only.");
    }

    // Check if user is registered, if not, create them
    let existingUser = registeredUsers.find(u => u.email === cleanEmail);
    
    // Check if the user was deleted by an admin
    if (existingUser && existingUser.deleted) {
      throw new Error("This account has been deactivated by an administrator.");
    }

    if (!existingUser) {
      // Register new user
      const newUser = {
        email: cleanEmail,
        name,
        picture,
        role: cleanEmail.includes('admin') || cleanEmail === 'dev@siliconpatterns.com' ? 'admin' : 'user',
        createdAt: new Date().toISOString()
      };
      setRegisteredUsers(prev => [...prev, newUser]);
      existingUser = newUser;
    }

    setCurrentUser(existingUser);
    localStorage.setItem('siliconPatternsActiveSession', JSON.stringify(existingUser));
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('siliconPatternsActiveSession');
  };

  const deleteUser = (email) => {
    setRegisteredUsers(prev => prev.filter(u => u.email !== email));
  };

  const value = {
    currentUser,
    login,
    logout,
    registeredUsers,
    deleteUser,
    loading
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
