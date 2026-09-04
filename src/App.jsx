import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
// Add page imports here
import TravelUpLayout from '@/components/TravelUpLayout';
import TripMigrationEffect from '@/components/TripMigrationEffect';
import Landing from '@/pages/Landing';
import Questionnaire from '@/pages/Questionnaire';
import Results from '@/pages/Results';
import TripDetail from '@/pages/TripDetail';
import About from '@/pages/About';
import SavedTrips from '@/pages/SavedTrips';
import SavedTripDetail from '@/pages/SavedTripDetail';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import OAuthConsent from '@/pages/OAuthConsent';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <>
      <TripMigrationEffect />
      <Routes>
        {/* Full-bleed immersive routes -- no site chrome (see docs/travelfit-visual-fidelity-pass.md #1) */}
        <Route path="/questionnaire" element={<Questionnaire />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/oauth/consent" element={<OAuthConsent />} />
        <Route element={<TravelUpLayout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/results" element={<Results />} />
          <Route path="/trip" element={<TripDetail />} />
          <Route path="/about" element={<About />} />
          <Route path="/saved-trips" element={<SavedTrips />} />
          <Route path="/saved-trips/:savedTripId" element={<SavedTripDetail />} />
          <Route path="*" element={<PageNotFound />} />
        </Route>
      </Routes>
    </>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App