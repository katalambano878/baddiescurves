'use client';
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function SessionTimeoutWarning() {
  const [signedIn, setSignedIn] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const signingOut = useRef(false);

  const IDLE_TIMEOUT = 25 * 60 * 1000;
  const WARNING_TIME = 60 * 1000;

  // Only signed-in customers have a session to time out. Guests (including
  // guests in the middle of checkout) never see this and are never redirected.
  useEffect(() => {
    let cancelled = false;
    const apply = (hasSession: boolean) => {
      if (cancelled) return;
      setSignedIn(hasSession);
      setLastActivity(Date.now());
      setShowWarning(false);
      setCountdown(60);
    };

    supabase.auth.getSession().then(({ data }) => apply(Boolean(data.session)));
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') {
        apply(Boolean(session));
      }
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!signedIn) return;

    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart'];

    const resetTimer = () => {
      setLastActivity(Date.now());
      setShowWarning(false);
      setCountdown(60);
    };

    activityEvents.forEach(event => {
      window.addEventListener(event, resetTimer);
    });

    const checkInterval = setInterval(() => {
      const timeSinceActivity = Date.now() - lastActivity;
      
      if (timeSinceActivity >= IDLE_TIMEOUT) {
        handleLogout();
      } else if (timeSinceActivity >= IDLE_TIMEOUT - WARNING_TIME) {
        setShowWarning(true);
        const remaining = Math.ceil((IDLE_TIMEOUT - timeSinceActivity) / 1000);
        setCountdown(remaining);
      }
    }, 1000);

    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
      clearInterval(checkInterval);
    };
  }, [lastActivity, signedIn]);

  const handleLogout = async () => {
    if (signingOut.current) return;
    signingOut.current = true;
    // Really end the session: 'local' clears the saved tokens in this browser
    // even when the server cannot be reached.
    let cleared = false;
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      cleared = !error;
    } catch {
      cleared = false;
    }
    if (!cleared) {
      // Server unreachable: supabase-js keeps the session in that case, so
      // remove the saved tokens directly.
      try {
        Object.keys(localStorage)
          .filter((key) => key.startsWith('sb-') && key.endsWith('-auth-token'))
          .forEach((key) => localStorage.removeItem(key));
      } catch {
        // Storage blocked: nothing saved to clear.
      }
    }
    window.location.href = '/auth/login';
  };

  const handleStayLoggedIn = () => {
    setLastActivity(Date.now());
    setShowWarning(false);
    setCountdown(60);
  };

  if (!signedIn || !showWarning) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
            <i className="ri-time-line text-2xl text-orange-600"></i>
          </div>
          <div>
            <h3 className="font-bold text-lg">Session Timeout Warning</h3>
            <p className="text-sm text-gray-600">Your session is about to expire</p>
          </div>
        </div>

        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-gray-700 mb-2">
            You will be signed out in:
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-orange-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-500 transition-all duration-1000"
                style={{ width: `${(countdown / 60) * 100}%` }}
              />
            </div>
            <span className="text-2xl font-bold text-orange-600 tabular-nums">
              {countdown}s
            </span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleLogout}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium whitespace-nowrap"
          >
            Sign Out Now
          </button>
          <button
            onClick={handleStayLoggedIn}
            className="flex-1 px-4 py-2.5 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-medium whitespace-nowrap"
          >
            Stay Signed In
          </button>
        </div>

        <p className="text-xs text-gray-500 text-center mt-4">
          For your security, we sign you out after 25 minutes without activity
        </p>
      </div>
    </div>
  );
}
